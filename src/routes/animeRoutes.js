import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { animeService } from "../services/animeService.js";
import { communityStore } from "../services/communityStore.js";
import { handleStreamProxy } from "./streamProxy.js";
import { generateVerifiedQrisPayloadAndSvg } from "../utils/qrisSecurity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reaDir = path.resolve(__dirname, "../../docs/rea");
const publicDir = fs.existsSync(path.resolve(__dirname, "../../public"))
  ? path.resolve(__dirname, "../../public")
  : path.resolve(process.cwd(), "public");

const FORBIDDEN_QRIS_INJECTION_PARAMS = [
  "payload",
  "qris",
  "qr",
  "merchant",
  "merchantName",
  "nmid",
  "pan",
  "url",
  "redirect",
  "src",
  "image",
  "poster",
  "callback",
  "svg",
];

const VALID_LIST_TYPES = new Set([
  "ongoing",
  "completed",
  "movie",
  "movies",
  "baru",
  "rekomendasi",
  "hyper",
]);
const VALID_GENRE_ID_REGEX = /^[a-z0-9-]{1,40}$/i;
const VALID_LETTER_REGEX = /^([a-z]|#|0-9)$/i;

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function readScalarParam(val, fallback = "") {
  if (val === undefined || val === null) return fallback;
  if (typeof val !== "string" && typeof val !== "number") {
    throw badRequest("Format parameter kueri tidak valid.");
  }
  return String(val).trim();
}

function parseBoundedPage(rawPage) {
  if (rawPage === undefined || rawPage === null || rawPage === "") return 1;
  if (typeof rawPage !== "string" && typeof rawPage !== "number") {
    throw badRequest("Parameter 'page' harus berupa angka bulat positif.");
  }
  const str = String(rawPage).trim();
  if (!/^\d+$/.test(str)) {
    throw badRequest("Parameter 'page' harus berupa angka bulat antara 1 hingga 500.");
  }
  const n = Number.parseInt(str, 10);
  if (!Number.isSafeInteger(n) || n < 1 || n > 500) {
    throw badRequest("Parameter 'page' di luar batas aman (1-500).");
  }
  return n;
}

function validateSafeIdentifier(raw, fieldName = "slug", maxLen = 180) {
  const str = readScalarParam(raw, "");
  if (!str) return "";
  if (
    str.length > maxLen ||
    /[\u0000-\u001F\u007F\\]/.test(str) ||
    str.includes("..")
  ) {
    throw badRequest(`Parameter '${fieldName}' mengandung karakter atau panjang yang tidak diizinkan.`);
  }
  return str;
}

export function resolveTrustedClientIp(req) {
  if (process.env.VERCEL) {
    const vercelIp = String(
      req.headers["x-vercel-forwarded-for"] || req.headers["x-real-ip"] || ""
    )
      .split(",")[0]
      .trim();
    if (vercelIp) return vercelIp;
  }
  if (process.env.TRUST_PROXY === "1") {
    return String(req.ip || req.socket?.remoteAddress || "unknown").trim();
  }
  return String(req.socket?.remoteAddress || "local").trim();
}

export function assertSameOriginJsonPost(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    const err = new Error("Permintaan tulis wajib menggunakan Content-Type: application/json.");
    err.statusCode = 415;
    throw err;
  }

  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite === "cross-site") {
    const err = new Error("Permintaan lintas situs (cross-site) ditolak oleh kebijakan keamanan CSRF.");
    err.statusCode = 403;
    throw err;
  }

  const origin = req.headers.origin;
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(String(origin)).host.toLowerCase();
    } catch {
      const err = new Error("Header Origin tidak valid.");
      err.statusCode = 403;
      throw err;
    }
    const targetHost = String(req.headers["x-forwarded-host"] || req.headers.host || "")
      .split(",")[0]
      .trim()
      .toLowerCase();
    if (targetHost && originHost !== targetHost) {
      const err = new Error("Origin permintaan tidak sesuai dengan host aplikasi.");
      err.statusCode = 403;
      throw err;
    }
  }
}

function sendOk(res, payload) {
  const { dataSource = "verified-snapshot", ...rest } = payload || {};
  return res.json({
    ok: true,
    statusCode: 200,
    source: dataSource,
    data: rest,
  });
}

