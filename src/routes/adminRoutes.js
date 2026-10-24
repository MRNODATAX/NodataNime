import { Router } from "express";
import { adminStore } from "../services/adminStore.js";
import { animeService } from "../services/animeService.js";
import { appCache } from "../utils/cache.js";
import { resolveRefererForHost } from "./streamProxy.js";

export const adminRouter = Router();

function extractToken(req) {
  const authHeader = String(req.headers.authorization || "");
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return String(req.headers["x-admin-token"] || "").trim();
}

function requireAdmin(req, res, next) {
  const token = extractToken(req);
  const session = adminStore.verifyToken(token);
  if (!session) {
    return res.status(401).json({
      ok: false,
      statusCode: 401,
      message: "Sesi Admin tidak valid atau telah berakhir. Silakan login kembali.",
    });
  }
  req.adminSession = session;
  next();
}

function isSafeExternalProbeUrl(rawUrl = "") {
  try {
    const parsed = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
      host === "[::1]"
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

adminRouter.post("/login", (req, res, next) => {
  try {
    const { username = "", password = "" } = req.body || {};
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const session = adminStore.authenticate(username, password, ip);
    res.json({
      ok: true,
      statusCode: 200,
      data: session,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/logout", (req, res) => {
  const token = extractToken(req);
  adminStore.revokeToken(token);
  res.json({ ok: true, statusCode: 200, data: { loggedOut: true } });
});

adminRouter.get("/me", requireAdmin, (req, res) => {
  res.json({
    ok: true,
    statusCode: 200,
    data: req.adminSession,
  });
});

adminRouter.get("/dashboard", requireAdmin, async (_req, res, next) => {
  try {
    const comm = await animeService.getCommunity();
    res.json({
      ok: true,
      statusCode: 200,
      data: {
        health: animeService.getHealth(),
        vault: adminStore.getDashboardSnapshot(comm.messages),
      },
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/community/info", requireAdmin, (req, res, next) => {
  try {
    const created = adminStore.addCommunityInfo(req.body || {}, req.adminSession.username);
    res.status(201).json({
      ok: true,
      statusCode: 201,
      data: created,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/community/info/:id", requireAdmin, (req, res) => {
  const deleted = adminStore.deleteCommunityInfo(req.params.id, req.adminSession.username);
  res.json({
    ok: true,
    statusCode: 200,
    data: { deleted },
  });
});

adminRouter.post("/community/messages", requireAdmin, (req, res, next) => {
  try {
    const created = adminStore.addCommunityMessage({
      nickname: req.body?.nickname || req.adminSession.username || "Admin NodataNime",
      message: req.body?.message || "",
      replyTo: req.body?.replyTo || null,
      isAdmin: true,
      ip: req.ip || "admin",
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

adminRouter.delete("/community/messages/:id", requireAdmin, (req, res) => {
  const deleted = adminStore.deleteCommunityMessage(req.params.id, req.adminSession.username);
  res.json({
    ok: true,
    statusCode: 200,
    data: { deleted },
  });
});

adminRouter.put("/config", requireAdmin, (req, res) => {
  const updated = adminStore.updateConfig(req.body || {}, req.adminSession.username);
  appCache.clear();
  res.json({
    ok: true,
    statusCode: 200,
    data: updated,
  });
});

adminRouter.post("/cache/clear", requireAdmin, (_req, res) => {
  appCache.clear();
  res.json({
    ok: true,
    statusCode: 200,
    data: { cleared: true, stats: appCache.getStats() },
  });
});

adminRouter.post("/catalog", requireAdmin, (req, res, next) => {
  try {
    const saved = adminStore.upsertCatalogOverride(req.body || {}, req.adminSession.username);
    appCache.clear();
    res.json({
      ok: true,
      statusCode: 200,
      data: saved,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/catalog/:slug", requireAdmin, (req, res) => {
  const ok = adminStore.deleteCatalogOverride(req.params.slug, req.adminSession.username);
  appCache.clear();
  res.json({
    ok: true,
    statusCode: 200,
    data: { deleted: ok, slug: req.params.slug },
  });
});

adminRouter.post("/streams", requireAdmin, (req, res, next) => {
  try {
    const saved = adminStore.upsertStreamOverride(req.body || {}, req.adminSession.username);
    appCache.clear();
    res.json({
      ok: true,
      statusCode: 200,
      data: saved,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/streams", requireAdmin, (req, res) => {
  const seriesSlug = String(req.query.seriesSlug || req.body?.seriesSlug || "");
  const episodeId = String(req.query.episodeId || req.body?.episodeId || "");
  const ok = adminStore.deleteStreamOverride(seriesSlug, episodeId, req.adminSession.username);
  appCache.clear();
  res.json({
    ok: true,
    statusCode: 200,
    data: { deleted: ok },
  });
});

adminRouter.patch("/reports/:id", requireAdmin, (req, res) => {
  const action = String(req.body?.status || "resolved");
  const updated = adminStore.updateBrokenReport(
    req.params.id,
    action,
    req.adminSession.username
  );
  if (!updated) {
    return res.status(404).json({
      ok: false,
      statusCode: 404,
      message: "Tiket laporan tidak ditemukan.",
    });
  }
  res.json({
    ok: true,
    statusCode: 200,
    data: updated,
  });
});

adminRouter.post("/probe-stream", requireAdmin, async (req, res) => {
  const url = String(req.body?.url || "").trim();
  if (!isSafeExternalProbeUrl(url)) {
    return res.status(400).json({
      ok: false,
      statusCode: 400,
      message: "URL tidak valid atau dilarang untuk pemeriksaan jaringan eksternal.",
    });
  }

  const startedAt = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Range: "bytes=0-1",
        Referer: resolveRefererForHost(url),
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    res.json({
      ok: true,
      statusCode: 200,
      data: {
        reachable: resp.ok || resp.status === 206,
        httpStatus: resp.status,
        contentType: resp.headers.get("content-type") || "unknown",
        acceptRanges: resp.headers.get("accept-ranges") || "none",
        latencyMs: Date.now() - startedAt,
      },
    });
  } catch (err) {
    res.json({
      ok: true,
      statusCode: 200,
      data: {
        reachable: false,
        httpStatus: 0,
        reason: err?.message || "Outbound jaringan dibatasi atau server target timeout.",
        latencyMs: Date.now() - startedAt,
      },
    });
  }
});
