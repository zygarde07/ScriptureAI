/*
  GLSL shader code for the orb. Shaders are tiny programs that run on the
  graphics card: the "vertex" shader moves every point of the sphere's
  surface, the "fragment" shader colours every pixel.

  The words you will see most:
    uniform  = a value we send in from JavaScript (time, energy, ...)
    varying  = a value passed from the vertex shader to the fragment shader
    snoise   = smooth random noise (so the surface moves like liquid)
*/

// Smooth 3D noise ("simplex noise"), by Ian McEwan / Ashima Arts (MIT licence).
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

// ---------------------------------------------------------------------
// The orb's surface
// ---------------------------------------------------------------------
export const orbVertex = /* glsl */ `
${NOISE}
uniform float uTime;
uniform float uAmp;     // how strongly the surface bulges
uniform float uPulse;   // 0..1 ripple when a question is sent
uniform float uThinking;

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vPos;

// Push a point on the unit sphere in or out using noise.
vec3 displace(vec3 p) {
  float t = uTime * (0.32 + uThinking * 0.5);
  float broad = snoise(p * 0.95 + vec3(t, t * 0.8, -t * 0.6));
  float fine  = snoise(p * 1.9 - vec3(t * 1.3, -t, t * 0.5)) * 0.15;
  float ripple = uPulse * 0.10 * sin(p.y * 7.0 - uTime * 9.0);
  return p * (1.0 + (broad + fine) * uAmp + ripple);
}

void main() {
  vec3 p = position;
  vec3 moved = displace(p);

  // Work out the new surface direction (normal) by sampling two
  // neighbouring points and taking the cross product.
  vec3 n = normalize(p);
  vec3 tangent = normalize(cross(n, abs(n.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
  vec3 bitangent = normalize(cross(n, tangent));
  float e = 0.02;
  vec3 p1 = displace(p + tangent * e);
  vec3 p2 = displace(p + bitangent * e);
  vec3 newN = normalize(cross(p1 - moved, p2 - moved));
  if (dot(newN, n) < 0.0) newN = -newN;

  vec4 viewPos = modelViewMatrix * vec4(moved, 1.0);
  vNormal = normalize(normalMatrix * newN);
  vViewDir = normalize(-viewPos.xyz);
  vPos = moved;
  gl_Position = projectionMatrix * viewPos;
}
`;

export const orbFragment = /* glsl */ `
${NOISE}
uniform float uTime;
uniform float uEnergy;   // 0 calm .. 1 excited
uniform float uThinking; // 0 or 1 (smoothly)
uniform float uPulse;
uniform float uReveal;   // 0 invisible .. 1 fully visible
uniform vec3  uLight;    // direction of the main light (follows the pointer)

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vPos;

// Colours from dark oxblood through crimson and amber to pale gold.
vec3 palette(float t) {
  vec3 c0 = vec3(0.09, 0.015, 0.035);  // dark burgundy
  vec3 c1 = vec3(0.36, 0.05, 0.10);    // oxblood
  vec3 c2 = vec3(0.70, 0.12, 0.14);    // crimson
  vec3 c3 = vec3(0.94, 0.54, 0.14);    // amber
  vec3 c4 = vec3(0.99, 0.83, 0.50);    // antique gold
  t = clamp(t, 0.0, 1.0);
  if (t < 0.25) return mix(c0, c1, t / 0.25);
  if (t < 0.50) return mix(c1, c2, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(c2, c3, (t - 0.50) / 0.25);
  return mix(c3, c4, (t - 0.75) / 0.25);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewDir);

  // Fresnel: surfaces seen at a glancing angle (the rim) glow more.
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.4);

  // Fake refraction: bend the direction we look into the "liquid" and use
  // it to sample slowly moving noise. This gives layers of flowing light inside.
  vec3 R = refract(-V, N, 0.72);
  float t = uTime * 0.18 * (1.0 + uThinking * 2.4);
  float flow = snoise(vPos * 0.9 + R * 0.9 + vec3(t, -t * 0.7, t * 0.4));

  // Thin bright filaments, like light caught inside glass. A "ridged" noise
  // (1 - |noise|) is bright only along thin curves.
  float ridge = 1.0 - abs(snoise(vPos * 1.7 + R * 1.3 + vec3(-t * 1.1, t * 0.8, t * 0.5)));
  float veins = pow(ridge, 7.0);

  // While thinking, a bright band of light sweeps around the orb.
  float band = sin(vPos.y * 4.0 + atan(vPos.z, vPos.x) * 2.0 - uTime * 3.0) * 0.5 + 0.5;
  band = pow(band, 3.0);

  // Dark, deep centre; brighter towards the edge (glass is thicker at the rim).
  float depth = 0.16 + 0.20 * flow + fres * 0.58 + (N.y * 0.5 + 0.5) * 0.08
              + uEnergy * 0.06 + uThinking * band * 0.22;

  // A touch of colour separation, like light bending through glass.
  vec3 cr = palette(depth + 0.05);
  vec3 cg = palette(depth);
  vec3 cb = palette(depth - 0.05);
  vec3 col = vec3(cr.r, cg.g, cb.b);

  // Lighting
  vec3 L = normalize(uLight);
  float diffuse = max(dot(N, L), 0.0);
  vec3 H = normalize(L + V);
  float spec  = pow(max(dot(N, H), 0.0), 90.0);
  float sheen = pow(max(dot(N, H), 0.0), 12.0);
  vec3 L2 = normalize(vec3(-L.x, -0.4, 0.5));
  float spec2 = pow(max(dot(N, normalize(L2 + V)), 0.0), 24.0);

  col *= 0.55 + 0.6 * diffuse;
  col += vec3(1.0, 0.72, 0.38) * veins * (0.25 + fres * 0.85 + uEnergy * 0.3);  // light filaments
  col += vec3(1.0, 0.94, 0.80) * spec * (1.0 + uEnergy * 0.5);                  // sharp cream highlight
  col += vec3(1.0, 0.80, 0.55) * sheen * 0.10;                                  // soft glassy sheen
  col += vec3(0.85, 0.25, 0.14) * spec2 * 0.30;                                 // red bounce light
  col += vec3(0.98, 0.64, 0.22) * fres * (0.45 + uEnergy * 0.45 + uPulse * 0.7); // gold rim
  col += vec3(1.0, 0.76, 0.42) * uPulse * 0.14;

  gl_FragColor = vec4(col, uReveal);
}
`;

