# Rencana Halaman Admin & Analisis Ketahanan Jangka Panjang NodataNime

Dokumen ini disusun sebagai panduan arsitektur bagi **NodataNime** terkait:
1. **Blueprint Halaman Admin (Admin Dashboard Plan)** untuk mengelola katalog, server video, serta kesehatan scraper.
2. **Analisis Keamanan & Keberlanjutan Jangka Panjang** saat website bergantung pada **API / Backend pihak ketiga** (`ylnime.com`, `animekita`, dan CDN eksternal).

---

## Bagian 1: Analisis Jangka Panjang — Apakah Aman Menggunakan API / Backend Web Lain?

**Jawaban Singkat:**
- **Untuk jangka pendek – menengah (MVP, trafik awal, prototipe komunitas):** **Cukup aman secara teknis** *asalkan* menggunakan lapisan pelindung seperti yang sudah dibangun di NodataNime (Backend Adapter sendiri, Validasi Skema/Sanitasi XSS, Whitelist Host SSRF, Caching, Multi-Upstream Fallback, dan Local Snapshot).
- **Untuk jangka panjang (skala besar / produksi bertahun-tahun):** Mengandalkan 100% backend/scraper web orang lain **TIDAK AMAN jika dijadikan satu-satunya sumber (Single Point of Failure)**. Website pihak ketiga sewaktu-waktu bisa mengubah struktur HTML/JSON, memasang proteksi anti-bot, mengganti token CDN, atau tutup mendadak.

Berikut bedah risiko dari 5 aspek utama beserta status mitigasinya di NodataNime:

### 1. Risiko Ketersediaan & Perubahan Struktur (Reliability Risk) — **TINGGI**
- **Masalah:** Pemilik `ylnime.com` dapat mengubah nama class CSS (`.detpost`, `.ep-item`), mengganti parameter `index.php?yl_ep_json=1`, atau server mereka mengalami *downtime*.
- **Dampak jika tanpa proteksi:** Halaman website kita ikut kosong atau error 500.
- **Mitigasi yang sudah ada di NodataNime:**
  - **3-Tier Fallback (`animeService.js`):** `Live YLnime` → `AnimeKita Upstream API` → `Local Verified Snapshot (data/ylnime-snapshot.json)`. Jika sumber utama mati, pengguna tetap melihat katalog dan tetap bisa memutar episode yang sudah tersimpan.
- **Solusi Jangka Panjang:** Simpan metadata hasil scrape ke **Database Mandiri (PostgreSQL / SQLite)** secara berkala (sinkronisasi latar belakang), sehingga pengguna membaca dari database kita sendiri, bukan menunggu request langsung ke web lain setiap klik.

### 2. Risiko Pemblokiran IP, Rate-Limit & Anti-Bot (Cloudflare/WAF) — **SEDANG–TINGGI**
- **Masalah:** Jika 1.000 pengguna membuka NodataNime bersamaan dan setiap klik memicu request ke `ylnime.com`, IP server kita akan terdeteksi sebagai serangan DDoS/bot dan diblokir (HTTP 403 / Cloudflare Turnstile).
- **Mitigasi yang sudah ada di NodataNime:**
  - **In-Memory TTL Cache (`src/utils/cache.js`)** menahan request berulang agar hanya 1 request per periode TTL yang keluar ke sumber.
- **Solusi Jangka Panjang:**
  - Gunakan **Background Sync Worker (Cron Job tiap 10–15 menit)** untuk menarik update episode terbaru secara terjadwal dan sopan (*rate-limited*), bukan *on-demand* dari klik user.

### 3. Risiko Link Video Mati / Hotlink Protection CDN — **TINGGI**
- **Masalah:** Link MP4 dari CDN pihak ketiga (`s3.animeverse.id`, `sjkt.animekita.org`, `pixeldrain.com`) bisa memakai *signed URL* yang kedaluwarsa, memblokir `Referer` asing (*hotlink protection*), atau menghapus file lama.
- **Mitigasi yang sudah ada di NodataNime:**
  - Prioritas otomatis server MP4 langsung (`provide: 871` & `15`) di atas Pixeldrain (`hotlink_detected`), atribut `referrerpolicy="no-referrer"`, serta endpoint `/api/anime/stream-proxy` yang meneruskan header `Range` byte-stream.
