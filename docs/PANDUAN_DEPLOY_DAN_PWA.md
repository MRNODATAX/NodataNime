# Panduan Lengkap: Deploy via GitHub ke Vercel, Opsi Server, PWA, & Q&A

Dokumen ini menjelaskan langkah demi langkah men-deploy **NodataNime** dari **GitHub ke Vercel** (beserta alternatif Railway/Render/Docker), serta sesi **Q&A Teknis** dari hasil *Re-check & Quality Assurance* menyeluruh.

---

## 1. Apa Saja yang Sudah Disiapkan Khusus untuk Vercel?

Repositori ini telah dilengkapi arsitektur kompatibel **Vercel Serverless (`@vercel/node`)**:
- **`api/index.js`**: Entrypoint Serverless Express otomatis untuk seluruh endpoint `/api/*`.
- **`vercel.json`**:
  - Menyajikan seluruh aset frontend (`public/`) langsung dari **Global Edge CDN Vercel** secara instan.
  - Menyertakan bundel katalog `data/**` (`includeFiles: "data/**"`) agar `ylnime-snapshot.json` selalu terbaca saat *cold-start*.
  - Mengatur header wajib PWA (`Content-Type: application/manifest+json` untuk `/manifest.webmanifest` dan `Service-Worker-Allowed: /` untuk `/sw.js`).
  - Mengarahkan rute SPA (`/admin`, `/ongoing`, `/jadwal`, `/watchlist`) ke `/index.html`.
- **Stateless HMAC Admin Session (`nd1.*`)**: Token login Admin tetap bertahan meskipun fungsi Serverless Vercel mengalami *cold-start* atau berpindah instance.
- **Auto `/tmp` Writable Vault**: Saat terdeteksi berjalan di Vercel (`process.env.VERCEL`), penyimpanan runtime otomatis diarahkan ke `/tmp/nodatanime-data` agar tidak pernah terkena error `EROFS: read-only file system`.
- **Serverless Range Chunk Clamping (`3.5 MB`)**: Endpoint `/api/anime/stream-proxy` otomatis memotong respons HTTP `206 Partial Content` per `3.5 MB` di Vercel agar tidak pernah melampaui batas respons `4.5 MB` milik fungsi Serverless Vercel.

---

## 2. Tutorial Langkah-demi-Langkah Deploy via GitHub ke Vercel