// ---------------------------------------------------------------------
// Soft glow behind the orb (a flat square with a glowing centre)
// ---------------------------------------------------------------------
export const glowVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const glowFragment = /* glsl */ `
uniform float uIntensity;
uniform float uTime;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float core = exp(-d * d * 3.2);
  float halo = exp(-d * d * 1.1) * 0.5;
  vec3 amber = vec3(0.95, 0.55, 0.16);
  vec3 crimson = vec3(0.65, 0.10, 0.14);
  vec3 col = mix(amber, crimson, smoothstep(0.1, 0.9, d));

  // The glow must be exactly zero before it reaches the edge of the square
  // canvas (about d = 0.65). Otherwise the edge shows up as a visible
  // rectangle. This fades it out smoothly well inside that limit.
  float fade = 1.0 - smoothstep(0.38, 0.58, d);

  float a = (core * 0.75 + halo * 0.5) * uIntensity * fade;
  // Pure light: colour only, alpha stays 0 (see the blending set in orbScene.js).
  gl_FragColor = vec4(col * a * a, 0.0);
}
`;

// ---------------------------------------------------------------------
// Floating particles (tiny glowing dots drifting around the orb)
// ---------------------------------------------------------------------
export const particleVertex = /* glsl */ `
attribute float aSeed;
attribute float aSize;
uniform float uTime;
uniform float uPixelRatio;
uniform float uSpeed;
varying float vSeed;
varying float vEdge;
void main() {
  vSeed = aSeed;
  // each particle circles the orb at its own speed and bobs up and down
  float angle = uTime * uSpeed * (0.2 + aSeed * 0.5) + aSeed * 6.2831;
  float c = cos(angle);
  float s = sin(angle);
  vec3 p = vec3(position.x * c - position.z * s,
                position.y + sin(uTime * 0.6 + aSeed * 10.0) * 0.08,
                position.x * s + position.z * c);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * uPixelRatio * (24.0 / -mv.z);
  gl_Position = projectionMatrix * mv;

  // Fade particles out as they approach the edge of the canvas, so a
  // sparkle is never cut off by the square edge.
  vec2 ndc = gl_Position.xy / gl_Position.w;
  vEdge = 1.0 - smoothstep(0.72, 0.92, max(abs(ndc.x), abs(ndc.y)));
}
`;

export const particleFragment = /* glsl */ `
uniform float uAlpha;
varying float vSeed;
varying float vEdge;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  a *= a;
  vec3 gold = vec3(0.93, 0.68, 0.30);
  vec3 cream = vec3(1.0, 0.92, 0.75);
  gl_FragColor = vec4(mix(gold, cream, step(0.7, vSeed)), a * uAlpha * vEdge);
}
`;