export const animeRouter = Router();

animeRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    statusCode: 200,
    data: animeService.getHealth(),
  });
});

animeRouter.get("/support/qris", async (req, res, next) => {
  try {
    // Tolak keras segala percobaan injeksi parameter QR/URL/merchant dari luar (Anti-Quishing & Anti-QR-Swapping)
    for (const forbiddenKey of FORBIDDEN_QRIS_INJECTION_PARAMS) {
      if (Object.prototype.hasOwnProperty.call(req.query, forbiddenKey)) {
        throw badRequest(
          `Parameter '${forbiddenKey}' ditolak oleh sistem proteksi Anti-QR-Injection NodataNime.`
        );
      }
    }

    const unknownKeys = Object.keys(req.query || {}).filter((k) => k !== "amount");
    if (unknownKeys.length > 0) {
      throw badRequest("Hanya parameter 'amount' (nominal Rupiah) yang diizinkan pada endpoint QRIS.");
    }

    const rawAmount = readScalarParam(req.query.amount, "0");
    const verified = await generateVerifiedQrisPayloadAndSvg({
      amount: rawAmount,
      publicDir,
    });

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("X-QRIS-Merchant", verified.merchantName);
    res.setHeader("X-QRIS-NMID", verified.nmid);
    res.setHeader("X-QRIS-CRC16", verified.crc16);

    res.json({
      ok: true,
      statusCode: 200,
      data: verified,
    });
  } catch (err) {
    next(err);
  }
});

animeRouter.get("/community", async (_req, res, next) => {
  try {
    const payload = await animeService.getCommunity();
    res.json({
      ok: true,
      statusCode: 200,
      data: payload,
    });
  } catch (err) {
    next(err);
  }
});

animeRouter.post("/community/messages", (req, res, next) => {
  try {
    assertSameOriginJsonPost(req);
    const ip = resolveTrustedClientIp(req);
    const created = communityStore.addCommunityMessage({
      nickname: req.body?.nickname,
      message: req.body?.message,
      replyTo: req.body?.replyTo || null,
      ip,
    });

    res.status(201).json({
      ok: true,
      statusCode: 201,
      data: created,
    });
  } catch (err) {
    next(err);
  }
});

animeRouter.get("/anime", (_req, res) => {
  res.json({
    ok: true,
    statusCode: 200,
    service: "NodataNime Scraper REST API",
    target: "https://ylnime.com",
    endpoints: [
      { method: "GET", path: "/api/anime/home", description: "Beranda lengkap (Banner, Top Anime, Baru Rilis, Sedang Tayang, Genre)" },
      { method: "GET", path: "/api/anime/list?type=ongoing&page=1", description: "Katalog per kategori (ongoing, completed, movie, baru, rekomendasi, hyper)" },
      { method: "GET", path: "/api/anime/az?letter=A&page=1", description: "Indeks lengkap anime berdasarkan huruf (#, A-Z)" },
      { method: "GET", path: "/api/anime/search?q=isekai", description: "Pencarian anime cepat (live + katalog A-Z)" },
      { method: "GET", path: "/api/anime/genres", description: "Daftar 28 genre anime YLnime" },
      { method: "GET", path: "/api/anime/genre/:genreId?page=1", description: "Daftar anime berdasarkan genre" },
      { method: "GET", path: "/api/anime/jadwal", description: "Jadwal rilis mingguan (Sabtu s/d Jumat)" },
      { method: "GET", path: "/api/anime/detail/:slug", description: "Detail lengkap anime & daftar episode" },
      { method: "GET", path: "/api/anime/episode?series=:slug&episode=:epId", description: "Multi-resolusi & multi-server stream video (yl_ep_json=1)" },
      { method: "GET", path: "/api/anime/stream-proxy?url=:encodedUrl", description: "HTTP 206 Range video proxy dengan Referer otomatis & proteksi SSRF berlapis" },
      { method: "GET", path: "/api/rea/evidence", description: "Laporan Reverse-Engineering & Obligation Ledger REA" },
    ],
  });
});

animeRouter.get("/anime/home", async (_req, res, next) => {
  try {
    sendOk(res, await animeService.getHome());
  } catch (err) {
    next(err);
  }
});

