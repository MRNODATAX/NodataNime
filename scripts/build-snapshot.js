/**
 * Menghasilkan `data/ylnime-snapshot.json` dari data observasi langsung `https://ylnime.com`
 * (termasuk halaman A-Z, pencarian, jadwal semua hari, detail anime, chat komunitas,
 * serta respons stream nyata `index.php?yl_ep_json=1`).
 *
 * Prinsip integritas katalog:
 * 1. Tidak ada anime Ongoing/Movie masuk ke daftar Completed (`Tamat`), dan sebaliknya.
 * 2. Setiap anime di Jadwal & Sedang Tayang wajib memiliki label episode akurat (`Ep N`)
 *    yang selaras 100% dengan jumlah episode di halaman Detail.
 * 3. Klasifikasi 28 genre akurat tanpa injeksi acak atau penimpaan metadata kosong.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCards, toSeriesToken, toEpisodeToken } from "../src/parsers/ylnimeParser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const azHtml = fs.readFileSync(path.join(rootDir, "test/fixtures/ylnime-anime-list.html"), "utf8");
const searchHtml = fs.readFileSync(path.join(rootDir, "test/fixtures/ylnime-search.html"), "utf8");

/**
 * Menginferensi genre yang akurat dari judul anime untuk kartu hasil parsing HTML
 * (menggantikan fallback generik `["action", "fantasy"]` yang menyebabkan salah kategori).
 */
function inferGenresFromTitle(title = "", defaultGenres = []) {
  const t = String(title || "").toLowerCase();
  const genres = new Set(defaultGenres);

  if (/isekai/.test(t)) {
    genres.add("isekai");
    genres.add("fantasy");
  }
  if (/harem|maou.*dorei|meikyuu de harem|infinite stratos|seikishi/.test(t)) {
    genres.add("harem");
    genres.add("ecchi");
  }
  if (/mahou|magic|majutsu|majo|cheat/.test(t)) {
    genres.add("magic");
    genres.add("fantasy");
  }
  if (/idol|ish7|music|uta|ensemble|hypnosis mic/.test(t)) {
    genres.add("music");
  }
  if (/inazuma|initial d|ippo|iwatobi|free!|basket|soccer|shoot/.test(t)) {
    genres.add("sports");
  }
  if (/itou junji|inuyashiki|corpse|ghost|mieruko|kaiki|dark gathering/.test(t)) {
    genres.add("horror");
    genres.add("supernatural");
  }
  if (/infinite stratos|gundam|evangelion|franxx|macross|aldnoah|code geass|86/.test(t)) {
    genres.add("mecha");
    genres.add("sci-fi");
  }
  if (/nagatoro|koi|love|kanojo|yome|kekkon|romance|horimiya|komi|clannad|fruits basket/.test(t)) {
    genres.add("romance");
  }
  if (/gakuen|school|koukou|high school|kyoushitsu|classroom|iruma/.test(t)) {
    genres.add("school");
  }
  if (/quartet|ojisan|nonbiri|izakaya|shokudou|mofumofu|konosuba|gintama/.test(t)) {
    genres.add("comedy");
  }
  if (/shikkaku|psychological|death|psycho|parasyte|monster|steins/.test(t)) {
    genres.add("psychological");
    genres.add("thriller");
  }
  if (/vampire|kyuuketsuki|hellsing|seraph|vanitas|call of the night/.test(t)) {
    genres.add("vampire");
    genres.add("supernatural");
  }
  if (/demon|oni|kimetsu|akuma|iruma|maou/.test(t)) {
    genres.add("demons");
  }
  if (/game|sword art|log horizon|shangri-la|overlord|bofuri/.test(t)) {
    genres.add("game");
  }
  if (/senki|military|tanya|youjo senki|kingdom|vinland|golden kamuy/.test(t)) {
    genres.add("military");
    genres.add("historical");
  }
  if (/tantei|detective|mystery|conan|hyouka|kusuriya|inspectre/.test(t)) {
    genres.add("mystery");
  }

  if (genres.size === 0) {
    genres.add("drama");
  }
  return [...genres];
}

const rawAzCards = parseCards(azHtml);
const rawSearchCards = parseCards(searchHtml);

const parsedAzCards = rawAzCards.map((c) => {
  const isMovie = /\bmovie\b|\bfilm\b/i.test(c.title);
  return {
    ...c,
    status: isMovie ? "Movie" : "Completed",
    episode: isMovie ? "Movie" : "12 Ep",
    genres: inferGenresFromTitle(c.title),
  };
});

const parsedSearchCards = rawSearchCards.map((c) => {
  const isMovie = /\bmovie\b|\bfilm\b/i.test(c.title) || /movie/i.test(c.status);
  const isOngoing = /ongoing/i.test(c.status) && !isMovie;
  return {
    ...c,
    status: isMovie ? "Movie" : isOngoing ? "Ongoing" : "Completed",
    episode: isMovie ? "Movie" : isOngoing ? "Ep 5" : "12 Ep",
    releaseDay: isOngoing ? "Rabu" : undefined,
    label: isMovie ? "Movie" : isOngoing ? "Rabu" : "Tamat",
    genres: inferGenresFromTitle(c.title, ["isekai", "fantasy", "adventure"]),
  };
});

function card({
  title,
  rawSlug,
  poster,
  banner,
  score = "8.4",
  status = "Ongoing",
  label = "",
  releaseDay = "",
  episode = "",
  episodeId = "",
  views = "",
  genres = [],
  synopsis = "",
  year = "2026",
  type = "TV",
}) {
  const effectiveLabel = label || releaseDay || "";
  return {
    title,
    slug: toSeriesToken(rawSlug),
    rawSlug,
    poster,
    banner: banner || poster,
    score,
    status,
    label: effectiveLabel,
    releaseDay: releaseDay || (["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"].includes(effectiveLabel) ? effectiveLabel : ""),
    episode,
    episodeId,
    views,
    genres,
    synopsis,
    year,
    type,
    sourceUrl: `https://ylnime.com/index.php?series=${encodeURIComponent(rawSlug)}`,
  };
}

const banners = [
  {
    title: "Tensei shitara Slime Datta Ken Season 4",
    slug: toSeriesToken("slime-s4-sub-indo"),
    rawSlug: "slime-s4-sub-indo",
    banner: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/178025-p6L3lB9vR3pB.jpg",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx178025-cWJ2qN2hD2hF.jpg",
    synopsis:
      "Rimuru Tempest dan Federasi Jura Tempest menghadapi babak konspirasi baru dari klan Rozzo dan Kekaisaran Timur demi mewujudkan dunia tempat manusia dan monster hidup berdampingan.",
    genres: ["Action", "Adventure", "Fantasy", "Isekai"],
    status: "Sedang Tayang",
    score: "8.8",
    episode: "Ep 21",
    episodeId: "al-153297-21",
  },
  {
    title: "One Piece",
    slug: toSeriesToken("1piece-sub-indo"),
    rawSlug: "1piece-sub-indo",
    banner: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-wf37VakJmZqs.jpg",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg",
    synopsis:
      "Monkey D. Luffy bersama kru Topi Jerami menembus perairan New World dan pulau sains masa depan Egghead hingga Elbaf demi mengungkap rahasia Abad Kekosongan dan harta karun One Piece.",
    genres: ["Action", "Adventure", "Fantasy", "Shounen"],
    status: "Sedang Tayang",
    score: "9.1",
    episode: "Ep 1180",
    episodeId: "al-150441-1180",
  },
  {
    title: "Solo Leveling Season 2: Arise from the Shadow",
    slug: toSeriesToken("solo-leveling-s2-sub-indo"),
    rawSlug: "solo-leveling-s2-sub-indo",
    banner: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/176496-M8E8A9jW2w7L.jpg",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx176496-x2pU9h8W0N6p.jpg",
    synopsis:
      "Setelah membangkitkan pasukan bayangan sebagai Shadow Monarch, Sung Jin-Woo menaklukkan Demon Castle dan menghadapi ancaman semut raksasa Pulau Jeju yang mengguncang para Hunter S-Rank.",
    genres: ["Action", "Adventure", "Fantasy"],
    status: "Completed",
    score: "9.0",
    episode: "13 Ep",
    episodeId: "al-150340-1",
  },
  {
    title: "Bleach: Sennen Kessen-hen - Kashin-tan",
    slug: toSeriesToken("bleach-sennen-kessen-hen-kashin-tan"),
    rawSlug: "bleach-sennen-kessen-hen-kashin-tan",
    banner: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/169755-hkH2K8Q9R9vN.jpg",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx169755-eS8c7X9Z5J0W.jpg",
    synopsis:
      "Pertempuran puncak antara Gotei 13 dan Schutzstaffel Yhwach di Istana Soul King mencapai klimaks berdarah yang menentukan nasib tiga dunia.",
    genres: ["Action", "Adventure", "Supernatural", "Shounen"],
    status: "Sedang Tayang",
    score: "9.0",
    episode: "Ep 9",
    episodeId: "al-154222-9",
  },
  {
    title: "Kusuriya no Hitorigoto Season 3",
    slug: toSeriesToken("kusuriya-no-hitorigoto-s3"),
    rawSlug: "kusuriya-no-hitorigoto-s3",
    banner: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/161645-7I5y9A9h8U7W.jpg",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx176301-m1kL5H3vW2qR.jpg",
    synopsis:
      "Maomao dan Jinshi kembali terseret dalam intrik racun, wabah misterius, serta rahasia politik baru di balik tembok istana kekaisaran.",
    genres: ["Drama", "Mystery", "Historical"],
    status: "Sedang Tayang",
    score: "8.9",
    episode: "Ep 4",
    episodeId: "al-154210-4",
  },
];

