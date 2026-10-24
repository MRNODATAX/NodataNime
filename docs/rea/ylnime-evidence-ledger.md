# NodataNime — REA Reverse-Engineering Evidence Ledger (`ylnime.com`)

> Disusun menggunakan metodologi **`reverse-engineer-anything` (REA v46 / `rea-agents` v6.7.0)** dari repositori `https://github.com/morluto/rea`.
> Tanggal observasi: **24 Oktober 2026**.

## 1. Klasifikasi Bukti (REA Epistemic Discipline)

Setiap temuan arsitektur diberi label epistemik eksplisit sesuai standar REA:
- **`[OBSERVED]`** — Diverifikasi langsung dari respons HTTP, DOM HTML, JSON runtime, atau header jaringan `https://ylnime.com`.
- **`[UPSTREAM-OBSERVED]`** — Diverifikasi dari API hulu yang terhubung di `<link rel="preconnect">` YLnime (`https://apps.animekita.org/api/v1.2.5`, `assets.animekita.org`, `s3.animeverse.id`).
- **`[RECONSTRUCTED]`** — Implementasi bersih (*clean-room reconstruction*) pada **NodataNime** yang mempertahankan kontrak data dengan peningkatan UX & reliabilitas.

---

## 2. Peta Endpoint & Kontrak Target (`https://ylnime.com`)

| ID Bukti | Endpoint Target | Metode | Status | Kontrak & Selektor DOM / JSON |
|---|---|---|---|---|
| `EV-01` | `GET /` (`index.php`) | HTML | `[OBSERVED]` | Hero carousel (`.banner-container .carousel-item`), 24 pill genre cepat, Top Anime 4 tab (`Hari Ini`, `Kemarin`, `7 Hari`, `30 Hari`), `Baru Rilis` (`Ep N`), dan `Sedang Tayang` per hari rilis. |
| `EV-02` | `GET /ongoing.php` | HTML | `[OBSERVED]` | Menampilkan seluruh judul anime sedang tayang (49 judul musim Fall 2026) dalam grid `.card` dengan badge hari tayang di `.badge-corner`. |
| `EV-03` | `GET /completed.php?page={n}` | HTML | `[OBSERVED]` | Katalog anime tamat dengan badge `Tamat` dan paginasi `.pager a` (`Sebelumnya` / `Berikutnya`). |
| `EV-04` | `GET /movies.php?page={n}` | HTML | `[OBSERVED]` | Katalog film/movie anime (50+ judul) dengan badge `Movie`. |
| `EV-05` | `GET /baru.php?page={n}` | HTML | `[OBSERVED]` | Daftar anime & episode yang baru diunggah dengan paginasi `.pager a`. |
| `EV-06` | `GET /rekomendasi.php` | HTML | `[OBSERVED]` | Daftar kurasi rekomendasi anime dengan skor bintang (`★ 8.5`) pada `.badge-corner`. |
| `EV-07` | `GET /hyper.php` | HTML | `[OBSERVED]` | Leaderboard **Top 20 Anime TerHype** berdasarkan total klik organik 30 hari terakhir. |
| `EV-08` | `GET /anime-list.php?l={#|A-Z}` | HTML | `[OBSERVED]` | Katalog indeks penuh berdasarkan huruf awal (`#`, `A`–`Z`), satu halaman penuh per huruf. |
| `EV-09` | `GET /genre.php` & `/genre.php?g={slug}&page={n}` | HTML | `[OBSERVED]` | 28 genre (`a.genre-pill[href*="g="]`): `action` hingga `vampire`, dengan grid `.card` berpaginasi. |
| `EV-10` | `GET /jadwals.php` | HTML | `[OBSERVED]` | Jadwal rilis mingguan yang dirender di server per blok `.day-header` (`#day-0` s/d `#day-6`, `Sabtu`–`Jumat`) lengkap dengan indikator `HARI INI` dan jumlah anime. (`schedule.php` lama sudah tidak aktif tanpa JS lama). |
| `EV-11` | `GET /index.php?search={query}` | HTML | `[OBSERVED]` | Pencarian judul/genre (maksimal 20 kartu `.card` per kueri bawaan; dapat diperluas dengan indeks katalog `anime-list.php`). |
| `EV-12` | `GET /index.php?series={slug}` | HTML | `[OBSERVED]` | Halaman detail anime: `h1` judul, `img.img-fluid.rounded` poster, `h3.text-success` skor/match, `.d-flex span` (`status`, `type`, `year`), `p` sinopsis Indonesia, `a[href*="search="]` genre, daftar episode `a[href*="episode="]` (`span` judul episode, `small` tanggal rilis), FAQ, & *More Like This*. |
| `EV-13` | `GET /index.php?series={slug}&episode={epId}&reso={r}` | HTML | `[OBSERVED]` | Halaman pemutar episode (`#ylJudulEp`, `.breadcrumb a[href*="series="]`), juga menerima alias `&ep={nomor}`. Menyimpan array cadangan `const streams = [{"reso":"720p","link":"..."}];` di dalam `<script>`. |
| `EV-14` | `GET /index.php?yl_ep_json=1&episode={epId}&series={slug}&reso={360p|480p|720p|1080p}` | **JSON** | `[OBSERVED]` | **Endpoint JSON internal pemutar YLnime!** Mengembalikan `{"ok":true,"episode":"...","reso_dipakai":"720p","reso_diminta":"720p","reso_ada":["720p"],"streams":[{"reso":"720p","link":"...","provide":871,"id":...}],"next_ep":...,"prev_ep":...}`. Tanpa parameter `series`, `prev_ep`/`next_ep` bernilai `null`. |
| `EV-15` | `GET /chat_ringan.txt` | **JSON** | `[OBSERVED]` | Umpan JSON statis diskusi komunitas (`[{i, n, a, m, t, adm, r}]`) yang menggantikan polling `chat8.php?action=notif` sejak 11 Oktober 2026 untuk menghemat proses PHP LiteSpeed. |