animeRouter.get("/anime/list", async (req, res, next) => {
  try {
    const rawType = readScalarParam(req.query.type, "ongoing").toLowerCase();
    if (!VALID_LIST_TYPES.has(rawType)) {
      throw badRequest("Kategori 'type' tidak dikenali.");
    }
    const normalizedType = rawType === "movies" ? "movie" : rawType;
    const page = parseBoundedPage(req.query.page);
    sendOk(res, await animeService.getList(normalizedType, page));
  } catch (err) {
    next(err);
  }
});

animeRouter.get("/anime/ongoing", async (req, res, next) => {
  try {
    sendOk(res, await animeService.getList("ongoing", parseBoundedPage(req.query.page)));
  } catch (err) {
    next(err);
  }
});

animeRouter.get("/anime/completed", async (req, res, next) => {
  try {
    sendOk(res, await animeService.getList("completed", parseBoundedPage(req.query.page)));
  } catch (err) {
    next(err);
  }
});

animeRouter.get("/anime/movies", async (req, res, next) => {
  try {
    sendOk(res, await animeService.getList("movie", parseBoundedPage(req.query.page)));
  } catch (err) {
    next(err);
  }
});

animeRouter.get("/anime/az", async (req, res, next) => {
  try {
    const letter = readScalarParam(req.query.letter ?? req.query.l, "A");
    if (!VALID_LETTER_REGEX.test(letter)) {
      throw badRequest("Parameter 'letter' harus berupa huruf A-Z atau '#'.");
    }
    const page = parseBoundedPage(req.query.page);
    sendOk(res, await animeService.getAz(letter, page));
  } catch (err) {
    next(err);
  }
});

animeRouter.get("/anime/search", async (req, res, next) => {
  try {
    const rawQ = readScalarParam(req.query.q ?? req.query.search ?? req.query.keyword, "");
    if (!rawQ) {
      return res.status(400).json({
        ok: false,
        statusCode: 400,
        message: "Parameter pencarian 'q' wajib diisi.",
      });
    }
    if (rawQ.length > 100 || /[\u0000-\u001F\u007F]/.test(rawQ)) {
      throw badRequest("Panjang kata kunci pencarian maksimal 100 karakter tanpa karakter kontrol.");
    }
    sendOk(res, await animeService.search(rawQ));
  } catch (err) {
    next(err);
  }
});

animeRouter.get("/anime/genres", async (_req, res, next) => {
  try {
    sendOk(res, await animeService.getGenres());
  } catch (err) {
    next(err);
  }
});

animeRouter.get("/anime/genre", async (req, res, next) => {
  try {
    const genreId = readScalarParam(req.query.g ?? req.query.genre, "action").toLowerCase();
    if (!VALID_GENRE_ID_REGEX.test(genreId)) {
      throw badRequest("Parameter 'genre' tidak valid.");
    }
    const page = parseBoundedPage(req.query.page);
    sendOk(res, await animeService.getByGenre(genreId, page));
  } catch (err) {
    next(err);
  }
});

animeRouter.get("/anime/genre/:genreId", async (req, res, next) => {
  try {
    const genreId = readScalarParam(req.params.genreId, "").toLowerCase();
    if (!VALID_GENRE_ID_REGEX.test(genreId)) {
      throw badRequest("Parameter 'genreId' tidak valid.");
    }
    const page = parseBoundedPage(req.query.page);
    sendOk(res, await animeService.getByGenre(genreId, page));
  } catch (err) {
    next(err);
  }
});

const scheduleHandler = async (_req, res, next) => {
  try {
    sendOk(res, await animeService.getSchedule());
  } catch (err) {
    next(err);
  }
};
animeRouter.get("/anime/jadwal", scheduleHandler);
animeRouter.get("/anime/schedule", scheduleHandler);

animeRouter.get("/anime/detail", async (req, res, next) => {
  try {
    const slug = validateSafeIdentifier(req.query.slug ?? req.query.series, "slug", 180);
    if (!slug) {
      return res.status(400).json({
        ok: false,
        statusCode: 400,
        message: "Parameter 'slug' wajib diisi.",
      });
    }
    const detail = await animeService.getDetail(slug);
    if (!detail) {
      return res.status(404).json({
        ok: false,
        statusCode: 404,
        message: "Judul anime tidak ditemukan.",
      });
    }
    sendOk(res, detail);
  } catch (err) {
    next(err);
  }
});

