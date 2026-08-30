import './style.css';
import { el, clear, icon } from './utils/dom.js';

// Vite men-hash nama file JS tiap tool per build. Kalau situs baru saja
// di-deploy ulang, tab lama yang masih terbuka bisa mencoba fetch chunk
// lama yang sudah tidak ada di server -> "Failed to fetch dynamically
// imported module". Vite memancarkan event ini persis untuk kasus itu;
// solusi resminya adalah muat ulang sekali agar dapat index.html terbaru
// yang menunjuk ke nama file yang benar. Guard sessionStorage mencegah
// reload berulang tanpa henti kalau masalahnya ternyata bukan cache.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const key = 'toolkit-chunk-reload-attempted';
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, '1');
    window.location.reload();
  }
});

const ICONS = {
  compressPdf:
    '<path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 14.5c1.8-1.3 4.2-1.3 6 0M9.5 17.5h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  compressImage:
    '<rect x="3" y="4" width="18" height="15" rx="2" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="10" r="1.6" stroke="currentColor" stroke-width="1.4"/><path d="m4 17 5-5 3 3 4-5 4 5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>',
  imgPdf:
    '<path d="M5 4h8l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M13 4v5h5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 12v5m0-5 2 2m-2-2-2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
  resizePrint:
    '<rect x="7" y="3" width="10" height="14" rx="1.2" stroke="currentColor" stroke-width="1.6"/><path d="M4 9v10a1 1 0 0 0 1 1h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  merge:
    '<rect x="3" y="4" width="9" height="12" rx="1.3" stroke="currentColor" stroke-width="1.6"/><rect x="9" y="9" width="9" height="12" rx="1.3" fill="var(--surface,#fff)" stroke="currentColor" stroke-width="1.6"/>',
  splitPdf:
    '<rect x="3" y="4" width="8" height="16" rx="1.4" stroke="currentColor" stroke-width="1.6"/><rect x="13" y="4" width="8" height="16" rx="1.4" stroke="currentColor" stroke-width="1.6"/><path d="M12 9v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="2 2"/>',
  convertFormat:
    '<path d="M4 7a5 5 0 0 1 5-5h1M20 17a5 5 0 0 1-5 5h-1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="m7 4-2 2 2 2M17 20l2-2-2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><text x="4" y="15" font-size="7" fill="currentColor" font-family="monospace">JPG</text><text x="12" y="21" font-size="7" fill="currentColor" font-family="monospace">PNG</text>',
};

const TOOLS = [
  {
    id: 'compress-pdf',
    label: 'Kompres PDF',
    description: 'Perkecil ukuran file PDF sampai mendekati target ukuran yang Anda tentukan (KB/MB) — cocok untuk upload berkas CPNS/lamaran yang ada batas ukurannya.',
    icon: ICONS.compressPdf,
    load: () => import('./tools/compressPdf.js'),
  },
  {
    id: 'split-pdf',
    label: 'Pisah PDF',
    description: 'Pecah satu file PDF jadi beberapa file terpisah — tentukan jumlah bagian dan rentang halaman (dari–sampai) untuk tiap bagian.',
    icon: ICONS.splitPdf,
    load: () => import('./tools/splitPdf.js'),
  },
  {
    id: 'compress-image',
    label: 'Kompres Foto',
    description: 'Perkecil ukuran file foto/scan ke target KB tertentu, dengan pratinjau sebelum dan sesudah.',
    icon: ICONS.compressImage,
    load: () => import('./tools/compressImage.js'),
  },
  {
    id: 'image-pdf',
    label: 'Gambar ⇄ PDF',
    description: 'Ubah gambar jadi PDF, atau ubah tiap halaman PDF jadi gambar JPG/PNG — termasuk PDF berhalaman banyak.',
    icon: ICONS.imgPdf,
    load: () => import('./tools/imagePdfConvert.js'),
  },
  {
    id: 'resize-print',
    label: 'Ukuran Cetak Foto',
    description: 'Resize foto ke ukuran cetak standar Indonesia (3x4, 4x6, 2x3 cm, atau custom) lengkap dengan pengaturan DPI cetak.',
    icon: ICONS.resizePrint,
    load: () => import('./tools/resizePrint.js'),
  },
  {
    id: 'merge',
    label: 'Gabung ke PDF',
    description: 'Gabungkan beberapa gambar dan/atau PDF menjadi satu file PDF, urutan bisa Anda atur sendiri.',
    icon: ICONS.merge,
    load: () => import('./tools/mergeFiles.js'),
  },
  {
    id: 'convert-format',
    label: 'Ubah Format Gambar',
    description: 'Konversi antar format JPG, PNG, dan WEBP. Latar transparan PNG otomatis diisi putih saat diubah ke JPG.',
    icon: ICONS.convertFormat,
    load: () => import('./tools/convertFormat.js'),
  },
];

