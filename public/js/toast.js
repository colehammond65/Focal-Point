// Toast notification function for Focal Point
// Usage: showToast('Message', timeoutInMs)
function showToast(msg, timeout = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toast-out 0.4s forwards';
        setTimeout(() => toast.remove(), 400);
    }, timeout);
}
