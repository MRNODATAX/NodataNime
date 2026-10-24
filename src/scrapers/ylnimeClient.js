import {
  YLNIME_BASE_URL,
  fromSeriesToken,
  toSeriesToken,
  parseHome,
  parseCards,
  parsePagination,
  parseGenres,
  parseSchedule,
  parseAnimeDetail,
  parseEpisodeHtml,
  normalizeEpisodeStreams,
} from "../parsers/ylnimeParser.js";

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const RESOLUTIONS = ["1080p", "720p", "480p", "360p"];

class YlnimeClient {
  constructor() {
    this.baseUrl = process.env.YLNIME_BASE_URL || YLNIME_BASE_URL;
    this.cookies = new Map();
    this.sessionWarmedAt = 0;
    this.cooldownUntil = 0;
    this.lastStatus = {
      reachable: null,
      lastCheckedAt: null,
      lastError: null,
    };
  }

  isCoolingDown() {
    return Date.now() < this.cooldownUntil;
  }

  recordSuccess() {
    this.cooldownUntil = 0;
    this.lastStatus = {
      reachable: true,
      lastCheckedAt: new Date().toISOString(),
      lastError: null,
    };
  }

  recordFailure(err, cooldownMs = 60_000) {
    this.cooldownUntil = Date.now() + cooldownMs;
    this.lastStatus = {
      reachable: false,
      lastCheckedAt: new Date().toISOString(),
      lastError: err?.message || String(err),
    };
  }

  captureSetCookies(headers) {
    const rawCookies =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : headers.get("set-cookie")
          ? [headers.get("set-cookie")]
          : [];

    for (const line of rawCookies) {
      const pair = String(line).split(";")[0];
      const eq = pair.indexOf("=");
      if (eq > 0) {
        const name = pair.slice(0, eq).trim();
        const val = pair.slice(eq + 1).trim();
        if (name && val) this.cookies.set(name, val);
      }
    }
  }