- **Solusi Jangka Panjang:**
  - Sediakan fitur **Custom Mirror / Multi-Provider Override** di Halaman Admin agar admin bisa menambahkan link cadangan (mis. Cloudflare R2, Backblaze B2, Google Drive proxy, atau HLS M3U8 milik sendiri) untuk anime populer.

### 4. Risiko Keamanan Siber (Security: XSS, Payload Poisoning, SSRF) — **TERKENDALI (AMAN JIKA DISANITASI)**
- **Masalah:**
  1. *Payload Poisoning / Stored XSS:* Jika web sumber diretas atau menyisipkan `<script>` jahat di judul/sinopsis anime, lalu web kita merendernya mentah-mentah ke browser user, akun/sesi user kita bisa dicuri.
  2. *Open Proxy / SSRF:* Jika endpoint `/api/anime/stream-proxy?url=...` tidak membatasi domain tujuan, penyerang bisa memakainya untuk memindai jaringan internal server kita atau menguras bandwidth.
- **Mitigasi yang sudah aktif di NodataNime:**
  - Fungsi `esc()` pada seluruh output teks/atribut di `public/js/app.js` mencegah injeksi HTML/XSS.
  - `ALLOWED_MEDIA_HOSTS` di `src/routes/streamProxy.js` memblokir semua domain di luar daftar putih CDN resmi dan menolak IP lokal/loopback.

### 5. Risiko Legal & Reputasi Domain — **PERLU DIPERHATIKAN**
- **Masalah:** Konten streaming anime fansub berada di area abu-abu hak cipta (DMCA). Selain itu, kadang web sumber menyisipkan watermark atau *preroll* iklan pihak ketiga di dalam file video mereka.
- **Solusi Jangka Panjang:** Pisahkan domain utama katalog dengan domain worker/proxy media, sediakan halaman mekanisme pelaporan DMCA/takedown di Admin, dan hindari melakukan *iframe embed* mentah dari situs tidak tepercaya (gunakan ekstraksi URL MP4/HLS murni pada player sendiri seperti di NodataNime).

---

## Bagian 2: Rencana Halaman Admin (Admin Panel Blueprint)

Agar NodataNime siap dikelola secara profesional untuk jangka panjang, berikut rancangan **Halaman Admin (`/admin` + `/api/admin/*`)** yang terbagi menjadi **7 Modul Inti**:

### Arsitektur Keamanan Admin
- **Autentikasi:** Login Admin menggunakan `Argon2/bcrypt` password hash + `HttpOnly, SameSite=Strict` session cookie / JWT berumur pendek.
- **Proteksi Brute-Force:** Rate limiter khusus rute `/api/admin/login` (maks. 5 percobaan / 15 menit) + pencatatan *Audit Log* setiap perubahan data.
- **Role-Based Access Control (RBAC):**
  - `Super Admin`: Pengaturan sistem, sumber scraper, manajemen akun staff, backup database.
  - `Editor / Uploader`: Tambah/edit anime manual, perbaiki link episode mati, atur banner beranda.
  - `Moderator`: Moderasi komentar/chat komunitas & tindak lanjut laporan link rusak dari penonton.

---

### 7 Modul Utama Halaman Admin

#### 1. Dashboard Kesehatan Sistem & Scraper (`Scraper & Upstream Health`)
- Indikator status *real-time* (Online / Lambat / Terblokir) untuk setiap upstream:
  - `ylnime.com` (HTML & `yl_ep_json=1`)
  - `apps.animekita.org` (Fallback API)
  - CDN Storage (`s3.animeverse.id`, `sjkt.animekita.org`)
- Grafik latensi rata-rata (ms), *Cache Hit Ratio*, penggunaan RAM server, dan tombol **"Bersihkan Cache Sekarang"** atau **"Sinkronisasi Snapshot Sekarang"**.
- Peringatan otomatis (*Schema Drift Alert*) bila jumlah kartu yang terbaca dari beranda tiba-tiba `0` (pertanda web target baru saja mengubah HTML).

