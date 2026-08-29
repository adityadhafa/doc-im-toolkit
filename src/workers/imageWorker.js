// Worker ini berjalan di thread terpisah dari UI. Tidak ada import network,
// tidak ada fetch — semua data (File/Blob) dikirim langsung dari main thread
// lewat postMessage (structured clone), diproses di sini, lalu hasilnya
// dikirim balik. Tidak pernah menyentuh jaringan.

async function decodeToBitmap(file) {
  try {
    return await createImageBitmap(file);
  } catch (err) {
    throw new Error(`Gagal membaca gambar "${file.name}". File mungkin rusak atau formatnya tidak didukung.`);
  }
}

function drawToCanvas(bitmap, targetW, targetH, { fit = 'contain', background = null } = {}) {
  const canvas = new OffscreenCanvas(targetW, targetH);
  const ctx = canvas.getContext('2d');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, targetW, targetH);
  }
  const srcRatio = bitmap.width / bitmap.height;
  const dstRatio = targetW / targetH;
  let dw, dh, dx, dy;

  if (fit === 'cover') {
    if (srcRatio > dstRatio) {
      dh = targetH;
      dw = dh * srcRatio;
    } else {
      dw = targetW;
      dh = dw / srcRatio;
    }
    dx = (targetW - dw) / 2;
    dy = (targetH - dh) / 2;
    ctx.drawImage(bitmap, dx, dy, dw, dh);
  } else {
    // contain: muat seluruh gambar, jaga aspek rasio
    if (srcRatio > dstRatio) {
      dw = targetW;
      dh = dw / srcRatio;
    } else {
      dh = targetH;
      dw = dh * srcRatio;
    }
    dx = (targetW - dw) / 2;
    dy = (targetH - dh) / 2;
    ctx.drawImage(bitmap, dx, dy, dw, dh);
  }
  return canvas;
}

async function encode(canvas, mime, quality) {
  return canvas.convertToBlob({ type: mime, quality });
}

/**
 * Kompres gambar hingga mendekati targetBytes.
 * Strategi: cari quality lewat binary search dulu; jika di quality
 * terendah masih di atas target, turunkan resolusi bertahap lalu ulangi.
 * Setiap percobaan dilaporkan sebagai progres nyata (bukan animasi palsu).
 */
async function compressToTarget({ file, targetBytes, mimeType, id }) {
  const bitmap = await decodeToBitmap(file);
  const isPng = mimeType === 'image/png';
  let scale = 1;
  let bestBlob = null;
  let bestMeta = null;
  let attempt = 0;
  const maxAttempts = isPng ? 6 : 24; // PNG lossless: hanya diskalakan, tanpa quality

  while (attempt < maxAttempts) {
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = drawToCanvas(bitmap, w, h, { fit: 'contain' });

    if (isPng) {
      attempt += 1;
      const blob = await encode(canvas, 'image/png', undefined);
      self.postMessage({ id, type: 'progress', fraction: attempt / maxAttempts, note: `Mencoba skala ${(scale * 100).toFixed(0)}% → ${(blob.size / 1024).toFixed(0)} KB` });
      if (!bestBlob || Math.abs(blob.size - targetBytes) < Math.abs(bestBlob.size - targetBytes)) {
        bestBlob = blob;
        bestMeta = { width: w, height: h, quality: null };
      }
      if (blob.size <= targetBytes) break;
      scale *= 0.82;
      continue;
    }

    // JPEG/WEBP: binary search kualitas di resolusi saat ini
    let lo = 0.05;
    let hi = 0.95;
    let localBest = null;
    for (let i = 0; i < 7; i += 1) {
      attempt += 1;
      const q = (lo + hi) / 2;
      const blob = await encode(canvas, mimeType, q);
      self.postMessage({
        id,
        type: 'progress',
        fraction: Math.min(0.96, attempt / maxAttempts),
        note: `Kualitas ${(q * 100).toFixed(0)}% pada ${w}×${h}px → ${(blob.size / 1024).toFixed(0)} KB`,
      });
      if (!localBest || Math.abs(blob.size - targetBytes) < Math.abs(localBest.size - targetBytes)) {
        localBest = blob;
      }
      if (blob.size > targetBytes) hi = q;
      else lo = q;
      if (attempt >= maxAttempts) break;
    }

    if (!bestBlob || Math.abs(localBest.size - targetBytes) < Math.abs(bestBlob.size - targetBytes)) {
      bestBlob = localBest;
      bestMeta = { width: w, height: h, quality: lo };
    }

    if (localBest.size <= targetBytes) break;
    scale *= 0.85; // masih kebesaran di quality terendah -> perkecil dimensi
  }

  const buf = await bestBlob.arrayBuffer();
  self.postMessage(
    {
      id,
      type: 'done',
      buffer: buf,
      mimeType: isPng ? 'image/png' : mimeType,
      size: bestBlob.size,
      width: bestMeta.width,
      height: bestMeta.height,
      sourceWidth: bitmap.width,
      sourceHeight: bitmap.height,
    },
    [buf]
  );
}

/** Resize presisi ke dimensi piksel tertentu (untuk cetak 3x4, 4x6, dst). */
async function resizeExact({ file, targetW, targetH, mimeType, quality, background, id }) {
  const bitmap = await decodeToBitmap(file);
  self.postMessage({ id, type: 'progress', fraction: 0.4, note: `Menggambar ulang ke ${targetW}×${targetH}px…` });
  const canvas = drawToCanvas(bitmap, targetW, targetH, { fit: 'cover', background });
  self.postMessage({ id, type: 'progress', fraction: 0.75, note: 'Menyandikan hasil…' });
  const blob = await encode(canvas, mimeType, quality);
  const buf = await blob.arrayBuffer();
  self.postMessage(
    { id, type: 'done', buffer: buf, mimeType, size: blob.size, width: targetW, height: targetH, sourceWidth: bitmap.width, sourceHeight: bitmap.height },
    [buf]
  );
}

/** Konversi format (JPG/PNG/WEBP), isi latar putih saat PNG transparan -> JPEG. */
async function convertFormat({ file, mimeType, quality, background, id }) {
  const bitmap = await decodeToBitmap(file);
  self.postMessage({ id, type: 'progress', fraction: 0.5, note: 'Mengonversi format…' });
  const canvas = drawToCanvas(bitmap, bitmap.width, bitmap.height, { fit: 'contain', background });
  const blob = await encode(canvas, mimeType, quality);
  const buf = await blob.arrayBuffer();
  self.postMessage(
    { id, type: 'done', buffer: buf, mimeType, size: blob.size, width: bitmap.width, height: bitmap.height, sourceWidth: bitmap.width, sourceHeight: bitmap.height },
    [buf]
  );
}

self.onmessage = async (e) => {
  const { id, type } = e.data;
  try {
    if (type === 'compress-to-target') await compressToTarget(e.data);
    else if (type === 'resize-exact') await resizeExact(e.data);
    else if (type === 'convert-format') await convertFormat(e.data);
    else throw new Error('Jenis tugas worker tidak dikenali.');
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err?.message || String(err) });
  }
};
