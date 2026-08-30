import { el, clear, icon } from '../utils/dom.js';
import { createDropzone } from '../utils/dropzone.js';
import { validateFiles, describePdfError } from '../utils/validate.js';
import { fileRow, progressBar, alertBox, resultPanel, emptyState } from '../utils/ui.js';
import { formatBytes } from '../utils/format.js';
import { downloadBlob, createObjectUrlPool } from '../utils/download.js';
import { loadImageElement } from '../utils/imageFile.js';
import { openPdfForRender, renderPageToCanvas, canvasToBlob, getPdfLib, friendlyPdfOpenError } from '../utils/pdfEngine.js';
import { showToast } from '../utils/toast.js';

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

export function mount(container) {
  const urls = createObjectUrlPool();
  let mode = 'to-pdf'; // 'to-pdf' | 'to-image'
  let queue = [];
  let processing = false;

  const modeTabs = el('div', { class: 'segmented' }, [
    el('button', { type: 'button', class: 'is-active', onClick: () => setMode('to-pdf') }, 'Gambar → PDF'),
    el('button', { type: 'button', onClick: () => setMode('to-image') }, 'PDF → Gambar'),
  ]);

  const listEl = el('ul', { class: 'file-list' });
  const errorsEl = el('div');
  const resultsEl = el('div', { style: 'display:flex; flex-direction:column; gap:16px; margin-top:18px;' });

  const outFormatSelect = el('select', { 'aria-label': 'Format gambar tujuan' }, [
    el('option', { value: 'image/jpeg' }, 'JPG'),
    el('option', { value: 'image/png' }, 'PNG'),
  ]);
  const scaleSelect = el('select', { 'aria-label': 'Kualitas render' }, [
    el('option', { value: '1' }, 'Standar (cepat)'),
    el('option', { value: '2', selected: true }, 'Tinggi (disarankan)'),
    el('option', { value: '3' }, 'Sangat tinggi (lambat)'),
  ]);

  let dropzone = null;
  const dropzoneWrap = el('div');

  function buildDropzone() {
    clear(dropzoneWrap);
    dropzone = createDropzone({
      accept: mode === 'to-pdf' ? 'image/jpeg,image/png,image/webp' : 'application/pdf',
      multiple: true,
      title: mode === 'to-pdf' ? 'Tarik & lepas gambar di sini' : 'Tarik & lepas PDF di sini',
      hint: mode === 'to-pdf' ? 'Setiap gambar jadi satu halaman, urutan bisa diatur' : 'Setiap halaman PDF jadi satu file gambar',
      buttonLabel: mode === 'to-pdf' ? 'Pilih Gambar' : 'Pilih File PDF',
      maxHint: 'Maksimal 80 MB per file',
      onFiles: handleFiles,
    });
    dropzoneWrap.appendChild(dropzone);
  }

  function setMode(next) {
    if (mode === next) return;
    mode = next;
    queue = [];
    clear(resultsEl);
    clear(errorsEl);
    modeTabs.querySelectorAll('button').forEach((b, i) => b.classList.toggle('is-active', (i === 0) === (next === 'to-pdf')));
    optionsCard.style.display = mode === 'to-image' ? 'block' : 'none';
    processBtn.textContent = mode === 'to-pdf' ? 'Buat PDF' : 'Ubah ke Gambar';
    buildDropzone();
    renderQueue();
  }

  function handleFiles(files) {
    const { valid, errors } = validateFiles(files, { accept: mode === 'to-pdf' ? 'image' : 'pdf', maxSizeMB: 80 });
    clear(errorsEl);
    errors.forEach((msg) => errorsEl.appendChild(alertBox(msg)));
    for (const file of valid) queue.push({ file, id: `${file.name}-${file.size}-${Math.random()}` });
    renderQueue();
  }

  function renderQueue() {
    clear(listEl);
    if (!queue.length) {
      listEl.appendChild(emptyState(mode === 'to-pdf' ? 'Belum ada gambar dipilih.' : 'Belum ada PDF dipilih.'));
    }
    queue.forEach((item, idx) => {
      const row = fileRow(item.file, {
        thumbUrl: mode === 'to-pdf' ? urls.create(item.file) : undefined,
        onRemove: () => { queue = queue.filter((q) => q !== item); renderQueue(); },
      });
      if (mode === 'to-pdf' && queue.length > 1) {
        const moveWrap = el('div', { style: 'display:flex; flex-direction:column; gap:2px; margin-right:4px;' }, [
          el('button', { class: 'btn-sm', style: 'border:none;background:none;cursor:pointer;color:var(--ink-faint);', disabled: idx === 0, onClick: () => moveItem(idx, -1) }, '▲'),
          el('button', { class: 'btn-sm', style: 'border:none;background:none;cursor:pointer;color:var(--ink-faint);', disabled: idx === queue.length - 1, onClick: () => moveItem(idx, 1) }, '▼'),
        ]);
        row.prepend(moveWrap);
      }
      listEl.appendChild(row);
    });
    processBtn.disabled = queue.length === 0 || processing;
  }

  function moveItem(idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= queue.length) return;
    [queue[idx], queue[j]] = [queue[j], queue[idx]];
    renderQueue();
  }

  async function startProcessing() {
    if (!queue.length) return;
    processing = true;
    processBtn.disabled = true;
    processBtn.textContent = 'Memproses…';
    window.__setPrivacyActive?.(true);
    clear(resultsEl);

    if (mode === 'to-pdf') await convertImagesToPdf();
    else await convertPdfToImages();

    processing = false;
    processBtn.textContent = mode === 'to-pdf' ? 'Buat PDF' : 'Ubah ke Gambar';
    processBtn.disabled = queue.length === 0;
    window.__setPrivacyActive?.(false);
    showToast('Pemrosesan selesai.');
  }

  async function convertImagesToPdf() {
    const card = el('div', { class: 'card result-card' });
    resultsEl.appendChild(card);
    const bar = progressBar({ label: 'Menyusun PDF…' });
    card.appendChild(bar.node);
    try {
      const { PDFDocument } = await getPdfLib();
      const outDoc = await PDFDocument.create();
      for (let i = 0; i < queue.length; i += 1) {
        const { file } = queue[i];
        bar.update((i + 1) / queue.length, `Menambahkan "${file.name}" (${i + 1}/${queue.length})…`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const embedded = file.type === 'image/png' || /\.png$/i.test(file.name)
          ? await outDoc.embedPng(bytes)
          : await outDoc.embedJpg(await reencodeAsJpegIfNeeded(file));
        const { width, height } = embedded;
        // Skala ke ukuran halaman wajar (maks ~A4 dalam poin: 595x842) sambil jaga rasio.
        const maxW = 595, maxH = 842;
        const ratio = Math.min(maxW / width, maxH / height, 1);
        const pageW = width * ratio, pageH = height * ratio;
        const page = outDoc.addPage([pageW, pageH]);
        page.drawImage(embedded, { x: 0, y: 0, width: pageW, height: pageH });
        await yieldFrame();
      }
      const outBytes = await outDoc.save();
      bar.done(`Selesai — ${queue.length} halaman`);
      const blob = new Blob([outBytes], { type: 'application/pdf' });
      const totalBefore = queue.reduce((sum, q) => sum + q.file.size, 0);
      clear(card);
      card.className = '';
      card.append(
        resultPanel({
          title: 'PDF Berhasil Dibuat!',
          subtitle: `${queue.length} gambar digabung jadi satu PDF ✨`,
          beforeBytes: totalBefore,
          afterBytes: outBytes.byteLength,
          filenameBase: 'gabungan-gambar',
          filenameExt: '.pdf',
          onDownload: (filename) => downloadBlob(blob, filename),
        })
      );
    } catch (err) {
      clear(card);
      card.appendChild(alertBox(err?.message || 'Gagal membuat PDF dari gambar.', { title: 'Gagal membuat PDF' }));
    }
  }

  async function convertPdfToImages() {
    const outMime = outFormatSelect.value;
    const scale = Number(scaleSelect.value);
    for (const item of queue) {
      const card = el('div', { class: 'card result-card' });
      resultsEl.appendChild(card);
      const bar = progressBar({ label: `Membuka "${item.file.name}"…` });
      card.appendChild(bar.node);
      try {
        const buf = await item.file.arrayBuffer();
        const pdfDoc = await openPdfForRender(buf);
        const numPages = pdfDoc.numPages;
        const pageResults = [];
        for (let p = 1; p <= numPages; p += 1) {
          bar.update(p / numPages, `Merender halaman ${p}/${numPages}…`);
          const canvas = await renderPageToCanvas(pdfDoc, p, scale);
          const blob = await canvasToBlob(canvas, outMime, 0.92);
          pageResults.push({ blob, page: p, w: canvas.width, h: canvas.height });
          await yieldFrame();
        }
        bar.done(`Selesai — ${numPages} halaman gambar siap diunduh`);

        const ext = outMime === 'image/png' ? 'png' : 'jpg';
        const baseName = item.file.name.replace(/\.pdf$/i, '');

        clear(card);
        const grid = el('div', { class: 'thumb-grid' });
        pageResults.forEach((pr) => {
          const url = urls.create(pr.blob);
          grid.appendChild(
            el('div', { class: 'thumb-card' }, [
              el('img', { class: 'thumb-card__img', src: url, alt: `Halaman ${pr.page}` }),
              el('div', { class: 'thumb-card__label' }, `Hal. ${pr.page} · ${formatBytes(pr.blob.size)}`),
            ])
          );
        });

        const downloadAllBtn = el('button', { class: 'btn btn-secondary btn-block', type: 'button', style: 'margin-top:10px;' }, `Unduh Semua (${numPages} file)`);
        downloadAllBtn.addEventListener('click', async () => {
          if (numPages === 1) {
            downloadBlob(pageResults[0].blob, `${baseName}.${ext}`);
            return;
          }
          downloadAllBtn.disabled = true;
          downloadAllBtn.textContent = 'Menyiapkan ZIP…';
          const { default: JSZip } = await import('jszip');
          const zip = new JSZip();
          pageResults.forEach((pr) => zip.file(`${baseName}-hal${String(pr.page).padStart(2, '0')}.${ext}`, pr.blob));
          const zipBlob = await zip.generateAsync({ type: 'blob' });
          downloadBlob(zipBlob, `${baseName}.zip`);
          downloadAllBtn.disabled = false;
          downloadAllBtn.textContent = `Unduh Semua (${numPages} file)`;
        });

        card.append(
          el('div', { style: 'font-weight:700; margin-bottom:6px; font-size:13.5px;' }, `${item.file.name} · ${numPages} halaman`),
          grid,
          downloadAllBtn
        );
      } catch (err) {
        clear(card);
        const msg = err?.message === 'PDF_PASSWORD' || err?.message === 'PDF_INVALID'
          ? friendlyPdfOpenError(err, item.file.name)
          : describePdfError(err, item.file.name);
        card.appendChild(alertBox(msg, { title: `Gagal memproses "${item.file.name}"` }));
      }
    }
  }

  async function reencodeAsJpegIfNeeded(file) {
    // WEBP tidak didukung embedJpg/embedPng pdf-lib secara langsung -> gambar ulang ke JPEG via canvas.
    if (file.type === 'image/jpeg' || /\.(jpe?g)$/i.test(file.name)) {
      return new Uint8Array(await file.arrayBuffer());
    }
    const { img, url } = await loadImageElement(file);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
    return new Uint8Array(await blob.arrayBuffer());
  }

  const processBtn = el('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: true, onClick: startProcessing }, 'Buat PDF');

  const optionsCard = el('div', { class: 'card', style: 'display:none;' }, [
    el('div', { class: 'field' }, [el('label', {}, 'Format gambar hasil'), outFormatSelect]),
    el('div', { class: 'field' }, [el('label', {}, 'Kualitas render'), scaleSelect, el('div', { class: 'field-hint' }, 'Kualitas lebih tinggi = gambar lebih tajam tapi ukuran file lebih besar & proses lebih lama.')]),
  ]);

  buildDropzone();
  container.append(
    modeTabs,
    el('div', { class: 'tool-grid tool-grid--split', style: 'margin-top:16px;' }, [
      el('div', {}, [dropzoneWrap, errorsEl, listEl]),
      el('div', {}, [optionsCard, processBtn]),
    ]),
    resultsEl
  );
  renderQueue();

  return function unmount() { urls.revokeAll(); };
}
