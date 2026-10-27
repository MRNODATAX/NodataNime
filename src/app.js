import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import compression from "compression";
import { animeRouter } from "./routes/animeRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use((req, _res, next) => {
    if (req.url && req.url.includes("__vpath=")) {
      req.url = normalizeVercelRequestUrl(req.url);
    }
    next();
  });

  // Mengizinkan semua host & origin untuk domain produksi, PWA, dan Live Preview
  app.use(
    cors({
      origin: true,
      credentials: false,
    })
  );
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));

  // Header keamanan ringan tanpa memblokir iframe Live Preview
  app.use((_req, res, next) => {
    res.removeHeader("X-Frame-Options");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
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

  // 404 khusus endpoint /api/* yang tidak dikenal
  app.use("/api/*", (req, res) => {
    res.status(404).json({
      ok: false,
      statusCode: 404,
      message: `Endpoint API tidak ditemukan: ${req.originalUrl}`,
    });
  });

  // Sajikan App Shell HTML (`views/index.html`) untuk `/`, `/index.html`, dan seluruh rute SPA
  // tanpa bentrok static/index.html vs functions/index.func di Vercel Express
  app.get("*", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=UTF-8");
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    res.status(200).send(indexHtmlContent);
  });

  // Penanganan error global
  app.use((err, _req, res, _next) => {
    const status = Number(err?.statusCode) || 500;
    res.status(status).json({
      ok: false,
      statusCode: status,
      message: err?.message || "Terjadi kesalahan internal pada server NodataNime.",
    });
  });

  return app;
}

// Default export instance Express untuk runtime resmi `@vercel/express`
const app = createApp();
export default app;
