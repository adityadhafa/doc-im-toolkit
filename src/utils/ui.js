import { el, icon, clear } from './dom.js';
import { formatBytes, formatDim, percentChange } from './format.js';

const TRASH_ICON =
  '<path d="M4 6h16M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';
const ALERT_ICON =
  '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>';
const DOWNLOAD_ICON =
  '<path d="M12 4v11m0 0-4-4m4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
const CHECK_ICON =
  '<path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
const EYE_ICON =
  '<path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7S2.5 12 2.5 12Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/>';
const ARROW_ICON =
  '<path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';

/** Baris satu file di daftar antrean, dengan tombol hapus. */
export function fileRow(file, { thumbUrl, onRemove }) {
  const row = el('li', { class: 'file-row' }, [
    thumbUrl
      ? el('img', { class: 'file-row__thumb', src: thumbUrl, alt: '' })
      : el('div', { class: 'file-row__thumb file-row__thumb--doc' }, icon(fileGlyph(file), 18)),
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

function fileGlyph(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  return isPdf
    ? '<path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'
    : '<rect x="3" y="4" width="18" height="15" rx="2" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="10" r="1.6" stroke="currentColor" stroke-width="1.4"/><path d="m4 17 5-5 3 3 4-5 4 5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>';
}

export function alertBox(message, { title = 'Tidak bisa memproses file ini' } = {}) {
  return el('div', { class: 'alert alert--error', role: 'alert' }, [
    icon(ALERT_ICON, 18, 'alert__icon'),
    el('div', { class: 'alert__body' }, [
      el('strong', {}, title),
      el('span', {}, message),
    ]),
  ]);
}

export function infoBox(message) {
  return el('div', { class: 'alert alert--info' }, [
    icon(ALERT_ICON, 18, 'alert__icon'),
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

/** Kartu ringkasan hasil kompresi: ukuran sebelum vs sesudah + persentase. (dipakai di dalam resultPanel) */
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
    icon(ALERT_ICON, 30, 'empty-state__icon'),
    el('p', {}, message),
  ]);
}

/**
 * Panel hasil bergaya "kartu sukses": lingkaran centang, kotak sebelum/sesudah,
 * badge persentase, pratinjau file, kolom ganti nama, dan tombol unduh.
 * Dipakai konsisten di semua tool untuk hasil satu file.
 */
export function resultPanel(opts) {
  const {
    title = 'Berhasil Diproses!',
    subtitle = 'File Anda sudah siap ✨',
    beforeBytes = null,
    afterBytes = null,
    previewUrl = null,
    previewMeta = '',
    filenameBase = 'hasil',
    filenameExt = '',
    onDownload,
    note = null,
    extraActions = [],
  } = opts;

  const root = el('div', { class: 'result-panel' });

  root.appendChild(
    el('div', { class: 'result-panel__head' }, [
      el('div', { class: 'result-panel__check' }, icon(CHECK_ICON, 22)),
      el('h3', { class: 'result-panel__title' }, title),
      el('p', { class: 'result-panel__subtitle' }, subtitle),
    ])
  );

  if (beforeBytes !== null && afterBytes !== null) {
    const diff = percentChange(beforeBytes, afterBytes);
    const positive = diff >= 0;
    root.appendChild(
      el('div', { class: 'stat-box' }, [
        el('div', { class: 'stat-box__row' }, [
          el('div', { class: 'stat-box__col' }, [
            el('div', { class: 'stat-box__label' }, 'Sebelum'),
            el('div', { class: 'stat-box__value mono' }, formatBytes(beforeBytes)),
          ]),
          icon(ARROW_ICON, 18, 'stat-box__arrow'),
          el('div', { class: 'stat-box__col' }, [
            el('div', { class: 'stat-box__label' }, 'Sesudah'),
            el('div', { class: 'stat-box__value mono stat-box__value--after' }, formatBytes(afterBytes)),
          ]),
        ]),
        el('div', { class: 'stat-box__divider' }),
        el('div', { class: 'stat-box__pct' }, [
          el('span', {}, positive ? 'Pengurangan ukuran' : 'Perubahan ukuran'),
          el('strong', { class: `mono ${positive ? 'is-positive' : 'is-warn'}` }, `${positive ? '↓' : '↑'} ${Math.abs(diff)}%`),
        ]),
      ])
    );
  }

  if (note) root.appendChild(note);

  if (previewUrl) {
    const img = el('img', { class: 'preview-row__thumb', src: previewUrl, alt: 'Pratinjau file hasil' });
    root.appendChild(
      el('div', {}, [
        el('div', { class: 'section-label' }, 'Pratinjau File'),
        el('div', { class: 'preview-row' }, [
          img,
          el('div', { class: 'preview-row__meta' }, [
            el('div', { class: 'preview-row__name mono' }, `${filenameBase}${filenameExt}`),
            el('div', { class: 'preview-row__size' }, previewMeta),
            el('button', {
              class: 'btn btn-secondary btn-sm',
              type: 'button',
              style: 'margin-top:8px;',
              onClick: () => window.open(previewUrl, '_blank', 'noopener'),
            }, [icon(EYE_ICON, 14), ' Lihat Pratinjau']),
          ]),
        ]),
      ])
    );
  }

  let currentName = filenameBase;
  if (onDownload) {
    const nameInput = el('input', {
      type: 'text',
      value: filenameBase,
      'aria-label': 'Ganti nama file',
      onInput: (e) => { currentName = e.target.value.trim() || filenameBase; },
    });
    root.appendChild(
      el('div', { class: 'field' }, [
        el('label', {}, 'Ganti Nama File (Opsional)'),
        el('div', { class: 'rename-row' }, [nameInput, el('span', { class: 'rename-row__ext mono' }, filenameExt)]),
      ])
    );
    root.appendChild(
      el('button', {
        class: 'btn btn-primary btn-block btn-lg',
        type: 'button',
        onClick: () => onDownload(`${currentName}${filenameExt}`),
      }, [icon(DOWNLOAD_ICON, 18), 'Unduh File'])
    );
  }

  if (extraActions.length) {
    root.appendChild(el('div', { class: 'result-panel__extra' }, extraActions));
  }

  return root;
}
