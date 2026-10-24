import { appCache } from "../utils/cache.js";
import { ylnimeClient } from "../scrapers/ylnimeClient.js";
import { animeKitaClient } from "../scrapers/animekitaClient.js";
import { snapshotStore } from "./snapshotStore.js";
import { adminStore } from "./adminStore.js";
import { fromEpisodeToken, fromSeriesToken } from "../parsers/ylnimeParser.js";

/**
 * NodataNime Multi-Tier Hybrid Anime Orchestration Service
 * Tier 0: Admin Hybrid Vault (`data/admin-store.json` — Overrides, Custom Mirrors, Engine Mode)
 * Tier 1: Live `https://ylnime.com` Scraper (Session Cookie + Cheerio + `yl_ep_json=1`)
 * Tier 2: Upstream `https://apps.animekita.org/api/v1.2.5` Adapter
 * Tier 3: Verified YLnime Live Snapshot Store (100% Uptime / Sandbox-Safe)
 */
export class AnimeService {
  isLockdownMode() {
    return adminStore.getPublicConfig().engineMode === "snapshot-lockdown";
  }

  _mergeCardWithOverride(card) {
    if (!card || !card.slug) return card;
    const ov = adminStore.getCatalogOverride(card.slug);
    if (!ov) return card;
    if (ov.isHidden) return null;
    return {
      ...card,
      title: ov.title || card.title,
      poster: ov.poster || card.poster,
      banner: ov.banner || card.banner,
      score: ov.score || card.score,
      status: ov.status || card.status,
      label: ov.releaseDay || card.label,
      synopsis: ov.synopsis || card.synopsis,
      isOverridden: true,
    };
  }

  _applyCardOverrides(list = []) {
    return (list || []).map((item) => this._mergeCardWithOverride(item)).filter(Boolean);
  }

