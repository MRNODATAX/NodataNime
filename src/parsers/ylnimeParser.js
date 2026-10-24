import * as cheerio from "cheerio";

export const YLNIME_BASE_URL = "https://ylnime.com";

/**
 * Menyandikan slug series YLnime agar aman di satu segmen URL REST API.
 * Contoh: "isekai-cheat-sub-indo/" -> "isekai-cheat-sub-indo~"
 */
export function toSeriesToken(slug = "") {
  return String(slug)
    .trim()
    .replace(/\?/g, "~q")
    .replace(/#/g, "~h")
    .replace(/\/$/, "~");
}

/**
 * Memulihkan token URL menjadi slug asli YLnime.
 */
export function fromSeriesToken(token = "") {
  return String(token)
    .trim()
    .replace(/~$/, "/")
    .replace(/~q/g, "?")
    .replace(/~h/g, "#");
}

const EPISODE_SEPARATOR = "__";

export function toEpisodeToken(episodeId = "", seriesSlug = "") {
  if (!seriesSlug) return toSeriesToken(episodeId);
  return `${toSeriesToken(episodeId)}${EPISODE_SEPARATOR}${toSeriesToken(seriesSlug)}`;
}

export function fromEpisodeToken(token = "") {
  const raw = String(token).trim();
  const idx = raw.indexOf(EPISODE_SEPARATOR);
  if (idx <= 0) {
    return { episodeId: fromSeriesToken(raw), seriesSlug: "" };
  }
  return {
    episodeId: fromSeriesToken(raw.slice(0, idx)),
    seriesSlug: fromSeriesToken(raw.slice(idx + EPISODE_SEPARATOR.length)),
  };
}

export function extractQueryParam(href = "", paramName = "") {
  if (!href) return "";
  try {
    const normalized = String(href).replace(/&amp;/g, "&").trim();
    const parsed = new URL(normalized, `${YLNIME_BASE_URL}/`);
    return parsed.searchParams.get(paramName) ?? "";
  } catch {
    return "";
  }
}

export function resolvePosterUrl(src = "") {
  const raw = String(src || "").trim();
  if (!raw || raw.endsWith("no-cover.svg")) {
    return "/assets/no-cover.svg";
  }
  if (raw.startsWith("//")) {
    return `https:${raw}`;
  }
  try {
    const resolved = new URL(raw, `${YLNIME_BASE_URL}/`).href;
    if (resolved.endsWith("/assets/no-cover.svg")) {
      return "/assets/no-cover.svg";
    }
    return resolved;
  } catch {
    return raw;
  }
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

/**
 * Mem-parsing satu elemen `.card` YLnime menjadi objek AnimeCard terstandar.
 */
export function parseCardElement($, cardEl) {
  const card = $(cardEl);
  const seriesAnchor = card.find('a[href*="series="]').first();
  const rawHref = seriesAnchor.attr("href") || "";
  const rawSlug = extractQueryParam(rawHref, "series");
  if (!rawSlug) return null;

  const episodeId = extractQueryParam(rawHref, "episode");
  const img = card.find("img").first();
  const rawPoster = img.attr("data-src") || img.attr("src") || "";

  let score = "";
  card.find("span").each((_, sp) => {
    if (!score && $(sp).find(".fa-star").length > 0) {
      score = cleanText($(sp).text()).replace(/^★\s*/, "");
    }
  });

  const cornerText = cleanText(
    card.find(".badge-corner, span.bg-success, span.top-0.start-0").first().text()
  );
  const cornerScoreMatch = cornerText.match(/^★\s*([\d.]+)/);
  if (cornerScoreMatch && !score) {
    score = cornerScoreMatch[1];
  }

  const isRankNumber = /^\d+$/.test(cornerText);
  const label = cornerScoreMatch || isRankNumber ? "" : cornerText;

  let status = cleanText(card.find("span.bottom-0").first().text());
  if (!status) {
    if (/^tamat$/i.test(label)) status = "Completed";
    else if (/^movie$/i.test(label)) status = "Movie";
    else if (/^(senin|selasa|rabu|kamis|jumat|sabtu|minggu)$/i.test(label)) status = "Ongoing";
  }

  let episodeLabel = "";
  const epMatch = label.match(/(?:eps?\s*)+(\d+)/i) || status.match(/(?:eps?\s*)+(\d+)/i);
  if (epMatch) {
    episodeLabel = `Ep ${epMatch[1]}`;
  }

  const title =
    cleanText(card.find(".card-title, h6, h5").first().text()) ||
    cleanText(img.attr("alt") === "Cover" ? "" : img.attr("alt"));

  if (!title) return null;

  const viewsMatch = cleanText(card.text()).match(/([\d,]+)\s*Views/i);

  return {
    title,
    slug: toSeriesToken(rawSlug),
    rawSlug,
    poster: resolvePosterUrl(rawPoster),
    score: score || "",
    status: status || "Anime",
    label,
    episode: episodeLabel,
    episodeId: episodeId || "",
    views: viewsMatch ? viewsMatch[1] : "",
    sourceUrl: `${YLNIME_BASE_URL}/index.php?series=${encodeURIComponent(rawSlug)}`,
  };
}

/**
 * Mem-parsing seluruh kartu anime unik di dalam dokumen/kontainer HTML.
 */
export function parseCards(htmlOrCheerio, rootSelector = null) {
  const $ = typeof htmlOrCheerio === "string" ? cheerio.load(htmlOrCheerio) : htmlOrCheerio;
  const scope = rootSelector ? $(rootSelector) : $.root();
  const seen = new Set();
  const cards = [];

  scope.find(".card").each((_, el) => {
    const parsed = parseCardElement($, el);
    if (!parsed || seen.has(parsed.slug)) return;
    seen.add(parsed.slug);
    cards.push(parsed);
  });

  return cards;
}

/**
 * Mem-parsing paginasi `.pager` YLnime (Sebelumnya / Berikutnya).
 */
export function parsePagination(htmlOrCheerio, currentPage = 1) {
  const $ = typeof htmlOrCheerio === "string" ? cheerio.load(htmlOrCheerio) : htmlOrCheerio;
  const page = Math.max(1, Number(currentPage) || 1);
  let hasNextPage = false;

  $(".pager a, .pagination a, a[href*='page=']").each((_, el) => {
    const txt = cleanText($(el).text());
    if (/berikutnya|next|»/i.test(txt)) {
      hasNextPage = true;
    }
  });

  const hasPrevPage = page > 1;
  return {
    currentPage: page,
    prevPage: hasPrevPage ? page - 1 : null,
    nextPage: hasNextPage ? page + 1 : null,
    totalPages: hasNextPage ? page + 1 : page,
    hasPrevPage,
    hasNextPage,
  };
}

/**
 * Mem-parsing daftar 28 genre dari `genre.php`.
 */
export function parseGenres(html) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const genres = [];

  $('a.genre-pill[href*="g="], a[href*="genre.php?g="]').each((_, el) => {
    const genreId = extractQueryParam($(el).attr("href"), "g");
    const title = cleanText($(el).text());
    if (!genreId || !title || seen.has(genreId)) return;
    seen.add(genreId);
    genres.push({ genreId, title });
  });

  return genres;
}

/**
 * Mem-parsing jadwal rilis mingguan dari `jadwals.php`.
 */
export function parseSchedule(html) {
  const $ = cheerio.load(html);
  const groups = [];

  $(".day-header").each((_, headerEl) => {
    const headerText = cleanText($(headerEl).text());
    const day = headerText.split(/\s+/)[0] || "";
    if (!day) return;

    const isToday = /hari\s+ini/i.test(headerText);
    const dateMatch = headerText.match(/\d{1,2}\s+[A-Za-z]+\s+\d{4}/);
    const parent = $(headerEl).parent();

    const seen = new Set();
    const animeList = [];
    parent.find(".card").each((__, cardEl) => {
      const item = parseCardElement($, cardEl);
      if (item && !seen.has(item.slug)) {
        seen.add(item.slug);
        animeList.push({ ...item, releaseDay: day });
      }
    });

    if (animeList.length > 0) {
      groups.push({
        day,
        date: dateMatch ? dateMatch[0] : "",
        isToday,
        count: animeList.length,
        animeList,
      });
    }
  });

  return groups;
}

/**
 * Mem-parsing halaman beranda `index.php` YLnime (Hero Banner, Top Anime, Baru Rilis, Sedang Tayang).
 */
export function parseHome(html) {
  const $ = cheerio.load(html);
  const banners = [];

  $(".carousel-item").each((_, el) => {
    const slide = $(el);
    const linkEl = slide.find('a[href*="series="]').first();
    const rawSlug = extractQueryParam(linkEl.attr("href") || "", "series");
    const title = cleanText(slide.find("h2, h1, .carousel-caption h2").first().text());
    const bannerImg =
      slide.find("img.banner-img, img").first().attr("src") ||
      slide.find("img").first().attr("data-src") ||
      "";
    if (!title && !rawSlug) return;

    const synopsis = cleanText(slide.find("p").first().text());
    const genreLine = cleanText(slide.find(".text-danger, .small.fw-bold, .banner-genres").first().text());
    const genres = genreLine
      ? genreLine
          .split(/[•,|]/)
          .map((g) => g.trim())
          .filter(Boolean)
      : [];

    banners.push({
      title: title || rawSlug,
      slug: toSeriesToken(rawSlug),
      rawSlug,
      banner: resolvePosterUrl(bannerImg),
      poster: resolvePosterUrl(bannerImg),
      synopsis,
      genres,
      status: "Sedang Tayang",
    });
  });

  // Top Anime tabs (today, yesterday, week, month)
  const topAnime = { today: [], yesterday: [], week: [], month: [] };
  const tabKeys = ["today", "yesterday", "week", "month"];
  $(".tab-pane").each((idx, pane) => {
    if (idx >= tabKeys.length) return;
    const key = tabKeys[idx];
    const items = [];
    $(pane)
      .find('a[href*="series="], .card')
      .each((rankIdx, itemEl) => {
        const node = $(itemEl);
        const href = node.is("a")
          ? node.attr("href")
          : node.find('a[href*="series="]').first().attr("href");
        const rawSlug = extractQueryParam(href || "", "series");
        if (!rawSlug) return;
        const slug = toSeriesToken(rawSlug);
        if (items.some((x) => x.slug === slug)) return;

        const img = node.find("img").first();
        const title =
          cleanText(node.find("h6, .card-title").first().text()) ||
          cleanText(img.attr("alt") === "Cover" ? "" : img.attr("alt"));
        if (!title) return;
        const viewsMatch = cleanText(node.text()).match(/([\d,]+)\s*Views/i);
        items.push({
          rank: items.length + 1,
          title,
          slug,
          rawSlug,
          poster: resolvePosterUrl(img.attr("src") || img.attr("data-src") || ""),
          views: viewsMatch ? viewsMatch[1] : "",
        });
      });
    if (items.length > 0) {
      topAnime[key] = items.slice(0, 10);
    }
  });

  // Section-based extraction for Baru Rilis & Sedang Tayang
  let latestReleases = [];
  let ongoing = [];

  $("h3, h4").each((_, headingEl) => {
    const heading = cleanText($(headingEl).text());
    const sectionRow = $(headingEl).nextAll(".row").first();
    if (!sectionRow.length) return;
    if (/baru\s*rilis/i.test(heading) && latestReleases.length === 0) {
      latestReleases = parseCards($, sectionRow);
    } else if (/sedang\s*tayang/i.test(heading) && ongoing.length === 0) {
      ongoing = parseCards($, sectionRow);
    }
  });

  if (latestReleases.length === 0 && ongoing.length === 0) {
    const allCards = parseCards($);
    latestReleases = allCards.slice(0, 10);
    ongoing = allCards.slice(10, 34);
  }

  return {
    banners,
    topAnime,
    latestReleases,
    ongoing,
  };
}

/**
 * Mem-parsing halaman detail anime (`index.php?series=<slug>`).
 */
export function parseAnimeDetail(html, requestedSlug = "") {
  const $ = cheerio.load(html);
  const rawSlug = fromSeriesToken(requestedSlug);
  const titleEl = $("h1").first();
  const title = cleanText(titleEl.text());
  if (!title) return null;

  const infoContainer = titleEl.parent();
  const metaSpans = infoContainer
    .find(".d-flex span, .anime-meta span")
    .map((_, sp) => cleanText($(sp).text()))
    .get()
    .filter(Boolean);

  const [status = "Ongoing", type = "TV", year = "2026"] = metaSpans;

  const posterImg = $("img.img-fluid.rounded, .col-md-3 img, .col-md-4 img").first();
  const poster = resolvePosterUrl(posterImg.attr("src") || posterImg.attr("data-src") || "");

  const scoreRaw = cleanText($("h3.text-success, .match-score").first().text());
  const score = scoreRaw.replace(/\s*match$/i, "").trim() || "8.0";

  // Sinopsis dapat terdiri dari 1 atau beberapa paragraf <p>
  const synopsisParagraphs = infoContainer
    .find("p")
    .map((_, p) => cleanText($(p).text()))
    .get()
    .filter((txt) => txt.length > 15 && !/^genres?:/i.test(txt));

  const synopsis =
    synopsisParagraphs.join("\n\n") ||
    cleanText($("meta[name='description']").attr("content") || "");

  const genres = [];
  const seenGenres = new Set();
  infoContainer.find('a[href*="search="], a[href*="g="]').each((_, a) => {
    const name = cleanText($(a).text()).replace(/,\s*$/, "");
    if (!name) return;
    const genreId =
      extractQueryParam($(a).attr("href"), "g") ||
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (seenGenres.has(genreId)) return;
    seenGenres.add(genreId);
    genres.push({ title: name, genreId });
  });

  const episodes = [];
  const seenEp = new Set();
  const normalizedTargetSeries = toSeriesToken(rawSlug);
  $('a[href*="episode="]').each((_, a) => {
    const href = $(a).attr("href") || "";
    const linkSeries = extractQueryParam(href, "series");
    if (linkSeries && toSeriesToken(linkSeries) !== normalizedTargetSeries) return;
    const episodeId = extractQueryParam(href, "episode");
    if (!episodeId || seenEp.has(episodeId)) return;
    seenEp.add(episodeId);

    const smallText = cleanText($(a).find("small, .text-muted").first().text());
    const spanText = cleanText($(a).find("span").first().text());
    let epTitle = spanText;
    if (!epTitle) {
      const cloned = $(a).clone();
      cloned.find("small, .text-muted").remove();
      epTitle = cleanText(cloned.text());
    }

    const numMatch =
      epTitle.match(/episode\s*(\d+(?:\.\d+)?)/i) ||
      episodeId.match(/-(\d+)$/) ||
      episodeId.match(/(\d+)$/);
    const epNumber = numMatch ? Number(numMatch[1]) : episodes.length + 1;

    episodes.push({
      episodeId,
      token: toEpisodeToken(episodeId, rawSlug),
      number: epNumber,
      title: epTitle || `Episode ${epNumber}`,
      date: smallText || "",
    });
  });

  // More Like This / Recommendations
  const recommendations = parseCards($).filter((c) => c.slug !== toSeriesToken(rawSlug));

  return {
    title,
    slug: toSeriesToken(rawSlug),
    rawSlug,
    poster,
    banner: poster,
    score,
    status,
    type,
    year,
    synopsis,
    totalEpisodes: episodes.length,
    genres,
    episodes,
    recommendations: recommendations.slice(0, 8),
    sourceUrl: `${YLNIME_BASE_URL}/index.php?series=${encodeURIComponent(rawSlug)}`,
  };
}

/**
 * Mengklasifikasikan provider video dari URL stream & ID provider YLnime (`provide`).
 */
export function classifyStreamProvider(link = "", provideId = null) {
  const url = String(link || "").trim();
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = "";
  }

  if (provideId === 871 || host.includes("animeverse.id")) {
    return {
      provider: "Animeverse S3",
      providerId: 871,
      type: "mp4",
      playableDirect: true,
      recommendedReferer: "https://animeverse.id/",
    };
  }
  if (provideId === 15 || host.includes("animekita.org")) {
    return {
      provider: "AnimeKita CDN",
      providerId: 15,
      type: "mp4",
      playableDirect: true,
      recommendedReferer: "https://ylnime.com/",
    };
  }
  if (host.includes("animeku.org")) {
    return {
      provider: "AnimeKu Direct",
      providerId: provideId || 20,
      type: "mp4",
      playableDirect: true,
      recommendedReferer: "https://animeku.org/",
    };
  }
  if (host.includes("pixeldrain.com")) {
    return {
      provider: "Pixeldrain Cloud",
      providerId: provideId || 11,
      type: "download",
      playableDirect: false,
      recommendedReferer: "https://ylnime.com/",
    };
  }
  const isMp4 = /\.mp4(\?|$)/i.test(url);
  return {
    provider: host ? host.replace(/^www\./, "") : "Mirror Server",
    providerId: provideId || 0,
    type: isMp4 ? "mp4" : "embed",
    playableDirect: isMp4,
    recommendedReferer: "https://ylnime.com/",
  };
}