const tabList = document.getElementById('tabList');
const toolRoot = document.getElementById('toolRoot');
const privacyPill = document.getElementById('privacyPill');

let currentUnmount = null;
let currentId = null;

function setPrivacyActive(active) {
  privacyPill.classList.toggle('is-active', active);
  privacyPill.querySelector('.privacy-pill__text').textContent = active
    ? 'Memproses di perangkat ini sekarang'
    : 'Berjalan 100% di perangkat ini';
}
// Tersedia global agar tiap modul tool bisa memberi sinyal saat sedang memproses.
window.__setPrivacyActive = setPrivacyActive;

async function activateTool(id, { focusTab = false } = {}) {
  if (id === currentId) return;
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) return;

  for (const btn of tabList.querySelectorAll('.tab-btn')) {
    const isActive = btn.dataset.id === id;
    btn.setAttribute('aria-selected', String(isActive));
    btn.tabIndex = isActive ? 0 : -1;
  }
  if (focusTab) tabList.querySelector(`[data-id="${id}"]`)?.focus();

  if (typeof currentUnmount === 'function') {
    try { currentUnmount(); } catch { /* noop */ }
  }
  currentUnmount = null;
  currentId = id;

  clear(toolRoot);
  const panel = el('div', { class: 'tool-panel' }, [
    el('div', { class: 'tool-head' }, [
      el('h1', {}, tool.label),
      el('p', {}, tool.description),
    ]),
    el('div', { class: 'card mono', style: 'padding:24px; text-align:center; color:var(--ink-faint); font-size:13px;' }, 'Memuat alat…'),
  ]);
  toolRoot.appendChild(panel);

  history.replaceState(null, '', `#${id}`);

  try {
    const mod = await tool.load();
    if (currentId !== id) return; // user sudah pindah tab sebelum load selesai
    clear(panel);
    panel.append(
      el('div', { class: 'tool-head' }, [el('h1', {}, tool.label), el('p', {}, tool.description)])
    );
    const mountEl = el('div');
    panel.appendChild(mountEl);
    const result = mod.mount(mountEl);
    currentUnmount = typeof result === 'function' ? result : null;
  } catch (err) {
    clear(panel);
    const msg = String(err?.message || err || '');
    const isStaleChunk = /fetch dynamically imported module|error loading dynamically imported module/i.test(msg);
    panel.append(
      el('div', { class: 'tool-head' }, [el('h1', {}, tool.label)]),
      isStaleChunk
        ? el('div', { class: 'alert alert--error' }, [
            el('div', { class: 'alert__body' }, [
              el('strong', {}, 'Situs baru saja diperbarui'),
              el('span', {}, 'Versi halaman yang tersimpan di browser Anda sudah lama. Klik tombol di bawah untuk memuat versi terbaru.'),
              el('button', {
                class: 'btn btn-primary btn-sm',
                type: 'button',
                style: 'margin-top:10px;',
                onClick: () => window.location.reload(),
              }, 'Muat Ulang Halaman'),
            ]),
          ])
        : el('div', { class: 'alert alert--error' }, `Gagal memuat alat ini: ${msg}. Coba muat ulang halaman.`)
    );
  }
}

for (const tool of TOOLS) {
  const btn = el(
    'button',
    {
      class: 'tab-btn',
      type: 'button',
      role: 'tab',
      'data-id': tool.id,
      'aria-selected': 'false',
      tabIndex: -1,
      onClick: () => activateTool(tool.id),
    },
    [icon(tool.icon, 17), tool.label]
  );
  btn.querySelector('svg')?.classList.add('tab-btn__icon');
  tabList.appendChild(btn);
}

tabList.addEventListener('keydown', (e) => {
  const tabs = Array.from(tabList.querySelectorAll('.tab-btn'));
  const idx = tabs.findIndex((t) => t.dataset.id === currentId);
  if (e.key === 'ArrowRight') activateTool(tabs[(idx + 1) % tabs.length].dataset.id, { focusTab: true });
  if (e.key === 'ArrowLeft') activateTool(tabs[(idx - 1 + tabs.length) % tabs.length].dataset.id, { focusTab: true });
});

const initial = location.hash.replace('#', '');
activateTool(TOOLS.some((t) => t.id === initial) ? initial : TOOLS[0].id);
