import { el, clear } from '../utils/dom.js';
import { createDropzone } from '../utils/dropzone.js';
import { validateFiles } from '../utils/validate.js';
import { fileRow, progressBar, alertBox, compareCard, downloadButton, metaLine, summaryRow } from '../utils/ui.js';
import { downloadBlob, createObjectUrlPool } from '../utils/download.js';
import { runImageTask } from '../utils/workerClient.js';
import { hasAlphaChannel } from '../utils/imageFile.js';
import { showToast } from '../utils/toast.js';

const FORMATS = [
  { value: 'image/jpeg', label: 'JPG / JPEG', ext: 'jpg' },
  { value: 'image/png', label: 'PNG', ext: 'png' },
  { value: 'image/webp', label: 'WEBP', ext: 'webp' },
];

export function mount(container) {
  const urls = createObjectUrlPool();
  let queue = [];
  let processing = false;

  const listEl = el('ul', { class: 'file-list' });
  const errorsEl = el('div');
  const resultsEl = el('div', { style: 'display:flex; flex-direction:column; gap:16px; margin-top:18px;' });

  const formatSelect = el(
    'select',
    { 'aria-label': 'Format tujuan' },
    FORMATS.map((f) => el('option', { value: f.value }, f.label))
  );
  formatSelect.value = 'image/jpeg';

  const qualityInput = el('input', { type: 'range', min: '40', max: '100', value: '90' });
  const qualityLabel = el('span', { class: 'slider-value' }, '90%');
  qualityInput.addEventListener('input', () => (qualityLabel.textContent = `${qualityInput.value}%`));

  const qualityField = el('div', { class: 'field' }, [
    el('label', {}, 'Kualitas (untuk JPG/WEBP)'),
    el('div', { style: 'display:flex; align-items:center; gap:10px;' }, [qualityInput, qualityLabel]),
  ]);
  function syncQualityVisibility() {
    qualityField.style.display = formatSelect.value === 'image/png' ? 'none' : 'block';
  }
  formatSelect.addEventListener('change', syncQualityVisibility);
  syncQualityVisibility();

  const processBtn = el('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: true, onClick: startProcessing }, 'Konversi Sekarang');

  const dropzone = createDropzone({
    accept: 'image/jpeg,image/png,image/webp',
    multiple: true,
    title: 'Seret & lepas gambar di sini',
    hint: 'atau klik untuk memilih — JPG, PNG, atau WEBP',
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
          thumbUrl: urls.create(item.file),
          onRemove: () => {
            queue = queue.filter((q) => q !== item);
            renderQueue();
          },
        })
      );
    }
    processBtn.disabled = queue.length === 0 || processing;
  }

  async function startProcessing() {
    if (!queue.length) return;
    const targetMime = formatSelect.value;
    const quality = Number(qualityInput.value) / 100;

    processing = true;
    processBtn.disabled = true;
    processBtn.textContent = 'Memproses…';
    window.__setPrivacyActive?.(true);
    clear(resultsEl);

    for (const item of queue) {
      const card = el('div', { class: 'card result-card' });
      resultsEl.appendChild(card);
      const bar = progressBar({ label: `Mengonversi "${item.file.name}"…` });
      card.appendChild(bar.node);

      const needsWhiteBg = targetMime === 'image/jpeg' && hasAlphaChannel(item.file);

      try {
        const beforeUrl = urls.create(item.file);
        const result = await runImageTask(
          'convert-format',
          { file: item.file, mimeType: targetMime, quality, background: needsWhiteBg ? '#ffffff' : null },
          (fraction, note) => bar.update(fraction, note)
        );
        bar.done('Selesai');

        const blob = new Blob([result.buffer], { type: result.mimeType });
        const afterUrl = urls.create(blob);
        const ext = FORMATS.find((f) => f.value === targetMime).ext;
        const filename = `${item.file.name.replace(/\.[^.]+$/, '')}.${ext}`;

        clear(card);
        card.append(
          el('div', { style: 'font-weight:700; margin-bottom:10px; font-size:13.5px;' }, item.file.name),
          needsWhiteBg
            ? el('div', { class: 'alert alert--info', style: 'margin-bottom:12px;' }, 'Latar transparan pada PNG diisi warna putih karena format JPG tidak mendukung transparansi.')
            : null,
          summaryRow(item.file.size, result.size),
          compareCard({
            beforeUrl,
            afterUrl,
            beforeMeta: metaLine(item.file.size, result.sourceWidth, result.sourceHeight),
            afterMeta: metaLine(result.size, result.width, result.height),
          }),
          el('div', { style: 'margin-top:12px;' }, [downloadButton(`Unduh ${filename}`, () => downloadBlob(blob, filename))])
        );
      } catch (err) {
        clear(card);
        card.appendChild(alertBox(err?.message || 'Gagal mengonversi gambar ini.', { title: `Gagal memproses "${item.file.name}"` }));
      }
    }

    processing = false;
    processBtn.textContent = 'Konversi Sekarang';
    processBtn.disabled = queue.length === 0;
    window.__setPrivacyActive?.(false);
    showToast('Konversi selesai.');
  }

  const optionsCard = el('div', { class: 'card' }, [
    el('div', { class: 'field' }, [el('label', {}, 'Format tujuan'), formatSelect]),
    qualityField,
    processBtn,
  ]);

  container.append(
    el('div', { class: 'tool-grid tool-grid--split' }, [el('div', {}, [dropzone, errorsEl, listEl]), optionsCard]),
    resultsEl
  );
  renderQueue();

  return function unmount() {
    urls.revokeAll();
  };
}
