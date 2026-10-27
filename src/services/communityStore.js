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

function createSeedState() {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    version: 1,
    communityInfo: [
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
        return {
          ...seed,
          communityInfo:
            Array.isArray(parsed.communityInfo) && parsed.communityInfo.length > 0
              ? parsed.communityInfo
              : seed.communityInfo,
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

  getCommunityPayload(externalFeed = []) {
    const localMessages = this.state.communityChat || [];
    const seenIds = new Set(localMessages.map((m) => m.id));

    const normalizedExternal = (externalFeed || [])
      .filter((m) => m && m.id && !seenIds.has(m.id))
      .map((m) => ({
        id: String(m.id),
        nickname: String(m.nickname || "Penonton"),
        message: String(m.message || ""),
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
    const now = Date.now();
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
}

export const communityStore = new CommunityStore();
