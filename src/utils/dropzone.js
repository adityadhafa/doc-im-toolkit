import { el, icon } from './dom.js';

const UPLOAD_ICON =
  '<path d="M12 15V4M12 4l-4 4M12 4l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';

/**
 * Membuat area drag-and-drop + tombol "pilih file".
 * onFiles menerima FileList/array File setiap kali user memilih file
 * (baik lewat drop maupun input) — tidak pernah melakukan upload jaringan.
 */
export function createDropzone({
  accept = 'image/*',
  multiple = false,
  title = 'Seret & lepas file di sini',
  hint = 'atau klik untuk memilih dari perangkat Anda',
  onFiles,
}) {
  const input = el('input', {
    type: 'file',
    accept,
    multiple,
    onChange: (e) => {
      if (e.target.files?.length) onFiles(Array.from(e.target.files));
      e.target.value = '';
    },
  });

  const zone = el(
    'div',
    {
      class: 'dropzone',
      tabindex: '0',
      role: 'button',
      'aria-label': `${title}. ${hint}`,
      onClick: () => input.click(),
      onKeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          input.click();
        }
      },
      onDragover: (e) => {
        e.preventDefault();
        zone.classList.add('is-dragover');
      },
      onDragleave: () => zone.classList.remove('is-dragover'),
      onDrop: (e) => {
        e.preventDefault();
        zone.classList.remove('is-dragover');
        const files = Array.from(e.dataTransfer?.files || []);
        if (files.length) onFiles(files);
      },
    },
    [
      icon(UPLOAD_ICON, 40),
      el('div', { class: 'dropzone__title' }, title),
      el('div', { class: 'dropzone__hint' }, hint),
      input,
    ]
  );
  zone.querySelector('svg')?.classList.add('dropzone__icon');

  return zone;
}
