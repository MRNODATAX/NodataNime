import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fromSeriesToken,
  toSeriesToken,
  toEpisodeToken,
  normalizeEpisodeStreams,
} from "../parsers/ylnimeParser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultSnapshotPath = path.join(__dirname, "../../data/ylnime-snapshot.json");
const cwdSnapshotPath = path.join(process.cwd(), "data/ylnime-snapshot.json");
const snapshotPath = fs.existsSync(defaultSnapshotPath) ? defaultSnapshotPath : cwdSnapshotPath;

const rawSnapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));

const WIB_DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function currentWibDayName() {
  const wibDate = new Date(Date.now() + 7 * 3600 * 1000);
  return WIB_DAYS[wibDate.getUTCDay()];
}

function paginate(array, page = 1, pageSize = 20) {
  const p = Math.max(1, Number(page) || 1);
  const totalPages = Math.max(1, Math.ceil(array.length / pageSize));
  const safePage = Math.min(p, totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: array.slice(start, start + pageSize),
    pagination: {
      currentPage: safePage,
      prevPage: safePage > 1 ? safePage - 1 : null,
      nextPage: safePage < totalPages ? safePage + 1 : null,
      totalPages,
      totalItems: array.length,
      hasPrevPage: safePage > 1,
      hasNextPage: safePage < totalPages,
    },
  };
}

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Mengekstrak jumlah episode eksak dari label kartu (`"Ep 4"` -> 4, `"24 Ep"` -> 24, `"Movie"` -> 1)
 * agar daftar episode pada halaman detail selalu selaras 100% dengan badge Jadwal/Ongoing/Tamat.
 */
function parseEpisodeCountFromBadge(episodeText = "", isMovie = false) {
  if (isMovie) return 1;
  const raw = String(episodeText || "").trim();
  const match = raw.match(/(?:ep(?:isode)?\s*)?(\d+)\s*(?:ep(?:isode)?)?/i);
  if (match && match[1]) {
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.min(parsed, 200);
    }
  }
  return 12;
}

export class SnapshotStore {
  constructor(data = rawSnapshot) {
    this.data = data;
  }

  getHome() {
    return {
      banners: this.data.banners,
      topAnime: this.data.topAnime,
      latestReleases: this.data.latestReleases,
      ongoing: this.data.ongoing,
      completedPreview: this.data.completed.slice(0, 12),
      moviesPreview: this.data.movies.slice(0, 12),
      recommendations: this.data.rekomendasi.slice(0, 10),
      genres: this.data.genres,
      communityFeed: this.data.communityFeed,
    };
  }

  getList(type = "ongoing", page = 1) {
    const map = {
      ongoing: this.data.ongoing,
      completed: this.data.completed,
      movie: this.data.movies,
      movies: this.data.movies,
      baru: [...this.data.latestReleases, ...this.data.ongoing],
      rekomendasi: this.data.rekomendasi,
      hyper: this.data.hyper,
    };
    const pool = map[type] || this.data.ongoing;
    const seen = new Set();
    const deduped = pool.filter((item) => {
      if (!item?.slug || seen.has(item.slug)) return false;
      seen.add(item.slug);
      return true;
    });
    return paginate(deduped, page, 18);
  }

