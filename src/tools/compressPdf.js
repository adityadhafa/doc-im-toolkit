import { el, clear, icon } from '../utils/dom.js';
import { createDropzone } from '../utils/dropzone.js';
import { validateFiles, describePdfError } from '../utils/validate.js';
import { fileRow, progressBar, alertBox, resultPanel } from '../utils/ui.js';
import { formatBytes, parseSizeToBytes } from '../utils/format.js';
import { downloadBlob, createObjectUrlPool } from '../utils/download.js';
import { openPdfForRender, renderPageToCanvas, canvasToBlob, getPdfLib, friendlyPdfOpenError } from '../utils/pdfEngine.js';
import { showToast } from '../utils/toast.js';

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

export function mount(container) {
  const urls = createObjectUrlPool();
  let queue = [];
  let processing = false;

  const listEl = el('ul', { class: 'file-list' });
  const errorsEl = el('div');
  const resultsEl = el('div', { style: 'display:flex; flex-direction:column; gap:16px; margin-top:18px;' });

  const targetInput = el('input', { type: 'number', min: '20', step: '10', value: '500', 'aria-label': 'Target ukuran' });
  const unitSelect = el('select', { 'aria-label': 'Satuan ukuran' }, [
    el('option', { value: 'KB' }, 'KB'),
    el('option', { value: 'MB', selected: true }, 'MB'),
  ]);

  const processBtn = el('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: true, onClick: startProcessing }, 'Kompres PDF Sekarang');

  const LIGHTBULB_ICON =
    '<path d="M9 18h6M10 21h4M8 14a5 5 0 1 1 8 0c-.8.8-1.5 1.6-1.7 2.6a.9.9 0 0 1-.9.7h-2.8a.9.9 0 0 1-.9-.7C9.5 15.6 8.8 14.8 8 14Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
  const recommendBtnLabel = el('span', {}, 'Cek Rekomendasi Ukuran');
  const recommendBtn = el('button', { class: 'btn btn-secondary btn-sm', type: 'button', style: 'margin-top:10px;', onClick: handleRecommend }, [icon(LIGHTBULB_ICON, 15), recommendBtnLabel]);
  const recommendResultEl = el('div', { style: 'margin-top:10px;' });

  function fillTargetFromBytes(bytes) {
    if (bytes >= 1024 * 1024) {
      unitSelect.value = 'MB';
      targetInput.value = String(Math.ceil((bytes / 1024 / 1024) * 10) / 10);
    } else {
      unitSelect.value = 'KB';
      targetInput.value = String(Math.max(20, Math.ceil(bytes / 1024 / 10) * 10));
    }
  }

  async function handleRecommend() {
    if (!queue.length) {
      showToast('Upload PDF dulu untuk mengecek rekomendasi.', 'error');
      return;
    }
    const target = queue[0].file;
    recommendBtn.disabled = true;
    recommendBtnLabel.textContent = 'Menganalisis…';
    clear(recommendResultEl);
    try {
      const rec = await computeRecommendation(target);
      const percent = Math.max(0, Math.round((1 - rec.recommendedBytes / target.size) * 100));
      recommendResultEl.appendChild(
        el('div', { class: 'tip-box' }, [
          icon(LIGHTBULB_ICON, 18, 'tip-box__icon'),
          el('div', {}, [
            el('strong', {}, `Rekomendasi: ~${formatBytes(rec.recommendedBytes)}`),
            el('p', {},
              `Resolusi dijaga di sekitar ${rec.dpi} DPI dengan kualitas gambar ${(rec.quality * 100).toFixed(0)}%${percent > 0 ? ` — turun sekitar ${percent}% dari ${formatBytes(target.size)}` : ''}. Estimasi dari ${rec.sampled} dari ${rec.numPages} halaman yang diperiksa. Ukuran segini umumnya masih sangat jelas dibaca teks, AI, maupun OCR/sistem administratif.${queue.length > 1 ? ' Dihitung dari file pertama di antrean.' : ''}`
            ),
            el('button', {
              class: 'btn btn-primary btn-sm', type: 'button', style: 'margin-top:9px;',
              onClick: () => { fillTargetFromBytes(rec.recommendedBytes); showToast('Target ukuran diisi dari rekomendasi.'); },
            }, 'Pakai Rekomendasi Ini'),
          ]),
        ])
      );
    } catch (err) {
      const msg = err?.message === 'PDF_PASSWORD' || err?.message === 'PDF_INVALID'
        ? friendlyPdfOpenError(err, target.name)
        : describePdfError(err, target.name);
      recommendResultEl.appendChild(alertBox(msg, { title: 'Gagal cek rekomendasi' }));
    }
    recommendBtn.disabled = false;
    recommendBtnLabel.textContent = 'Cek Rekomendasi Ukuran';
  }

  const dropzone = createDropzone({
    accept: 'application/pdf',
    multiple: true,
    title: 'Tarik & lepas PDF di sini',
    hint: 'atau',
    buttonLabel: 'Pilih File PDF',
    maxHint: 'Maksimal 80 MB per file',
    onFiles: handleFiles,
  });

  function handleFiles(files) {
    const { valid, errors } = validateFiles(files, { accept: 'pdf', maxSizeMB: 80 });
    clear(errorsEl);
    errors.forEach((msg) => errorsEl.appendChild(alertBox(msg)));
    for (const file of valid) queue.push({ file });
    renderQueue();
  }

  function renderQueue() {
    clear(listEl);
    for (const item of queue) {
      listEl.appendChild(
        fileRow(item.file, {
          onRemove: () => { queue = queue.filter((q) => q !== item); renderQueue(); },
        })
      );
    }
    processBtn.disabled = queue.length === 0 || processing;
  }

  async function startProcessing() {
    const targetBytes = parseSizeToBytes(targetInput.value, unitSelect.value);
    if (!targetBytes) {
      showToast('Masukkan target ukuran yang valid.', 'error');
      return;
    }
    if (!queue.length) return;

    processing = true;
    processBtn.disabled = true;
    processBtn.textContent = 'Memproses…';
    window.__setPrivacyActive?.(true);
    clear(resultsEl);

    for (const item of queue) {
      const card = el('div', { class: 'card result-card' });
      resultsEl.appendChild(card);
      const bar = progressBar({ label: `Membuka "${item.file.name}"…` });
      card.appendChild(bar.node);

      try {
        const out = await compressPdfFile(item.file, targetBytes, (fraction, note) => bar.update(fraction, note));
        bar.done(`Selesai — ${out.pages} halaman`);

        const blob = new Blob([out.bytes], { type: 'application/pdf' });

        clear(card);
        card.className = '';
        card.append(
          resultPanel({
            title: 'Kompresi Selesai!',
            subtitle: `File berhasil dikompresi · ${out.pages} halaman ✨`,
            beforeBytes: item.file.size,
            afterBytes: out.bytes.byteLength,
            previewUrl: out.previewAfter,
            previewMeta: `${out.pages} halaman · ${formatBytes(out.bytes.byteLength)}`,
            filenameBase: `${item.file.name.replace(/\.pdf$/i, '')}-kompres`,
            filenameExt: '.pdf',
            note: out.bytes.byteLength > targetBytes
              ? alertBox(
                  `Ukuran belum bisa turun sampai target tanpa membuat teks/foto terlalu buram. Hasil terbaik: ${formatBytes(out.bytes.byteLength)}. Untuk target lebih kecil lagi, pertimbangkan memisah PDF per beberapa halaman.`,
                  { title: 'Mendekati target, belum tepat tercapai' }
                )
              : null,
            onDownload: (filename) => downloadBlob(blob, filename),
          })
        );
      } catch (err) {
        clear(card);
        const msg = err?.message === 'PDF_PASSWORD' || err?.message === 'PDF_INVALID'
          ? friendlyPdfOpenError(err, item.file.name)
          : describePdfError(err, item.file.name);
        card.appendChild(alertBox(msg, { title: `Gagal memproses "${item.file.name}"` }));
      }
    }

    processing = false;
    processBtn.textContent = 'Kompres PDF Sekarang';
    processBtn.disabled = queue.length === 0;
    window.__setPrivacyActive?.(false);
    showToast('Pemrosesan selesai.');
  }

  const optionsCard = el('div', { class: 'card' }, [
    el('div', { class: 'field' }, [
      el('label', {}, 'Target ukuran akhir'),
      el('div', { class: 'input-row' }, [targetInput, unitSelect]),
      el('div', { class: 'field-hint' }, 'PDF akan diubah menjadi gambar terkompres per halaman lalu disusun ulang — cocok untuk PDF hasil scan.'),
      recommendBtn,
      recommendResultEl,
    ]),
    processBtn,
  ]);

  container.append(
    el('div', { class: 'tool-grid tool-grid--split' }, [el('div', {}, [dropzone, errorsEl, listEl]), optionsCard]),
    resultsEl
  );
  renderQueue();

  return function unmount() { urls.revokeAll(); };

  /**
   * Estimasi ukuran akhir "aman-OCR": render sampel halaman pada ~200 DPI
   * (ambang umum agar teks tetap terbaca akurat oleh OCR/AI) dengan kualitas
   * JPEG 78%, lalu ekstrapolasi ke seluruh halaman. Hanya sampel beberapa
   * halaman (bukan semua) supaya cek rekomendasi tetap cepat untuk PDF tebal.
   */
  async function computeRecommendation(file) {
    const buf = await file.arrayBuffer();
    const pdfDoc = await openPdfForRender(buf.slice(0));
    const numPages = pdfDoc.numPages;
    const OCR_SAFE_DPI = 200;
    const scale = OCR_SAFE_DPI / 72;
    const quality = 0.78;

    const maxSamples = 5;
    const sampleIndices = [];
    if (numPages <= maxSamples) {
      for (let p = 1; p <= numPages; p += 1) sampleIndices.push(p);
    } else {
      for (let i = 0; i < maxSamples; i += 1) {
        const p = 1 + Math.round((i * (numPages - 1)) / (maxSamples - 1));
        if (!sampleIndices.includes(p)) sampleIndices.push(p);
      }
    }

    let totalSampleBytes = 0;
    for (const p of sampleIndices) {
      recommendBtnLabel.textContent = `Memeriksa halaman ${p}…`;
      const canvas = await renderPageToCanvas(pdfDoc, p, scale);
      const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      totalSampleBytes += blob.size;
      await yieldFrame();
    }
    const avgPerPage = totalSampleBytes / sampleIndices.length;
    const recommendedBytes = Math.round(avgPerPage * numPages);
    return { recommendedBytes, numPages, dpi: OCR_SAFE_DPI, quality, sampled: sampleIndices.length };
  }

  async function compressPdfFile(file, targetBytes, onProgress) {
    const buf = await file.arrayBuffer();
    const pdfDoc = await openPdfForRender(buf.slice(0));
    const numPages = pdfDoc.numPages;

    let scale = numPages > 15 ? 1.3 : 2.0;
    let bestAttempt = null;
    let previewBefore = null;

    for (let round = 0; round < 3; round += 1) {
      const pageCanvases = [];
      const pagePointSizes = [];
      for (let p = 1; p <= numPages; p += 1) {
        onProgress((round * numPages + p) / (numPages * 3.6), `Merender halaman ${p}/${numPages} (skala ${scale.toFixed(2)}×)…`);
        const canvas = await renderPageToCanvas(pdfDoc, p, scale);
        pageCanvases.push(canvas);
        const page = await pdfDoc.getPage(p);
        const vp1 = page.getViewport({ scale: 1 });
        pagePointSizes.push({ w: vp1.width, h: vp1.height });
        if (p === 1 && round === 0) {
          previewBefore = urls.create(await canvasToBlob(canvas, 'image/jpeg', 0.85));
        }
        await yieldFrame();
      }

      let lo = 0.08;
      let hi = 0.92;
      let roundBest = null;
      for (let i = 0; i < 6; i += 1) {
        const q = (lo + hi) / 2;
        const blobs = [];
        let total = 0;
        for (const canvas of pageCanvases) {
          const blob = await canvasToBlob(canvas, 'image/jpeg', q);
          blobs.push(blob);
          total += blob.size;
        }
        onProgress(0.85 + i * 0.02, `Mencoba kualitas ${(q * 100).toFixed(0)}% → total ${formatBytes(total)}…`);
        if (!roundBest || Math.abs(total - targetBytes) < Math.abs(roundBest.total - targetBytes)) {
          roundBest = { q, blobs, total };
        }
        if (total > targetBytes) hi = q; else lo = q;
        await yieldFrame();
      }

      if (!bestAttempt || Math.abs(roundBest.total - targetBytes) < Math.abs(bestAttempt.total - targetBytes)) {
        bestAttempt = { ...roundBest, pagePointSizes };
      }
      if (roundBest.total <= targetBytes || scale < 0.55) break;
      scale *= 0.7;
    }

    const { PDFDocument } = await getPdfLib();
    const outDoc = await PDFDocument.create();
    for (let i = 0; i < bestAttempt.blobs.length; i += 1) {
      onProgress(0.97, `Menyusun ulang PDF (${i + 1}/${bestAttempt.blobs.length})…`);
      const bytes = new Uint8Array(await bestAttempt.blobs[i].arrayBuffer());
      const jpg = await outDoc.embedJpg(bytes);
      const { w, h } = bestAttempt.pagePointSizes[i];
      const page = outDoc.addPage([w, h]);
      page.drawImage(jpg, { x: 0, y: 0, width: w, height: h });
    }
    const outBytes = await outDoc.save();
    const previewAfter = urls.create(bestAttempt.blobs[0]);

    return { bytes: outBytes, pages: numPages, previewBefore, previewAfter };
  }
}
