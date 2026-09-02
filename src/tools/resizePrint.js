import { el, clear } from '../utils/dom.js';
import { createDropzone } from '../utils/dropzone.js';
import { validateFiles } from '../utils/validate.js';
import { fileRow, progressBar, alertBox, resultPanel } from '../utils/ui.js';
import { downloadBlob, createObjectUrlPool } from '../utils/download.js';
import { runImageTask } from '../utils/workerClient.js';
import { isHeicFile, resolveDecodableFile } from '../utils/heic.js';
import { showToast } from '../utils/toast.js';

const PRESETS = [
  { id: '3x4', label: '3 × 4 cm', w: 3, h: 4 },
  { id: '4x6', label: '4 × 6 cm', w: 4, h: 6 },
  { id: '2x3', label: '2 × 3 cm', w: 2, h: 3 },
  { id: 'custom', label: 'Custom' },
];
const DPI_OPTIONS = [150, 200, 300, 350];

export function mount(container) {
  const urls = createObjectUrlPool();
  let queue = [];
  let processing = false;
  let activePreset = '3x4';

  const listEl = el('ul', { class: 'file-list' });
  const errorsEl = el('div');
  const resultsEl = el('div', { style: 'display:flex; flex-direction:column; gap:16px; margin-top:18px;' });

  const segmented = el('div', { class: 'segmented' });
  PRESETS.forEach((p) => {
    const btn = el('button', {
      type: 'button',
      class: p.id === activePreset ? 'is-active' : '',
      onClick: () => {
        activePreset = p.id;
        segmented.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        customWrap.style.display = p.id === 'custom' ? 'flex' : 'none';
      },
    }, p.label);
    segmented.appendChild(btn);
  });

  const customW = el('input', { type: 'number', min: '1', step: '0.1', value: '4', 'aria-label': 'Lebar custom (cm)' });
  const customH = el('input', { type: 'number', min: '1', step: '0.1', value: '6', 'aria-label': 'Tinggi custom (cm)' });
  const customWrap = el('div', { class: 'input-row', style: 'display:none; gap:8px; margin-top:8px;' }, [
    customW, el('span', { class: 'mono', style: 'color:var(--ink-faint); font-size:12px;' }, '×'), customH,
    el('span', { class: 'mono', style: 'color:var(--ink-faint); font-size:12px;' }, 'cm'),
  ]);

  const dpiSelect = el('select', { 'aria-label': 'DPI cetak' }, DPI_OPTIONS.map((d) =>
    el('option', { value: String(d), selected: d === 300 }, `${d} DPI${d === 300 ? ' (standar studio foto)' : ''}`)
  ));

  const processBtn = el('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: true, onClick: startProcessing }, 'Resize Sekarang');

  const dropzone = createDropzone({
    accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif',
    multiple: true,
    title: 'Tarik & lepas foto di sini',
    hint: 'atau — foto yang akan dicetak, termasuk HEIC (iPhone)',
    buttonLabel: 'Pilih Foto',
    maxHint: 'Maksimal 60 MB per file',
    onFiles: handleFiles,
  });

  function handleFiles(files) {
    const { valid, errors } = validateFiles(files, { accept: 'image', maxSizeMB: 60 });
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
          thumbUrl: isHeicFile(item.file) ? undefined : urls.create(item.file),
          onRemove: () => { queue = queue.filter((q) => q !== item); renderQueue(); },
        })
      );
    }
    processBtn.disabled = queue.length === 0 || processing;
  }

  function getTargetCm() {
    if (activePreset === 'custom') {
      const w = Number(customW.value);
      const h = Number(customH.value);
      if (!(w > 0) || !(h > 0)) return null;
      return { w, h };
    }
    const p = PRESETS.find((x) => x.id === activePreset);
    return { w: p.w, h: p.h };
  }

  async function startProcessing() {
    if (!queue.length) return;
    const cm = getTargetCm();
    if (!cm) {
      showToast('Masukkan ukuran custom yang valid (lebih dari 0).', 'error');
      return;
    }
    const dpi = Number(dpiSelect.value);
    const targetW = Math.round((cm.w / 2.54) * dpi);
    const targetH = Math.round((cm.h / 2.54) * dpi);

    processing = true;
    processBtn.disabled = true;
    processBtn.textContent = 'Memproses…';
    window.__setPrivacyActive?.(true);
    clear(resultsEl);

    for (const item of queue) {
      const card = el('div', { class: 'card result-card' });
      resultsEl.appendChild(card);
      const bar = progressBar({ label: `Menyiapkan cetak "${item.file.name}"…` });
      card.appendChild(bar.node);

      try {
        let workFile = item.file;
        const wasHeic = isHeicFile(item.file);
        if (wasHeic) {
          bar.update(0.05, 'Membaca file HEIC (format foto iPhone)…', 'Mendekode HEIC…');
          workFile = await resolveDecodableFile(item.file);
        }

        const result = await runImageTask(
          'resize-exact',
          { file: workFile, targetW, targetH, mimeType: 'image/jpeg', quality: 0.92, background: '#ffffff' },
          (fraction, note) => bar.update(0.1 + fraction * 0.9, note)
        );
        bar.done(`Selesai — ${targetW}×${targetH}px (${cm.w}×${cm.h} cm @ ${dpi} DPI)`);

        const blob = new Blob([result.buffer], { type: result.mimeType });
        const afterUrl = urls.create(blob);
        const baseName = item.file.name.replace(/\.[^.]+$/, '');

        clear(card);
        card.className = '';
        card.append(
          resultPanel({
            title: 'Resize Selesai!',
            subtitle: `Ukuran cetak ${cm.w}×${cm.h} cm siap ✨`,
            beforeBytes: item.file.size,
            afterBytes: result.size,
            previewUrl: afterUrl,
            previewMeta: `${targetW}×${targetH}px · ${dpi} DPI`,
            filenameBase: `${baseName}-${cm.w}x${cm.h}cm`,
            filenameExt: '.jpg',
            note: el('div', { class: 'alert alert--info' }, `Bagian tengah foto dipotong otomatis agar pas pada rasio ${cm.w}:${cm.h}. Pastikan wajah berada di tengah foto asli sebelum resize.`),
            onDownload: (filename) => downloadBlob(blob, filename),
          })
        );
      } catch (err) {
        clear(card);
        card.appendChild(alertBox(err?.message || 'Gagal resize foto ini.', { title: `Gagal memproses "${item.file.name}"` }));
      }
    }

    processing = false;
    processBtn.textContent = 'Resize Sekarang';
    processBtn.disabled = queue.length === 0;
    window.__setPrivacyActive?.(false);
    showToast('Resize selesai.');
  }

  const optionsCard = el('div', { class: 'card' }, [
    el('div', { class: 'field' }, [el('label', {}, 'Ukuran cetak'), segmented, customWrap]),
    el('div', { class: 'field' }, [el('label', {}, 'Resolusi cetak (DPI)'), dpiSelect, el('div', { class: 'field-hint' }, 'DPI lebih tinggi = hasil cetak lebih tajam, ukuran file lebih besar. 300 DPI cukup untuk kebanyakan studio foto/fotokopi.')]),
    processBtn,
  ]);

  container.append(
    el('div', { class: 'tool-grid tool-grid--split' }, [el('div', {}, [dropzone, errorsEl, listEl]), optionsCard]),
    resultsEl
  );
  renderQueue();

  return function unmount() { urls.revokeAll(); };
}