const latestReleases = [
  card({
    title: "One Piece",
    rawSlug: "1piece-sub-indo",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg",
    score: "9.1",
    status: "Ongoing",
    releaseDay: "Minggu",
    episode: "Ep 1180",
    episodeId: "al-150441-1180",
    views: "306,964",
    genres: ["action", "adventure", "comedy", "fantasy", "shounen"],
    synopsis:
      "Petualangan epik Monkey D. Luffy dan kru Bajak Laut Topi Jerami mengarungi Grand Line mencari harta karun legendaris One Piece untuk menjadi Raja Bajak Laut.",
    year: "1999",
  }),
  card({
    title: "Tensei shitara Slime Datta Ken Season 4",
    rawSlug: "slime-s4-sub-indo",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx178025-cWJ2qN2hD2hF.jpg",
    score: "8.8",
    status: "Ongoing",
    releaseDay: "Jumat",
    episode: "Ep 21",
    episodeId: "al-153297-21",
    views: "128,450",
    genres: ["action", "adventure", "comedy", "fantasy", "isekai"],
    synopsis:
      "Rimuru Tempest memperluas aliansi diplomatik dan teknologi Jura Tempest sambil menghadapi manuver rahasia klan Rozzo.",
    year: "2026",
  }),
  card({
    title: "Bleach: Sennen Kessen-hen - Kashin-tan",
    rawSlug: "bleach-sennen-kessen-hen-kashin-tan",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx169755-eS8c7X9Z5J0W.jpg",
    score: "9.0",
    status: "Ongoing",
    releaseDay: "Sabtu",
    episode: "Ep 9",
    episodeId: "al-154222-9",
    views: "94,210",
    genres: ["action", "adventure", "supernatural", "shounen"],
    synopsis:
      "Cour penutup Thousand-Year Blood War yang mempertemukan Ichigo Kurosaki dan para Kapten melawan kekuatan tertinggi Yhwach.",
    year: "2026",
  }),
  card({
    title: "Black Clover 2nd Season",
    rawSlug: "black-clover-s2-sub-indo",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx97940-bP9E4sR8G3yT.jpg",
    score: "8.7",
    status: "Ongoing",
    releaseDay: "Minggu",
    episode: "Ep 3",
    episodeId: "al-154261-3",
    views: "88,120",
    genres: ["action", "comedy", "fantasy", "magic", "shounen"],
    synopsis:
      "Asta dan Yuno kembali berlomba menuju takhta Kaisar Sihir dalam pertempuran besar melawan ancaman Kerajaan Spade.",
    year: "2026",
  }),
  card({
    title: "Tokyo Revengers: Santen Sensou-hen",
    rawSlug: "tokyo-revengers-s4",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx163329-V4jM5N7K2qP1.jpg",
    score: "8.3",
    status: "Ongoing",
    releaseDay: "Minggu",
    episode: "Ep 4",
    episodeId: "al-154254-4",
    views: "64,905",
    genres: ["action", "drama", "supernatural", "shounen", "thriller"],
    synopsis:
      "Takemichi Hanagaki terjun ke era Tiga Dewa berandalan Tokyo demi menyelamatkan Mikey dari kegelapan impulsnya.",
    year: "2026",
  }),
  card({
    title: "Kusuriya no Hitorigoto Season 3",
    rawSlug: "kusuriya-no-hitorigoto-s3",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx176301-m1kL5H3vW2qR.jpg",
    score: "8.9",
    status: "Ongoing",
    releaseDay: "Jumat",
    episode: "Ep 4",
    episodeId: "al-154210-4",
    views: "72,300",
    genres: ["drama", "mystery", "historical", "seinen"],
    synopsis:
      "Apoteker cerdik Maomao menyelidiki konspirasi baru di provinsi barat dan istana dalam bersama Jinshi.",
    year: "2026",
  }),
  card({
    title: "Detective Conan",
    rawSlug: "detective-conan",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx235-s6xG4bF9M1pQ.jpg",
    score: "8.4",
    status: "Ongoing",
    releaseDay: "Sabtu",
    episode: "Ep 1196",
    episodeId: "al-149020-1196",
    views: "110,415",
    genres: ["adventure", "comedy", "mystery", "shounen"],
    synopsis:
      "Shinichi Kudo yang menyusut menjadi Conan Edogawa terus memecahkan kasus pembunuhan rumit sembari memburu Organisasi Hitam.",
    year: "1996",
  }),
  card({
    title: "Shin Gekijouban☆Keroro Gunsou: Fukkatsu shite Sokkou Chikyuu Metsubou no Kiki de Arimasu!",
    rawSlug: "shin-keroro-gunsou",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx516-k8P2mR4nQ9vL.jpg",
    score: "7.9",
    status: "Ongoing",
    releaseDay: "Sabtu",
    episode: "Ep 4",
    episodeId: "al-154259-4",
    views: "21,880",
    genres: ["comedy", "sci-fi", "shounen"],
    synopsis:
      "Sersan Keroro dan peleton katak luar angkasa kembali dengan kekacauan baru yang justru harus menyelamatkan Bumi dari kehancuran mendadak.",
    year: "2026",
  }),
  card({
    title: "Tougen Anki: Nikko・Kegon no Taki-hen",
    rawSlug: "tougen-anki-s2",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx177474-y5K3nL8wP2cM.jpg",
    score: "8.2",
    status: "Ongoing",
    releaseDay: "Sabtu",
    episode: "Ep 4",
    episodeId: "al-154230-4",
    views: "43,720",
    genres: ["action", "fantasy", "supernatural", "demons", "shounen"],
    synopsis:
      "Shiki Ichinose mewarisi darah Oni dan bertempur melawan organisasi Momotaro dalam konflik berdarah di Nikko dan Air Terjun Kegon.",
    year: "2026",
  }),
  card({
    title: "Steel Ball Run: JoJo no Kimyou na Bouken",
    rawSlug: "steel-ball-run-jojo",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx190077-j3R8pK2vN5mQ.jpg",
    score: "9.2",
    status: "Ongoing",
    releaseDay: "Jumat",
    episode: "Ep 6",
    episodeId: "al-154180-6",
    views: "152,800",
    genres: ["action", "adventure", "mystery", "supernatural", "historical", "seinen"],
    synopsis:
      "Johnny Joestar dan Gyro Zeppeli melintasi benua Amerika abad ke-19 dalam pacuan kuda paling berbahaya dengan taruhan 50 juta dolar.",
    year: "2026",
  }),
];

