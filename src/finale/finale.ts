/* =====================================================================
   3D FINALE (Three.js): the real building (celestia-hall.glb) at golden
   hour, a satin drape falling over it, soft shadows and bloom.
   ===================================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { D2R, clamp, easeInOut, lerp, sstep } from '../util';
import { view, clock } from '../view';
import { MODEL_URL, DRAPE_RGB } from '../config';
import { buildDrapeGeometry, buildDrapeCanvas } from './drape';
import * as S from './shaders';

// The custom shaders do their own grading + tone mapping, so keep Three.js out of colour management.
THREE.ColorManagement.enabled = false;

const SUN3 = new THREE.Vector3(0.694, 0.19, 0.694).normalize();   // low evening sun, front-right
const FOG3 = new THREE.Color(0.80, 0.62, 0.60);
const EXPOSURE = 0.95;
const SHN = 2048;               // shadow map size
const VFOV = 45;                // degrees
const BLOOM_K = 0.65;

/* camera path: p, elevation, azimuth (0 = straight in front, negative = from the left), distance, target height */
const CAMK = [
  [.700, 89.0, -18, 330, 6],
  [.748, 88.5, -18, 235, 6],
  [.805, 50.0, -30, 172, 10],
  [.866, 12.5, -36, 132, 17],
  [.950, 10.5, -30, 128, 19],
  [1.00, 10.0, -26, 124, 19]];

function camAt(p: number, out: THREE.PerspectiveCamera) {
  let k = CAMK.length - 2;
  for (let i = 1; i < CAMK.length; i++) if (p <= CAMK[i][0]) { k = i - 1; break; }
  const a = CAMK[k], b = CAMK[k + 1];
  const t = easeInOut(clamp((p - a[0]) / (b[0] - a[0]), 0, 1));
  const el = lerp(a[1], b[1], t) * D2R, az = lerp(a[2], b[2], t) * D2R;
  let d = lerp(a[3], b[3], t);
  const asp = view.W / view.H;
  const need = 46 / (Math.tan(VFOV * D2R / 2) * asp);           // keep ~92 m (building + drape) inside narrow screens
  d = Math.max(d, lerp(d, need, sstep(70 * D2R, 40 * D2R, el)));
  const ty = lerp(a[4], b[4], t);
  out.position.set(d * Math.cos(el) * Math.sin(az), ty + d * Math.sin(el), 2 + d * Math.cos(el) * Math.cos(az));
  out.lookAt(0, ty, 2);
}

const shared = {
  uSun: { value: SUN3 },
  uExp: { value: EXPOSURE },
  uCam: { value: new THREE.Vector3() },
  uTime: { value: 0 },
  uFall: { value: 0 },
};

class Finale {
  ready = false;
  failed = false;

  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(VFOV, 1, 1, 2500);
  private lightCam = new THREE.OrthographicCamera(-95, 95, 52, -22, 1, 900);
  private sky!: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private drape!: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private drapeDepth!: THREE.ShaderMaterial;
  private meshDepth!: THREE.ShaderMaterial;
  /** Meshes that cast shadows, with their main material. */
  private casters: { mesh: THREE.Mesh; main: THREE.Material }[] = [];
  /** Things hidden in the shadow pass (sky, ground). */
  private receiversOnly: THREE.Object3D[] = [];
  private shadowRT!: THREE.WebGLRenderTarget;
  private sceneRT!: THREE.WebGLRenderTarget;
  private bloomA!: THREE.WebGLRenderTarget;
  private bloomB!: THREE.WebGLRenderTarget;
  private brightQ!: FullScreenQuad; private blurQ!: FullScreenQuad; private compQ!: FullScreenQuad;
  private shFall = -1;
  private size = new THREE.Vector2();
  private shown = false;

  constructor(private canvas: HTMLCanvasElement) {}

