import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : process.env.VERCEL
    ? path.join(os.tmpdir(), "nodatanime-data")
    : path.resolve(__dirname, "../../data");
const ADMIN_STORE_PATH = path.join(DATA_DIR, "admin-store.json");

const DEFAULT_ADMIN_USER = process.env.ADMIN_USERNAME || process.env.ADMIN_USER || "admin";
const DEFAULT_ADMIN_PASS = process.env.ADMIN_PASSWORD || "nodata2026";

function getSessionSecret() {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    "nodatanime-stateless-hmac-v2-2026"
  );
}

function signSessionToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(encoded)
    .digest("base64url");
  return `nd1.${encoded}.${sig}`;
}

function verifyStatelessSessionToken(token = "") {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "nd1") return null;
  const [, encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(encoded)
    .digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!parsed || typeof parsed.exp !== "number" || Date.now() > parsed.exp) {
      return null;
    }
    return {
      username: parsed.u || DEFAULT_ADMIN_USER,
      role: parsed.r || "Super Admin",
      expiresAt: parsed.exp,
    };
  } catch {
    return null;
  }
}

function hashSecret(plain, salt) {
  return crypto.pbkdf2Sync(String(plain), String(salt), 12000, 32, "sha256").toString("hex");
}

function createDefaultState() {
  const salt = "nodatanime-vault-salt-v1";
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    auth: {
      username: DEFAULT_ADMIN_USER,
      salt,
      passwordHash: hashSecret(DEFAULT_ADMIN_PASS, salt),
    },
    config: {
      engineMode: "hybrid", // "hybrid" | "live-first" | "snapshot-lockdown"
      announcement: {
        enabled: false,
        badge: "INFO ADMIN",
        text: "Selamat datang di NodataNime — Streaming Anime Sub Indo Multi-Server Tanpa Iklan Pop-up.",
        linkSlug: "1piece-sub-indo",
      },
    },
    catalogOverrides: {},
    streamOverrides: {},
    communityInfo: [
      {
        id: "info-pwa-01",
        category: "Aplikasi PWA",
        title: "NodataNime Kini Tersedia Sebagai Aplikasi (PWA)",
        body: "Pasang NodataNime langsung ke layar utama HP atau desktop kamu melalui menu Lainnya -> Install Aplikasi untuk akses instan layar penuh.",
        linkSlug: "",
        pinned: true,
        createdAt: "2026-10-24T08:00:00.000Z",
      },
      {
        id: "info-srv-02",
        category: "Status Server",
        title: "Multi-Server 360p s/d 1080p & Proxy Range Aktif",
        body: "Jika salah satu CDN melambat di jaringan operator kamu, pilih tombol server alternatif atau Proxy Range pada halaman pemutar video.",
        linkSlug: "1piece-sub-indo",
        pinned: true,
        createdAt: "2026-10-24T07:15:00.000Z",
      },
      {
        id: "info-sched-03",
        category: "Jadwal Rilis",
        title: "Update Episode Ongoing Musim Ini",
        body: "Jadwal rilis diperbarui otomatis setiap hari (Sabtu–Jumat WIB). Gunakan fitur Koleksi untuk menyimpan seri yang sedang kamu ikuti.",
        linkSlug: "bleach-kashin-tan-sub-indo",
        pinned: false,
        createdAt: "2026-10-24T06:00:00.000Z",
      },
    ],
    communityChat: [
      {
        id: "chat-seed-admin",
        nickname: "Tim NodataNime",
        message: "Halo semuanya! Silakan berdiskusi santai seputar episode terbaru atau request anime di kolom obrolan ini ya.",
        timestamp: nowSec - 1800,
        isAdmin: true,
        replyTo: null,
      },
    ],
    deletedChatIds: [],
    brokenReports: [
      {
        id: "rep-seed-01",
        seriesSlug: "detective-conan",
        episodeId: "al-149020-1100",
        animeTitle: "Meitantei Conan",
        serverLabel: "Pixeldrain 720p",
        reason: "Server Pixeldrain terkena hotlink protection pada episode lawas",
        status: "open",
        createdAt: "2026-10-24T06:30:00.000Z",
      },
    ],
    auditLogs: [
      {
        id: "log-init",
        actor: "system",
        action: "INIT_HYBRID_VAULT",
        detail: "Vault konfigurasi Hybrid, Komunitas & Admin NodataNime siap digunakan.",
        at: "2026-10-24T06:00:00.000Z",
      },
    ],
  };
}