/**
 * Mem-parsing HTML halaman episode YLnime (`#ylJudulEp`, breadcrumb, dan `const streams = [...]` di `<script>`).
 */
export function parseEpisodeHtml(html, fallbackSeriesSlug = "", fallbackEpisodeId = "") {
  const $ = cheerio.load(html);
  const rawTitle =
    cleanText($("#ylJudulEp").text()) ||
    cleanText($("h1, h4.fw-bold").first().text());
  const title = rawTitle.replace(/\s*-\s*YLnime$/i, "").trim();

  let seriesSlug = fromSeriesToken(fallbackSeriesSlug);
  let animeTitle = "";

  $(".breadcrumb a[href*='series=']").each((_, a) => {
    const href = $(a).attr("href") || "";
    if (!href.includes("episode=") && !animeTitle) {
      const extracted = extractQueryParam(href, "series");
      if (extracted) {
        seriesSlug = extracted;
        animeTitle = cleanText($(a).text());
      }
    }
  });

  if (!animeTitle && seriesSlug) {
    $(`a[href*='series=']`).each((_, a) => {
      const href = $(a).attr("href") || "";
      const extracted = extractQueryParam(href, "series");
      if (!href.includes("episode=") && extracted && toSeriesToken(extracted) === toSeriesToken(seriesSlug) && !animeTitle) {
        animeTitle = cleanText($(a).text());
      }
    });
  }

  // Ekstraksi inline `const streams = [...]` dari tag <script>
  let inlineStreams = [];
  $("script").each((_, scriptEl) => {
    const content = $(scriptEl).html() || "";
    const match = content.match(/(?:const|let|var)\s+streams\s*=\s*(\[[\s\S]*?\])\s*;/);
    if (match && match[1]) {
      try {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed)) {
          inlineStreams = parsed;
        }
      } catch {
        // Abaikan jika JSON tidak valid
      }
    }
  });

  // Ekstraksi navigasi Prev / Next dari tautan HTML jika ada
  let prevEp = null;
  let nextEp = null;
  $('a[href*="episode="]').each((_, a) => {
    const href = $(a).attr("href") || "";
    const linkSeries = extractQueryParam(href, "series");
    if (linkSeries && seriesSlug && toSeriesToken(linkSeries) !== toSeriesToken(seriesSlug)) return;
    const txt = cleanText($(a).text());
    const epId = extractQueryParam(href, "episode");
    if (!epId) return;
    if (/sebelumnya|prev/i.test(txt)) prevEp = epId;
    if (/selanjutnya|berikutnya|next/i.test(txt)) nextEp = epId;
  });

  // Ekstraksi daftar resolusi yang tersedia di tombol kualitas
  const availableResolutions = [];
  $('a[href*="reso="]').each((_, a) => {
    const r = extractQueryParam($(a).attr("href") || "", "reso");
    if (r && !availableResolutions.includes(r)) {
      availableResolutions.push(r);
    }
  });

  return {
    title: title || fallbackEpisodeId,
    animeTitle: animeTitle || title.replace(/\s*Episode\s*\d+.*$/i, "").trim(),
    seriesSlug,
    animeSlug: toSeriesToken(seriesSlug),
    episodeId: fallbackEpisodeId,
    inlineStreams,
    availableResolutions,
    prevEp,
    nextEp,
  };
}

