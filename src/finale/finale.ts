/* =====================================================================
   3D FINALE (Three.js): the real building (celestia-hall.glb) at golden
   hour, a satin drape falling over it, soft shadows and bloom.
   ===================================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { D2R, clamp, easeInOut, lerp, sstep, R, seed } from '../util';
import { renderer, glSize, maxAniso } from '../three/renderer';
import { view, clock } from '../view';
import { MODEL_URL, DRAPE_RGB } from '../config';
import { buildDrapeGeometry, buildDrapeCanvas } from './drape';
import * as S from './shaders';

const SUN3 = new THREE.Vector3(0.8, 0.075, -0.6).normalize();     // setting sun, low behind the building on the right
const FOG3 = new THREE.Color(0.86, 0.58, 0.46);
const EXPOSURE = 0.95;
const SHN = 2048;               // shadow map size
const VFOV = 45;                // degrees
const BLOOM_K = 0.85;

/* camera path: p, elevation, azimuth (0 = straight in front, negative = from the left), distance, target height */
const CAMK = [
  [.700, 89.0, -18, 330, 6],
  [.748, 88.5, -18, 235, 6],
  [.805, 50.0, -30, 172, 10],
  [.866, 12.5, -36, 132, 17],
  [.950, 10.5, -30, 128, 19],
  [1.00, 10.0, -26, 124, 19]];

