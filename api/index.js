import { createApp } from "../src/app.js";

/**
 * Vercel Serverless Entrypoint (`@vercel/node`)
 * Menormalkan `req.url` baik ketika Vercel meneruskan path asli `/api/...`
 * maupun ketika rewrite `/api/(.*)` mengirim parameter `__vpath`.
 */
const app = createApp();

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

export default function handler(req, res) {
  req.url = normalizeVercelRequestUrl(req.url || "/");
  return app(req, res);
}
