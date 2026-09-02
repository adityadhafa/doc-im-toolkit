const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const PDF_TYPE = 'application/pdf';

export class ValidationError extends Error {}

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

/**
 * Validasi satu file terhadap tipe yang diizinkan & ukuran maksimum.
 * Mengembalikan pesan error yang actionable (bukan "terjadi kesalahan").
 */
export function validateFile(file, { accept = 'image', maxSizeMB = 60 } = {}) {
  if (!file) return 'File tidak ditemukan. Coba pilih ulang file Anda.';

  if (file.size === 0) {
    return `File "${file.name}" kosong (0 byte). Kemungkinan file rusak — coba ekspor ulang dari sumbernya.`;
  }
  if (file.size > maxSizeMB * 1024 * 1024) {
    return `File "${file.name}" berukuran ${(file.size / 1024 / 1024).toFixed(1)} MB, melebihi batas ${maxSizeMB} MB yang aman diproses di browser. Coba kompres dulu atau gunakan file yang lebih kecil.`;
  }

  const ext = extOf(file.name);

  if (accept === 'image') {
    const okType = IMAGE_TYPES.includes(file.type) || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext);
    if (!okType) {
      return `"${file.name}" bukan file gambar yang didukung. Gunakan format JPG, JPEG, PNG, WEBP, atau HEIC.`;
    }
  } else if (accept === 'pdf') {
    const okType = file.type === PDF_TYPE || ext === 'pdf';
    if (!okType) {
      return `"${file.name}" bukan file PDF. Pastikan ekstensi file adalah .pdf.`;
    }
  } else if (accept === 'image-or-pdf') {
    const okType =
      IMAGE_TYPES.includes(file.type) ||
      file.type === PDF_TYPE ||
      ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf'].includes(ext);
    if (!okType) {
      return `"${file.name}" bukan gambar atau PDF yang didukung. Gunakan JPG, PNG, WEBP, HEIC, atau PDF.`;
    }
  }

  return null; // valid
}

export function validateFiles(files, opts) {
  const errors = [];
  const valid = [];
  for (const file of files) {
    const err = validateFile(file, opts);
    if (err) errors.push(err);
    else valid.push(file);
  }
  return { valid, errors };
}

/** Deteksi PDF terpassword/terenkripsi dari pesan error pdf-lib/pdfjs. */
export function describePdfError(err, filename) {
  const msg = String(err?.message || err || '').toLowerCase();
  if (msg.includes('password') || msg.includes('encrypt')) {
    return `"${filename}" dilindungi kata sandi. Buka & hapus proteksi PDF-nya terlebih dulu (mis. lewat aplikasi PDF reader Anda), lalu unggah ulang.`;
  }
  if (msg.includes('invalid pdf') || msg.includes('corrupt') || msg.includes('failed to parse') || msg.includes('bad xref')) {
    return `"${filename}" sepertinya rusak atau bukan PDF yang valid. Coba buka dulu file ini di aplikasi PDF untuk memastikan tidak corrupt, lalu simpan ulang.`;
  }
  return `Gagal memproses "${filename}": ${err?.message || 'format tidak dikenali'}. Coba gunakan file lain atau simpan ulang PDF-nya.`;
}
