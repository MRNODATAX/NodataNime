import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  toSeriesToken,
  fromSeriesToken,
  toEpisodeToken,
  fromEpisodeToken,
  parseCards,
  parseSearch,
  parsePagination,
  parseGenres,
  parseSchedule,
  parseHome,
  parseAnimeDetail,
  parseEpisodeHtml,
  normalizeEpisodeStreams,
  resolvePosterUrl,
  extractCssBackgroundUrl,
} from "../src/parsers/ylnimeParser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");

describe("OBL-01: Reversible Series & Episode Slug Tokenization", () => {
  it("preserves trailing slashes and special characters across round-trips", () => {
    const cases = [
      "gintama/",
      "isekai-cheat-sub-indo/",
      "(uncen)-nande-koko-ni-sensei-ga!?",
      "slug#hash",
      "1piece-sub-indo",
    ];
    for (const raw of cases) {
      const token = toSeriesToken(raw);
      assert.doesNotMatch(token, /[/?#]/);
      assert.equal(fromSeriesToken(token), raw);
    }
  });

  it("encodes and restores combined episode + series tokens", () => {
    const tok = toEpisodeToken("al-153297-21", "slime-s4-sub-indo/");
    assert.equal(tok, "al-153297-21__slime-s4-sub-indo~");
    assert.deepEqual(fromEpisodeToken(tok), {
      episodeId: "al-153297-21",
      seriesSlug: "slime-s4-sub-indo/",
    });
  });
});

describe("OBL-02: Real YLnime HTML Fixture Parsers", () => {
  it("parses 20 unique anime cards from ylnime-search.html fixture and isolates search scope", () => {
    const cards = parseSearch(fixture("ylnime-search.html"));
    assert.equal(cards.length, 20);
    assert.equal(new Set(cards.map((c) => c.slug)).size, 20);
    assert.equal(cards[0].title, "Isekai Cheat Magician");
    assert.equal(cards[0].slug, "isekai-cheat-sub-indo~");
    assert.equal(cards[0].score, "5.2");
    assert.equal(cards[0].status, "Completed");

    // Pastikan jika YLnime merender homepage (carousel-item tanpa heading Hasil Pencarian), parseSearch mengembalikan []
    const leakedHomeHtml = `
      <div id="heroBanner"><div class="carousel-item"><h2>Banner</h2><a href="?series=banner-1"></a></div></div>
      <div class="row"><div class="card"><img src="/assets/no-cover.svg" alt="Cover"/><a href="?series=unrelated"></a><h6 class="card-title">Unrelated</h6></div></div>
    `;
    assert.deepEqual(parseSearch(leakedHomeHtml), []);
  });

  it("parses 100+ catalog items from ylnime-anime-list.html fixture", () => {
    const cards = parseCards(fixture("ylnime-anime-list.html"));
    assert.ok(cards.length >= 100);
    const blade = cards.find((c) => c.title === "I Am The Blade");
    assert.ok(blade);
    assert.equal(blade.slug, "i-am-the-blade");
  });

  it("parses genres, schedule, pagination, home, and detail structures accurately", () => {
    const genreHtml = `
      <div>
        <a class="genre-pill" href="genre.php?g=action">Action</a>
        <a class="genre-pill" href="genre.php?g=isekai">Isekai</a>
      </div>`;
    const genres = parseGenres(genreHtml);
    assert.deepEqual(genres, [
      { genreId: "action", title: "Action" },
      { genreId: "isekai", title: "Isekai" },
    ]);

    const schedHtml = `
      <div class="day-section">
        <div class="day-header">Sabtu 24 Oktober 2026 HARI INI 2 Anime</div>
        <div class="card">
          <img src="https://cdn.myanimelist.net/images/anime/1275/158595l.jpg" alt="Bleach" />
          <a href="?series=bleach-kashin-tan-sub-indo"></a>
          <h6 class="card-title">Bleach: Sennen Kessen-hen</h6>
        </div>
      </div>`;
    const sched = parseSchedule(schedHtml);
    assert.equal(sched.length, 1);
    assert.equal(sched[0].day, "Sabtu");
    assert.equal(sched[0].isToday, true);
    assert.equal(sched[0].animeList[0].slug, "bleach-kashin-tan-sub-indo");

    const pagerHtml = `<div class="pager"><a href="?page=2">Berikutnya</a></div>`;
    const pg = parsePagination(pagerHtml, 1);
    assert.equal(pg.hasNextPage, true);
    assert.equal(pg.nextPage, 2);

    const detailHtml = `
      <div class="row">
        <div class="col-md-3"><img class="img-fluid rounded" src="https://cdn.myanimelist.net/images/anime/1448/147351.jpg" /></div>
        <div class="col-md-9">
          <h3 class="text-success">8.8 Match</h3>
          <h1>Solo Leveling Season 2</h1>
          <div class="d-flex"><span>Completed</span><span>TV</span><span>2025</span></div>
          <p>Sung Jin-Woo bangkit memimpin pasukan bayangan menghadapi ancaman dungeon tingkat S.</p>
          <div>Genres: <a href="index.php?search=Action">Action,</a> <a href="index.php?search=Fantasy">Fantasy</a></div>
          <div class="list-group">
            <a class="list-group-item" href="?series=solo-s2&episode=al-150340-13"><span>Episode 13 (End)</span><small>12 Mei, 2026</small></a>
            <a class="list-group-item" href="?series=solo-s2&episode=al-150340-1"><span>Episode 1</span><small>12 Mei, 2026</small></a>
          </div>
        </div>
      </div>`;
    const detail = parseAnimeDetail(detailHtml, "solo-s2");
    assert.equal(detail.title, "Solo Leveling Season 2");
    assert.equal(detail.score, "8.8");
    assert.equal(detail.status, "Completed");
    assert.equal(detail.episodes.length, 2);
    assert.equal(detail.episodes[0].episodeId, "al-150340-13");

    // Pastikan link episode milik seri lain di sidebar/rekomendasi TIDAK bocor ke daftar episode
    const pollutedDetailHtml = `
      <div class="row">
        <div class="col-md-3"><img class="img-fluid rounded" src="https://cdn.myanimelist.net/images/anime/1/1.jpg" /></div>
        <div class="col-md-9">
          <h1>Tougen Anki</h1>
          <div class="d-flex"><span>Ongoing</span><span>TV</span><span>2026</span></div>
          <p>Pertempuran pewaris darah Oni melawan organisasi Momotaro.</p>
          <div class="list-group">
            <a href="?series=tougen-anki-s2&episode=al-154230-4"><span>Episode 4</span></a>
            <a href="?series=tougen-anki-s2&episode=al-154230-1"><span>Episode 1</span></a>
          </div>
          <aside class="sidebar">
            <a href="?series=slime-s4-sub-indo&episode=al-153297-21"><span>Episode 21</span></a>
          </aside>
        </div>
      </div>`;
    const cleanDetail = parseAnimeDetail(pollutedDetailHtml, "tougen-anki-s2");
    assert.equal(cleanDetail.episodes.length, 2);
    assert.ok(cleanDetail.episodes.every((e) => e.episodeId.startsWith("al-154230-")));

    const homeHtml = `
      <div class="banner-container">
        <div class="carousel-item active">
          <img class="banner-img" src="https://s4.anilist.co/banner.jpg" />
          <div class="text-danger">Action • Adventure</div>
          <h2>ONE PIECE</h2>
          <p>Petualangan Luffy mencari One Piece di lautan Grand Line.</p>
          <a href="?series=1piece-sub-indo">Tonton</a>
        </div>
      </div>`;
    const home = parseHome(homeHtml);
    assert.equal(home.banners.length, 1);
    assert.equal(home.banners[0].slug, "1piece-sub-indo");
  });

  it("normalizes non-CDN MyAnimeList covers, filters injected ad banners, and extracts lazy-loaded/CSS/og:image banners", () => {
    // 1. Rewrite non-CDN myanimelist.net/images/... -> https://cdn.myanimelist.net/images/...
    assert.equal(
      resolvePosterUrl("http://myanimelist.net/images/anime/1015/138006.jpg"),
      "https://cdn.myanimelist.net/images/anime/1015/138006.jpg"
    );
    assert.equal(
      resolvePosterUrl("https://www.myanimelist.net/images/anime/1208/94745l.jpg"),
      "https://cdn.myanimelist.net/images/anime/1208/94745l.jpg"
    );

    // 2. Tolak banner iklan YLnime (admin/ad_media/bad_*.png)
    assert.equal(
      resolvePosterUrl("https://ylnime.com/admin/ad_media/bad_1744001.png"),
      "/assets/no-cover.svg"
    );

    // 3. Ekstraksi CSS background-image url(...)
    assert.equal(
      extractCssBackgroundUrl(
        "background: linear-gradient(#000, transparent), url('https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-wf37VakJmZqs.jpg') center/cover;"
      ),
      "https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-wf37VakJmZqs.jpg"
    );

    // 4. Kartu dengan iklan + gambar lazy-load (data-src) tetap memilih sampul anime asli
    const adPollutedCardHtml = `
      <div class="col">
        <a href="?series=black-clover-s2-sub-indo">
          <div class="card">
            <img src="https://ylnime.com/admin/ad_media/bad_99.png" alt="Advertisement" />
            <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="https://myanimelist.net/images/anime/1704/154261.jpg" />
            <span class="badge">Ongoing</span>
            <h6>Black Clover 2nd Season</h6>
          </div>
        </a>
      </div>`;
    const parsedCards = parseCards(adPollutedCardHtml);
    assert.equal(parsedCards.length, 1);
    assert.equal(
      parsedCards[0].poster,
      "https://cdn.myanimelist.net/images/anime/1704/154261.jpg"
    );

    // 5. Detail anime mengekstrak widescreen banner dari meta og:image sementara poster tetap sampul vertikal
    const detailWithOgBanner = `
      <html>
        <head>
          <meta property="og:image" content="https://s4.anilist.co/file/anilistcdn/media/anime/banner/195516-B5M0cPaQbQXI.jpg" />
        </head>
        <body>
          <div class="row">
            <div class="col-md-3"><img class="img-fluid" src="https://myanimelist.net/images/anime/1500/154210.jpg" /></div>
            <div class="col-md-9">
              <h1>Kusuriya no Hitorigoto Season 3</h1>
              <div class="d-flex"><span>Ongoing</span><span>TV</span><span>2026</span></div>
              <p>Maomao kembali memecahkan intrik istana.</p>
            </div>
          </div>
        </body>
      </html>`;
    const parsedDetail = parseAnimeDetail(detailWithOgBanner, "kusuriya-no-hitorigoto-s3");
    assert.equal(
      parsedDetail.poster,
      "https://cdn.myanimelist.net/images/anime/1500/154210.jpg"
    );
    assert.equal(
      parsedDetail.banner,
      "https://s4.anilist.co/file/anilistcdn/media/anime/banner/195516-B5M0cPaQbQXI.jpg"
    );
  });
});

describe("OBL-03: YLnime Episode HTML & yl_ep_json=1 Stream Extractor", () => {
  it("extracts inline const streams = [...] and merges multi-resolution yl_ep_json=1 payloads", () => {
    const epHtml = `
      <nav class="breadcrumb"><a href="index.php?series=slime-s4-sub-indo">Slime Season 4</a></nav>
      <h1 id="ylJudulEp">Slime Season 4 Episode 21 - YLnime</h1>
      <script>
        const streams = [{"reso":"480p","link":"https://s3.animeverse.id/video/ep21-480.mp4","provide":871}];
      </script>
    `;
    const parsedHtml = parseEpisodeHtml(epHtml, "slime-s4-sub-indo", "al-153297-21");
    assert.equal(parsedHtml.title, "Slime Season 4 Episode 21");
    assert.equal(parsedHtml.inlineStreams.length, 1);

    const normalized = normalizeEpisodeStreams({
      episodeId: "al-153297-21",
      seriesSlug: "slime-s4-sub-indo",
      title: parsedHtml.title,
      animeTitle: parsedHtml.animeTitle,
      jsonResponses: [
        {
          ok: true,
          reso_dipakai: "1080p",
          streams: [
            { reso: "1080p", link: "https://s3.animeverse.id/video/ep21-1080.mp4", provide: 871, id: 1 },
            { reso: "1080p", link: "https://pixeldrain.com/api/file/LtMhaigz?download", provide: 11, id: 2 },
          ],
          prev_ep: "al-153297-20",
          next_ep: "al-153297-22",
        },
      ],
      inlineStreams: parsedHtml.inlineStreams,
    });

    assert.equal(normalized.streams.length, 3);
    assert.equal(normalized.streams[0].provider, "Animeverse S3");
    assert.equal(normalized.streams[0].resolution, "1080p");
    assert.equal(normalized.streams[0].playableDirect, true);
    // Ketika 720p tidak tersedia namun 480p tersedia, defaultStream harus memilih 480p agar tetap hemat kuota (< 1080p)
    assert.equal(normalized.defaultResolution, "480p");
    assert.equal(normalized.defaultStreamUrl, "https://s3.animeverse.id/video/ep21-480.mp4");
    const pxl = normalized.streams.find((s) => s.provider === "Pixeldrain Cloud");
    assert.equal(pxl.playableDirect, false);
    assert.equal(normalized.navigation.prevEpisodeId, "al-153297-20");
    assert.equal(normalized.navigation.nextEpisodeId, "al-153297-22");
  });

  it("prioritizes playable 720p as defaultStream when 360p/480p/720p/1080p mirrors are present", () => {
    const normalized = normalizeEpisodeStreams({
      episodeId: "al-153297-22",
      seriesSlug: "slime-s4-sub-indo",
      title: "Slime Season 4 Episode 22",
      animeTitle: "Slime Season 4",
      jsonResponses: [
        {
          ok: true,
          streams: [
            { reso: "1080p", link: "https://s3.animeverse.id/video/ep22-1080.mp4", provide: 871, id: 1 },
            { reso: "720p", link: "https://s3.animeverse.id/video/ep22-720.mp4", provide: 871, id: 2 },
            { reso: "480p", link: "https://s3.animeverse.id/video/ep22-480.mp4", provide: 871, id: 3 },
            { reso: "360p", link: "https://s3.animeverse.id/video/ep22-360.mp4", provide: 871, id: 4 },
          ],
        },
      ],
      inlineStreams: [],
    });

    assert.equal(normalized.streams[0].resolution, "1080p");
    assert.equal(normalized.defaultResolution, "720p");
    assert.equal(normalized.defaultStreamUrl, "https://s3.animeverse.id/video/ep22-720.mp4");
  });
});
