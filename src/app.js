import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import compression from "compression";
import { animeRouter } from "./routes/animeRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const APP_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' https: http: data: blob:",
  "media-src 'self' https: http: blob:",
  "frame-src https:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self' https://*.e2b.app https://*.arena.ai https://arena.ai",
].join("; ");

export const APP_PERMISSIONS_POLICY =
  "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()";

function resolveExistingPath(candidates) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

const publicDir = resolveExistingPath([
  path.join(__dirname, "../public"),
  path.join(process.cwd(), "public"),
  path.join(__dirname, "../../public"),
]);
const indexHtmlPath = resolveExistingPath([
  path.join(__dirname, "../views/index.html"),
  path.join(process.cwd(), "views/index.html"),
  path.join(__dirname, "../../views/index.html"),
]);
const indexHtmlContent = fs.readFileSync(indexHtmlPath, "utf8");

/**
 * Menormalkan path request apabila proxy/rewrite meneruskan query `__vpath`.
 */
export function normalizeVercelRequestUrl(rawUrl = "/") {
  const parsed = new URL(rawUrl, "http://vercel.internal");
  const vpath = parsed.searchParams.get("__vpath");
  if (vpath !== null) {
    parsed.searchParams.delete("__vpath");
    const cleanSubpath = String(vpath).replace(/^\/+/, "");
    const qs = parsed.searchParams.toString();
    return `/api/${cleanSubpath}${qs ? `?${qs}` : ""}`;
  }
  return `${parsed.pathname}${parsed.search}`;
}

const readOnlyCors = cors({
  origin: true,
  methods: ["GET", "HEAD", "OPTIONS"],
  credentials: false,
});

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  if (process.env.VERCEL || process.env.TRUST_PROXY === "1") {
    app.set("trust proxy", 1);
  }

  app.use((req, _res, next) => {
    if (req.url && req.url.includes("__vpath=")) {
      req.url = normalizeVercelRequestUrl(req.url);
    }
    next();
  });

  // Izinkan CORS lintas-origin hanya untuk operasi baca (GET/HEAD/OPTIONS); blokir refleksi CORS pada POST/PUT/DELETE
  app.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      return readOnlyCors(req, res, next);
    }
    return next();
  });

  app.use(compression());
  app.use(express.json({ limit: "16kb", strict: true }));

  // Header keamanan berlapis (tetap mengizinkan penyematan iframe Live Preview melalui frame-ancestors)
  app.use((_req, res, next) => {
    res.removeHeader("X-Frame-Options");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", APP_CONTENT_SECURITY_POLICY);
    res.setHeader("Permissions-Policy", APP_PERMISSIONS_POLICY);
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    next();
  });

  app.use("/api", animeRouter);

  app.use(
    express.static(publicDir, {
      etag: true,
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".webmanifest")) {
          res.setHeader("Content-Type", "application/manifest+json; charset=UTF-8");
          res.setHeader("Cache-Control", "no-cache, must-revalidate");
        } else if (filePath.endsWith("sw.js")) {
          res.setHeader("Service-Worker-Allowed", "/");
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        } else if (/\.(html|css|js)$/i.test(filePath)) {
          res.setHeader("Cache-Control", "no-cache, must-revalidate");
        } else {
          res.setHeader("Cache-Control", "public, max-age=86400");
        }
      },
    })
  );

  // 404 khusus endpoint /api/* yang tidak dikenal (tanpa merefleksikan kueri panjang)
  app.use("/api/*", (req, res) => {
    const safePath = String(req.path || "").slice(0, 120);
    res.status(404).json({
      ok: false,
      statusCode: 404,
      message: `Endpoint API tidak ditemukan: /api${safePath}`,
    });
  });

  // Sajikan App Shell HTML (`views/index.html`) untuk `/`, `/index.html`, dan seluruh rute SPA
  app.get("*", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=UTF-8");
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    res.status(200).send(indexHtmlContent);
  });

  // Penanganan error global tanpa membocorkan detail internal pada error >= 500
  app.use((err, _req, res, _next) => {
    const rawStatus = Number(err?.statusCode || err?.status) || 500;
    const status = rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
    const safeMessage =
      status < 500 && err?.message
        ? String(err.message)
        : "Terjadi kesalahan internal pada server NodataNime.";
    res.status(status).json({
      ok: false,
      statusCode: status,
      message: safeMessage,
    });
  });

  return app;
}

// Default export instance Express untuk runtime resmi `@vercel/express`
const app = createApp();
export default app;
