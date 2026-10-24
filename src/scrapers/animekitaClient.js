import { toSeriesToken, classifyStreamProvider } from "../parsers/ylnimeParser.js";

const ANIMEKITA_BASE = "https://apps.animekita.org/api/v1.2.5";
const DART_UA = "Dart/3.9 (dart:io)";
const FLUTTER_UA = "Flutter/2.5.3";
const EPISODE_TOKEN =
  "75504c37d8b97486a1211245f2fb21691ac11a791180d26ca2b0b2e85eaffb814185e2250e111b9abeee15ccb1eba55c2b880e335e124c02d517509ee377939d87053383ee0243354230a7a71eb88ffd71752be22f8f2d234884788f70c776ddf2beccfa";

class AnimeKitaClient {
  constructor() {
    this.baseUrl = process.env.ANIMEKITA_BASE_URL || ANIMEKITA_BASE;
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

  async requestJson(endpoint, options = {}) {
    if (this.isCoolingDown()) {
      throw new Error(`AnimeKita circuit open (${this.lastStatus.lastError || "unreachable"})`);
    }
    const url = `${this.baseUrl}/${endpoint.replace(/^\//, "")}`;
    try {
      const res = await fetch(url, {
        method: options.method || "GET",
        headers: {
          "User-Agent": options.userAgent || DART_UA,
          Accept: "application/json",
          ...(options.headers || {}),
        },
        body: options.body,
        signal: AbortSignal.timeout(3500),
      });
      if (!res.ok) {
        throw new Error(`AnimeKita HTTP ${res.status}`);
      }
      const json = await res.json();
      this.cooldownUntil = 0;
      this.lastStatus = {
        reachable: true,
        lastCheckedAt: new Date().toISOString(),
        lastError: null,
      };
      return json;
    } catch (err) {
      this.cooldownUntil = Date.now() + 60_000;
      this.lastStatus = {
        reachable: false,
        lastCheckedAt: new Date().toISOString(),
        lastError: err?.message || String(err),
      };
      throw err;
    }
  }

  mapCard(item = {}) {
    const rawSlug = String(item.url || item.series_url || item.slug || "")
      .replace(/^https?:\/\/[^/]+\/?/i, "")
      .replace(/^\?series=/i, "");
    if (!rawSlug) return null;
    return {
      title: String(item.judul || item.title || rawSlug).trim(),
      slug: toSeriesToken(rawSlug),
      rawSlug,
      poster: item.cover || item.image || "/assets/no-cover.svg",
      score: String(item.rating || item.score || ""),
      status: item.status || item.type || "Anime",
      label: item.lastch || item.hari || "",
      episode: item.lastch || "",
      episodeId: "",
      views: item.views || "",
      sourceUrl: `https://ylnime.com/index.php?series=${encodeURIComponent(rawSlug)}`,
    };
  }

  async fetchLatest(page = 1) {
    const json = await this.requestJson(`baruupload.php?page=${page}`);
    const list = Array.isArray(json) ? json : json?.data || [];
    return list.map((x) => this.mapCard(x)).filter(Boolean);
  }

  async fetchSearch(keyword) {
    const json = await this.requestJson(`search.php?keyword=${encodeURIComponent(keyword)}`);
    const list = Array.isArray(json) ? json : json?.data?.[0]?.result || json?.data || [];
    return list.map((x) => this.mapCard(x)).filter(Boolean);
  }

  async fetchEpisodeStreams(episodeUrlOrId) {
    const json = await this.requestJson(
      `series/episode/data.php?url=${encodeURIComponent(episodeUrlOrId)}`,
      {
        method: "POST",
        userAgent: FLUTTER_UA,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: JSON.stringify({ token: EPISODE_TOKEN, mirror: "" }),
      }
    );
    const data = json?.data?.[0] || {};
    const streamList = Array.isArray(data.stream) ? data.stream : [];
    return streamList.map((s, idx) => {
      const meta = classifyStreamProvider(s.link, s.provide);
      return {
        id: s.id || idx + 1,
        label: `${meta.provider} ${s.reso || "720p"}`,
        resolution: s.reso || "720p",
        resolutionRank: Number.parseInt(s.reso, 10) || 720,
        url: s.link,
        proxyUrl: `/api/anime/stream-proxy?url=${encodeURIComponent(s.link)}`,
        provider: meta.provider,
        providerId: meta.providerId,
        type: meta.type,
        playableDirect: meta.playableDirect,
        recommendedReferer: meta.recommendedReferer,
      };
    });
  }
}

export const animeKitaClient = new AnimeKitaClient();
