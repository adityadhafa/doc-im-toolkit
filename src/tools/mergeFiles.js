import { el, clear } from '../utils/dom.js';
import { createDropzone } from '../utils/dropzone.js';
import { validateFiles, describePdfError } from '../utils/validate.js';
import { fileRow, progressBar, alertBox, downloadButton, emptyState } from '../utils/ui.js';
import { formatBytes } from '../utils/format.js';
import { downloadBlob, createObjectUrlPool } from '../utils/download.js';
import { loadImageElement } from '../utils/imageFile.js';
import { getPdfLib } from '../utils/pdfEngine.js';
import { showToast } from '../utils/toast.js';

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

export function mount(container) {
  const urls = createObjectUrlPool();
  let queue = [];
  let processing = false;

  const listEl = el('ul', { class: 'file-list' });
  const errorsEl = el('div');
  const resultsEl = el('div', { style: 'display:flex; flex-direction:column; gap:16px; margin-top:18px;' });

  const processBtn = el('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: true, onClick: startProcessing }, 'Gabungkan Jadi PDF');

  const dropzone = createDropzone({
    accept: 'image/jpeg,image/png,image/webp,application/pdf',
    multiple: true,
    title: 'Seret & lepas gambar dan/atau PDF di sini',
    hint: 'Boleh campur — gambar dan PDF akan digabung berurutan',
    onFiles: handleFiles,
  });

  function handleFiles(files) {
    const { valid, errors } = validateFiles(files, { accept: 'image-or-pdf', maxSizeMB: 80 });
    clear(errorsEl);
    errors.forEach((msg) => errorsEl.appendChild(alertBox(msg)));
    for (const file of valid) queue.push({ file, isPdf: file.type === 'application/pdf' || /\.pdf$/i.test(file.name) });
    renderQueue();
  }

  function renderQueue() {
    clear(listEl);
    if (!queue.length) {
      listEl.appendChild(emptyState('Belum ada file. Tambahkan minimal 2 file untuk digabung.'));
    }
    queue.forEach((item, idx) => {
      const row = fileRow(item.file, {
        thumbUrl: item.isPdf ? undefined : urls.create(item.file),
        onRemove: () => { queue = queue.filter((q) => q !== item); renderQueue(); },
      });
      const badge = el('span', { class: 'mono', style: 'font-size:10.5px; color:var(--ink-faint); border:1px solid var(--border); border-radius:4px; padding:1px 5px; margin-right:6px;' }, item.isPdf ? 'PDF' : 'GAMBAR');
      row.querySelector('.file-row__meta')?.prepend(badge);
      if (queue.length > 1) {
        const moveWrap = el('div', { style: 'display:flex; flex-direction:column; gap:2px; margin-right:4px;' }, [
          el('button', { style: 'border:none;background:none;cursor:pointer;color:var(--ink-faint);', disabled: idx === 0, onClick: () => moveItem(idx, -1), 'aria-label': 'Naikkan urutan' }, '▲'),
          el('button', { style: 'border:none;background:none;cursor:pointer;color:var(--ink-faint);', disabled: idx === queue.length - 1, onClick: () => moveItem(idx, 1), 'aria-label': 'Turunkan urutan' }, '▼'),
        ]);
        row.prepend(moveWrap);
      }
      listEl.appendChild(row);
    });
    processBtn.disabled = queue.length < 1 || processing;
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
    processBtn.textContent = 'Menggabungkan…';
    window.__setPrivacyActive?.(true);

    const card = el('div', { class: 'card result-card' });
    clear(resultsEl);
    resultsEl.appendChild(card);
    const bar = progressBar({ label: 'Menggabungkan file…' });
    card.appendChild(bar.node);

    try {
      const { PDFDocument } = await getPdfLib();
      const outDoc = await PDFDocument.create();

      for (let i = 0; i < queue.length; i += 1) {
        const { file, isPdf } = queue[i];
        bar.update((i + 0.3) / queue.length, `Memproses "${file.name}" (${i + 1}/${queue.length})…`);

        if (isPdf) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          let srcDoc;
          try {
            srcDoc = await PDFDocument.load(bytes);
          } catch (err) {
            throw Object.assign(new Error(describePdfError(err, file.name)), { friendly: true });
          }
          const pageIndices = srcDoc.getPageIndices();
          const copiedPages = await outDoc.copyPages(srcDoc, pageIndices);
          copiedPages.forEach((p) => outDoc.addPage(p));
        } else {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const isPng = file.type === 'image/png' || /\.png$/i.test(file.name);
          const embedded = isPng ? await outDoc.embedPng(bytes) : await outDoc.embedJpg(await toJpegBytes(file));
          const { width, height } = embedded;
          const maxW = 595, maxH = 842;
          const ratio = Math.min(maxW / width, maxH / height, 1);
          const pageW = width * ratio, pageH = height * ratio;
          const page = outDoc.addPage([pageW, pageH]);
          page.drawImage(embedded, { x: 0, y: 0, width: pageW, height: pageH });
        }
        bar.update((i + 1) / queue.length);
        await yieldFrame();
      }

      const outBytes = await outDoc.save();
      bar.done(`Selesai — ${outDoc.getPageCount()} halaman total`);

      const blob = new Blob([outBytes], { type: 'application/pdf' });
      const filename = 'berkas-gabungan.pdf';
      clear(card);
      card.append(
        el('div', { style: 'font-weight:700; margin-bottom:8px; font-size:13.5px;' }, `PDF gabungan siap · ${outDoc.getPageCount()} halaman · ${formatBytes(outBytes.byteLength)}`),
        el('div', { style: 'margin-top:4px;' }, [downloadButton(`Unduh ${filename}`, () => downloadBlob(blob, filename))])
      );
    } catch (err) {
      clear(card);
      card.appendChild(alertBox(err?.friendly ? err.message : (err?.message || 'Gagal menggabungkan file.'), { title: 'Gagal menggabungkan' }));
    }

    processing = false;
    processBtn.textContent = 'Gabungkan Jadi PDF';
    processBtn.disabled = queue.length === 0;
    window.__setPrivacyActive?.(false);
    showToast('Penggabungan selesai.');
  }

  async function toJpegBytes(file) {
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

  container.append(
    el('div', { class: 'tool-grid tool-grid--split' }, [el('div', {}, [dropzone, errorsEl, listEl]), el('div', {}, [processBtn])]),
    resultsEl
  );
  renderQueue();

  return function unmount() { urls.revokeAll(); };
}