export class AdminStore {
  constructor() {
    this._state = null;
    this._sessions = new Map();
    this._revokedTokens = new Set();
    this._loginAttempts = new Map();
    this._chatRateMap = new Map();
  }

  get state() {
    if (!this._state) {
      this._load();
    }
    return this._state;
  }

  _load() {
    try {
      if (fs.existsSync(ADMIN_STORE_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(ADMIN_STORE_PATH, "utf8"));
        const defaults = createDefaultState();
        this._state = {
          ...defaults,
          ...parsed,
          config: {
            ...defaults.config,
            ...(parsed.config || {}),
            announcement: {
              ...defaults.config.announcement,
              ...(parsed.config?.announcement || {}),
            },
          },
          catalogOverrides: parsed.catalogOverrides || {},
          streamOverrides: parsed.streamOverrides || {},
          communityInfo: Array.isArray(parsed.communityInfo)
            ? parsed.communityInfo
            : defaults.communityInfo,
          communityChat: Array.isArray(parsed.communityChat)
            ? parsed.communityChat
            : defaults.communityChat,
          deletedChatIds: Array.isArray(parsed.deletedChatIds)
            ? parsed.deletedChatIds
            : [],
          brokenReports: Array.isArray(parsed.brokenReports)
            ? parsed.brokenReports
            : defaults.brokenReports,
          auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : defaults.auditLogs,
        };
        return;
      }
    } catch {
      // Gunakan state default bila file belum ada / rusak
    }
    this._state = createDefaultState();
    this._save();
  }

  _save() {
    if (!this._state) return;
    this._state.updatedAt = new Date().toISOString();
    try {
      fs.mkdirSync(path.dirname(ADMIN_STORE_PATH), { recursive: true });
      fs.writeFileSync(ADMIN_STORE_PATH, JSON.stringify(this._state, null, 2), "utf8");
    } catch {
      // Abaikan jika filesystem read-only
    }
  }

