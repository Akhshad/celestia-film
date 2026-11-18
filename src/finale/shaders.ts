/* GLSL for the 3D finale. Written for THREE.ShaderMaterial, which injects
   position / normal / uv, modelMatrix / viewMatrix / projectionMatrix and
   maps GLSL1 keywords (attribute, varying, texture2D, gl_FragColor) to WebGL2. */

/** Golden-hour sky gradient, value noise and ACES tone curve, shared by every pass. */
const SKYFN = /* glsl */ `
uniform vec3 uSun;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 skyCol(vec3 d){
  vec2 hs = normalize(uSun.xz);
  vec2 hd = d.xz / max(length(d.xz), 1e-4);
  float toward = 0.5 + 0.5 * dot(hd, hs);
  vec3 zen = vec3(0.05, 0.09, 0.30);
  vec3 mid = mix(vec3(0.26, 0.29, 0.62), vec3(0.85, 0.42, 0.40), toward * toward);
  vec3 hor = mix(vec3(0.78, 0.50, 0.55), vec3(1.55, 0.62, 0.17), pow(toward, 2.0));
  float h = max(d.y, 0.0);
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.11, h));
  c = mix(c, zen, smoothstep(0.08, 0.6, h));
  float s = max(dot(d, uSun), 0.0);
  c += vec3(1.7, 0.8, 0.3) * (pow(s, 9.0) * 0.32 + pow(s, 70.0) * 0.9);
  c += vec3(3.2, 2.3, 1.4) * smoothstep(0.99935, 0.99965, s);       // the sun's disk on the horizon
  return c;
}
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
`;

/* ---------- building + ground ---------- */
export const MESH_VS = /* glsl */ `
uniform mat4 uLVP;
varying vec3 vW; varying vec3 vN; varying vec2 vT; varying vec4 vLS;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vT = uv;
  vLS = uLVP * vec4(vW + vN * 0.22, 1.0);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const MESH_FS = /* glsl */ `
