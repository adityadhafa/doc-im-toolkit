import { el, clear, icon } from '../utils/dom.js';
import { createDropzone } from '../utils/dropzone.js';
import { validateFiles } from '../utils/validate.js';
import { fileRow, progressBar, alertBox, resultPanel } from '../utils/ui.js';
import { formatBytes, parseSizeToBytes } from '../utils/format.js';
import { downloadBlob, createObjectUrlPool } from '../utils/download.js';
import { runImageTask } from '../utils/workerClient.js';
import { showToast } from '../utils/toast.js';

export function mount(container) {
  const urls = createObjectUrlPool();
  let queue = []; // { file }
  let processing = false;

  const listEl = el('ul', { class: 'file-list' });
  const errorsEl = el('div');
  const resultsEl = el('div', { style: 'display:flex; flex-direction:column; gap:16px; margin-top:18px;' });

  const targetInput = el('input', { type: 'number', min: '10', step: '10', value: '200', 'aria-label': 'Target ukuran' });
  const unitSelect = el('select', { 'aria-label': 'Satuan ukuran' }, [
    el('option', { value: 'KB', selected: true }, 'KB'),
    el('option', { value: 'MB' }, 'MB'),
  ]);

  const processBtn = el('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: true, onClick: startProcessing }, 'Kompres Sekarang');

  const dropzone = createDropzone({
    accept: 'image/jpeg,image/png,image/webp',
    multiple: true,
    title: 'Tarik & lepas foto/scan di sini',
    hint: 'atau — JPG, PNG, atau WEBP',
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
      const url = urls.create(item.file);
      listEl.appendChild(
        fileRow(item.file, {
          thumbUrl: url,
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
    const targetBytes = parseSizeToBytes(targetInput.value, unitSelect.value);
    if (!targetBytes) {
      showToast('Masukkan target ukuran yang valid (angka lebih dari 0).', 'error');
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
      const bar = progressBar({ label: `Mengompres "${item.file.name}"…` });
      card.appendChild(bar.node);

      try {
        const beforeUrl = urls.create(item.file);
        const mimeType = item.file.type === 'image/png' ? 'image/png' : (item.file.type === 'image/webp' ? 'image/webp' : 'image/jpeg');

        const result = await runImageTask(
          'compress-to-target',
          { file: item.file, targetBytes, mimeType },
          (fraction, note) => bar.update(fraction, note)
        );
        bar.done(`Selesai — ${result.width}×${result.height}px`);

        const blob = new Blob([result.buffer], { type: result.mimeType });
        const afterUrl = urls.create(blob);
        const ext = result.mimeType === 'image/png' ? 'png' : result.mimeType === 'image/webp' ? 'webp' : 'jpg';
        const baseName = item.file.name.replace(/\.[^.]+$/, '');

        clear(card);
        card.className = '';
        card.append(
          resultPanel({
            title: 'Kompresi Selesai!',
            subtitle: 'Foto berhasil dikompresi ✨',
            beforeBytes: item.file.size,
            afterBytes: result.size,
            previewUrl: afterUrl,
            previewMeta: `${result.width}×${result.height}px · ${formatBytes(result.size)}`,
            filenameBase: `${baseName}-kompres`,
            filenameExt: `.${ext}`,
            note: result.size > targetBytes
              ? alertBox(
                  `Ukuran belum bisa turun sampai target tanpa merusak kualitas gambar secara drastis. Hasil terbaik: ${formatBytes(result.size)}. Coba turunkan target sedikit lagi atau gunakan resolusi lebih kecil.`,
                  { title: 'Mendekati target, belum tepat tercapai' }
                )
              : null,
            onDownload: (filename) => downloadBlob(blob, filename),
          })
        );
      } catch (err) {
        clear(card);
        card.appendChild(alertBox(err?.message || 'Gagal mengompres gambar ini.', { title: `Gagal memproses "${item.file.name}"` }));
      }
    }

    processing = false;
    processBtn.textContent = 'Kompres Sekarang';
    processBtn.disabled = queue.length === 0;
    window.__setPrivacyActive?.(false);
    showToast('Pemrosesan selesai.');
  }

  const optionsCard = el('div', { class: 'card' }, [
    el('div', { class: 'field' }, [
      el('label', {}, 'Target ukuran akhir'),
      el('div', { class: 'input-row' }, [targetInput, unitSelect]),
      el('div', { class: 'field-hint' }, 'Contoh: form CPNS/SSCASN biasanya membatasi foto maksimal 200 KB.'),
    ]),
    processBtn,
  ]);

  container.append(
    el('div', { class: 'tool-grid tool-grid--split' }, [
      el('div', {}, [dropzone, errorsEl, listEl]),
      optionsCard,
    ]),
    resultsEl
  );
  renderQueue();

  return function unmount() {
    urls.revokeAll();
  };
}