#### 2. Manajemen Katalog Hybrid (`Hybrid Catalog & Override Manager`)
- Tabel seluruh judul anime dengan kemampuan **Override Data Scraper**:
  - Edit judul, poster, banner HD, sinopsis Bahasa Indonesia, skor, status (`Ongoing` / `Completed`), dan jadwal hari tayang.
  - Pin anime tertentu ke **Hero Carousel Beranda** atau **Rekomendasi Pilihan Admin**.
  - Tambah **Anime Eksklusif Manual** yang belum ada di website sumber.
  - Flag `is_locked = true` agar perubahan manual admin tidak tertimpa saat scraper melakukan sinkronisasi otomatis.

#### 3. Manajemen Episode & Multi-Server Video (`Episode & Stream Manager`)
- Lihat daftar episode per seri dan status setiap link resolusi (`360p`, `480p`, `720p`, `1080p`).
- **Tambah Server Cadangan Manual:** Admin dapat menempelkan URL MP4 / HLS `.m3u8` / Embed cadangan dan mengatur urutan prioritas server (misal: Server 1 = CDN Pribadi, Server 2 = Animeverse S3, Server 3 = AnimeKita).
- **Auto Link-Checker:** Tombol uji cepat (`HEAD` / `Range: bytes=0-1`) untuk mendeteksi video mana yang error 404/403 sebelum penonton mengeluh.

#### 4. Kotak Masuk Laporan Penonton (`Broken Episode Reports`)
- Di halaman pemutar video user, tombol *"Laporkan Video Error"* mengirim tiket ke Admin berisi `seriesSlug`, `episodeId`, server yang gagal, dan pesan singkat.
- Admin dapat memfilter episode yang paling banyak dilaporkan rusak dan langsung mengganti link-nya dalam satu layar.

#### 5. Pengaturan Mesin Scraper & Proxy (`Source & Proxy Config`)
- Toggle *Switch Mode* tanpa perlu restart kode:
  - `Mode 1: Hybrid Auto` (Database Lokal + Auto-Sync Scraper)
  - `Mode 2: Live Scraper First`
  - `Mode 3: Offline / Lockdown Mode` (100% melayani dari Database/Snapshot lokal saat upstream sedang bermasalah).
- Pengaturan durasi TTL Cache, daftar `ALLOWED_MEDIA_HOSTS` untuk stream proxy, dan rotasi User-Agent / Outbound Proxy jika diperlukan.

#### 6. Pengumuman Banner & Moderasi Komunitas (`Community & Notice`)
- Kelola pengumuman penting di atas halaman atau di lonceng notifikasi (misal: *"Jadwal One Piece minggu ini libur"* atau info domain cadangan).
- Moderasi pesan chat komunitas (hapus spam, sematkan pesan Admin, blokir kata kasar).

#### 7. Backup & Ekspor Data (`Database & Snapshot Vault`)
- Ekspor seluruh katalog + daftar episode + override manual ke file `.json` / `.sql` terenkripsi secara terjadwal (harian) ke penyimpanan eksternal agar data NodataNime **100% aman dan tidak pernah hilang** meskipun web sumber tutup permanen.

---

## Bagian 3: Peta Jalan (Roadmap) Menuju Kemandirian Jangka Panjang

| Tahap | Arsitektur | Tingkat Ketergantungan ke Web Lain | Keamanan Jangka Panjang |
| :--- | :--- | :--- | :--- |
| **Tahap 1 (Saat Ini)** | Live Scraper Adapter + AnimeKita Fallback + TTL Cache + Snapshot JSON Lokal | Tinggi–Sedang (terlindungi fallback snapshot) | Baik untuk peluncuran awal & preview |
| **Tahap 2 (Disarankan Berikutnya)** | **Database SQLite/PostgreSQL** + Background Sync Worker + **Admin Panel Override** | Rendah untuk Katalog (katalog tetap hidup 100% walau sumber mati); Sedang untuk CDN Video | **Sangat Aman** untuk operasional harian & trafik menengah–tinggi |
| **Tahap 3 (Skala Besar)** | Multi-Source Aggregator (2–3 sumber berbeda) + Penyimpanan objek sendiri (Cloudflare R2 / S3) untuk judul populer | Sangat Rendah (Mandiri penuh) | **Level Produksi Penuh (Enterprise-Grade)** |
