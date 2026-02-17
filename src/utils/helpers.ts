export const computeOverlayPixelSize = (): { w: number; h: number } => {
  const SCREEN_WIDTH_CM = 111.93;
  const TABLE_WIDTH_CM = 100;
  const TABLE_HEIGHT_CM = 60;

  const pxPerCm = window.innerWidth / SCREEN_WIDTH_CM;
  const w = Math.round(TABLE_WIDTH_CM * pxPerCm);
  const h = Math.round(TABLE_HEIGHT_CM * pxPerCm);

  return { w, h };
};

export const showToast = (msg: string, timeout = 3000): void => {
  const toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    console.log(msg);
    return;
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 300);
  }, timeout);
};

export const unlockAudioContext = async (): Promise<void> => {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) {
    console.warn('Web Audio API not supported');
    return;
  }
  const ctx = new AudioContext();
  await ctx.resume();
  console.log('AudioContext unlocked');
};
