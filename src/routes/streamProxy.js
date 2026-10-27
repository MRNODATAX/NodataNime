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
const MAX_STREAM_URL_LENGTH = 2048;
const MAX_SAFE_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const SAFE_MEDIA_MIMES = new Set([
  "application/octet-stream",
  "binary/octet-stream",
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
]);

export function normalizeRangeForServerless(
  rangeHeader = "",
  isServerless = Boolean(process.env.VERCEL)
) {
  const raw = String(rangeHeader || "").trim();
  if (!isServerless) {
    if (!raw) return undefined;
    // Hanya teruskan format Range bytes standar untuk mencegah header smuggling
    return /^bytes=\d+-\d*$/i.test(raw) ? raw : undefined;
  }
  const match = raw.match(/^bytes=(\d+)-(\d*)$/i);
  if (!match) {
    return `bytes=0-${SERVERLESS_MAX_CHUNK_BYTES - 1}`;
  }
  const start = Number.parseInt(match[1], 10);
  if (!Number.isSafeInteger(start) || start < 0) {
    return `bytes=0-${SERVERLESS_MAX_CHUNK_BYTES - 1}`;
  }
  const hasEnd = match[2] !== "";
  const requestedEnd = hasEnd ? Number.parseInt(match[2], 10) : Infinity;
  const safeRequestedEnd =
    Number.isFinite(requestedEnd) && requestedEnd >= start ? requestedEnd : Infinity;
  const maxAllowedEnd = start + SERVERLESS_MAX_CHUNK_BYTES - 1;
  const clampedEnd = Math.min(safeRequestedEnd, maxAllowedEnd);
  return `bytes=${start}-${clampedEnd}`;
}

export function isAllowedStreamUrl(rawUrl = "") {
  const str = String(rawUrl || "").trim();
  if (!str || str.length > MAX_STREAM_URL_LENGTH || /[\u0000-\u001F\u007F]/.test(str)) {
    return false;
  }
  try {
    const parsed = new URL(str);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    if (parsed.username || parsed.password) {
      return false;
    }
    if (parsed.port && parsed.port !== "80" && parsed.port !== "443") {
      return false;
    }
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (
      !host ||
      host === "localhost" ||
      host.startsWith("[") ||
      host.includes(":") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      /^\d+(?:\.\d+){0,3}$/.test(host) ||
      /^0x[0-9a-f]+$/i.test(host) ||
      /^(0\.|127\.|10\.|192\.168\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
        host
      )
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

export function isSafeMediaContentType(rawContentType = "") {
  const clean = String(rawContentType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!clean) return true;
  if (clean.startsWith("video/") || clean.startsWith("audio/")) {
    return true;
  }
  return SAFE_MEDIA_MIMES.has(clean);
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

export async function fetchWithSafeRedirects(
  initialUrl,
  { baseHeaders = {}, signal, maxRedirects = MAX_SAFE_REDIRECTS, fetchImpl = fetch } = {}
) {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (!isAllowedStreamUrl(currentUrl)) {
      const err = new Error("Redirect atau domain stream ditolak oleh kebijakan keamanan SSRF.");
      err.statusCode = 403;
      err.code = "SSRF_BLOCKED";
      throw err;
    }

    const hopHeaders = {
      ...baseHeaders,
      Referer: resolveRefererForHost(currentUrl),
    };

    const upstream = await fetchImpl(currentUrl, {
      method: "GET",
      headers: hopHeaders,
      redirect: "manual",
      signal,
    });

    if (REDIRECT_STATUSES.has(upstream.status)) {
      upstream.body?.cancel?.().catch(() => {});
      const location = upstream.headers.get("location");
      if (!location) {
        const err = new Error("Respons redirect hulu tidak memiliki header Location.");
        err.statusCode = 502;
        throw err;
      }
      if (hop === maxRedirects) {
        const err = new Error("Terlalu banyak pengalihan (redirect) dari server media hulu.");
        err.statusCode = 502;
        throw err;
      }
      let nextUrl;
      try {
        nextUrl = new URL(location, currentUrl).href;
      } catch {
        const err = new Error("URL pengalihan hulu tidak valid.");
        err.statusCode = 403;
        throw err;
      }
      if (!isAllowedStreamUrl(nextUrl)) {
        const err = new Error("Pengalihan ke domain non-allowlist diblokir oleh proteksi SSRF.");
        err.statusCode = 403;
        err.code = "SSRF_REDIRECT_BLOCKED";
        throw err;
      }
      currentUrl = nextUrl;
      continue;
    }

    return upstream;
  }

  const err = new Error("Batas pengalihan stream terlampaui.");
  err.statusCode = 502;
  throw err;
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

  const baseHeaders = {
    "User-Agent": CHROME_UA,
    Accept: "video/*,audio/*,application/octet-stream;q=0.9",
  };
  const effectiveRange = normalizeRangeForServerless(req.headers.range);
  if (effectiveRange) {
    baseHeaders.Range = effectiveRange;
  }

  const abortController = new AbortController();
  req.on("close", () => abortController.abort());

  try {
    const upstream = await fetchWithSafeRedirects(targetUrl, {
      baseHeaders,
      signal: abortController.signal,
    });

    if (!upstream.ok && upstream.status !== 206) {
      upstream.body?.cancel?.().catch(() => {});
      return res.status(502).json({
        ok: false,
        statusCode: 502,
        message: `Server video hulu merespons HTTP ${upstream.status}.`,
      });
    }

    const upstreamContentType = upstream.headers.get("content-type") || "";
    if (!isSafeMediaContentType(upstreamContentType)) {
      upstream.body?.cancel?.().catch(() => {});
      return res.status(415).json({
        ok: false,
        statusCode: 415,
        message: "Tipe konten hulu ditolak karena bukan berkas media video/audio yang aman.",
      });
    }

    res.status(upstream.status);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; media-src 'self'; sandbox");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Content-Disposition", "inline");

    const passthroughHeaders = [
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
      "etag",
    ];

    for (const h of passthroughHeaders) {
      const val = upstream.headers.get(h);
      if (val && !/[\r\n]/.test(val)) {
        res.setHeader(h, val);
      }
    }

    const cleanMime = upstreamContentType.split(";")[0].trim().toLowerCase();
    res.setHeader("Content-Type", cleanMime || "video/mp4");

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
      const status = Number(err?.statusCode) === 403 ? 403 : 502;
      res.status(status).json({
        ok: false,
        statusCode: status,
        message:
          status === 403
            ? err.message
            : "Koneksi langsung server ke CDN video tidak tersedia; gunakan Direct Browser Stream.",
      });
    }
  }
}
