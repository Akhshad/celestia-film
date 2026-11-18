/* =====================================================================
   SPACE (Three.js): textured solar system → realistic Earth → satellite dive to the site.
   Driven by the same log-zoom L as the 2D journey, so framing matches the timeline.
   ===================================================================== */
import * as THREE from 'three';
import { renderer, loadTex, maxAniso } from '../three/renderer';
import { view, clock } from '../view';
import { LK, rotAt, scale } from '../timeline';
import { SITE } from '../config';
import { sstep, mk, ctx2d } from '../util';
import { BASIC_VS, PLANET_FS, RING_FS, SUN_FS, EARTH_FS, ATMO_FS } from './shaders';
import { SatelliteTiles, geoDir } from './tiles';

const FOV = 45, TANH = Math.tan(FOV / 2 * Math.PI / 180);
const RE = 0.0075, RSUN = 0.035;
const EL = Math.asin(0.42);                 // camera elevation above the orbital plane
const AZ_OFF = -1.15;                      // camera azimuth relative to Earth's orbit: approach from the side, not past the Sun

// orbit radius, planet radius, texture, phase, speed (rad/s)
const PLANETS: [number, number, string, number, number][] = [
  [.10, .0055, 'mercury', 2.1, .04], [.15, .0085, 'venus', 4.0, .03], [.21, RE, 'earth', .62, .012],
  [.28, .0065, 'mars', 5.2, .015], [.45, .026, 'jupiter', 3.1, .0075], [.60, .021, 'saturn', 1.25, .0055],
  [.78, .013, 'uranus', 4.6, .004], [.95, .013, 'neptune', 2.5, .003]];

