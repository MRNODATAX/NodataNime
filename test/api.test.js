import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isAllowedStreamUrl,
  resolveRefererForHost,
  normalizeRangeForServerless,
} from "../src/routes/streamProxy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

describe("OBL-04..10: NodataNime REST API, Data Integrity, Community, PWA & Security", () => {
  let server;
  let baseUrl;
  let tempDataDir;

  before(async () => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nodatanime-test-"));
    process.env.DATA_DIR = tempDataDir;

    const { createApp } = await import("../src/app.js");
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
    if (tempDataDir && fs.existsSync(tempDataDir)) {
      fs.rmSync(tempDataDir, { recursive: true, force: true });
    }
  });

  it("serves GET /api/health and GET /api/rea/evidence", async () => {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.ok, true);
    assert.equal(health.data.app, "NodataNime");

    const reaRes = await fetch(`${baseUrl}/api/rea/evidence`);
    assert.equal(reaRes.status, 200);
    const rea = await reaRes.json();
    assert.equal(rea.ok, true);
    assert.ok(rea.data.obligationLedger.obligations.length >= 7);
  });

  it("serves GET /api/anime/home with banners, topAnime, latestReleases, full 7-day ongoing, and 28 genres", async () => {
    const res = await fetch(`${baseUrl}/api/anime/home`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.data.banners.length >= 4);
    assert.ok(body.data.latestReleases.length >= 8);
    assert.ok(body.data.ongoing.length >= 30);
    assert.equal(body.data.genres.length, 28);
  });

  it("serves catalog lists, A-Z index, genres, schedule, search, detail, and episode streams", async () => {
    const [ongoingRes, azRes, genreRes, schedRes, searchRes, detailRes, epRes] = await Promise.all([
      fetch(`${baseUrl}/api/anime/list?type=ongoing&page=1`),
      fetch(`${baseUrl}/api/anime/az?letter=I&page=1`),
      fetch(`${baseUrl}/api/anime/genre/isekai?page=1`),
      fetch(`${baseUrl}/api/anime/jadwal`),
      fetch(`${baseUrl}/api/anime/search?q=One+Piece`),
      fetch(`${baseUrl}/api/anime/detail/1piece-sub-indo`),
      fetch(`${baseUrl}/api/anime/episode?series=slime-s4-sub-indo&episode=al-153297-21`),
    ]);

    const ongoing = await ongoingRes.json();
    assert.ok(ongoing.data.items.length > 0);

    const az = await azRes.json();
    assert.equal(az.data.letter, "I");
    assert.ok(az.data.items.length >= 15);

    const genre = await genreRes.json();
    assert.equal(genre.data.genreId, "isekai");
    assert.ok(genre.data.items.length > 0);

    const sched = await schedRes.json();
    assert.equal(sched.data.days.length, 7);

    const search = await searchRes.json();
    assert.ok(search.data.items.some((x) => x.slug === "1piece-sub-indo"));

    const detail = await detailRes.json();
    assert.equal(detail.data.title, "One Piece");
    assert.ok(detail.data.episodes.length >= 10);

    const ep = await epRes.json();
    assert.ok(ep.data.streams.length >= 3);
    assert.ok(ep.data.defaultStreamUrl.startsWith("https://"));
  });

  it("guarantees strict category purity, schedule episode count parity, and zero cross-anime stream leakage", async () => {
    const [ongoingRes, completedRes, movieRes, schedRes] = await Promise.all([
      fetch(`${baseUrl}/api/anime/list?type=ongoing&page=1`),
      fetch(`${baseUrl}/api/anime/list?type=completed&page=1`),
      fetch(`${baseUrl}/api/anime/list?type=movie&page=1`),
      fetch(`${baseUrl}/api/anime/jadwal`),
    ]);

    const ongoingItems = (await ongoingRes.json()).data.items;
    const completedItems = (await completedRes.json()).data.items;
    const movieItems = (await movieRes.json()).data.items;

    assert.ok(ongoingItems.every((i) => i.status === "Ongoing"));
    assert.ok(completedItems.every((i) => i.status === "Completed"));
    assert.ok(movieItems.every((i) => i.status === "Movie"));

    // Pastikan setiap item jadwal memiliki jumlah episode detail yang persis sama dengan badge jadwal (mis. Ep 4 -> 4 episode, bukan 12)
    const schedDays = (await schedRes.json()).data.days;
    const tougenCard = schedDays.flatMap((d) => d.animeList).find((a) => a.slug === "tougen-anki-s2");
    assert.ok(tougenCard);
    assert.equal(tougenCard.episode, "Ep 4");

    const tougenDetail = (await (await fetch(`${baseUrl}/api/anime/detail/tougen-anki-s2`)).json()).data;
    assert.equal(tougenDetail.episodes.length, 4);
    assert.equal(tougenDetail.episodes[0].number, 4);

    // Pastikan membuka episode yang belum punya mirror TIDAK PERNAH memutar video anime lain (mis. Slime S4) atau episode lain
    const tougenEp = (
      await (await fetch(`${baseUrl}/api/anime/episode?series=tougen-anki-s2&ep=4`)).json()
    ).data;
    assert.equal(tougenEp.seriesSlug, "tougen-anki-s2");
    assert.equal(tougenEp.streams.length, 0);

    const frierenEp12 = (
      await (await fetch(`${baseUrl}/api/anime/episode?series=sousou-no-frieren-sub-indo&ep=12`)).json()
    ).data;
    assert.equal(frierenEp12.seriesSlug, "sousou-no-frieren-sub-indo");
    assert.equal(frierenEp12.streams.length, 0);

    const frierenEp28 = (
      await (await fetch(`${baseUrl}/api/anime/episode?series=sousou-no-frieren-sub-indo&ep=28`)).json()
    ).data;
    assert.ok(frierenEp28.defaultStreamUrl.includes("Sousou.no.Frieren.E28"));
  });

  it("supports interactive 2-tab Community Chat & Info API with rate-limiting", async () => {
    const initRes = await fetch(`${baseUrl}/api/community`);
    assert.equal(initRes.status, 200);
    const initBody = await initRes.json();
    assert.ok(Array.isArray(initBody.data.messages));
    assert.ok(initBody.data.info.length >= 2);

    const postRes = await fetch(`${baseUrl}/api/community/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: "NakamaTester",
        message: "Halo komunitas NodataNime! Jadwal sekarang sudah akurat banget.",
        replyTo: { nickname: "Admin YLnime", message: "Update episode terbaru..." },
      }),
    });
    assert.equal(postRes.status, 201);
    const posted = await postRes.json();
    assert.equal(posted.data.nickname, "NakamaTester");
    assert.equal(posted.data.isAdmin, false);

    // Rate-limit pengiriman beruntun dari IP yang sama
    const spamRes = await fetch(`${baseUrl}/api/community/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "NakamaTester", message: "Spam cepat" }),
    });
    assert.equal(spamRes.status, 429);
  });

  it("serves PWA manifest, service worker, icons, opening splash, and 100% SVG navbar without stickers", async () => {
    const [manifestRes, swRes, offlineRes, iconRes, htmlRes] = await Promise.all([
      fetch(`${baseUrl}/manifest.webmanifest`),
      fetch(`${baseUrl}/sw.js`),
      fetch(`${baseUrl}/offline.html`),
      fetch(`${baseUrl}/assets/icon-192.png`),
      fetch(`${baseUrl}/`),
    ]);

    assert.equal(manifestRes.status, 200);
    assert.match(manifestRes.headers.get("content-type") || "", /manifest\+json/);
    const manifest = await manifestRes.json();
    assert.equal(manifest.short_name, "NodataNime");
    assert.ok(manifest.icons.length >= 3);

    assert.equal(swRes.status, 200);
    assert.equal(swRes.headers.get("service-worker-allowed"), "/");
    assert.equal(offlineRes.status, 200);
    assert.equal(iconRes.status, 200);

    assert.equal(htmlRes.status, 200);
    assert.equal(htmlRes.headers.get("x-frame-options"), null);
    const html = await htmlRes.text();
    assert.match(html, /id="introSplash"/);
    assert.match(html, /Nodata<span>Nime<\/span>/);
    assert.match(html, /id="starfieldCanvas"/);
    assert.match(html, /id="bottomNavBar"/);
    assert.match(html, /id="bottomMoreSheet"/);
    assert.doesNotMatch(html, /nd-sheet-emoji/);
    assert.doesNotMatch(html, /[🎬⚡🔥]/u);

    const clientJs = fs.readFileSync(path.join(rootDir, "public/js/app.js"), "utf8");
    assert.match(clientJs, /function dismissIntroSplash\(\)/);
    assert.match(clientJs, /function initStarfield\(\)/);
    assert.match(clientJs, /function initPwa\(\)/);
    assert.doesNotMatch(clientJs, /localhost|127\.0\.0\.1/i);
    assert.doesNotMatch(html, /localhost|127\.0\.0\.1/i);
  });

  it("enforces SSRF domain allowlist and host-aware Referer on stream-proxy", async () => {
    assert.equal(isAllowedStreamUrl("https://s3.animeverse.id/ro/test.mp4"), true);
    assert.equal(isAllowedStreamUrl("https://sjkt.animekita.org/Dgn63529.mp4"), true);
    assert.equal(isAllowedStreamUrl("http://127.0.0.1:3000/secret"), false);
    assert.equal(isAllowedStreamUrl("https://evil.example.com/video.mp4"), false);

    assert.equal(resolveRefererForHost("https://s3.animeverse.id/ro/x.mp4"), "https://animeverse.id/");
    assert.equal(resolveRefererForHost("https://cdn.animeku.org/v.mp4"), "https://animeku.org/");
    assert.equal(resolveRefererForHost("https://sjkt.animekita.org/v.mp4"), "https://ylnime.com/");

    const blockedRes = await fetch(
      `${baseUrl}/api/anime/stream-proxy?url=${encodeURIComponent("http://169.254.169.254/latest/meta-data")}`
    );
    assert.equal(blockedRes.status, 403);
  });

  it("validates Vercel Express Serverless entrypoint, vercel.json contract, 3.5MB Range clamping, and stateless cold-start Admin tokens", async () => {
    const vercelCfg = JSON.parse(fs.readFileSync(path.join(rootDir, "vercel.json"), "utf8"));
    assert.equal(vercelCfg.framework, "express");
    assert.equal(vercelCfg.outputDirectory, undefined);
    assert.match(vercelCfg.functions["src/app.js"].includeFiles, /data\/\*\*/);

    const { default: vercelExpressApp, normalizeVercelRequestUrl } = await import("../src/app.js");
    assert.equal(typeof vercelExpressApp, "function");
    assert.equal(
      normalizeVercelRequestUrl("/api?__vpath=anime/list&type=ongoing&page=2"),
      "/api/anime/list?type=ongoing&page=2"
    );
    assert.equal(
      normalizeVercelRequestUrl("/api/anime/home"),
      "/api/anime/home"
    );

    // Verifikasi pembatas ukuran chunk Range agar aman di bawah limit 4.5 MB Vercel Serverless
    assert.equal(normalizeRangeForServerless("bytes=0-", false), "bytes=0-");
    assert.equal(normalizeRangeForServerless("bytes=0-", true), "bytes=0-3670015");
    assert.equal(normalizeRangeForServerless("", true), "bytes=0-3670015");
    assert.equal(normalizeRangeForServerless("bytes=100-500", true), "bytes=100-500");

    // Verifikasi token Admin stateless tetap valid pada instance AdminStore baru (simulasi cold-start Vercel)
    const { AdminStore } = await import("../src/services/adminStore.js");
    const instanceA = new AdminStore();
    const instanceB = new AdminStore();
    const { token } = instanceA.authenticate("admin", process.env.ADMIN_PASSWORD || "nodata2026", "1.1.1.1");
    assert.ok(token.startsWith("nd1."));
    const verifiedOnColdInstance = instanceB.verifyToken(token);
    assert.equal(verifiedOnColdInstance?.username, "admin");

    instanceB.revokeToken(token);
    assert.equal(instanceB.verifyToken(token), null);
  });

  it("authenticates Studio Admin, manages catalog/stream/community overrides & broken reports", async () => {
    const adminHtmlRes = await fetch(`${baseUrl}/admin`);
    assert.equal(adminHtmlRes.status, 200);

    const unauthRes = await fetch(`${baseUrl}/api/admin/dashboard`);
    assert.equal(unauthRes.status, 401);

    const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: process.env.ADMIN_PASSWORD || "nodata2026" }),
    });
    assert.equal(loginRes.status, 200);
    const loginBody = await loginRes.json();
    const token = loginBody.data.token;
    assert.ok(token.length >= 32);

    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    const customRes = await fetch(`${baseUrl}/api/admin/catalog`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        slug: "yozora-test-special",
        title: "Yozora Test Special",
        score: "9.5",
        status: "Ongoing",
        pinnedHero: true,
      }),
    });
    assert.equal(customRes.status, 200);

    const mirrorRes = await fetch(`${baseUrl}/api/admin/streams`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        seriesSlug: "yozora-test-special",
        episodeId: "yozora-ep-1",
        provider: "Yozora Test R2",
        resolution: "1080p",
        url: "https://s3.animeverse.id/ro/33a8-1790534734773.mp4",
      }),
    });
    assert.equal(mirrorRes.status, 200);

    // Kirim pesan resmi Admin ke komunitas
    const admMsgRes = await fetch(`${baseUrl}/api/admin/community/messages`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        nickname: "Admin Studio",
        message: "Server mirror 1080p siap ditonton!",
      }),
    });
    assert.equal(admMsgRes.status, 201);
    const admMsg = await admMsgRes.json();
    assert.equal(admMsg.data.isAdmin, true);

    const homeAfter = await (await fetch(`${baseUrl}/api/anime/home`)).json();
    assert.equal(homeAfter.data.banners[0].slug, "yozora-test-special");

    const epAfter = await (
      await fetch(`${baseUrl}/api/anime/episode?series=yozora-test-special&episode=yozora-ep-1`)
    ).json();
    assert.equal(epAfter.data.streams[0].provider, "Yozora Test R2");

    const repRes = await fetch(`${baseUrl}/api/anime/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seriesSlug: "yozora-test-special",
        episodeId: "yozora-ep-1",
        animeTitle: "Yozora Test Special",
        reason: "Unit test report",
      }),
    });
    assert.equal(repRes.status, 201);
  });
});