/**
 * Menggabungkan hasil endpoint JSON `yl_ep_json=1` multi-resolusi dan fallback HTML menjadi struktur stream terpadu.
 */
export function normalizeEpisodeStreams({
  episodeId = "",
  seriesSlug = "",
  title = "",
  animeTitle = "",
  jsonResponses = [],
  inlineStreams = [],
  fallbackPrevEp = null,
  fallbackNextEp = null,
}) {
  const validJsons = jsonResponses.filter((r) => r && r.ok && Array.isArray(r.streams));
  const rawStreamPool = [
    ...validJsons.flatMap((r) => r.streams || []),
    ...inlineStreams,
  ];

  const seenLinks = new Set();
  const providerCounters = new Map();
  const streams = [];

  for (const raw of rawStreamPool) {
    const link = String(raw?.link || raw?.url || "").trim();
    if (!link || seenLinks.has(link)) continue;
    seenLinks.add(link);

    const reso = String(raw?.reso || raw?.resolution || "720p").trim();
    const meta = classifyStreamProvider(link, raw?.provide);
    const labelBase = `${meta.provider} ${reso}`;
    const count = (providerCounters.get(labelBase) || 0) + 1;
    providerCounters.set(labelBase, count);

    streams.push({
      id: raw?.id || streams.length + 1,
      label: count > 1 ? `${labelBase} #${count}` : labelBase,
      resolution: reso,
      resolutionRank: Number.parseInt(reso, 10) || 720,
      url: link,
      proxyUrl: `/api/anime/stream-proxy?url=${encodeURIComponent(link)}`,
      provider: meta.provider,
      providerId: meta.providerId,
      type: meta.type,
      playableDirect: meta.playableDirect,
      recommendedReferer: meta.recommendedReferer,
    });
  }

  // Urutkan stream yang dapat diputar langsung (MP4) terlebih dahulu, lalu berdasarkan resolusi tertinggi
  streams.sort((a, b) => {
    if (a.playableDirect !== b.playableDirect) {
      return a.playableDirect ? -1 : 1;
    }
    return b.resolutionRank - a.resolutionRank;
  });

  const resolutions = [...new Set(streams.map((s) => s.resolution))].sort(
    (a, b) => (Number.parseInt(b, 10) || 0) - (Number.parseInt(a, 10) || 0)
  );

  const primaryJson = validJsons[0] || jsonResponses.find((r) => r) || null;
  const prevEp = primaryJson?.prev_ep ?? fallbackPrevEp ?? null;
  const nextEp = primaryJson?.next_ep ?? fallbackNextEp ?? null;
  const defaultStream = streams.find((s) => s.playableDirect) || streams[0] || null;

  const rawSeries = fromSeriesToken(seriesSlug);

  return {
    episodeId,
    seriesSlug: toSeriesToken(rawSeries),
    rawSeriesSlug: rawSeries,
    title: title || `${animeTitle || rawSeries} — ${episodeId}`,
    animeTitle: animeTitle || rawSeries,
    resolutions,
    defaultStreamUrl: defaultStream ? defaultStream.url : "",
    defaultResolution: defaultStream ? defaultStream.resolution : resolutions[0] || "720p",
    streams,
    downloadLinks: streams.map((s) => ({
      label: `${s.provider} (${s.resolution})`,
      resolution: s.resolution,
      provider: s.provider,
      url: s.url,
    })),
    navigation: {
      prevEpisodeId: prevEp,
      nextEpisodeId: nextEp,
      prevToken: prevEp ? toEpisodeToken(prevEp, rawSeries) : null,
      nextToken: nextEp ? toEpisodeToken(nextEp, rawSeries) : null,
    },
    sourceUrl: `${YLNIME_BASE_URL}/index.php?series=${encodeURIComponent(rawSeries)}&episode=${encodeURIComponent(episodeId)}`,
  };
}