function glowTexture() {
  const c = mk(256, 256), g = ctx2d(c), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,246,225,1)'); gr.addColorStop(.12, 'rgba(255,214,150,.75)');
  gr.addColorStop(.35, 'rgba(255,160,70,.18)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}

export class Space {
  ready = false;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 1e-6, 10);
  readonly tiles: SatelliteTiles;
  private shared = { uCam: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3(1, 0, 0) }, uA: { value: 1 }, uTime: { value: 0 } };
  private sysA = { value: 1 };              // fade for the Sun, other planets and orbits
  private planets: { mesh: THREE.Mesh; orbit: number; phase: number; speed: number }[] = [];
  private orbits: THREE.LineBasicMaterial[] = [];
  private sunGlow!: THREE.Sprite;
  private earth = new THREE.Group();
  private earthMat!: THREE.ShaderMaterial;
  private atmo!: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private v = new THREE.Vector3();
  private earthPos = new THREE.Vector3();
  /** screen px per radian of arc at the site, for the tile levels */
  private pxPerRad = 0;

  constructor() {
    this.tiles = new SatelliteTiles(SITE[0], SITE[1], RE, this.shared);
  }

  async start() {
    const names = ['sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'earth_day', 'earth_night', 'earth_clouds', 'earth_spec', 'earth_india'];
    const [tex, ring] = await Promise.all([
      Promise.all(names.map(n => loadTex(`textures/${n}.jpg`))).then(ts => Object.fromEntries(names.map((n, i) => [n, ts[i]]))),
      loadTex('textures/saturn_ring.png'),
    ]);
    tex.earth_clouds.wrapS = THREE.RepeatWrapping;

    // Sun
    const sun = new THREE.Mesh(new THREE.SphereGeometry(RSUN, 64, 32), new THREE.ShaderMaterial({
      vertexShader: BASIC_VS, fragmentShader: SUN_FS,
      uniforms: { uTex: { value: tex.sun }, uA: this.sysA, uTime: this.shared.uTime, uCam: this.shared.uCam },
    }));
    this.scene.add(sun);
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.sunGlow.scale.setScalar(RSUN * 13);
    this.scene.add(this.sunGlow);

    // planets + orbits
    for (const [orbit, r, name, phase, speed] of PLANETS) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 256; i++) { const a = i / 256 * Math.PI * 2; pts.push(new THREE.Vector3(orbit * Math.cos(a), 0, orbit * Math.sin(a))); }
      const om = new THREE.LineBasicMaterial({ color: 0xd9b878, transparent: true, opacity: .22, depthWrite: false });
      this.orbits.push(om);
      this.scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), om));
      if (name === 'earth') { this.planets.push({ mesh: this.earth as unknown as THREE.Mesh, orbit, phase, speed }); continue; }
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 24), new THREE.ShaderMaterial({
        vertexShader: BASIC_VS, fragmentShader: PLANET_FS,
        uniforms: { uTex: { value: tex[name] }, uA: this.sysA, uCam: this.shared.uCam },
      }));
      mesh.rotation.z = name === 'uranus' ? 1.7 : 0.1;
      if (name === 'saturn') {
        const rg = new THREE.RingGeometry(r * 1.25, r * 2.3, 128, 1);
        const p = rg.attributes.position, uvA = rg.attributes.uv;
        for (let i = 0; i < p.count; i++) uvA.setXY(i, (Math.hypot(p.getX(i), p.getY(i)) - r * 1.25) / (r * 1.05), .5);
        const rm = new THREE.Mesh(rg, new THREE.ShaderMaterial({
          vertexShader: BASIC_VS, fragmentShader: RING_FS, transparent: true, side: THREE.DoubleSide, depthWrite: false,
          uniforms: { uTex: { value: ring }, uA: this.sysA },
        }));
        rm.rotation.x = -Math.PI / 2 + 0.45;
        mesh.add(rm);
      }
      this.scene.add(mesh);
      this.planets.push({ mesh, orbit, phase, speed });
    }

    // Earth
    this.earthMat = new THREE.ShaderMaterial({
      vertexShader: BASIC_VS, fragmentShader: EARTH_FS,
      uniforms: {
        uDay: { value: tex.earth_day }, uNight: { value: tex.earth_night }, uClouds: { value: tex.earth_clouds },
        uSpec: { value: tex.earth_spec }, uIndia: { value: tex.earth_india },
        uSunDir: this.shared.uSunDir, uCam: this.shared.uCam, uA: this.shared.uA,
        uCloudA: { value: 1 }, uCloudShift: { value: 0 },
      },
    });
    this.earth.add(new THREE.Mesh(new THREE.SphereGeometry(RE, 256, 128), this.earthMat));
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(RE * 1.028, 128, 64), new THREE.ShaderMaterial({
      vertexShader: BASIC_VS, fragmentShader: ATMO_FS, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      uniforms: { uSunDir: this.shared.uSunDir, uCam: this.shared.uCam, uA: { value: 1 } },
    }));
    this.earth.add(this.atmo);
    this.earth.add(this.tiles.group);
    this.scene.add(this.earth);
    for (const t of Object.values(tex)) t.anisotropy = maxAniso;

    renderer.compile(this.scene, this.camera);
    this.ready = true;
  }

  /** Lay out the scene for log-zoom L and render it. */
  render(L: number) {
    const { W, H } = view;
    const t = clock.time;
    this.shared.uTime.value = t;

    // orbits
    let theta = 0;
    for (const P of this.planets) {
      const a = P.phase + t * P.speed;
      P.mesh.position.set(P.orbit * Math.cos(a), 0, P.orbit * Math.sin(a));
      if (P.mesh === (this.earth as unknown)) theta = a;
      else P.mesh.rotation.y = t * 0.15;
    }
    this.earthPos.copy(this.earth.position);

    // fades (same windows as the 2D version)
    const sysA = sstep(LK.sun - .7, LK.sun + .45, L) * (1 - sstep(LK.earth + .25, LK.earth + 1.7, L));
    this.sysA.value = sysA;
    this.shared.uA.value = sstep(LK.sun - .7, LK.sun + .45, L);
    for (const om of this.orbits) om.opacity = .22 * sysA;
    (this.sunGlow.material as THREE.SpriteMaterial).opacity = sysA;

    // camera: frame "S px per unit" at the focus, sliding from the Sun to Earth
    const e = sstep(LK.sys + .3, LK.earth - .08, L);
    const S = scale.KS * Math.exp(L);
    const h = H / (2 * TANH * S);                         // distance that gives S px per unit
    const D = h + RE * e;                                 // above Earth's surface once focused on it
    const psi = theta + AZ_OFF;
    const v = this.v.set(Math.cos(EL) * Math.cos(psi), Math.sin(EL), Math.cos(EL) * Math.sin(psi));
    const focus = this.earthPos.clone().multiplyScalar(e);
    const cam = this.camera;
    cam.position.copy(focus).addScaledVector(v, D);
    cam.up.set(0, 1, 0); cam.lookAt(focus);
    cam.aspect = W / H;
    cam.near = Math.max(1e-8, (D - RE * e) * 0.08);
    cam.far = D + 3;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    this.shared.uCam.value.copy(cam.position);
    // light on Earth: the real Sun direction while Earth is small, then a flattering key light from the upper left
    const real = this.earthPos.clone().negate().normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), v).normalize();
    const key = v.clone().multiplyScalar(.62).addScaledVector(right, -.62).add(new THREE.Vector3(0, .48, 0)).normalize();
    this.shared.uSunDir.value.copy(real).lerp(key, sstep(LK.earth - .6, LK.earth + .9, L)).normalize();

    // Earth orientation: the geo point rotAt(L) faces the camera with north up
    const [lam, phi] = rotAt(L);
    const nE = geoDir(lam, phi);
    const northE = new THREE.Vector3(-Math.sin(phi * Math.PI / 180) * Math.cos(lam * Math.PI / 180), Math.cos(phi * Math.PI / 180), Math.sin(phi * Math.PI / 180) * Math.sin(lam * Math.PI / 180));
    const eastE = new THREE.Vector3().crossVectors(northE, nE);
    const upW = new THREE.Vector3(0, 1, 0).addScaledVector(v, -v.y).normalize();
    const eastW = new THREE.Vector3().crossVectors(upW, v);
    const Bw = new THREE.Matrix4().makeBasis(eastW, upW, v);
    const Be = new THREE.Matrix4().makeBasis(eastE, northE, nE);
    this.earth.quaternion.setFromRotationMatrix(Bw.multiply(Be.transpose()));
    this.earth.updateMatrixWorld();

    // close to the surface: drop the cloud layer and the atmosphere shell, bring in satellite tiles
    const alt = (D - RE * e) / RE;                        // altitude in Earth radii (when focused)
    this.earthMat.uniforms.uCloudA.value = sstep(.05, .35, alt);
    this.earthMat.uniforms.uCloudShift.value = t * 0.0015;
    this.atmo.material.uniforms.uA.value = sstep(.04, .2, alt);
    this.pxPerRad = e > .99 ? RE * H / (2 * TANH * Math.max(1e-9, D - RE)) : 0;
    this.tiles.update(this.pxPerRad);

    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 1); renderer.clear();
    renderer.render(this.scene, cam);
  }

  /** Project a lon/lat on Earth to 2D-canvas px. Returns null when it is on the far side. */
  project(lon: number, lat: number): [number, number] | null {
    const n = geoDir(lon, lat).applyQuaternion(this.earth.quaternion);
    const p = n.clone().multiplyScalar(RE).add(this.earth.position);
    if (n.dot(this.camera.position.clone().sub(p)) <= 0) return null;
    p.project(this.camera);
    if (p.z > 1) return null;
    return [(p.x + 1) / 2 * view.W, (1 - p.y) / 2 * view.H];
  }
}

export const space = new Space();