  async start() {
    try {
      const renderer = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.autoClear = false;
      const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

      this.lightCam.position.copy(SUN3).multiplyScalar(400);
      this.lightCam.lookAt(0, 0, 0);
      this.lightCam.updateMatrixWorld(); this.lightCam.updateProjectionMatrix();
      const LVP = new THREE.Matrix4().multiplyMatrices(this.lightCam.projectionMatrix, this.lightCam.matrixWorldInverse);

      const rt = (w: number, h: number, o: THREE.RenderTargetOptions = {}) =>
        new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: false, ...o });
      this.shadowRT = rt(SHN, SHN, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
      this.sceneRT = rt(2, 2, { depthBuffer: true, samples: 4 });
      this.bloomA = rt(2, 2); this.bloomB = rt(2, 2);

      // sky: one full-screen triangle at the far plane
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
      this.sky = new THREE.Mesh(tri, new THREE.ShaderMaterial({
        vertexShader: S.SKY_VS, fragmentShader: S.SKY_FS, depthTest: false, depthWrite: false,
        uniforms: { uSun: shared.uSun, uExp: shared.uExp, uCam: shared.uCam, uInv: { value: new THREE.Matrix4() } },
      }));
      this.sky.frustumCulled = false; this.sky.renderOrder = 0;
      this.scene.add(this.sky); this.receiversOnly.push(this.sky);

      this.meshDepth = new THREE.ShaderMaterial({ vertexShader: S.DEPTH_VS, fragmentShader: S.DEPTH_FS, side: THREE.DoubleSide });

      // building + ground from the glTF
      const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
      const loaded: THREE.Mesh[] = [];
      gltf.scene.traverse(o => { if ((o as THREE.Mesh).isMesh) loaded.push(o as THREE.Mesh); });
      if (!loaded.length) throw new Error('model has no meshes');
      for (const m of loaded) {
        const src = m.material as THREE.MeshStandardMaterial;
        const map = src.map;
        if (!map) throw new Error(`material ${src.name} has no texture`);
        map.colorSpace = THREE.NoColorSpace; map.anisotropy = aniso; map.needsUpdate = true;
        const name = src.name || '';
        const mode = name.startsWith('ground') ? 1 : name === 'foliage' ? 2 : 0;
        const far = name === 'groundfar';
        const mat = new THREE.ShaderMaterial({
          vertexShader: S.MESH_VS, fragmentShader: S.MESH_FS, side: THREE.DoubleSide, depthWrite: !far,
          uniforms: {
            uSun: shared.uSun, uExp: shared.uExp, uCam: shared.uCam,
            uTex: { value: map }, uShadow: { value: this.shadowRT.texture }, uShOK: { value: 1 },
            uShTexel: { value: new THREE.Vector2(1 / SHN, 1 / SHN) }, uLVP: { value: LVP },
            uMode: { value: mode }, uMetal: { value: (src.metalness || 0) > .5 ? 1 : 0 },
          },
        });
        src.dispose();
        const mesh = new THREE.Mesh(m.geometry, mat);
        mesh.matrixAutoUpdate = false; m.updateWorldMatrix(true, false); mesh.matrix.copy(m.matrixWorld);
        mesh.frustumCulled = false;
        mesh.renderOrder = far ? 1 : 2;
        this.scene.add(mesh);
        if (mode === 1) this.receiversOnly.push(mesh);      // the ground only receives
        else this.casters.push({ mesh, main: mat });
      }

      // the drape
      const tex = new THREE.CanvasTexture(buildDrapeCanvas());
      tex.flipY = false; tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = aniso;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      const dg = buildDrapeGeometry();
      this.drape = new THREE.Mesh(dg, new THREE.ShaderMaterial({
        vertexShader: S.DRAPE_VS, fragmentShader: S.DRAPE_FS, side: THREE.DoubleSide,
        uniforms: {
          uSun: shared.uSun, uExp: shared.uExp, uCam: shared.uCam, uTime: shared.uTime, uFall: shared.uFall,
          uBase: { value: new THREE.Vector3(...DRAPE_RGB) }, uTex: { value: tex },
          uTexel: { value: new THREE.Vector2(1.5 / 2048, 1.5 / 2048) },
        },
      }));
      this.drape.frustumCulled = false; this.drape.renderOrder = 3; this.drape.visible = false;
      this.scene.add(this.drape);
      this.drapeDepth = new THREE.ShaderMaterial({
        vertexShader: S.DRAPE_VS, fragmentShader: S.DEPTH_FS, side: THREE.DoubleSide,
        uniforms: { uTime: shared.uTime, uFall: shared.uFall },
      });
      this.casters.push({ mesh: this.drape, main: this.drape.material });

      // bloom passes
      this.brightQ = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: S.POST_VS, fragmentShader: S.BRIGHT_FS, uniforms: { uSrc: { value: null }, uPx: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false }));
      this.blurQ = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: S.POST_VS, fragmentShader: S.BLUR_FS, uniforms: { uSrc: { value: null }, uDir: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false }));
      this.compQ = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: S.POST_VS, fragmentShader: S.COMPOSITE_FS, uniforms: { uScene: { value: this.sceneRT.texture }, uBloom: { value: this.bloomA.texture }, uK: { value: BLOOM_K } }, depthTest: false, depthWrite: false }));

      this.resize();
      // compile everything now so the first finale frame doesn't stutter
      renderer.compile(this.scene, this.camera);
      this.ready = true;
    } catch (err) {
      console.warn('3D finale unavailable, using 2D version:', err);
      this.failed = true;
    }
  }

  /** Redraw the drape lettering (after web fonts finish loading). */
  refreshText() {
    if (!this.ready) return;
    const t = this.drape.material.uniforms.uTex.value as THREE.CanvasTexture;
    t.image = buildDrapeCanvas(); t.needsUpdate = true;
  }

  resize() {
    if (!this.renderer) return;
    const r = this.canvas.parentElement!.getBoundingClientRect();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    this.renderer.getDrawingBufferSize(this.size);
    const w = this.size.x, h = this.size.y, qw = Math.max(2, w >> 2), qh = Math.max(2, h >> 2);
    this.sceneRT.setSize(w, h); this.bloomA.setSize(qw, qh); this.bloomB.setSize(qw, qh);
  }

  show(on: boolean) {
    if (on !== this.shown) { this.shown = on; this.canvas.style.opacity = on ? '1' : '0'; }
  }

  private drawShadowMap() {
    const r = this.renderer;
    for (const o of this.receiversOnly) o.visible = false;
    for (const c of this.casters) c.mesh.material = c.mesh === this.drape ? this.drapeDepth : this.meshDepth;
    r.setRenderTarget(this.shadowRT);
    r.setClearColor(0xffffff, 1); r.clear();
    r.render(this.scene, this.lightCam);
    for (const c of this.casters) c.mesh.material = c.main;
    for (const o of this.receiversOnly) o.visible = true;
  }

  draw(p: number) {
    const r = this.renderer;
    const fall = clamp((p - .87) / (.95 - .87), 0, 1);
    shared.uTime.value = clock.time; shared.uFall.value = fall;
    this.drape.visible = fall > 0;
    if (fall !== this.shFall || (fall > 0 && fall < 1)) { this.drawShadowMap(); this.shFall = fall; }

    const cam = this.camera;
    cam.aspect = this.size.x / this.size.y; cam.updateProjectionMatrix();
    camAt(p, cam); cam.updateMatrixWorld();
    shared.uCam.value.copy(cam.position);
    const inv = this.sky.material.uniforms.uInv.value as THREE.Matrix4;
    inv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert();

    r.setRenderTarget(this.sceneRT);
    r.setClearColor(FOG3, 1); r.clear();
    r.render(this.scene, cam);

    // bloom: bright pass at quarter res, two separable blur iterations, then composite to screen
    const { x: w, y: h } = this.size, A = this.bloomA, B = this.bloomB;
    const bu = (this.brightQ.material as THREE.ShaderMaterial).uniforms;
    bu.uSrc.value = this.sceneRT.texture; bu.uPx.value.set(1 / w, 1 / h);
    r.setRenderTarget(A); this.brightQ.render(r);
    const blur = this.blurQ.material as THREE.ShaderMaterial;
    for (const k of [1, 2.2]) {
      blur.uniforms.uSrc.value = A.texture; blur.uniforms.uDir.value.set(k / A.width, 0);
      r.setRenderTarget(B); this.blurQ.render(r);
      blur.uniforms.uSrc.value = B.texture; blur.uniforms.uDir.value.set(0, k / A.height);
      r.setRenderTarget(A); this.blurQ.render(r);
    }
    r.setRenderTarget(null);
    this.compQ.render(r);
  }
}

export const finale = new Finale(document.getElementById('gl') as HTMLCanvasElement);
