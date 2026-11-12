import { Readable, Transform } from "node:stream";

const ALLOWED_IMAGE_HOST_SUFFIXES = [
  "otakudesu.blog",
  "otakudesu.cloud",
  "otakudesu.io",
  "animekita.org",
  "pinimg.com",
  "myanimelist.net",
  "anilist.co",
  "ylnime.com",
  "wp.com",
];

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const MAX_IMAGE_URL_LENGTH = 2048;
const MAX_IMAGE_BYTES = 2_621_440; // 2.5 MB
const MAX_SAFE_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// Hanya izinkan gambar raster murni (tolak keras image/svg+xml, text/html, dll. untuk cegah Stored/Reflected XSS)
const SAFE_RASTER_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

export function normalizeUpstreamImageUrl(rawUrl = "") {
  let clean = String(rawUrl || "").trim();
  if (!clean) return "";
  if (clean.startsWith("http://")) {
    clean = `https://${clean.slice(7)}`;
  }
  clean = clean.replace(
    /^https:\/\/(?:www\.)?myanimelist\.net\/images\//i,
    "https://cdn.myanimelist.net/images/"
  );
  return clean;
}

export function isAllowedImageUrl(rawUrl = "") {
  const str = String(rawUrl || "").trim();
  if (!str || str.length > MAX_IMAGE_URL_LENGTH || /[\u0000-\u001F\u007F]/.test(str)) {
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
    if (/\/admin\/ad_media\//i.test(parsed.pathname)) {
      return false;
    }
    return ALLOWED_IMAGE_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`)
    );
  } catch {
    return false;
  }
}

export function isSafeRasterImageContentType(rawContentType = "") {
  const clean = String(rawContentType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  return SAFE_RASTER_IMAGE_MIMES.has(clean);
}

export function resolveImageReferer(rawUrl = "") {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (host.includes("otakudesu.")) return `https://${host}/`;
    if (host.includes("animekita.org")) return "https://animekita.org/";
    if (host.includes("myanimelist.net")) return "https://myanimelist.net/";
    if (host.includes("anilist.co")) return "https://anilist.co/";
    return undefined;
  } catch {
    return undefined;
  }
}

export async function fetchImageWithSafeRedirects(
  initialUrl,
  { baseHeaders = {}, signal, maxRedirects = MAX_SAFE_REDIRECTS, fetchImpl = fetch } = {}
) {
  let currentUrl = normalizeUpstreamImageUrl(initialUrl);

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (!isAllowedImageUrl(currentUrl)) {
      const err = new Error("Domain gambar ditolak oleh kebijakan keamanan SSRF NodataNime.");
      err.statusCode = 403;
      err.code = "SSRF_IMAGE_BLOCKED";
      throw err;
    }

    const referer = resolveImageReferer(currentUrl);
    const hopHeaders = { ...baseHeaders };
    if (referer) {
      hopHeaders.Referer = referer;
    }

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
        const err = new Error("Respons pengalihan gambar hulu tidak memiliki header Location.");
        err.statusCode = 502;
        throw err;
      }
      if (hop === maxRedirects) {
        const err = new Error("Terlalu banyak pengalihan pada server gambar hulu.");
        err.statusCode = 502;
        throw err;
      }
      let nextUrl;
      try {
        nextUrl = normalizeUpstreamImageUrl(new URL(location, currentUrl).href);
      } catch {
        const err = new Error("URL pengalihan gambar hulu tidak valid.");
        err.statusCode = 403;
        throw err;
      }
      if (!isAllowedImageUrl(nextUrl)) {
        const err = new Error("Pengalihan ke domain gambar non-allowlist diblokir oleh proteksi SSRF.");
        err.statusCode = 403;
        err.code = "SSRF_IMAGE_REDIRECT_BLOCKED";
        throw err;
      }
      currentUrl = nextUrl;
      continue;
    }

    return upstream;
  }

  const err = new Error("Batas pengalihan gambar terlampaui.");
  err.statusCode = 502;
  throw err;
}

export async function handleImageProxy(req, res) {
  const rawTarget = String(req.query.url || "").trim();
  if (!rawTarget) {
    return res.status(400).json({
      ok: false,
      statusCode: 400,
      message: "Parameter 'url' gambar wajib diisi.",
    });
  }

  const targetUrl = normalizeUpstreamImageUrl(rawTarget);
  if (!isAllowedImageUrl(targetUrl)) {
    return res.status(403).json({
      ok: false,
      statusCode: 403,
      message: "Domain gambar tidak diizinkan oleh kebijakan keamanan SSRF NodataNime.",
    });
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 7000);
  req.on("close", () => abortController.abort());

  try {
    const upstream = await fetchImageWithSafeRedirects(targetUrl, {
      baseHeaders: {
        "User-Agent": CHROME_UA,
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9",
      },
      signal: abortController.signal,
    });

    if (!upstream.ok) {
      upstream.body?.cancel?.().catch(() => {});
      return res.status(502).json({
        ok: false,
        statusCode: 502,
        message: `Server gambar hulu merespons HTTP ${upstream.status}.`,
      });
    }

    const upstreamContentType = upstream.headers.get("content-type") || "";
    if (!isSafeRasterImageContentType(upstreamContentType)) {
      upstream.body?.cancel?.().catch(() => {});
      return res.status(415).json({
        ok: false,
        statusCode: 415,
        message: "Tipe konten gambar hulu ditolak (hanya gambar raster JPEG/PNG/WebP/AVIF/GIF yang diizinkan).",
      });
    }

    const declaredLength = Number.parseInt(upstream.headers.get("content-length") || "", 10);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
      upstream.body?.cancel?.().catch(() => {});
      return res.status(413).json({
        ok: false,
        statusCode: 413,
        message: "Ukuran berkas gambar melebihi batas aman 2.5 MB.",
      });
    }

    const cleanMime = upstreamContentType.split(";")[0].trim().toLowerCase();
    res.status(200);
    res.setHeader("Content-Type", cleanMime === "image/jpg" || cleanMime === "image/pjpeg" ? "image/jpeg" : cleanMime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; sandbox");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");

    if (Number.isFinite(declaredLength) && declaredLength > 0) {
      res.setHeader("Content-Length", String(declaredLength));
    }

    if (!upstream.body) {
      return res.end();
    }

    let transferred = 0;
    const byteGuard = new Transform({
      transform(chunk, _enc, cb) {
        transferred += chunk.length;
        if (transferred > MAX_IMAGE_BYTES) {
          abortController.abort();
          cb(new Error("IMAGE_TOO_LARGE"));
          return;
        }
        cb(null, chunk);
      },
    });

    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.on("error", () => {
      if (!res.headersSent) res.status(502);
      res.end();
    });
    byteGuard.on("error", () => {
      if (!res.headersSent) res.status(413);
      res.destroy();
    });
    nodeStream.pipe(byteGuard).pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      const status = Number(err?.statusCode) === 403 ? 403 : 502;
      res.status(status).json({
        ok: false,
        statusCode: status,
        message:
          status === 403
            ? err.message
            : "Gagal mengambil gambar sampul dari server hulu.",
      });
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