  _log(actor, action, detail) {
    this.state.auditLogs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      actor,
      action,
      detail,
      at: new Date().toISOString(),
    });
    this.state.auditLogs = this.state.auditLogs.slice(0, 80);
  }

  /* ===== Auth & Rate Limit ===== */
  checkRateLimit(ip = "unknown") {
    const now = Date.now();
    const windowMs = 10 * 60 * 1000;
    const entry = this._loginAttempts.get(ip);
    if (!entry || now - entry.firstAt > windowMs) {
      return { allowed: true, remaining: 8 };
    }
    if (entry.count >= 8) {
      return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: 8 - entry.count };
  }

  recordFailedAttempt(ip = "unknown") {
    const now = Date.now();
    const windowMs = 10 * 60 * 1000;
    const entry = this._loginAttempts.get(ip);
    if (!entry || now - entry.firstAt > windowMs) {
      this._loginAttempts.set(ip, { count: 1, firstAt: now });
    } else {
      entry.count += 1;
    }
  }

  authenticate(username, password, ip = "unknown") {
    const rate = this.checkRateLimit(ip);
    if (!rate.allowed) {
      const err = new Error("Terlalu banyak percobaan login gagal. Coba lagi dalam 10 menit.");
      err.statusCode = 429;
      throw err;
    }

    const expectedUser =
      process.env.ADMIN_USERNAME ||
      process.env.ADMIN_USER ||
      this.state.auth.username ||
      DEFAULT_ADMIN_USER;
    const validUser = String(username || "").trim() === expectedUser;

    let validPass = false;
    if (process.env.ADMIN_PASSWORD) {
      validPass = String(password || "") === process.env.ADMIN_PASSWORD;
    } else {
      const candidateHash = hashSecret(String(password || ""), this.state.auth.salt);
      const storedBuf = Buffer.from(this.state.auth.passwordHash, "hex");
      const candBuf = Buffer.from(candidateHash, "hex");
      validPass =
        storedBuf.length === candBuf.length && crypto.timingSafeEqual(storedBuf, candBuf);
    }

    if (!validUser || !validPass) {
      this.recordFailedAttempt(ip);
      const err = new Error("Username atau kata sandi Admin tidak valid.");
      err.statusCode = 401;
      throw err;
    }

    this._loginAttempts.delete(ip);
    const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
    const token = signSessionToken({
      u: expectedUser,
      r: "Super Admin",
      exp: expiresAt,
      n: crypto.randomBytes(6).toString("hex"),
    });
    this._sessions.set(token, {
      username: expectedUser,
      role: "Super Admin",
      expiresAt,
    });

    this._log(expectedUser, "ADMIN_LOGIN", "Berhasil masuk ke Admin Panel NodataNime.");
    this._save();

    return {
      token,
      username: expectedUser,
      role: "Super Admin",
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  verifyToken(token = "") {
    if (!token || this._revokedTokens.has(token)) return null;
    const stateless = verifyStatelessSessionToken(token);
    if (stateless) return stateless;

    const session = this._sessions.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this._sessions.delete(token);
      return null;
    }
    return session;
  }

  revokeToken(token = "") {
    if (!token) return;
    this._sessions.delete(token);
    this._revokedTokens.add(token);
    if (this._revokedTokens.size > 500) {
      const first = this._revokedTokens.values().next().value;
      if (first) this._revokedTokens.delete(first);
    }
  }

  /* ===== Public & Hybrid Config ===== */
  getPublicConfig() {
    const { engineMode, announcement } = this.state.config;
    return {
      engineMode,
      announcement,
      overrideCount: Object.keys(this.state.catalogOverrides).length,
      customStreamCount: Object.keys(this.state.streamOverrides).length,
    };
  }

  updateConfig(patch = {}, actor = "admin") {
    const allowedModes = new Set(["hybrid", "live-first", "snapshot-lockdown"]);
    if (patch.engineMode && allowedModes.has(patch.engineMode)) {
      this.state.config.engineMode = patch.engineMode;
    }
    if (patch.announcement && typeof patch.announcement === "object") {
      this.state.config.announcement = {
        enabled: Boolean(patch.announcement.enabled),
        badge: String(patch.announcement.badge || "INFO ADMIN").slice(0, 32),
        text: String(patch.announcement.text || "").slice(0, 220),
        linkSlug: String(patch.announcement.linkSlug || "").trim().slice(0, 120),
      };
    }
    this._log(
      actor,
      "UPDATE_CONFIG",
      `Mode engine: ${this.state.config.engineMode} | Pengumuman: ${this.state.config.announcement.enabled ? "ON" : "OFF"}`
    );
    this._save();
    return this.state.config;
  }

  /* ===== Community Chat & Info Komunitas ===== */
  getCommunityPayload(externalFeed = []) {
    const deletedSet = new Set(this.state.deletedChatIds || []);
    const localMessages = (this.state.communityChat || []).filter((m) => !deletedSet.has(m.id));
    const seenIds = new Set(localMessages.map((m) => m.id));

    const normalizedExternal = (externalFeed || [])
      .filter((m) => m && m.id && !deletedSet.has(m.id) && !seenIds.has(m.id))
      .map((m) => ({
        id: String(m.id),
        nickname: String(m.nickname || "Penonton"),
        message: String(m.message || ""),
        timestamp: Number(m.timestamp || Math.floor(Date.now() / 1000) - 3600),
        isAdmin: Boolean(m.isAdmin),
        replyTo: m.replyTo || null,
      }));

    const messages = [...localMessages, ...normalizedExternal].slice(0, 50);
    const infoItems = [...(this.state.communityInfo || [])].sort(
      (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
    );

    return {
      messages,
      info: infoItems,
      infoItems,
      stats: {
        totalMessages: messages.length,
        totalInfo: infoItems.length,
      },
    };
  }

  addCommunityMessage({ nickname = "", message = "", replyTo = null, isAdmin = false, ip = "unknown" }) {
    const now = Date.now();
    if (!isAdmin) {
      const rate = this._chatRateMap.get(ip);
      if (rate && now - rate.lastPostAt < 2500) {
        const err = new Error("Terlalu cepat mengirim pesan. Tunggu beberapa detik lagi.");
        err.statusCode = 429;
        throw err;
      }
      if (rate && now - rate.windowStart < 60_000) {
        if (rate.count >= 8) {
          const err = new Error("Batas pesan per menit tercapai. Coba sebentar lagi.");
          err.statusCode = 429;
          throw err;
        }
        rate.count += 1;
        rate.lastPostAt = now;
      } else {
        this._chatRateMap.set(ip, { windowStart: now, count: 1, lastPostAt: now });
      }
    }

    const cleanNick = String(nickname || "")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .trim()
      .slice(0, 28);
    const cleanMsg = String(message || "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .trim()
      .slice(0, 280);

    if (cleanNick.length < 2) {
      const err = new Error("Nama panggilan minimal 2 karakter.");
      err.statusCode = 400;
      throw err;
    }
    if (!cleanMsg) {
      const err = new Error("Pesan obrolan tidak boleh kosong.");
      err.statusCode = 400;
      throw err;
    }

    const replySnippet = replyTo
      ? String(replyTo.message || replyTo.snippet || "").slice(0, 80)
      : "";

    const entry = {
      id: `chat-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      nickname: cleanNick,
      message: cleanMsg,
      timestamp: Math.floor(now / 1000),
      isAdmin: Boolean(isAdmin),
      replyTo:
        replyTo && replyTo.nickname
          ? {
              nickname: String(replyTo.nickname || "").slice(0, 28),
              message: replySnippet,
              snippet: replySnippet,
            }
          : null,
    };

    this.state.communityChat.unshift(entry);
    this.state.communityChat = this.state.communityChat.slice(0, 80);
    this._save();
    return entry;
  }

  deleteCommunityMessage(id = "", actor = "admin") {
    const cleanId = String(id || "").trim();
    if (!cleanId) return false;
    this.state.communityChat = (this.state.communityChat || []).filter((m) => m.id !== cleanId);
    if (!this.state.deletedChatIds.includes(cleanId)) {
      this.state.deletedChatIds.push(cleanId);
      this.state.deletedChatIds = this.state.deletedChatIds.slice(-200);
    }
    this._log(actor, "DELETE_CHAT_MSG", `Moderasi hapus pesan obrolan (${cleanId})`);
    this._save();
    return true;
  }

  addCommunityInfo(payload = {}, actor = "admin") {
    const title = String(payload.title || "").trim().slice(0, 120);
    const body = String(payload.body || "").trim().slice(0, 500);
    if (!title || !body) {
      const err = new Error("Judul dan isi Info Komunitas wajib diisi.");
      err.statusCode = 400;
      throw err;
    }

    const item = {
      id: `info-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      category: String(payload.category || "Pengumuman").trim().slice(0, 32),
      title,
      body,
      linkSlug: String(payload.linkSlug || "").trim().slice(0, 120),
      pinned: Boolean(payload.pinned),
      createdAt: new Date().toISOString(),
    };

    this.state.communityInfo.unshift(item);
    this.state.communityInfo = this.state.communityInfo.slice(0, 30);
    this._log(actor, "ADD_COMMUNITY_INFO", `Menambahkan info komunitas "${title}"`);
    this._save();
    return item;
  }

  deleteCommunityInfo(id = "", actor = "admin") {
    const cleanId = String(id || "").trim();
    const before = this.state.communityInfo.length;
    this.state.communityInfo = this.state.communityInfo.filter((x) => x.id !== cleanId);
    if (this.state.communityInfo.length !== before) {
      this._log(actor, "DELETE_COMMUNITY_INFO", `Menghapus info komunitas (${cleanId})`);
      this._save();
      return true;
    }
    return false;
  }

  /* ===== Catalog Override & Custom Anime ===== */
  getCatalogOverridesList() {
    return Object.values(this.state.catalogOverrides).sort((a, b) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
    );
  }

  getCatalogOverride(slug = "") {
    const clean = String(slug || "").trim();
    return this.state.catalogOverrides[clean] || null;
  }

  upsertCatalogOverride(payload = {}, actor = "admin") {
    const rawSlug = String(payload.slug || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\-_~]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    if (!rawSlug || !payload.title) {
      const err = new Error("Slug dan Judul Anime wajib diisi.");
      err.statusCode = 400;
      throw err;
    }

    const existing = this.state.catalogOverrides[rawSlug] || {};
    const genresArr = Array.isArray(payload.genres)
      ? payload.genres
      : String(payload.genres || "")
          .split(",")
          .map((g) => g.trim())
          .filter(Boolean);

    const record = {
      slug: rawSlug,
      title: String(payload.title).trim().slice(0, 160),
      poster: String(payload.poster || existing.poster || "/assets/no-cover.svg").trim(),
      banner: String(payload.banner || payload.poster || existing.banner || "/assets/no-cover.svg").trim(),
      synopsis: String(payload.synopsis ?? existing.synopsis ?? "").trim().slice(0, 1500),
      score: String(payload.score ?? existing.score ?? "8.8").trim().slice(0, 10),
      status: String(payload.status || existing.status || "Ongoing").trim().slice(0, 32),
      type: String(payload.type || existing.type || "TV").trim().slice(0, 24),
      year: String(payload.year || existing.year || "2026").trim().slice(0, 12),
      releaseDay: String(payload.releaseDay ?? existing.releaseDay ?? "").trim().slice(0, 24),
      genres: genresArr.length
        ? genresArr.map((g) =>
            typeof g === "string"
              ? { genreId: g.toLowerCase().replace(/\s+/g, "-"), title: g }
              : g
          )
        : existing.genres || [{ genreId: "action", title: "Action" }],
      pinnedHero: Boolean(payload.pinnedHero ?? existing.pinnedHero ?? false),
      isHidden: Boolean(payload.isHidden ?? existing.isHidden ?? false),
      isLocked: payload.isLocked !== undefined ? Boolean(payload.isLocked) : true,
      updatedAt: new Date().toISOString(),
    };

    this.state.catalogOverrides[rawSlug] = record;
    this._log(
      actor,
      "UPSERT_CATALOG",
      `Menyimpan override katalog "${record.title}" (${rawSlug}) [pinnedHero=${record.pinnedHero}, hidden=${record.isHidden}]`
    );
    this._save();
    return record;
  }

  deleteCatalogOverride(slug = "", actor = "admin") {
    const clean = String(slug || "").trim();
    if (!this.state.catalogOverrides[clean]) return false;
    delete this.state.catalogOverrides[clean];
    this._log(actor, "DELETE_CATALOG_OVERRIDE", `Menghapus override katalog (${clean})`);
    this._save();
    return true;
  }

  /* ===== Episode Stream Mirrors & Custom Episodes ===== */
  getStreamOverridesList() {
    return Object.entries(this.state.streamOverrides).map(([key, val]) => ({
      key,
      ...val,
    }));
  }

  getStreamOverride(seriesSlug = "", episodeId = "") {
    const key = `${String(seriesSlug).trim()}::${String(episodeId).trim()}`;
    return this.state.streamOverrides[key] || null;
  }

  getCustomEpisodesForSeries(seriesSlug = "") {
    const prefix = `${String(seriesSlug).trim()}::`;
    return Object.entries(this.state.streamOverrides)
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => ({
        episodeId: v.episodeId,
        number: Number(v.episodeNumber || 1),
        title: v.episodeTitle || `Episode ${v.episodeNumber || 1}`,
        date: "Admin Mirror HD",
      }));
  }

  upsertStreamOverride(payload = {}, actor = "admin") {
    const seriesSlug = String(payload.seriesSlug || "").trim();
    const episodeId = String(payload.episodeId || "").trim();
    const url = String(payload.url || "").trim();

    if (!seriesSlug || !episodeId || !url) {
      const err = new Error("seriesSlug, episodeId, dan URL stream wajib diisi.");
      err.statusCode = 400;
      throw err;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      const err = new Error("URL stream harus berupa URL http/https yang valid.");
      err.statusCode = 400;
      throw err;
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      const err = new Error("Protokol URL stream harus http atau https.");
      err.statusCode = 400;
      throw err;
    }

    const key = `${seriesSlug}::${episodeId}`;
    const existing = this.state.streamOverrides[key] || {
      seriesSlug,
      episodeId,
      episodeNumber: Number(payload.episodeNumber || 1),
      episodeTitle: String(payload.episodeTitle || `Episode ${payload.episodeNumber || 1}`),
      mirrors: [],
    };

    const resolution = String(payload.resolution || "1080p").trim();
    const provider = String(payload.provider || "Nodata Cloud Mirror").trim().slice(0, 48);
    const streamType = payload.type === "embed" ? "embed" : "mp4";

    const filtered = (existing.mirrors || []).filter((m) => m.url !== url);
    filtered.unshift({
      id: `mir-${Date.now().toString(36)}`,
      resolution,
      provider,
      label: `${provider} (${resolution})`,
      type: streamType,
      url,
      proxyUrl:
        streamType === "mp4"
          ? `/api/anime/stream-proxy?url=${encodeURIComponent(url)}`
          : null,
      addedAt: new Date().toISOString(),
    });

    existing.episodeTitle = String(payload.episodeTitle || existing.episodeTitle);
    existing.episodeNumber = Number(payload.episodeNumber || existing.episodeNumber || 1);
    existing.mirrors = filtered.slice(0, 8);
    existing.updatedAt = new Date().toISOString();

    this.state.streamOverrides[key] = existing;
    this._log(
      actor,
      "UPSERT_STREAM_MIRROR",
      `Menambahkan mirror ${provider} (${resolution}) pada ${seriesSlug} / ${episodeId}`
    );
    this._save();
    return existing;
  }

  deleteStreamOverride(seriesSlug = "", episodeId = "", actor = "admin") {
    const key = `${String(seriesSlug).trim()}::${String(episodeId).trim()}`;
    if (!this.state.streamOverrides[key]) return false;
    delete this.state.streamOverrides[key];
    this._log(actor, "DELETE_STREAM_MIRROR", `Menghapus mirror episode ${key}`);
    this._save();
    return true;
  }

  /* ===== Viewer Broken Link Reports ===== */
  addBrokenReport(payload = {}) {
    const seriesSlug = String(payload.seriesSlug || "").trim().slice(0, 140);
    const episodeId = String(payload.episodeId || "").trim().slice(0, 140);
    if (!seriesSlug || !episodeId) {
      const err = new Error("Data seri dan episode wajib disertakan pada laporan.");
      err.statusCode = 400;
      throw err;
    }

    const report = {
      id: `rep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      seriesSlug,
      episodeId,
      animeTitle: String(payload.animeTitle || seriesSlug).trim().slice(0, 160),
      serverLabel: String(payload.serverLabel || "Default Server").trim().slice(0, 80),
      reason: String(payload.reason || "Video gagal dimuat / buffering terus").trim().slice(0, 260),
      status: "open",
      createdAt: new Date().toISOString(),
    };

    this.state.brokenReports.unshift(report);
    this.state.brokenReports = this.state.brokenReports.slice(0, 100);
    this._save();
    return report;
  }

  updateBrokenReport(id = "", status = "resolved", actor = "admin") {
    const target = this.state.brokenReports.find((r) => r.id === id);
    if (!target) return null;
    if (status === "delete") {
      this.state.brokenReports = this.state.brokenReports.filter((r) => r.id !== id);
      this._log(actor, "DELETE_REPORT", `Menghapus tiket laporan ${id}`);
      this._save();
      return { deleted: true, id };
    }
    target.status = status === "open" ? "open" : "resolved";
    target.resolvedAt = new Date().toISOString();
    this._log(actor, "RESOLVE_REPORT", `Mengubah status tiket ${id} -> ${target.status}`);
    this._save();
    return target;
  }

  getDashboardSnapshot(externalCommunityFeed = []) {
    const community = this.getCommunityPayload(externalCommunityFeed);
    return {
      updatedAt: this.state.updatedAt,
      config: this.state.config,
      counts: {
        catalogOverrides: Object.keys(this.state.catalogOverrides).length,
        pinnedHeroes: Object.values(this.state.catalogOverrides).filter((x) => x.pinnedHero && !x.isHidden).length,
        hiddenTitles: Object.values(this.state.catalogOverrides).filter((x) => x.isHidden).length,
        streamOverrides: Object.keys(this.state.streamOverrides).length,
        openReports: this.state.brokenReports.filter((r) => r.status === "open").length,
        totalReports: this.state.brokenReports.length,
        communityMessages: community.messages.length,
        communityInfo: community.infoItems.length,
      },
      catalogOverrides: this.getCatalogOverridesList(),
      streamOverrides: this.getStreamOverridesList(),
      brokenReports: this.state.brokenReports,
      community,
      auditLogs: this.state.auditLogs.slice(0, 30),
    };
  }
}

export const adminStore = new AdminStore();
