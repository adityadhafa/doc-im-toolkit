export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 0) bytes = 0;
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let val = bytes / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i += 1;
  }
  return `${val.toFixed(val < 10 ? 2 : 1)} ${units[i]}`;
}

export function formatDim(w, h) {
  if (!w || !h) return '—';
  return `${Math.round(w)} × ${Math.round(h)} px`;
}

export function parseSizeToBytes(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return unit === 'MB' ? Math.round(n * 1024 * 1024) : Math.round(n * 1024);
}

export function percentChange(before, after) {
  if (!before) return 0;
  return Math.round((1 - after / before) * 100);
}