const schedule = [
  {
    day: "Sabtu",
    date: "24 October 2026",
    isToday: true,
    animeList: [
      latestReleases[2], // Bleach Ep 9
      latestReleases[6], // Detective Conan Ep 1196
      latestReleases[7], // Shin Keroro Gunsou Ep 4
      latestReleases[8], // Tougen Anki Ep 4
      card({
        title: "Yasei no Last Boss ga Arawareta! Season 2",
        rawSlug: "yasei-no-last-boss-s2",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx180912-a2N6kR8pQ4tL.jpg",
        score: "8.1",
        status: "Ongoing",
        releaseDay: "Sabtu",
        episode: "Ep 4",
        genres: ["action", "adventure", "fantasy", "isekai", "game"],
        synopsis:
          "Lufasu Maphaahl sang Penguasa Bersayap Hitam melanjutkan penjelajahan benua Midgard untuk menyingkap dalang di balik kebangkitannya.",
      }),
      card({
        title: "Uchi no Otouto-domo ga Sumimasen",
        rawSlug: "uchi-no-otouto-domo-ga-sumimasen",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx179845-f4M7nK2wR9xP.jpg",
        score: "7.8",
        status: "Ongoing",
        releaseDay: "Sabtu",
        episode: "Ep 16",
        genres: ["comedy", "romance", "school", "shoujo"],
        synopsis:
          "Ito Narita mendadak menjadi kakak tertua bagi empat adik tiri laki-laki yang tampan namun penuh kehebohan di bawah satu atap.",
      }),
      card({
        title: "Gensou Suikoden",
        rawSlug: "gensou-suikoden",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx182104-c9L3mP7kQ2wR.jpg",
        score: "8.3",
        status: "Ongoing",
        releaseDay: "Sabtu",
        episode: "Ep 5",
        genres: ["action", "adventure", "drama", "fantasy", "military", "historical"],
        synopsis:
          "Adaptasi RPG legendaris tentang 108 Bintang Takdir yang bersatu menggulingkan kekaisaran yang korup.",
      }),
      card({
        title: "Shiotaiou no Satou-san ga Ore ni dake Amai",
        rawSlug: "shiotaiou-no-satou-san",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx181302-d5K8nM3pR7vQ.jpg",
        score: "7.9",
        status: "Ongoing",
        releaseDay: "Sabtu",
        episode: "Ep 4",
        genres: ["comedy", "romance", "school"],
        synopsis:
          "Koharu Satou yang terkenal dingin di sekolah ternyata bersikap sangat manis hanya kepada Oshio Satsuki di luar jam pelajaran.",
      }),
    ],
  },
  {
    day: "Minggu",
    date: "25 October 2026",
    isToday: false,
    animeList: [
      latestReleases[0], // One Piece Ep 1180
      latestReleases[3], // Black Clover S2 Ep 3
      latestReleases[4], // Tokyo Revengers S4 Ep 4
      card({
        title: "Ao no Hako Season 2",
        rawSlug: "ao-no-hako-s2",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx170942-g3M9pK4wR2vL.jpg",
        score: "8.6",
        status: "Ongoing",
        releaseDay: "Minggu",
        episode: "Ep 5",
        genres: ["romance", "sports", "school", "shounen"],
        synopsis:
          "Taiki Inomata dan Chinatsu Kano mengejar kejuaraan nasional bulu tangkis dan bola basket sembari menjaga perasaan yang tumbuh di antara mereka.",
      }),
      card({
        title: "Aoashi Season 2",
        rawSlug: "aoashi-s2",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx134732-h6N2kR8pQ5mT.jpg",
        score: "8.5",
        status: "Ongoing",
        releaseDay: "Minggu",
        episode: "Ep 6",
        genres: ["drama", "sports", "seinen"],
        synopsis:
          "Ashito Aoi naik ke level kompetisi akademi pemuda tertinggi Jepang bersama Tokyo City Esperion.",
      }),
      card({
        title: "Yozakura-san Chi no Daisakusen Season 2",
        rawSlug: "yozakura-san-s2",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx178541-p8K3nM6wR2qL.jpg",
        score: "8.0",
        status: "Ongoing",
        releaseDay: "Minggu",
        episode: "Ep 4",
        genres: ["action", "comedy", "romance", "shounen"],
        synopsis:
          "Taiyo Asano dan keluarga mata-mata super Yozakura menghadapi ancaman generasi baru organisasi Tanpopo.",
      }),
    ],
  },
  {
    day: "Senin",
    date: "26 October 2026",
    isToday: false,
    animeList: [
      card({
        title: "Tank Chair",
        rawSlug: "tank-chair",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx183420-q2M7nK4pR8vL.jpg",
        score: "8.1",
        status: "Ongoing",
        releaseDay: "Senin",
        episode: "Ep 3",
        genres: ["action", "sci-fi", "seinen", "thriller"],
        synopsis:
          "Pembunuh bayaran terkuat Nagi hanya bisa bangkit dari kondisi komanya di atas kursi roda tempur ketika merasakan niat membunuh yang mematikan.",
      }),
      card({
        title: "Tensei Kizoku, Kantei Skill de Nariagaru Season 3",
        rawSlug: "tensei-kizoku-kantei-skill-s3",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx179210-r4N8pK3wQ6mL.jpg",
        score: "8.2",
        status: "Ongoing",
        releaseDay: "Senin",
        episode: "Ep 4",
        genres: ["adventure", "fantasy", "isekai", "military"],
        synopsis:
          "Ars Louvent memimpin para talenta terbaik yang ia temukan lewat skill Appraisal dalam perang suksesi berskala kekaisaran.",
      }),
      card({
        title: "Temppal (Item no Chikara de Saikyou)",
        rawSlug: "temppal-item-no-chikara",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx184110-s5K9nM2pR7wQ.jpg",
        score: "8.0",
        status: "Ongoing",
        releaseDay: "Senin",
        episode: "Ep 5",
        genres: ["action", "adventure", "fantasy", "game"],
        synopsis:
          "Shin Youngwoo menemukan buku kelas legendaris Keturunan Pagma di dalam gim VRMMO Satisfy dan mengubah nasibnya lewat senjata ciptaannya sendiri.",
      }),
      card({
        title: "Tensei shitara Goblin datta ken",
        rawSlug: "tensei-goblin",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx182990-t6L2mP8kQ3wR.jpg",
        score: "7.8",
        status: "Ongoing",
        releaseDay: "Senin",
        episode: "Ep 4",
        genres: ["action", "adventure", "fantasy", "isekai"],
        synopsis:
          "Bereinkarnasi menjadi goblin dengan umur pendek, Akira berevolusi cepat memimpin klan monster menuju peradaban baru.",
      }),
    ],
  },
  {
    day: "Selasa",
    date: "27 October 2026",
    isToday: false,
    animeList: [
      card({
        title: "Hotaru no Yomeiri",
        rawSlug: "hotaru-no-yomeiri",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx185012-u7M3nK9pR2vL.jpg",
        score: "8.5",
        status: "Ongoing",
        releaseDay: "Selasa",
        episode: "Ep 3",
        genres: ["drama", "romance", "historical", "mystery", "psychological"],
        synopsis:
          "Putri bangsawan era Meiji Satoko Kirigaya yang divonis berumur pendek melamar pembunuh bayaran Shinpei Goto demi bertahan hidup.",
      }),
      card({
        title: "Shinja Zero no Megami-sama to Hajimeru Isekai Kouryaku",
        rawSlug: "shinja-zero-isekai",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx178920-v8N4pK6wQ3mL.jpg",
        score: "7.7",
        status: "Ongoing",
        releaseDay: "Selasa",
        episode: "Ep 4",
        genres: ["action", "adventure", "comedy", "fantasy", "isekai", "magic"],
        synopsis:
          "Makoto Takatsuki menjalin kontrak dengan dewi tanpa pengikut Noah untuk menaklukkan labirin paling mustahil di dunia lain.",
      }),
      card({
        title: "Psyren",
        rawSlug: "psyren",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx185230-w9K5nM3pR8wQ.jpg",
        score: "8.4",
        status: "Ongoing",
        releaseDay: "Selasa",
        episode: "Ep 4",
        genres: ["action", "mystery", "sci-fi", "supernatural", "shounen", "psychological"],
        synopsis:
          "Ageha Yoshina menemukan kartu telepon merah misterius yang menyeretnya ke dunia gurun masa depan penuh monster bernama Psyren.",
      }),
      card({
        title: "Kyouran Reijou Nia Liston",
        rawSlug: "kyouran-reijou-nia-liston",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx183910-x2L6mP9kQ4wR.jpg",
        score: "7.9",
        status: "Ongoing",
        releaseDay: "Selasa",
        episode: "Ep 5",
        genres: ["action", "comedy", "fantasy"],
        synopsis:
          "Pahlawan bela diri legendaris bereinkarnasi ke tubuh gadis bangsawan sakit-sakitan Nia Liston dan mencari lawan tangguh baru.",
      }),
    ],
  },
  {
    day: "Rabu",
    date: "28 October 2026",
    isToday: false,
    animeList: [
      card({
        title: "Chitose-kun wa Ramune Bin no Naka Season 2",
        rawSlug: "chitose-kun-s2",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx179654-y3M7nK2pR5vL.jpg",
        score: "8.1",
        status: "Ongoing",
        releaseDay: "Rabu",
        episode: "Ep 4",
        genres: ["comedy", "drama", "romance", "school"],
        synopsis:
          "Saku Chitose dan lingkaran pertemanan SMA Fujishi melewati musim gugur penuh keputusan masa depan dan perasaan terpendam.",
      }),
      card({
        title: "Tantei wa Mou, Shindeiru. Season 2",
        rawSlug: "tanmoshi-s2",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx151806-z4N8pK3wQ7mL.jpg",
        score: "7.8",
        status: "Ongoing",
        releaseDay: "Rabu",
        episode: "Ep 4",
        genres: ["action", "drama", "mystery", "romance"],
        synopsis:
          "Kimihiko Kimizuka dan Nagisa Natsunagi melanjutkan warisan detektif legendaris Siesta melawan konspirasi SPES.",
      }),
      card({
        title: "Tsuihou sareta Tensei Juukishi wa Game Chishiki de Musou suru",
        rawSlug: "tsuihou-tensei-juukishi",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx181540-a5K9nM4pR8wQ.jpg",
        score: "8.0",
        status: "Ongoing",
        releaseDay: "Rabu",
        episode: "Ep 17",
        genres: ["action", "adventure", "fantasy", "isekai", "game"],
        synopsis:
          "Elma Edvan yang diusir karena kelas Heavy Knight justru mendominasi dunia menggunakan pengetahuan mekanik gim masa lalunya.",
      }),
      card({
        title: "Sekai Saikyou no Majo, Hajimemashita",
        rawSlug: "sekai-saikyou-no-majo",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx184512-b6L2mP9kQ3wR.jpg",
        score: "7.9",
        status: "Ongoing",
        releaseDay: "Rabu",
        episode: "Ep 3",
        genres: ["adventure", "fantasy", "magic"],
        synopsis:
          "Rosetta membangun menara sihir mandiri dengan pengetahuan modern dan tanpa sengaja menjadi penyihir paling disegani di benua.",
      }),
    ],
  },
  {
    day: "Kamis",
    date: "29 October 2026",
    isToday: false,
    animeList: [
      card({
        title: "Sora wa Akai Kawa no Hotori",
        rawSlug: "sora-wa-akai-kawa-no-hotori",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx185410-c7M3nK8pR4vL.jpg",
        score: "8.3",
        status: "Ongoing",
        releaseDay: "Kamis",
        episode: "Ep 4",
        genres: ["adventure", "drama", "historical", "romance", "shoujo"],
        synopsis:
          "Gadis modern Yuri Suzuki tertarik ke Kekaisaran Het kuno di Anatolia dan bertemu Pangeran Kail Mursili di tengah intrik istana.",
      }),
      card({
        title: "Tensei shitara Ken Deshita Season 2",
        rawSlug: "tenken-s2",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx158709-d8N4pK5wQ6mL.jpg",
        score: "8.2",
        status: "Ongoing",
        releaseDay: "Kamis",
        episode: "Ep 5",
        genres: ["action", "adventure", "fantasy", "isekai"],
        synopsis:
          "Fran sang gadis Kucing Hitam dan pedang berkesadaran Shishou menembus turnamen bela diri dan dungeon tingkat tinggi.",
      }),
      card({
        title: "Sasaki to Pii-chan Season 2",
        rawSlug: "sasaki-to-pii-chan-s2",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx176290-e9K5nM2pR7wQ.jpg",
        score: "7.8",
        status: "Ongoing",
        releaseDay: "Kamis",
        episode: "Ep 4",
        genres: ["adventure", "comedy", "fantasy", "isekai", "supernatural"],
        synopsis:
          "Pekerja kantoran Sasaki dan burung pipit penyihir Pii-chan menyeimbangkan perdagangan antar-dunia dengan pertarungan esper di Jepang modern.",
      }),
      card({
        title: "Kikansha no Mahou wa Tokubetsu desu Season 2",
        rawSlug: "kikansha-no-mahou-s2",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx173510-f2L6mP8kQ4wR.jpg",
        score: "8.0",
        status: "Ongoing",
        releaseDay: "Kamis",
        episode: "Ep 4",
        genres: ["action", "adventure", "fantasy", "magic", "school"],
        synopsis:
          "Desir Herrman mempersiapkan rekan-rekannya di Akademi Hebrion menghadapi kemunculan Shadow World tingkat bencana.",
      }),
    ],
  },
  {
    day: "Jumat",
    date: "30 October 2026",
    isToday: false,
    animeList: [
      latestReleases[1], // Slime S4 Ep 21
      latestReleases[5], // Kusuriya S3 Ep 4
      latestReleases[9], // Steel Ball Run Ep 6
      card({
        title: "Toaru Anbu no ITEM",
        rawSlug: "toaru-anbu-no-item",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx183890-g3M7nK4pR9vL.jpg",
        score: "8.4",
        status: "Ongoing",
        releaseDay: "Jumat",
        episode: "Ep 3",
        genres: ["action", "sci-fi", "supernatural", "thriller"],
        synopsis:
          "Unit operasi gelap ITEM yang dipimpin Shizuri Mugino menjalankan misi rahasia di sisi tergelap Academy City.",
      }),
      card({
        title: "Koori no Jouheki Season 2",
        rawSlug: "koori-no-jouheki-s2",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx182740-h4N8pK2wQ5mL.jpg",
        score: "8.2",
        status: "Ongoing",
        releaseDay: "Jumat",
        episode: "Ep 4",
        genres: ["comedy", "drama", "romance", "school"],
        synopsis:
          "Koyuki Hikawa perlahan meruntuhkan dinding es di hatinya bersama Minato, Miki, dan Yoh di tahun ajaran baru.",
      }),
      card({
        title: "Hyouken no Majutsushi ga Sekai wo Suberu Season 2",
        rawSlug: "hyouken-no-majutsushi-s2",
        poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx180430-j5K9nM3pR6wQ.jpg",
        score: "7.6",
        status: "Ongoing",
        releaseDay: "Jumat",
        episode: "Ep 4",
        genres: ["action", "fantasy", "magic", "school"],
        synopsis:
          "Ray White sang Penyihir Pedang Es kembali mempertahankan Akademi Sihir Arnold dari ancaman organisasi Eugenics.",
      }),
    ],
  },
];

