let worker = null;
let counter = 0;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/imageWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, type } = e.data;
      const task = pending.get(id);
      if (!task) return;
      if (type === 'progress') {
        task.onProgress?.(e.data.fraction, e.data.note);
      } else if (type === 'done') {
        pending.delete(id);
        task.resolve(e.data);
      } else if (type === 'error') {
        pending.delete(id);
        task.reject(new Error(e.data.message));
      }
    };
    worker.onerror = (e) => {
      // Worker gagal total (mis. OffscreenCanvas tidak didukung browser lama)
      for (const [id, task] of pending) {
        task.reject(new Error('Terjadi masalah teknis saat memproses gambar di background. Coba muat ulang halaman atau gunakan browser terbaru (Chrome/Edge/Firefox versi terbaru).'));
        pending.delete(id);
      }
    };
  }
  return worker;
}

/** Jalankan satu tugas di Web Worker gambar. Mengembalikan Promise<{buffer, mimeType, size, width, height,...}>. */
export function runImageTask(type, payload, onProgress) {
  const id = `t${++counter}`;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    getWorker().postMessage({ id, type, ...payload });
  });
}
