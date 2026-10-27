import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createApp } from "../src/app.js";
import {
  isAllowedStreamUrl,
  isSafeMediaContentType,
  fetchWithSafeRedirects,
} from "../src/routes/streamProxy.js";
import {
  sanitizeHttpUrl,
  resolvePosterUrl,
  normalizeEpisodeStreams,
} from "../src/parsers/ylnimeParser.js";
import { CommunityStore } from "../src/services/communityStore.js";
import { TtlCache } from "../src/utils/cache.js";
import {
  PINNED_QRIS_CONFIG,
  computeCrc16CcittFalse,
  verifyPinnedQrisPayload,
  sha256Hex,
} from "../src/utils/qrisSecurity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

describe("Cloudflare Security Audit Skill — Multi-Layer Hardening Suite (Layers 1..7)", () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("Layer 1 (SSRF & Media Proxy): blocks 302 open redirects to internal/metadata hosts and enforces media MIME allowlist", async () => {
    // Validasi unit URL allowlist ketat (port, kredensial, IPv6, CGNAT, hex IP)
    assert.equal(isAllowedStreamUrl("https://s3.animeverse.id/ep1.mp4"), true);
    assert.equal(isAllowedStreamUrl("https://user:pass@s3.animeverse.id/ep1.mp4"), false);
    assert.equal(isAllowedStreamUrl("https://s3.animeverse.id:8080/ep1.mp4"), false);
    assert.equal(isAllowedStreamUrl("http://[::1]/ep1.mp4"), false);
    assert.equal(isAllowedStreamUrl("http://100.64.0.1/ep1.mp4"), false);
    assert.equal(isAllowedStreamUrl("http://0x7f000001/ep1.mp4"), false);
    assert.equal(isAllowedStreamUrl("http://169.254.169.254/latest/meta-data/"), false);

    // Simulasi 302 redirect jahat dari host allowlist ke metadata cloud internal -> wajib diblokir 403
    const maliciousRedirectFetch = async (url) => {
      if (url.includes("pixeldrain.com")) {
        return new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/iam/" },
        });
      }
      throw new Error("Tidak boleh mencapai target metadata internal!");
    };

    await assert.rejects(
      () =>
        fetchWithSafeRedirects("https://pixeldrain.com/api/file/xyz", {
          fetchImpl: maliciousRedirectFetch,
        }),
      (err) => err.statusCode === 403 && err.code === "SSRF_REDIRECT_BLOCKED"
    );

    // Simulasi 302 redirect aman antar-CDN video allowlist -> diizinkan
    const hopLog = [];
    const safeRedirectFetch = async (url, opts) => {
      hopLog.push({ url, referer: opts.headers.Referer, redirect: opts.redirect });
      if (url.includes("sjkt.animekita.org")) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://s3.animeverse.id/cdn/bleach-01.mp4" },
        });
      }
      return new Response("MP4DATA", {
        status: 206,
        headers: { "content-type": "video/mp4" },
      });
    };

    const safeUpstream = await fetchWithSafeRedirects("https://sjkt.animekita.org/v/bleach.mp4", {
      fetchImpl: safeRedirectFetch,
    });
    assert.equal(safeUpstream.status, 206);
    assert.equal(hopLog.length, 2);
    assert.equal(hopLog[0].redirect, "manual");
    assert.equal(hopLog[1].referer, "https://animeverse.id/");

    // Validasi allowlist Content-Type untuk mencegah same-origin XSS via HTML/SVG di stream-proxy
    assert.equal(isSafeMediaContentType("video/mp4"), true);
    assert.equal(isSafeMediaContentType("video/webm; codecs=vp9"), true);
    assert.equal(isSafeMediaContentType("application/octet-stream"), true);
    assert.equal(isSafeMediaContentType("application/vnd.apple.mpegurl"), true);
    assert.equal(isSafeMediaContentType("text/html; charset=utf-8"), false);
    assert.equal(isSafeMediaContentType("image/svg+xml"), false);
    assert.equal(isSafeMediaContentType("application/javascript"), false);
  });

  it("Layer 2 (XSS & Untrusted Scheme Sanitization): strips javascript:/data: URLs in parser & enforces iframe sandbox + zero inline JS", () => {
    assert.equal(sanitizeHttpUrl("javascript:alert(document.domain)"), "");
    assert.equal(sanitizeHttpUrl("data:text/html,<script>alert(1)</script>"), "");
    assert.equal(sanitizeHttpUrl("vbscript:msgbox(1)"), "");
    assert.equal(sanitizeHttpUrl("file:///etc/passwd"), "");
    assert.equal(sanitizeHttpUrl("https://s3.animeverse.id/video.mp4"), "https://s3.animeverse.id/video.mp4");

    assert.equal(resolvePosterUrl("javascript:alert(1)"), "/assets/no-cover.svg");
    assert.equal(resolvePosterUrl("data:image/svg+xml,<svg onload=alert(1)>"), "/assets/no-cover.svg");

    const normalized = normalizeEpisodeStreams({
      inlineStreams: [
        { reso: "720p", link: "javascript:alert(1)", provide: "evil" },
        { reso: "1080p", link: "data:text/html,<script>alert(1)</script>", provide: "evil2" },
        { reso: "720p", link: "https://s3.animeverse.id/ok.mp4", provide: "11" },
      ],
    });
    assert.equal(normalized.streams.length, 1);
    assert.equal(normalized.streams[0].url, "https://s3.animeverse.id/ok.mp4");
    assert.equal(normalized.downloadLinks.length, 1);

    const appJs = fs.readFileSync(path.join(rootDir, "public/js/app.js"), "utf8");
    const indexHtml = fs.readFileSync(path.join(rootDir, "views/index.html"), "utf8");
    const offlineHtml = fs.readFileSync(path.join(rootDir, "public/offline.html"), "utf8");

    assert.ok(
      appJs.includes('sandbox="allow-scripts allow-same-origin allow-presentation"'),
      "Embed iframe wajib memiliki atribut sandbox"
    );
    assert.ok(appJs.includes("function safeUrl("), "Client wajib memvalidasi skema URL dengan safeUrl()");
    assert.equal(appJs.includes("/api/config/public"), false, "Dead call /api/config/public harus dihapus");
    assert.equal(/on(error|click|load)\s*=/i.test(appJs), false, "Tidak boleh ada inline event handler di app.js");
    assert.equal(/on(error|click|load)\s*=/i.test(indexHtml), false, "Tidak boleh ada inline event handler di index.html");
    assert.equal(/on(error|click|load)\s*=/i.test(offlineHtml), false, "Tidak boleh ada inline event handler di offline.html");
  });

  it("Layer 3 (Community Anti-Spoofing, Anti-Impersonation, CSRF & Rate-Map Cap): blocks XFF bypass, reserved nicknames, and cross-site POSTs", async () => {
    // 1. Blokir penyamaran nama resmi sistem/admin
    for (const reserved of ["NodataNime Bot", "Admin", "Moderator", "Official", "System"]) {
      const res = await fetch(`${baseUrl}/api/community/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: reserved, message: "Halo semua!" }),
      });
      assert.equal(res.status, 400, `Nickname '${reserved}' wajib ditolak`);
    }

    // 2. Blokir permintaan lintas situs (CSRF via Origin asing & Sec-Fetch-Site: cross-site)
    const crossOriginPost = await fetch(`${baseUrl}/api/community/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil-attacker.example",
      },
      body: JSON.stringify({ nickname: "PenontonAsli", message: "Tes lintas situs" }),
    });
    assert.equal(crossOriginPost.status, 403);

    const crossSiteFetch = await fetch(`${baseUrl}/api/community/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Sec-Fetch-Site": "cross-site",
      },
      body: JSON.stringify({ nickname: "PenontonAsli", message: "Tes sec-fetch-site" }),
    });
    assert.equal(crossSiteFetch.status, 403);

    // 3. Blokir form-urlencoded CSRF (tanpa Content-Type: application/json)
    const formPost = await fetch(`${baseUrl}/api/community/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "nickname=Tester&message=Halo",
    });
    assert.equal(formPost.status, 415);

    // 4. Pastikan X-Forwarded-For palsu TIDAK dapat mem-bypass rate limit pada mode Node langsung
    const firstMsg = await fetch(`${baseUrl}/api/community/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "203.0.113.10",
      },
      body: JSON.stringify({ nickname: "WibuValid", message: "Pesan pertama valid" }),
    });
    assert.equal(firstMsg.status, 201);

    const spoofedSecondMsg = await fetch(`${baseUrl}/api/community/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "198.51.100.99",
      },
      body: JSON.stringify({ nickname: "WibuValid", message: "Bypass XFF gagal!" }),
    });
    assert.equal(spoofedSecondMsg.status, 429, "Rotasi X-Forwarded-For wajib tetap tertahan cooldown 429");

    // 5. Pastikan ukuran _chatRateMap terbatasi <= 2000 entri
    const isolatedStore = new CommunityStore();
    for (let i = 0; i < 2350; i += 1) {
      isolatedStore._chatRateMap.set(`ip-${i}`, {
        windowStart: Date.now(),
        count: 1,
        lastPostAt: Date.now() - 10_000,
      });
    }
    isolatedStore._pruneRateMap(Date.now());
    assert.ok(isolatedStore._chatRateMap.size <= 2000);
  });

  it("Layer 4 (Input Validation & Pinned Cache Protection): rejects invalid/oversized query params and protects core catalog cache keys", async () => {
    const badRequests = [
      "/api/anime/list?type=hacked_category",
      "/api/anime/list?type[]=ongoing&type[]=movie",
      "/api/anime/list?type=ongoing&page=999999",
      "/api/anime/list?type=ongoing&page=-5",
      "/api/anime/list?type=ongoing&page=abc",
      "/api/anime/az?letter=XYZ",
      `/api/anime/search?q=${"a".repeat(125)}`,
      "/api/anime/genre/..%2F..%2Fetc",
      "/api/anime/detail/..%2F..%2Fpasswd",
      "/api/anime/episode?series=..%2Fevil&episode=ep-1",
      "/api/anime/episode?series=1piece-sub-indo&ep=notanumber",
    ];

    for (const target of badRequests) {
      const res = await fetch(`${baseUrl}${target}`);
      assert.equal(res.status, 400, `Path ${target} wajib ditolak dengan HTTP 400`);
    }

    // Verifikasi TtlCache menjaga pinned keys (home:v3, genres:all, schedule:weekly) saat terjadi cache churn
    const cache = new TtlCache(60_000, 10, 5);
    cache.set("home:v3", { ok: true });
    cache.set("genres:all", { ok: true });
    cache.set("schedule:weekly", { ok: true });

    for (let i = 0; i < 40; i += 1) {
      cache.set(`search:random-query-${i}`, { i });
    }
    assert.equal(cache.store.size, 10);
    assert.deepEqual(cache.get("home:v3"), { ok: true });
    assert.deepEqual(cache.get("genres:all"), { ok: true });
    assert.deepEqual(cache.get("schedule:weekly"), { ok: true });
  });

  it("Layer 5..7 (CSP, Permissions-Policy, Method-Scoped CORS, PWA SW & Vercel Config): enforces defense-in-depth headers without breaking Live Preview", async () => {
    const htmlRes = await fetch(`${baseUrl}/`);
    assert.equal(htmlRes.status, 200);
    const csp = htmlRes.headers.get("content-security-policy") || "";
    assert.ok(csp.includes("script-src 'self'"), "CSP wajib menetapkan script-src 'self'");
    assert.ok(csp.includes("object-src 'none'"), "CSP wajib memblokir object-src");
    assert.ok(
      csp.includes("frame-ancestors 'self' https://*.e2b.app https://*.arena.ai https://arena.ai"),
      "CSP wajib mengizinkan frame-ancestors Live Preview Arena"
    );
    assert.equal(htmlRes.headers.get("x-content-type-options"), "nosniff");
    assert.equal(htmlRes.headers.get("referrer-policy"), "no-referrer");
    assert.ok((htmlRes.headers.get("permissions-policy") || "").includes("camera=()"));

    // GET baca publik mengizinkan CORS, tetapi POST tulis TIDAK memantulkan Access-Control-Allow-Origin
    const corsGet = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "https://reader-client.example" },
    });
    assert.equal(corsGet.headers.get("access-control-allow-origin"), "https://reader-client.example");

    const corsPost = await fetch(`${baseUrl}/api/community/messages`, {
      method: "POST",
      headers: {
        Origin: "https://evil-client.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ nickname: "Tester", message: "Halo" }),
    });
    assert.equal(corsPost.headers.get("access-control-allow-origin"), null);

    // Verifikasi Service Worker & vercel.json
    const swCode = fs.readFileSync(path.join(rootDir, "public/sw.js"), "utf8");
    assert.ok(swCode.includes("isAllowedStaticAssetPath"));
    assert.ok(swCode.includes("nodatanime-pwa-v6.5"));
    assert.ok(swCode.includes('/api/support/'));

    const vercelCfg = JSON.parse(fs.readFileSync(path.join(rootDir, "vercel.json"), "utf8"));
    assert.equal(vercelCfg.framework, "express");
    assert.equal(vercelCfg.outputDirectory, null);
    assert.equal(vercelCfg.rewrites, undefined);
  });

  it("Layer 8 (Anti-Quishing & Anti-QR-Swapping): locks QRIS to NODATASHOP (ID1025451509315) via SHA-256 + EMVCo CRC-16 and blocks rogue QR injection", async () => {
    // 1. Blokir serangan Quishing (QR berisi URL phishing / javascript)
    for (const quishPayload of [
      "https://fake-banking-login.example/qris",
      "http://evil.example/steal-pin",
      "javascript:alert(document.domain)",
      "000201https://evil.example6304ABCD",
    ]) {
      assert.throws(
        () => verifyPinnedQrisPayload(quishPayload),
        (err) =>
          err.code === "QUISHING_OR_INVALID_FORMAT" ||
          err.code === "QRIS_INTEGRITY_VIOLATION"
      );
    }

    // 2. Blokir serangan QR-Swapping: penyerang membuat QRIS EMVCo valid ber-CRC16 sah tetapi mengganti nama merchant / NMID ke rekening miliknya sendiri
    const swappedMerchantBody = PINNED_QRIS_CONFIG.staticPayload
      .slice(0, -4)
      .replace("5910NODATASHOP", "5910HACKERSHOP");
    const swappedMerchantQris = `${swappedMerchantBody}${computeCrc16CcittFalse(swappedMerchantBody)}`;
    assert.throws(
      () => verifyPinnedQrisPayload(swappedMerchantQris),
      (err) => err.code === "QRIS_MERCHANT_TAMPERED" && err.statusCode === 403
    );

    const swappedNmidBody = PINNED_QRIS_CONFIG.staticPayload
      .slice(0, -4)
      .replace("ID1025451509315", "ID1025999999999");
    const swappedNmidQris = `${swappedNmidBody}${computeCrc16CcittFalse(swappedNmidBody)}`;
    assert.throws(
      () => verifyPinnedQrisPayload(swappedNmidQris),
      (err) => err.code === "QRIS_MERCHANT_TAMPERED" && err.statusCode === 403
    );

    // 3. Blokir manipulasi nominal tanpa checksum CRC-16 valid
    const badCrcQris = `${PINNED_QRIS_CONFIG.staticPayload.slice(0, -4)}FFFF`;
    assert.throws(
      () => verifyPinnedQrisPayload(badCrcQris),
      (err) => err.code === "QRIS_CRC_MISMATCH"
    );

    // 4. Blokir segala percobaan injeksi parameter QR/merchant/URL pada endpoint GET /api/support/qris
    const injectionProbes = [
      "/api/support/qris?qris=000201010211...",
      "/api/support/qris?payload=https://evil.example",
      "/api/support/qris?url=https://evil.example/qr.png",
      "/api/support/qris?merchant=HACKERSHOP",
      "/api/support/qris?nmid=ID1025999999999",
      "/api/support/qris?svg=<svg><script>alert(1)</script></svg>",
      "/api/support/qris?unknownParam=1",
      "/api/support/qris?amount=-10000",
      "/api/support/qris?amount=500",
      "/api/support/qris?amount=50000000",
      "/api/support/qris?amount=10000.5",
      "/api/support/qris?amount[]=5000&amount[]=10000",
    ];
    for (const probe of injectionProbes) {
      const res = await fetch(`${baseUrl}${probe}`);
      assert.equal(res.status, 400, `Probe injeksi ${probe} wajib ditolak dengan HTTP 400`);
    }

    // 5. Verifikasi QRIS Dinamis resmi (Rp10.000) terisolasi same-origin, no-store, dan terkunci ke NODATASHOP
    const qrisRes = await fetch(`${baseUrl}/api/support/qris?amount=10000`, {
      headers: { Origin: "https://foreign-attacker.example" },
    });
    assert.equal(qrisRes.status, 200);
    assert.equal(qrisRes.headers.get("access-control-allow-origin"), null, "Endpoint /api/support/qris tidak boleh membocorkan CORS lintas-origin");
    assert.equal(qrisRes.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.ok((qrisRes.headers.get("cache-control") || "").includes("no-store"));
    assert.equal(qrisRes.headers.get("x-qris-merchant"), "NODATASHOP");
    assert.equal(qrisRes.headers.get("x-qris-nmid"), "ID1025451509315");

    const qrisJson = await qrisRes.json();
    assert.equal(qrisJson.ok, true);
    assert.equal(qrisJson.data.merchantName, "NODATASHOP");
    assert.equal(qrisJson.data.nmid, "ID1025451509315");
    assert.equal(qrisJson.data.amount, 10000);
    assert.ok(qrisJson.data.payload.includes("540510000"));
    assert.ok(qrisJson.data.svg.startsWith("<svg"));
    assert.equal(/<script|on[a-z]+\s*=/i.test(qrisJson.data.svg), false);

    // 6. Verifikasi poster QRIS asli memiliki hash SHA-256 utuh dan header CORP same-origin
    const posterRes = await fetch(`${baseUrl}/assets/qris-nodatashop.jpg`);
    assert.equal(posterRes.status, 200);
    assert.equal(posterRes.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.equal(
      posterRes.headers.get("x-qris-poster-sha256"),
      PINNED_QRIS_CONFIG.posterFileSha256
    );
    const posterBuf = Buffer.from(await posterRes.arrayBuffer());
    assert.equal(sha256Hex(posterBuf), PINNED_QRIS_CONFIG.posterFileSha256);

    // 7. Verifikasi UI copy & penangkalan inline script tetap bersih
    const indexHtml = fs.readFileSync(path.join(rootDir, "views/index.html"), "utf8");
    const appJs = fs.readFileSync(path.join(rootDir, "public/js/app.js"), "utf8");
    assert.ok(appJs.includes("Nonton lancar tanpa iklan pop-up? Kasih penyemangat buat Admin yuk!"));
    assert.ok(appJs.includes("Traktir Kopi (QRIS)"));
    assert.ok(appJs.includes("verifyClientEmvcoQris"));
    assert.ok(indexHtml.includes("ID1025451509315"));
  });

  it("Layer 9 (Pinned Admin Contact & Anti-Tabnabbing): locks Hubungi Admin strictly to https://telegram.me/nodata_store with rel='noopener noreferrer'", async () => {
    const indexHtml = fs.readFileSync(path.join(rootDir, "views/index.html"), "utf8");
    const appJs = fs.readFileSync(path.join(rootDir, "public/js/app.js"), "utf8");

    // 1. Seluruh tautan Telegram pada shell HTML wajib mengarah ke https://telegram.me/nodata_store dan memiliki rel="noopener noreferrer"
    const tgLinks = [...indexHtml.matchAll(/<a\b[^>]*href="([^"]*telegram\.me[^"]*)"[^>]*>/gi)];
    assert.ok(tgLinks.length >= 2, "Modal Hubungi Admin wajib memiliki tautan Telegram resmi");
    for (const match of tgLinks) {
      assert.equal(match[1], "https://telegram.me/nodata_store");
      assert.match(match[0], /target="_blank"/i);
      assert.match(match[0], /rel="noopener noreferrer"/i);
    }

    // 2. Client JS wajib membekukan konfigurasi PINNED_ADMIN_CONTACT dan memvalidasi origin/pathname Telegram
    assert.match(appJs, /PINNED_ADMIN_CONTACT\s*=\s*Object\.freeze\(/);
    assert.match(appJs, /telegramBaseUrl:\s*"https:\/\/telegram\.me\/nodata_store"/);
    assert.match(appJs, /function buildVerifiedAdminTelegramUrl\(/);
    assert.equal(/on(error|click|load)\s*=/i.test(appJs), false);
    assert.equal(/on(error|click|load)\s*=/i.test(indexHtml), false);
  });
});