uniform sampler2D uTex, uShadow; uniform vec3 uCam; uniform float uMode, uExp, uMetal, uShOK; uniform vec2 uShTexel;
varying vec3 vW; varying vec3 vN; varying vec2 vT; varying vec4 vLS;
${SKYFN}
float unpackD(vec4 c){ return dot(c, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0)); }
float shadowAt(){
  if (uShOK < 0.5) return 1.0;
  vec3 p = vLS.xyz / vLS.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float s = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
    float d = unpackD(texture2D(uShadow, p.xy + vec2(float(i), float(j)) * uShTexel));
    s += (p.z - 0.0004 > d) ? 0.0 : 1.0;
  }
  return s / 9.0;
}
void main(){
  vec3 b = texture2D(uTex, vT).rgb;
  vec3 V = normalize(uCam - vW);
  float sh = shadowAt();
  vec3 SUNC = vec3(1.0, 0.68, 0.40) * 1.75;
  vec3 c;
  if (uMode > 0.5 && uMode < 1.5) {
    vec3 g = pow(b, vec3(1.18)) * vec3(1.04, 0.95, 0.88);           // dusk grade on the drone photo
    g = mix(vec3(dot(g, vec3(0.3, 0.59, 0.11))), g, 0.75);
    c = g * (vec3(0.26, 0.25, 0.36) + SUNC * max(uSun.y, 0.0) * sh * 2.6);
  } else {
    vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
    float d = max(dot(N, uSun), 0.0) * sh;
    vec3 amb = mix(vec3(0.34, 0.24, 0.21), vec3(0.34, 0.37, 0.60), 0.5 + 0.5 * N.y);
    vec3 R = reflect(-V, N);
    vec3 env = R.y > 0.0 ? skyCol(R) : mix(vec3(0.42, 0.30, 0.24), vec3(0.20, 0.16, 0.15), clamp(-R.y * 3.0, 0.0, 1.0));
    float nh = max(dot(N, normalize(uSun + V)), 0.0);
    if (uMetal > 0.5) {
      // polished champagne gold
      float fr = 0.65 + 0.35 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
      c = b * (amb * 0.35 + SUNC * d * 0.55) + b * env * fr * 0.9 + vec3(1.0, 0.82, 0.55) * pow(nh, 70.0) * 2.4 * sh;
    } else {
      c = b * (amb + SUNC * d);
      if (uMode > 1.5) {
        // realistic foliage: clumpy dark greens, sunlit tips and warm light glowing through the leaves
        float n = vnoise(vW.xz * 1.4 + vW.y * 2.1) * 0.65 + vnoise(vW.xz * 5.0 + vW.y * 4.0) * 0.35;
        vec3 leaf = mix(vec3(0.03, 0.06, 0.025), vec3(0.11, 0.17, 0.05), n);
        float clump = smoothstep(0.35, 0.75, n);
        c = leaf * (amb * 0.9 + SUNC * max(dot(N, uSun) * 0.6 + 0.4, 0.0) * sh * 0.8 * (0.5 + clump));
        c += vec3(1.0, 0.62, 0.22) * leaf * 1.6 * pow(max(dot(-V, uSun), 0.0), 6.0) * (1.0 - clump * 0.6);
        c += vec3(1.0, 0.55, 0.25) * pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.05 * sh;
      }
      c *= mix(0.55, 1.0, smoothstep(0.0, 7.0, vW.y));                // contact shadow near the ground
      float lum = dot(b, vec3(0.3, 0.59, 0.11));
      float glass = smoothstep(0.03, 0.10, b.b - b.r) * (1.0 - smoothstep(0.3, 0.55, lum));
      float fr = 0.25 + 0.75 * pow(1.0 - max(dot(N, V), 0.0), 3.0);
      c = mix(c, env * 0.85, glass * fr * 0.9);
      c += vec3(1.0, 0.85, 0.65) * pow(nh, 140.0) * 3.0 * sh * glass;
      glass *= step(uMode, 1.5);                                        // leaves are never glass
      float em = smoothstep(0.16, 0.30, b.r - b.b) * smoothstep(0.55, 0.8, b.r) * (1.0 - glass) * step(uMode, 1.5);
      c += vec3(1.0, 0.58, 0.24) * em * 2.4;
      c += vec3(1.0, 0.64, 0.30) * glass * 0.5;                    // lit interiors at dusk
    }
  }
  vec3 dv = vW - uCam;
  float f = max(smoothstep(190.0, 820.0, length(vW.xz)) * 0.92, smoothstep(380.0, 1500.0, length(dv)) * 0.45);
  c = mix(c, skyCol(normalize(vec3(dv.x, 0.03, dv.z))), f);
  gl_FragColor = vec4(aces(c * uExp), 1.0);
}`;

/* ---------- sky (full-screen triangle at the far plane) ---------- */
export const SKY_VS = /* glsl */ `
varying vec2 vP;
void main(){ vP = position.xy; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;

export const SKY_FS = /* glsl */ `
uniform mat4 uInv; uniform vec3 uCam; uniform float uExp; varying vec2 vP;
${SKYFN}
void main(){
  vec4 w = uInv * vec4(vP, 1.0, 1.0);
  vec3 d = normalize(w.xyz / w.w - uCam);
  vec3 c = skyCol(d);
  // thin evening cloud streaks near the horizon
  float y = d.y;
  vec2 hd = d.xz / max(length(d.xz), 1e-4);
  float toward = 0.5 + 0.5 * dot(hd, normalize(uSun.xz));
  float n = vnoise(vec2(hd.x * 9.0 + 3.0, y * 62.0 + hd.y * 9.0)) * 0.62 + vnoise(vec2(hd.x * 23.0, y * 150.0 + hd.y * 23.0)) * 0.38;
  float band = smoothstep(0.52, 0.82, n) * smoothstep(0.012, 0.05, y) * (1.0 - smoothstep(0.11, 0.24, y));
  vec3 cc = mix(vec3(0.46, 0.34, 0.48), vec3(1.55, 0.80, 0.42), toward * toward);
  c = mix(c, cc, band * 0.8);
  c += (hash(gl_FragCoord.xy) - 0.5) / 120.0;
  gl_FragColor = vec4(aces(c * uExp), 1.0);
}`;

/* ---------- satin drape: falls from aI (start) to position (final) ---------- */
export const DRAPE_VS = /* glsl */ `
attribute vec3 aI; attribute vec3 aQ;
uniform float uFall, uTime;
varying vec3 vW; varying vec3 vN; varying vec2 vT; varying vec3 vQ;
void main(){
  float v = max(aQ.x, 0.0);
  float tl = clamp((uFall - 0.3 * v) / 0.7, 0.0, 1.0);
  float e = 1.0 - pow(1.0 - tl, 3.0);
  vec3 p = mix(aI, position, e);
  float fl = 1.0 - e;
  p.y += fl * 3.2 * sin(aQ.y * 0.35 + uTime * 2.3 + v * 4.0);
  p.y += fl * fl * 2.5 * sin(position.x * 0.12 + uTime * 1.7) * sin(position.z * 0.15 - uTime * 1.3);
  p.xz += normal.xz * (0.07 * v * sin(uTime * 1.2 + aQ.y * 0.4)) * e;
  vN = normalize(mix(vec3(0.0, 1.0, 0.0), normal, e));
  vW = p; vT = uv; vQ = aQ;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

export const DRAPE_FS = /* glsl */ `
uniform sampler2D uTex; uniform vec3 uCam, uBase; uniform vec2 uTexel; uniform float uExp;
varying vec3 vW; varying vec3 vN; varying vec2 vT; varying vec3 vQ;
${SKYFN}
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vW);
  if (dot(N, V) < 0.0) N = -N;
  vec3 H = normalize(uSun + V);
  vec3 SUNC = vec3(1.0, 0.68, 0.40) * 1.75;
  float d = max(dot(N, uSun), 0.0), nh = max(dot(N, H), 0.0);
  float fr = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 amb = mix(vec3(0.24, 0.19, 0.18), vec3(0.32, 0.36, 0.56), 0.5 + 0.5 * N.y);
  vec3 c = uBase * (amb * 1.1 + SUNC * d * 0.9) + vec3(1.0, 0.66, 0.50) * (pow(nh, 90.0) * 0.75 + pow(nh, 18.0) * 0.07) * (0.4 + 0.6 * d) + skyCol(reflect(-V, N)) * fr * 0.18;
  float hem = smoothstep(0.952, 0.962, vQ.x);
  float ta = texture2D(uTex, vT).a;
  float tx = texture2D(uTex, vT + vec2(uTexel.x, 0.0)).a - texture2D(uTex, vT - vec2(uTexel.x, 0.0)).a;
  float ty = texture2D(uTex, vT + vec2(0.0, uTexel.y)).a - texture2D(uTex, vT - vec2(0.0, uTexel.y)).a;
  vec3 Ng = normalize(N + vec3(-tx, ty, 0.0) * 0.9);
  float dg = max(dot(Ng, uSun), 0.0), ng = max(dot(Ng, H), 0.0);
  vec3 gold = vec3(0.86, 0.64, 0.30) * (amb * 1.4 + SUNC * dg * 0.8) + vec3(1.4, 1.1, 0.7) * pow(ng, 26.0);
  c = mix(c, gold, max(hem, ta));
  vec3 dv = vW - uCam;
  float f = smoothstep(380.0, 1500.0, length(dv)) * 0.45;
  c = mix(c, skyCol(normalize(vec3(dv.x, 0.03, dv.z))), f);
  gl_FragColor = vec4(aces(c * uExp), 1.0);
}`;

/* ---------- shadow map (depth packed into RGBA8) ---------- */
export const DEPTH_VS = /* glsl */ `
void main(){ gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`;

export const DEPTH_FS = /* glsl */ `
void main(){
  vec4 e = fract(vec4(1.0, 255.0, 65025.0, 16581375.0) * gl_FragCoord.z);
  e -= e.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);
  gl_FragColor = e;
}`;

/* ---------- bloom ---------- */
export const POST_VS = /* glsl */ `
varying vec2 vU;
void main(){ vU = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export const BRIGHT_FS = /* glsl */ `
uniform sampler2D uSrc; uniform vec2 uPx; varying vec2 vU;
void main(){
  vec3 c = (texture2D(uSrc, vU + uPx * vec2(-1.0, -1.0)).rgb + texture2D(uSrc, vU + uPx * vec2(1.0, -1.0)).rgb
          + texture2D(uSrc, vU + uPx * vec2(-1.0, 1.0)).rgb + texture2D(uSrc, vU + uPx * vec2(1.0, 1.0)).rgb) * 0.25;
  float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * smoothstep(0.74, 1.0, l), 1.0);
}`;

export const BLUR_FS = /* glsl */ `
uniform sampler2D uSrc; uniform vec2 uDir; varying vec2 vU;
void main(){
  vec3 c = texture2D(uSrc, vU).rgb * 0.227;
  c += (texture2D(uSrc, vU + uDir * 1.385).rgb + texture2D(uSrc, vU - uDir * 1.385).rgb) * 0.316;
  c += (texture2D(uSrc, vU + uDir * 3.231).rgb + texture2D(uSrc, vU - uDir * 3.231).rgb) * 0.070;
  gl_FragColor = vec4(c, 1.0);
}`;

/** Scene + bloom, then a cinematic finish: anamorphic glare, teal/orange grade, colour fringing, grain. */
export const COMPOSITE_FS = /* glsl */ `
uniform sampler2D uScene, uBloom; uniform float uK, uTime, uAspect; uniform vec2 uSunUV; uniform float uSunVis;
varying vec2 vU;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 d = vU - 0.5;
  float r2 = dot(d * vec2(uAspect, 1.0), d * vec2(uAspect, 1.0));
  // slight chromatic aberration towards the frame edges
  vec2 ca = d * 0.0035 * r2 * 2.2;
  vec3 c = vec3(texture2D(uScene, vU + ca).r, texture2D(uScene, vU).g, texture2D(uScene, vU - ca).b);
  vec3 b = texture2D(uBloom, vU).rgb;
  // anamorphic streak: stretch the bloom horizontally
  vec3 st = vec3(0.0);
  for (int i = 1; i <= 6; i++) {
    float o = float(i) * float(i) * 0.012;
    st += (texture2D(uBloom, vU + vec2(o, 0.0)).rgb + texture2D(uBloom, vU - vec2(o, 0.0)).rgb) / float(i);
  }
  c += b * uK + st * vec3(0.55, 0.62, 1.0) * 0.16;
  // sun glare and soft veil
  vec2 sd = (vU - uSunUV) * vec2(uAspect, 1.0);
  float sl = length(sd);
  c += vec3(1.0, 0.72, 0.38) * (exp(-sl * 5.0) * 0.3 + exp(-sl * 1.6) * 0.06) * uSunVis;
  c += vec3(1.0, 0.85, 0.6) * exp(-abs(sd.y) * 60.0) * exp(-abs(sd.x) * 1.8) * 0.25 * uSunVis;
  c = min(c, 1.4);
  // grade: punchy contrast, richer colour, teal shadows / amber highlights
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(lum), c, 1.22);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.45);
  lum = dot(c, vec3(0.299, 0.587, 0.114));
  c += (1.0 - lum) * (1.0 - lum) * vec3(-0.035, 0.012, 0.045);
  c += lum * lum * vec3(0.05, 0.012, -0.045);
  c = max(c, vec3(0.012, 0.018, 0.026));
  // vignette + film grain
  c *= 1.0 - r2 * 0.42;
  c += (hash(vU * 913.7 + fract(uTime * 7.31)) - 0.5) * 0.045;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

/* ---------- city lights (points, additive) ---------- */
export const LIGHTS_VS = /* glsl */ `
attribute float aSize; uniform float uTime, uScale;
varying vec3 vC; varying float vF;
void main(){
  vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
  float tw = 0.75 + 0.25 * sin(uTime * 2.0 + position.x * 0.37 + position.z * 0.21);
  vC = color * tw;
  float dist = -mv.z;
  vF = 1.0 - smoothstep(500.0, 1500.0, dist) * 0.85;
  gl_PointSize = clamp(aSize * uScale / dist, 1.5, 9.0);
  gl_Position = projectionMatrix * mv;
}`;
export const LIGHTS_FS = /* glsl */ `
varying vec3 vC; varying float vF;
void main(){
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = dot(q, q);
  float a = exp(-r * 5.0) + exp(-r * 40.0);
  gl_FragColor = vec4(vC * a * vF * 0.9, 1.0);
}`;

/* ---------- moving traffic (head/tail lights sliding along the roads) ---------- */
export const TRAFFIC_VS = /* glsl */ `
attribute vec3 aDir; attribute vec3 aMove; uniform float uTime, uScale;
varying vec3 vC; varying float vF;
void main(){
  float t = mod(aMove.x + uTime * aMove.y, aMove.z) - aMove.z * 0.5;
  vec4 mv = viewMatrix * vec4(position + aDir * t, 1.0);
  float dist = -mv.z;
  vC = color;
  vF = (1.0 - smoothstep(500.0, 1500.0, dist) * 0.85) * smoothstep(aMove.z * 0.5, aMove.z * 0.4, abs(t));
  gl_PointSize = clamp(4.0 * uScale / dist, 1.5, 8.0);
  gl_Position = projectionMatrix * mv;
}`;