animeRouter.get("/anime/detail/:slug", async (req, res, next) => {
  try {
    const slug = validateSafeIdentifier(req.params.slug, "slug", 180);
    const detail = await animeService.getDetail(slug);
    if (!detail) {
      return res.status(404).json({
        ok: false,
        statusCode: 404,
        message: "Judul anime tidak ditemukan.",
      });
    }
    sendOk(res, detail);
  } catch (err) {
    next(err);
  }
});

const episodeHandler = async (req, res, next) => {
  try {
    const token = validateSafeIdentifier(req.params.token ?? req.query.token, "token", 260);
    const series = validateSafeIdentifier(req.query.series ?? req.query.slug, "series", 180);
    const episode = validateSafeIdentifier(req.query.episode, "episode", 180);
    const rawEp = req.query.ep;
    let ep = null;
    if (rawEp !== undefined && rawEp !== null && rawEp !== "") {
      const epStr = readScalarParam(rawEp, "");
      if (!/^\d{1,5}$/.test(epStr)) {
        throw badRequest("Parameter 'ep' harus berupa nomor episode numerik.");
      }
      ep = Number.parseInt(epStr, 10);
    }

    if (!token && !series && !episode) {
      return res.status(400).json({
        ok: false,
        statusCode: 400,
        message: "Parameter 'series' & 'episode' (atau 'ep' / 'token') wajib diisi.",
      });
    }

    const result = await animeService.getEpisode({ token, series, episode, ep });
    sendOk(res, result);
  } catch (err) {
    next(err);
  }
};

animeRouter.get("/anime/episode", episodeHandler);
animeRouter.get("/anime/episode/:token", episodeHandler);
animeRouter.get("/anime/streams", episodeHandler);

animeRouter.get("/anime/stream-proxy", handleStreamProxy);

animeRouter.get("/rea/evidence", (_req, res) => {
  let obligationLedger = {};
  let staticAnalysisSummary = null;

  try {
    obligationLedger = JSON.parse(
      fs.readFileSync(path.join(reaDir, "obligation-ledger.json"), "utf8")
    );
  } catch {
    obligationLedger = {};
  }

  try {
    const bundlePath = path.join(reaDir, "nodatanime-rea-evidence.json");
    if (fs.existsSync(bundlePath)) {
      staticAnalysisSummary = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
    }
  } catch {
    staticAnalysisSummary = null;
  }

  res.json({
    ok: true,
    statusCode: 200,
    data: {
      methodology: "morluto/rea — reverse-engineer-anything v46",
      target: "https://ylnime.com",
      obligationLedger,
      staticAnalysisSummary,
      targetEndpointsMapped: [
        { source: "GET /index.php", mappedTo: "GET /api/anime/home", evidence: "OBSERVED" },
        { source: "GET /ongoing.php, /completed.php, /movies.php, /baru.php, /rekomendasi.php, /hyper.php", mappedTo: "GET /api/anime/list?type=...", evidence: "OBSERVED" },
        { source: "GET /anime-list.php?l=A..Z", mappedTo: "GET /api/anime/az?letter=...", evidence: "OBSERVED" },
        { source: "GET /index.php?search=...", mappedTo: "GET /api/anime/search?q=...", evidence: "OBSERVED" },
        { source: "GET /genre.php & /genre.php?g=...", mappedTo: "GET /api/anime/genres & /api/anime/genre/:id", evidence: "OBSERVED" },
        { source: "GET /jadwals.php", mappedTo: "GET /api/anime/jadwal", evidence: "OBSERVED" },
        { source: "GET /index.php?series=...", mappedTo: "GET /api/anime/detail/:slug", evidence: "OBSERVED" },
        { source: "GET /index.php?yl_ep_json=1&episode=...&series=...&reso=...", mappedTo: "GET /api/anime/episode", evidence: "OBSERVED" },
        { source: "CDN s3.animeverse.id & sjkt.animekita.org MP4", mappedTo: "GET /api/anime/stream-proxy", evidence: "OBSERVED" },
      ],
    },
  });
});
