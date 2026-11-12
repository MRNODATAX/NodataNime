import { TtlCache } from "../utils/cache.js";
import { snapshotStore } from "./snapshotStore.js";
import {
  fromSeriesToken,
  resolvePosterUrl,
  toSeriesToken,
} from "../parsers/ylnimeParser.js";

const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co";
const ANILIST_QUERY = `
query ($search: String) {
  Media(search: $search, type: ANIME, isAdult: false) {
    bannerImage
    coverImage {
      extraLarge
      large
    }
  }
}
`;

// Host sampul hulu yang sering diblokir ISP Indonesia atau hotlink-strict -> arahkan via /api/anime/image-proxy
const ISP_BLOCKED_EXACT_HOSTS = new Set([
  "animekita.org",
  "www.animekita.org",
]);

const ISP_BLOCKED_HOST_SUFFIXES = [
  "otakudesu.blog",
  "otakudesu.cloud",
  "otakudesu.io",
];

export function isPlaceholderArtwork(url = "") {
  const s = String(url || "").trim();
  if (!s) return true;
  if (s === "/assets/no-cover.svg" || s === "/assets/no-banner.svg") return true;
  if (/\/admin\/ad_media\/|\/bad_\d+\.(?:png|jpe?g|gif|webp)/i.test(s)) return true;
  return false;
}

export function isWidescreenBannerUrl(url = "") {
  const s = String(url || "").trim();
  if (isPlaceholderArtwork(s)) return false;
  return /\/banner\//i.test(s);
}

