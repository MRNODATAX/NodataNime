/**
 * NodataNime v6.0 — Client-Side Streaming & PWA Application
 * Menggunakan URL relatif `/api/*` sepenuhnya agar kompatibel di semua domain & Live Preview.
 * Dilengkapi Opening Brand Splash, Live Starry Night Background, 100% Vector SVG Bottom Navbar,
 * Obrolan & Info Komunitas Interaktif 2-Tab, serta Integrasi PWA penuh.
 */

const STORAGE_KEYS = {
  WATCHLIST: "nodatanime_watchlist_v1",
  HISTORY: "nodatanime_history_v1",
  PROGRESS: "nodatanime_progress_v1",
  AUTONEXT: "nodatanime_autonext_v1",
  CHAT_NICK: "nodatanime_chat_nick_v1",
};

const SVG_ICONS = {
  play: `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6,4 20,12 6,20"></polygon></svg>`,
  star: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-1px;" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  cinema: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`,
  flag: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>`,
  zap: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
  volume: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`,
  download: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
  external: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`,
  reply: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>`,
  coffee: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 8h1a4 4 0 1 1 0 8h-1"></path><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"></path><line x1="6" y1="2" x2="6" y2="4"></line><line x1="10" y1="2" x2="10" y2="4"></line><line x1="14" y1="2" x2="14" y2="4"></line></svg>`,
  shield: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>`,
};

/* ===== Client-Side Anti-QR-Swapping & Anti-Quishing Pinning ===== */
const PINNED_CLIENT_QRIS_GUARD = Object.freeze({
  merchantName: "NODATASHOP",
  nmid: "ID1025451509315",
  acquirerDomain: "ID.DANA.WWW",
  merchantPan: "936009153004927138",
  currency: "360",
  country: "ID",
  posterUrl: "/assets/qris-nodatashop.jpg",
  posterSha256: "8d15a9a4e70d095a4c189b1b210549c1e706430c0811a6407caa2eaa6ef503d0",
  staticPayloadSha256: "f6d4fff24c1bb7213791c970034700687428360d4e7e421f248ea9105e6631d2",
});

function renderSupportAdminBanner() {
  return `
    <div class="nd-support-card">
      <div class="nd-support-card-left">
        <span class="nd-support-card-icon" aria-hidden="true">${SVG_ICONS.coffee}</span>
        <div class="nd-support-card-copy">
          <p class="nd-support-card-title">Nonton lancar tanpa iklan pop-up? Kasih penyemangat buat Admin yuk!</p>
          <p class="nd-support-card-meta">
            ${SVG_ICONS.shield}
            <span>QRIS Resmi Terkunci &bull; <strong>NODATASHOP</strong> (<code>ID1025451509315</code>)</span>
          </p>
        </div>
      </div>
      <button type="button" class="nd-btn nd-btn-primary nd-support-qris-btn" data-open-qris="1">
        ${SVG_ICONS.coffee}
        <span>Traktir Kopi (QRIS)</span>
      </button>
    </div>
  `;
}

const bootStartedAt = performance.now();
let splashDismissed = false;
let deferredPwaPrompt = null;

const state = {
  homeData: null,
  heroIndex: 0,
  heroTimer: null,
  ongoingDayFilter: "Semua",
  cinemaMode: false,
  autoNext: localStorage.getItem(STORAGE_KEYS.AUTONEXT) !== "0",
  currentWatch: null,
  communityTab: "chat",
  communityData: { messages: [], info: [] },
  communityReplyTo: null,
  communityLoadedAt: 0,
};

const appRoot = document.getElementById("appRoot");
const navSearchInput = document.getElementById("navSearchInput");
const navSearchForm = document.getElementById("navSearchForm");
const searchDropdown = document.getElementById("searchDropdown");
const watchlistBadge = document.getElementById("watchlistBadge");
const footerSourceBadge = document.getElementById("footerSourceBadge");
const pwaStatusBadge = document.getElementById("pwaStatusBadge");
const cinemaOverlay = document.getElementById("cinemaOverlay");
const bottomDockWrap = document.getElementById("bottomDockWrap");
const bottomMoreBtn = document.getElementById("bottomMoreBtn");
const bottomMoreSheet = document.getElementById("bottomMoreSheet");
const notifPanel = document.getElementById("notifPanel");
const notifBtn = document.getElementById("notifBtn");

/* ===== Opening Brand Logo & Name Splash Controller ===== */
function dismissIntroSplash() {
  if (splashDismissed) return;
  splashDismissed = true;
  const splash = document.getElementById("introSplash");
  if (!splash) {
    document.body.classList.remove("is-splashing");
    return;
  }

  const elapsed = performance.now() - bootStartedAt;
  const minDisplayMs = 760;
  const waitMs = Math.max(0, minDisplayMs - elapsed);

  setTimeout(() => {
    document.body.classList.remove("is-splashing");
    splash.classList.add("is-leaving");
    setTimeout(() => {
      splash.hidden = true;
    }, 460);
  }, waitMs);
}

// Jaminan keamanan agar splash tidak pernah menggantung lebih dari 2.2 detik
setTimeout(dismissIntroSplash, 2200);

/* ===== Live Starry Night Background (Cahaya Putih Bintang Malam) ===== */
function initStarfield() {
  const canvas = document.getElementById("starfieldCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let stars = [];
  let shootingStars = [];
  let animFrameId = null;
  let pointerX = 0;
  let pointerY = 0;
  let lastShootAt = 0;

  function buildStars() {
    const area = width * height;
    const count = Math.min(260, Math.max(120, Math.floor(area / 7500)));
    stars = Array.from({ length: count }, (_, idx) => {
      const tierRand = Math.random();
      const layer = tierRand > 0.9 ? 3 : tierRand > 0.52 ? 2 : 1;
      const radius =
        layer === 3
          ? 1.7 + Math.random() * 1.15
          : layer === 2
            ? 1.0 + Math.random() * 0.75
            : 0.55 + Math.random() * 0.55;

      return {
        x: Math.random() * width,
        y: Math.random() * height,
        radius,
        layer,
        baseAlpha: layer === 3 ? 0.85 : layer === 2 ? 0.55 + Math.random() * 0.3 : 0.28 + Math.random() * 0.35,
        twinkleSpeed: 0.7 + Math.random() * 2.1,
        twinklePhase: Math.random() * Math.PI * 2,
        driftX: -(0.015 + layer * 0.012),
        driftY: -(0.025 + layer * 0.018),
        hasCross: layer === 3 && idx % 2 === 0,
      };
    });
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildStars();
  }

  function maybeSpawnShootingStar(nowSec) {
    if (reducedMotion) return;
    if (nowSec - lastShootAt < 5.5 + Math.random() * 5) return;
    if (shootingStars.length >= 2) return;
    lastShootAt = nowSec;

    const startX = Math.random() * width * 0.8 + width * 0.15;
    const startY = Math.random() * height * 0.38;
    const angle = (Math.PI * 3) / 4 + (Math.random() - 0.5) * 0.22;
    const speed = 380 + Math.random() * 240;

    shootingStars.push({
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      maxLife: 0.65 + Math.random() * 0.35,
      tailLength: 75 + Math.random() * 55,
    });
  }

  let prevTs = performance.now();

  function drawFrame(ts) {
    const dt = Math.min(0.05, (ts - prevTs) / 1000);
    prevTs = ts;
    const nowSec = ts / 1000;

    ctx.clearRect(0, 0, width, height);

    for (const s of stars) {
      if (!reducedMotion) {
        s.x += s.driftX;
        s.y += s.driftY;
        if (s.x < -6) s.x = width + 6;
        if (s.y < -6) s.y = height + 6;
      }

      const parallaxFactor = s.layer * 4;
      const drawX = (s.x + pointerX * parallaxFactor + width) % width;
      const drawY = (s.y + pointerY * parallaxFactor + height) % height;

      const twinkle = reducedMotion
        ? 1
        : 0.62 + 0.38 * Math.sin(nowSec * s.twinkleSpeed + s.twinklePhase);
      const alpha = Math.min(1, s.baseAlpha * twinkle);

      if (s.layer >= 2) {
        const glowRadius = s.radius * (s.layer === 3 ? 5.2 : 3.1);
        const grad = ctx.createRadialGradient(drawX, drawY, 0, drawX, drawY, glowRadius);
        grad.addColorStop(0, `rgba(255, 255, 255, ${(alpha * 0.55).toFixed(3)})`);
        grad.addColorStop(0.45, `rgba(220, 235, 255, ${(alpha * 0.18).toFixed(3)})`);
        grad.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(drawX, drawY, glowRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(drawX, drawY, s.radius, 0, Math.PI * 2);
      ctx.fill();

      if (s.hasCross && alpha > 0.62) {
        const arm = s.radius * 4.2;
        ctx.strokeStyle = `rgba(255, 255, 255, ${(alpha * 0.38).toFixed(3)})`;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(drawX - arm, drawY);
        ctx.lineTo(drawX + arm, drawY);
        ctx.moveTo(drawX, drawY - arm);
        ctx.lineTo(drawX, drawY + arm);
        ctx.stroke();
      }
    }

    maybeSpawnShootingStar(nowSec);
    for (let i = shootingStars.length - 1; i >= 0; i -= 1) {
      const sh = shootingStars[i];
      sh.life += dt;
      if (sh.life >= sh.maxLife) {
        shootingStars.splice(i, 1);
        continue;
      }
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;

      const progress = sh.life / sh.maxLife;
      const opacity = Math.sin(progress * Math.PI) * 0.85;
      const norm = Math.hypot(sh.vx, sh.vy) || 1;
      const tailX = sh.x - (sh.vx / norm) * sh.tailLength;
      const tailY = sh.y - (sh.vy / norm) * sh.tailLength;

      const lineGrad = ctx.createLinearGradient(sh.x, sh.y, tailX, tailY);
      lineGrad.addColorStop(0, `rgba(255, 255, 255, ${opacity.toFixed(3)})`);
      lineGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(sh.x, sh.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
    }

    if (!reducedMotion && !document.hidden) {
      animFrameId = requestAnimationFrame(drawFrame);
    }
  }

  resize();
  drawFrame(performance.now());

  window.addEventListener("resize", resize);
  window.addEventListener(
    "pointermove",
    (e) => {
      if (width > 0 && height > 0) {
        pointerX = (e.clientX / width - 0.5) * 1.4;
        pointerY = (e.clientY / height - 0.5) * 1.4;
      }
    },
    { passive: true }
  );

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
    } else if (!reducedMotion && !animFrameId) {
      prevTs = performance.now();
      animFrameId = requestAnimationFrame(drawFrame);
    }
  });
}

function esc(value = "") {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[ch] || ch;
  });
}

function safeUrl(rawUrl = "", fallback = "") {
  const str = String(rawUrl ?? "").trim();
  if (!str || /[\u0000-\u001F\u007F]/.test(str)) return fallback;
  if (str.startsWith("/") && !str.startsWith("//")) {
    return str;
  }
  try {
    const parsed = new URL(str);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.href;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Abaikan jika mode privat penuh
  }
}

function showToast(message) {
  const root = document.getElementById("toastRoot");
  if (!root) return;
  const el = document.createElement("div");
  el.className = "nd-toast";
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 3200);
}

