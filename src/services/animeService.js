import { appCache, TtlCache } from "../utils/cache.js";
import { ylnimeClient } from "../scrapers/ylnimeClient.js";
import { animeKitaClient } from "../scrapers/animekitaClient.js";
import { snapshotStore } from "./snapshotStore.js";
import { communityStore } from "./communityStore.js";
import { artworkResolver } from "./artworkResolver.js";
import {
  fromEpisodeToken,
  fromSeriesToken,
  normalizeEpisodeStreams,
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
    return appCache.remember("home:v4", async () => {
      try {
        const [liveHome, communityFeed] = await Promise.all([
          ylnimeClient.scrapeHome(),
          ylnimeClient.scrapeCommunityFeed().catch(() => snapshotStore.getCommunityFeed()),
        ]);
        const snap = snapshotStore.getHome();
        const rawHome = {
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
        return artworkResolver.enrichHomePayload(rawHome);
      } catch {
        const snapHome = {
          dataSource: "verified-snapshot",
          ...snapshotStore.getHome(),
        };
        return artworkResolver.enrichHomePayload(snapHome);
      }
    });
  }

  async getList(type = "ongoing", page = 1) {
    const cleanType = String(type || "ongoing").toLowerCase().trim();
    const p = Math.min(500, Math.max(1, Number.parseInt(page, 10) || 1));

    return appCache.remember(`list:${cleanType}:${p}`, async () => {
      try {
        const live = await ylnimeClient.scrapeList(cleanType, p);
        const items = await artworkResolver.enrichCardList(live.items || [], {
          allowRemoteLookup: true,
          maxRemoteLookups: 4,
        });
        return { dataSource: "live-ylnime", type: cleanType, ...live, items };
      } catch {
        if (cleanType === "baru") {
          try {
            const upstream = await animeKitaClient.fetchLatest(p);
            if (upstream.length > 0) {
              const items = await artworkResolver.enrichCardList(upstream, {
                allowRemoteLookup: true,
                maxRemoteLookups: 4,
              });
              return {
                dataSource: "upstream-animekita",
                type: cleanType,
                items,
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
        const snapList = snapshotStore.getList(cleanType, p);
        return {
          dataSource: "verified-snapshot",
          type: cleanType,
          ...snapList,
          items: (snapList.items || []).map((c) => artworkResolver.enrichCardSync(c)),
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
        const pageItems = live.items.slice((safePage - 1) * pageSize, safePage * pageSize);
        const items = await artworkResolver.enrichCardList(pageItems, {
          allowRemoteLookup: true,
          maxRemoteLookups: 4,
        });
        return {
          dataSource: "live-ylnime",
          letter: live.letter,
          items,
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
        const snapAz = snapshotStore.getAz(initial, p);
        return {
          dataSource: "verified-snapshot",
          ...snapAz,
          items: (snapAz.items || []).map((c) => artworkResolver.enrichCardSync(c)),
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
        const items = await artworkResolver.enrichCardList(live.items || [], {
          allowRemoteLookup: true,
          maxRemoteLookups: 4,
        });
        return { dataSource: "live-ylnime", ...live, items };
      } catch {
        const snapGenre = snapshotStore.getByGenre(g, p);
        return {
          dataSource: "verified-snapshot",
          ...snapGenre,
          items: (snapGenre.items || []).map((c) => artworkResolver.enrichCardSync(c)),
        };
      }
    });
  }

  async getSchedule() {
    return appCache.remember("schedule:weekly", async () => {
      try {
        const days = await ylnimeClient.scrapeSchedule();
        return { dataSource: "live-ylnime", days: artworkResolver.enrichScheduleDays(days) };
      } catch {
        return {
          dataSource: "verified-snapshot",
          days: artworkResolver.enrichScheduleDays(snapshotStore.getSchedule()),
        };
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
          const items = await artworkResolver.enrichCardList(liveItems, {
            allowRemoteLookup: true,
            maxRemoteLookups: 4,
          });
          rememberSearchCards(items);
          return { dataSource: "live-ylnime", query: q, items };
        }
        const upstreamOnEmpty = await animeKitaClient.fetchSearch(q).catch(() => []);
        if (upstreamOnEmpty.length > 0) {
          const items = await artworkResolver.enrichCardList(upstreamOnEmpty, {
            allowRemoteLookup: true,
            maxRemoteLookups: 4,
          });
          rememberSearchCards(items);
          return { dataSource: "upstream-animekita", query: q, items };
        }
        return { dataSource: "live-ylnime", query: q, items: [] };
      } catch {
        try {
          const upstreamItems = await animeKitaClient.fetchSearch(q);
          if (upstreamItems.length > 0) {
            const items = await artworkResolver.enrichCardList(upstreamItems, {
              allowRemoteLookup: true,
              maxRemoteLookups: 4,
            });
            rememberSearchCards(items);
            return { dataSource: "upstream-animekita", query: q, items };
          }
        } catch {
          // Lanjut ke Tier 3 Snapshot
        }
        return {
          dataSource: "verified-snapshot",
          query: q,
          items: snapshotStore.search(q).map((c) => artworkResolver.enrichCardSync(c)),
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
      const enriched = await artworkResolver.enrichDetail(liveDetail, { allowRemoteLookup: true });
      const payload = { dataSource: "live-ylnime", ...enriched };
      appCache.set(`detail:${clean}`, payload);
      return payload;
    } catch {
      const fallback = snapshotStore.getDetail(clean);
      if (fallback) {
        const enriched = await artworkResolver.enrichDetail(fallback, { allowRemoteLookup: false });
        const payload = { dataSource: "verified-snapshot", ...enriched };
        appCache.set(`detail:${clean}`, payload);
        return payload;
      }
      const canonicalToken = toSeriesToken(fromSeriesToken(clean));
      const cardFallback = buildDetailFromCachedCard(searchCardCache.get(canonicalToken));
      if (cardFallback) {
        const enriched = await artworkResolver.enrichDetail(cardFallback, { allowRemoteLookup: true });
        return { dataSource: "search-card-cache", ...enriched };
      }
      return null;
    }
  }

  async getEpisode({ token = "", series = "", episode = "", ep = null, refresh = false }) {
    let seriesSlug = String(series || "").trim();
    let episodeId = String(episode || "").trim();

    if (token) {
      const decoded = fromEpisodeToken(token);
      episodeId = episodeId || decoded.episodeId;
      seriesSlug = seriesSlug || decoded.seriesSlug;
    }

    const epNum = ep != null && ep !== "" ? Number(ep) : null;
    const rawSeriesSlug = fromSeriesToken(seriesSlug);
    const cacheKey = `ep:${rawSeriesSlug}:${episodeId}:${epNum ?? ""}`;

    if (refresh) {
      ylnimeClient.cooldownUntil = 0;
      ylnimeClient.consecutiveTimeouts = 0;
      animeKitaClient.cooldownUntil = 0;
    } else {
      const cachedEp = appCache.get(cacheKey);
      if (cachedEp && cachedEp.streamAvailable && Array.isArray(cachedEp.streams) && cachedEp.streams.length > 0) {
        return cachedEp;
      }
    }

    const detail = seriesSlug ? await this.getDetail(seriesSlug).catch(() => null) : null;
    let resolvedEpisodeId = episodeId ? fromSeriesToken(episodeId) : "";
    if (!resolvedEpisodeId && detail && Array.isArray(detail.episodes) && detail.episodes.length > 0) {
      const matched =
        epNum != null
          ? detail.episodes.find((e) => Number(e.number) === epNum)
          : detail.episodes[0];
      if (matched?.episodeId) {
        resolvedEpisodeId = matched.episodeId;
      }
    }

    const matchedDetailEp =
      detail && resolvedEpisodeId
        ? (detail.episodes || []).find((e) => e.episodeId === resolvedEpisodeId) || null
        : null;

    let detailPrevEp = null;
    let detailNextEp = null;
    if (detail && matchedDetailEp) {
      const idx = detail.episodes.findIndex((e) => e.episodeId === matchedDetailEp.episodeId);
      if (idx !== -1) {
        if (idx + 1 < detail.episodes.length) detailPrevEp = detail.episodes[idx + 1].episodeId;
        if (idx - 1 >= 0) detailNextEp = detail.episodes[idx - 1].episodeId;
      }
    }

    const buildArtworkFields = (animeTitleHint = "") => {
      const snapArtwork = artworkResolver.lookupSnapshotArtwork({
        slug: seriesSlug,
        title: animeTitleHint || detail?.title,
      });
      const poster = detail?.poster || snapArtwork?.poster || "/assets/no-cover.svg";
      const banner = detail?.banner || snapArtwork?.banner || poster;
      return { poster, banner };
    };

    // Tier 1: Live YLnime Scraper (2-stage session-safe multi-resolusi + inline HTML fallback)
    try {
      const liveEp = await ylnimeClient.scrapeEpisode({
        seriesSlug,
        episodeId: resolvedEpisodeId || episodeId,
        epNumber: epNum,
      });
      const { poster, banner } = buildArtworkFields(liveEp?.animeTitle);
      const payload = {
        dataSource: "live-ylnime",
        ...liveEp,
        episodeFound: true,
        streamAvailable: liveEp.streams.length > 0,
        poster,
        banner,
        episodes: detail?.episodes || [],
      };
      if (payload.streamAvailable) {
        appCache.set(cacheKey, payload);
      }
      return payload;
    } catch {
      // Lanjut ke Tier 2 Upstream AnimeKita
    }

    // Tier 2: Upstream AnimeKita Episode Stream Adapter (`series/episode/data.php`)
    if (resolvedEpisodeId) {
      try {
        const upstreamEp = await animeKitaClient.fetchEpisodePayload(resolvedEpisodeId);
        if (upstreamEp.rawStreams.length > 0) {
          const epSuffix = matchedDetailEp?.title || (epNum != null ? `Episode ${epNum}` : resolvedEpisodeId);
          const animeTitle = detail?.title || rawSeriesSlug || "Anime";
          const normalized = normalizeEpisodeStreams({
            episodeId: resolvedEpisodeId,
            seriesSlug: detail?.rawSlug || rawSeriesSlug,
            title: `${animeTitle} — ${epSuffix}`,
            animeTitle,
            jsonResponses: [
              {
                ok: true,
                reso_dipakai: "720p",
                streams: upstreamEp.rawStreams,
                prev_ep: upstreamEp.prevEp ?? detailPrevEp,
                next_ep: upstreamEp.nextEp ?? detailNextEp,
              },
            ],
            fallbackPrevEp: detailPrevEp,
            fallbackNextEp: detailNextEp,
          });
          if (normalized.streams.length > 0) {
            const { poster, banner } = buildArtworkFields(animeTitle);
            const payload = {
              dataSource: "upstream-animekita",
              ...normalized,
              episodeFound: true,
              streamAvailable: true,
              poster,
              banner,
              episodes: detail?.episodes || [],
            };
            appCache.set(cacheKey, payload);
            return payload;
          }
        }
      } catch {
        // Lanjut ke Tier 3 Snapshot
      }
    }

    // Tier 3: Verified Local Snapshot (JANGAN di-cache jika stream kosong agar retry langsung mencoba live kembali)
    const snapEp = snapshotStore.getEpisode({
      seriesSlug,
      episodeId: resolvedEpisodeId || episodeId,
      epNumber: epNum,
    });
    const effectiveAnimeTitle = detail?.title || snapEp.animeTitle;
    const effectiveEpSuffix =
      matchedDetailEp?.title ||
      (epNum != null ? `Episode ${epNum}` : resolvedEpisodeId || episodeId);
    const enrichedArtwork = artworkResolver.enrichCardSync({
      slug: seriesSlug,
      title: effectiveAnimeTitle,
      poster: detail?.poster || snapEp.poster,
      banner: detail?.banner || snapEp.banner,
    });
    const fallbackPayload = {
      dataSource: "verified-snapshot",
      ...snapEp,
      title: detail?.title ? `${detail.title} — ${effectiveEpSuffix}` : snapEp.title,
      animeTitle: effectiveAnimeTitle,
      episodeFound: Boolean(snapEp.episodeFound || matchedDetailEp),
      poster: enrichedArtwork.poster,
      banner: enrichedArtwork.banner,
      episodes: detail?.episodes?.length ? detail.episodes : snapEp.episodes || [],
    };
    if (fallbackPayload.streamAvailable) {
      appCache.set(cacheKey, fallbackPayload);
    }
    return fallbackPayload;
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