function camAt(p: number, out: THREE.PerspectiveCamera, time = 0) {
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
  // slow cinematic drift once the drape has settled
  const drift = sstep(.94, 1, p);
  const az2 = az + Math.sin(time * .11) * .05 * drift, el2 = el + Math.sin(time * .07 + 1) * .012 * drift;
  out.position.set(d * Math.cos(el2) * Math.sin(az2), ty + d * Math.sin(el2), 2 + d * Math.cos(el2) * Math.cos(az2));
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
  private size = glSize;
  private lights!: THREE.ShaderMaterial;
  private traffic!: THREE.ShaderMaterial;

  /** @param fogTex cloud sprites (from the cloud generator) reused for the low evening fog */
  async start(fogTex: THREE.Texture[]) {
    try {
      const aniso = maxAniso;

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

      this.addCityLights();
      this.addFog(fogTex);

      // bloom passes
      this.brightQ = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: S.POST_VS, fragmentShader: S.BRIGHT_FS, uniforms: { uSrc: { value: null }, uPx: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false }));
      this.blurQ = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: S.POST_VS, fragmentShader: S.BLUR_FS, uniforms: { uSrc: { value: null }, uDir: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false }));
      this.compQ = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: S.POST_VS, fragmentShader: S.COMPOSITE_FS, uniforms: { uScene: { value: this.sceneRT.texture }, uBloom: { value: this.bloomA.texture }, uK: { value: BLOOM_K }, uTime: { value: 0 }, uAspect: { value: 1 }, uSunUV: { value: new THREE.Vector2(2, 2) }, uSunVis: { value: 0 } }, depthTest: false, depthWrite: false }));

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

  /** Warm city lights on the ground around the site, denser along a few long roads. */
  private addCityLights() {
    seed(31);
    const pos: number[] = [], col: number[] = [], sz: number[] = [];
    const add = (x: number, z: number, warm: number, s: number) => {
      if (Math.abs(x) < 75 && z > -45 && z < 60) return;               // keep the compound itself dark
      pos.push(x, 0.6 + R() * 2, z);
      const w = warm > .5;
      col.push(1, w ? .62 + R() * .15 : .9, w ? .28 + R() * .15 : .78);
      sz.push(s);
    };
    // scattered homes and streets, denser towards the city side
    for (let i = 0; i < 5200; i++) {
      const r = 90 + Math.pow(R(), .7) * 1250, a = R() * Math.PI * 2;
      add(Math.cos(a) * r, Math.sin(a) * r, R(), 2.2 + R() * 3.5);
    }
    // a few long roads lined with lights (and traffic)
    const roads: number[][] = [];
    for (let k = 0; k < 16; k++) {
      const a = R() * Math.PI, o = (R() - .5) * 1100, len = 1400;
      const dx = Math.cos(a), dz = Math.sin(a), nx = -dz, nz = dx;
      for (let t = -len / 2; t < len / 2; t += 9 + R() * 4) add(dx * t + nx * o, dz * t + nz * o, .9, 3 + R() * 2);
      roads.push([dx * 0 + nx * o, nz * o, dx, dz, nx, nz, len]);
    }
    this.addTraffic(roads);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(sz, 1));
    this.lights = new THREE.ShaderMaterial({
      vertexShader: S.LIGHTS_VS, fragmentShader: S.LIGHTS_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: { uTime: { value: 0 }, uScale: { value: 500 } },
    });
    const pts = new THREE.Points(g, this.lights);
    pts.frustumCulled = false; pts.renderOrder = 4;
    this.scene.add(pts); this.receiversOnly.push(pts);
  }

  /** Cars on the roads: white headlights one way, red tail lights the other. */
  private addTraffic(roads: number[][]) {
    seed(73);
    const pos: number[] = [], dir: number[] = [], mv: number[] = [], col: number[] = [];
    for (const [ox, oz, dx, dz, nx, nz, len] of roads) {
      for (let i = 0; i < 26; i++) {
        const lane = R() < .5 ? 1 : -1, speed = (9 + R() * 8) * lane;
        pos.push(ox + nx * lane * 3.5, 1.2, oz + nz * lane * 3.5);
        dir.push(dx, 0, dz);
        mv.push(R() * len, speed, len);
        if (lane > 0) col.push(1, .93, .8); else col.push(1, .18, .1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 3));
    g.setAttribute('aMove', new THREE.Float32BufferAttribute(mv, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.traffic = new THREE.ShaderMaterial({
      vertexShader: S.TRAFFIC_VS, fragmentShader: S.LIGHTS_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: { uTime: { value: 0 }, uScale: { value: 500 } },
    });
    const pts = new THREE.Points(g, this.traffic);
    pts.frustumCulled = false; pts.renderOrder = 4;
    this.scene.add(pts); this.receiversOnly.push(pts);
  }

  /** Low evening fog banks drifting around the site (thickest on the left, like a river valley). */
  private addFog(tex: THREE.Texture[]) {
    seed(57);
    for (let i = 0; i < 46; i++) {
      const left = R() < .65;
      const a = left ? Math.PI * (.55 + R() * .8) : R() * Math.PI * 2;
      const r = 140 + R() * 900;
      const m = new THREE.SpriteMaterial({ map: tex[i % tex.length], color: new THREE.Color(1.3, 1.05, .95), transparent: true, opacity: .2 + R() * .16, depthWrite: false });
      const sp = new THREE.Sprite(m);
      sp.position.set(Math.cos(a) * r, 6 + R() * 18, Math.sin(a) * r);
      const w = 160 + R() * 260; sp.scale.set(w, w * .32, 1);
      sp.renderOrder = 5;
      this.scene.add(sp); this.receiversOnly.push(sp);
    }
  }

  resize() {
    if (!this.sceneRT) return;
    const w = this.size.x, h = this.size.y, qw = Math.max(2, w >> 2), qh = Math.max(2, h >> 2);
    this.sceneRT.setSize(w, h); this.bloomA.setSize(qw, qh); this.bloomB.setSize(qw, qh);
  }

  private drawShadowMap() {
    const r = renderer;
    for (const o of this.receiversOnly) o.visible = false;
    for (const c of this.casters) c.mesh.material = c.mesh === this.drape ? this.drapeDepth : this.meshDepth;
    r.setRenderTarget(this.shadowRT);
    r.setClearColor(0xffffff, 1); r.clear();
    r.render(this.scene, this.lightCam);
    for (const c of this.casters) c.mesh.material = c.main;
    for (const o of this.receiversOnly) o.visible = true;
  }

  draw(p: number) {
    const r = renderer;
    const fall = clamp((p - .87) / (.95 - .87), 0, 1);
    shared.uTime.value = clock.time; shared.uFall.value = fall;
    this.lights.uniforms.uTime.value = clock.time;
    this.lights.uniforms.uScale.value = this.size.y / (2 * Math.tan(VFOV * D2R / 2));
    this.traffic.uniforms.uTime.value = clock.time;
    this.traffic.uniforms.uScale.value = this.lights.uniforms.uScale.value;
    this.drape.visible = fall > 0;
    if (fall !== this.shFall || (fall > 0 && fall < 1)) { this.drawShadowMap(); this.shFall = fall; }

    const cam = this.camera;
    cam.aspect = this.size.x / this.size.y; cam.updateProjectionMatrix();
    camAt(p, cam, clock.time); cam.updateMatrixWorld();
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
    for (const k of [1, 2.2, 4]) {
      blur.uniforms.uSrc.value = A.texture; blur.uniforms.uDir.value.set(k / A.width, 0);
      r.setRenderTarget(B); this.blurQ.render(r);
      blur.uniforms.uSrc.value = B.texture; blur.uniforms.uDir.value.set(0, k / A.height);
      r.setRenderTarget(A); this.blurQ.render(r);
    }
    // sun position on screen for the glare
    const cu = (this.compQ.material as THREE.ShaderMaterial).uniforms;
    const sp = SUN3.clone().multiplyScalar(2000).add(cam.position).project(cam);
    cu.uSunUV.value.set(sp.x * .5 + .5, sp.y * .5 + .5);
    cu.uSunVis.value = sp.z < 1 ? 1 - sstep(.9, 1.6, Math.max(Math.abs(sp.x), Math.abs(sp.y))) : 0;
    cu.uTime.value = clock.time; cu.uAspect.value = w / h;
    r.setRenderTarget(null);
    this.compQ.render(r);
  }
}

export const finale = new Finale();