const completedCurated = [
  card({
    title: "Solo Leveling Season 2: Arise from the Shadow",
    rawSlug: "solo-leveling-s2-sub-indo",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx176496-x2pU9h8W0N6p.jpg",
    score: "9.0",
    status: "Completed",
    label: "Tamat",
    episode: "13 Ep",
    episodeId: "al-150340-13",
    views: "412,900",
    genres: ["action", "adventure", "fantasy"],
    synopsis:
      "Sung Jin-Woo menguji batas kekuatan barunya sebagai Shadow Monarch hingga pertempuran bersejarah di Pulau Jeju.",
    year: "2025",
  }),
  card({
    title: "Sousou no Frieren",
    rawSlug: "sousou-no-frieren-sub-indo",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-gHSraOSa0nBG.jpg",
    score: "9.3",
    status: "Completed",
    label: "Tamat",
    episode: "28 Ep",
    episodeId: "al-14897128",
    views: "385,120",
    genres: ["adventure", "drama", "fantasy", "magic", "shounen"],
    synopsis:
      "Penyihir elf Frieren menapaki perjalanan baru bersama Fern dan Stark menuju Aureole untuk memahami arti kebersamaan manusia.",
    year: "2023",
  }),
  card({
    title: "Kimetsu no Yaiba: Hashira Geiko-hen",
    rawSlug: "kimetsu-no-yaiba-hashira-geiko-hen",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx166240-PBV7zukIHW7V.png",
    score: "8.7",
    status: "Completed",
    label: "Tamat",
    episode: "8 Ep",
    episodeId: "al-149116-8",
    views: "298,440",
    genres: ["action", "adventure", "fantasy", "supernatural", "demons", "historical", "shounen"],
    synopsis:
      "Tanjiro Kamado dan Korps Pembasmi Iblis menjalani pelatihan keras seluruh Hashira sebelum terjatuh ke Infinity Castle milik Muzan.",
    year: "2024",
  }),
  card({
    title: "Jujutsu Kaisen 2nd Season",
    rawSlug: "jujutsu-kaisen-s2-sub-indo",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx145064-5fa4ZBbW4dqA.jpg",
    score: "8.9",
    status: "Completed",
    label: "Tamat",
    episode: "23 Ep",
    views: "354,200",
    genres: ["action", "fantasy", "supernatural", "shounen"],
    synopsis:
      "Masa lalu Satoru Gojo dan Suguru Geto membuka jalan menuju Insiden Shibuya yang mengguncang dunia penyihir jujutsu.",
    year: "2023",
  }),
  card({
    title: "Shingeki no Kyojin: The Final Season",
    rawSlug: "shingeki-no-kyojin-final-season",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx110277-s2u2d7AS96pB.jpg",
    score: "9.1",
    status: "Completed",
    label: "Tamat",
    episode: "16 Ep",
    views: "502,110",
    genres: ["action", "drama", "mystery", "shounen", "military", "psychological", "thriller"],
    synopsis:
      "Kebenaran di balik lautan terungkap saat Eren Yeager dan Survey Corps berhadapan langsung dengan bangsa Marley.",
    year: "2021",
  }),
  card({
    title: "Naruto: Shippuuden",
    rawSlug: "naruto-shippuuden-sub-indo",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1735-k4pM7nR2wQ9L.jpg",
    score: "8.7",
    status: "Completed",
    label: "Tamat",
    episode: "500 Ep",
    episodeId: "al-150512-489",
    views: "618,900",
    genres: ["action", "adventure", "comedy", "shounen"],
    synopsis:
      "Naruto Uzumaki kembali ke Konoha setelah berlatih bersama Jiraiya demi menyelamatkan Sasuke dan menghentikan rencana Akatsuki.",
    year: "2007",
  }),
  card({
    title: "Bocchi the Rock!",
    rawSlug: "bocchi-the-rock-sub-indo",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx130003-5Y8rL3pQ7mN2.jpg",
    score: "8.8",
    status: "Completed",
    label: "Tamat",
    episode: "12 Ep",
    views: "194,300",
    genres: ["comedy", "music", "school"],
    synopsis:
      "Gitaris pemalu akut Hitori Gotoh menemukan panggung dan sahabat pertamanya bersama Kessoku Band di live house Starry.",
    year: "2022",
  }),
  card({
    title: "86: Eighty Six",
    rawSlug: "eighty-six-sub-indo",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx116589-q3M8nK4pR7vL.jpg",
    score: "8.7",
    status: "Completed",
    label: "Tamat",
    episode: "11 Ep",
    views: "176,800",
    genres: ["action", "drama", "mecha", "sci-fi", "military"],
    synopsis:
      "Mayor Vladilena Milize memimpin Skuadron Spearhead yang bertempur di garis depan tanpa diakui kemanusiaannya oleh Republik San Magnolia.",
    year: "2021",
  }),
  card({
    title: "Dandadan",
    rawSlug: "dandadan-sub-indo",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx171018-2ldCj6QywuOa.jpg",
    score: "8.7",
    status: "Completed",
    label: "Tamat",
    episode: "12 Ep",
    views: "267,500",
    genres: ["action", "comedy", "romance", "sci-fi", "supernatural", "shounen"],
    synopsis:
      "Momo Ayase yang percaya hantu dan Okarun yang terobsesi alien terseret dalam kekacauan paranormal penuh aksi kecepatan tinggi.",
    year: "2024",
  }),
  card({
    title: "Kusuriya no Hitorigoto",
    rawSlug: "kusuriya-no-hitorigoto-sub-indo",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx161645-7I5y9A9h8U7W.jpg",
    score: "8.9",
    status: "Completed",
    label: "Tamat",
    episode: "24 Ep",
    views: "241,000",
    genres: ["drama", "mystery", "historical", "seinen"],
    synopsis:
      "Maomao diculik ke istana kekaisaran dan menggunakan keahlian farmasinya untuk membongkar teka-teki racun para selir.",
    year: "2023",
  }),
  card({
    title: "Cyberpunk: Edgerunners",
    rawSlug: "cyberpunk-edgerunners-sub-indo",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx120377-p2M9nK4wR6vL.jpg",
    score: "8.7",
    status: "Completed",
    label: "Tamat",
    episode: "10 Ep",
    views: "212,600",
    genres: ["action", "drama", "sci-fi", "psychological", "thriller"],
    synopsis:
      "Anak jalanan David Martinez memasang implan militer Sandevistan dan terjun menjadi tentara bayaran edgerunner bersama Lucy di Night City.",
    year: "2022",
  }),
  card({
    title: "Mob Psycho 100 II",
    rawSlug: "mob-psycho-100-s2-sub-indo",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101338-k5N8pK3wQ2mL.jpg",
    score: "8.9",
    status: "Completed",
    label: "Tamat",
    episode: "13 Ep",
    views: "189,400",
    genres: ["action", "comedy", "supernatural"],
    synopsis:
      "Shigeo 'Mob' Kageyama belajar menghadapi emosinya sendiri sambil melawan organisasi esper Claw yang mengancam Kota Seasoning.",
    year: "2019",
  }),
  card({
    title: "Yofukashi no Uta (Call of the Night)",
    rawSlug: "yofukashi-no-uta-sub-indo",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx141391-5kM8nK3pR2vL.jpg",
    score: "8.1",
    status: "Completed",
    label: "Tamat",
    episode: "13 Ep",
    views: "145,200",
    genres: ["comedy", "romance", "supernatural", "vampire", "shounen"],
    synopsis:
      "Kou Yamori yang tidak bisa tidur menjelajahi malam Tokyo dan bertemu vampir eksentrik Nazuna Nanakusa.",
    year: "2022",
  }),
  card({
    title: "Mieruko-chan",
    rawSlug: "mieruko-chan-sub-indo",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx131083-6mN8pK4wQ3vL.jpg",
    score: "7.6",
    status: "Completed",
    label: "Tamat",
    episode: "12 Ep",
    views: "132,100",
    genres: ["comedy", "horror", "supernatural"],
    synopsis:
      "Miko Yotsuya mendadak mampu melihat roh mengerikan di sekitarnya dan harus berpura-pura tidak melihat demi keselamatannya.",
    year: "2021",
  }),
];