function formatSeconds(sec = 0) {
  const total = Math.max(0, Math.floor(Number(sec) || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatRelativeWib(tsSeconds = 0) {
  const sec = Number(tsSeconds) || 0;
  if (!sec) return "Baru saja";
  const nowSec = Math.floor(Date.now() / 1000);
  const diff = nowSec - sec;
  if (diff < 60) return "Baru saja";
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  try {
    return new Date(sec * 1000).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "Komunitas";
  }
}

/* ===== Watchlist & History Helpers ===== */
function getWatchlist() {
  return readJsonStorage(STORAGE_KEYS.WATCHLIST, []);
}

function isBookmarked(slug) {
  return getWatchlist().some((item) => item.slug === slug);
}

function toggleBookmark(anime) {
  const list = getWatchlist();
  const idx = list.findIndex((x) => x.slug === anime.slug);
  let added = false;
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.unshift({
      slug: anime.slug,
      title: anime.title,
      poster: anime.poster || "/assets/no-cover.svg",
      score: anime.score || "",
      status: anime.status || "Anime",
      episode: anime.episode || "",
      savedAt: Date.now(),
    });
    added = true;
  }
  writeJsonStorage(STORAGE_KEYS.WATCHLIST, list.slice(0, 100));
  updateWatchlistBadge();
  showToast(added ? `"${anime.title}" disimpan ke Koleksi Saya` : `"${anime.title}" dihapus dari Koleksi`);
  return added;
}

function getWatchHistory() {
  return readJsonStorage(STORAGE_KEYS.HISTORY, []);
}

function recordWatchHistory(entry) {
  if (!entry?.seriesSlug || !entry?.episodeId) return;
  const list = getWatchHistory().filter(
    (x) => !(x.seriesSlug === entry.seriesSlug && x.episodeId === entry.episodeId)
  );
  list.unshift({
    ...entry,
    watchedAt: Date.now(),
  });
  writeJsonStorage(STORAGE_KEYS.HISTORY, list.slice(0, 60));
}

function isEpisodeWatched(episodeId) {
  return getWatchHistory().some((x) => x.episodeId === episodeId);
}

function getSavedProgress(episodeId) {
  const map = readJsonStorage(STORAGE_KEYS.PROGRESS, {});
  return Number(map[episodeId] || 0);
}

function saveProgress(episodeId, currentTime) {
  if (!episodeId || !Number.isFinite(currentTime)) return;
  const map = readJsonStorage(STORAGE_KEYS.PROGRESS, {});
  map[episodeId] = Math.floor(currentTime);
  writeJsonStorage(STORAGE_KEYS.PROGRESS, map);
}

function updateWatchlistBadge() {
  if (!watchlistBadge) return;
  const count = getWatchlist().length;
  if (count > 0) {
    watchlistBadge.textContent = count > 99 ? "99+" : String(count);
    watchlistBadge.hidden = false;
  } else {
    watchlistBadge.hidden = true;
  }
}

/* ===== Relative API Client ===== */
async function apiRequest(path, options = {}) {
  const start = performance.now();
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const elapsedMs = Math.round(performance.now() - start);
  const json = await res.json();

  if (!res.ok || json.ok === false) {
    const err = new Error(json.message || json.error || `HTTP ${res.status}`);
    err.statusCode = res.status;
    throw err;
  }

  if (json.source && footerSourceBadge) {
    const label =
      json.source === "live-ylnime"
        ? "Engine: Live YLnime Scraper"
        : json.source === "upstream-animekita"
          ? "Engine: AnimeKita Upstream"
          : "Engine: Verified YLnime Snapshot";
    footerSourceBadge.textContent = label;
  }
  return { ...json, elapsedMs };
}

function apiGet(path) {
  return apiRequest(path);
}

/* ===== Interactive 2-Tab Community Chat & Info System ===== */
function renderCommunityPanelContent() {
  const chatListEl = document.getElementById("notifList");
  const infoListEl = document.getElementById("commInfoList");
  const chatCountEl = document.getElementById("commChatCount");
  const infoCountEl = document.getElementById("commInfoCount");
  const chatPane = document.getElementById("commChatPane");
  const infoPane = document.getElementById("commInfoPane");

  const messages = state.communityData.messages || [];
  const infoItems = state.communityData.info || [];

  if (chatCountEl) chatCountEl.textContent = String(messages.length);
  if (infoCountEl) infoCountEl.textContent = String(infoItems.length);

  document.querySelectorAll(".nd-comm-tab").forEach((btn) => {
    const active = btn.dataset.commTab === state.communityTab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });

  if (chatPane && infoPane) {
    chatPane.hidden = state.communityTab !== "chat";
    infoPane.hidden = state.communityTab !== "info";
  }

  if (chatListEl) {
    if (!messages.length) {
      chatListEl.innerHTML = `<div class="nd-muted-center">Belum ada obrolan. Jadilah yang pertama menyapa!</div>`;
    } else {
      chatListEl.innerHTML = messages
        .slice(0, 35)
        .map((m) => {
          const initial = esc((m.nickname || "A").trim().charAt(0).toUpperCase());
          return `
            <div class="nd-notif-item">
              <div class="nd-notif-top">
                <div class="nd-notif-user">
                  <span class="nd-comm-avatar">${initial}</span>
                  <span>${esc(m.nickname)}</span>
                </div>
                <span class="nd-notif-time">${esc(formatRelativeWib(m.timestamp))}</span>
              </div>
              ${
                m.replyTo && m.replyTo.nickname
                  ? `<div class="nd-comm-quote"><strong>@${esc(m.replyTo.nickname)}</strong>: ${esc(m.replyTo.message || m.replyTo.snippet || "")}</div>`
                  : ""
              }
              <div class="nd-notif-msg">${esc(m.message)}</div>
              <div class="nd-notif-foot">
                <button
                  type="button"
                  class="nd-comm-reply-btn"
                  data-reply-nick="${esc(m.nickname)}"
                  data-reply-msg="${esc((m.message || "").slice(0, 80))}"
                >
                  ${SVG_ICONS.reply} Balas
                </button>
              </div>
            </div>
          `;
        })
        .join("");
    }
  }

  if (infoListEl) {
    if (!infoItems.length) {
      infoListEl.innerHTML = `<div class="nd-muted-center">Belum ada pengumuman komunitas saat ini.</div>`;
    } else {
      infoListEl.innerHTML = infoItems
        .map(
          (inf) => `
          <article class="nd-info-card ${inf.pinned ? "is-pinned" : ""}">
            <div class="nd-info-meta">
              <span class="nd-info-cat">${inf.pinned ? "PINNED • " : ""}${esc(inf.category || "Info")}</span>
              <span class="nd-notif-time">${esc(inf.date || (inf.createdAt ? new Date(inf.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : ""))}</span>
            </div>
            <div class="nd-info-title">${esc(inf.title)}</div>
            <div class="nd-info-body">${esc(inf.body)}</div>
          </article>
        `
        )
        .join("");
    }
  }
}

async function loadCommunityData(force = false) {
  if (!force && state.communityLoadedAt && Date.now() - state.communityLoadedAt < 20_000) {
    renderCommunityPanelContent();
    return;
  }
  try {
    const res = await apiGet("/api/community");
    state.communityData = {
      messages: res.data?.messages || [],
      info: res.data?.info || [],
    };
    state.communityLoadedAt = Date.now();
    renderCommunityPanelContent();
  } catch {
    renderCommunityPanelContent();
  }
}

function openCommunityPanel(tab = null) {
  if (tab) state.communityTab = tab;
  if (!notifPanel) return;
  notifPanel.hidden = false;
  notifBtn?.setAttribute("aria-expanded", "true");
  const dot = document.getElementById("notifDot");
  if (dot) dot.style.display = "none";

  const savedNick = localStorage.getItem(STORAGE_KEYS.CHAT_NICK) || "";
  const nickInput = document.getElementById("commNicknameInput");
  if (nickInput && !nickInput.value && savedNick) {
    nickInput.value = savedNick;
  }
  loadCommunityData(false);
}

function closeCommunityPanel() {
  if (!notifPanel) return;
  notifPanel.hidden = true;
  notifBtn?.setAttribute("aria-expanded", "false");
}

function setCommunityReply(replyObj) {
  state.communityReplyTo = replyObj;
  const bar = document.getElementById("commReplyPreview");
  const txt = document.getElementById("commReplyText");
  if (!bar || !txt) return;
  if (!replyObj) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  txt.textContent = `Membalas @${replyObj.nickname}: "${replyObj.message.slice(0, 42)}"`;
  document.getElementById("commMessageInput")?.focus();
}

function initCommunityControls() {
  notifBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (notifPanel?.hidden) openCommunityPanel();
    else closeCommunityPanel();
  });

  document.getElementById("communityCloseBtn")?.addEventListener("click", () => {
    closeCommunityPanel();
  });

  document.getElementById("communityRefreshBtn")?.addEventListener("click", async () => {
    await loadCommunityData(true);
    showToast("Obrolan & Info Komunitas diperbarui");
  });

  document.getElementById("sheetOpenCommunityBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    closeMoreSheet();
    openCommunityPanel("chat");
  });

  document.querySelectorAll(".nd-comm-tab").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      state.communityTab = tabBtn.dataset.commTab || "chat";
      renderCommunityPanelContent();
    });
  });

  document.getElementById("commCancelReplyBtn")?.addEventListener("click", () => {
    setCommunityReply(null);
  });

  notifPanel?.addEventListener("click", (e) => {
    const replyBtn = e.target.closest("[data-reply-nick]");
    if (replyBtn) {
      setCommunityReply({
        nickname: replyBtn.dataset.replyNick,
        message: replyBtn.dataset.replyMsg || "",
      });
    }
  });

  document.getElementById("commChatForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nickEl = document.getElementById("commNicknameInput");
    const msgEl = document.getElementById("commMessageInput");
    const sendBtn = document.getElementById("commSendBtn");
    const nickname = nickEl?.value.trim() || "";
    const message = msgEl?.value.trim() || "";
    if (!nickname || !message) return;

    localStorage.setItem(STORAGE_KEYS.CHAT_NICK, nickname);
    if (sendBtn) sendBtn.disabled = true;

    try {
      const res = await apiRequest("/api/community/messages", {
        method: "POST",
        body: {
          nickname,
          message,
          replyTo: state.communityReplyTo,
        },
      });
      if (res.data) {
        state.communityData.messages = [res.data, ...(state.communityData.messages || [])];
        state.communityLoadedAt = Date.now();
        renderCommunityPanelContent();
      }
      if (msgEl) msgEl.value = "";
      setCommunityReply(null);
    } catch (err) {
      showToast(err.message || "Gagal mengirim obrolan");
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  });
}

/* ===== Progressive Web App (PWA) Controller ===== */
function isStandalonePwa() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true
  );
}

function updatePwaStatusBadge() {
  if (!pwaStatusBadge) return;
  if (!navigator.onLine) {
    pwaStatusBadge.textContent = "Mode Offline";
  } else if (isStandalonePwa()) {
    pwaStatusBadge.textContent = "PWA Terpasang";
  } else {
    pwaStatusBadge.textContent = "PWA Ready";
  }
}

async function triggerPwaInstall() {
  if (isStandalonePwa()) {
    showToast("Aplikasi NodataNime sudah berjalan dalam mode PWA Mandiri!");
    return;
  }
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    const choice = await deferredPwaPrompt.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") {
      showToast("Terima kasih! NodataNime sedang dipasang ke perangkat Anda.");
      deferredPwaPrompt = null;
      document.getElementById("pwaInstallBtn")?.classList.remove("is-ready");
    }
    return;
  }
  showToast(
    "Untuk memasang aplikasi: buka menu browser (⋮ atau Bagikan) lalu pilih 'Tambahkan ke Layar Utama / Install App'."
  );
}

