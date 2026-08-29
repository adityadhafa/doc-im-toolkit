export function showToast(message, type = 'success', duration = 2600) {
  const root = document.getElementById('toastRoot');
  if (!root) return;
  const toast = document.createElement('div');
  toast.className = `toast${type === 'error' ? ' toast--error' : ''}`;
  toast.textContent = message;
  root.appendChild(toast);
  window.setTimeout(() => {
    toast.style.transition = 'opacity 180ms ease, transform 180ms ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    window.setTimeout(() => toast.remove(), 200);
  }, duration);
}
