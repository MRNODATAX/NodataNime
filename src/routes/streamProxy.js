import { Readable } from "node:stream";

const ALLOWED_HOST_SUFFIXES = [
  "animeverse.id",
  "animekita.org",
  "animeku.org",
  "pixeldrain.com",
  "ylnime.com",
];

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Batas chunk aman 3.5 MB agar selalu di bawah plafon respons 4.5 MB Vercel Serverless
const SERVERLESS_MAX_CHUNK_BYTES = 3_670_016;

export function normalizeRangeForServerless(
  rangeHeader = "",
  isServerless = Boolean(process.env.VERCEL)
) {
  const raw = String(rangeHeader || "").trim();
  if (!isServerless) {
    return raw || undefined;
  }
  const match = raw.match(/^bytes=(\d+)-(\d*)$/i);
  if (!match) {
    return `bytes=0-${SERVERLESS_MAX_CHUNK_BYTES - 1}`;
  }
  const start = Number.parseInt(match[1], 10);
  const hasEnd = match[2] !== "";
  const requestedEnd = hasEnd ? Number.parseInt(match[2], 10) : Infinity;
  const maxAllowedEnd = start + SERVERLESS_MAX_CHUNK_BYTES - 1;
  const clampedEnd = Math.min(requestedEnd, maxAllowedEnd);
  return `bytes=${start}-${clampedEnd}`;
}

export function isAllowedStreamUrl(rawUrl = "") {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
    ) {
      return false;
    }
    return ALLOWED_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`)
    );
  } catch {
    return false;
  }
}

export function resolveRefererForHost(rawUrl = "") {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (host.includes("animeverse.id")) return "https://animeverse.id/";
    if (host.includes("animeku.org")) return "https://animeku.org/";
    return "https://ylnime.com/";
  } catch {
    return "https://ylnime.com/";
  }
}

export async function handleStreamProxy(req, res) {
  const targetUrl = String(req.query.url || "").trim();
  if (!targetUrl) {
    return res.status(400).json({
      ok: false,
      statusCode: 400,
      message: "Parameter 'url' wajib diisi.",
    });
  }

  if (!isAllowedStreamUrl(targetUrl)) {
    return res.status(403).json({
      ok: false,
      statusCode: 403,
      message: "Domain stream tidak diizinkan oleh kebijakan keamanan SSRF NodataNime.",
    });
  }

  const headers = {
    "User-Agent": CHROME_UA,
    Referer: resolveRefererForHost(targetUrl),
    Accept: "video/*,application/octet-stream,*/*;q=0.8",
  };
  const effectiveRange = normalizeRangeForServerless(req.headers.range);
  if (effectiveRange) {
    headers.Range = effectiveRange;
  }

  const abortController = new AbortController();
  req.on("close", () => abortController.abort());

  try {
    const upstream = await fetch(targetUrl, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: abortController.signal,
    });

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(502).json({
        ok: false,
        statusCode: 502,
        message: `Server video hulu merespons HTTP ${upstream.status}`,
      });
    }

    res.status(upstream.status);
    const passthroughHeaders = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
      "etag",
    ];

    for (const h of passthroughHeaders) {
      const val = upstream.headers.get(h);
      if (val) res.setHeader(h, val);
    }
    if (!upstream.headers.get("content-type")) {
      res.setHeader("Content-Type", "video/mp4");
    }
    if (!upstream.headers.get("accept-ranges")) {
      res.setHeader("Accept-Ranges", "bytes");
    }

    if (!upstream.body) {
      return res.end();
    }

    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.on("error", () => {
      if (!res.headersSent) res.status(502);
      res.end();
    });
    nodeStream.pipe(res);
  } catch (err) {
    if (abortController.signal.aborted) return;
    if (!res.headersSent) {
      res.status(502).json({
        ok: false,
        statusCode: 502,
        message: "Koneksi langsung server ke CDN video tidak tersedia; gunakan Direct Browser Stream.",
        detail: err?.message || String(err),
      });
    }
  }
}
