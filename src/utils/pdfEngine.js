// Modul ini sengaja memisahkan import berat (pdf-lib, pdfjs-dist) ke dalam
// fungsi async terpisah supaya Vite melakukan code-splitting: library ini
// baru diunduh browser saat pengguna benar-benar membuka tool terkait PDF,
// bukan saat halaman pertama kali dimuat.

let pdfjsPromise = null;
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).href;
      return mod;
    });
  }
  return pdfjsPromise;
}

export async function getPdfLib() {
  return import('pdf-lib');
}

export async function openPdfForRender(arrayBuffer) {
  const pdfjs = await getPdfjs();
  try {
    const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    return doc;
  } catch (err) {
    const msg = String(err?.message || err);
    if (/password/i.test(msg)) {
      const e = new Error('PDF_PASSWORD');
      e.cause = err;
      throw e;
    }
    const e = new Error('PDF_INVALID');
    e.cause = err;
    throw e;
  }
}

/** Render satu halaman PDF ke canvas pada scale tertentu. */
export async function renderPageToCanvas(pdfDoc, pageNumber, scale = 2) {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

export function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Gagal menyandikan gambar dari halaman PDF.'))), mime, quality);
  });
}

/** Pesan error ramah pengguna untuk kegagalan buka PDF. */
export function friendlyPdfOpenError(err, filename) {
  if (err?.message === 'PDF_PASSWORD') {
    return `"${filename}" dilindungi kata sandi. Hapus dulu proteksinya lewat aplikasi PDF reader, lalu coba lagi.`;
  }
  return `"${filename}" gagal dibuka — kemungkinan file rusak atau bukan PDF yang valid. Coba buka dulu di aplikasi PDF lain untuk memastikan filenya baik-baik saja.`;
}
