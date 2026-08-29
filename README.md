# Toolkit Dokumen & Gambar

Website statis untuk kebutuhan dokumen administrasi di Indonesia (lamaran kerja, CPNS/SSCASN,
pendaftaran kuliah, dll). **100% diproses di browser (client-side)** — tidak ada file yang
pernah dikirim ke server manapun. Ini alternatif privasi dari tools online sejenis
(iLovePDF/iLoveIMG/TinyPNG) yang biasanya mengunggah file Anda ke server mereka.

## Fitur

1. **Kompres PDF** ke target ukuran (KB/MB) — PDF dirender jadi gambar per halaman, dikompres,
   lalu disusun ulang jadi PDF baru (cocok untuk PDF hasil scan).
2. **Kompres & Resize Gambar** ke target ukuran KB.
3. **Gambar ⇄ PDF** — gambar ke PDF (multi-halaman) dan PDF ke gambar (JPG/PNG), termasuk
   PDF berhalaman banyak (hasil di-zip otomatis).
4. **Ukuran Cetak Foto** — preset 3×4, 4×6, 2×3 cm + custom, dengan pilihan DPI cetak.
5. **Gabung ke PDF** — gabungkan gambar & PDF (boleh campur) jadi satu file PDF, urutan bisa
   diatur.
6. **Ubah Format Gambar** — konversi JPG/PNG/WEBP, latar transparan PNG otomatis diisi putih
   saat dikonversi ke JPG.

## Stack Teknis

- [Vite](https://vitejs.dev/) + **vanilla JavaScript** (tanpa framework UI)
- [`pdf-lib`](https://pdf-lib.js.org/) untuk membuat/menyusun PDF (via npm import, lazy-loaded)
- [`pdfjs-dist`](https://mozilla.github.io/pdf.js/) untuk merender halaman PDF ke gambar
- [`jszip`](https://stuk.github.io/jszip/) untuk mem-bundle hasil PDF→gambar multi-halaman
- Web Worker (`src/workers/imageWorker.js`, `OffscreenCanvas`) untuk kompres/resize/convert
  gambar agar UI tidak freeze pada file besar
- Semua library berat di-*lazy load* (`import()`) hanya saat tool terkait dibuka

## Struktur Project

```
├── index.html                  # Shell aplikasi (header, tab nav, footer)
├── vite.config.js
├── package.json
├── .github/workflows/deploy.yml
└── src/
    ├── main.js                 # Registry tab & navigasi tanpa reload
    ├── style.css                # Design system (tanpa Google Fonts / CDN eksternal)
    ├── tools/
    │   ├── compressPdf.js
    │   ├── compressImage.js
    │   ├── imagePdfConvert.js
    │   ├── resizePrint.js
    │   ├── mergeFiles.js
    │   └── convertFormat.js
    ├── utils/                   # dropzone, validasi, format angka, komponen UI bersama, dll
    └── workers/
        └── imageWorker.js       # Kompres/resize/convert gambar di background thread
```

## Menjalankan secara lokal

```bash
npm install
npm run dev       # dev server dengan hot reload
npm run build     # build produksi ke folder dist/
npm run preview   # preview hasil build
```

## Deploy ke GitHub Pages (otomatis)

Repo ini sudah menyertakan workflow GitHub Actions di `.github/workflows/deploy.yml` yang akan
build & deploy otomatis setiap kali ada push ke branch `main`.

**Langkah setup (sekali saja):**

1. Push repo ini ke GitHub.
2. Buka **Settings → Pages** di repo GitHub Anda.
3. Pada bagian **Build and deployment → Source**, pilih **"GitHub Actions"** (bukan
   "Deploy from a branch").
4. Push ke branch `main` — workflow akan otomatis build project dan men-deploy ke GitHub Pages.
   Anda bisa memantau prosesnya di tab **Actions**.
5. Setelah selesai, situs akan tersedia di `https://<username>.github.io/<nama-repo>/`.

> Base path Vite (`vite.config.js`) sudah otomatis disesuaikan dengan nama repo lewat variabel
> `VITE_BASE_PATH` di workflow, jadi tidak perlu diedit manual kecuali Anda menjalankan build
> di luar GitHub Actions (mis. build lokal untuk custom domain / repo `username.github.io`,
> di mana base path harus `'/'`).

## Prinsip privasi

- Tidak ada kode yang melakukan `fetch`/`XMLHttpRequest` untuk mengirim isi file pengguna.
- Semua pemrosesan file (baca, kompres, convert, gabung) memakai Web API bawaan browser:
  `Canvas`/`OffscreenCanvas`, `File`/`Blob`, dan library yang berjalan sepenuhnya di
  JavaScript sisi klien (`pdf-lib`, `pdfjs-dist`, `jszip`) — tidak ada panggilan ke backend.
- Anda bisa memverifikasi sendiri: buka tab **Network** di DevTools browser saat memakai
  tool apa pun di situs ini — tidak akan ada request keluar yang berisi file Anda.

## Menambah tool baru

Setiap tool adalah modul terpisah di `src/tools/*.js` yang meng-`export function mount(container)`
dan (opsional) mengembalikan fungsi `unmount()` untuk membersihkan object URL. Daftarkan tool
baru di array `TOOLS` pada `src/main.js` dengan `load: () => import('./tools/toolBaru.js')` agar
tetap lazy-loaded.
