import { el, clear, icon } from '../utils/dom.js';
import { createDropzone } from '../utils/dropzone.js';
import { validateFiles, describePdfError } from '../utils/validate.js';
import { progressBar, alertBox } from '../utils/ui.js';
import { formatBytes } from '../utils/format.js';
import { downloadBlob, createObjectUrlPool } from '../utils/download.js';
import { getPdfLib } from '../utils/pdfEngine.js';
import { parseRangesFromText, sanitizeFilenamePart } from '../utils/parseRanges.js';
import { showToast } from '../utils/toast.js';

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

const PDF_ICON =
  '<path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>';
const DOWNLOAD_ICON =
  '<path d="M12 4v11m0 0-4-4m4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
const CHECK_ICON = '<path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
const TRASH_ICON =
  '<path d="M4 6h16M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';

export function mount(container) {
  const urls = createObjectUrlPool();

  let file = null;
  let totalPages = 0;
  let ranges = []; // [{from, to}]
  let processing = false;

  const errorsEl = el('div');
  const resultsEl = el('div', { style: 'display:flex; flex-direction:column; gap:16px; margin-top:18px;' });

  const dropzone = createDropzone({
    accept: 'application/pdf',
    multiple: false,
    title: 'Tarik & lepas PDF di sini',
    hint: 'atau — file yang akan dipisah jadi beberapa bagian',
    buttonLabel: 'Pilih File PDF',
    maxHint: 'Maksimal 80 MB',
    onFiles: handleFiles,
  });
  const dropzoneWrap = el('div', {}, [dropzone]);

  const fileInfoWrap = el('div', { style: 'display:none;' });
  const configWrap = el('div', { style: 'display:none;' });

  const partsInput = el('input', { type: 'number', min: '1', value: '2', 'aria-label': 'Jumlah file hasil split' });
  const rangesListEl = el('div', { style: 'display:flex; flex-direction:column; gap:10px; margin-top:10px;' });
  const rangeErrorsEl = el('div');

  const processBtn = el(
    'button',
    { class: 'btn btn-primary btn-block btn-lg', type: 'button', disabled: true, onClick: startProcessing },
    'Pisah PDF Sekarang'
  );

  function handleFiles(files) {
    const { valid, errors } = validateFiles(files, { accept: 'pdf', maxSizeMB: 80 });
    clear(errorsEl);
    errors.forEach((msg) => errorsEl.appendChild(alertBox(msg)));
    if (!valid.length) return;
    if (files.length > 1) {
      showToast('Pisah PDF hanya memproses satu file sekaligus. File pertama yang dipakai.', 'error');
    }
    loadFile(valid[0]);
  }

  async function loadFile(f) {
    file = f;
    totalPages = 0;
    clear(resultsEl);
    fileInfoWrap.style.display = 'block';
    configWrap.style.display = 'none';
    clear(fileInfoWrap);
    fileInfoWrap.appendChild(
      el('div', { class: 'card', style: 'display:flex; align-items:center; gap:12px;' }, [
        el('div', { class: 'file-row__thumb file-row__thumb--doc', style: 'width:44px;height:44px;' }, icon(PDF_ICON, 20)),
        el('div', { class: 'file-row__meta' }, [
          el('div', { class: 'file-row__name' }, file.name),
          el('div', { class: 'file-row__size mono' }, `${formatBytes(file.size)} · Membaca jumlah halaman…`),
        ]),
        el('button', {
          class: 'file-row__remove',
          type: 'button',
          'aria-label': 'Ganti file',
          onClick: resetFile,
        }, icon(TRASH_ICON, 16)),
      ])
    );

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { PDFDocument } = await getPdfLib();
      const doc = await PDFDocument.load(bytes);
      totalPages = doc.getPageCount();

      const sizeLine = fileInfoWrap.querySelector('.file-row__size');
      if (sizeLine) sizeLine.textContent = `${formatBytes(file.size)} · ${totalPages} halaman`;

      partsInput.max = String(totalPages);
      const initialCount = Math.min(2, totalPages);
      partsInput.value = String(initialCount);
      ranges = evenSplit(totalPages, initialCount);
      renderRanges();
      configWrap.style.display = 'block';
      processBtn.disabled = false;
    } catch (err) {
      clear(errorsEl);
      errorsEl.appendChild(alertBox(describePdfError(err, file.name), { title: `Gagal membuka "${file.name}"` }));
      resetFile();
    }
  }

  function resetFile() {
    file = null;
    totalPages = 0;
    ranges = [];
    fileInfoWrap.style.display = 'none';
    configWrap.style.display = 'none';
    processBtn.disabled = true;
    clear(resultsEl);
  }

  function evenSplit(pages, count) {
    count = Math.max(1, Math.min(count, pages));
    const base = Math.floor(pages / count);
    const extra = pages % count;
    const out = [];
    let start = 1;
    for (let i = 0; i < count; i += 1) {
      const size = base + (i < extra ? 1 : 0) || 1;
      const end = Math.min(pages, start + size - 1);
      out.push({ from: start, to: Math.max(start, end), name: `Bagian ${i + 1}` });
      start = end + 1;
    }
    return out;
  }

  function setPartsCount(n) {
    n = Math.max(1, Math.min(n, totalPages || n));
    if (n === ranges.length) return;
    if (n > ranges.length) {
      let start = ranges.length ? ranges[ranges.length - 1].to + 1 : 1;
      const addCount = n - ranges.length;
      for (let i = 0; i < addCount; i += 1) {
        const remainingParts = addCount - i;
        const remainingPages = Math.max(1, totalPages - start + 1);
        const size = Math.max(1, Math.round(remainingPages / remainingParts));
        const end = Math.min(totalPages || start + size - 1, start + size - 1);
        ranges.push({ from: start, to: Math.max(start, end), name: `Bagian ${ranges.length + 1}` });
        start = end + 1;
      }
    } else {
      ranges = ranges.slice(0, n);
    }
    renderRanges();
  }

  function renderRanges() {
    clear(rangesListEl);
    ranges.forEach((r, idx) => {
      const nameInput = el('input', {
        type: 'text', value: r.name || `Bagian ${idx + 1}`,
        placeholder: `Nama bagian ${idx + 1}`,
        'aria-label': `Bagian ${idx + 1}: nama bab`,
        style: 'max-width:220px;',
        onInput: (e) => { ranges[idx].name = e.target.value; },
      });
      const fromInput = el('input', {
        type: 'number', min: '1', max: String(totalPages), value: String(r.from),
        'aria-label': `Bagian ${idx + 1}: halaman awal`,
        onInput: (e) => { ranges[idx].from = Number(e.target.value); updateRangeMeta(idx); },
      });
      const toInput = el('input', {
        type: 'number', min: '1', max: String(totalPages), value: String(r.to),
        'aria-label': `Bagian ${idx + 1}: halaman akhir`,
        onInput: (e) => { ranges[idx].to = Number(e.target.value); updateRangeMeta(idx); },
      });
      const metaEl = el('span', { class: 'mono', style: 'font-size:11.5px; color:var(--ink-faint); white-space:nowrap;' }, pageCountLabel(r));

      const row = el('div', { class: 'file-row', style: 'flex-wrap:wrap; align-items:center;' }, [
        nameInput,
        el('div', { class: 'input-row', style: 'flex:1; min-width:180px;' }, [
          fromInput,
          el('span', { class: 'mono', style: 'color:var(--ink-faint);' }, '—'),
          toInput,
        ]),
        metaEl,
      ]);
      row.dataset.rowIndex = String(idx);
      row._metaEl = metaEl;
      rangesListEl.appendChild(row);
    });
  }

  function updateRangeMeta(idx) {
    const row = rangesListEl.children[idx];
    if (row?._metaEl) row._metaEl.textContent = pageCountLabel(ranges[idx]);
  }

  function pageCountLabel(r) {
    const n = r.to - r.from + 1;
    return n > 0 ? `${n} halaman` : 'rentang tidak valid';
  }

  function validateRanges() {
    const errs = [];
    ranges.forEach((r, idx) => {
      if (!Number.isFinite(r.from) || !Number.isFinite(r.to)) {
        errs.push(`Bagian ${idx + 1}: halaman awal/akhir belum diisi.`);
      } else if (r.from < 1 || r.to > totalPages) {
        errs.push(`Bagian ${idx + 1}: halaman harus di antara 1–${totalPages}.`);
      } else if (r.from > r.to) {
        errs.push(`Bagian ${idx + 1}: halaman awal (${r.from}) tidak boleh lebih besar dari halaman akhir (${r.to}).`);
      }
    });
    return errs;
  }

  async function startProcessing() {
    if (!file || !ranges.length) return;
    const errs = validateRanges();
    clear(rangeErrorsEl);
    if (errs.length) {
      errs.forEach((msg) => rangeErrorsEl.appendChild(alertBox(msg, { title: 'Rentang halaman belum valid' })));
      showToast('Perbaiki dulu rentang halaman yang belum valid.', 'error');
      return;
    }

    processing = true;
    processBtn.disabled = true;
    processBtn.textContent = 'Memproses…';
    window.__setPrivacyActive?.(true);
    clear(resultsEl);

    const card = el('div', { class: 'card result-card' });
    resultsEl.appendChild(card);
    const bar = progressBar({ label: 'Membuka PDF…' });
    card.appendChild(bar.node);

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { PDFDocument } = await getPdfLib();
      const srcDoc = await PDFDocument.load(bytes);

      const baseName = file.name.replace(/\.pdf$/i, '');
      const outputs = [];
      for (let i = 0; i < ranges.length; i += 1) {
        const r = ranges[i];
        bar.update((i + 1) / ranges.length, `Membuat bagian ${i + 1}/${ranges.length} (halaman ${r.from}–${r.to})…`);
        const outDoc = await PDFDocument.create();
        const indices = [];
        for (let p = r.from; p <= r.to; p += 1) indices.push(p - 1);
        const copied = await outDoc.copyPages(srcDoc, indices);
        copied.forEach((pg) => outDoc.addPage(pg));
        const outBytes = await outDoc.save();
        const safeName = sanitizeFilenamePart(r.name, `bagian${i + 1}`);
        outputs.push({ bytes: outBytes, from: r.from, to: r.to, pages: indices.length, filename: `${baseName}-${safeName}-hal${r.from}-${r.to}.pdf` });
        await yieldFrame();
      }
      bar.done(`Selesai — ${outputs.length} file dibuat`);

      clear(card);
      card.className = '';
      card.append(buildResultPanel(outputs, baseName));
    } catch (err) {
      clear(card);
      card.appendChild(alertBox(describePdfError(err, file.name), { title: `Gagal memisah "${file.name}"` }));
    }

    processing = false;
    processBtn.textContent = 'Pisah PDF Sekarang';
    processBtn.disabled = false;
    window.__setPrivacyActive?.(false);
    showToast('Pemisahan selesai.');
  }

  function buildResultPanel(outputs, baseName) {
    const rowsWrap = el('div', { class: 'file-list', style: 'margin-top:4px;' });
    outputs.forEach((out) => {
      const blob = new Blob([out.bytes], { type: 'application/pdf' });
      rowsWrap.appendChild(
        el('div', { class: 'file-row' }, [
          el('div', { class: 'file-row__thumb file-row__thumb--doc' }, icon(PDF_ICON, 18)),
          el('div', { class: 'file-row__meta' }, [
            el('div', { class: 'file-row__name' }, out.filename),
            el('div', { class: 'file-row__size mono' }, `${out.pages} halaman · ${formatBytes(out.bytes.byteLength)}`),
          ]),
          el('button', {
            class: 'btn btn-secondary btn-sm',
            type: 'button',
            onClick: () => downloadBlob(blob, out.filename),
          }, [icon(DOWNLOAD_ICON, 14), 'Unduh']),
        ])
      );
    });

    const downloadAllBtn = el('button', { class: 'btn btn-primary btn-block btn-lg', type: 'button' }, [
      icon(DOWNLOAD_ICON, 18), ` Unduh Semua (${outputs.length} file, ZIP)`,
    ]);
    downloadAllBtn.addEventListener('click', async () => {
      downloadAllBtn.disabled = true;
      const original = downloadAllBtn.textContent;
      downloadAllBtn.textContent = 'Menyiapkan ZIP…';
      try {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        outputs.forEach((out) => zip.file(out.filename, out.bytes));
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(zipBlob, `${baseName}-split.zip`);
      } finally {
        downloadAllBtn.disabled = false;
        downloadAllBtn.textContent = original;
      }
    });

    return el('div', { class: 'result-panel' }, [
      el('div', { class: 'result-panel__head' }, [
        el('div', { class: 'result-panel__check' }, icon(CHECK_ICON, 22)),
        el('h3', { class: 'result-panel__title' }, 'Pemisahan Selesai!'),
        el('p', { class: 'result-panel__subtitle' }, `PDF berhasil dipecah jadi ${outputs.length} file ✨`),
      ]),
      rowsWrap,
      outputs.length > 1 ? downloadAllBtn : el('div', {}, [
        (() => {
          const blob = new Blob([outputs[0].bytes], { type: 'application/pdf' });
          const btn = el('button', { class: 'btn btn-primary btn-block btn-lg', type: 'button' }, [icon(DOWNLOAD_ICON, 18), 'Unduh File']);
          btn.addEventListener('click', () => downloadBlob(blob, outputs[0].filename));
          return btn;
        })(),
      ]),
    ]);
  }

  const pasteText = el('textarea', {
    rows: 6,
    placeholder:
      'Bab 1: Pendahuluan — 1-15\nBab 2, Metodologi, 16, 40\n| Bab 3 - Hasil | 41 | 70 |',
    style: 'width:100%; resize:vertical; border:1.5px solid var(--border-strong); background:var(--surface-2); color:var(--ink); border-radius:8px; padding:11px 12px; font-size:13px; font-family:var(--font-mono); line-height:1.6;',
    'aria-label': 'Tempel daftar bab dan rentang halaman',
  });
  const applyPasteBtn = el('button', { class: 'btn btn-secondary', type: 'button', style: 'margin-top:10px;' }, 'Terapkan ke Rentang Halaman');
  const pasteErrorsEl = el('div', { style: 'margin-top:10px;' });

  applyPasteBtn.addEventListener('click', () => {
    if (!totalPages) {
      showToast('Upload PDF dulu sebelum menempel daftar bab.', 'error');
      return;
    }
    clear(pasteErrorsEl);
    const { ranges: parsed, skipped } = parseRangesFromText(pasteText.value);
    if (!parsed.length) {
      pasteErrorsEl.appendChild(
        alertBox(
          'Tidak ada baris yang bisa dikenali sebagai rentang halaman. Pastikan tiap baris memuat nama bab dan dua angka halaman, mis. "Bab 1: Pendahuluan — 1-15".',
          { title: 'Teks belum bisa dibaca' }
        )
      );
      return;
    }
    ranges = parsed;
    partsInput.value = String(ranges.length);
    renderRanges();
    showToast(
      skipped > 0
        ? `${parsed.length} bagian diterapkan, ${skipped} baris dilewati karena tidak dikenali.`
        : `${parsed.length} bagian berhasil diterapkan dari teks.`
    );
  });

  const pasteCard = el('div', { class: 'card', style: 'margin-bottom:16px;' }, [
    el('div', { class: 'field' }, [
      el('label', {}, 'Atau Tempel Daftar Bab (Opsional)'),
      pasteText,
      el('div', { class: 'field-hint' },
        'Satu baris per bab. Boleh format tabel markdown, dipisah koma/tab, atau kalimat bebas — yang penting ada dua angka halaman per baris. Hasil parsing akan mengisi rentang di bawah, dan tetap bisa diedit sebelum diproses.'
      ),
      applyPasteBtn,
      pasteErrorsEl,
    ]),
  ]);

  const configCard = el('div', { class: 'card' }, [
    el('div', { class: 'field' }, [
      el('label', {}, 'Jumlah File Hasil Split'),
      partsInput,
      el('div', { class: 'field-hint' }, 'Setiap bagian akan menjadi satu file PDF terpisah.'),
    ]),
    el('div', { class: 'field' }, [
      el('div', { style: 'display:flex; align-items:center; justify-content:space-between;' }, [
        el('label', { style: 'margin-bottom:0;' }, 'Rentang Halaman Tiap Bagian'),
        el('button', {
          class: 'btn btn-secondary btn-sm',
          type: 'button',
          onClick: () => { ranges = evenSplit(totalPages, ranges.length || Number(partsInput.value)); renderRanges(); },
        }, 'Bagi Rata Otomatis'),
      ]),
      rangesListEl,
      rangeErrorsEl,
    ]),
    processBtn,
  ]);
  configWrap.appendChild(pasteCard);
  configWrap.appendChild(configCard);

  partsInput.addEventListener('change', () => {
    const n = Math.round(Number(partsInput.value));
    if (!Number.isFinite(n) || n < 1) {
      showToast('Jumlah file hasil split minimal 1.', 'error');
      partsInput.value = String(ranges.length || 1);
      return;
    }
    if (totalPages && n > totalPages) {
      showToast(`Jumlah file tidak bisa melebihi jumlah halaman (${totalPages}).`, 'error');
      partsInput.value = String(totalPages);
      setPartsCount(totalPages);
      return;
    }
    setPartsCount(n);
  });

  container.append(
    el('div', { class: 'tool-grid' }, [
      el('div', {}, [dropzoneWrap, errorsEl, fileInfoWrap]),
      configWrap,
    ]),
    resultsEl
  );

  return function unmount() {
    urls.revokeAll();
  };
}