function initPwa() {
  updatePwaStatusBadge();
  window.addEventListener("online", () => {
    updatePwaStatusBadge();
    showToast("Koneksi kembali online!");
  });
  window.addEventListener("offline", () => {
    updatePwaStatusBadge();
    showToast("Anda sedang dalam Mode Offline.");
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    document.getElementById("pwaInstallBtn")?.classList.add("is-ready");
  });

  window.addEventListener("appinstalled", () => {
    deferredPwaPrompt = null;
    updatePwaStatusBadge();
    showToast("Aplikasi NodataNime berhasil terpasang!");
  });

  document.getElementById("pwaInstallBtn")?.addEventListener("click", triggerPwaInstall);
  document.getElementById("sheetInstallPwaBtn")?.addEventListener("click", () => {
    closeMoreSheet();
    triggerPwaInstall();
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
}

/* ===== Reusable Card Component ===== */
function renderAnimeCard(item, options = {}) {
  const directEpisode = Boolean(options.directEpisode);
  const poster = esc(safeUrl(item.poster, "/assets/no-cover.svg"));
  const title = esc(item.title || "Anime");
  const slug = esc(item.slug || item.rawSlug || "");
  const epId = directEpisode ? esc(item.episodeId || "") : "";
  const topBadge = esc(item.episode || item.label || "");
  const score = esc(item.score || "");
  const status = esc(item.status || "Sub Indo");
  const views = item.views ? `${esc(item.views)} views` : status;

  return `
    <article
      class="nd-card"
      data-card-slug="${slug}"
      ${epId ? `data-card-ep="${epId}"` : ""}
      tabindex="0"
      role="button"
      aria-label="Buka ${title}"
    >
      <div class="nd-card-poster-wrap">
        <img
          src="${poster}"
          alt="${title}"
          class="nd-card-poster"
          loading="lazy"
          referrerpolicy="no-referrer"
        />
        ${topBadge ? `<span class="nd-badge-top-left">${topBadge}</span>` : ""}
        ${score ? `<span class="nd-badge-top-right">${SVG_ICONS.star} ${score}</span>` : ""}
        ${status ? `<span class="nd-badge-bottom">${status}</span>` : ""}
        <div class="nd-card-play">
          <div class="nd-play-circle">
            ${SVG_ICONS.play}
          </div>
        </div>
      </div>
      <div class="nd-card-body">
        <div class="nd-card-title">${title}</div>
        <div class="nd-card-sub">${views}</div>
      </div>
    </article>
  `;
}

function renderSkeleton() {
  appRoot.innerHTML = `
    <div class="nd-container">
      <div class="nd-skel-hero"></div>
      <div class="nd-skel-row">
        ${Array.from({ length: 12 }, () => '<div class="nd-skel-card"></div>').join("")}
      </div>
    </div>
  `;
}

function stopHeroCarousel() {
  if (state.heroTimer) {
    clearInterval(state.heroTimer);
    state.heroTimer = null;
  }
}

function closeMoreSheet() {
  if (bottomMoreSheet) bottomMoreSheet.hidden = true;
  if (bottomMoreBtn) bottomMoreBtn.setAttribute("aria-expanded", "false");
}

/* ===== Bottom Navigation Active State & URL Router ===== */
function setActiveNav(view, type = "") {
  let matchedDirectBar = false;

  document.querySelectorAll("#bottomNavBar .nd-bnav-item[data-view]").forEach((btn) => {
    const bView = btn.dataset.view;
    const bType = btn.dataset.type || "";
    const active = bView === view && (!bType || bType === type);
    btn.classList.toggle("active", active);
    if (active) matchedDirectBar = true;
  });

  let matchedSheet = false;
  document.querySelectorAll("#bottomMoreSheet .nd-sheet-item[data-view]").forEach((item) => {
    const sView = item.dataset.view;
    const sType = item.dataset.type || "";
    const active = sView === view && (!sType || sType === type);
    item.classList.toggle("active", active);
    if (active) matchedSheet = true;
  });

  if (bottomMoreBtn) {
    bottomMoreBtn.classList.toggle("active", !matchedDirectBar && matchedSheet);
  }
}

export function navigate(params = {}, push = true) {
  stopHeroCarousel();
  setCinemaMode(false);
  closeMoreSheet();
  closeCommunityPanel();
  if (searchDropdown) searchDropdown.hidden = true;

  const url = new URL(window.location.href);
  url.pathname = "/";
  url.search = "";

  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  });

  if (push) {
    window.history.pushState({}, "", url.pathname + url.search);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
  routeCurrentUrl();
}

async function routeCurrentUrl() {
  stopHeroCarousel();
  const params = new URLSearchParams(window.location.search);
  const cleanPath = window.location.pathname.replace(/\/+$/, "") || "/";

  // Dukungan shortcut path PWA (/ongoing, /jadwal, /watchlist)
  const pathShortcutView =
    cleanPath === "/ongoing"
      ? "catalog"
      : cleanPath === "/jadwal"
        ? "schedule"
        : cleanPath === "/watchlist"
          ? "library"
          : null;

  const series = params.get("series");
  const episode = params.get("episode");
  const ep = params.get("ep");
  const search = params.get("search") || params.get("q");
  const view = pathShortcutView || params.get("view") || "home";

  try {
    if (episode || (series && ep)) {
      setActiveNav("");
      await renderWatchView({ series, episode, ep });
      return;
    }
    if (series) {
      setActiveNav("");
      await renderDetailView(series);
      return;
    }
    if (search) {
      setActiveNav("");
      await renderSearchView(search);
      return;
    }

    switch (view) {
      case "catalog": {
        const type = params.get("type") || "ongoing";
        const page = Number(params.get("page") || 1);
        setActiveNav("catalog", type);
        await renderCatalogView(type, page);
        break;
      }
      case "genres": {
        const g = params.get("g") || "action";
        const page = Number(params.get("page") || 1);
        setActiveNav("genres");
        await renderGenresView(g, page);
        break;
      }
      case "schedule":
        setActiveNav("schedule");
        await renderScheduleView();
        break;
      case "az": {
        const letter = params.get("letter") || "I";
        const page = Number(params.get("page") || 1);
        setActiveNav("az");
        await renderAzView(letter, page);
        break;
      }
      case "library":
        setActiveNav("library");
        renderLibraryView();
        break;
      case "api":
        setActiveNav("api");
        await renderApiInspectorView();
        break;
      default:
        setActiveNav("home");
        await renderHomeView();
        break;
    }

    if (params.get("community") === "1") {
      openCommunityPanel("chat");
    }
  } catch (err) {
    appRoot.innerHTML = `
      <div class="nd-container">
        <div class="nd-empty-state">
          <h3>Gagal memuat halaman</h3>
          <p>${esc(err?.message || "Terjadi gangguan jaringan.")}</p>
          <button type="button" class="nd-btn nd-btn-primary" id="retryBtn">Muat Ulang Beranda</button>
        </div>
      </div>
    `;
    document.getElementById("retryBtn")?.addEventListener("click", () => navigate({}));
  } finally {
    dismissIntroSplash();
  }
}

/* ===== 1. Home View ===== */
function renderHeroSlide(banners, idx) {
  const b = banners[idx] || banners[0];
  if (!b) return "";
  return `
    <img
      src="${esc(safeUrl(b.banner || b.poster, "/assets/no-cover.svg"))}"
      alt="${esc(b.title)}"
      class="nd-hero-bg"
      referrerpolicy="no-referrer"
    />
    <div class="nd-hero-shade"></div>
    <div class="nd-hero-content">
      <div class="nd-hero-badges">
        <span class="nd-pill-crimson">${esc(b.status || "Sedang Tayang")}</span>
        ${b.episode ? `<span class="nd-pill-glass">${esc(b.episode)}</span>` : ""}
        ${b.score ? `<span class="nd-pill-glass">${SVG_ICONS.star} ${esc(b.score)}</span>` : ""}
        ${(b.genres || []).slice(0, 3).map((g) => `<span class="nd-pill-glass">${esc(g)}</span>`).join("")}
      </div>
      <h1 class="nd-hero-title">${esc(b.title)}</h1>
      <p class="nd-hero-synopsis">${esc(b.synopsis || "")}</p>
      <div class="nd-hero-actions">
        <button
          type="button"
          class="nd-btn nd-btn-primary"
          data-watch-series="${esc(b.slug)}"
          data-watch-ep="${esc(b.episodeId || "")}"
        >
          ${SVG_ICONS.play}
          Tonton Sekarang
        </button>
        <button type="button" class="nd-btn nd-btn-secondary" data-open-series="${esc(b.slug)}">
          Detail &amp; Episode
        </button>
      </div>
    </div>
    <div class="nd-hero-dots">
      ${banners
        .map(
          (_, i) =>
            `<button type="button" class="nd-hero-dot ${i === idx ? "active" : ""}" data-hero-idx="${i}" aria-label="Slide ${i + 1}"></button>`
        )
        .join("")}
    </div>
  `;
}

function renderTopRankingItems(topAnime, tabKey) {
  const list = topAnime?.[tabKey] || topAnime?.today || [];
  return list
    .map(
      (item, idx) => `
      <div class="nd-rank-item" data-open-series="${esc(item.slug)}">
        <div class="nd-rank-num">${esc(item.rank || idx + 1)}</div>
        <img
          src="${esc(safeUrl(item.poster, "/assets/no-cover.svg"))}"
          alt="${esc(item.title)}"
          class="nd-rank-poster"
          loading="lazy"
          referrerpolicy="no-referrer"
        />
        <div class="nd-rank-info">
          <div class="nd-rank-title">${esc(item.title)}</div>
          <div class="nd-rank-views">${item.views ? `${esc(item.views)} tayangan organik` : "Populer"}</div>
        </div>
      </div>
    `
    )
    .join("");
}

function filterOngoingByDay(list, day) {
  if (!day || day === "Semua") return list.slice(0, 12);
  const target = day.toLowerCase();
  return list.filter(
    (x) => String(x.releaseDay || x.label || "").toLowerCase() === target
  );
}

async function renderHomeView() {
  if (!state.homeData) {
    renderSkeleton();
  }
  const { data } = await apiGet("/api/anime/home");
  state.homeData = data;

  const history = getWatchHistory().slice(0, 6);
  const banners = data.banners || [];
  state.heroIndex = 0;

  const days = ["Semua", "Sabtu", "Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat"];
  const filteredOngoing = filterOngoingByDay(data.ongoing || [], state.ongoingDayFilter);

  appRoot.innerHTML = `
    <div class="nd-container">
      ${banners.length ? `<section class="nd-hero" id="heroContainer">${renderHeroSlide(banners, 0)}</section>` : ""}

      <!-- Baris Genre Cepat -->
      <div class="nd-pills-row">
        ${(data.genres || [])
          .slice(0, 14)
          .map(
            (g) =>
              `<button type="button" class="nd-pill-btn" data-jump-genre="${esc(g.genreId)}">${esc(g.title)}</button>`
          )
          .join("")}
        <button type="button" class="nd-pill-btn" data-jump-view="genres">Semua 28 Genre</button>
      </div>

      ${
        history.length
          ? `
        <section class="nd-section">
          <div class="nd-section-head">
            <h2 class="nd-section-title">Lanjutkan Menonton</h2>
            <button type="button" class="nd-link-more" data-jump-view="library">Riwayat Lengkap</button>
          </div>
          <div class="nd-card-grid">
            ${history
              .map((h) =>
                renderAnimeCard(
                  {
                    title: h.animeTitle || h.title,
                    slug: h.seriesSlug,
                    episodeId: h.episodeId,
                    poster: h.poster,
                    episode: h.episodeLabel || "Lanjut",
                    status: h.progressSec ? `Menit ${formatSeconds(h.progressSec)}` : "Ditonton",
                  },
                  { directEpisode: true }
                )
              )
              .join("")}
          </div>
        </section>
      `
          : ""
      }

      <div class="nd-home-split">
        <div>
          <!-- Baru Rilis -->
          <section class="nd-section">
            <div class="nd-section-head">
              <h2 class="nd-section-title">Baru Rilis &amp; Update Episode</h2>
              <button type="button" class="nd-link-more" data-jump-catalog="baru">Lihat Semua</button>
            </div>
            <div class="nd-card-grid">
              ${(data.latestReleases || []).slice(0, 12).map((x) => renderAnimeCard(x)).join("")}
            </div>
          </section>

          <!-- Sedang Tayang dengan Filter Hari Akurat -->
          <section class="nd-section">
            <div class="nd-section-head">
              <h2 class="nd-section-title">Sedang Tayang (Ongoing)</h2>
              <button type="button" class="nd-link-more" data-jump-catalog="ongoing">Semua Ongoing</button>
            </div>
            <div class="nd-pills-row" id="ongoingDayPills">
              ${days
                .map(
                  (d) =>
                    `<button type="button" class="nd-pill-btn ${d === state.ongoingDayFilter ? "active" : ""}" data-day-filter="${d}">${d}</button>`
                )
                .join("")}
            </div>
            <div class="nd-card-grid" id="homeOngoingGrid">
              ${
                filteredOngoing.length
                  ? filteredOngoing.map((x) => renderAnimeCard(x)).join("")
                  : `<div class="nd-empty-state" style="grid-column:1/-1;padding:28px;">Belum ada jadwal rilis khusus untuk hari ${esc(state.ongoingDayFilter)}.</div>`
              }
            </div>
          </section>

          <!-- Rekomendasi -->
          <section class="nd-section">
            <div class="nd-section-head">
              <h2 class="nd-section-title">Rekomendasi Kurasi Terbaik</h2>
              <button type="button" class="nd-link-more" data-jump-catalog="rekomendasi">Lihat Semua</button>
            </div>
            <div class="nd-card-grid">
              ${(data.recommendations || []).slice(0, 8).map((x) => renderAnimeCard(x)).join("")}
            </div>
          </section>
        </div>

        <!-- Sidebar Top 10 Anime -->
        <aside class="nd-top-box">
          <h2 class="nd-section-title" style="font-size:1.12rem;">Top 10 Anime Terpopuler</h2>
          <div class="nd-tabs-mini" id="topRankTabs">
            <button type="button" class="nd-tab-mini active" data-rank-tab="today">Hari Ini</button>
            <button type="button" class="nd-tab-mini" data-rank-tab="yesterday">Kemarin</button>
            <button type="button" class="nd-tab-mini" data-rank-tab="week">7 Hari</button>
            <button type="button" class="nd-tab-mini" data-rank-tab="month">30 Hari</button>
          </div>
          <div class="nd-rank-list" id="topRankList">
            ${renderTopRankingItems(data.topAnime, "today")}
          </div>
        </aside>
      </div>

      ${renderSupportAdminBanner()}
    </div>
  `;

  if (banners.length > 1) {
    const heroEl = document.getElementById("heroContainer");
    state.heroTimer = setInterval(() => {
      if (!heroEl || !document.body.contains(heroEl)) {
        stopHeroCarousel();
        return;
      }
      state.heroIndex = (state.heroIndex + 1) % banners.length;
      heroEl.innerHTML = renderHeroSlide(banners, state.heroIndex);
    }, 6500);
  }
}

/* ===== 2. Catalog View ===== */
async function renderCatalogView(type = "ongoing", page = 1) {
  renderSkeleton();
  const titles = {
    ongoing: "Anime Sedang Tayang (Ongoing)",
    completed: "Anime Tamat (Completed)",
    movie: "Movie / Film Anime Sub Indo",
    baru: "Baru Diupload",
    rekomendasi: "Rekomendasi Pilihan",
    hyper: "Top TerHype Bulan Ini",
  };
  const { data } = await apiGet(`/api/anime/list?type=${encodeURIComponent(type)}&page=${page}`);
  const tabs = [
    ["ongoing", "Ongoing"],
    ["completed", "Tamat"],
    ["movie", "Movie"],
    ["baru", "Baru Upload"],
    ["rekomendasi", "Rekomendasi"],
    ["hyper", "Top TerHype"],
  ];

  const pg = data.pagination || { currentPage: page, hasPrevPage: page > 1, hasNextPage: false };

  appRoot.innerHTML = `
    <div class="nd-container">
      <div class="nd-section-head">
        <h1 class="nd-section-title">${esc(titles[type] || "Katalog Anime")}</h1>
        <span class="nd-tech-pill">${pg.totalItems ?? (data.items || []).length} Judul</span>
      </div>
      <div class="nd-pills-row">
        ${tabs
          .map(
            ([key, label]) =>
              `<button type="button" class="nd-pill-btn ${key === type ? "active" : ""}" data-jump-catalog="${key}">${label}</button>`
          )
          .join("")}
      </div>
      <div class="nd-card-grid">
        ${(data.items || []).map((x) => renderAnimeCard(x)).join("")}
      </div>
      <div class="nd-pager">
        <button type="button" class="nd-btn nd-btn-secondary" ${pg.hasPrevPage ? "" : "disabled"} data-cat-page="${pg.currentPage - 1}" data-cat-type="${esc(type)}">Sebelumnya</button>
        <span class="nd-pager-info">Halaman ${pg.currentPage} dari ${pg.totalPages || 1}</span>
        <button type="button" class="nd-btn nd-btn-secondary" ${pg.hasNextPage ? "" : "disabled"} data-cat-page="${pg.currentPage + 1}" data-cat-type="${esc(type)}">Berikutnya</button>
      </div>
    </div>
  `;
}

/* ===== 3. Genres View ===== */
async function renderGenresView(selectedGenre = "action", page = 1) {
  renderSkeleton();
  const [genresRes, itemsRes] = await Promise.all([
    apiGet("/api/anime/genres"),
    apiGet(`/api/anime/genre/${encodeURIComponent(selectedGenre)}?page=${page}`),
  ]);
  const genres = genresRes.data.items || [];
  const items = itemsRes.data.items || [];
  const pg = itemsRes.data.pagination || { currentPage: 1, hasPrevPage: false, hasNextPage: false };

  appRoot.innerHTML = `
    <div class="nd-container">
      <div class="nd-section-head">
        <h1 class="nd-section-title">Jelajahi Berdasarkan Genre</h1>
        <span class="nd-tech-pill">${pg.totalItems ?? items.length} Judul Cocok</span>
      </div>
      <div class="nd-pills-row">
        ${genres
          .map(
            (g) =>
              `<button type="button" class="nd-pill-btn ${g.genreId === selectedGenre ? "active" : ""}" data-jump-genre="${esc(g.genreId)}">${esc(g.title)}</button>`
          )
          .join("")}
      </div>
      ${
        items.length
          ? `<div class="nd-card-grid">${items.map((x) => renderAnimeCard(x)).join("")}</div>`
          : `<div class="nd-empty-state"><p>Belum ada anime dalam genre ${esc(selectedGenre)}.</p></div>`
      }
      <div class="nd-pager">
        <button type="button" class="nd-btn nd-btn-secondary" ${pg.hasPrevPage ? "" : "disabled"} data-genre-page="${pg.currentPage - 1}" data-genre-id="${esc(selectedGenre)}">Sebelumnya</button>
        <span class="nd-pager-info">Genre: ${esc(selectedGenre.toUpperCase())} • Halaman ${pg.currentPage}</span>
        <button type="button" class="nd-btn nd-btn-secondary" ${pg.hasNextPage ? "" : "disabled"} data-genre-page="${pg.currentPage + 1}" data-genre-id="${esc(selectedGenre)}">Berikutnya</button>
      </div>
    </div>
  `;
}

/* ===== 4. Schedule View ===== */
async function renderScheduleView() {
  renderSkeleton();
  const { data } = await apiGet("/api/anime/jadwal");
  const days = data.days || [];

  appRoot.innerHTML = `
    <div class="nd-container">
      <div class="nd-section-head">
        <h1 class="nd-section-title">Jadwal &amp; Tanggal Rilis Anime Mingguan</h1>
      </div>
      <div class="nd-pills-row">
        ${days
          .map(
            (d, i) =>
              `<a href="#sched-${i}" class="nd-pill-btn ${d.isToday ? "active" : ""}">${esc(d.day)} ${d.isToday ? "• HARI INI" : ""} (${d.animeList.length})</a>`
          )
          .join("")}
      </div>
      ${days
        .map(
          (group, i) => `
        <section class="nd-section" id="sched-${i}">
          <div class="nd-section-head">
            <h2 class="nd-section-title">
              ${esc(group.day)}
              ${group.date ? `<span style="font-size:0.86rem;color:var(--text-secondary);font-weight:500;">${esc(group.date)}</span>` : ""}
              ${group.isToday ? '<span class="nd-pill-crimson">HARI INI</span>' : ""}
            </h2>
            <span class="nd-tech-pill">${group.animeList.length} Judul</span>
          </div>
          <div class="nd-card-grid">
            ${group.animeList.map((x) => renderAnimeCard(x)).join("")}
          </div>
        </section>
      `
        )
        .join("")}
    </div>
  `;
}

/* ===== 5. A-Z Directory View ===== */
async function renderAzView(letter = "I", page = 1) {
  renderSkeleton();
  const letters = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
  const { data } = await apiGet(`/api/anime/az?letter=${encodeURIComponent(letter)}&page=${page}`);
  const items = data.items || [];
  const pg = data.pagination || { currentPage: 1, hasPrevPage: false, hasNextPage: false, totalItems: items.length };

  appRoot.innerHTML = `
    <div class="nd-container">
      <div class="nd-section-head">
        <h1 class="nd-section-title">Daftar Lengkap Anime A–Z</h1>
        <span class="nd-tech-pill">Huruf "${esc(data.letter)}" (${pg.totalItems ?? items.length} judul)</span>
      </div>
      <div class="nd-az-bar">
        ${letters
          .map(
            (l) =>
              `<button type="button" class="nd-pill-btn ${l === data.letter ? "active" : ""}" style="padding:8px 0;text-align:center;" data-az-letter="${esc(l)}">${esc(l)}</button>`
          )
          .join("")}
      </div>
      ${
        items.length
          ? `<div class="nd-card-grid">${items.map((x) => renderAnimeCard(x)).join("")}</div>`
          : `<div class="nd-empty-state"><p>Belum ada judul berawalan "${esc(data.letter)}" pada indeks lokal saat ini. Coba huruf lain (misal I, A, B, K, O, S, T).</p></div>`
      }
      <div class="nd-pager">
        <button type="button" class="nd-btn nd-btn-secondary" ${pg.hasPrevPage ? "" : "disabled"} data-az-page="${pg.currentPage - 1}" data-az-cur="${esc(data.letter)}">Sebelumnya</button>
        <span class="nd-pager-info">Halaman ${pg.currentPage} dari ${pg.totalPages || 1}</span>
        <button type="button" class="nd-btn nd-btn-secondary" ${pg.hasNextPage ? "" : "disabled"} data-az-page="${pg.currentPage + 1}" data-az-cur="${esc(data.letter)}">Berikutnya</button>
      </div>
    </div>
  `;
}

/* ===== 6. Search View ===== */
async function renderSearchView(query) {
  renderSkeleton();
  if (navSearchInput) navSearchInput.value = query;
  const { data } = await apiGet(`/api/anime/search?q=${encodeURIComponent(query)}`);
  const items = data.items || [];

  appRoot.innerHTML = `
    <div class="nd-container">
      <div class="nd-section-head">
        <h1 class="nd-section-title">Hasil Pencarian: "${esc(query)}"</h1>
        <span class="nd-tech-pill">${items.length} judul ditemukan</span>
      </div>
      ${
        items.length
          ? `<div class="nd-card-grid">${items.map((x) => renderAnimeCard(x)).join("")}</div>`
          : `<div class="nd-empty-state"><h3>Tidak ada hasil untuk "${esc(query)}"</h3><p>Coba kata kunci lain seperti One Piece, Isekai, Bleach, Solo Leveling, Frieren, atau Naruto.</p></div>`
      }
    </div>
  `;
}

/* ===== 7. Watchlist & History View ===== */
function renderLibraryView() {
  const watchlist = getWatchlist();
  const history = getWatchHistory();

  appRoot.innerHTML = `
    <div class="nd-container">
      <section class="nd-section">
        <div class="nd-section-head">
          <h1 class="nd-section-title">Koleksi Saya (Watchlist)</h1>
          ${watchlist.length ? '<button type="button" class="nd-link-more" id="clearWatchlistBtn">Kosongkan Koleksi</button>' : ""}
        </div>
        ${
          watchlist.length
            ? `<div class="nd-card-grid">${watchlist.map((x) => renderAnimeCard(x)).join("")}</div>`
            : `<div class="nd-empty-state"><p>Koleksi kamu masih kosong. Klik tombol <strong>Simpan ke Koleksi</strong> di halaman detail anime favoritmu!</p></div>`
        }
      </section>

      <section class="nd-section">
        <div class="nd-section-head">
          <h2 class="nd-section-title">Riwayat Tontonan</h2>
          ${history.length ? '<button type="button" class="nd-link-more" id="clearHistoryBtn">Bersihkan Riwayat</button>' : ""}
        </div>
        ${
          history.length
            ? `<div class="nd-card-grid">${history
                .map((h) =>
                  renderAnimeCard(
                    {
                      title: h.animeTitle || h.title,
                      slug: h.seriesSlug,
                      episodeId: h.episodeId,
                      poster: h.poster,
                      episode: h.episodeLabel || "Ditonton",
                      status: h.progressSec ? `Posisi ${formatSeconds(h.progressSec)}` : "Selesai dibuka",
                    },
                    { directEpisode: true }
                  )
                )
                .join("")}</div>`
            : `<div class="nd-empty-state"><p>Belum ada riwayat tontonan.</p></div>`
        }
      </section>
    </div>
  `;

  document.getElementById("clearWatchlistBtn")?.addEventListener("click", () => {
    writeJsonStorage(STORAGE_KEYS.WATCHLIST, []);
    updateWatchlistBadge();
    renderLibraryView();
  });

  document.getElementById("clearHistoryBtn")?.addEventListener("click", () => {
    writeJsonStorage(STORAGE_KEYS.HISTORY, []);
    renderLibraryView();
  });
}

/* ===== 8. Series Detail View (Jumlah Episode 100% Akurat) ===== */
async function renderDetailView(slug) {
  renderSkeleton();
  const { data } = await apiGet(`/api/anime/detail/${encodeURIComponent(slug)}`);
  const bookmarked = isBookmarked(data.slug);
  const episodes = data.episodes || [];
  const firstEp = episodes[episodes.length - 1] || episodes[0];
  const latestEp = episodes[0];
  const maxEpNum = episodes.length
    ? Math.max(...episodes.map((e) => Number(e.number) || 0))
    : 0;
  const epCountLabel =
    maxEpNum > episodes.length
      ? `Terbaru Ep ${maxEpNum} • ${episodes.length} Tersedia`
      : `${episodes.length} Episode`;

  appRoot.innerHTML = `
    <div class="nd-container">
      <div style="margin-bottom:14px;">
        <button type="button" class="nd-link-more" data-jump-view="home">Kembali ke Beranda</button>
      </div>

      <section class="nd-detail-hero">
        <img
          src="${esc(safeUrl(data.banner || data.poster, "/assets/no-cover.svg"))}"
          alt=""
          class="nd-detail-backdrop"
          referrerpolicy="no-referrer"
        />
        <div class="nd-detail-body">
          <img
            src="${esc(safeUrl(data.poster, "/assets/no-cover.svg"))}"
            alt="${esc(data.title)}"
            class="nd-detail-poster"
            referrerpolicy="no-referrer"
          />
          <div>
            <h1 class="nd-detail-title">${esc(data.title)}</h1>
            <div class="nd-detail-meta">
              <span class="nd-score-badge">${SVG_ICONS.star} ${esc(data.score || "8.5")} Match</span>
              <span class="nd-pill-crimson">${esc(data.status || "Ongoing")}</span>
              <span class="nd-pill-glass">${esc(data.type || "TV")}</span>
              <span class="nd-pill-glass">${esc(data.year || "2026")}</span>
              <span class="nd-pill-glass">${esc(epCountLabel)}</span>
            </div>

            <div class="nd-pills-row" style="margin-bottom:16px;">
              ${(data.genres || [])
                .map(
                  (g) =>
                    `<button type="button" class="nd-pill-btn" data-jump-genre="${esc(g.genreId)}">${esc(g.title)}</button>`
                )
                .join("")}
            </div>

            <p class="nd-detail-synopsis">${esc(data.synopsis || "Sinopsis belum tersedia.")}</p>

            <div class="nd-hero-actions">
              ${
                latestEp
                  ? `<button type="button" class="nd-btn nd-btn-primary" data-play-ep="${esc(latestEp.episodeId)}" data-play-series="${esc(data.slug)}">
                      ${SVG_ICONS.play}
                      Tonton Terbaru (${esc(latestEp.title)})
                    </button>`
                  : ""
              }
              ${
                firstEp && firstEp.episodeId !== latestEp?.episodeId
                  ? `<button type="button" class="nd-btn nd-btn-secondary" data-play-ep="${esc(firstEp.episodeId)}" data-play-series="${esc(data.slug)}">
                      Mulai dari ${esc(firstEp.title)}
                    </button>`
                  : ""
              }
              <button type="button" class="nd-btn nd-btn-secondary" id="detailBookmarkBtn">
                ${bookmarked ? "Tersimpan di Koleksi" : "+ Simpan ke Koleksi"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="nd-ep-box">
        <div class="nd-ep-toolbar">
          <h2 class="nd-section-title" style="margin:0;">Daftar Episode (${episodes.length})</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <input type="search" id="epFilterInput" class="nd-ep-search" placeholder="Filter nomor / judul episode..." />
            <button type="button" class="nd-link-more" id="epSortBtn" data-order="desc">Urutan: Terbaru</button>
          </div>
        </div>
        <div class="nd-ep-grid" id="detailEpGrid"></div>
      </section>

      ${
        (data.recommendations || []).length
          ? `
        <section class="nd-section">
          <div class="nd-section-head">
            <h2 class="nd-section-title">Anime Serupa Pilihan</h2>
          </div>
          <div class="nd-card-grid">
            ${data.recommendations.map((x) => renderAnimeCard(x)).join("")}
          </div>
        </section>
      `
          : ""
      }
    </div>
  `;

  let epOrderDesc = true;
  let epQuery = "";

  const renderEpList = () => {
    const grid = document.getElementById("detailEpGrid");
    if (!grid) return;
    let list = [...episodes];
    if (!epOrderDesc) list.reverse();
    if (epQuery) {
      const q = epQuery.toLowerCase();
      list = list.filter(
        (e) =>
          String(e.title).toLowerCase().includes(q) ||
          String(e.number).includes(q)
      );
    }
    grid.innerHTML = list
      .map(
        (ep) => `
        <button
          type="button"
          class="nd-ep-item ${isEpisodeWatched(ep.episodeId) ? "watched" : ""}"
          data-play-ep="${esc(ep.episodeId)}"
          data-play-series="${esc(data.slug)}"
        >
          <div>
            <div class="nd-ep-name">${esc(ep.title)}</div>
            <div class="nd-ep-date">${esc(ep.date || "Sub Indo HD")}</div>
          </div>
          <div style="display:inline-flex;align-items:center;gap:7px;">
            ${ep.hasVerifiedStream ? '<span class="nd-ep-ready-pill">HD</span>' : ""}
            <span style="color:var(--accent-bright);display:inline-flex;">${SVG_ICONS.play}</span>
          </div>
        </button>
      `
      )
      .join("");
  };

  renderEpList();

  document.getElementById("epFilterInput")?.addEventListener("input", (e) => {
    epQuery = e.target.value.trim();
    renderEpList();
  });

  document.getElementById("epSortBtn")?.addEventListener("click", (e) => {
    epOrderDesc = !epOrderDesc;
    e.currentTarget.textContent = epOrderDesc ? "Urutan: Terbaru" : "Urutan: Ep 1";
    renderEpList();
  });

  document.getElementById("detailBookmarkBtn")?.addEventListener("click", (e) => {
    const nowSaved = toggleBookmark(data);
    e.currentTarget.textContent = nowSaved ? "Tersimpan di Koleksi" : "+ Simpan ke Koleksi";
  });
}

/* ===== 9. Watch Video Player View (Anti Salah Anime 100%) ===== */
function setCinemaMode(enabled) {
  state.cinemaMode = Boolean(enabled);
  if (cinemaOverlay) cinemaOverlay.hidden = !state.cinemaMode;
  if (bottomDockWrap) bottomDockWrap.classList.toggle("cinema-dimmed", state.cinemaMode);
}

async function renderWatchView({ series = "", episode = "", ep = "" }) {
  renderSkeleton();
  const qs = new URLSearchParams();
  if (series) qs.set("series", series);
  if (episode) qs.set("episode", episode);
  if (ep) qs.set("ep", ep);

  const { data } = await apiGet(`/api/anime/episode?${qs.toString()}`);
  state.currentWatch = data;

  const playableStreams = (data.streams || []).filter((s) => s.type === "mp4");
  const allStreams = data.streams || [];
  const activePool = playableStreams.length ? playableStreams : allStreams;
  let currentStreamIndex = 0;

  const epShortLabel = (data.title || "").split("—").pop()?.trim() || data.episodeId;
  if (data.episodeId) {
    recordWatchHistory({
      seriesSlug: data.seriesSlug,
      episodeId: data.episodeId,
      animeTitle: data.animeTitle,
      title: data.title,
      episodeLabel: epShortLabel,
      poster: data.poster,
      progressSec: getSavedProgress(data.episodeId),
    });
  }

  appRoot.innerHTML = `
    <div class="nd-container">
      <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:8px;font-size:0.86rem;color:var(--text-secondary);">
          <button type="button" class="nd-link-more" data-open-series="${esc(data.seriesSlug)}">Detail ${esc(data.animeTitle)}</button>
          <span>/</span>
          <strong style="color:#fff;">${esc(data.title)}</strong>
        </div>
        <span class="nd-tech-pill">${activePool.length ? "Sub Indo • Multi-Server" : "Menunggu Sinkronisasi Mirror"}</span>
      </div>

      <div class="nd-watch-layout">
        <div class="nd-player-stage">
          <div class="nd-video-frame" id="videoFrame">
            <div class="nd-watermark">NodataNime</div>
            <div id="resumeContainer"></div>
            <div id="seekFlashContainer"></div>
            <div id="videoMount" style="width:100%;height:100%;"></div>
          </div>

          <div class="nd-player-controls-bar">
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button
                type="button"
                class="nd-btn nd-btn-secondary"
                style="padding:8px 14px;font-size:0.82rem;"
                ${data.navigation?.prevEpisodeId ? `data-play-ep="${esc(data.navigation.prevEpisodeId)}" data-play-series="${esc(data.seriesSlug)}"` : "disabled"}
              >
                Ep Sebelumnya
              </button>
              <button
                type="button"
                class="nd-btn nd-btn-secondary"
                style="padding:8px 14px;font-size:0.82rem;"
                data-open-series="${esc(data.seriesSlug)}"
              >
                Semua Episode
              </button>
              <button
                type="button"
                class="nd-btn nd-btn-primary"
                style="padding:8px 14px;font-size:0.82rem;"
                ${data.navigation?.nextEpisodeId ? `data-play-ep="${esc(data.navigation.nextEpisodeId)}" data-play-series="${esc(data.seriesSlug)}"` : "disabled"}
              >
                Ep Selanjutnya
              </button>
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" class="nd-pill-btn ${state.autoNext ? "active" : ""}" id="toggleAutoNextBtn">
                Auto-Next: ${state.autoNext ? "ON" : "OFF"}
              </button>
              <button type="button" class="nd-pill-btn" id="toggleCinemaBtn">
                ${SVG_ICONS.cinema}Mode Bioskop
              </button>
            </div>
          </div>

          ${
            activePool.length
              ? `
            <div class="nd-server-panel">
              <div style="font-weight:700;font-size:0.88rem;color:#fff;">Pilih Server &amp; Resolusi Streaming:</div>
              <div class="nd-server-group" id="streamServerButtons">
                ${activePool
                  .map(
                    (s, i) => `
                    <button
                      type="button"
                      class="nd-pill-btn ${i === 0 ? "active" : ""}"
                      data-stream-idx="${i}"
                      data-use-proxy="0"
                    >
                      ${esc(s.label)}
                    </button>
                  `
                  )
                  .join("")}
                ${
                  playableStreams[0] && playableStreams[0].proxyUrl
                    ? `<button type="button" class="nd-pill-btn" data-stream-idx="0" data-use-proxy="1">
                        ${SVG_ICONS.zap}Proxy Range (${esc(playableStreams[0].resolution)})
                      </button>`
                    : ""
                }
              </div>

              ${
                (data.downloadLinks || []).length
                  ? `
                <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-subtle);">
                  <div style="font-weight:700;font-size:0.84rem;color:var(--text-secondary);margin-bottom:8px;">Tautan Unduh Langsung (Direct Download):</div>
                  <div class="nd-server-group">
                    ${(data.downloadLinks || [])
                      .filter((dl) => Boolean(safeUrl(dl?.url, "")))
                      .map(
                        (dl) => `
                        <a href="${esc(safeUrl(dl.url, "#"))}" target="_blank" rel="noopener noreferrer" class="nd-link-more">
                          ${SVG_ICONS.download}${esc(dl.label)}
                        </a>
                      `
                      )
                      .join("")}
                  </div>
                </div>
              `
                  : ""
              }
            </div>
          `
              : ""
          }

          ${renderSupportAdminBanner()}
        </div>

        <aside class="nd-ep-box" style="margin-bottom:0;">
          <h2 class="nd-section-title" style="font-size:1.05rem;margin-bottom:14px;">Episode ${esc(data.animeTitle)}</h2>
          <div class="nd-ep-grid" style="grid-template-columns:1fr;max-height:540px;">
            ${(data.episodes || [])
              .map(
                (item) => `
                <button
                  type="button"
                  class="nd-ep-item ${item.episodeId === data.episodeId ? "active" : ""} ${isEpisodeWatched(item.episodeId) ? "watched" : ""}"
                  data-play-ep="${esc(item.episodeId)}"
                  data-play-series="${esc(data.seriesSlug)}"
                >
                  <div>
                    <div class="nd-ep-name">${esc(item.title)}</div>
                    <div class="nd-ep-date">${esc(item.date || "HD")}</div>
                  </div>
                  <div style="display:inline-flex;align-items:center;gap:6px;">
                    ${item.hasVerifiedStream && item.episodeId !== data.episodeId ? '<span class="nd-ep-ready-pill">HD</span>' : ""}
                    <span style="display:inline-flex;">${item.episodeId === data.episodeId ? SVG_ICONS.volume : SVG_ICONS.play}</span>
                  </div>
                </button>
              `
              )
              .join("")}
          </div>
        </aside>
      </div>
    </div>
  `;

  function mountStream(index, useProxy = false, autoFallbackTried = false) {
    currentStreamIndex = index;
    const stream = activePool[index];
    const mount = document.getElementById("videoMount");
    if (!mount) return;

    if (!stream) {
      mount.innerHTML = `
        <div class="nd-player-unavailable">
          <img
            src="${esc(safeUrl(data.poster, "/assets/no-cover.svg"))}"
            alt="${esc(data.animeTitle)}"
            class="nd-player-unavailable-poster"
            referrerpolicy="no-referrer"
          />
          <strong style="font-size:1rem;color:#fff;">${esc(data.title)}</strong>
          <p style="max-width:460px;font-size:0.83rem;color:var(--text-secondary);line-height:1.55;margin:0;">
            Mirror video langsung untuk episode ini belum tersinkron di cache lokal (kami tidak mengalihkan ke anime lain agar tontonan tetap akurat).
          </p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:4px;">
            ${
              safeUrl(data.sourceUrl, "")
                ? `<a href="${esc(safeUrl(data.sourceUrl, "#"))}" target="_blank" rel="noopener noreferrer" class="nd-btn nd-btn-primary" style="padding:9px 16px;font-size:0.82rem;">
                    ${SVG_ICONS.external} Buka Sumber Episode Ini
                  </a>`
                : ""
            }
          </div>
        </div>
      `;
      return;
    }

    const rawCandidateUrl = useProxy && stream.proxyUrl ? stream.proxyUrl : stream.url;
    const srcUrl = safeUrl(rawCandidateUrl, "");
    if (!srcUrl) {
      mount.innerHTML = `<div class="nd-player-unavailable"><strong>URL stream diblokir oleh kebijakan keamanan klien.</strong></div>`;
      return;
    }

    if (stream.type === "embed") {
      mount.innerHTML = `<iframe src="${esc(srcUrl)}" sandbox="allow-scripts allow-same-origin allow-presentation" allowfullscreen referrerpolicy="no-referrer"></iframe>`;
      return;
    }

    mount.innerHTML = `
      <video
        id="ndVideoEl"
        controls
        playsinline
        preload="metadata"
        referrerpolicy="no-referrer"
        poster="${esc(safeUrl(data.poster, "/assets/no-cover.svg"))}"
        src="${esc(srcUrl)}"
      ></video>
    `;

    const videoEl = document.getElementById("ndVideoEl");
    if (!videoEl) return;

    const savedSec = getSavedProgress(data.episodeId);
    const resumeContainer = document.getElementById("resumeContainer");
    if (savedSec > 15 && resumeContainer) {
      resumeContainer.innerHTML = `
        <div class="nd-resume-banner">
          <span style="font-size:0.84rem;">Terakhir ditonton di <strong style="color:var(--gold);">${formatSeconds(savedSec)}</strong></span>
          <div style="display:flex;gap:8px;">
            <button type="button" class="nd-btn nd-btn-primary" style="padding:6px 12px;font-size:0.78rem;" id="resumeYesBtn">Lanjutkan</button>
            <button type="button" class="nd-btn nd-btn-secondary" style="padding:6px 12px;font-size:0.78rem;" id="resumeNoBtn">Tutup</button>
          </div>
        </div>
      `;
      document.getElementById("resumeYesBtn")?.addEventListener("click", () => {
        videoEl.currentTime = savedSec;
        videoEl.play().catch(() => {});
        resumeContainer.innerHTML = "";
      });
      document.getElementById("resumeNoBtn")?.addEventListener("click", () => {
        resumeContainer.innerHTML = "";
      });
    }

    let lastSaved = 0;
    videoEl.addEventListener("timeupdate", () => {
      if (Math.abs(videoEl.currentTime - lastSaved) >= 5) {
        lastSaved = videoEl.currentTime;
        saveProgress(data.episodeId, videoEl.currentTime);
      }
    });

    videoEl.addEventListener("ended", () => {
      if (state.autoNext && data.navigation?.nextEpisodeId) {
        showToast("Memutar episode selanjutnya secara otomatis...");
        navigate({ series: data.seriesSlug, episode: data.navigation.nextEpisodeId });
      }
    });

    videoEl.addEventListener("error", () => {
      if (!autoFallbackTried && index + 1 < activePool.length) {
        showToast(`Mengalihkan otomatis ke ${activePool[index + 1].label}...`);
        highlightServerBtn(index + 1, false);
        mountStream(index + 1, false, true);
      }
    });
  }

  function highlightServerBtn(idx, useProxy) {
    document.querySelectorAll("#streamServerButtons .nd-pill-btn").forEach((btn) => {
      const match =
        Number(btn.dataset.streamIdx) === idx &&
        (btn.dataset.useProxy === "1") === Boolean(useProxy);
      btn.classList.toggle("active", match);
    });
  }

  mountStream(0, false, false);

  document.getElementById("streamServerButtons")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-stream-idx]");
    if (!btn) return;
    const idx = Number(btn.dataset.streamIdx || 0);
    const useProxy = btn.dataset.useProxy === "1";
    highlightServerBtn(idx, useProxy);
    mountStream(idx, useProxy, true);
  });

  document.getElementById("toggleAutoNextBtn")?.addEventListener("click", (e) => {
    state.autoNext = !state.autoNext;
    localStorage.setItem(STORAGE_KEYS.AUTONEXT, state.autoNext ? "1" : "0");
    e.currentTarget.classList.toggle("active", state.autoNext);
    e.currentTarget.textContent = `Auto-Next: ${state.autoNext ? "ON" : "OFF"}`;
  });

  document.getElementById("toggleCinemaBtn")?.addEventListener("click", () => {
    setCinemaMode(!state.cinemaMode);
  });
}

