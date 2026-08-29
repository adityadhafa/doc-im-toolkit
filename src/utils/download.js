/**
 * Memicu unduhan blob ke perangkat pengguna, lalu membersihkan object URL
 * agar tidak menumpuk di memori (mencegah memory leak pada sesi panjang).
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Beri jeda sedikit sebelum revoke agar browser sempat memulai unduhan.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Registry kecil untuk melacak object URL yang dibuat untuk preview,
 * supaya bisa dibersihkan sekaligus saat tool berpindah/reset.
 */
export function createObjectUrlPool() {
  const urls = new Set();
  return {
    create(blob) {
      const url = URL.createObjectURL(blob);
      urls.add(url);
      return url;
    },
    revokeAll() {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}
