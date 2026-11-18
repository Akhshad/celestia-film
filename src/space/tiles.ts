/* Google-Earth-style zoom: Mapbox satellite tiles, one 4×4 mosaic per zoom level, centred on the site
   and draped on the globe. Finer levels load only when the camera gets close enough to need them. */
import * as THREE from 'three';
import { MAPBOX_TOKEN } from '../config';
import { sstep, D2R } from '../util';
import { BASIC_VS, TILE_FS } from './shaders';

const Z0 = 5, Z1 = 13, GRID = 4, TPX = 512;

/** Earth-fixed unit vector for lon/lat (matches THREE.SphereGeometry's equirectangular UVs). */
export function geoDir(lon: number, lat: number, out = new THREE.Vector3()) {
  const l = lon * D2R, f = lat * D2R;
  return out.set(Math.cos(f) * Math.cos(l), Math.sin(f), -Math.cos(f) * Math.sin(l));
}

const merc = (lon: number, lat: number, z: number) => {
  const n = 2 ** z, f = lat * D2R;
  return [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(f) + 1 / Math.cos(f)) / Math.PI) / 2 * n];
};
const unmerc = (x: number, y: number, z: number) => {
  const n = 2 ** z;
  return [x / n * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) / D2R];
};

interface Level {
  z: number; x0: number; y0: number;
  mesh?: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  canvas?: HTMLCanvasElement; tex?: THREE.CanvasTexture;
  loaded: number; shownAt: number;
}

export class SatelliteTiles {
  readonly enabled = !!MAPBOX_TOKEN;
  readonly group = new THREE.Group();
  private levels: Level[] = [];

  constructor(lon: number, private lat: number, private radius: number,
    private shared: { uSunDir: THREE.IUniform; uCam: THREE.IUniform }) {
    for (let z = Z0; z <= Z1; z++) {
      const [cx, cy] = merc(lon, lat, z);
      this.levels.push({ z, x0: Math.round(cx) - GRID / 2, y0: Math.round(cy) - GRID / 2, loaded: 0, shownAt: 0 });
    }
  }

  private build(L: Level) {
    const N = 24, pos: number[] = [], uv: number[] = [], idx: number[] = [], v = new THREE.Vector3();
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const [lon, lat] = unmerc(L.x0 + GRID * i / N, L.y0 + GRID * j / N, L.z);
      geoDir(lon, lat, v).multiplyScalar(this.radius);
      pos.push(v.x, v.y, v.z); uv.push(i / N, 1 - j / N);
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i; idx.push(a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    L.canvas = document.createElement('canvas'); L.canvas.width = L.canvas.height = GRID * TPX;
    L.tex = new THREE.CanvasTexture(L.canvas);
    L.tex.colorSpace = THREE.NoColorSpace; L.tex.anisotropy = 8;
    L.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      vertexShader: BASIC_VS, fragmentShader: TILE_FS, transparent: true, depthTest: false, depthWrite: false,
      uniforms: { uTex: { value: L.tex }, uA: { value: 0 }, uSunDir: this.shared.uSunDir, uCam: this.shared.uCam },
    }));
    L.mesh.renderOrder = 10 + L.z; L.mesh.frustumCulled = false; L.mesh.visible = false;
    this.group.add(L.mesh);
    const ctx = L.canvas.getContext('2d')!;
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => {
        ctx.drawImage(im, i * TPX, j * TPX, TPX, TPX); L.tex!.needsUpdate = true;
        if (++L.loaded === GRID * GRID) L.shownAt = performance.now();
      };
      im.src = `https://api.mapbox.com/v4/mapbox.satellite/${L.z}/${L.x0 + i}/${L.y0 + j}@2x.jpg90?access_token=${MAPBOX_TOKEN}`;
    }
  }

  /** @param pxPerRadian screen px per radian of arc at the site (0 hides everything). */
  update(pxPerRadian: number) {
    if (!this.enabled) return;
    const now = performance.now();
    for (const L of this.levels) {
      const tileRad = 2 * Math.PI / 2 ** L.z * Math.cos(this.lat * D2R);
      const px = pxPerRadian * tileRad;                 // screen px covered by one tile
      if (!L.mesh && px > 110) this.build(L);
      if (!L.mesh) continue;
      const ready = L.loaded === GRID * GRID ? sstep(0, 600, now - L.shownAt) : 0;
      const a = ready * sstep(80, 200, px);
      L.mesh.material.uniforms.uA.value = a;
      L.mesh.visible = a > 0.001;
    }
  }

  /** Any tile level on screen (to show the imagery credit). */
  get visible() { return this.levels.some(l => l.mesh?.visible); }
}