/* ===== 10. Interactive API & REA Inspector View ===== */
async function renderApiInspectorView() {
  renderSkeleton();
  const [healthRes, apiListRes, reaRes] = await Promise.all([
    apiGet("/api/health"),
    apiGet("/api/anime"),
    apiGet("/api/rea/evidence"),
  ]);

  const endpoints = apiListRes.endpoints || [];
  const reaData = reaRes.data || {};
  const obligations = reaData.obligationLedger?.obligations || [];

  appRoot.innerHTML = `
    <div class="nd-container">
      <div class="nd-section-head">
        <h1 class="nd-section-title">NodataNime REST Scraper API &amp; REA Inspector</h1>
        <span class="nd-pill-crimson">REA v6.7.0 Verified</span>
      </div>

      <div class="nd-api-grid">
        <div>
          <h3 style="margin-top:0;">Uji Endpoint API Secara Langsung</h3>
          ${endpoints
            .filter((ep) => !ep.path.includes("stream-proxy"))
            .map((ep) => {
              const samplePath = ep.path
                .replace(":genreId", "isekai")
                .replace(":slug", "1piece-sub-indo")
                .replace(":epId", "al-150441-1180");
              return `
                <div class="nd-endpoint-card">
                  <div style="min-width:0;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                      <span class="nd-method-get">${esc(ep.method)}</span>
                      <code style="font-size:0.82rem;color:#fff;">${esc(samplePath)}</code>
                    </div>
                    <div style="font-size:0.76rem;color:var(--text-secondary);margin-top:4px;">${esc(ep.description)}</div>
                  </div>
                  <button type="button" class="nd-btn nd-btn-secondary" style="padding:7px 12px;font-size:0.78rem;flex-shrink:0;" data-try-api="${esc(samplePath)}">
                    Jalankan
                  </button>
                </div>
              `;
            })
            .join("")}
        </div>

        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3 style="margin:0;">Respons JSON Live</h3>
            <span class="nd-tech-pill" id="apiLatencyBadge">${healthRes.elapsedMs} ms</span>
          </div>
          <pre class="nd-code-box" id="apiOutputBox">${esc(JSON.stringify(healthRes.data, null, 2))}</pre>
        </div>
      </div>

      <section class="nd-ep-box">
        <h2 class="nd-section-title" style="margin-bottom:14px;">REA Reverse-Engineering Obligation Ledger (morluto/rea)</h2>
        <div class="nd-ep-grid" style="grid-template-columns:repeat(auto-fill,minmax(290px,1fr));max-height:none;">
          ${obligations
            .map(
              (ob) => `
              <div class="nd-ep-item" style="cursor:default;align-items:flex-start;flex-direction:column;">
                <div style="display:flex;justify-content:space-between;width:100%;align-items:center;">
                  <span class="nd-pill-crimson">${esc(ob.id)}</span>
                  <span style="color:var(--emerald);font-size:0.76rem;font-weight:800;">VERIFIED • ${esc(ob.status).toUpperCase()}</span>
                </div>
                <div class="nd-ep-name" style="margin-top:6px;">${esc(ob.title)}</div>
                <div class="nd-ep-date">Bukti: ${esc(ob.evidenceRef)} • Modul: ${esc(ob.implementation)}</div>
              </div>
            `
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

/* ===== Global Event Delegation ===== */
document.addEventListener("click", async (e) => {
  const brand = e.target.closest("[data-nav='home']");
  if (brand) {
    e.preventDefault();
    navigate({});
    return;
  }

  if (e.target.closest("#bottomMoreBtn")) {
    e.stopPropagation();
    const willOpen = bottomMoreSheet.hidden;
    bottomMoreSheet.hidden = !willOpen;
    bottomMoreBtn.setAttribute("aria-expanded", String(willOpen));
    return;
  }

  if (e.target.closest("#closeMoreSheetBtn")) {
    closeMoreSheet();
    return;
  }

  const navBtn = e.target.closest("[data-view]");
  if (navBtn) {
    e.preventDefault();
    const view = navBtn.dataset.view;
    const type = navBtn.dataset.type;
    if (view === "home") navigate({});
    else navigate({ view, type });
    return;
  }

  const cardEl = e.target.closest("[data-card-slug]");
  if (cardEl) {
    const slug = cardEl.dataset.cardSlug;
    const ep = cardEl.dataset.cardEp;
    if (ep) navigate({ series: slug, episode: ep });
    else navigate({ series: slug });
    return;
  }

  const openSeriesBtn = e.target.closest("[data-open-series]");
  if (openSeriesBtn) {
    navigate({ series: openSeriesBtn.dataset.openSeries });
    return;
  }

  const watchSeriesBtn = e.target.closest("[data-watch-series]");
  if (watchSeriesBtn) {
    const targetSeries = watchSeriesBtn.dataset.watchSeries;
    const targetEp = watchSeriesBtn.dataset.watchEp;
    if (targetEp) {
      navigate({ series: targetSeries, episode: targetEp });
    } else {
      navigate({ series: targetSeries });
    }
    return;
  }

  const playEpBtn = e.target.closest("[data-play-ep]");
  if (playEpBtn && !playEpBtn.disabled) {
    navigate({
      series: playEpBtn.dataset.playSeries,
      episode: playEpBtn.dataset.playEp,
    });
    return;
  }

  const heroDot = e.target.closest("[data-hero-idx]");
  if (heroDot && state.homeData?.banners) {
    state.heroIndex = Number(heroDot.dataset.heroIdx || 0);
    const heroEl = document.getElementById("heroContainer");
    if (heroEl) heroEl.innerHTML = renderHeroSlide(state.homeData.banners, state.heroIndex);
    return;
  }

  const rankTabBtn = e.target.closest("[data-rank-tab]");
  if (rankTabBtn && state.homeData?.topAnime) {
    const tab = rankTabBtn.dataset.rankTab;
    document.querySelectorAll("#topRankTabs .nd-tab-mini").forEach((b) =>
      b.classList.toggle("active", b.dataset.rankTab === tab)
    );
    const listEl = document.getElementById("topRankList");
    if (listEl) listEl.innerHTML = renderTopRankingItems(state.homeData.topAnime, tab);
    return;
  }

  const dayFilterBtn = e.target.closest("[data-day-filter]");
  if (dayFilterBtn && state.homeData?.ongoing) {
    state.ongoingDayFilter = dayFilterBtn.dataset.dayFilter;
    document.querySelectorAll("#ongoingDayPills .nd-pill-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.dayFilter === state.ongoingDayFilter)
    );
    const grid = document.getElementById("homeOngoingGrid");
    if (grid) {
      const items = filterOngoingByDay(state.homeData.ongoing, state.ongoingDayFilter);
      grid.innerHTML = items.length
        ? items.map((x) => renderAnimeCard(x)).join("")
        : `<div class="nd-empty-state" style="grid-column:1/-1;padding:28px;">Belum ada jadwal rilis khusus untuk hari ${esc(state.ongoingDayFilter)}.</div>`;
    }
    return;
  }

  const jumpGenre = e.target.closest("[data-jump-genre]");
  if (jumpGenre) {
    navigate({ view: "genres", g: jumpGenre.dataset.jumpGenre });
    return;
  }

  const jumpCatalog = e.target.closest("[data-jump-catalog]");
  if (jumpCatalog) {
    navigate({ view: "catalog", type: jumpCatalog.dataset.jumpCatalog });
    return;
  }

  const jumpView = e.target.closest("[data-jump-view]");
  if (jumpView) {
    const v = jumpView.dataset.jumpView;
    if (v === "home") navigate({});
    else navigate({ view: v });
    return;
  }

  const catPageBtn = e.target.closest("[data-cat-page]");
  if (catPageBtn && !catPageBtn.disabled) {
    navigate({
      view: "catalog",
      type: catPageBtn.dataset.catType,
      page: catPageBtn.dataset.catPage,
    });
    return;
  }

  const genrePageBtn = e.target.closest("[data-genre-page]");
  if (genrePageBtn && !genrePageBtn.disabled) {
    navigate({
      view: "genres",
      g: genrePageBtn.dataset.genreId,
      page: genrePageBtn.dataset.genrePage,
    });
    return;
  }

  const azLetterBtn = e.target.closest("[data-az-letter]");
  if (azLetterBtn) {
    navigate({ view: "az", letter: azLetterBtn.dataset.azLetter, page: 1 });
    return;
  }

  const azPageBtn = e.target.closest("[data-az-page]");
  if (azPageBtn && !azPageBtn.disabled) {
    navigate({
      view: "az",
      letter: azPageBtn.dataset.azCur,
      page: azPageBtn.dataset.azPage,
    });
    return;
  }

  const tryApiBtn = e.target.closest("[data-try-api]");
  if (tryApiBtn) {
    const outBox = document.getElementById("apiOutputBox");
    const latBadge = document.getElementById("apiLatencyBadge");
    const path = tryApiBtn.dataset.tryApi;
    if (outBox) outBox.textContent = `Memuat ${path}...`;
    try {
      const res = await apiGet(path);
      if (latBadge) latBadge.textContent = `${res.elapsedMs} ms`;
      if (outBox) outBox.textContent = JSON.stringify(res, null, 2);
    } catch (err) {
      if (outBox) outBox.textContent = `Error: ${err.message}`;
    }
    return;
  }

  if (!e.target.closest("#notifWrap") && !e.target.closest("#sheetOpenCommunityBtn")) {
    closeCommunityPanel();
  }
  if (!e.target.closest("#navSearchForm")) {
    if (searchDropdown) searchDropdown.hidden = true;
  }
  if (!e.target.closest("#bottomDockWrap")) {
    closeMoreSheet();
  }
});

cinemaOverlay?.addEventListener("click", () => setCinemaMode(false));

/* ===== Debounced Instant Search ===== */
let searchTimer = null;
navSearchInput?.addEventListener("input", () => {
  const q = navSearchInput.value.trim();
  clearTimeout(searchTimer);
  if (q.length < 2) {
    searchDropdown.hidden = true;
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const { data } = await apiGet(`/api/anime/search?q=${encodeURIComponent(q)}`);
      const top = (data.items || []).slice(0, 6);
      if (!top.length) {
        searchDropdown.innerHTML = `<div style="padding:14px;font-size:0.82rem;color:var(--text-secondary);">Tidak ada hasil cepat untuk "${esc(q)}"</div>`;
      } else {
        searchDropdown.innerHTML =
          top
            .map(
              (item) => `
              <div class="nd-search-item" data-open-series="${esc(item.slug)}">
                <img src="${esc(safeUrl(item.poster, "/assets/no-cover.svg"))}" alt="" referrerpolicy="no-referrer" />
                <div class="nd-search-meta">
                  <div class="nd-search-title">${esc(item.title)}</div>
                  <div class="nd-search-sub">${esc(item.status || "Anime")} ${item.episode ? `• ${esc(item.episode)}` : ""} ${item.score ? `• ★ ${esc(item.score)}` : ""}</div>
                </div>
              </div>
            `
            )
            .join("") +
          `<div class="nd-search-item" style="justify-content:center;color:var(--accent-bright);font-weight:700;font-size:0.82rem;" id="seeAllSearchBtn">Lihat semua hasil untuk "${esc(q)}"</div>`;
        document.getElementById("seeAllSearchBtn")?.addEventListener("click", () => {
          navigate({ search: q });
        });
      }
      searchDropdown.hidden = false;
    } catch {
      searchDropdown.hidden = true;
    }
  }, 220);
});

navSearchForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = navSearchInput.value.trim();
  if (q) navigate({ search: q });
});

/* ===== Keyboard Shortcuts ===== */
document.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName;
  if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
    e.preventDefault();
    navSearchInput?.focus();
    return;
  }
  if (e.key === "Escape") {
    if (searchDropdown) searchDropdown.hidden = true;
    closeCommunityPanel();
    closeMoreSheet();
    setCinemaMode(false);
    return;
  }

  const videoEl = document.getElementById("ndVideoEl");
  if (videoEl && tag !== "INPUT" && tag !== "TEXTAREA") {
    if (e.key === "ArrowRight") {
      videoEl.currentTime = Math.min(videoEl.duration || Infinity, videoEl.currentTime + 10);
      flashSeek("+10 dtk", "right");
    } else if (e.key === "ArrowLeft") {
      videoEl.currentTime = Math.max(0, videoEl.currentTime - 10);
      flashSeek("-10 dtk", "left");
    }
  }
});

function flashSeek(label, side) {
  const box = document.getElementById("seekFlashContainer");
  if (!box) return;
  box.innerHTML = `<div class="nd-seek-flash ${side}">${esc(label)}</div>`;
  setTimeout(() => {
    box.innerHTML = "";
  }, 600);
}

/* ===== Anti-Quishing & Anti-QR-Swapping Modal Controller ===== */
let verifiedPosterBlobUrl = null;
let currentQrisRenderState = {
  mode: "poster",
  amount: 0,
  svgMarkup: "",
  merchantName: PINNED_CLIENT_QRIS_GUARD.merchantName,
  nmid: PINNED_CLIENT_QRIS_GUARD.nmid,
};

function computeClientCrc16(str = "") {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i += 1) {
    crc ^= (str.charCodeAt(i) & 0xff) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function parseClientTlv(raw = "") {
  const tags = new Map();
  let i = 0;
  while (i < raw.length) {
    if (i + 4 > raw.length) throw new Error("TLV QRIS terpotong.");
    const tag = raw.slice(i, i + 2);
    const len = Number.parseInt(raw.slice(i + 2, i + 4), 10);
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(len) || len <= 0 || i + 4 + len > raw.length) {
      throw new Error("Struktur TLV QRIS rusak.");
    }
    tags.set(tag, raw.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  return tags;
}

function verifyClientEmvcoQris(payload = "", expectedAmount = 0) {
  const str = String(payload || "");
  if (
    !str.startsWith("000201") ||
    str.slice(-8, -4) !== "6304" ||
    /(?:https?|javascript|data|vbscript|file):/i.test(str) ||
    str.includes("://")
  ) {
    throw new Error("Kode QR ditolak: terdeteksi format non-EMVCo / URL mencurigakan.");
  }
  const crcActual = str.slice(-4).toUpperCase();
  const crcExpected = computeClientCrc16(str.slice(0, -4));
  if (crcActual !== crcExpected) {
    throw new Error("Checksum CRC-16 QRIS tidak valid (indikasi manipulasi QR).");
  }
  const tags = parseClientTlv(str);
  const tag26 = tags.has("26") ? parseClientTlv(tags.get("26")) : new Map();
  const tag51 = tags.has("51") ? parseClientTlv(tags.get("51")) : new Map();

  if (
    tags.get("59") !== PINNED_CLIENT_QRIS_GUARD.merchantName ||
    tag51.get("02") !== PINNED_CLIENT_QRIS_GUARD.nmid ||
    tag26.get("00") !== PINNED_CLIENT_QRIS_GUARD.acquirerDomain ||
    tag26.get("01") !== PINNED_CLIENT_QRIS_GUARD.merchantPan ||
    tags.get("53") !== PINNED_CLIENT_QRIS_GUARD.currency ||
    tags.get("58") !== PINNED_CLIENT_QRIS_GUARD.country
  ) {
    throw new Error("Identitas merchant QRIS tidak sesuai dengan NODATASHOP resmi!");
  }

  if (expectedAmount > 0 && tags.get("54") !== String(expectedAmount)) {
    throw new Error("Nominal pada kode QRIS dinamis tidak cocok.");
  }
  return true;
}

async function verifyPosterBlobUrl() {
  if (verifiedPosterBlobUrl) return verifiedPosterBlobUrl;
  const resp = await fetch(PINNED_CLIENT_QRIS_GUARD.posterUrl, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-cache",
  });
  if (!resp.ok) {
    throw new Error("Gagal memuat poster QRIS resmi dari server.");
  }
  const buf = await resp.arrayBuffer();
  if (window.crypto?.subtle) {
    const hashBuf = await window.crypto.subtle.digest("SHA-256", buf);
    const hex = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (hex !== PINNED_CLIENT_QRIS_GUARD.posterSha256) {
      throw new Error("Peringatan Keamanan: Hash SHA-256 gambar QRIS tidak cocok! Gambar diblokir.");
    }
  }
  const blob = new Blob([buf], { type: "image/jpeg" });
  verifiedPosterBlobUrl = URL.createObjectURL(blob);
  return verifiedPosterBlobUrl;
}

function buildSafeSvgElement(svgMarkup = "") {
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(svgMarkup || ""), "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) {
    throw new Error("Dokumen SVG QRIS tidak valid.");
  }
  const safeSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const viewBox = root.getAttribute("viewBox") || "0 0 33 33";
  if (!/^[\d.\s-]+$/.test(viewBox)) {
    throw new Error("Atribut viewBox SVG QRIS tidak aman.");
  }
  safeSvg.setAttribute("viewBox", viewBox);
  safeSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  safeSvg.setAttribute("role", "img");
  safeSvg.setAttribute("aria-label", "QRIS Resmi NODATASHOP Terverifikasi");

  for (const child of Array.from(root.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag !== "path" && tag !== "rect") {
      throw new Error(`Elemen SVG asing '${tag}' diblokir oleh proteksi Anti-QR-Injection.`);
    }
    const cleanEl = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const attr of ["d", "x", "y", "width", "height", "fill", "stroke", "shape-rendering"]) {
      const val = child.getAttribute(attr);
      if (val !== null) {
        if (/url\(|javascript:|expression\(/i.test(val)) {
          throw new Error("Nilai atribut SVG berbahaya diblokir.");
        }
        cleanEl.setAttribute(attr, val);
      }
    }
    safeSvg.appendChild(cleanEl);
  }
  return safeSvg;
}

function formatRupiah(amount = 0) {
  return `Rp${Number(amount || 0).toLocaleString("id-ID")}`;
}

async function loadAndRenderQrisAmount(amount = 0) {
  const visualBox = document.getElementById("qrisVisualBox");
  const amountLabel = document.getElementById("qrisActiveAmountLabel");
  const badge = document.getElementById("qrisIntegrityBadge");
  const downloadBtn = document.getElementById("qrisDownloadBtn");
  if (!visualBox || !amountLabel || !badge) return;

  visualBox.innerHTML = `<div class="nd-qris-loading">Memverifikasi keaslian QRIS NODATASHOP...</div>`;
  badge.classList.remove("is-error");
  if (downloadBtn) downloadBtn.disabled = true;

  try {
    const cleanAmt = Number.parseInt(amount, 10) || 0;
    if (cleanAmt === 0) {
      const safeBlobUrl = await verifyPosterBlobUrl();
      const img = document.createElement("img");
      img.src = safeBlobUrl;
      img.alt = "Poster QRIS Resmi NODATASHOP (ID1025451509315)";
      visualBox.innerHTML = "";
      visualBox.appendChild(img);

      amountLabel.textContent = "Nominal Bebas (Masukkan di Aplikasi Pembayaran)";
      badge.innerHTML = `${SVG_ICONS.shield}<span>SHA-256 Poster Asli Terverifikasi</span>`;
      currentQrisRenderState = {
        mode: "poster",
        amount: 0,
        svgMarkup: "",
        merchantName: PINNED_CLIENT_QRIS_GUARD.merchantName,
        nmid: PINNED_CLIENT_QRIS_GUARD.nmid,
      };
      if (downloadBtn) downloadBtn.disabled = false;
      return;
    }

    const res = await apiGet(`/api/support/qris?amount=${encodeURIComponent(cleanAmt)}`);
    const data = res.data || {};
    verifyClientEmvcoQris(data.payload, cleanAmt);
    const safeSvgEl = buildSafeSvgElement(data.svg);

    visualBox.innerHTML = "";
    visualBox.appendChild(safeSvgEl);
    amountLabel.textContent = `Nominal Otomatis: ${formatRupiah(cleanAmt)}`;
    badge.innerHTML = `${SVG_ICONS.shield}<span>EMVCo CRC-16 (${esc(data.crc16)}) Terverifikasi</span>`;

    currentQrisRenderState = {
      mode: "dynamic",
      amount: cleanAmt,
      svgMarkup: new XMLSerializer().serializeToString(safeSvgEl),
      merchantName: PINNED_CLIENT_QRIS_GUARD.merchantName,
      nmid: PINNED_CLIENT_QRIS_GUARD.nmid,
    };
    if (downloadBtn) downloadBtn.disabled = false;
  } catch (err) {
    badge.classList.add("is-error");
    badge.textContent = "Proteksi Keamanan Memblokir QR";
    visualBox.innerHTML = `<div class="nd-qris-tamper-alert">${esc(
      err?.message || "Verifikasi keamanan QRIS gagal."
    )}</div>`;
  }
}

async function downloadVerifiedQrisImage() {
  try {
    if (currentQrisRenderState.mode === "poster") {
      const blobUrl = await verifyPosterBlobUrl();
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = "QRIS-NODATASHOP-ID1025451509315.jpg";
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast("Gambar QRIS resmi NODATASHOP berhasil disimpan!");
      return;
    }

    const { amount, svgMarkup } = currentQrisRenderState;
    if (!svgMarkup) return;
    const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    await new Promise((resolve, reject) => {
      const img = new Image();
      img.addEventListener("load", () => {
        const canvas = document.createElement("canvas");
        canvas.width = 720;
        canvas.height = 900;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "#e50914";
        ctx.fillRect(0, 0, canvas.width, 16);

        ctx.fillStyle = "#0b0f19";
        ctx.font = "800 36px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("NODATASHOP", 360, 88);

        ctx.fillStyle = "#475569";
        ctx.font = "600 22px monospace";
        ctx.fillText("NMID : ID1025451509315 (A01)", 360, 128);

        ctx.fillStyle = "#e50914";
        ctx.font = "700 26px sans-serif";
        ctx.fillText(`Nominal Otomatis: ${formatRupiah(amount)}`, 360, 174);

        ctx.drawImage(img, 110, 200, 500, 500);

        ctx.fillStyle = "#0f172a";
        ctx.font = "700 20px sans-serif";
        ctx.fillText("SATU QRIS UNTUK SEMUA — Penyemangat Admin NodataNime", 360, 750);

        ctx.fillStyle = "#64748b";
        ctx.font = "500 17px sans-serif";
        ctx.fillText("Pastikan nama penerima muncul NODATASHOP sebelum bayar.", 360, 790);

        URL.revokeObjectURL(url);
        const pngUrl = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = `QRIS-NODATASHOP-Rp${amount}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        resolve();
      });
      img.addEventListener("error", () => {
        URL.revokeObjectURL(url);
        reject(new Error("Gagal merender gambar QRIS untuk diunduh."));
      });
      img.src = url;
    });

    showToast(`QRIS ${formatRupiah(amount)} berhasil disimpan ke perangkat!`);
  } catch (err) {
    showToast(err?.message || "Gagal menyimpan gambar QRIS.");
  }
}