  cookieHeader() {
    if (this.cookies.size === 0) return "";
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  buildHeaders(extra = {}) {
    const headers = {
      "User-Agent": CHROME_UA,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: `${this.baseUrl}/`,
      ...extra,
    };
    const cookie = this.cookieHeader();
    if (cookie) headers.Cookie = cookie;
    return headers;
  }

  async warmupSession() {
    if (this.isCoolingDown()) return false;
    if (this.cookies.has("PHPSESSID") && Date.now() - this.sessionWarmedAt < 10 * 60_000) {
      return true;
    }
    try {
      const res = await fetch(`${this.baseUrl}/`, {
        method: "GET",
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(3500),
      });
      this.captureSetCookies(res.headers);
      if (!res.ok) {
        this.recordFailure(new Error(`HTTP ${res.status} on warmup`), 30_000);
        return false;
      }
      this.sessionWarmedAt = Date.now();
      this.recordSuccess();
      return true;
    } catch (err) {
      this.recordFailure(err, 60_000);
      return false;
    }
  }

  async fetchText(relativePath, acceptJson = false) {
    if (this.isCoolingDown()) {
      throw new Error(`YLnime circuit open (${this.lastStatus.lastError || "unreachable"})`);
    }
    await this.warmupSession();
    if (this.isCoolingDown()) {
      throw new Error(`YLnime unreachable (${this.lastStatus.lastError || "warmup failed"})`);
    }

    const cleanPath = String(relativePath).replace(/^\//, "");
    const url = `${this.baseUrl}/${cleanPath}`;

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: this.buildHeaders(
          acceptJson ? { Accept: "application/json, text/plain, */*" } : {}
        ),
        signal: AbortSignal.timeout(4500),
      });
      this.captureSetCookies(res.headers);
      if (!res.ok) {
        throw new Error(`YLnime HTTP ${res.status} for ${cleanPath}`);
      }
      const body = await res.text();
      this.recordSuccess();
      return body;
    } catch (err) {
      if (/fetch failed|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|AbortError/i.test(String(err?.message || err))) {
        this.recordFailure(err, 60_000);
      }
      throw err;
    }
  }

  async scrapeHome() {
    const html = await this.fetchText("index.php");
    const parsed = parseHome(html);
    if (!parsed.banners.length && !parsed.ongoing.length && !parsed.latestReleases.length) {
      throw new Error("Empty home payload from YLnime");
    }
    return parsed;
  }

  async scrapeList(type = "ongoing", page = 1) {
    const p = Math.max(1, Number(page) || 1);
    const routeMap = {
      ongoing: "ongoing.php",
      completed: p > 1 ? `completed.php?page=${p}` : "completed.php",
      movie: p > 1 ? `movies.php?page=${p}` : "movies.php",
      movies: p > 1 ? `movies.php?page=${p}` : "movies.php",
      baru: p > 1 ? `baru.php?page=${p}` : "baru.php",
      rekomendasi: "rekomendasi.php",
      hyper: "hyper.php",
    };
    const target = routeMap[type] || routeMap.ongoing;
    const html = await this.fetchText(target);
    const allCards = parseCards(html);
    if (!allCards.length) {
      throw new Error(`No cards parsed from ${target}`);
    }

    // Ongoing & Rekomendasi dirender YLnime dalam satu halaman penuh
    if (type === "ongoing" || type === "rekomendasi" || type === "hyper") {
      const pageSize = 20;
      const totalPages = Math.max(1, Math.ceil(allCards.length / pageSize));
      const safePage = Math.min(p, totalPages);
      const slice = allCards.slice((safePage - 1) * pageSize, safePage * pageSize);
      return {
        items: slice,
        pagination: {
          currentPage: safePage,
          prevPage: safePage > 1 ? safePage - 1 : null,
          nextPage: safePage < totalPages ? safePage + 1 : null,
          totalPages,
          hasPrevPage: safePage > 1,
          hasNextPage: safePage < totalPages,
        },
      };
    }

    return {
      items: allCards,
      pagination: parsePagination(html, p),
    };
  }

  async scrapeAz(letter = "A") {
    const initial = String(letter || "A").trim().toUpperCase();
    const validInitial = /^([A-Z]|#)$/.test(initial) ? initial : "A";
    const html = await this.fetchText(`anime-list.php?l=${encodeURIComponent(validInitial)}`);
    return {
      letter: validInitial,
      items: parseCards(html),
    };
  }

  async scrapeGenres() {
    const html = await this.fetchText("genre.php");
    const genres = parseGenres(html);
    if (!genres.length) throw new Error("No genres parsed from genre.php");
    return genres;
  }

  async scrapeByGenre(genreId, page = 1) {
    const p = Math.max(1, Number(page) || 1);
    const suffix = p > 1 ? `&page=${p}` : "";
    const html = await this.fetchText(`genre.php?g=${encodeURIComponent(genreId)}${suffix}`);
    return {
      genreId,
      items: parseCards(html),
      pagination: parsePagination(html, p),
    };
  }

  async scrapeSchedule() {
    const html = await this.fetchText("jadwals.php");
    const groups = parseSchedule(html);
    if (!groups.length) throw new Error("No schedule parsed from jadwals.php");
    return groups;
  }

  async scrapeSearch(query) {
    const html = await this.fetchText(`index.php?search=${encodeURIComponent(query)}`);
    return parseCards(html);
  }

  async scrapeDetail(slugOrToken) {
    const rawSlug = fromSeriesToken(slugOrToken);
    const html = await this.fetchText(`index.php?series=${encodeURIComponent(rawSlug)}`);
    const detail = parseAnimeDetail(html, rawSlug);
    if (!detail) throw new Error(`Anime detail not found for ${rawSlug}`);
    return detail;
  }

  async fetchEpisodeJson(episodeId, rawSeriesSlug, reso) {
    const params = new URLSearchParams({
      yl_ep_json: "1",
      episode: episodeId,
      series: rawSeriesSlug,
      reso,
    });
    const text = await this.fetchText(`index.php?${params.toString()}`, true);
    return JSON.parse(text);
  }

  async scrapeEpisode({ seriesSlug, episodeId, epNumber }) {
    const rawSeries = fromSeriesToken(seriesSlug);
    let resolvedEpisodeId = episodeId ? fromSeriesToken(episodeId) : "";

    // Jika pemanggil hanya mengirim `ep=<nomor>`, cari ID episode `al-...` yang persis sama dari halaman detail
    if (!resolvedEpisodeId && epNumber != null && rawSeries) {
      const detail = await this.scrapeDetail(rawSeries);
      const matchEp = detail.episodes.find((e) => Number(e.number) === Number(epNumber));
      if (matchEp) {
        resolvedEpisodeId = matchEp.episodeId;
      }
    }

    if (!resolvedEpisodeId) {
      throw new Error("Episode ID tidak ditemukan");
    }

    const epQuery = rawSeries
      ? `index.php?series=${encodeURIComponent(rawSeries)}&episode=${encodeURIComponent(resolvedEpisodeId)}`
      : `index.php?episode=${encodeURIComponent(resolvedEpisodeId)}`;

    const [epHtml, ...jsonResults] = await Promise.all([
      this.fetchText(epQuery).catch(() => ""),
      ...RESOLUTIONS.map((reso) =>
        this.fetchEpisodeJson(resolvedEpisodeId, rawSeries, reso).catch(() => null)
      ),
    ]);

    const parsedHtml = epHtml
      ? parseEpisodeHtml(epHtml, rawSeries, resolvedEpisodeId)
      : {
          title: `${rawSeries} — ${resolvedEpisodeId}`,
          animeTitle: rawSeries,
          seriesSlug: rawSeries,
          animeSlug: toSeriesToken(rawSeries),
          inlineStreams: [],
          prevEp: null,
          nextEp: null,
        };

    // Hanya terima respons JSON di mana `reso_dipakai` sesuai atau respons valid pertama
    const filteredJsons = jsonResults.filter(
      (res, idx) => res && res.ok && res.reso_dipakai === RESOLUTIONS[idx]
    );
    const effectiveJsons =
      filteredJsons.length > 0
        ? filteredJsons
        : jsonResults.filter((res) => res && res.ok);

    const normalized = normalizeEpisodeStreams({
      episodeId: resolvedEpisodeId,
      seriesSlug: parsedHtml.seriesSlug || rawSeries,
      title: parsedHtml.title,
      animeTitle: parsedHtml.animeTitle,
      jsonResponses: effectiveJsons,
      inlineStreams: parsedHtml.inlineStreams,
      fallbackPrevEp: parsedHtml.prevEp,
      fallbackNextEp: parsedHtml.nextEp,
    });

    if (!normalized.streams.length) {
      throw new Error("Tidak ada stream tersedia dari YLnime");
    }
    return normalized;
  }

  async scrapeCommunityFeed() {
    const raw = await this.fetchText("chat_ringan.txt", true);
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return [];
    return items.slice(-20).reverse().map((item) => ({
      id: item.i,
      nickname: item.n || "Anonim",
      avatar: item.a ? `${this.baseUrl}/avatars/${item.a}` : "/assets/no-cover.svg",
      message: item.m || "",
      timestamp: Number(item.t) || 0,
      isAdmin: Boolean(item.adm),
      replyTo: item.r ? { nickname: item.r.n, message: item.r.m } : null,
    }));
  }
}

export const ylnimeClient = new YlnimeClient();
