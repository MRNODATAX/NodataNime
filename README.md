# NodataNime 🎬

**NodataNime** adalah platform streaming anime **Subtitle Indonesia HD (360p–1080p)** bebas iklan sekaligus **Public REST Scraper API** yang dibangun dari 0 (`dari 0`) dengan merekonstruksi arsitektur & kontrak data `https://ylnime.com` menggunakan metodologi **[morluto/rea (`reverse-engineer-anything`)](https://github.com/morluto/rea)**.

---

## ✨ Fitur Utama

### 1. Mesin Scraper & Data 3-Tier (Multi-Tier Resilience)
- **Tier 1 — Live `ylnime.com` Scraper (`src/scrapers/ylnimeClient.js`)**:
  - *Session warmup* cookie `PHPSESSID` & header Chrome modern untuk melewati proteksi Monarx WAF.
  - Parser DOM Cheerio terverifikasi (`src/parsers/ylnimeParser.js`) untuk seluruh halaman katalog, detail, jadwal, genre, dan indeks A–Z.
  - Ekstraktor **Endpoint JSON Internal Pemutar YLnime** (`index.php?yl_ep_json=1&episode=...&series=...&reso=...`) untuk mengambil seluruh resolusi (`360p`, `480p`, `720p`, `1080p`) & server (`Animeverse S3`, `AnimeKita CDN`, `Pixeldrain`) ditambah fallback inline `<script> const streams = [...]`.
  - Tokenisasi slug reversibel (`toSeriesToken` / `fromSeriesToken`) untuk menangani slug YLnime yang diakhiri `/` atau karakter khusus.
- **Tier 2 — Upstream `AnimeKita v1.2.5` Adapter (`src/scrapers/animekitaClient.js`)**:
  - Mendukung endpoint hulu `apps.animekita.org/api/v1.2.5/` (`Dart/3.9 (dart:io)` & `Flutter/2.5.3`).
- **Tier 3 — Verified Live Snapshot Store (`src/services/snapshotStore.js`)**:
  - Menyimpan snapshot terverifikasi dari `ylnime.com` (196+ judul anime unik, 28 genre, jadwal 7 hari, dan bundel stream MP4 asli) sehingga aplikasi tetap berjalan 100% instan di lingkungan terisolasi/offline.

### 2. Pengalaman Streaming Modern (SPA Bebas Iklan)
- **Hero Spotlight Carousel**, **Top 10 Anime Terpopuler** (*Hari Ini, Kemarin, 7 Hari, 30 Hari*), **Baru Rilis**, & **Sedang Tayang** dengan filter hari rilis.
- **Pemutar Video HTML5 Multi-Server & Multi-Resolusi**:
  - Mendukung pemutaran langsung CDN (`Animeverse S3` & `AnimeKita CDN`), HTTP `206 Partial Content` Range Proxy (`/api/anime/stream-proxy`), kartu **Lanjutkan Menonton (Resume Playback)**, **Auto-Next Episode**, **Mode Bioskop**, dan pintasan keyboard (`/` cari cepat, `←`/`→` ±10 detik).
- **Koleksi Saya (Watchlist) & Riwayat Tontonan** tersimpan otomatis di browser (`localStorage`).
- **API & REA Live Inspector**: Panel interaktif untuk menguji seluruh endpoint REST API secara langsung dan meninjau *Obligation Ledger* REA.

---

## 📡 Daftar Endpoint REST API

| Metode | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/api/health` | Status kesehatan server, cache TTL, dan konektivitas scraper |
| `GET` | `/api/anime/home` | Data lengkap beranda (Banner, Top 10, Baru Rilis, Ongoing, Genre, Diskusi) |
| `GET` | `/api/anime/list?type=ongoing&page=1` | Katalog kategori (`ongoing`, `completed`, `movie`, `baru`, `rekomendasi`, `hyper`) |
| `GET` | `/api/anime/az?letter=I&page=1` | Katalog lengkap indeks huruf (`#`, `A`–`Z`) |
| `GET` | `/api/anime/search?q=isekai` | Pencarian anime cepat |
| `GET` | `/api/anime/genres` | Daftar seluruh 28 genre anime |
| `GET` | `/api/anime/genre/:genreId?page=1` | Daftar anime berdasarkan genre |
| `GET` | `/api/anime/jadwal` | Jadwal rilis mingguan (`Sabtu` s/d `Jumat`) |
| `GET` | `/api/anime/detail/:slug` | Informasi detail seri, sinopsis, genre, & daftar episode |
| `GET` | `/api/anime/episode?series=:slug&episode=:epId` | Multi-resolusi & multi-server stream video (`yl_ep_json=1`) |
| `GET` | `/api/anime/stream-proxy?url=:encodedUrl` | HTTP `206` Range video proxy dengan *Referer* otomatis & proteksi SSRF |
| `GET` | `/api/community` | Obrolan komunitas live + kartu Info Komunitas resmi |
| `POST` | `/api/community/messages` | Kirim obrolan komunitas (dengan proteksi rate-limit & balasan) |
| `GET` | `/api/rea/evidence` | Laporan Reverse-Engineering & *Obligation Ledger* REA |
| `POST` | `/api/admin/*` | Studio Admin Hybrid Override, Custom Mirror, & Moderasi Komunitas |

---

## 📱 Progressive Web App (PWA) & Deploy Produksi

- **PWA Installable**: Mendukung pemasangan aplikasi mandiri di Android, iOS, Windows, & macOS (`/manifest.webmanifest`, ikon `192/512/maskable/apple-touch-icon`, Service Worker `/sw.js`, dan `/offline.html`).
- **Siap Deploy**: Dilengkapi `vercel.json` + default export `src/app.js` (khusus runtime native `@vercel/express` untuk deploy GitHub → Vercel), `Dockerfile`, `docker-compose.yml`, `render.yaml`, `railway.json`, dan `.env.example`.
- Panduan lengkap tersedia di [`docs/PANDUAN_DEPLOY_DAN_PWA.md`](docs/PANDUAN_DEPLOY_DAN_PWA.md) serta analisis arsitektur Admin di [`docs/ADMIN_DAN_STRATEGI_JANGKA_PANJANG.md`](docs/ADMIN_DAN_STRATEGI_JANGKA_PANJANG.md).

---

## 🚀 Cara Menjalankan

```bash
# 1. Instal dependensi
npm install

# 2. Jalankan pengujian kontrak & parser (REA Verification)
npm test

# 3. Jalankan audit statis REA (opsional)
npm run rea:analyze

# 4. Jalankan server produksi / development (default port 3000 pada 0.0.0.0)
npm start
```

---

## 🔬 Dokumentasi REA (`docs/rea/`)
- [`docs/rea/ylnime-evidence-ledger.md`](docs/rea/ylnime-evidence-ledger.md) — Bukti observasi lengkap arsitektur, DOM, dan protokol JSON `ylnime.com`.
- [`docs/rea/obligation-ledger.json`](docs/rea/obligation-ledger.json) — Pemetaan kewajiban rekonstruksi ke modul kode dan pengujian otomatis.
- `docs/rea/nodatanime-rea-evidence.json` — Bundel bukti hasil analisis statis `rea-agents`.