### Langkah 1 — Pastikan Kode Sudah Ter-Push & Merge di GitHub
1. Pastikan branch kerja di repositori GitHub `MRNODATAX/NodataNime` sudah di-*push* (atau digabung/*merge* ke branch `main` melalui Pull Request).
2. Pastikan file `vercel.json`, folder `api/index.js`, `public/`, `src/`, dan `data/ylnime-snapshot.json` ada di repositori GitHub kamu.

### Langkah 2 — Hubungkan GitHub ke Vercel
1. Buka **[https://vercel.com/new](https://vercel.com/new)** lalu login menggunakan akun **GitHub** kamu.
2. Pada bagian **Import Git Repository**, cari **`MRNODATAX/NodataNime`** lalu klik tombol **Import**.
   *(Jika repositori belum muncul, klik **Adjust GitHub App Permissions** -> pilih repositori `NodataNime` -> Save).*

### Langkah 3 — Atur Konfigurasi Project di Halaman Vercel
Pada halaman **Configure Project**, pastikan pengaturannya seperti berikut:
- **Project Name**: `nodatanime` *(atau nama sesuai keinginanmu)*
- **Framework Preset**: **Other** *(biarkan default — Vercel otomatis membaca `vercel.json` dan folder `public/`)*
- **Root Directory**: `./` *(biarkan kosong / root)*
- **Build Command**: *(biarkan kosong / default, tidak perlu build bundel tambahan)*
- **Output Directory**: *(biarkan default — folder `public` otomatis terdeteksi)*

### Langkah 4 — Isi Environment Variables (Wajib!)
Klik bagian **Environment Variables**, lalu tambahkan variabel berikut satu per satu:

| Name (Key) | Value | Keterangan |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Mode produksi Express |
| `ADMIN_USERNAME` | `admin` | Username untuk masuk ke `/admin` |
| `ADMIN_PASSWORD` | *(buat password kuatmu)* | Password login halaman `/admin` |
| `ADMIN_SESSION_SECRET` | *(teks acak panjang min. 32 karakter)* | Kunci tanda tangan HMAC agar sesi login Admin tidak pernah logout saat *cold-start* |

### Langkah 5 — Klik Deploy & Uji Hasilnya!
1. Klik tombol **Deploy** dan tunggu sekitar **25–45 detik** hingga status berubah menjadi **Congratulations!**.
2. Buka domain HTTPS bawaan Vercel (misal `https://nodatanime.vercel.app`) dan cek:
   - `/` — Animasi pembuka Logo & Nama **NodataNime**, Beranda, Starry Night, & Bottom Navbar SVG.
   - `/api/health` — Harus menampilkan `"status": "ok"` & `"app": "NodataNime"`.
   - `/manifest.webmanifest` — Tombol **Install Aplikasi (PWA)** langsung aktif karena domain Vercel sudah otomatis HTTPS!
   - `/admin` — Login menggunakan `ADMIN_USERNAME` & `ADMIN_PASSWORD` yang kamu setel di Langkah 4.
3. *(Opsional)* Setiap kali kamu melakukan `git push` baru ke branch utama di GitHub, Vercel akan **otomatis men-deploy ulang (Auto CI/CD)** dalam hitungan detik!

---

## 3. Q&A Lengkap (Hasil Re-check & Pertanyaan Umum Produksi)

### Q1: Apakah di Vercel fitur Live Scraper `ylnime.com` langsung aktif?
**Jawaban:** **Ya, langsung aktif!** Saat di-deploy ke Vercel, server memiliki akses internet penuh ke `https://ylnime.com` dan `https://apps.animekita.org`. Sistem **Multi-Tier** NodataNime otomatis mencoba menarik katalog, jadwal, dan episode terbaru langsung dari `ylnime.com`, dan bila sumber sedang padat/maintenance, otomatis beralih mulus ke `ylnime-snapshot.json` tanpa error.

### Q2: Apakah data Obrolan Komunitas & Override Admin bersifat permanen di Vercel Gratis (Hobby)?
**Jawaban:** Penting diketahui secara jujur:
- Di **Vercel Serverless**, sistem file `/tmp` bersifat **sementara (*ephemeral*)** — artinya pesan obrolan baru atau override yang dibuat lewat `/admin` bertahan selama container Serverless hangat, tetapi **akan ter-reset ke kondisi awal saat container mengalami *cold-start* / redeploy**.
- **Solusi jika ingin chat & override 100% permanen selamanya**:
  1. Gunakan hosting berbasis kontainer dengan *Persistent Volume* seperti **Railway** (`railway.json` sudah siap) atau **Render** (`render.yaml` sudah siap) dengan `DATA_DIR=/var/data`, **ATAU**
  2. Jika tetap ingin di Vercel, sambungkan database gratis seperti **Upstash Redis / Supabase** di masa depan untuk menggantikan file JSON `/tmp`.

### Q3: Bagaimana dengan pemutaran video MP4 720p/1080p di Vercel (mengingat Vercel punya batas respons 4.5 MB)?
**Jawaban:** **Aman 100%!**
1. Secara bawaan (*default*), elemen `<video referrerpolicy="no-referrer">` NodataNime memutar stream MP4 **langsung dari CDN video ke browser penonton** sehingga beban trafik video **0 MB** di Vercel kamu.
2. Jika penonton menekan tombol **Proxy Range**, `src/routes/streamProxy.js` kini telah dilengkapi `normalizeRangeForServerless()` yang otomatis memotong setiap potongan *byte-range* `206 Partial Content` menjadi **3.5 MB per chunk** (di bawah batas 4.5 MB Vercel), sehingga pemutaran tetap mulus!

### Q4: Kenapa sebelumnya ada anime di Jadwal tulisannya `Ep 4` tapi saat dibuka muncul `12 Episode` atau malah memutar anime lain? Apakah masih bisa terjadi?
**Jawaban:** **Tidak akan terjadi lagi (sudah dikunci dengan regression test otomatis).**
- Jumlah episode pada detail kini dihitung langsung dari data episode asli seri / badge jadwal (`Ep 4` = tepat 4 episode).
- Fallback lintas-anime (`al-153297-21`) dan lintas-episode sudah dihapus permanen. Bila suatu episode belum punya mirror video langsung, pemutar menampilkan kartu status khusus episode tersebut beserta tautan sumber & tombol tambah mirror Admin — tidak pernah lagi memutar video anime yang salah.

### Q5: Apakah versi PWA bisa langsung di-install di Android, iPhone (iOS), dan Laptop setelah masuk Vercel?
**Jawaban:** **Bisa langsung!** Karena Vercel otomatis memberikan sertifikat **SSL/HTTPS**, Service Worker (`/sw.js`) dan Web App Manifest (`/manifest.webmanifest`) langsung memenuhi syarat penuh:
- **Android / Chrome / Edge Desktop**: Klik tombol **Aplikasi** di kanan atas header atau **Lainnya → Install Aplikasi**.
- **iPhone / iPad (Safari)**: Ketuk tombol **Share (Bagikan)** di Safari lalu pilih **Add to Home Screen (Tambahkan ke Layar Utama)** — ikon `apple-touch-icon.png` 180×180 dan mode layar penuh (`standalone`) sudah terpasang otomatis.

---

## 4. Alternatif Deploy Kontainer Persisten (Railway / Render / VPS Docker)

Jika suatu saat kamu membutuhkan penyimpanan disk permanen tanpa batas waktu Serverless:
- **Railway**: Hubungkan repo GitHub -> tambahkan Volume `/var/data` -> setel `DATA_DIR=/var/data`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`. (`railway.json` sudah siap).
- **Render**: Klik **New -> Blueprint** -> pilih repo GitHub `NodataNime` (`render.yaml` otomatis membuat web service + disk persisten `/var/data`).
- **VPS Docker**:
  ```bash
  cp .env.example .env
  docker compose up -d --build
  ```