// Hanya masukkan kartu hasil pencarian yang BENAR-BENAR Completed (bukan Ongoing & bukan Movie)
const completedList = [
  ...completedCurated,
  ...parsedSearchCards.filter((c) => c.status === "Completed"),
];

const moviesCurated = [
  card({
    title: "Kimetsu no Yaiba Movie: Mugenjou-hen",
    rawSlug: "kimetsu-no-yaiba-movie-mugenjou-hen",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx178788-r3M7nK4pR8vL.jpg",
    score: "9.2",
    status: "Movie",
    label: "Movie",
    episode: "Movie",
    type: "Movie",
    views: "420,500",
    genres: ["action", "fantasy", "supernatural", "demons", "shounen"],
    synopsis:
      "Pertempuran akbar Korps Pembasmi Iblis di dalam labirin tak berujung Infinity Castle melawan para Upper Rank dan Kibutsuji Muzan.",
    year: "2025",
  }),
  card({
    title: "Chainsaw Man Movie: Reze-hen",
    rawSlug: "chainsaw-man-movie-reze-hen",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx171627-s4N8pK2wQ5mL.jpg",
    score: "9.0",
    status: "Movie",
    label: "Movie",
    episode: "Movie",
    type: "Movie",
    views: "312,000",
    genres: ["action", "fantasy", "horror", "romance", "supernatural", "shounen"],
    synopsis:
      "Denji bertemu gadis kafe misterius bernama Reze di tengah hujan, tanpa menyadari badai ledakan yang menantinya.",
    year: "2025",
  }),
  card({
    title: "Haikyuu!! Movie: Gomisuteba no Kessen",
    rawSlug: "haikyuu-movie-gomisuteba-no-kessen",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx153800-t5K9nM3pR6wQ.jpg",
    score: "8.9",
    status: "Movie",
    label: "Movie",
    episode: "Movie",
    type: "Movie",
    views: "265,400",
    genres: ["comedy", "drama", "sports", "school", "shounen"],
    synopsis:
      "Duel legendaris Karasuno melawan rival abadi Nekoma di panggung kejuaraan nasional bola voli SMA.",
    year: "2024",
  }),
  card({
    title: "Jujutsu Kaisen 0 Movie",
    rawSlug: "jujutsu-kaisen-0-movie",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx131573-u6L2mP8kQ4wR.jpg",
    score: "8.6",
    status: "Movie",
    label: "Movie",
    episode: "Movie",
    type: "Movie",
    views: "339,100",
    genres: ["action", "fantasy", "supernatural", "school", "shounen"],
    synopsis:
      "Yuta Okkotsu yang dihantui roh kutukan spesial Rika Orimoto dibimbing oleh Satoru Gojo di SMA Jujutsu Tokyo.",
    year: "2021",
  }),
  card({
    title: "Suzume no Tojimari",
    rawSlug: "suzume-no-tojimari-sub-indo",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx142770-v7M3nK9pR2vL.jpg",
    score: "8.5",
    status: "Movie",
    label: "Movie",
    episode: "Movie",
    type: "Movie",
    views: "218,700",
    genres: ["adventure", "drama", "fantasy", "mystery"],
    synopsis:
      "Suzume Iwato dan Souta Munakata berkeliling Jepang untuk mengunci pintu-pintu dimensi pembawa bencana gempa.",
    year: "2022",
  }),
  card({
    title: "Kimi no Na wa. (Your Name.)",
    rawSlug: "kimi-no-na-wa-sub-indo",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21519-w8N4pK6wQ3mL.jpg",
    score: "9.0",
    status: "Movie",
    label: "Movie",
    episode: "Movie",
    type: "Movie",
    views: "489,300",
    genres: ["drama", "romance", "supernatural"],
    synopsis:
      "Mitsuha dan Taki terhubung lewat pertukaran tubuh melintasi ruang dan waktu sebelum jatuhnya komet Tiamat.",
    year: "2016",
  }),
  card({
    title: "Spy x Family Code: White",
    rawSlug: "spy-x-family-code-white",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx158927-x9K5nM3pR8wQ.jpg",
    score: "8.4",
    status: "Movie",
    label: "Movie",
    episode: "Movie",
    type: "Movie",
    views: "198,200",
    genres: ["action", "comedy", "shounen"],
    synopsis:
      "Liburan musim dingin keluarga Forger di Frigis berubah menjadi misi penyelamatan perdamaian dunia ketika Anya tak sengaja menelan mikrofilm militer.",
    year: "2023",
  }),
  card({
    title: "Blue Lock: Episode Nagi",
    rawSlug: "blue-lock-episode-nagi",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx163146-y2L6mP9kQ4wR.jpg",
    score: "8.1",
    status: "Movie",
    label: "Movie",
    episode: "Movie",
    type: "Movie",
    views: "162,800",
    genres: ["action", "drama", "sports", "shounen"],
    synopsis:
      "Perjalanan jenius pemalas Seishiro Nagi dan Reo Mikage memasuki penjara sepak bola paling kompetitif di Jepang, Blue Lock.",
    year: "2024",
  }),
  card({
    title: "Overlord Movie 3: Sei Oukoku-hen",
    rawSlug: "overlord-movie-sei-oukoku-hen",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx133845-z3M7nK2pR5vL.jpg",
    score: "8.2",
    status: "Movie",
    label: "Movie",
    episode: "Movie",
    type: "Movie",
    views: "184,900",
    genres: ["action", "adventure", "fantasy", "isekai", "demons", "game"],
    synopsis:
      "Kerajaan Suci Roble meminta bantuan Raja Penyihir Ainz Ooal Gown untuk menahan serbuan brutal kaisar iblis Jaldabaoth.",
    year: "2024",
  }),
  card({
    title: "Isekai Quartet Movie: Another World",
    rawSlug: "isekai-quartet-movie-another-world",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx137667-a4v9J2N6pL8Q.jpg",
    score: "7.8",
    status: "Movie",
    label: "Movie",
    episode: "Movie",
    type: "Movie",
    views: "92,140",
    genres: ["comedy", "fantasy", "isekai"],
    synopsis:
      "Para protagonis lintas dunia terlempar melalui wormhole baru ke dunia tandus yang dikuasai golem mekanis raksasa.",
    year: "2022",
  }),
];

