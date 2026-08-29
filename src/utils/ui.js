import { el, icon } from './dom.js';
import { formatBytes, formatDim, percentChange } from './format.js';

const TRASH_ICON =
  '<path d="M4 6h16M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';
const ALERT_ICON =
  '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>';
const DOWNLOAD_ICON =
  '<path d="M12 4v11m0 0-4-4m4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';

/** Baris satu file di daftar antrean, dengan tombol hapus. */
export function fileRow(file, { thumbUrl, onRemove }) {
  const row = el('li', { class: 'file-row' }, [
    thumbUrl
      ? el('img', { class: 'file-row__thumb', src: thumbUrl, alt: '' })
      : el('div', { class: 'file-row__thumb' }),
    el('div', { class: 'file-row__meta' }, [
      el('div', { class: 'file-row__name' }, file.name),
      el('div', { class: 'file-row__size mono' }, formatBytes(file.size)),
    ]),
    el('button', {
      class: 'file-row__remove',
      type: 'button',
      'aria-label': `Hapus ${file.name}`,
      onClick: onRemove,
    }, icon(TRASH_ICON, 15)),
  ]);
  return row;
}

export function alertBox(message, { title = 'Tidak bisa memproses file ini' } = {}) {
  return el('div', { class: 'alert alert--error', role: 'alert' }, [
    Object.assign(icon(ALERT_ICON, 18), { className: 'alert__icon' }),
    el('div', { class: 'alert__body' }, [
      el('strong', {}, title),
      el('span', {}, message),
    ]),
  ]);
}

export function infoBox(message) {
  return el('div', { class: 'alert alert--info' }, [
    Object.assign(icon(ALERT_ICON, 18), { className: 'alert__icon' }),
    el('div', { class: 'alert__body' }, [el('span', {}, message)]),
  ]);
}

/** Progress bar jujur — dikendalikan lewat objek yang dikembalikan (update/done). */
export function progressBar({ label = 'Memproses di perangkat Anda…' } = {}) {
  const bar = el('div', { class: 'progress-bar' });
  const pct = el('span', { class: 'progress-label__pct mono' }, '0%');
  const status = el('span', { class: 'progress-label__status' }, label);
  const note = el('div', { class: 'progress-note' }, '');
  const wrap = el('div', { class: 'progress-wrap' }, [
    el('div', { class: 'progress-label' }, [status, pct]),
    el('div', { class: 'progress-track' }, [bar]),
    note,
  ]);

  return {
    node: wrap,
    update(fraction, noteText, statusText) {
      const p = Math.max(0, Math.min(100, Math.round(fraction * 100)));
      bar.style.width = `${p}%`;
      pct.textContent = `${p}%`;
      if (statusText) status.textContent = statusText;
      if (noteText !== undefined) note.textContent = noteText;
    },
    done(noteText) {
      bar.style.width = '100%';
      pct.textContent = '100%';
      status.textContent = 'Selesai';
      if (noteText) note.textContent = noteText;
    },
  };
}

/** Kartu ringkasan hasil kompresi: ukuran sebelum vs sesudah + persentase. */
export function summaryRow(beforeBytes, afterBytes) {
  const diff = percentChange(beforeBytes, afterBytes);
  const positive = diff >= 0;
  return el(
    'div',
    { class: 'summary-row', style: !positive ? 'background: var(--warn-soft)' : '' },
    [
      el('span', { class: `stat-badge ${positive ? 'stat-badge--ok' : 'stat-badge--warn'}` }, [
        positive ? `↓ ${diff}% lebih kecil` : `↑ ${Math.abs(diff)}% lebih besar`,
      ]),
      el('span', { class: 'summary-row__text' }, [
        el('strong', { class: 'mono' }, formatBytes(beforeBytes)),
        ' → ',
        el('strong', { class: 'mono' }, formatBytes(afterBytes)),
      ]),
    ]
  );
}

/** Kartu perbandingan visual sebelum/sesudah untuk gambar. */
export function compareCard({ beforeUrl, afterUrl, beforeMeta, afterMeta }) {
  return el('div', { class: 'compare' }, [
    el('div', { class: 'compare__side' }, [
      el('div', { class: 'compare__label' }, 'Sebelum'),
      el('div', { class: 'compare__figure' }, [el('img', { src: beforeUrl, alt: 'Pratinjau sebelum' })]),
      el('div', { class: 'compare__meta mono' }, beforeMeta),
    ]),
    el('div', { class: 'compare__side' }, [
      el('div', { class: 'compare__label compare__label--after' }, 'Sesudah'),
      el('div', { class: 'compare__figure' }, [el('img', { src: afterUrl, alt: 'Pratinjau sesudah' })]),
      el('div', { class: 'compare__meta mono' }, afterMeta),
    ]),
  ]);
}

export function metaLine(size, w, h) {
  const parts = [formatBytes(size)];
  if (w && h) parts.push(formatDim(w, h));
  return parts.join(' · ');
}

export function downloadButton(label, onClick) {
  return el('button', { class: 'btn btn-primary btn-block', type: 'button', onClick }, [
    icon(DOWNLOAD_ICON, 17),
    label,
  ]);
}

export function emptyState(message) {
  return el('div', { class: 'empty-state' }, [
    Object.assign(icon(ALERT_ICON, 30), { className: 'empty-state__icon' }),
    el('p', {}, message),
  ]);
}
