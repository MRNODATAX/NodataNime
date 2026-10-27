import { appCache, TtlCache } from "../utils/cache.js";
import { ylnimeClient } from "../scrapers/ylnimeClient.js";
import { animeKitaClient } from "../scrapers/animekitaClient.js";
import { snapshotStore } from "./snapshotStore.js";
import { communityStore } from "./communityStore.js";
import {
  fromEpisodeToken,
  fromSeriesToken,
  toSeriesToken,
} from "../parsers/ylnimeParser.js";

const searchCardCache = new TtlCache(30 * 60 * 1000, 400, 60);

function rememberSearchCards(items = []) {
  for (const item of items) {
    if (!item?.slug) continue;
    const canonicalToken = toSeriesToken(fromSeriesToken(item.slug));
    searchCardCache.set(canonicalToken, item);
  }
}

function buildDetailFromCachedCard(card) {
  if (!card) return null;
  const isMovie = /movie/i.test(card.status);
  return {
    title: card.title || card.rawSlug || "Anime",
    slug: card.slug,
    rawSlug: card.rawSlug || fromSeriesToken(card.slug),
    poster: card.poster || "/assets/no-cover.svg",
    banner: card.banner || card.poster || "/assets/no-cover.svg",
    score: card.score || "8.0",
    status: card.status || "Anime",
    type: isMovie ? "Movie" : "TV",
    year: "2026",
    synopsis: `Tonton ${card.title || "anime ini"} subtitle Indonesia kualitas HD di NodataNime.`,
    totalEpisodes: 0,
    genres: [],
    episodes: [],
    recommendations: snapshotStore.data.rekomendasi.slice(0, 6),
    sourceUrl: card.sourceUrl || `https://ylnime.com/index.php?series=${encodeURIComponent(card.rawSlug || card.slug)}`,
  };
}

/**
 * NodataNime Multi-Tier Scraper Orchestration Service
 * Tier 1: Live `https://ylnime.com` Scraper (Session Cookie + Cheerio + `yl_ep_json=1`)
 * Tier 2: Upstream `https://apps.animekita.org/api/v1.2.5` Adapter
 * Tier 3: Verified YLnime Live Snapshot Store (100% Uptime Fallback)
 */
export class AnimeService {
  async getHome() {
    return appCache.remember("home:v3", async () => {
      try {
        const [liveHome, communityFeed] = await Promise.all([
          ylnimeClient.scrapeHome(),
          ylnimeClient.scrapeCommunityFeed().catch(() => snapshotStore.getCommunityFeed()),
        ]);
        const snap = snapshotStore.getHome();
        return {
          dataSource: "live-ylnime",
          banners: (liveHome.banners.length ? liveHome.banners : snap.banners).slice(0, 8),
          topAnime: liveHome.topAnime.today.length ? liveHome.topAnime : snap.topAnime,
          latestReleases: liveHome.latestReleases.length ? liveHome.latestReleases : snap.latestReleases,
          ongoing: liveHome.ongoing.length ? liveHome.ongoing : snap.ongoing,
          completedPreview: snap.completedPreview,
          moviesPreview: snap.moviesPreview,
          recommendations: snap.recommendations,
          genres: snap.genres,
          communityFeed,
        };
      } catch {
        return {
          dataSource: "verified-snapshot",
          ...snapshotStore.getHome(),
        };
      }
    });
  }

  async getList(type = "ongoing", page = 1) {
    const cleanType = String(type || "ongoing").toLowerCase().trim();
    const p = Math.min(500, Math.max(1, Number.parseInt(page, 10) || 1));

    return appCache.remember(`list:${cleanType}:${p}`, async () => {
      try {
        const live = await ylnimeClient.scrapeList(cleanType, p);
        return { dataSource: "live-ylnime", type: cleanType, ...live };
      } catch {
        if (cleanType === "baru") {
          try {
            const upstream = await animeKitaClient.fetchLatest(p);
            if (upstream.length > 0) {
              return {
                dataSource: "upstream-animekita",
                type: cleanType,
                items: upstream,
                pagination: {
                  currentPage: p,
                  prevPage: p > 1 ? p - 1 : null,
                  nextPage: p + 1,
                  totalPages: p + 1,
                  hasPrevPage: p > 1,
                  hasNextPage: true,
                },
              };
            }
          } catch {
            // Lanjut ke Tier 3 Snapshot
          }
        }
        return {
          dataSource: "verified-snapshot",
          type: cleanType,
          ...snapshotStore.getList(cleanType, p),
        };
      }
    });
  }

  async getAz(letter = "A", page = 1) {
    const initial = String(letter || "A").trim().toUpperCase();
    const p = Math.max(1, Number(page) || 1);

    return appCache.remember(`az:${initial}:${p}`, async () => {
      try {
        const live = await ylnimeClient.scrapeAz(initial);
        const pageSize = 24;
        const totalPages = Math.max(1, Math.ceil(live.items.length / pageSize));
        const safePage = Math.min(p, totalPages);
        return {
          dataSource: "live-ylnime",
          letter: live.letter,
          items: live.items.slice((safePage - 1) * pageSize, safePage * pageSize),
          pagination: {
            currentPage: safePage,
            prevPage: safePage > 1 ? p - 1 : null,
            nextPage: safePage < totalPages ? safePage + 1 : null,
            totalPages,
            totalItems: live.items.length,
            hasPrevPage: safePage > 1,
            hasNextPage: safePage < totalPages,
          },
        };
      } catch {
        return {
          dataSource: "verified-snapshot",
          ...snapshotStore.getAz(initial, p),
        };
      }
    });
  }