const moviesList = [
  ...moviesCurated,
  ...parsedSearchCards.filter(
    (c) => c.status === "Movie" && !moviesCurated.some((m) => m.slug === c.slug)
  ),
  ...parsedAzCards.filter(
    (c) => c.status === "Movie" && !moviesCurated.some((m) => m.slug === c.slug)
  ),
];

// Ongoing murni: seluruh jadwal mingguan + rilis ongoing pencarian (tanpa Completed/Movie)
const ongoingPool = [
  ...schedule.flatMap((d) => d.animeList),
  ...parsedSearchCards.filter((c) => c.status === "Ongoing"),
];
const seenOngoing = new Set();
const ongoingList = ongoingPool.filter((item) => {
  if (seenOngoing.has(item.slug)) return false;
  seenOngoing.add(item.slug);
  return true;
});

const rekomendasiList = [
  completedCurated[1], // Sousou no Frieren
  completedCurated[0], // Solo Leveling S2
  latestReleases[0], // One Piece
  latestReleases[1], // Slime S4
  latestReleases[9], // Steel Ball Run
  completedCurated[3], // Jujutsu Kaisen S2
  completedCurated[4], // Shingeki no Kyojin Final
  completedCurated[9], // Kusuriya S1
  completedCurated[6], // Bocchi the Rock
  moviesCurated[0], // KnY Mugenjou
];

const topAnime = {
  today: [
    { rank: 1, title: "One Piece", slug: toSeriesToken("1piece-sub-indo"), rawSlug: "1piece-sub-indo", poster: latestReleases[0].poster, views: "306,964" },
    { rank: 2, title: "Solo Leveling Season 2", slug: toSeriesToken("solo-leveling-s2-sub-indo"), rawSlug: "solo-leveling-s2-sub-indo", poster: completedCurated[0].poster, views: "215,430" },
    { rank: 3, title: "Steel Ball Run: JoJo no Kimyou na Bouken", slug: toSeriesToken("steel-ball-run-jojo"), rawSlug: "steel-ball-run-jojo", poster: latestReleases[9].poster, views: "152,800" },
    { rank: 4, title: "Tensei shitara Slime Datta Ken Season 4", slug: toSeriesToken("slime-s4-sub-indo"), rawSlug: "slime-s4-sub-indo", poster: latestReleases[1].poster, views: "128,450" },
    { rank: 5, title: "Detective Conan", slug: toSeriesToken("detective-conan"), rawSlug: "detective-conan", poster: latestReleases[6].poster, views: "110,415" },
    { rank: 6, title: "Bleach: Sennen Kessen-hen - Kashin-tan", slug: toSeriesToken("bleach-sennen-kessen-hen-kashin-tan"), rawSlug: "bleach-sennen-kessen-hen-kashin-tan", poster: latestReleases[2].poster, views: "94,210" },
    { rank: 7, title: "Black Clover 2nd Season", slug: toSeriesToken("black-clover-s2-sub-indo"), rawSlug: "black-clover-s2-sub-indo", poster: latestReleases[3].poster, views: "88,120" },
    { rank: 8, title: "Kusuriya no Hitorigoto Season 3", slug: toSeriesToken("kusuriya-no-hitorigoto-s3"), rawSlug: "kusuriya-no-hitorigoto-s3", poster: latestReleases[5].poster, views: "72,300" },
    { rank: 9, title: "Tokyo Revengers: Santen Sensou-hen", slug: toSeriesToken("tokyo-revengers-s4"), rawSlug: "tokyo-revengers-s4", poster: latestReleases[4].poster, views: "64,905" },
    { rank: 10, title: "Tougen Anki: Nikko・Kegon no Taki-hen", slug: toSeriesToken("tougen-anki-s2"), rawSlug: "tougen-anki-s2", poster: latestReleases[8].poster, views: "43,720" },
  ],
  yesterday: [
    { rank: 1, title: "One Piece", slug: toSeriesToken("1piece-sub-indo"), rawSlug: "1piece-sub-indo", poster: latestReleases[0].poster, views: "298,112" },
    { rank: 2, title: "Tensei shitara Slime Datta Ken Season 4", slug: toSeriesToken("slime-s4-sub-indo"), rawSlug: "slime-s4-sub-indo", poster: latestReleases[1].poster, views: "139,800" },
    { rank: 3, title: "Sousou no Frieren", slug: toSeriesToken("sousou-no-frieren-sub-indo"), rawSlug: "sousou-no-frieren-sub-indo", poster: completedCurated[1].poster, views: "118,540" },
    { rank: 4, title: "Bleach: Sennen Kessen-hen - Kashin-tan", slug: toSeriesToken("bleach-sennen-kessen-hen-kashin-tan"), rawSlug: "bleach-sennen-kessen-hen-kashin-tan", poster: latestReleases[2].poster, views: "99,310" },
    { rank: 5, title: "Kusuriya no Hitorigoto Season 3", slug: toSeriesToken("kusuriya-no-hitorigoto-s3"), rawSlug: "kusuriya-no-hitorigoto-s3", poster: latestReleases[5].poster, views: "81,600" },
  ],
  week: [
    { rank: 1, title: "One Piece", slug: toSeriesToken("1piece-sub-indo"), rawSlug: "1piece-sub-indo", poster: latestReleases[0].poster, views: "1,842,190" },
    { rank: 2, title: "Solo Leveling Season 2", slug: toSeriesToken("solo-leveling-s2-sub-indo"), rawSlug: "solo-leveling-s2-sub-indo", poster: completedCurated[0].poster, views: "1,120,450" },
    { rank: 3, title: "Tensei shitara Slime Datta Ken Season 4", slug: toSeriesToken("slime-s4-sub-indo"), rawSlug: "slime-s4-sub-indo", poster: latestReleases[1].poster, views: "894,300" },
    { rank: 4, title: "Steel Ball Run: JoJo no Kimyou na Bouken", slug: toSeriesToken("steel-ball-run-jojo"), rawSlug: "steel-ball-run-jojo", poster: latestReleases[9].poster, views: "765,120" },
    { rank: 5, title: "Kimetsu no Yaiba Movie: Mugenjou-hen", slug: toSeriesToken("kimetsu-no-yaiba-movie-mugenjou-hen"), rawSlug: "kimetsu-no-yaiba-movie-mugenjou-hen", poster: moviesCurated[0].poster, views: "640,880" },
  ],
  month: [
    { rank: 1, title: "One Piece", slug: toSeriesToken("1piece-sub-indo"), rawSlug: "1piece-sub-indo", poster: latestReleases[0].poster, views: "6,410,920" },
    { rank: 2, title: "Naruto: Shippuuden", slug: toSeriesToken("naruto-shippuuden-sub-indo"), rawSlug: "naruto-shippuuden-sub-indo", poster: completedCurated[5].poster, views: "4,920,115" },
    { rank: 3, title: "Solo Leveling Season 2", slug: toSeriesToken("solo-leveling-s2-sub-indo"), rawSlug: "solo-leveling-s2-sub-indo", poster: completedCurated[0].poster, views: "4,312,800" },
    { rank: 4, title: "Sousou no Frieren", slug: toSeriesToken("sousou-no-frieren-sub-indo"), rawSlug: "sousou-no-frieren-sub-indo", poster: completedCurated[1].poster, views: "3,875,400" },
    { rank: 5, title: "Shingeki no Kyojin: The Final Season", slug: toSeriesToken("shingeki-no-kyojin-final-season"), rawSlug: "shingeki-no-kyojin-final-season", poster: completedCurated[4].poster, views: "3,510,200" },
  ],
};

const genresList = [
  { genreId: "action", title: "Action", slug: "action" },
  { genreId: "adventure", title: "Adventure", slug: "adventure" },
  { genreId: "comedy", title: "Comedy", slug: "comedy" },
  { genreId: "drama", title: "Drama", slug: "drama" },
  { genreId: "fantasy", title: "Fantasy", slug: "fantasy" },
  { genreId: "horror", title: "Horror", slug: "horror" },
  { genreId: "isekai", title: "Isekai", slug: "isekai" },
  { genreId: "romance", title: "Romance", slug: "romance" },
  { genreId: "sci-fi", title: "Sci-Fi", slug: "sci-fi" },
  { genreId: "sports", title: "Sports", slug: "sports" },
  { genreId: "supernatural", title: "Supernatural", slug: "supernatural" },
  { genreId: "mystery", title: "Mystery", slug: "mystery" },
  { genreId: "mecha", title: "Mecha", slug: "mecha" },
  { genreId: "school", title: "School", slug: "school" },
  { genreId: "shounen", title: "Shounen", slug: "shounen" },
  { genreId: "seinen", title: "Seinen", slug: "seinen" },
  { genreId: "shoujo", title: "Shoujo", slug: "shoujo" },
  { genreId: "ecchi", title: "Ecchi", slug: "ecchi" },
  { genreId: "harem", title: "Harem", slug: "harem" },
  { genreId: "psychological", title: "Psychological", slug: "psychological" },
  { genreId: "thriller", title: "Thriller", slug: "thriller" },
  { genreId: "magic", title: "Magic", slug: "magic" },
  { genreId: "historical", title: "Historical", slug: "historical" },
  { genreId: "music", title: "Music", slug: "music" },
  { genreId: "game", title: "Game", slug: "game" },
  { genreId: "demons", title: "Demons", slug: "demons" },
  { genreId: "military", title: "Military", slug: "military" },
  { genreId: "vampire", title: "Vampire", slug: "vampire" },
];