---

## 3. Invarian Protokol, WAF, Token Slug, & Video CDN

1. **Monarx WAF & Session Cookie (`[OBSERVED]`)**:
   - YLnime menggunakan proteksi Monarx WAF / LiteSpeed. Scraper melakukan *session warmup* ke `GET https://ylnime.com/` guna menyimpan cookie `PHPSESSID`, serta selalu mengirim header `User-Agent` Chrome modern, `Accept-Language: id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7`, dan `Referer: https://ylnime.com/`.
2. **Slug Karakter Khusus (`[OBSERVED]`)**:
   - Beberapa slug series YLnime memiliki akhiran `/` (contoh: `gintama/`, `isekai-cheat-sub-indo/`) atau tanda baca (`(uncen)-nande-koko-ni-sensei-ga!?`). Encoder `toSeriesToken` / `fromSeriesToken` menyandikan `/` akhir menjadi `~`, `?` menjadi `~q`, dan `#` menjadi `~h` agar aman di segmen path URL REST API, sekaligus mendukung query string `?slug=`.
3. **Klasifikasi Provider Video (`[OBSERVED]`)**:
   - `provide: 871` (`https://s3.animeverse.id/ro/*.mp4` atau `/video/*/*.mp4`) — **Animeverse S3 Direct MP4**: Dapat diputar langsung pada elemen HTML5 `<video referrerpolicy="no-referrer">` di browser, atau melalui `/api/anime/stream-proxy` dengan `Referer: https://animeverse.id/`.
   - `provide: 15` (`https://sjkt.animekita.org/*.mp4`) — **AnimeKita Jakarta CDN MP4**: Direct MP4 cepat untuk pengguna Indonesia.
   - `provide: 11` / `99` (`https://pixeldrain.com/api/file/*?download`) — **Pixeldrain Cloud**: Akun gratis memicu `hotlink_detected` pada `Sec-Fetch-Site: cross-site` di tag `<video>`, sehingga disajikan sebagai tautan Unduh Langsung (*Direct Download*) atau via Stream Proxy server.
4. **Upstream Tier-2 Adapter (`[UPSTREAM-OBSERVED]`)**:
   - YLnime terhubung ke hulu `https://apps.animekita.org/api/v1.2.5/` yang mensyaratkan `User-Agent: Dart/3.9 (dart:io)` untuk katalog dan `POST series/episode/data.php` dengan `User-Agent: Flutter/2.5.3` beserta token aplikasi.

---

## 4. Endpoint Dead-End yang Diverifikasi Tidak Dipakai (`[OBSERVED]`)

- `/yabure.php`, `/chat.php`, `/polling.php` -> Mengembalikan HTTP `404 Halaman Tidak Ditemukan`.
- `/schedule.php` -> Usang; digantikan oleh `/jadwals.php` yang dirender penuh di sisi server.
- `/ads_api.php`, `/poll_api.php`, `/lapor_api.php` -> Endpoint aksi internal admin/laporan, bukan API katalog anime.
- `/index.php?action=search|suggest` -> Merender ulang beranda penuh (bukan JSON).
