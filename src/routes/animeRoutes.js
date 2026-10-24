import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { animeService } from "../services/animeService.js";
import { adminStore } from "../services/adminStore.js";
import { handleStreamProxy } from "./streamProxy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reaDir = path.resolve(__dirname, "../../docs/rea");

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

animeRouter.get("/config/public", (_req, res) => {
  res.json({
    ok: true,
    statusCode: 200,
    data: adminStore.getPublicConfig(),
  });
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
    const authHeader = String(req.headers.authorization || "");
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    const adminSession = adminStore.verifyToken(token);
    const ip = req.ip || req.socket?.remoteAddress || "unknown";

    const created = adminStore.addCommunityMessage({
      nickname: req.body?.nickname,
      message: req.body?.message,
      replyTo: req.body?.replyTo || null,
      isAdmin: Boolean(adminSession),
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

animeRouter.post("/anime/report", (req, res, next) => {
  try {
    const saved = adminStore.addBrokenReport(req.body || {});
    res.status(201).json({
      ok: true,
      statusCode: 201,
      data: saved,
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
      { method: "GET", path: "/api/anime/stream-proxy?url=:encodedUrl", description: "HTTP 206 Range video proxy dengan Referer otomatis" },
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
    const type = String(req.query.type || "ongoing");
    const page = Number(req.query.page || 1);
    sendOk(res, await animeService.getList(type, page));
  } catch (err) {
    next(err);
  }
});

animeRouter.get("/anime/ongoing", async (req, res, next) => {
  try {
    sendOk(res, await animeService.getList("ongoing", Number(req.query.page || 1)));
  } catch (err) {
    next(err);
  }
});

animeRouter.get("/anime/completed", async (req, res, next) => {
  try {
    sendOk(res, await animeService.getList("completed", Number(req.query.page || 1)));
  } catch (err) {
    next(err);
  }
});

animeRouter.get("/anime/movies", async (req, res, next) => {
  try {
    sendOk(res, await animeService.getList("movie", Number(req.query.page || 1)));
  } catch (err) {
    next(err);
  }
});

animeRouter.get("/anime/az", async (req, res, next) => {
  try {
    const letter = String(req.query.letter || req.query.l || "A");
    const page = Number(req.query.page || 1);
    sendOk(res, await animeService.getAz(letter, page));
  } catch (err) {
    next(err);
  }
});

animeRouter.get("/anime/search", async (req, res, next) => {
  try {
    const q = String(req.query.q || req.query.search || req.query.keyword || "").trim();
    if (!q) {
      return res.status(400).json({
        ok: false,
        statusCode: 400,
        message: "Parameter pencarian 'q' wajib diisi.",
      });
    }
    sendOk(res, await animeService.search(q));
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
    const genreId = String(req.query.g || req.query.genre || "action");
    const page = Number(req.query.page || 1);
    sendOk(res, await animeService.getByGenre(genreId, page));
  } catch (err) {
    next(err);
  }
});

animeRouter.get("/anime/genre/:genreId", async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    sendOk(res, await animeService.getByGenre(req.params.genreId, page));
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
    const slug = String(req.query.slug || req.query.series || "").trim();
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
    const detail = await animeService.getDetail(req.params.slug);
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
    const token = String(req.params.token || req.query.token || "").trim();
    const series = String(req.query.series || req.query.slug || "").trim();
    const episode = String(req.query.episode || "").trim();
    const ep = req.query.ep;

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
