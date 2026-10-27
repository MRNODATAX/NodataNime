# Panduan Lengkap: Deploy via GitHub ke Vercel (Zero-Config), PWA, & Q&A

Dokumen ini menjelaskan langkah demi langkah men-deploy **NodataNime** dari **GitHub ke Vercel** tanpa perlu menyetel Environment Variables apa pun (*Zero-Env*), disertai sesi **Q&A Teknis** lengkap.

---

## 1. Apa Saja yang Sudah Disiapkan Khusus untuk Vercel?

Repositori ini menggunakan arsitektur **Vercel Native Express (`@vercel/express`)** murni tanpa halaman Admin:
- **`src/app.js` (`export default app`) + `public/app.js`**: Entrypoint resmi `@vercel/express` untuk seluruh rute aplikasi (`/`, `/ongoing`, `/jadwal`, `/watchlist`, dan `/api/*`).
- **`views/index.html` (Zero-Collision App Shell)**: File HTML utama disajikan langsung dari Express (`views/index.html`), sedangkan `public/` hanya berisi aset statis (`/css/*`, `/js/*`, `/assets/*`, `/manifest.webmanifest`, `/sw.js`, `/offline.html`). Pemisahan ini mencegah tabrakan rute antara `static/index.html` dan `functions/index.func` di CDN Vercel.
- **`vercel.json` (`"framework": "express"`, `"outputDirectory": null`)**:
  - Menyertakan bundel katalog `data/**` dan `views/**` agar `ylnime-snapshot.json` dan `views/index.html` selalu terbaca saat *cold-start*.
  - Mengatur header wajib PWA (`Content-Type: application/manifest+json` untuk `/manifest.webmanifest` dan `Service-Worker-Allowed: /` untuk `/sw.js`).
- **Auto `/tmp` Writable Store**: Saat berjalan di Vercel (`process.env.VERCEL`), obrolan komunitas otomatis memakai `/tmp/nodatanime-data` agar bebas dari error `EROFS: read-only file system`.
- **Serverless Range Chunk Clamping (`3.5 MB`)**: Endpoint `/api/anime/stream-proxy` otomatis memotong respons HTTP `206 Partial Content` per `3.5 MB` di Vercel agar di bawah batas `4.5 MB` respons Serverless.

---

## 2. Langkah Deploy via GitHub ke Vercel (100% Tanpa Env Var)

1. Buka **[https://vercel.com/new](https://vercel.com/new)** lalu login dengan akun **GitHub**.
2. Pilih repositori **`MRNODATAX/NodataNime`** -> klik **Import**.
3. Pastikan pengaturan proyek pada posisi default:
   - **Framework Preset**: `Express` *(otomatis terdeteksi)*
   - **Root Directory**: `./` *(kosong / root)*
   - **Output Directory**: *(biarkan Override OFF / kosong)*
   - **Environment Variables**: **Tidak perlu diisi sama sekali** (langsung klik **Deploy**).
4. Setelah status berubah menjadi **Ready**, klik tombol **Visit** di pojok kanan atas halaman proyek Vercel kamu untuk membuka domain aktif terbaru (bukan URL proyek lama yang sudah dihapus).