  getAz(letter = "A", page = 1) {
    const initial = String(letter || "A").trim().toUpperCase();
    const validInitial = /^([A-Z]|#)$/.test(initial) ? initial : "A";
    const matches = this.data.catalog
      .filter((item) => {
        const firstChar = String(item.title || "").trim().charAt(0).toUpperCase();
        if (validInitial === "#") {
          return !/[A-Z]/.test(firstChar);
        }
        return firstChar === validInitial;
      })
      .sort((a, b) => a.title.localeCompare(b.title));

    return {
      letter: validInitial,
      ...paginate(matches, page, 24),
    };
  }

  getGenres() {
    return this.data.genres;
  }

  getByGenre(genreId = "action", page = 1) {
    const target = String(genreId || "action").toLowerCase().trim();
    // Pencocokan ketat hanya pada daftar genre sah milik anime (tanpa fallback modulo acak)
    const matches = this.data.catalog.filter((item) =>
      (item.genres || []).some((g) => String(g).toLowerCase() === target)
    );
    return {
      genreId: target,
      ...paginate(matches, page, 18),
    };
  }

  getSchedule() {
    const todayName = currentWibDayName();
    return this.data.schedule.map((group) => ({
      ...group,
      count: group.animeList.length,
      isToday: group.day === todayName,
    }));
  }

  search(query = "") {
    const q = normalizeText(query);
    if (!q) return [];
    const tokens = q.split(/\s+/).filter(Boolean);
    return this.data.catalog
      .filter((item) => {
        const hay = normalizeText(`${item.title} ${item.rawSlug} ${(item.genres || []).join(" ")}`);
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 30);
  }

  getDetail(slugOrToken) {
    const rawSlug = fromSeriesToken(slugOrToken);
    const token = toSeriesToken(rawSlug);
    if (this.data.details[token]) {
      return this.data.details[token];
    }

    const cardItem = this.data.catalog.find(
      (x) => x.slug === token || x.rawSlug === rawSlug
    );
    if (!cardItem) return null;

    const isMovie = /movie/i.test(cardItem.status) || /movie/i.test(cardItem.type);
    const epCount = parseEpisodeCountFromBadge(cardItem.episode, isMovie);

    const generatedEpisodes = Array.from({ length: epCount }, (_, idx) => {
      const epNum = epCount - idx;
      const epId =
        epNum === epCount && cardItem.episodeId
          ? cardItem.episodeId
          : `ep-${token}--${epNum}`;
      return {
        episodeId: epId,
        token: toEpisodeToken(epId, cardItem.rawSlug),
        number: epNum,
        title: isMovie ? `${cardItem.title} (Full Movie)` : `Episode ${epNum}`,
        date: idx === 0 && /ongoing/i.test(cardItem.status) ? "Baru Rilis" : cardItem.year || "2026",
        hasVerifiedStream: Boolean(this.data.episodeStreams[epId]),
      };
    });

    return {
      title: cardItem.title,
      slug: cardItem.slug,
      rawSlug: cardItem.rawSlug,
      poster: cardItem.poster,
      banner: cardItem.banner || cardItem.poster,
      score: cardItem.score || "8.2",
      status: cardItem.status || "Anime",
      type: isMovie ? "Movie" : cardItem.type || "TV",
      year: cardItem.year || "2026",
      synopsis:
        cardItem.synopsis ||
        `Tonton ${cardItem.title} subtitle Indonesia kualitas HD di NodataNime.`,
      totalEpisodes: generatedEpisodes.length,
      genres: (cardItem.genres || []).map((g) => ({
        genreId: g,
        title: g.charAt(0).toUpperCase() + g.slice(1),
      })),
      episodes: generatedEpisodes,
      recommendations: this.data.rekomendasi
        .filter((r) => r.slug !== cardItem.slug)
        .slice(0, 6),
      sourceUrl: cardItem.sourceUrl,
    };
  }

  getEpisode({ seriesSlug = "", episodeId = "", epNumber = null }) {
    const rawSeries = fromSeriesToken(seriesSlug);
    const detail = rawSeries ? this.getDetail(rawSeries) : null;

    let resolvedEpisodeId = episodeId ? fromSeriesToken(episodeId) : "";
    let matchedEpisode = null;

    if (detail) {
      if (resolvedEpisodeId) {
        matchedEpisode =
          detail.episodes.find((e) => e.episodeId === resolvedEpisodeId) || null;
      } else if (epNumber != null) {
        matchedEpisode =
          detail.episodes.find((e) => Number(e.number) === Number(epNumber)) || null;
        if (matchedEpisode) {
          resolvedEpisodeId = matchedEpisode.episodeId;
        }
      } else if (detail.episodes.length > 0) {
        matchedEpisode = detail.episodes[0];
        resolvedEpisodeId = matchedEpisode.episodeId;
      }
    }

    // JANGAN PERNAH mengganti stream dengan episode lain atau anime lain (mis. Slime S4)!
    // Hanya kembalikan stream apabila ID episode ini benar-benar terdaftar dan sesuai seri.
    const belongsToSeries = !detail || Boolean(matchedEpisode);
    const rawStreams =
      belongsToSeries && resolvedEpisodeId && Array.isArray(this.data.episodeStreams[resolvedEpisodeId])
        ? this.data.episodeStreams[resolvedEpisodeId]
        : [];

    let prevEp = null;
    let nextEp = null;
    if (detail && matchedEpisode) {
      const idx = detail.episodes.findIndex((e) => e.episodeId === matchedEpisode.episodeId);
      if (idx !== -1) {
        if (idx + 1 < detail.episodes.length) prevEp = detail.episodes[idx + 1].episodeId;
        if (idx - 1 >= 0) nextEp = detail.episodes[idx - 1].episodeId;
      }
    }

    const epTitleSuffix = matchedEpisode
      ? matchedEpisode.title
      : epNumber != null
      ? `Episode ${epNumber}`
      : resolvedEpisodeId || "Episode";
    const effectiveSeries = detail?.rawSlug || rawSeries || "";
    const effectiveAnimeTitle = detail?.title || effectiveSeries || "Anime";

    const normalized = normalizeEpisodeStreams({
      episodeId: resolvedEpisodeId,
      seriesSlug: effectiveSeries,
      title: `${effectiveAnimeTitle} — ${epTitleSuffix}`,
      animeTitle: effectiveAnimeTitle,
      jsonResponses: [
        {
          ok: rawStreams.length > 0,
          reso_dipakai: "1080p",
          streams: rawStreams,
          prev_ep: prevEp,
          next_ep: nextEp,
        },
      ],
      fallbackPrevEp: prevEp,
      fallbackNextEp: nextEp,
    });

    return {
      ...normalized,
      episodeFound: Boolean(matchedEpisode || (!detail && rawStreams.length > 0)),
      streamAvailable: normalized.streams.length > 0,
      poster: detail?.poster || "/assets/no-cover.svg",
      episodes: detail?.episodes || [],
    };
  }

  getCommunityFeed() {
    return this.data.communityFeed || [];
  }
}

export const snapshotStore = new SnapshotStore();
