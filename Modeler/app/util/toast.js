let activeToast = null;

export function showErrorToast(message) {
  // Remove any existing toast
  if (activeToast) {
    activeToast.remove();
    activeToast = null;
  }

  const toast = document.createElement('div');
  toast.className = 'bpmnbc-toast';
  toast.innerHTML = `
    <span class="bpmnbc-toast-message">${message}</span>
    <button class="bpmnbc-toast-close" aria-label="Close">&#x2715;</button>
  `;

  document.body.appendChild(toast);
  activeToast = toast;

  const close = () => {
    toast.classList.add('bpmnbc-toast--out');
    toast.addEventListener('animationend', () => {
      toast.remove();
      if (activeToast === toast) activeToast = null;
    }, { once: true });
  };

  toast.querySelector('.bpmnbc-toast-close').addEventListener('click', close);
}