  async getGenres() {
    return appCache.remember("genres:all", async () => {
      try {
        const items = await ylnimeClient.scrapeGenres();
        return { dataSource: "live-ylnime", items };
      } catch {
        return { dataSource: "verified-snapshot", items: snapshotStore.getGenres() };
      }
    });
  }

  async getByGenre(genreId = "action", page = 1) {
    const g = String(genreId || "action").toLowerCase().trim();
    const p = Math.max(1, Number(page) || 1);

    return appCache.remember(`genre:${g}:${p}`, async () => {
      try {
        const live = await ylnimeClient.scrapeByGenre(g, p);
        return { dataSource: "live-ylnime", ...live };
      } catch {
        return {
          dataSource: "verified-snapshot",
          ...snapshotStore.getByGenre(g, p),
        };
      }
    });
  }

  async getSchedule() {
    return appCache.remember("schedule:weekly", async () => {
      try {
        const days = await ylnimeClient.scrapeSchedule();
        return { dataSource: "live-ylnime", days };
      } catch {
        return { dataSource: "verified-snapshot", days: snapshotStore.getSchedule() };
      }
    });
  }

  async search(query = "") {
    const q = String(query || "").trim().slice(0, 100);
    if (!q) return { dataSource: "none", query: "", items: [] };

    return appCache.remember(`search:${q.toLowerCase()}`, async () => {
      try {
        const liveItems = await ylnimeClient.scrapeSearch(q);
        if (liveItems.length > 0) {
          rememberSearchCards(liveItems);
          return { dataSource: "live-ylnime", query: q, items: liveItems };
        }
        const upstreamOnEmpty = await animeKitaClient.fetchSearch(q).catch(() => []);
        if (upstreamOnEmpty.length > 0) {
          rememberSearchCards(upstreamOnEmpty);
          return { dataSource: "upstream-animekita", query: q, items: upstreamOnEmpty };
        }
        return { dataSource: "live-ylnime", query: q, items: [] };
      } catch {
        try {
          const upstreamItems = await animeKitaClient.fetchSearch(q);
          if (upstreamItems.length > 0) {
            rememberSearchCards(upstreamItems);
            return { dataSource: "upstream-animekita", query: q, items: upstreamItems };
          }
        } catch {
          // Lanjut ke Tier 3 Snapshot
        }
        return {
          dataSource: "verified-snapshot",
          query: q,
          items: snapshotStore.search(q),
        };
      }
    });
  }

  async getDetail(slug = "") {
    const clean = String(slug || "").trim();
    if (!clean) return null;

    const cachedFullDetail = appCache.get(`detail:${clean}`);
    if (cachedFullDetail) return cachedFullDetail;

    try {
      const liveDetail = await ylnimeClient.scrapeDetail(clean);
      const payload = { dataSource: "live-ylnime", ...liveDetail };
      appCache.set(`detail:${clean}`, payload);
      return payload;
    } catch {
      const fallback = snapshotStore.getDetail(clean);
      if (fallback) {
        const payload = { dataSource: "verified-snapshot", ...fallback };
        appCache.set(`detail:${clean}`, payload);
        return payload;
      }
      const canonicalToken = toSeriesToken(fromSeriesToken(clean));
      const cardFallback = buildDetailFromCachedCard(searchCardCache.get(canonicalToken));
      if (cardFallback) {
        return { dataSource: "search-card-cache", ...cardFallback };
      }
      return null;
    }
  }

  async getEpisode({ token = "", series = "", episode = "", ep = null }) {
    let seriesSlug = String(series || "").trim();
    let episodeId = String(episode || "").trim();

    if (token) {
      const decoded = fromEpisodeToken(token);
      episodeId = episodeId || decoded.episodeId;
      seriesSlug = seriesSlug || decoded.seriesSlug;
    }

    const epNum = ep != null && ep !== "" ? Number(ep) : null;
    const cacheKey = `ep:${fromSeriesToken(seriesSlug)}:${episodeId}:${epNum ?? ""}`;

    return appCache.remember(cacheKey, async () => {
      try {
        const [liveEp, detail] = await Promise.all([
          ylnimeClient.scrapeEpisode({
            seriesSlug,
            episodeId,
            epNumber: epNum,
          }),
          seriesSlug ? this.getDetail(seriesSlug).catch(() => null) : Promise.resolve(null),
        ]);
        return {
          dataSource: "live-ylnime",
          ...liveEp,
          poster: detail?.poster || "/assets/no-cover.svg",
          episodes: detail?.episodes || [],
        };
      } catch {
        return {
          dataSource: "verified-snapshot",
          ...snapshotStore.getEpisode({
            seriesSlug,
            episodeId,
            epNumber: epNum,
          }),
        };
      }
    });
  }

  async getCommunity() {
    let externalFeed = snapshotStore.getCommunityFeed();
    const liveFeed = await appCache
      .remember("community:external:v1", () => ylnimeClient.scrapeCommunityFeed(), 90_000)
      .catch(() => null);
    if (Array.isArray(liveFeed) && liveFeed.length > 0) {
      externalFeed = liveFeed;
    }
    return communityStore.getCommunityPayload(externalFeed);
  }

  getHealth() {
    return {
      app: "NodataNime",
      version: "1.3.0",
      status: "ok",
      engineMode: "multi-tier-scraper",
      timestamp: new Date().toISOString(),
      targetSource: "https://ylnime.com",
      scrapers: {
        ylnime: ylnimeClient.lastStatus,
        animekitaUpstream: animeKitaClient.lastStatus,
        snapshotCatalogCount: snapshotStore.data.catalog.length,
      },
      cache: appCache.getStats(),
    };
  }
}

export const animeService = new AnimeService();
