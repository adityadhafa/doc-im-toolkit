import { el, clear, icon } from '../utils/dom.js';
import { createDropzone } from '../utils/dropzone.js';
import { validateFiles } from '../utils/validate.js';
import { fileRow, progressBar, alertBox, resultPanel } from '../utils/ui.js';
import { formatBytes, parseSizeToBytes } from '../utils/format.js';
import { downloadBlob, createObjectUrlPool } from '../utils/download.js';
import { runImageTask } from '../utils/workerClient.js';
import { isHeicFile, resolveDecodableFile } from '../utils/heic.js';
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
      targetInput.value = String(Math.max(10, Math.ceil(bytes / 1024 / 10) * 10));
    }
  }

  async function handleRecommend() {
    if (!queue.length) {
      showToast('Upload foto dulu untuk mengecek rekomendasi.', 'error');
      return;
    }
    const target = queue[0].file;
    recommendBtn.disabled = true;
    recommendBtnLabel.textContent = 'Menganalisis…';
    clear(recommendResultEl);
    try {
      let workFile = target;
      if (isHeicFile(target)) workFile = await resolveDecodableFile(target);
      const res = await runImageTask('recommend-size', { file: workFile });
      const percent = Math.max(0, Math.round((1 - res.recommendedBytes / target.size) * 100));
      recommendResultEl.appendChild(
        el('div', { class: 'tip-box' }, [
          icon(LIGHTBULB_ICON, 18, 'tip-box__icon'),
          el('div', {}, [
            el('strong', {}, `Rekomendasi: ~${formatBytes(res.recommendedBytes)}`),
            el('p', {},
              `${res.width}×${res.height}px, kualitas seimbang (JPEG 82%)${percent > 0 ? ` — turun sekitar ${percent}% dari ${formatBytes(target.size)}` : ''}. Resolusi ini umumnya masih sangat tajam untuk dibaca manusia, AI, maupun OCR/sistem administratif.${queue.length > 1 ? ' Dihitung dari file pertama di antrean.' : ''}`
            ),
            el('button', {
              class: 'btn btn-primary btn-sm', type: 'button', style: 'margin-top:9px;',
              onClick: () => { fillTargetFromBytes(res.recommendedBytes); showToast('Target ukuran diisi dari rekomendasi.'); },
            }, 'Pakai Rekomendasi Ini'),
          ]),
        ])
      );
    } catch (err) {
      recommendResultEl.appendChild(alertBox(err?.message || 'Gagal menganalisis gambar ini.', { title: 'Gagal cek rekomendasi' }));
    }
    recommendBtn.disabled = false;
    recommendBtnLabel.textContent = 'Cek Rekomendasi Ukuran';
  }

  const dropzone = createDropzone({
    accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif',
    multiple: true,
    title: 'Tarik & lepas foto/scan di sini',
    hint: 'atau — JPG, PNG, WEBP, atau HEIC (foto iPhone)',
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
        let workFile = item.file;
        const wasHeic = isHeicFile(item.file);
        if (wasHeic) {
          bar.update(0.05, 'Membaca file HEIC (format foto iPhone)…', 'Mendekode HEIC…');
          workFile = await resolveDecodableFile(item.file);
        }

        const mimeType = wasHeic
          ? 'image/jpeg'
          : item.file.type === 'image/png' ? 'image/png' : (item.file.type === 'image/webp' ? 'image/webp' : 'image/jpeg');

        const result = await runImageTask(
          'compress-to-target',
          { file: workFile, targetBytes, mimeType },
          (fraction, note) => bar.update(0.1 + fraction * 0.9, note)
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
      recommendBtn,
      recommendResultEl,
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