export function shouldProxyImageForClient(url = "") {
  const s = String(url || "").trim();
  if (!s || s.startsWith("/")) return false;
  try {
    const parsed = new URL(s);
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (ISP_BLOCKED_EXACT_HOSTS.has(host)) return true;
    return ISP_BLOCKED_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`)
    );
  } catch {
    return false;
  }
}

export function toClientArtworkUrl(rawUrl = "") {
  const raw = String(rawUrl || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/api/anime/image-proxy?url=")) {
    return raw;
  }
  const resolved = resolvePosterUrl(raw);
  if (isPlaceholderArtwork(resolved)) {
    return "";
  }
  if (shouldProxyImageForClient(resolved)) {
    return `/api/anime/image-proxy?url=${encodeURIComponent(resolved)}`;
  }
  return resolved;
}

export function normalizeTitleLookupKey(title = "") {
  return String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\b(?:subtitle\s+indonesia|sub\s+indo|bahasa\s+indonesia|bd|uncensored)\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function cleanTitleForAniListSearch(title = "") {
  return String(title || "")
    .replace(/\((?:sub\s*indo|subtitle\s*indonesia|tv|bd|movie)\)/gi, " ")
    .replace(/\b(?:subtitle\s+indonesia|sub\s+indo)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

export class ArtworkResolver {
  constructor(store = snapshotStore) {
    this.store = store;
    this.bySlug = new Map();
    this.byRawSlug = new Map();
    this.byTitle = new Map();
    this.remoteCache = new TtlCache(6 * 60 * 60 * 1000, 600, 120);
    this.anilistCooldownUntil = 0;
    this._buildSnapshotIndex();
  }

  _registerEntry(item) {
    if (!item) return;
    const poster = toClientArtworkUrl(item.poster);
    const bannerCandidate = toClientArtworkUrl(item.banner);
    const banner = bannerCandidate || poster;
    if (!poster && !banner) return;

    const record = {
      poster: poster || banner,
      banner: banner || poster,
      hasWidescreenBanner: isWidescreenBannerUrl(item.banner) || isWidescreenBannerUrl(banner),
    };

    const mergeRecord = (prev, next) => {
      if (!prev) return next;
      const mergedPoster = prev.poster || next.poster;
      const mergedBanner = prev.hasWidescreenBanner
        ? prev.banner
        : next.hasWidescreenBanner
          ? next.banner
          : prev.banner || next.banner || mergedPoster;
      return {
        poster: mergedPoster,
        banner: mergedBanner,
        hasWidescreenBanner: prev.hasWidescreenBanner || next.hasWidescreenBanner,
      };
    };

    const rawSlug = String(item.rawSlug || fromSeriesToken(item.slug || "")).trim();
    const canonicalSlug = rawSlug ? toSeriesToken(rawSlug) : String(item.slug || "").trim();

    if (canonicalSlug) {
      this.bySlug.set(canonicalSlug, mergeRecord(this.bySlug.get(canonicalSlug), record));
    }
    if (rawSlug) {
      const lowerRaw = rawSlug.toLowerCase().replace(/\/+$/, "");
      this.byRawSlug.set(lowerRaw, mergeRecord(this.byRawSlug.get(lowerRaw), record));
    }
    const titleKey = normalizeTitleLookupKey(item.title);
    if (titleKey) {
      this.byTitle.set(titleKey, mergeRecord(this.byTitle.get(titleKey), record));
    }
  }

  _buildSnapshotIndex() {
    const data = this.store?.data || {};
    const pools = [
      data.banners || [],
      Object.values(data.details || {}),
      data.latestReleases || [],
      data.ongoing || [],
      data.completed || [],
      data.movies || [],
      data.rekomendasi || [],
      data.catalog || [],
    ];
    for (const pool of pools) {
      for (const item of pool) {
        this._registerEntry(item);
      }
    }
  }

  lookupSnapshotArtwork({ slug = "", rawSlug = "", title = "" } = {}) {
    const effectiveRaw = String(rawSlug || fromSeriesToken(slug || "")).trim();
    const canonical = effectiveRaw ? toSeriesToken(effectiveRaw) : String(slug || "").trim();

    if (canonical && this.bySlug.has(canonical)) {
      return this.bySlug.get(canonical);
    }
    if (effectiveRaw) {
      const lowerRaw = effectiveRaw.toLowerCase().replace(/\/+$/, "");
      if (this.byRawSlug.has(lowerRaw)) {
        return this.byRawSlug.get(lowerRaw);
      }
    }
    const titleKey = normalizeTitleLookupKey(title);
    if (titleKey && this.byTitle.has(titleKey)) {
      return this.byTitle.get(titleKey);
    }
    return null;
  }

  async fetchAniListArtwork(title = "", { fetchImpl = fetch } = {}) {
    const searchTitle = cleanTitleForAniListSearch(title);
    if (!searchTitle || searchTitle.length < 2) return null;

    const cacheKey = normalizeTitleLookupKey(searchTitle);
    const cached = this.remoteCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    if (Date.now() < this.anilistCooldownUntil) {
      return null;
    }

    try {
      const res = await fetchImpl(ANILIST_GRAPHQL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query: ANILIST_QUERY,
          variables: { search: searchTitle },
        }),
        signal: AbortSignal.timeout(1800),
      });

      if (!res.ok) {
        if (res.status >= 500 || res.status === 429) {
          this.anilistCooldownUntil = Date.now() + 60_000;
        }
        this.remoteCache.set(cacheKey, null, 5 * 60 * 1000);
        return null;
      }

      const payload = await res.json();
      const media = payload?.data?.Media;
      const poster = toClientArtworkUrl(
        media?.coverImage?.extraLarge || media?.coverImage?.large || ""
      );
      const banner = toClientArtworkUrl(media?.bannerImage || "") || poster;

      const resolved = poster || banner
        ? {
            poster: poster || banner,
            banner: banner || poster,
            hasWidescreenBanner: isWidescreenBannerUrl(banner),
          }
        : null;

      this.remoteCache.set(cacheKey, resolved);
      return resolved;
    } catch {
      // Circuit breaker 90 detik saat offline / DNS diblokir agar tidak menambah latensi request berikutnya
      this.anilistCooldownUntil = Date.now() + 90_000;
      return null;
    }
  }

  enrichCardSync(card) {
    if (!card || typeof card !== "object") return card;
    const directPoster = toClientArtworkUrl(card.poster);
    const directBanner = toClientArtworkUrl(card.banner);
    const snap = this.lookupSnapshotArtwork(card);

    const poster = directPoster || snap?.poster || directBanner || snap?.banner || "/assets/no-cover.svg";
    let banner = directBanner || snap?.banner || poster;
    if (!isWidescreenBannerUrl(banner) && snap?.hasWidescreenBanner && snap.banner) {
      banner = snap.banner;
    }

    return {
      ...card,
      poster,
      banner: banner || poster,
    };
  }

  async enrichCardList(cards = [], { allowRemoteLookup = false, maxRemoteLookups = 4 } = {}) {
    if (!Array.isArray(cards) || cards.length === 0) return [];
    const syncEnriched = cards.map((card) => this.enrichCardSync(card));

    if (!allowRemoteLookup || Date.now() < this.anilistCooldownUntil) {
      return syncEnriched;
    }

    let remoteUsed = 0;
    const tasks = syncEnriched.map(async (item) => {
      const missingPoster = isPlaceholderArtwork(item.poster);
      if (!missingPoster || remoteUsed >= maxRemoteLookups) {
        return item;
      }
      remoteUsed += 1;
      const remote = await this.fetchAniListArtwork(item.title || item.rawSlug);
      if (!remote) return item;
      const poster = isPlaceholderArtwork(item.poster) ? remote.poster : item.poster;
      const banner = isWidescreenBannerUrl(item.banner)
        ? item.banner
        : remote.banner || item.banner || poster;
      return {
        ...item,
        poster: poster || "/assets/no-cover.svg",
        banner: banner || poster || "/assets/no-cover.svg",
      };
    });

    return Promise.all(tasks);
  }

  async enrichBannerSlides(slides = [], { allowRemoteLookup = true } = {}) {
    if (!Array.isArray(slides) || slides.length === 0) return [];
    const syncSlides = slides.map((slide) => this.enrichCardSync(slide));

    const enriched =
      !allowRemoteLookup || Date.now() < this.anilistCooldownUntil
        ? syncSlides
        : await Promise.all(
            syncSlides.map(async (slide) => {
              const needsPoster = isPlaceholderArtwork(slide.poster);
              const needsWideBanner = !isWidescreenBannerUrl(slide.banner);
              if (!needsPoster && !needsWideBanner) {
                return slide;
              }
              const remote = await this.fetchAniListArtwork(slide.title || slide.rawSlug);
              if (!remote) return slide;
              const poster = needsPoster ? remote.poster || slide.poster : slide.poster;
              const banner =
                needsWideBanner && remote.hasWidescreenBanner
                  ? remote.banner
                  : !isPlaceholderArtwork(slide.banner)
                    ? slide.banner
                    : remote.banner || poster;
              return {
                ...slide,
                poster: poster || "/assets/no-cover.svg",
                banner: banner || poster || "/assets/no-cover.svg",
              };
            })
          );

    // Urutkan agar slide dengan widescreen banner sejati tampil lebih dulu di posisi utama Hero
    return [...enriched].sort((a, b) => {
      const aWide = isWidescreenBannerUrl(a.banner) && a.banner !== a.poster ? 1 : 0;
      const bWide = isWidescreenBannerUrl(b.banner) && b.banner !== b.poster ? 1 : 0;
      return bWide - aWide;
    });
  }

  async enrichDetail(detail, { allowRemoteLookup = true } = {}) {
    if (!detail || typeof detail !== "object") return detail;
    const syncDetail = this.enrichCardSync(detail);
    const recommendations = Array.isArray(syncDetail.recommendations)
      ? syncDetail.recommendations.map((r) => this.enrichCardSync(r))
      : [];

    let poster = syncDetail.poster;
    let banner = syncDetail.banner;

    const needsPoster = isPlaceholderArtwork(poster);
    const needsWideBanner = !isWidescreenBannerUrl(banner);

    if (allowRemoteLookup && (needsPoster || needsWideBanner) && Date.now() >= this.anilistCooldownUntil) {
      const remote = await this.fetchAniListArtwork(syncDetail.title || syncDetail.rawSlug);
      if (remote) {
        if (needsPoster && remote.poster) {
          poster = remote.poster;
        }
        if (needsWideBanner && remote.banner) {
          banner = remote.hasWidescreenBanner ? remote.banner : banner || remote.banner;
        }
      }
    }

    const finalPoster = isPlaceholderArtwork(poster) ? "/assets/no-cover.svg" : poster;
    const finalBanner = isPlaceholderArtwork(banner) ? finalPoster : banner;

    return {
      ...syncDetail,
      poster: finalPoster,
      banner: finalBanner,
      recommendations,
    };
  }

  async enrichHomePayload(home = {}) {
    const [banners, latestReleases, ongoing] = await Promise.all([
      this.enrichBannerSlides(home.banners || []),
      this.enrichCardList(home.latestReleases || [], { allowRemoteLookup: true, maxRemoteLookups: 4 }),
      this.enrichCardList(home.ongoing || [], { allowRemoteLookup: false }),
    ]);

    const topAnimeRaw = home.topAnime || {};
    const topAnime = Object.fromEntries(
      Object.entries(topAnimeRaw).map(([period, list]) => [
        period,
        Array.isArray(list) ? list.map((item) => this.enrichCardSync(item)) : [],
      ])
    );

    return {
      ...home,
      banners,
      topAnime,
      latestReleases,
      ongoing,
      completedPreview: (home.completedPreview || []).map((c) => this.enrichCardSync(c)),
      moviesPreview: (home.moviesPreview || []).map((c) => this.enrichCardSync(c)),
      recommendations: (home.recommendations || []).map((c) => this.enrichCardSync(c)),
    };
  }

  enrichScheduleDays(days = []) {
    if (!Array.isArray(days)) return [];
    return days.map((group) => ({
      ...group,
      animeList: Array.isArray(group.animeList)
        ? group.animeList.map((c) => this.enrichCardSync(c))
        : [],
    }));
  }
}

export const artworkResolver = new ArtworkResolver();
