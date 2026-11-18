/* Shared, mutable frame state: viewport metrics (device pixels) and the animation clock. */
export const view = {
  W: 0, H: 0, DPR: 1, MIN: 1, MAX: 1, CX: 0, CY: 0, PORTRAIT: false,
  /** Small-screen device: lighter point counts and textures. */
  SMALL: Math.min(screen.width, screen.height) < 700,
};
export const clock = { time: 0 };

const cv = document.getElementById('c') as HTMLCanvasElement;
export const canvas2d = cv;
export const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
