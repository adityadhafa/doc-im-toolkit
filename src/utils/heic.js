// HEIC/HEIF (format foto default iPhone) tidak bisa dibaca langsung oleh
// Canvas/createImageBitmap di sebagian besar browser (Chrome, Firefox, Edge).
// Modul ini memakai `heic2any` — library yang menjalankan decoder libheif
// lewat WebAssembly sepenuhnya di browser (tidak ada fetch ke server mana pun)
// untuk mengubah HEIC/HEIF jadi PNG, baru kemudian file PNG itu diproses
// dengan pipeline Canvas/Worker yang sama seperti gambar lain.
//
// Diimpor lewat import() dinamis supaya WASM (~1.3 MB) hanya diunduh saat
// benar-benar ada file HEIC yang diunggah, bukan saat halaman pertama dibuka.

let heic2anyPromise = null;
async function getHeic2Any() {
  if (!heic2anyPromise) {
    heic2anyPromise = import('heic2any').then((mod) => mod.default || mod);
  }
  return heic2anyPromise;
}

export function isHeicFile(file) {
  const type = (file?.type || '').toLowerCase();
  return type === 'image/heic' || type === 'image/heif' || /\.(heic|heif)$/i.test(file?.name || '');
}

/** Ubah File HEIC/HEIF jadi File PNG standar yang bisa dibaca Canvas & browser. */
export async function decodeHeicToPngFile(file) {
  const heic2any = await getHeic2Any();
  let result;
  try {
    result = await heic2any({ blob: file, toType: 'image/png' });
  } catch (err) {
    throw new Error(`Gagal membaca "${file.name}". File HEIC mungkin rusak, terenkripsi, atau memakai varian yang belum didukung.`);
  }
  const blob = Array.isArray(result) ? result[0] : result;
  const newName = file.name.replace(/\.(heic|heif)$/i, '.png');
  return new File([blob], newName.endsWith('.png') ? newName : `${newName}.png`, { type: 'image/png' });
}

/** Kalau file HEIC/HEIF, kembalikan versi PNG yang bisa diproses; kalau bukan, kembalikan apa adanya. */
export async function resolveDecodableFile(file) {
  if (!isHeicFile(file)) return file;
  return decodeHeicToPngFile(file);
}
