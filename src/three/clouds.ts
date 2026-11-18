/* Realistic fly-through clouds. Cloud sprites are generated once on the GPU (fBm density with
   self-shadowing toward the sun), then drawn as screen-space billboards with the same motion as before. */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { renderer } from './renderer';
import { view } from '../view';
import { R, gauss, seed, clamp, sstep } from '../util';

const GEN_FS = /* glsl */ `
uniform float uSeed; varying vec2 vU;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float dens(vec2 p){
  vec2 q = p * vec2(0.82, 1.25) + vec2(0.0, 0.12);
  float body = 1.0 - smoothstep(0.25, 1.0, length(q));
  float top = smoothstep(-0.55, 0.25, p.y);                      // billowy top, flatter base
  vec2 o = vec2(uSeed * 7.3, uSeed * 3.1);
  float n = fbm(p * 2.6 + o);
  float w = fbm(p * 5.5 + vec2(n * 1.8) + o * 1.3);
  float d = body * 1.35 + (n - 0.5) * (0.7 + 0.5 * top) + (w - 0.5) * 0.55 - 0.42;
  d *= smoothstep(-0.78, -0.45, p.y);
  return clamp(d, 0.0, 1.0);
}
void main(){
  vec2 p = vU * 2.0 - 1.0;
  float d = dens(p);
  if (d <= 0.001) { gl_FragColor = vec4(0.0); return; }
  vec2 ld = normalize(vec2(-0.5, 0.75));
  float acc = 0.0;
  for (int i = 1; i <= 7; i++) acc += dens(p + ld * 0.045 * float(i));
  float lit = exp(-acc * 0.55);
  float edge = pow(1.0 - smoothstep(0.0, 0.5, d), 2.0);
  vec3 shade = vec3(0.62, 0.66, 0.76);
  vec3 c = mix(shade, vec3(1.0, 0.985, 0.96), lit) + edge * lit * 0.22;
  c *= 0.85 + 0.15 * smoothstep(-0.8, 0.6, p.y);                // darker undersides
  gl_FragColor = vec4(c, smoothstep(0.015, 0.4, d));
}`;
const GEN_VS = /* glsl */ `varying vec2 vU; void main(){ vU = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const SPRITE_VS = /* glsl */ `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SPRITE_FS = /* glsl */ `
uniform sampler2D uTex; uniform float uA; uniform vec3 uTint; varying vec2 vU;
void main(){ vec4 t = texture2D(uTex, vU); gl_FragColor = vec4(t.rgb * uTint, t.a * uA); }`;

interface Cloud { x: number; y: number; z: number; s: number; a: number; k: number; mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> }

export class Clouds {
  readonly textures: THREE.Texture[] = [];
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);
  private clouds: Cloud[] = [];

  constructor() {
    const q = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: GEN_VS, fragmentShader: GEN_FS, uniforms: { uSeed: { value: 0 } } }));
    for (let s = 0; s < 6; s++) {
      const rt = new THREE.WebGLRenderTarget(512, 512, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
      (q.material as THREE.ShaderMaterial).uniforms.uSeed.value = s * 1.618 + .37;
      renderer.setRenderTarget(rt); renderer.setClearColor(0, 0); renderer.clear(); q.render(renderer);
      this.textures.push(rt.texture);
    }
    renderer.setRenderTarget(null);
    q.dispose();

    seed(5);
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 38; i++) {
      const z = .06 + (i / 38) * .96 + (R() - .5) * .03;
      const centre = R() < .22;
      const k = (R() * 6) | 0;
      const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        vertexShader: SPRITE_VS, fragmentShader: SPRITE_FS, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uTex: { value: this.textures[k] }, uA: { value: 0 }, uTint: { value: new THREE.Vector3(1, 1, 1) } },
      }));
      mesh.visible = false;
      this.clouds.push({ x: centre ? gauss() * .25 : (R() - .5) * 2.8, y: centre ? gauss() * .25 : (R() - .5) * 2.8, z, s: (.7 + R() * 1.0) * 1.15, a: .7 + R() * .3, k, mesh });
    }
    this.clouds.sort((a, b) => b.z - a.z);
    this.clouds.forEach((c, i) => { c.mesh.renderOrder = i; this.scene.add(c.mesh); });
  }

  /** Draw over whatever the renderer just drew. @param warm golden-hour tint (3D finale follows) */
  render(p: number, warm3D: boolean) {
    const { W, H, CX, CY, MAX } = view;
    const gA = sstep(.675, .695, p) * (1 - sstep(.765, .80, p));
    if (gA <= 0) return;
    const camZ = clamp((p - .675) / (.805 - .675), 0, 1) * 1.04;
    const night = 1 - sstep(.70, .735, p);
    const warm = warm3D ? sstep(.70, .75, p) : 0;
    const tint = [1.06 - .08 * night + .04 * warm, 1.04 - .08 * night - .08 * warm, 1.02 - .05 * night - .2 * warm];
    let any = false;
    for (const c of this.clouds) {
      const m = c.mesh; m.visible = false;
      const dz = c.z - camZ; if (dz <= .004) continue;
      const k = .2 / dz, sz = c.s * k * MAX;
      if (sz > 3.4 * MAX) continue;
      const x = CX + c.x * k * MAX * .5, y = CY + c.y * k * MAX * .5;
      if (x + sz / 2 < 0 || x - sz / 2 > W || y + sz / 2 < 0 || y - sz / 2 > H) continue;
      const a = gA * c.a * .9 * sstep(0, .09, dz) * (1 - sstep(.7, 1.05, dz)) * (1 - sstep(2.3 * MAX, 3.4 * MAX, sz));
      if (a <= 0) continue;
      m.visible = true; any = true;
      m.position.set(x, y, 0); m.scale.set(sz, -sz * .75, 1);
      m.material.uniforms.uA.value = a;
      m.material.uniforms.uTint.value.set(tint[0], tint[1], tint[2]);
    }
    if (!any) return;
    this.cam.right = W; this.cam.bottom = H; this.cam.updateProjectionMatrix();
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.cam);
  }
}
