import { appCache } from "../utils/cache.js";
import { ylnimeClient } from "../scrapers/ylnimeClient.js";
import { animeKitaClient } from "../scrapers/animekitaClient.js";
import { snapshotStore } from "./snapshotStore.js";
import { communityStore } from "./communityStore.js";
import { fromEpisodeToken, fromSeriesToken } from "../parsers/ylnimeParser.js";

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
    const p = Math.max(1, Number(page) || 1);

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
    const q = String(query || "").trim();
    if (!q) return { dataSource: "none", query: "", items: [] };

    return appCache.remember(`search:${q.toLowerCase()}`, async () => {
      try {
        const liveItems = await ylnimeClient.scrapeSearch(q);
        const snapItems = snapshotStore.search(q);
        const seen = new Set(liveItems.map((i) => i.slug));
        const merged = [
          ...liveItems,
          ...snapItems.filter((i) => !seen.has(i.slug)),
        ];
        return { dataSource: "live-ylnime", query: q, items: merged };
      } catch {
        try {
          const upstreamItems = await animeKitaClient.fetchSearch(q);
          if (upstreamItems.length > 0) {
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

    return appCache.remember(`detail:${clean}`, async () => {
      try {
        const liveDetail = await ylnimeClient.scrapeDetail(clean);
        return { dataSource: "live-ylnime", ...liveDetail };
      } catch {
        const fallback = snapshotStore.getDetail(clean);
        if (!fallback) return null;
        return { dataSource: "verified-snapshot", ...fallback };
      }
    });
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