  async getHome() {
    const mode = adminStore.getPublicConfig().engineMode;
    const rawHome = await appCache.remember(`home:v2:${mode}`, async () => {
      if (this.isLockdownMode()) {
        return {
          dataSource: "hybrid-lockdown",
          ...snapshotStore.getHome(),
        };
      }
      try {
        const [liveHome, communityFeed] = await Promise.all([
          ylnimeClient.scrapeHome(),
          ylnimeClient.scrapeCommunityFeed().catch(() => snapshotStore.getCommunityFeed()),
        ]);
        const snap = snapshotStore.getHome();
        return {
          dataSource: "live-ylnime",
          banners: liveHome.banners.length ? liveHome.banners : snap.banners,
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

    // Terapkan override katalog & pinned Hero secara real-time
    const overrides = adminStore.getCatalogOverridesList().filter((o) => !o.isHidden);
    const pinnedBanners = overrides
      .filter((o) => o.pinnedHero)
      .map((o) => ({
        slug: o.slug,
        title: o.title,
        poster: o.poster,
        banner: o.banner || o.poster,
        synopsis: o.synopsis || "Pilihan Kurasi Eksklusif Studio NodataNime.",
        status: o.status || "Featured",
        score: o.score || "9.0",
        episode: "PILIHAN EDITOR",
        genres: (o.genres || []).map((g) => g.title || g),
        isPinned: true,
      }));

    const baseBanners = this._applyCardOverrides(rawHome.banners || []).filter(
      (b) => !pinnedBanners.some((p) => p.slug === b.slug)
    );

    const baseOngoing = this._applyCardOverrides(rawHome.ongoing || []);
    const customOngoing = overrides
      .filter(
        (o) =>
          !baseOngoing.some((x) => x.slug === o.slug) &&
          /ongoing|tayang/i.test(String(o.status || "Ongoing"))
      )
      .map((o) => ({
        slug: o.slug,
        title: o.title,
        poster: o.poster,
        score: o.score,
        status: o.status,
        label: o.releaseDay || "Eksklusif",
        releaseDay: o.releaseDay || "Eksklusif",
        episode: "Studio Pick",
        isOverridden: true,
      }));

    const topAnime = {};
    for (const key of ["today", "yesterday", "week", "month"]) {
      topAnime[key] = this._applyCardOverrides(rawHome.topAnime?.[key] || []);
    }

    const pubCfg = adminStore.getPublicConfig();

    return {
      ...rawHome,
      engineMode: pubCfg.engineMode,
      announcement: pubCfg.announcement,
      banners: [...pinnedBanners, ...baseBanners].slice(0, 8),
      latestReleases: this._applyCardOverrides(rawHome.latestReleases || []),
      ongoing: [...customOngoing, ...baseOngoing],
      recommendations: this._applyCardOverrides(rawHome.recommendations || []),
      topAnime,
    };
  }

  async getList(type = "ongoing", page = 1) {
    const cleanType = String(type || "ongoing").toLowerCase().trim();
    const p = Math.max(1, Number(page) || 1);
    const mode = adminStore.getPublicConfig().engineMode;

    const base = await appCache.remember(`list:${mode}:${cleanType}:${p}`, async () => {
      if (this.isLockdownMode()) {
        return {
          dataSource: "hybrid-lockdown",
          type: cleanType,
          ...snapshotStore.getList(cleanType, p),
        };
      }
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
            // Lanjut ke Tier 3
          }
        }
        return {
          dataSource: "verified-snapshot",
          type: cleanType,
          ...snapshotStore.getList(cleanType, p),
        };
      }
    });

    return {
      ...base,
      items: this._applyCardOverrides(base.items || []),
    };
  }

  async getAz(letter = "A", page = 1) {
    const initial = String(letter || "A").trim().toUpperCase();
    const p = Math.max(1, Number(page) || 1);
    const mode = adminStore.getPublicConfig().engineMode;

    const base = await appCache.remember(`az:${mode}:${initial}:${p}`, async () => {
      if (this.isLockdownMode()) {
        return {
          dataSource: "hybrid-lockdown",
          ...snapshotStore.getAz(initial, p),
        };
      }
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
            prevPage: safePage > 1 ? safePage - 1 : null,
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

    return {
      ...base,
      items: this._applyCardOverrides(base.items || []),
    };
  }

  async getGenres() {
    const mode = adminStore.getPublicConfig().engineMode;
    return appCache.remember(`genres:${mode}:all`, async () => {
      if (this.isLockdownMode()) {
        return { dataSource: "hybrid-lockdown", items: snapshotStore.getGenres() };
      }
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
    const mode = adminStore.getPublicConfig().engineMode;

    const base = await appCache.remember(`genre:${mode}:${g}:${p}`, async () => {
      if (this.isLockdownMode()) {
        return {
          dataSource: "hybrid-lockdown",
          ...snapshotStore.getByGenre(g, p),
        };
      }
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

    return {
      ...base,
      items: this._applyCardOverrides(base.items || []),
    };
  }

  async getSchedule() {
    const mode = adminStore.getPublicConfig().engineMode;
    const base = await appCache.remember(`schedule:${mode}:weekly`, async () => {
      if (this.isLockdownMode()) {
        return { dataSource: "hybrid-lockdown", days: snapshotStore.getSchedule() };
      }
      try {
        const days = await ylnimeClient.scrapeSchedule();
        return { dataSource: "live-ylnime", days };
      } catch {
        return { dataSource: "verified-snapshot", days: snapshotStore.getSchedule() };
      }
    });

    return {
      ...base,
      days: (base.days || []).map((d) => ({
        ...d,
        animeList: this._applyCardOverrides(d.animeList || []),
      })),
    };
  }

  async search(query = "") {
    const q = String(query || "").trim();
    if (!q) return { dataSource: "none", query: "", items: [] };
    const mode = adminStore.getPublicConfig().engineMode;

    const base = await appCache.remember(`search:${mode}:${q.toLowerCase()}`, async () => {
      if (this.isLockdownMode()) {
        return {
          dataSource: "hybrid-lockdown",
          query: q,
          items: snapshotStore.search(q),
        };
      }
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
          // Lanjut ke Tier 3
        }
        return {
          dataSource: "verified-snapshot",
          query: q,
          items: snapshotStore.search(q),
        };
      }
    });

    const qLower = q.toLowerCase();
    const customMatches = adminStore
      .getCatalogOverridesList()
      .filter(
        (o) =>
          !o.isHidden &&
          (o.title.toLowerCase().includes(qLower) || o.slug.toLowerCase().includes(qLower))
      )
      .map((o) => ({
        slug: o.slug,
        title: o.title,
        poster: o.poster,
        score: o.score,
        status: o.status,
        isOverridden: true,
      }));

    const filteredBase = this._applyCardOverrides(base.items || []).filter(
      (x) => !customMatches.some((c) => c.slug === x.slug)
    );

    return {
      ...base,
      items: [...customMatches, ...filteredBase],
    };
  }

  async getDetail(slug = "") {
    const clean = String(slug || "").trim();
    if (!clean) return null;

    const override = adminStore.getCatalogOverride(clean);
    if (override?.isHidden) {
      return null;
    }

    const mode = adminStore.getPublicConfig().engineMode;
    let detail = await appCache.remember(`detail:${mode}:${clean}`, async () => {
      if (this.isLockdownMode()) {
        const fallback = snapshotStore.getDetail(clean);
        return fallback ? { dataSource: "hybrid-lockdown", ...fallback } : null;
      }
      try {
        const liveDetail = await ylnimeClient.scrapeDetail(clean);
        return { dataSource: "live-ylnime", ...liveDetail };
      } catch {
        const fallback = snapshotStore.getDetail(clean);
        if (!fallback) return null;
        return { dataSource: "verified-snapshot", ...fallback };
      }
    });

    const customEps = adminStore.getCustomEpisodesForSeries(clean);

    // Jika anime murni dibuat manual lewat Admin Studio (tidak ada di scraper/snapshot)
    if (!detail && override) {
      detail = {
        dataSource: "hybrid-admin",
        slug: override.slug,
        title: override.title,
        poster: override.poster,
        banner: override.banner || override.poster,
        synopsis: override.synopsis || "Ditambahkan melalui Studio Admin NodataNime.",
        score: override.score || "8.9",
        status: override.status || "Ongoing",
        type: override.type || "TV",
        year: override.year || "2026",
        genres: override.genres || [],
        episodes: customEps.length
          ? customEps
          : [
              {
                episodeId: `${override.slug}-ep-1`,
                number: 1,
                title: "Episode 1",
                date: "Studio Mirror",
              },
            ],
        recommendations: snapshotStore.getHome().recommendations.slice(0, 6),
      };
    }

    if (!detail) return null;

    const baseEpisodes = [...(detail.episodes || [])];
    for (const ce of customEps) {
      if (!baseEpisodes.some((e) => e.episodeId === ce.episodeId)) {
        baseEpisodes.unshift(ce);
      }
    }

    if (!override) {
      return {
        ...detail,
        totalEpisodes: baseEpisodes.length,
        episodes: baseEpisodes,
      };
    }

    return {
      ...detail,
      title: override.title || detail.title,
      poster: override.poster || detail.poster,
      banner: override.banner || detail.banner,
      synopsis: override.synopsis || detail.synopsis,
      score: override.score || detail.score,
      status: override.status || detail.status,
      type: override.type || detail.type,
      year: override.year || detail.year,
      genres: override.genres?.length ? override.genres : detail.genres,
      totalEpisodes: baseEpisodes.length,
      episodes: baseEpisodes,
      isOverridden: true,
    };
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
    const mode = adminStore.getPublicConfig().engineMode;
    const cacheKey = `ep:${mode}:${fromSeriesToken(seriesSlug)}:${episodeId}:${epNum ?? ""}`;

    let result = await appCache.remember(cacheKey, async () => {
      if (this.isLockdownMode()) {
        return {
          dataSource: "hybrid-lockdown",
          ...snapshotStore.getEpisode({
            seriesSlug,
            episodeId,
            epNumber: epNum,
          }),
        };
      }
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

    // Suntikkan Mirror Prioritas Admin di urutan pertama
    const resolvedSeries = result.seriesSlug || seriesSlug;
    const resolvedEpId = result.episodeId || episodeId;
    const streamOv =
      adminStore.getStreamOverride(resolvedSeries, resolvedEpId) ||
      adminStore.getStreamOverride(seriesSlug, episodeId);

    if (streamOv && streamOv.mirrors?.length) {
      const detail = resolvedSeries ? await this.getDetail(resolvedSeries).catch(() => null) : null;
      const mergedStreams = [
        ...streamOv.mirrors,
        ...(result.streams || []).filter(
          (s) => !streamOv.mirrors.some((m) => m.url === s.url)
        ),
      ];
      result = {
        ...result,
        dataSource: "hybrid-admin",
        seriesSlug: resolvedSeries,
        episodeId: resolvedEpId,
        animeTitle: detail?.title || result.animeTitle,
        title: `${detail?.title || result.animeTitle} — ${streamOv.episodeTitle || "Episode"}`,
        poster: detail?.poster || result.poster,
        episodes: detail?.episodes || result.episodes || [],
        defaultStreamUrl: mergedStreams[0]?.url || result.defaultStreamUrl,
        streams: mergedStreams,
      };
    }

    return result;
  }

  async getCommunity() {
    let externalFeed = snapshotStore.getCommunityFeed();
    if (!this.isLockdownMode()) {
      const liveFeed = await appCache
        .remember("community:external:v1", () => ylnimeClient.scrapeCommunityFeed(), 90_000)
        .catch(() => null);
      if (Array.isArray(liveFeed) && liveFeed.length > 0) {
        externalFeed = liveFeed;
      }
    }
    return adminStore.getCommunityPayload(externalFeed);
  }

  getHealth() {
    const pub = adminStore.getPublicConfig();
    return {
      app: "NodataNime",
      version: "1.0.0",
      status: "ok",
      engineMode: pub.engineMode,
      timestamp: new Date().toISOString(),
      targetSource: "https://ylnime.com",
      scrapers: {
        ylnime: ylnimeClient.lastStatus,
        animekitaUpstream: animeKitaClient.lastStatus,
        snapshotCatalogCount: snapshotStore.data.catalog.length,
        adminCatalogOverrides: pub.overrideCount,
        adminStreamMirrors: pub.customStreamCount,
      },
      cache: appCache.getStats(),
    };
  }
}

export const animeService = new AnimeService();
