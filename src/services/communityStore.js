import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : IS_SERVERLESS
    ? path.join(os.tmpdir(), "nodatanime-data")
    : path.resolve(__dirname, "../../data");

const COMMUNITY_STORE_PATH = path.join(DATA_DIR, "community-store.json");
const MAX_RATE_ENTRIES = 2000;
const RATE_WINDOW_MS = 60_000;
const MIN_POST_COOLDOWN_MS = 2500;
const MAX_PER_IP_PER_MINUTE = 8;
const MAX_GLOBAL_PER_MINUTE = 30;

const RESERVED_NICK_REGEX =
  /^(nodatanime(?:\s*bot|\s*official|\s*staff|\s*team|\s*admin)?|admin(?:istrator)?|moderator|mod|official|system|root|staff)$/i;

function sanitizeText(raw = "", maxLen = 280) {
  return String(raw ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function createSeedState() {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    version: 1,
    communityInfo: [
      {
        id: "info-admin-tg-00",
        category: "Hubungi Admin",
        title: "Lapor Kendala, Bug & Request Fitur: Telegram @nodata_store",
        body: "Menemukan kendala video/server, tampilan eror, bug, atau ingin request fitur & anime baru? Gunakan menu Hubungi Admin atau chat langsung Telegram resmi https://telegram.me/nodata_store.",
        linkSlug: "",
        pinned: true,
        createdAt: "2026-10-27T09:00:00.000Z",
      },
      {
        id: "info-qris-00",
        category: "Penyemangat Admin",
        title: "QRIS Resmi NodataNime: NODATASHOP (ID1025451509315)",
        body: "Nonton lancar tanpa iklan pop-up? Kamu bisa traktir kopi Admin lewat tombol Traktir Kopi (QRIS). Demi keamanan, selalu pastikan nama merchant yang muncul di m-banking/e-wallet adalah NODATASHOP dengan NMID ID1025451509315.",
        linkSlug: "",
        pinned: true,
        createdAt: "2026-10-27T07:30:00.000Z",
      },
      {
        id: "info-pwa-01",
        category: "Aplikasi PWA",
        title: "NodataNime Kini Tersedia Sebagai Aplikasi (PWA)",
        body: "Pasang NodataNime langsung ke layar utama HP atau desktop kamu melalui tombol Aplikasi di atas atau menu Lainnya -> Install Aplikasi.",
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
        body: "Jadwal rilis diperbarui otomatis setiap hari (Sabtu–Jumat WIB). Gunakan menu Koleksi untuk menyimpan anime yang sedang kamu ikuti.",
        linkSlug: "bleach-kashin-tan-sub-indo",
        pinned: false,
        createdAt: "2026-10-24T06:00:00.000Z",
      },
    ],
    communityChat: [
      {
        id: "chat-seed-welcome",
        nickname: "NodataNime Bot",
        message: "Selamat datang di ruang obrolan komunitas NodataNime! Silakan berdiskusi santai seputar episode anime terbaru.",
        timestamp: nowSec - 1800,
        replyTo: null,
      },
    ],
  };
}

export class CommunityStore {
  constructor() {
    this._state = null;
    this._chatRateMap = new Map();
    this._globalWindowStart = 0;
    this._globalWindowCount = 0;
  }

  get state() {
    if (!this._state) {
      this._state = this._load();
    }
    return this._state;
  }

  _load() {
    const seed = createSeedState();
    try {
      if (fs.existsSync(COMMUNITY_STORE_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(COMMUNITY_STORE_PATH, "utf8"));
        const existingInfo = Array.isArray(parsed.communityInfo) ? parsed.communityInfo : [];
        const existingInfoIds = new Set(existingInfo.map((item) => item?.id).filter(Boolean));
        const mergedInfo =
          existingInfo.length > 0
            ? [
                ...seed.communityInfo.filter((item) => !existingInfoIds.has(item.id)),
                ...existingInfo,
              ]
            : seed.communityInfo;
        return {
          ...seed,
          communityInfo: mergedInfo,
          communityChat:
            Array.isArray(parsed.communityChat) && parsed.communityChat.length > 0
              ? parsed.communityChat
              : seed.communityChat,
        };
      }
    } catch {
      // Gunakan seed memori apabila direktori bersifat sementara / belum ada
    }
    return seed;
  }

  _save() {
    if (!this._state) return;
    try {
      fs.mkdirSync(path.dirname(COMMUNITY_STORE_PATH), { recursive: true });
      fs.writeFileSync(COMMUNITY_STORE_PATH, JSON.stringify(this._state, null, 2), "utf8");
    } catch {
      // Aman diabaikan pada lingkungan read-only; state tetap tersimpan di memori
    }
  }

  _pruneRateMap(now) {
    if (this._chatRateMap.size < MAX_RATE_ENTRIES / 2) return;
    for (const [key, entry] of this._chatRateMap.entries()) {
      if (now - entry.windowStart >= RATE_WINDOW_MS) {
        this._chatRateMap.delete(key);
      }
    }
    while (this._chatRateMap.size >= MAX_RATE_ENTRIES) {
      const oldestKey = this._chatRateMap.keys().next().value;
      if (oldestKey === undefined) break;
      this._chatRateMap.delete(oldestKey);
    }
  }

  getCommunityPayload(externalFeed = []) {
    const localMessages = this.state.communityChat || [];
    const seenIds = new Set(localMessages.map((m) => m.id));

    const normalizedExternal = (externalFeed || [])
      .filter((m) => m && m.id && !seenIds.has(m.id))
      .map((m) => ({
        id: sanitizeText(m.id, 64),
        nickname: sanitizeText(m.nickname || "Penonton", 28) || "Penonton",
        message: sanitizeText(m.message || "", 280),
        timestamp: Number(m.timestamp || Math.floor(Date.now() / 1000) - 3600),
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

  addCommunityMessage({ nickname = "", message = "", replyTo = null, ip = "unknown" }) {
    if (typeof nickname !== "string" && typeof nickname !== "number") {
      const err = new Error("Format nama panggilan tidak valid.");
      err.statusCode = 400;
      throw err;
    }
    if (typeof message !== "string" && typeof message !== "number") {
      const err = new Error("Format pesan obrolan tidak valid.");
      err.statusCode = 400;
      throw err;
    }

    const cleanNick = sanitizeText(nickname, 28);
    const cleanMsg = sanitizeText(message, 280);

    if (cleanNick.length < 2) {
      const err = new Error("Nama panggilan minimal 2 karakter.");
      err.statusCode = 400;
      throw err;
    }
    if (RESERVED_NICK_REGEX.test(cleanNick)) {
      const err = new Error(
        "Nama panggilan tersebut dilindungi oleh sistem NodataNime. Gunakan nama panggilan lain."
      );
      err.statusCode = 400;
      throw err;
    }
    if (!cleanMsg) {
      const err = new Error("Pesan obrolan tidak boleh kosong.");
      err.statusCode = 400;
      throw err;
    }

    const now = Date.now();
    const safeIp = sanitizeText(ip || "unknown", 64) || "unknown";
    this._pruneRateMap(now);

    if (now - this._globalWindowStart >= RATE_WINDOW_MS) {
      this._globalWindowStart = now;
      this._globalWindowCount = 0;
    }
    if (this._globalWindowCount >= MAX_GLOBAL_PER_MINUTE) {
      const err = new Error("Lalu lintas obrolan komunitas sedang padat. Coba sebentar lagi.");
      err.statusCode = 429;
      throw err;
    }

    const rate = this._chatRateMap.get(safeIp);
    if (rate && now - rate.lastPostAt < MIN_POST_COOLDOWN_MS) {
      const err = new Error("Terlalu cepat mengirim pesan. Tunggu beberapa detik lagi.");
      err.statusCode = 429;
      throw err;
    }
    if (rate && now - rate.windowStart < RATE_WINDOW_MS) {
      if (rate.count >= MAX_PER_IP_PER_MINUTE) {
        const err = new Error("Batas pesan per menit tercapai. Coba sebentar lagi.");
        err.statusCode = 429;
        throw err;
      }
      rate.count += 1;
      rate.lastPostAt = now;
    } else {
      this._chatRateMap.set(safeIp, { windowStart: now, count: 1, lastPostAt: now });
    }
    this._globalWindowCount += 1;

    let normalizedReply = null;
    if (replyTo && typeof replyTo === "object" && !Array.isArray(replyTo)) {
      const replyNick = sanitizeText(replyTo.nickname || "", 28);
      const replySnippet = sanitizeText(replyTo.message || replyTo.snippet || "", 80);
      if (replyNick) {
        normalizedReply = {
          nickname: replyNick,
          message: replySnippet,
          snippet: replySnippet,
        };
      }
    }

    const entry = {
      id: `chat-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      nickname: cleanNick,
      message: cleanMsg,
      timestamp: Math.floor(now / 1000),
      replyTo: normalizedReply,
    };

    this.state.communityChat.unshift(entry);
    this.state.communityChat = this.state.communityChat.slice(0, 80);
    this._save();
    return entry;
  }
}

export const communityStore = new CommunityStore();