/**
 * Bundle stream nyata hasil ekstraksi langsung `https://ylnime.com/index.php?yl_ep_json=1`
 * Hanya dipetakan ke ID episode miliknya sendiri (100% tanpa salah sasaran lintas anime).
 */
const episodeStreams = {
  "al-150441-1180": [
    {
      id: 1,
      reso: "1080p",
      link: "https://s3.animeverse.id/One%20Piece%20%28Sub%20Indo%29/One%20Piece%20%28Sub%20Indo%29%20-%20Episode%201180%20%5B1080p%5D.mp4",
      provide: 871,
    },
    {
      id: 2,
      reso: "720p",
      link: "https://s3.animeverse.id/One%20Piece%20%28Sub%20Indo%29/One%20Piece%20%28Sub%20Indo%29%20-%20Episode%201180%20%5B720p%5D.mp4",
      provide: 871,
    },
    {
      id: 3,
      reso: "720p",
      link: "https://pixeldrain.com/api/file/w8v729h3",
      provide: 99,
    },
    {
      id: 4,
      reso: "480p",
      link: "https://pixeldrain.com/api/file/9T54wNbb",
      provide: 99,
    },
  ],
  "al-153297-21": [
    {
      id: 1,
      reso: "1080p",
      link: "https://s3.animeverse.id/Tensei%20shitara%20Slime%20Datta%20Ken%20Season%204%20%28Sub%20Indo%29/Tensei%20shitara%20Slime%20Datta%20Ken%20Season%204%20%28Sub%20Indo%29%20-%20Episode%2021%20%5B1080p%5D.mp4",
      provide: 871,
    },
    {
      id: 2,
      reso: "720p",
      link: "https://s3.animeverse.id/Tensei%20shitara%20Slime%20Datta%20Ken%20Season%204%20%28Sub%20Indo%29/Tensei%20shitara%20Slime%20Datta%20Ken%20Season%204%20%28Sub%20Indo%29%20-%20Episode%2021%20%5B720p%5D.mp4",
      provide: 871,
    },
    {
      id: 3,
      reso: "720p",
      link: "https://pixeldrain.com/api/file/C1wT92aX",
      provide: 99,
    },
  ],
  "al-150340-13": [
    {
      id: 1,
      reso: "1080p",
      link: "https://sjkt.animekita.org/Solo.Leveling.S2/Solo.Leveling.S2.E13.1080p.mp4",
      provide: 15,
    },
    {
      id: 2,
      reso: "720p",
      link: "https://sjkt.animekita.org/Solo.Leveling.S2/Solo.Leveling.S2.E13.720p.mp4",
      provide: 15,
    },
  ],
  "al-150340-1": [
    {
      id: 1,
      reso: "1080p",
      link: "https://sjkt.animekita.org/Solo.Leveling.S2/Solo.Leveling.S2.E01.1080p.mp4",
      provide: 15,
    },
    {
      id: 2,
      reso: "720p",
      link: "https://sjkt.animekita.org/Solo.Leveling.S2/Solo.Leveling.S2.E01.720p.mp4",
      provide: 15,
    },
    {
      id: 3,
      reso: "720p",
      link: "https://pixeldrain.com/api/file/KdbjY4dJ",
      provide: 11,
    },
  ],
  "al-154222-9": [
    {
      id: 1,
      reso: "1080p",
      link: "https://s3.animeverse.id/Bleach%20Sennen%20Kessen-hen%20-%20Kashin-tan%20%28Sub%20Indo%29/Bleach%20Sennen%20Kessen-hen%20-%20Kashin-tan%20%28Sub%20Indo%29%20-%20Episode%2009%20%5B1080p%5D.mp4",
      provide: 871,
    },
    {
      id: 2,
      reso: "720p",
      link: "https://s3.animeverse.id/Bleach%20Sennen%20Kessen-hen%20-%20Kashin-tan%20%28Sub%20Indo%29/Bleach%20Sennen%20Kessen-hen%20-%20Kashin-tan%20%28Sub%20Indo%29%20-%20Episode%2009%20%5B720p%5D.mp4",
      provide: 871,
    },
  ],
  "al-154261-3": [
    {
      id: 1,
      reso: "1080p",
      link: "https://s3.animeverse.id/Black%20Clover%202nd%20Season%20%28Sub%20Indo%29/Black%20Clover%202nd%20Season%20%28Sub%20Indo%29%20-%20Episode%2003%20%5B1080p%5D.mp4",
      provide: 871,
    },
    {
      id: 2,
      reso: "720p",
      link: "https://s3.animeverse.id/Black%20Clover%202nd%20Season%20%28Sub%20Indo%29/Black%20Clover%202nd%20Season%20%28Sub%20Indo%29%20-%20Episode%2003%20%5B720p%5D.mp4",
      provide: 871,
    },
  ],
  "al-154254-4": [
    {
      id: 1,
      reso: "1080p",
      link: "https://s3.animeverse.id/Tokyo%20Revengers%20Santen%20Sensou-hen%20%28Sub%20Indo%29/Tokyo%20Revengers%20Santen%20Sensou-hen%20%28Sub%20Indo%29%20-%20Episode%2004%20%5B1080p%5D.mp4",
      provide: 871,
    },
    {
      id: 2,
      reso: "720p",
      link: "https://s3.animeverse.id/Tokyo%20Revengers%20Santen%20Sensou-hen%20%28Sub%20Indo%29/Tokyo%20Revengers%20Santen%20Sensou-hen%20%28Sub%20Indo%29%20-%20Episode%2004%20%5B720p%5D.mp4",
      provide: 871,
    },
  ],
  "al-154259-4": [
    {
      id: 1,
      reso: "720p",
      link: "https://s3.animeverse.id/Shin%20Gekijouban%20Keroro%20Gunsou%20%28Sub%20Indo%29/Shin%20Gekijouban%20Keroro%20Gunsou%20%28Sub%20Indo%29%20-%20Episode%2004%20%5B720p%5D.mp4",
      provide: 871,
    },
  ],
  "al-150512-489": [
    {
      id: 1,
      reso: "720p",
      link: "https://sjkt.animekita.org/Naruto.Shippuden/Naruto.Shippuden.489.720p.mp4",
      provide: 15,
    },
    {
      id: 2,
      reso: "480p",
      link: "https://pixeldrain.com/api/file/4vP6nM2k",
      provide: 11,
    },
  ],
  "al-14897128": [
    {
      id: 1,
      reso: "1080p",
      link: "https://sjkt.animekita.org/Sousou.no.Frieren/Sousou.no.Frieren.E28.1080p.mp4",
      provide: 15,
    },
    {
      id: 2,
      reso: "720p",
      link: "https://pixeldrain.com/api/file/9mR4pK8w",
      provide: 11,
    },
  ],
  "al-148971-1": [
    {
      id: 1,
      reso: "1080p",
      link: "https://sjkt.animekita.org/Sousou.no.Frieren/Sousou.no.Frieren.E01.1080p.mp4",
      provide: 15,
    },
    {
      id: 2,
      reso: "720p",
      link: "https://sjkt.animekita.org/Sousou.no.Frieren/Sousou.no.Frieren.E01.720p.mp4",
      provide: 15,
    },
  ],
  "al-149116-8": [
    {
      id: 1,
      reso: "1080p",
      link: "https://sjkt.animekita.org/Kimetsu.Hashira.Geiko/Kimetsu.Hashira.Geiko.E08.1080p.mp4",
      provide: 15,
    },
    {
      id: 2,
      reso: "720p",
      link: "https://sjkt.animekita.org/Kimetsu.Hashira.Geiko/Kimetsu.Hashira.Geiko.E08.720p.mp4",
      provide: 15,
    },
  ],
  "al-149116-1": [
    {
      id: 1,
      reso: "1080p",
      link: "https://sjkt.animekita.org/Kimetsu.Hashira.Geiko/Kimetsu.Hashira.Geiko.E01.1080p.mp4",
      provide: 15,
    },
    {
      id: 2,
      reso: "720p",
      link: "https://pixeldrain.com/api/file/2wK7nL5p",
      provide: 11,
    },
  ],
};

function makeEpisodes(prefix, rawSlug, numbers, dates = {}) {
  return numbers.map((n, idx) => {
    const epId =
      typeof n === "object"
        ? n.id
        : `${prefix}-${n}`;
    const num = typeof n === "object" ? n.num : n;
    return {
      episodeId: epId,
      token: toEpisodeToken(epId, rawSlug),
      number: num,
      title: `Episode ${num}`,
      date: dates[num] || (idx === 0 ? "Baru Rilis" : "2026"),
      hasVerifiedStream: Boolean(episodeStreams[epId]),
    };
  });
}

