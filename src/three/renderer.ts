/* One WebGL2 renderer on #gl, shared by the space scene, the clouds and the finale. */
import * as THREE from 'three';

// All custom shaders do their own grading, so keep Three.js out of colour management.
THREE.ColorManagement.enabled = false;

export const glCanvas = document.getElementById('gl') as HTMLCanvasElement;

export const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.autoClear = false;

export const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
/** Drawing-buffer size in device pixels. */
export const glSize = new THREE.Vector2(2, 2);

export function resizeRenderer() {
  const r = glCanvas.parentElement!.getBoundingClientRect();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
  renderer.getDrawingBufferSize(glSize);
}
resizeRenderer();

const loader = new THREE.TextureLoader();
/** Load a texture from /public, raw (no colour conversion), mipmapped. */
export function loadTex(path: string, opts: { flipY?: boolean } = {}) {
  return loader.loadAsync(`${import.meta.env.BASE_URL}${path}`).then(t => {
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = maxAniso;
    if (opts.flipY === false) t.flipY = false;
    t.needsUpdate = true;
    return t;
  });
}

let shown = false;
export function showGL(on: boolean) {
  if (on !== shown) { shown = on; glCanvas.style.opacity = on ? '1' : '0'; }
}