function openQrisSupportModal(initialAmount = 0) {
  const backdrop = document.getElementById("qrisModalBackdrop");
  if (!backdrop) return;
  if (bottomMoreSheet && !bottomMoreSheet.hidden) {
    bottomMoreSheet.hidden = true;
    bottomMoreBtn?.setAttribute("aria-expanded", "false");
  }
  backdrop.hidden = false;
  document.querySelectorAll(".nd-qris-preset").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.qrisAmount) === Number(initialAmount));
  });
  loadAndRenderQrisAmount(initialAmount);
}

function closeQrisSupportModal() {
  const backdrop = document.getElementById("qrisModalBackdrop");
  if (backdrop) backdrop.hidden = true;
}

function initQrisSupportModal() {
  const backdrop = document.getElementById("qrisModalBackdrop");
  const closeBtn = document.getElementById("qrisModalCloseBtn");
  const presetGroup = document.getElementById("qrisPresetGroup");
  const customForm = document.getElementById("qrisCustomForm");
  const customInput = document.getElementById("qrisCustomInput");
  const downloadBtn = document.getElementById("qrisDownloadBtn");
  const sayThanksBtn = document.getElementById("qrisSayThanksBtn");

  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-open-qris]");
    if (trigger) {
      e.preventDefault();
      openQrisSupportModal(0);
    }
  });

  closeBtn?.addEventListener("click", closeQrisSupportModal);
  backdrop?.addEventListener("click", (e) => {
    if (e.target === backdrop) closeQrisSupportModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && backdrop && !backdrop.hidden) {
      closeQrisSupportModal();
    }
  });

  presetGroup?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-qris-amount]");
    if (!btn) return;
    const amt = Number.parseInt(btn.dataset.qrisAmount, 10) || 0;
    document.querySelectorAll(".nd-qris-preset").forEach((el) => {
      el.classList.toggle("active", el === btn);
    });
    if (customInput) customInput.value = amt > 0 ? String(amt) : "";
    loadAndRenderQrisAmount(amt);
  });

  customForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const rawVal = Number.parseInt(customInput?.value || "", 10);
    if (!Number.isSafeInteger(rawVal) || rawVal < 1000 || rawVal > 10000000) {
      showToast("Masukkan nominal bulat antara Rp1.000 s/d Rp10.000.000.");
      return;
    }
    document.querySelectorAll(".nd-qris-preset").forEach((el) => {
      el.classList.toggle("active", Number(el.dataset.qrisAmount) === rawVal);
    });
    loadAndRenderQrisAmount(rawVal);
  });

  downloadBtn?.addEventListener("click", () => {
    downloadVerifiedQrisImage();
  });

  sayThanksBtn?.addEventListener("click", () => {
    closeQrisSupportModal();
    if (notifPanel) {
      notifPanel.hidden = false;
      notifBtn?.setAttribute("aria-expanded", "true");
    }
    const msgInput = document.getElementById("chatMessageInput");
    if (msgInput && !msgInput.value.trim()) {
      msgInput.value = "Semangat terus Admin NodataNime! Sudah kirim kopi lewat QRIS.";
      msgInput.focus();
    }
  });
}

window.addEventListener("popstate", () => {
  routeCurrentUrl();
});

/* ===== Boot ===== */
document.addEventListener(
  "error",
  (e) => {
    const el = e.target;
    if (el && el.tagName === "IMG" && el.dataset?.fallbackApplied !== "1") {
      el.dataset.fallbackApplied = "1";
      el.src = "/assets/no-cover.svg";
    }
  },
  true
);
initStarfield();
initCommunityControls();
initQrisSupportModal();
initPwa();
updateWatchlistBadge();
loadCommunityData(true);
routeCurrentUrl();