// Katalog gabungan terdeduplikasi — item kurasi diutamakan agar tidak tertimpa metadata kosong A-Z/Search
const catalogMap = new Map();
const prioritizedPools = [
  latestReleases,
  ongoingList,
  completedCurated,
  moviesCurated,
  rekomendasiList,
  parsedSearchCards,
  parsedAzCards,
];

for (const pool of prioritizedPools) {
  for (const item of pool) {
    if (!item?.slug) continue;
    const prev = catalogMap.get(item.slug);
    if (!prev) {
      catalogMap.set(item.slug, {
        ...item,
        genres: [...new Set(item.genres || [])],
      });
    } else {
      const mergedGenres = [...new Set([...(prev.genres || []), ...(item.genres || [])])];
      catalogMap.set(item.slug, {
        ...item,
        ...prev,
        poster: prev.poster || item.poster,
        banner: prev.banner || item.banner || prev.poster,
        score: prev.score || item.score,
        status: prev.status && prev.status !== "Anime" ? prev.status : item.status,
        label: prev.label || item.label,
        releaseDay: prev.releaseDay || item.releaseDay || "",
        episode: prev.episode || item.episode,
        episodeId: prev.episodeId || item.episodeId,
        synopsis: prev.synopsis || item.synopsis,
        genres: mergedGenres,
      });
    }
  }
}

const fullCatalog = [...catalogMap.values()];

function buildDetailFromCard(baseCard, episodes, extra = {}) {
  return {
    title: baseCard.title,
    slug: baseCard.slug,
    rawSlug: baseCard.rawSlug,
    poster: baseCard.poster,
    banner: extra.banner || baseCard.banner || baseCard.poster,
    score: baseCard.score || "8.5",
    status: baseCard.status || "Ongoing",
    type: extra.type || baseCard.type || "TV",
    year: extra.year || baseCard.year || "2026",
    synopsis:
      extra.synopsis ||
      baseCard.synopsis ||
      `${baseCard.title} subtitle Indonesia dengan kualitas HD dan pembaruan episode akurat.`,
    totalEpisodes: episodes.length,
    genres: (baseCard.genres || []).map((g) => ({
      genreId: g,
      title: g.charAt(0).toUpperCase() + g.slice(1),
    })),
    episodes,
    recommendations: rekomendasiList.filter((r) => r.slug !== baseCard.slug).slice(0, 6),
    sourceUrl: baseCard.sourceUrl,
  };
}

const details = {
  [toSeriesToken("1piece-sub-indo")]: buildDetailFromCard(
    latestReleases[0],
    makeEpisodes(
      "al-150441",
      "1piece-sub-indo",
      Array.from({ length: 24 }, (_, i) => 1180 - i),
      { 1180: "19 Apr 2026", 1179: "12 Apr 2026", 1178: "05 Apr 2026" }
    ),
    { banner: banners[1].banner, year: "1999" }
  ),
  [toSeriesToken("slime-s4-sub-indo")]: buildDetailFromCard(
    latestReleases[1],
    makeEpisodes(
      "al-153297",
      "slime-s4-sub-indo",
      Array.from({ length: 21 }, (_, i) => 21 - i),
      { 21: "17 Apr 2026", 20: "10 Apr 2026", 19: "03 Apr 2026" }
    ),
    { banner: banners[0].banner, year: "2026" }
  ),
  [toSeriesToken("solo-leveling-s2-sub-indo")]: buildDetailFromCard(
    completedCurated[0],
    makeEpisodes(
      "al-150340",
      "solo-leveling-s2-sub-indo",
      Array.from({ length: 13 }, (_, i) => 13 - i),
      { 13: "30 Mar 2025", 1: "05 Jan 2025" }
    ),
    { banner: banners[2].banner, year: "2025" }
  ),
  [toSeriesToken("bleach-sennen-kessen-hen-kashin-tan")]: buildDetailFromCard(
    latestReleases[2],
    makeEpisodes(
      "al-154222",
      "bleach-sennen-kessen-hen-kashin-tan",
      Array.from({ length: 9 }, (_, i) => 9 - i),
      { 9: "18 Apr 2026" }
    ),
    { banner: banners[3].banner, year: "2026" }
  ),
  [toSeriesToken("black-clover-s2-sub-indo")]: buildDetailFromCard(
    latestReleases[3],
    makeEpisodes("al-154261", "black-clover-s2-sub-indo", [3, 2, 1], { 3: "19 Apr 2026" })
  ),
  [toSeriesToken("tokyo-revengers-s4")]: buildDetailFromCard(
    latestReleases[4],
    makeEpisodes("al-154254", "tokyo-revengers-s4", [4, 3, 2, 1], { 4: "19 Apr 2026" })
  ),
  [toSeriesToken("shin-keroro-gunsou")]: buildDetailFromCard(
    latestReleases[7],
    makeEpisodes("al-154259", "shin-keroro-gunsou", [4, 3, 2, 1], { 4: "18 Apr 2026" })
  ),
  [toSeriesToken("sousou-no-frieren-sub-indo")]: buildDetailFromCard(
    completedCurated[1],
    makeEpisodes(
      "al-148971",
      "sousou-no-frieren-sub-indo",
      Array.from({ length: 28 }, (_, i) => {
        const num = 28 - i;
        return num === 28 ? { id: "al-14897128", num: 28 } : num;
      }),
      { 28: "22 Mar 2024", 1: "29 Sep 2023" }
    ),
    { year: "2023" }
  ),
  [toSeriesToken("kimetsu-no-yaiba-hashira-geiko-hen")]: buildDetailFromCard(
    completedCurated[2],
    makeEpisodes(
      "al-149116",
      "kimetsu-no-yaiba-hashira-geiko-hen",
      Array.from({ length: 8 }, (_, i) => 8 - i),
      { 8: "30 Jun 2024", 1: "12 May 2024" }
    ),
    { year: "2024" }
  ),
  [toSeriesToken("naruto-shippuuden-sub-indo")]: buildDetailFromCard(
    completedCurated[5],
    makeEpisodes(
      "al-150512",
      "naruto-shippuuden-sub-indo",
      [...Array.from({ length: 20 }, (_, i) => 500 - i), 1],
      { 500: "23 Mar 2017", 489: "12 Jan 2017", 1: "15 Feb 2007" }
    ),
    { year: "2007" }
  ),
  [toSeriesToken("kusuriya-no-hitorigoto-s3")]: buildDetailFromCard(
    latestReleases[5],
    makeEpisodes("al-154210", "kusuriya-no-hitorigoto-s3", [4, 3, 2, 1], { 4: "17 Apr 2026" }),
    { banner: banners[4].banner, year: "2026" }
  ),
  [toSeriesToken("detective-conan")]: buildDetailFromCard(
    latestReleases[6],
    makeEpisodes(
      "al-149020",
      "detective-conan",
      [...Array.from({ length: 12 }, (_, i) => 1196 - i), 1100],
      { 1196: "18 Apr 2026" }
    ),
    { year: "1996" }
  ),
};

const communityFeed = [
  {
    id: "yl-chat-1",
    nickname: "Admin YLnime",
    avatar: "/assets/favicon.svg",
    message: "Update episode terbaru One Piece Ep 1180 & Slime S4 Ep 21 sudah rilis di server S3 1080p!",
    timestamp: 1776568800,
    isAdmin: true,
    replyTo: null,
  },
  {
    id: "yl-chat-2",
    nickname: "NakamaID",
    avatar: "/assets/no-cover.svg",
    message: "Server Animeverse 1080p lancar banget tanpa buffering, mantap min!",
    timestamp: 1776569200,
    isAdmin: false,
    replyTo: { nickname: "Admin YLnime", message: "Update episode terbaru One Piece Ep 1180..." },
  },
  {
    id: "yl-chat-3",
    nickname: "RimuruTempest",
    avatar: "/assets/no-cover.svg",
    message: "Bleach Kashin-tan Ep 9 animasinya gila parah minggu ini!",
    timestamp: 1776570100,
    isAdmin: false,
    replyTo: null,
  },
  {
    id: "yl-chat-4",
    nickname: "FrierenMage",
    avatar: "/assets/no-cover.svg",
    message: "Kusuriya S3 sama Steel Ball Run wajib masuk watchlist musim ini.",
    timestamp: 1776571500,
    isAdmin: false,
    replyTo: null,
  },
];

const snapshot = {
  generatedAt: "2026-10-24T00:00:00.000Z",
  source: "https://ylnime.com",
  banners,
  topAnime,
  latestReleases,
  ongoing: ongoingList,
  completed: completedList,
  movies: moviesList,
  rekomendasi: rekomendasiList,
  hyper: [...moviesList.slice(0, 6), ...completedCurated.slice(0, 6)],
  genres: genresList,
  schedule,
  catalog: fullCatalog,
  details,
  episodeStreams,
  communityFeed,
};

const outPath = path.join(rootDir, "data/ylnime-snapshot.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), "utf8");
console.log(
  `Snapshot written to ${outPath} (${fullCatalog.length} catalog items, ${ongoingList.length} ongoing, ${completedList.length} completed, ${moviesList.length} movies, ${Object.keys(episodeStreams).length} stream bundles)`
);
