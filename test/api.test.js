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

    const stylesCss = fs.readFileSync(path.join(rootDir, "public/css/styles.css"), "utf8");
    assert.doesNotMatch(stylesCss, /grid-template-columns:\s*1fr\s*;/);
    assert.match(stylesCss, /\.nd-intro-ring-svg/);
    assert.match(stylesCss, /height:\s*100dvh/);
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

  it("validates Vercel Express Serverless entrypoint, zero-collision views/index.html shell, and 3.5MB Range clamping", async () => {
    const vercelCfg = JSON.parse(fs.readFileSync(path.join(rootDir, "vercel.json"), "utf8"));
    assert.equal(vercelCfg.framework, "express");
    assert.equal(vercelCfg.outputDirectory, null);
    assert.equal(vercelCfg.rewrites, undefined);
    assert.match(vercelCfg.functions["src/app.js"].includeFiles, /views\/\*\*/);
    assert.match(vercelCfg.functions["public/app.js"].includeFiles, /views\/\*\*/);
    assert.equal(fs.existsSync(path.join(rootDir, "public/index.html")), false);
    assert.equal(fs.existsSync(path.join(rootDir, "views/index.html")), true);

    const { default: vercelExpressApp, normalizeVercelRequestUrl } = await import("../src/app.js");
    const { default: vercelPublicFallbackApp } = await import("../public/app.js");
    assert.equal(typeof vercelExpressApp, "function");
    assert.equal(vercelPublicFallbackApp, vercelExpressApp);
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
  });

  it("ensures Admin Panel & /api/admin/* are completely removed and SPA routes resolve cleanly", async () => {
    const [ongoingSpaRes, jadwalSpaRes, watchlistSpaRes, removedAdminApiRes] = await Promise.all([
      fetch(`${baseUrl}/ongoing`),
      fetch(`${baseUrl}/jadwal`),
      fetch(`${baseUrl}/watchlist`),
      fetch(`${baseUrl}/api/admin/dashboard`),
    ]);

    assert.equal(ongoingSpaRes.status, 200);
    assert.equal(jadwalSpaRes.status, 200);
    assert.equal(watchlistSpaRes.status, 200);
    assert.equal(removedAdminApiRes.status, 404);

    const html = await ongoingSpaRes.text();
    assert.doesNotMatch(html, /Admin Panel/i);
    assert.doesNotMatch(html, /studioNoticeBar/);
  });

  it("prevents search UI clipping, ranks title matches first, and enforces CSP-safe poster fallback", async () => {
    // 1. Relevansi pencarian: judul berawalan "Isekai" wajib berada di urutan teratas dibanding kecocokan genre semata
    const isekaiRes = await fetch(`${baseUrl}/api/anime/search?q=isekai`);
    assert.equal(isekaiRes.status, 200);
    const isekaiBody = await isekaiRes.json();
    assert.ok(isekaiBody.data.items.length >= 10);
    assert.match(isekaiBody.data.items[0].title, /^Isekai/i);

    // 2. Pastikan snapshot tidak menyimpan URL poster AniList sintetis yang pasti 404
    const snapJson = fs.readFileSync(path.join(rootDir, "data/ylnime-snapshot.json"), "utf8");
    assert.doesNotMatch(snapJson, /bx1735-k4pM7nR2wQ9L|bx178025-cWJ2qN2hD2hF/);

    // 3. Verifikasi struktur anti-terpotong pada HTML, CSS, dan JS pencarian
    const indexHtml = fs.readFileSync(path.join(rootDir, "views/index.html"), "utf8");
    const stylesCss = fs.readFileSync(path.join(rootDir, "public/css/styles.css"), "utf8");
    const clientJs = fs.readFileSync(path.join(rootDir, "public/js/app.js"), "utf8");

    assert.match(indexHtml, /class="nd-search-field"/);
    assert.match(indexHtml, /id="navSearchClearBtn"/);
    assert.match(stylesCss, /\.nd-search-dropdown-list\s*\{[\s\S]*?overflow-y:\s*auto/);
    assert.match(stylesCss, /var\(--nd-vvh,\s*100dvh\)/);
    assert.match(stylesCss, /\.nd-topbar-inner\.is-search-active\s+\.nd-search-wrap/);
    assert.match(stylesCss, /font-size:\s*16px/);
    assert.match(clientJs, /function applySafePosterFallback\(/);
    assert.match(clientJs, /function closeSearchDropdown\(/);
    assert.match(clientJs, /new AbortController\(\)/);
  });

  it("integrates Hubungi Admin (https://telegram.me/nodata_store) across More menu, Watch page, Detail, Search, Footer, and Community Info", async () => {
    const indexHtml = fs.readFileSync(path.join(rootDir, "views/index.html"), "utf8");
    const stylesCss = fs.readFileSync(path.join(rootDir, "public/css/styles.css"), "utf8");
    const clientJs = fs.readFileSync(path.join(rootDir, "public/js/app.js"), "utf8");

    // 1. Menu Lainnya (#bottomMoreSheet), Panel Komunitas (#notifPanel), Footer, dan Modal #adminContactModal
    assert.match(indexHtml, /id="sheetContactAdminBtn"/);
    assert.match(indexHtml, /id="adminContactBackdrop"/);
    assert.match(indexHtml, /id="adminContactModal"/);
    assert.match(indexHtml, /https:\/\/telegram\.me\/nodata_store/);
    assert.match(indexHtml, /@nodata_store/);

    // 2. Titik akses kontekstual di Halaman Tonton, Detail Anime, Pencarian Kosong, & Error Boundary
    assert.match(clientJs, /id="watchReportIssueBtn"/);
    assert.match(clientJs, /renderContactAdminBanner\("stream"\)/);
    assert.match(clientJs, /renderContactAdminBanner\("general"\)/);
    assert.match(clientJs, /data-open-admin-contact="anime"/);
    assert.match(clientJs, /data-open-admin-contact="bug"/);
    assert.match(clientJs, /function initAdminContactModal\(\)/);

    // 3. CSS bebas dari bare grid-template-columns: 1fr; yang berisiko memotong kolom mobile
    assert.doesNotMatch(stylesCss, /grid-template-columns:\s*1fr\s*;/);

    // 4. Info Komunitas menyertakan pengumuman resmi Hubungi Admin (@nodata_store)
    const commRes = await fetch(`${baseUrl}/api/community`);
    assert.equal(commRes.status, 200);
    const commJson = await commRes.json();
    const hasAdminTgInfo = (commJson.data.info || []).some(
      (item) =>
        String(item.title || "").includes("@nodata_store") &&
        String(item.body || "").includes("https://telegram.me/nodata_store")
    );
    assert.equal(hasAdminTgInfo, true);
  });

  it("optimizes starry night background via GPU sprite-atlas & non-blocking boot while preserving all star layers and aesthetic intro splash", async () => {
    const indexHtml = fs.readFileSync(path.join(rootDir, "views/index.html"), "utf8");
    const stylesCss = fs.readFileSync(path.join(rootDir, "public/css/styles.css"), "utf8");
    const clientJs = fs.readFileSync(path.join(rootDir, "public/js/app.js"), "utf8");

    // 1. Elemen background bintang & splash logo tetap utuh (tidak dihapus/dikurangi)
    assert.match(indexHtml, /<canvas id="starfieldCanvas" class="nd-starfield"/);
    assert.match(indexHtml, /id="introSplash"/);

    // 2. Sprite-atlas offscreen (termasuk halo bintang semua layer & meteorSprite jelas), typed-array SoA, penjadwalan nextShootAt, dan tanpa createRadialGradient di dalam loop frame
    assert.match(clientJs, /function createStarSpriteAtlas\(\)/);
    assert.match(clientJs, /function detectStarfieldPerfProfile\(\)/);
    assert.match(clientJs, /function spawnShootingStar\(\)/);
    assert.match(clientJs, /nextShootAt/);
    assert.match(clientJs, /meteor\.width\s*=\s*240/);
    assert.match(clientJs, /new Float32Array\(/);
    const paintSceneMatch = clientJs.match(/function paintStarfieldScene\([\s\S]*?function drawFrame\(/);
    assert.ok(paintSceneMatch, "paintStarfieldScene harus terdefinisi");
    assert.doesNotMatch(paintSceneMatch[0], /createRadialGradient|createLinearGradient/);

    // 3. Durasi estetik animasi logo pembuka (~1.85s + smooth fade) & prioritas routeCurrentUrl sebelum initStarfield
    assert.match(clientJs, /INTRO_SPLASH_MIN_MS\s*=\s*1850/);
    assert.match(stylesCss, /\.nd-starfield\s*\{[\s\S]*?contain:\s*strict/);
    const cardBlock = stylesCss.match(/\.nd-card\s*\{[^}]*\}/);
    assert.ok(cardBlock && !/backdrop-filter/.test(cardBlock[0]), ".nd-card tidak boleh memicu blur per-kartu di atas canvas bintang");
    assert.ok(
      clientJs.lastIndexOf("routeCurrentUrl();") < clientJs.lastIndexOf("setTimeout(initStarfield, 0);"),
      "routeCurrentUrl wajib dieksekusi lebih awal daripada initStarfield saat boot"
    );
  });

  it("provides +90s Skip Intro (Lewati Intro +90d) on both video overlay and player control bar for desktop & mobile", async () => {
    const stylesCss = fs.readFileSync(path.join(rootDir, "public/css/styles.css"), "utf8");
    const clientJs = fs.readFileSync(path.join(rootDir, "public/js/app.js"), "utf8");

    // 1. Konstanta 90 detik, tombol floating di atas player, tombol bar di bawah player, fitur Urungkan (Undo), & pintasan keyboard S
    assert.match(clientJs, /const INTRO_SKIP_SECONDS\s*=\s*90/);
    assert.match(clientJs, /id="skipIntroContainer"/);
    assert.match(clientJs, /id="skipIntroOverlayBtn"/);
    assert.match(clientJs, /id="skipIntroBarBtn"/);
    assert.match(clientJs, /id="undoSkipIntroBtn"/);
    assert.match(clientJs, /Lewati Intro \+90d/);
    assert.match(clientJs, /function triggerSkipIntroJump\(\)/);

    // 2. Adaptasi responsif desktop & mobile (grid 2 kolom aman minmax(0, 1fr), tanpa bare 1fr, sembunyikan badge kbd di layar sentuh)
    assert.match(stylesCss, /\.nd-skip-intro-float\s*\{/);
    assert.match(stylesCss, /\.nd-skip-intro-pill\s*\{/);
    assert.match(stylesCss, /\.nd-player-tools-group\s*\{[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(stylesCss, /\.nd-player-nav-group\s*\{[\s\S]*?repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    assert.doesNotMatch(stylesCss, /grid-template-columns:\s*1fr\s*;/);
  });

  it("maintains decluttered v7.0 streaming hierarchy (Unified Watch Dock, anti-collision card badges, numbered episode cells, & 2-column callout grid)", async () => {
    const stylesCss = fs.readFileSync(path.join(rootDir, "public/css/styles.css"), "utf8");
    const clientJs = fs.readFileSync(path.join(rootDir, "public/js/app.js"), "utf8");

    // 1. Unified Cinema Watch Dock (video frame + flush control strip + inline server rows)
    assert.match(clientJs, /class="nd-watch-dock"/);
    assert.match(clientJs, /class="nd-watch-header"/);
    assert.match(clientJs, /class="nd-server-row"/);
    assert.match(clientJs, /id="watchEpList"/);
    assert.match(stylesCss, /\.nd-watch-dock\s*\{/);
    assert.match(stylesCss, /\.nd-server-row\s*\{/);

    // 2. Anti-collision poster badge flex header + concise episode formatter
    assert.match(clientJs, /function compactCardBadge\(/);
    assert.match(clientJs, /function formatEpisodeItemDisplay\(/);
    assert.match(clientJs, /class="nd-card-badges-top"/);
    assert.match(clientJs, /class="nd-ep-num-badge"/);
    assert.match(stylesCss, /\.nd-card-badges-top\s*\{/);
    assert.match(stylesCss, /\.nd-ep-num-badge\s*\{/);

    // 3. Unified 2-column callout grid (QRIS Support + Contact Admin side-by-side on desktop, minmax(0, 1fr) on mobile)
    assert.match(clientJs, /class="nd-callout-grid/);
    assert.match(stylesCss, /\.nd-callout-grid\s*\{[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    assert.doesNotMatch(stylesCss, /grid-template-columns:\s*1fr\s*;/);
  });

  it("defaults episode playback to 720p (or <1080p fallback) and warns before switching to high-data 1080p servers", async () => {
    const indexHtml = fs.readFileSync(path.join(rootDir, "views/index.html"), "utf8");
    const stylesCss = fs.readFileSync(path.join(rootDir, "public/css/styles.css"), "utf8");
    const clientJs = fs.readFileSync(path.join(rootDir, "public/js/app.js"), "utf8");

    // 1. Markup modal peringatan kuota 1080p tersedia dengan opsi jangan ingatkan selama sesi ini
    assert.match(indexHtml, /id="highDataWarnBackdrop"/);
    assert.match(indexHtml, /id="highDataWarnModal"/);
    assert.match(indexHtml, /id="highDataDontAskCheck"/);
    assert.match(indexHtml, /id="highDataStayBtn"/);
    assert.match(indexHtml, /id="highDataConfirmBtn"/);
    assert.match(indexHtml, /Jangan ingatkan lagi selama sesi ini/);

    // 2. Logika pemilih default 720p -> <1080p -> fallback & intersep klik 1080p + simpan timestamp video
    assert.match(clientJs, /function pickInitialDefaultStreamIndex\(/);
    assert.match(clientJs, /function pickNextFallbackStreamIndex\(/);
    assert.match(clientJs, /function isHighDataStream\(/);
    assert.match(clientJs, /function openHighDataWarningModal\(/);
    assert.match(clientJs, /function initHighDataWarningModal\(/);
    assert.match(clientJs, /SKIP_1080P_WARN:\s*"nodatanime_skip_1080p_warn_v1"/);
    assert.match(clientJs, /class="nd-fhd-tag">FHD<\/span>/);
    assert.match(clientJs, /preservePlayback:\s*true/);

    // 3. CSS responsif aman (minmax(0, 1fr), tanpa bare 1fr)
    assert.match(stylesCss, /\.nd-data-warn-modal\s*\{/);
    assert.match(stylesCss, /\.nd-data-compare-grid\s*\{[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(stylesCss, /\.nd-fhd-tag\s*\{/);
    assert.doesNotMatch(stylesCss, /grid-template-columns:\s*1fr\s*;/);
  });

  it("resolves missing anime banners & covers across Hero, Detail, Schedule, Catalog, ISP-blocked hosts, and Cinema Dual-Layer UI (v7.2)", async () => {
    const snap = JSON.parse(
      fs.readFileSync(path.join(rootDir, "data/ylnime-snapshot.json"), "utf8")
    );
    const stylesCss = fs.readFileSync(path.join(rootDir, "public/css/styles.css"), "utf8");
    const clientJs = fs.readFileSync(path.join(rootDir, "public/js/app.js"), "utf8");
    const noBannerSvg = fs.readFileSync(
      path.join(rootDir, "public/assets/no-banner.svg"),
      "utf8"
    );

    // 1. Seluruh 195 item katalog, 7 banner hero, 12 detail, dan 7 hari jadwal memiliki poster & banner valid (0 no-cover.svg / non-CDN MAL)
    assert.ok(snap.banners.length >= 7);
    assert.ok(snap.catalog.length >= 195);
    const assertCleanArtwork = (items, label) => {
      for (const item of items) {
        assert.ok(
          item.poster && !item.poster.includes("no-cover.svg"),
          `${label} "${item.title}" tidak boleh memiliki poster kosong/no-cover.svg`
        );
        assert.ok(
          item.banner && !item.banner.includes("no-cover.svg"),
          `${label} "${item.title}" tidak boleh memiliki banner kosong/no-cover.svg`
        );
        assert.doesNotMatch(
          item.poster,
          /:\/\/(?:www\.)?myanimelist\.net\/images\//i,
          `${label} "${item.title}" wajib memakai cdn.myanimelist.net`
        );
      }
    };
    assertCleanArtwork(snap.banners, "Banner");
    assertCleanArtwork(snap.catalog, "Catalog");
    assertCleanArtwork(Object.values(snap.details), "Detail");
    for (const dayGroup of snap.schedule) {
      assertCleanArtwork(dayGroup.animeList, `Jadwal ${dayGroup.day}`);
    }

    // 2. Endpoint /api/anime/home mengutamakan widescreen banner sejati (/banner/) di urutan awal Hero
    const homeRes = await fetch(`${baseUrl}/api/anime/home`);
    assert.equal(homeRes.status, 200);
    const homeBody = await homeRes.json();
    assert.match(homeBody.data.banners[0].banner, /\/banner\//i);
    assertCleanArtwork(homeBody.data.banners, "API Home Banner");
    assertCleanArtwork(homeBody.data.latestReleases, "API Latest");
    assertCleanArtwork(homeBody.data.ongoing, "API Ongoing");

    // 3. Host sampul yang diblokir ISP Indonesia (otakudesu.blog / root animekita.org) otomatis diproksi via /api/anime/image-proxy
    const searchRes = await fetch(`${baseUrl}/api/anime/search?q=Mynoghra`);
    assert.equal(searchRes.status, 200);
    const searchBody = await searchRes.json();
    assert.ok(searchBody.data.items.length >= 1);
    assert.match(
      searchBody.data.items[0].poster,
      /^\/api\/anime\/image-proxy\?url=/
    );

    // 4. Verifikasi Dual-Layer Hero Mode, Detail Banner Strip, no-banner.svg, & Multi-Stage Fallback di frontend
    assert.match(noBannerSvg, /<svg\b/);
    assert.match(clientJs, /function hasDistinctWidescreenBanner\(/);
    assert.match(clientJs, /function buildTitledArtworkDataUri\(/);
    assert.match(clientJs, /class="nd-hero-poster-showcase"/);
    assert.match(clientJs, /class="nd-detail-banner-strip"/);
    assert.match(stylesCss, /\.nd-hero-bg\.is-ambient-cover\s*\{/);
    assert.match(stylesCss, /\.nd-hero-poster-showcase\s*\{/);
    assert.match(stylesCss, /\.nd-detail-banner-strip\s*\{/);
    assert.doesNotMatch(stylesCss, /grid-template-columns:\s*1fr\s*;/);
  });

  it("recovers episode streams via Tier-2 AnimeKita adapter on YLnime timeout and never caches empty failed streams (v7.3)", async () => {
    const { appCache } = await import("../src/utils/cache.js");
    const { animeKitaClient } = await import("../src/scrapers/animekitaClient.js");
    const clientJs = fs.readFileSync(path.join(rootDir, "public/js/app.js"), "utf8");

    // 1. Ketika YLnime offline & AnimeKita offline, episode tanpa stream lokal TIDAK diracuni ke dalam appCache
    const offlineRes = await fetch(
      `${baseUrl}/api/anime/episode?series=maougun-saikyou-no-majutsushi-wa-ningen-datta&episode=al-149137-5`
    );
    assert.equal(offlineRes.status, 200);
    const offlineBody = await offlineRes.json();
    assert.equal(offlineBody.data.streamAvailable, false);
    assert.equal(offlineBody.data.title, "Maougun Saikyou no Majutsushi wa Ningen datta — Episode 5");
    assert.equal(
      appCache.get("ep:maougun-saikyou-no-majutsushi-wa-ningen-datta:al-149137-5:"),
      undefined,
      "Episode gagal/kosong tidak boleh dikunci di cache 5 menit"
    );

    // 2. Ketika Tier-2 AnimeKita menyediakan stream untuk al-149137-5, percobaan berikutnya (atau refresh=1) langsung berhasil memutar 720p!
    const origFetchPayload = animeKitaClient.fetchEpisodePayload.bind(animeKitaClient);
    animeKitaClient.fetchEpisodePayload = async (epId) => {
      assert.equal(epId, "al-149137-5");
      return {
        rawStreams: [
          {
            id: 1,
            reso: "1080p",
            link: "https://sjkt.animekita.org/Maougun/Maougun.E05.1080p.mp4",
            provide: 15,
          },
          {
            id: 2,
            reso: "720p",
            link: "https://sjkt.animekita.org/Maougun/Maougun.E05.720p.mp4",
            provide: 15,
          },
        ],
        prevEp: "al-149137-4",
        nextEp: "al-149137-6",
      };
    };

    try {
      const recoveredRes = await fetch(
        `${baseUrl}/api/anime/episode?series=maougun-saikyou-no-majutsushi-wa-ningen-datta&episode=al-149137-5&refresh=1`
      );
      assert.equal(recoveredRes.status, 200);
      const recoveredBody = await recoveredRes.json();
      assert.equal(recoveredBody.source, "upstream-animekita");
      assert.equal(recoveredBody.data.streamAvailable, true);
      assert.equal(recoveredBody.data.defaultResolution, "720p");
      assert.equal(recoveredBody.data.streams.length, 2);
      assert.equal(recoveredBody.data.navigation.prevEpisodeId, "al-149137-4");
      assert.equal(recoveredBody.data.navigation.nextEpisodeId, "al-149137-6");
    } finally {
      animeKitaClient.fetchEpisodePayload = origFetchPayload;
    }

    // 3. Tombol Muat Ulang Server Live tersedia di frontend
    assert.match(clientJs, /id="retryLiveStreamBtn"/);
    assert.match(clientJs, /refresh:\s*true/);
  });
});
