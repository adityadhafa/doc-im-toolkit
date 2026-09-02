import { el, clear } from '../utils/dom.js';
import { createDropzone } from '../utils/dropzone.js';
import { validateFiles } from '../utils/validate.js';
import { fileRow, progressBar, alertBox, resultPanel } from '../utils/ui.js';
import { formatBytes } from '../utils/format.js';
import { downloadBlob, createObjectUrlPool } from '../utils/download.js';
import { runImageTask } from '../utils/workerClient.js';
import { hasAlphaChannel } from '../utils/imageFile.js';
import { isHeicFile, resolveDecodableFile } from '../utils/heic.js';
import { showToast } from '../utils/toast.js';

const FORMATS = [
  { id: 'jpg', mime: 'image/jpeg', ext: 'jpg', label: 'JPG' },
  { id: 'jpeg', mime: 'image/jpeg', ext: 'jpeg', label: 'JPEG' },
  { id: 'png', mime: 'image/png', ext: 'png', label: 'PNG' },
  { id: 'webp', mime: 'image/webp', ext: 'webp', label: 'WEBP' },
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
    FORMATS.map((f) => el('option', { value: f.id }, f.label))
  );
  formatSelect.value = 'jpg';

  const qualityInput = el('input', { type: 'range', min: '40', max: '100', value: '90' });
  const qualityLabel = el('span', { class: 'slider-value' }, '90%');
  qualityInput.addEventListener('input', () => (qualityLabel.textContent = `${qualityInput.value}%`));

  const qualityField = el('div', { class: 'field' }, [
    el('label', {}, 'Kualitas (untuk JPG/JPEG/WEBP)'),
    el('div', { style: 'display:flex; align-items:center; gap:10px;' }, [qualityInput, qualityLabel]),
  ]);
  function currentFormat() {
    return FORMATS.find((f) => f.id === formatSelect.value) || FORMATS[0];
  }
  function syncQualityVisibility() {
    qualityField.style.display = currentFormat().mime === 'image/png' ? 'none' : 'block';
  }
  formatSelect.addEventListener('change', syncQualityVisibility);
  syncQualityVisibility();

  const processBtn = el('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: true, onClick: startProcessing }, 'Konversi Sekarang');

  const dropzone = createDropzone({
    accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif',
    multiple: true,
    title: 'Tarik & lepas gambar di sini',
    hint: 'atau — JPG, PNG, WEBP, atau HEIC (foto iPhone)',
    buttonLabel: 'Pilih Gambar',
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
    const fmt = currentFormat();
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

      try {
        let workFile = item.file;
        const wasHeic = isHeicFile(item.file);
        if (wasHeic) {
          bar.update(0.05, 'Membaca file HEIC (format foto iPhone)…', 'Mendekode HEIC…');
          workFile = await resolveDecodableFile(item.file);
        }

        const needsWhiteBg = fmt.mime === 'image/jpeg' && (hasAlphaChannel(workFile) || wasHeic);

        const result = await runImageTask(
          'convert-format',
          { file: workFile, mimeType: fmt.mime, quality, background: needsWhiteBg ? '#ffffff' : null },
          (fraction, note) => bar.update(0.1 + fraction * 0.9, note)
        );
        bar.done('Selesai');

        const blob = new Blob([result.buffer], { type: result.mimeType });
        const afterUrl = urls.create(blob);
        const baseName = item.file.name.replace(/\.[^.]+$/, '');

        clear(card);
        card.className = '';
        card.append(
          resultPanel({
            title: 'Konversi Selesai!',
            subtitle: `Gambar berhasil diubah ke ${fmt.label} ✨`,
            beforeBytes: item.file.size,
            afterBytes: result.size,
            previewUrl: afterUrl,
            previewMeta: `${result.width}×${result.height}px · ${formatBytes(result.size)}`,
            filenameBase: baseName,
            filenameExt: `.${fmt.ext}`,
            note: wasHeic
              ? el('div', { class: 'alert alert--info' }, 'File HEIC (format foto iPhone) berhasil dibaca dan dikonversi — browser tidak bisa membuka HEIC secara langsung, jadi didekode dulu di perangkat Anda sebelum diubah ke format tujuan.')
              : needsWhiteBg
                ? el('div', { class: 'alert alert--info' }, 'Latar transparan pada gambar diisi warna putih karena format JPG/JPEG tidak mendukung transparansi.')
                : null,
            onDownload: (filename) => downloadBlob(blob, filename),
          })
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
