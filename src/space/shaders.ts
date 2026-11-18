/* Shaders for the solar system and Earth (THREE.ShaderMaterial, GLSL1 style). */

export const BASIC_VS = /* glsl */ `
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

/** Planet lit by the Sun at the origin. */
export const PLANET_FS = /* glsl */ `
uniform sampler2D uTex; uniform float uA; uniform vec3 uCam;
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main(){
  vec3 N = normalize(vN), L = normalize(-vW), V = normalize(uCam - vW);
  float d = max(dot(N, L), 0.0);
  vec3 c = texture2D(uTex, vUv).rgb * (0.025 + d * 1.25);
  c += vec3(0.9, 0.85, 0.8) * pow(1.0 - max(dot(N, V), 0.0), 4.0) * d * 0.25;
  gl_FragColor = vec4(c * uA, 1.0);
}`;

export const RING_FS = /* glsl */ `
uniform sampler2D uTex; uniform float uA;
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main(){
  vec4 t = texture2D(uTex, vec2(vUv.x, 0.5));
  gl_FragColor = vec4(t.rgb * 0.9 * uA, t.a * 0.9 * uA);
}`;

export const SUN_FS = /* glsl */ `
uniform sampler2D uTex; uniform float uA, uTime; uniform vec3 uCam;
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main(){
  vec3 N = normalize(vN), V = normalize(uCam - vW);
  float mu = max(dot(N, V), 0.0);
  vec3 t = texture2D(uTex, vUv + vec2(uTime * 0.002, 0.0)).rgb;
  vec3 c = t * vec3(1.35, 1.05, 0.7) * (0.55 + 0.6 * pow(mu, 0.45)) + vec3(1.0, 0.8, 0.45) * 0.25;
  gl_FragColor = vec4(c * uA, 1.0);
}`;

/** Earth: day map (+ sharper India inset), night lights, clouds, ocean glint, atmospheric rim. */
export const EARTH_FS = /* glsl */ `
uniform sampler2D uDay, uNight, uClouds, uSpec, uIndia;
uniform vec3 uSunDir, uCam; uniform float uCloudA, uCloudShift, uA;
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main(){
  vec3 N = normalize(vN), V = normalize(uCam - vW), L = uSunDir;
  vec3 day = texture2D(uDay, vUv).rgb;
  // India inset: lon 55..105, lat -5..45
  vec2 iu = vec2((vUv.x - 0.652778) / 0.138889, (vUv.y - 0.472222) / 0.277778);
  if (iu.x > 0.0 && iu.x < 1.0 && iu.y > 0.0 && iu.y < 1.0) {
    float e = smoothstep(0.0, 0.08, iu.x) * smoothstep(1.0, 0.92, iu.x) * smoothstep(0.0, 0.08, iu.y) * smoothstep(1.0, 0.92, iu.y);
    day = mix(day, texture2D(uIndia, iu).rgb, e);
  }
  float ndl = dot(N, L);
  float dayK = smoothstep(-0.12, 0.22, ndl);
  vec3 col = day * (0.025 + max(ndl, 0.0) * 1.2);
  float spec = texture2D(uSpec, vUv).r;
  vec3 H = normalize(L + V);
  col += vec3(1.0, 0.88, 0.7) * pow(max(dot(N, H), 0.0), 55.0) * spec * 0.55 * step(0.0, ndl);
  vec3 night = texture2D(uNight, vUv).rgb;
  col += night * night * vec3(1.0, 0.75, 0.42) * (1.0 - dayK) * 2.2;
  float cl = texture2D(uClouds, vUv + vec2(uCloudShift, 0.0)).r * uCloudA;
  col = mix(col, vec3(1.0, 0.99, 0.97) * (0.015 + max(ndl, 0.0) * 1.1), cl * 0.92);
  col += vec3(1.0, 0.42, 0.12) * exp(-pow(ndl * 6.0, 2.0)) * 0.05;              // warm terminator
  float fr = pow(1.0 - max(dot(N, V), 0.0), 2.6);
  col = mix(col, vec3(0.32, 0.56, 1.0) * (0.1 + 0.9 * dayK), fr * 0.65);       // limb haze
  gl_FragColor = vec4(col * uA, 1.0);
}`;

/** Atmosphere shell (back faces, additive): brightest at the limb, fading outwards. */
export const ATMO_FS = /* glsl */ `
uniform vec3 uSunDir, uCam; uniform float uA;
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main(){
  vec3 N = normalize(vN), V = normalize(uCam - vW);
  float k = smoothstep(0.0, 0.26, abs(dot(N, V)));
  float lit = smoothstep(-0.35, 0.45, dot(N, uSunDir));
  vec3 c = mix(vec3(0.95, 0.45, 0.2), vec3(0.3, 0.58, 1.0), smoothstep(-0.1, 0.4, dot(N, uSunDir))) * pow(k, 1.6) * lit * 1.15;
  gl_FragColor = vec4(c * uA, 1.0);
}`;

/** One zoom level of satellite tiles draped on the globe; feathered edges blend into the level below. */
export const TILE_FS = /* glsl */ `
uniform sampler2D uTex; uniform vec3 uSunDir, uCam; uniform float uA;
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main(){
  vec3 N = normalize(vN), V = normalize(uCam - vW);
  vec3 t = texture2D(uTex, vUv).rgb;
  float ndl = dot(N, uSunDir);
  vec3 col = t * (0.025 + max(ndl, 0.0) * 1.2);
  float fr = pow(1.0 - max(dot(N, V), 0.0), 2.6);
  col = mix(col, vec3(0.32, 0.56, 1.0), fr * 0.65);
  vec2 e = smoothstep(vec2(0.0), vec2(0.14), vUv) * smoothstep(vec2(1.0), vec2(0.86), vUv);
  gl_FragColor = vec4(col, uA * e.x * e.y);
}`;
