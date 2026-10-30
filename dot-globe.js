/**
 * Dot Globe Component (Framer Port)
 * Original: https://framer.com/m/AisolDotGlobe-H7p0ip.js@wBW3SS2w70bMrirlfjgb
 * Converted from the React/Framer component to a plain ES module for Evntiqa.
 * The WebGL engine, shaders and Natural Earth land mask are the original's; the React shell is replaced by init().
 *
 * Evntiqa changes:
 *  - Each destination pin rings the moment its arc's pulse lands (the original pulsed pins on a fixed timer).
 *  - Optional gentle pointer parallax that does not capture the pointer (pointerParallax).
 *  - Labels and drag are off by default; the globe is decorative behind hero copy.
 *
 * Usage:
 *   import { init } from './dot-globe.js';
 *   const globe = init(element, { pins: [...], globe: { dotColor: '#fff' }, ... });
 *   globe.destroy();
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js';

const DEFAULT_PINS = [
  { label: 'London', lat: 51.51, lng: -0.13 },
  { label: 'New York', lat: 40.71, lng: -74.01 },
  { label: 'São Paulo', lat: -23.55, lng: -46.63 },
  { label: 'Nairobi', lat: -1.29, lng: 36.82 },
  { label: 'Singapore', lat: 1.35, lng: 103.82 },
  { label: 'Tokyo', lat: 35.68, lng: 139.69 }
];
const DEFAULT_OPTIONS = {
  pins: DEFAULT_PINS,
  markers: { color: '#FFB35C', size: 100, labels: false, labelColor: '#E8ECF7', pulse: true },
  globe: { size: 78, dotColor: '#8FA3FF', dotSize: 60, density: 55, oceanColor: '#0E1428', oceanOpacity: 85, glowColor: '#4F6BFF', glow: 60 },
  arcs: { mode: 'hub', color: '#FFB35C', speed: 50 },
  motion: { autoRotate: true, speed: 6, drag: false, startLng: 10, tilt: 22, pointerParallax: 0 },
  background: { transparent: true, color: '#070A12' },
  label: ''
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const rad = d => (d * Math.PI) / 180;
// Arc head runs 0 → 1.3 of the path per cycle, so it reaches the destination at this phase
const ARRIVAL = 1 / 1.3;

function merge(o) {
  o = o || {};
  return {
    pins: Array.isArray(o.pins) && o.pins.length ? o.pins : DEFAULT_PINS,
    markers: { ...DEFAULT_OPTIONS.markers, ...(o.markers || {}) },
    globe: { ...DEFAULT_OPTIONS.globe, ...(o.globe || {}) },
    arcs: { ...DEFAULT_OPTIONS.arcs, ...(o.arcs || {}) },
    motion: { ...DEFAULT_OPTIONS.motion, ...(o.motion || {}) },
    background: { ...DEFAULT_OPTIONS.background, ...(o.background || {}) },
    label: typeof o.label === 'string' ? o.label : DEFAULT_OPTIONS.label
  };
}

function cleanPins(pins) {
  const out = [];
  for (const p of pins) {
    if (!p) continue;
    const lat = num(p.lat, NaN);
    const lng = num(p.lng, NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ label: (p.label || '').trim(), lat: clamp(lat, -90, 90), lng: ((((lng + 180) % 360) + 360) % 360) - 180 });
  }
  return out.slice(0, 40);
}

// ── Land mask: Natural Earth 1:50m land, equirectangular 720 × 360, row run-lengths (varint) in base64.
const MASK_W = 720;
const MASK_H = 360;
const MASK = '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';
let maskCache = null;
function landMask() {
  if (maskCache) return maskCache;
  const bin = atob(MASK);
  const out = new Uint8Array(MASK_W * MASK_H);
  let i = 0;
  let pos = 0;
  for (let y = 0; y < MASK_H; y++) {
    let x = 0;
    let land = 0;
    while (x < MASK_W && i < bin.length) {
      let v = 0;
      let shift = 0;
      let b = 0;
      do {
        b = bin.charCodeAt(i++);
        v |= (b & 127) << shift;
        shift += 7;
      } while (b & 128);
      if (land) out.fill(1, pos + x, pos + x + v);
      x += v;
      land ^= 1;
    }
    pos += MASK_W;
  }
  maskCache = out;
  return out;
}
function isLand(mask, lat, lng) {
  const row = clamp(Math.floor(((90 - lat) / 180) * MASK_H), 0, MASK_H - 1);
  const col = clamp(Math.floor(((lng + 180) / 360) * MASK_W), 0, MASK_W - 1);
  return mask[row * MASK_W + col] === 1;
}
function pointCount(density) { return Math.round(4e3 + clamp(density, 10, 100) * 400); }

// Fibonacci sphere, land points only. xyz with lng 0 facing +z, north +y.
const dotCache = new Map();
function landDots(density) {
  const n = pointCount(density);
  const hit = dotCache.get(n);
  if (hit) return hit;
  const mask = landMask();
  const tmp = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const t = golden * i;
    const x = r * Math.sin(t);
    const z = r * Math.cos(t);
    const lat = (Math.asin(y) * 180) / Math.PI;
    const lng = (Math.atan2(x, z) * 180) / Math.PI;
    if (isLand(mask, lat, lng)) tmp.push(x, y, z);
  }
  const arr = new Float32Array(tmp);
  dotCache.set(n, arr);
  return arr;
}
function toVec(lat, lng, r = 1) {
  const phi = (lat * Math.PI) / 180;
  const lam = (lng * Math.PI) / 180;
  return [r * Math.cos(phi) * Math.sin(lam), r * Math.sin(phi), r * Math.cos(phi) * Math.cos(lam)];
}
// Great-circle arc lifted off the surface; the lift grows with distance.
function arcPoints(a, b, steps) {
  const p = toVec(a.lat, a.lng);
  const q = toVec(b.lat, b.lng);
  const dot = clamp(p[0] * q[0] + p[1] * q[1] + p[2] * q[2], -1, 1);
  const ang = Math.acos(dot);
  const lift = 0.06 + 0.32 * (ang / Math.PI);
  const s = Math.sin(ang) || 1e-6;
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w1 = ang < 1e-4 ? 1 - t : Math.sin((1 - t) * ang) / s;
    const w2 = ang < 1e-4 ? t : Math.sin(t * ang) / s;
    const r = 1 + lift * Math.sin(Math.PI * t);
    out.push([(w1 * p[0] + w2 * q[0]) * r, (w1 * p[1] + w2 * q[1]) * r, (w1 * p[2] + w2 * q[2]) * r]);
  }
  return out;
}
function arcPairs(pins, mode) {
  if (mode === 'off' || pins.length < 2) return [];
  const out = [];
  if (mode === 'hub') for (let i = 1; i < pins.length; i++) out.push([pins[0], pins[i]]);
  else for (let i = 0; i + 1 < pins.length; i++) out.push([pins[i], pins[i + 1]]);
  return out.slice(0, 24);
}
const arcOffset = i => (i * 0.29) % 1;
// Same rotation as the WebGL group: spin about Y, then tilt about X.
function rotate(v, spin, tilt) {
  const cb = Math.cos(spin);
  const sb = Math.sin(spin);
  const x1 = v[0] * cb + v[2] * sb;
  const z1 = -v[0] * sb + v[2] * cb;
  const ca = Math.cos(tilt);
  const sa = Math.sin(tilt);
  return [x1, v[1] * ca - z1 * sa, v[1] * sa + z1 * ca];
}

// ── Flat globe: first paint and no-WebGL fallback. Orthographic projection of the same dots, as SVG.
const VB = 1000;
function flatGlobeSvg(p, pins) {
  const g = p.globe;
  const R = (VB / 2) * (clamp(num(g.size, 78), 20, 100) / 100);
  const c = VB / 2;
  const spin = -rad(num(p.motion.startLng, 10));
  const tilt = rad(clamp(num(p.motion.tilt, 22), -60, 60));
  const density = num(g.density, 55);
  const dots = landDots(density);
  const spacing = R * Math.sqrt((4 * Math.PI) / pointCount(density));
  const dotD = Math.max(0.6, spacing * (clamp(num(g.dotSize, 60), 10, 100) / 100));
  const buckets = ['', '', ''];
  for (let i = 0; i < dots.length; i += 3) {
    const v = rotate([dots[i], dots[i + 1], dots[i + 2]], spin, tilt);
    if (v[2] <= 0) continue;
    const b = v[2] > 0.5 ? 2 : v[2] > 0.2 ? 1 : 0;
    buckets[b] += `M${(c + v[0] * R).toFixed(1)} ${(c - v[1] * R).toFixed(1)}h0`;
  }
  const glow = clamp(num(g.glow, 60), 0, 100) / 100;
  const pinR = spacing * 0.95 * (clamp(num(p.markers.size, 100), 40, 250) / 100);
  const arcs = arcPairs(pins, p.arcs.mode).map(([a, b]) => {
    let d = '';
    let pen = false;
    for (const q of arcPoints(a, b, 48)) {
      const v = rotate(q, spin, tilt);
      const vis = v[2] > 0 || v[0] * v[0] + v[1] * v[1] > 1;
      if (vis) {
        d += `${pen ? 'L' : 'M'}${(c + v[0] * R).toFixed(1)} ${(c - v[1] * R).toFixed(1)}`;
        pen = true;
      } else pen = false;
    }
    return d ? `<path d="${d}"/>` : '';
  }).join('');
  const shown = pins.map(q => rotate(toVec(q.lat, q.lng), spin, tilt)).filter(v => v[2] > 0.08);
  const pinsSvg = shown.map(v => {
    const x = (c + v[0] * R).toFixed(1);
    const y = (c - v[1] * R).toFixed(1);
    return `<circle cx="${x}" cy="${y}" r="${(pinR * 2.1).toFixed(1)}" fill="${p.markers.color}" fill-opacity="0.22"/><circle cx="${x}" cy="${y}" r="${pinR.toFixed(1)}" fill="${p.markers.color}"/>`;
  }).join('');
  return `<svg class="dg-flat" viewBox="0 0 ${VB} ${VB}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
<defs><radialGradient id="dg-glow" cx="50%" cy="50%" r="50%"><stop offset="${((1 / 1.22) * 100).toFixed(1)}%" stop-color="${g.glowColor}" stop-opacity="${(0.55 * glow).toFixed(3)}"/><stop offset="100%" stop-color="${g.glowColor}" stop-opacity="0"/></radialGradient></defs>
${glow > 0 ? `<circle cx="${c}" cy="${c}" r="${(R * 1.22).toFixed(1)}" fill="url(#dg-glow)"/>` : ''}
<circle cx="${c}" cy="${c}" r="${R.toFixed(1)}" fill="${g.oceanColor}" fill-opacity="${clamp(num(g.oceanOpacity, 85), 0, 100) / 100}"/>
<g fill="none" stroke="${g.dotColor}" stroke-linecap="round" stroke-width="${dotD.toFixed(2)}"><path d="${buckets[0]}" stroke-opacity="0.35"/><path d="${buckets[1]}" stroke-opacity="0.7"/><path d="${buckets[2]}"/></g>
<g fill="none" stroke="${p.arcs.color}" stroke-width="${Math.max(1.2, R * 0.006).toFixed(2)}" stroke-linecap="round" stroke-opacity="0.75">${arcs}</g>
${pinsSvg}</svg>`;
}

// ── WebGL engine
const DOT_VERT = `
uniform float uSize;
uniform float uPixel;
varying float vFacing;
void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFacing = normalize(mat3(modelViewMatrix) * position).z;
    gl_PointSize = uSize * uPixel;
    gl_Position = projectionMatrix * mv;
}`;
const DOT_FRAG = `
uniform vec3 uColor;
uniform float uBack;
varying float vFacing;
void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    float edge = smoothstep(0.5, 0.36, r);
    float a = vFacing > 0.0 ? mix(0.3, 1.0, smoothstep(0.0, 0.55, vFacing)) : uBack * smoothstep(-1.0, -0.2, vFacing);
    if (a * edge < 0.01) discard;
    gl_FragColor = vec4(uColor, a * edge);

    #include <colorspace_fragment>
}`;
// Ring phase is in arc cycles; a negative phase means the pin never rings (e.g. the origin of the arcs)
const PIN_VERT = `
attribute float aPhase;
uniform float uSize;
uniform float uPixel;
uniform float uTime;
uniform float uRing;
varying float vFacing;
varying float vT;
void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFacing = normalize(mat3(modelViewMatrix) * position).z;
    vT = aPhase < 0.0 ? 1.0 : fract(uTime + aPhase);
    float s = uRing > 0.5 ? uSize * (1.2 + 3.2 * vT) : uSize;
    gl_PointSize = s * uPixel;
    gl_Position = projectionMatrix * mv;
}`;
const PIN_FRAG = `
uniform vec3 uColor;
uniform float uRing;
uniform float uPulse;
varying float vFacing;
varying float vT;
void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    float vis = smoothstep(0.02, 0.18, vFacing);
    float a;
    if (uRing > 0.5) {
        float ring = smoothstep(0.5, 0.42, r) * smoothstep(0.3, 0.42, r);
        a = ring * (1.0 - vT) * 0.8 * uPulse;
    } else {
        float core = smoothstep(0.5, 0.38, r);
        float halo = smoothstep(0.5, 0.0, r) * 0.35;
        a = max(core, halo);
    }
    a *= vis;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);

    #include <colorspace_fragment>
}`;
const ARC_VERT = `
attribute float aU;
varying float vU;
varying float vFacing;
varying float vOut;
void main() {
    vU = aU;
    vec3 n = normalize(mat3(modelViewMatrix) * position);
    vFacing = n.z;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vOut = length(mv.xy);
    gl_Position = projectionMatrix * mv;
}`;
const ARC_FRAG = `
uniform vec3 uColor;
uniform float uTime;
uniform float uOff;
uniform float uAnim;
varying float vU;
varying float vFacing;
varying float vOut;
void main() {
    float vis = max(smoothstep(-0.02, 0.12, vFacing), smoothstep(1.0, 1.03, vOut));
    float a = uAnim > 0.5 ? 0.32 : 0.7;
    if (uAnim > 0.5) {
        float head = fract(uTime + uOff) * 1.3;
        float dd = head - vU;
        float tail = dd >= 0.0 && dd < 0.3 ? 1.0 - dd / 0.3 : 0.0;
        a += tail * tail * 0.95;
    }
    a *= vis;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);

    #include <colorspace_fragment>
}`;
const OCEAN_VERT = `
varying float vFacing;
void main() {
    vFacing = normalize(mat3(modelViewMatrix) * normal).z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const OCEAN_FRAG = `
uniform vec3 uColor;
uniform vec3 uRim;
uniform float uOpacity;
uniform float uGlow;
varying float vFacing;
void main() {
    float rim = pow(1.0 - clamp(vFacing, 0.0, 1.0), 3.0);
    vec3 c = mix(uColor, uRim, rim * 0.55 * uGlow);
    gl_FragColor = vec4(c, uOpacity);

    #include <colorspace_fragment>
}`;
const GLOW_VERT = `
varying vec2 vP;
void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const GLOW_FRAG = `
uniform vec3 uColor;
uniform float uStrength;
varying vec2 vP;
void main() {
    float r = length(vP);
    float a = r < 0.97 ? 0.0 : exp(-max(r - 1.0, 0.0) * 9.0) * (1.0 - smoothstep(1.28, 1.35, r));
    a *= uStrength;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
}`;

class GlobeEngine {
  constructor(canvas, root, labelLayer, gl, onReady) {
    this.canvas = canvas;
    this.root = root;
    this.labelLayer = labelLayer;
    this.onReady = onReady;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    this.globe = new THREE.Group();
    this.dotsGeo = new THREE.BufferGeometry();
    this.pinGeo = new THREE.BufferGeometry();
    this.arcs = [];
    this.labels = [];
    this.look = null;
    this.motion = { ...DEFAULT_OPTIONS.motion, reduce: false };
    this.pins = [];
    this.density = -1;
    // orientation (radians)
    this.spin = 0;
    this.tilt = 0;
    this.tiltTarget = 0;
    this.vel = 0;
    this.auto = 0; // 0..1 blend of auto-rotation
    this.hover = false;
    this.focused = false;
    // pointer parallax: target and eased offsets, -1..1
    this.par = { x: 0, y: 0, tx: 0, ty: 0 };
    this.time = 0;
    this.raf = 0;
    this.last = 0;
    this.width = 1;
    this.height = 1;
    this.radiusPx = 1;
    this.visible = false;
    this.disposed = false;
    this.dragging = false;
    this.pointerId = -1;
    this.lastX = 0;
    this.lastY = 0;
    this.lastT = 0;
    this.tmp = new THREE.Vector3();
    this.motionSet = false;

    this.tick = t => {
      this.raf = 0;
      if (this.disposed) return;
      const dt = this.last ? Math.min(0.05, (t - this.last) / 1e3) : 1 / 60;
      this.last = t;
      this.step(dt);
      const more = this.visible && this.animating();
      this.draw(more);
      if (more) this.raf = requestAnimationFrame(this.tick);
    };

    // ── input
    // Only the sphere is grabbable, not the empty frame around it
    this.hitGlobe = e => {
      const r = this.root.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      return dx * dx + dy * dy <= Math.pow(this.radiusPx * 1.04, 2);
    };
    this.setHover = on => {
      if (on === this.hover) return;
      this.hover = on;
      this.root.style.cursor = on ? 'grab' : '';
      this.invalidate();
    };
    this.onEnter = e => { if (e.pointerType !== 'mouse' || !this.motion.drag) return; this.setHover(this.hitGlobe(e)); };
    this.onLeave = e => { if (e.pointerType !== 'mouse' || !this.motion.drag || this.dragging) return; this.setHover(false); };
    this.onFocus = () => { this.focused = true; this.invalidate(); };
    this.onBlur = () => { this.focused = false; this.invalidate(); };
    this.onDown = e => {
      if (!this.motion.drag) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!this.hitGlobe(e)) return;
      e.preventDefault();
      this.dragging = true;
      this.pointerId = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.lastT = e.timeStamp;
      this.vel = 0;
      this.root.style.cursor = 'grabbing';
      try { this.root.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
      this.invalidate();
    };
    this.onMove = e => {
      if (!this.dragging && this.motion.drag && e.pointerType === 'mouse') this.setHover(this.hitGlobe(e));
      if (!this.dragging || e.pointerId !== this.pointerId) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      const dt = Math.max(1, e.timeStamp - this.lastT) / 1e3;
      const per = 1 / Math.max(40, this.radiusPx);
      const dSpin = dx * per;
      this.spin += dSpin;
      this.vel = 0.65 * (dSpin / dt) + 0.35 * this.vel;
      if (e.pointerType !== 'touch') {
        this.tiltTarget = clamp(this.tiltTarget + dy * per, rad(-60), rad(60));
        this.tilt = this.tiltTarget;
      }
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.lastT = e.timeStamp;
      this.invalidate();
    };
    this.onUp = e => {
      if (!this.dragging || e.pointerId !== this.pointerId) return;
      this.dragging = false;
      this.pointerId = -1;
      // a pause before release means no fling
      if (e.timeStamp - this.lastT > 90) this.vel = 0;
      this.vel = clamp(this.vel, -9, 9);
      try { this.root.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
      this.hover = false;
      if (e.pointerType === 'mouse') this.setHover(this.hitGlobe(e));
      else this.root.style.cursor = '';
      this.invalidate();
    };
    this.onKey = e => {
      if (!this.motion.drag || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      let used = true;
      if (e.key === 'ArrowLeft') this.vel -= 1.4;
      else if (e.key === 'ArrowRight') this.vel += 1.4;
      else if (e.key === 'ArrowUp') this.tiltTarget = clamp(this.tiltTarget + rad(8), rad(-60), rad(60));
      else if (e.key === 'ArrowDown') this.tiltTarget = clamp(this.tiltTarget - rad(8), rad(-60), rad(60));
      else if (e.key === 'Home') {
        this.vel = 0;
        this.spin = -rad(this.motion.startLng);
        this.tiltTarget = rad(clamp(this.motion.tilt, -60, 60));
      } else used = false;
      if (!used) return;
      e.preventDefault();
      this.vel = clamp(this.vel, -9, 9);
      this.invalidate();
    };
    // Parallax listens on the window so the globe never blocks the content above it
    this.onWindowPointer = e => {
      if (e.pointerType !== 'mouse') return;
      this.par.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      this.par.ty = (e.clientY / window.innerHeight - 0.5) * 2;
      this.invalidate();
    };
    this.onLost = e => { e.preventDefault(); this.stop(); this.onReady(false); };

    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0, 0);
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);

    this.glowMat = new THREE.ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, uniforms: { uColor: { value: new THREE.Color() }, uStrength: { value: 0.6 } }, transparent: true, depthWrite: false, depthTest: false });
    this.glowMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), this.glowMat);
    this.glowMesh.renderOrder = 0;
    this.oceanMat = new THREE.ShaderMaterial({ vertexShader: OCEAN_VERT, fragmentShader: OCEAN_FRAG, uniforms: { uColor: { value: new THREE.Color() }, uRim: { value: new THREE.Color() }, uOpacity: { value: 0.85 }, uGlow: { value: 0.6 } }, transparent: true, depthWrite: false, depthTest: false });
    this.ocean = new THREE.Mesh(new THREE.SphereGeometry(0.995, 64, 32), this.oceanMat);
    this.ocean.renderOrder = 1;
    this.dotsMat = new THREE.ShaderMaterial({ vertexShader: DOT_VERT, fragmentShader: DOT_FRAG, uniforms: { uColor: { value: new THREE.Color() }, uSize: { value: 2 }, uPixel: { value: 1 }, uBack: { value: 0.05 } }, transparent: true, depthWrite: false, depthTest: false });
    this.dots = new THREE.Points(this.dotsGeo, this.dotsMat);
    this.dots.renderOrder = 2;
    const pinUniforms = () => ({ uColor: { value: new THREE.Color() }, uSize: { value: 6 }, uPixel: { value: 1 }, uTime: { value: 0 }, uRing: { value: 0 }, uPulse: { value: 1 } });
    this.pinMat = new THREE.ShaderMaterial({ vertexShader: PIN_VERT, fragmentShader: PIN_FRAG, uniforms: pinUniforms(), transparent: true, depthWrite: false, depthTest: false });
    this.ringMat = new THREE.ShaderMaterial({ vertexShader: PIN_VERT, fragmentShader: PIN_FRAG, uniforms: pinUniforms(), transparent: true, depthWrite: false, depthTest: false });
    this.ringMat.uniforms.uRing.value = 1;
    this.pinPoints = new THREE.Points(this.pinGeo, this.pinMat);
    this.ringPoints = new THREE.Points(this.pinGeo, this.ringMat);
    this.pinPoints.renderOrder = 5;
    this.ringPoints.renderOrder = 4;
    this.globe.add(this.ocean, this.dots, this.ringPoints, this.pinPoints);
    this.scene.add(this.glowMesh, this.globe);

    root.addEventListener('pointerdown', this.onDown);
    root.addEventListener('pointermove', this.onMove);
    root.addEventListener('pointerup', this.onUp);
    root.addEventListener('pointercancel', this.onUp);
    root.addEventListener('pointerenter', this.onEnter);
    root.addEventListener('pointerleave', this.onLeave);
    root.addEventListener('keydown', this.onKey);
    root.addEventListener('focus', this.onFocus);
    root.addEventListener('blur', this.onBlur);
    canvas.addEventListener('webglcontextlost', this.onLost);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(root);
    this.io = new IntersectionObserver(entries => {
      const e = entries[entries.length - 1];
      this.visible = !!e && e.isIntersecting;
      if (this.visible) this.invalidate();
      else this.stop();
    }, { threshold: [0, 0.01] });
    this.io.observe(root);
    this.resize();
  }

  // ── public API
  setLook(look) {
    const prev = this.look;
    this.look = look;
    this.dotsMat.uniforms.uColor.value.set(look.dot);
    this.oceanMat.uniforms.uColor.value.set(look.ocean);
    this.oceanMat.uniforms.uRim.value.set(look.glow);
    this.oceanMat.uniforms.uOpacity.value = look.oceanOpacity;
    this.oceanMat.uniforms.uGlow.value = look.glowStrength;
    this.ocean.visible = look.oceanOpacity > 0.001;
    this.dotsMat.uniforms.uBack.value = 0.28 * (1 - look.oceanOpacity);
    this.glowMat.uniforms.uColor.value.set(look.glow);
    this.glowMat.uniforms.uStrength.value = 0.7 * look.glowStrength;
    this.glowMesh.visible = look.glowStrength > 0.001;
    this.pinMat.uniforms.uColor.value.set(look.pin);
    this.ringMat.uniforms.uColor.value.set(look.pin);
    this.ringMat.uniforms.uPulse.value = look.pulse ? 1 : 0;
    for (const a of this.arcs) a.mat.uniforms.uColor.value.set(look.arcColor);
    if (!prev || prev.density !== look.density) this.buildDots(look.density);
    if (!prev || prev.size !== look.size) this.resize();
    else this.updateSizes();
    this.invalidate();
  }

  setMotion(m) {
    const prev = this.motion;
    const first = !this.motionSet;
    this.motionSet = true;
    this.motion = m;
    if (first || prev.startLng !== m.startLng) { this.spin = -rad(m.startLng); this.vel = 0; }
    if (first || prev.tilt !== m.tilt) {
      this.tiltTarget = rad(clamp(m.tilt, -60, 60));
      if (first) this.tilt = this.tiltTarget;
    }
    if (first) this.auto = m.autoRotate && !m.reduce ? 1 : 0;
    this.root.style.touchAction = m.drag ? 'pan-y' : '';
    this.root.style.cursor = '';
    window.removeEventListener('pointermove', this.onWindowPointer);
    if (m.pointerParallax > 0 && !m.reduce) window.addEventListener('pointermove', this.onWindowPointer, { passive: true });
    this.invalidate();
  }

  setData(pins, mode, labels) {
    this.pins = pins;
    // pins; each arc's destination rings exactly when that arc's pulse arrives
    const pairs = arcPairs(pins, mode);
    const pos = new Float32Array(pins.length * 3);
    const phase = new Float32Array(pins.length).fill(-1);
    pins.forEach((p, i) => pos.set(toVec(p.lat, p.lng, 1.004), i * 3));
    pairs.forEach(([, b], i) => {
      const k = pins.indexOf(b);
      if (k >= 0) phase[k] = ((((arcOffset(i) - ARRIVAL) % 1) + 1) % 1);
    });
    this.pinGeo.dispose();
    this.pinGeo = new THREE.BufferGeometry();
    this.pinGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.pinGeo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.pinPoints.geometry = this.pinGeo;
    this.ringPoints.geometry = this.pinGeo;
    // arcs
    for (const a of this.arcs) { this.globe.remove(a.mesh); a.mesh.geometry.dispose(); a.mat.dispose(); }
    this.arcs = [];
    pairs.forEach(([a, b], i) => {
      const pts = arcPoints(a, b, 64).map(v => new THREE.Vector3(v[0], v[1], v[2]));
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 96, 0.0042, 5, false);
      const uv = geo.getAttribute('uv');
      const u = new Float32Array(uv.count);
      for (let k = 0; k < uv.count; k++) u[k] = uv.getX(k);
      geo.setAttribute('aU', new THREE.BufferAttribute(u, 1));
      const mat = new THREE.ShaderMaterial({
        vertexShader: ARC_VERT,
        fragmentShader: ARC_FRAG,
        uniforms: { uColor: { value: new THREE.Color(this.look ? this.look.arcColor : '#FFB35C') }, uTime: { value: 0 }, uOff: { value: arcOffset(i) }, uAnim: { value: 1 } },
        transparent: true,
        depthWrite: false,
        depthTest: false
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 3;
      this.globe.add(mesh);
      this.arcs.push({ mesh, mat });
    });
    // labels (own layer only)
    for (const l of this.labels) l.el.remove();
    this.labels = [];
    if (labels) {
      pins.forEach(p => {
        if (!p.label) return;
        const el = document.createElement('span');
        el.className = 'dg-label';
        el.textContent = p.label;
        this.labelLayer.append(el);
        const v = toVec(p.lat, p.lng, 1.004);
        this.labels.push({ el, pos: new THREE.Vector3(v[0], v[1], v[2]) });
      });
    }
    this.updateSizes();
    this.invalidate();
  }

  dispose() {
    this.disposed = true;
    this.stop();
    if (this.ro) this.ro.disconnect();
    if (this.io) this.io.disconnect();
    const r = this.root;
    r.removeEventListener('pointerdown', this.onDown);
    r.removeEventListener('pointermove', this.onMove);
    r.removeEventListener('pointerup', this.onUp);
    r.removeEventListener('pointercancel', this.onUp);
    r.removeEventListener('pointerenter', this.onEnter);
    r.removeEventListener('pointerleave', this.onLeave);
    r.removeEventListener('keydown', this.onKey);
    r.removeEventListener('focus', this.onFocus);
    r.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pointermove', this.onWindowPointer);
    r.style.touchAction = '';
    r.style.cursor = '';
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    for (const l of this.labels) l.el.remove();
    this.labels = [];
    for (const a of this.arcs) { a.mesh.geometry.dispose(); a.mat.dispose(); }
    this.dotsGeo.dispose();
    this.pinGeo.dispose();
    this.ocean.geometry.dispose();
    this.glowMesh.geometry.dispose();
    for (const m of [this.dotsMat, this.pinMat, this.ringMat, this.oceanMat, this.glowMat]) m.dispose();
    this.renderer.dispose();
  }

  // ── build
  buildDots(density) {
    if (density === this.density) return;
    this.density = density;
    const arr = landDots(density);
    this.dotsGeo.dispose();
    this.dotsGeo = new THREE.BufferGeometry();
    this.dotsGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.dots.geometry = this.dotsGeo;
    this.updateSizes();
  }

  resize() {
    if (this.disposed) return;
    const w = Math.max(1, this.root.clientWidth);
    const h = Math.max(1, this.root.clientHeight);
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    const size = this.look ? this.look.size : 0.78;
    this.radiusPx = (Math.min(w, h) / 2) * size;
    const s = this.radiusPx;
    this.camera.left = -w / 2 / s;
    this.camera.right = w / 2 / s;
    this.camera.top = h / 2 / s;
    this.camera.bottom = -h / 2 / s;
    this.camera.updateProjectionMatrix();
    this.updateSizes();
    this.draw();
  }

  updateSizes() {
    const look = this.look;
    if (!look) return;
    const px = this.renderer.getPixelRatio();
    const spacing = this.radiusPx * Math.sqrt((4 * Math.PI) / pointCount(look.density));
    const d = Math.max(0.8, spacing * look.dotSize);
    this.dotsMat.uniforms.uSize.value = d;
    this.dotsMat.uniforms.uPixel.value = px;
    const pinD = Math.max(5, spacing * 2.6 * look.pinSize);
    for (const m of [this.pinMat, this.ringMat]) { m.uniforms.uSize.value = pinD; m.uniforms.uPixel.value = px; }
    const fs = clamp(Math.min(this.width, this.height) * 0.024, 11, 18);
    this.labelLayer.style.fontSize = `${fs.toFixed(1)}px`;
  }

  // ── loop
  autoTarget() {
    const m = this.motion;
    return m.autoRotate && !m.reduce && !this.hover && !this.focused && !this.dragging ? 1 : 0;
  }

  animating() {
    const m = this.motion;
    const autoTarget = this.autoTarget();
    if (this.dragging) return true;
    if (Math.abs(this.vel) > 0.002) return true;
    if (Math.abs(this.auto - autoTarget) > 0.002) return true;
    if (autoTarget > 0) return true;
    if (Math.abs(this.tilt - this.tiltTarget) > 5e-4) return true;
    if (Math.abs(this.par.x - this.par.tx) > 1e-3 || Math.abs(this.par.y - this.par.ty) > 1e-3) return true;
    if (!m.reduce && this.arcs.length > 0) return true;
    return false;
  }

  invalidate() {
    if (this.disposed) return;
    if (!this.visible) { this.draw(); return; }
    if (this.raf) return;
    this.last = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  step(dt) {
    const m = this.motion;
    this.time += dt;
    const autoTarget = this.autoTarget();
    const k = 1 - Math.exp(-dt * 2.2);
    this.auto += (autoTarget - this.auto) * k;
    if (Math.abs(this.auto - autoTarget) < 0.002) this.auto = autoTarget;
    if (!this.dragging) {
      this.spin += this.vel * dt;
      this.vel *= Math.exp(-dt * 2.6);
      if (Math.abs(this.vel) < 0.002) this.vel = 0;
      this.spin += rad(m.speed) * this.auto * dt;
    }
    this.tilt += (this.tiltTarget - this.tilt) * (1 - Math.exp(-dt * 8));
    if (Math.abs(this.tilt - this.tiltTarget) < 5e-4) this.tilt = this.tiltTarget;
    const kp = 1 - Math.exp(-dt * 3);
    this.par.x += (this.par.tx - this.par.x) * kp;
    this.par.y += (this.par.ty - this.par.y) * kp;
    if (this.spin > Math.PI * 4 || this.spin < -Math.PI * 4) this.spin %= Math.PI * 2;
  }

  draw(animating = false) {
    if (this.disposed) return;
    const look = this.look;
    if (!look) return;
    const pp = this.motion.reduce ? 0 : this.motion.pointerParallax || 0;
    this.globe.rotation.set(this.tilt + this.par.y * rad(6) * pp, this.spin + this.par.x * rad(12) * pp, 0, 'XYZ');
    const live = animating && !this.motion.reduce;
    // Arcs and destination rings share one clock, measured in arc cycles
    const arcTime = this.time * (0.12 + (look.arcSpeed / 100) * 0.5);
    for (const a of this.arcs) {
      a.mat.uniforms.uAnim.value = this.motion.reduce ? 0 : 1;
      a.mat.uniforms.uTime.value = arcTime;
    }
    this.ringMat.uniforms.uTime.value = arcTime;
    this.ringPoints.visible = live && look.pulse;
    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
  }

  placeLabels() {
    if (!this.labels.length) return;
    this.globe.updateMatrixWorld();
    const w = this.width;
    const h = this.height;
    const R = this.radiusPx;
    for (const l of this.labels) {
      this.tmp.copy(l.pos).applyMatrix4(this.globe.matrixWorld);
      const op = clamp((this.tmp.z - 0.08) / 0.2, 0, 1);
      const x = w / 2 + this.tmp.x * R;
      const y = h / 2 - this.tmp.y * R;
      const left = x > w / 2 + R * 0.55;
      l.el.style.opacity = op.toFixed(3);
      l.el.style.visibility = op > 0 ? 'visible' : 'hidden';
      l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(${left ? 'calc(-100% - 0.9em)' : '0.9em'}, -50%)`;
    }
  }

  ready() {
    this.draw();
    this.onReady(true);
  }
}

// ── Mount
const CSS = `
.dg-root { position: relative; overflow: hidden; outline: none; }
.dg-flat { position: absolute; inset: 0; width: 100%; height: 100%; display: block; transition: opacity 0.4s ease; }
.dg-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; opacity: 0; transition: opacity 0.4s ease; }
.dg-labels { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 0.4s ease; }
.dg-label { position: absolute; left: 0; top: 0; white-space: nowrap; font-weight: 600; line-height: 1; letter-spacing: 0.01em; text-shadow: 0 0 2px rgba(0,0,0,0.55), 0 0 6px rgba(0,0,0,0.55); will-change: transform; }
.dg-ready .dg-canvas, .dg-ready .dg-labels { opacity: 1; }
.dg-ready .dg-flat { opacity: 0; }
.dg-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.dg-grab { user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
@media (prefers-reduced-motion: reduce) {
  .dg-flat, .dg-canvas, .dg-labels { transition: none; }
}
`;
let cssInjected = false;

export function init(target, options) {
  const root = typeof target === 'string' ? document.querySelector(target) : target;
  if (!root) return null;
  if (!cssInjected) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    cssInjected = true;
  }
  const p = merge(options);
  const pins = cleanPins(p.pins);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('dg-root');
  if (!p.background.transparent) root.style.background = p.background.color;
  root.style.color = p.markers.labelColor;
  root.innerHTML = flatGlobeSvg(p, pins);

  const canvas = document.createElement('canvas');
  canvas.className = 'dg-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const labelLayer = document.createElement('div');
  labelLayer.className = 'dg-labels';
  labelLayer.setAttribute('aria-hidden', 'true');
  root.append(canvas, labelLayer);

  let gl = null;
  try { gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true }); } catch (err) { gl = null; }
  // No WebGL: the flat SVG globe stays as a static fallback
  if (!gl) return { destroy() { root.innerHTML = ''; } };

  let engine = null;
  try {
    engine = new GlobeEngine(canvas, root, labelLayer, gl, ok => root.classList.toggle('dg-ready', ok));
  } catch (err) {
    return { destroy() { root.innerHTML = ''; } };
  }
  const g = p.globe;
  const m = p.markers;
  engine.setLook({
    dot: g.dotColor,
    dotSize: clamp(num(g.dotSize, 60), 10, 100) / 100,
    density: clamp(num(g.density, 55), 10, 100),
    size: clamp(num(g.size, 78), 20, 100) / 100,
    ocean: g.oceanColor,
    oceanOpacity: clamp(num(g.oceanOpacity, 85), 0, 100) / 100,
    glow: g.glowColor,
    glowStrength: clamp(num(g.glow, 60), 0, 100) / 100,
    pin: m.color,
    pinSize: clamp(num(m.size, 100), 40, 250) / 100,
    pulse: !!m.pulse,
    arcColor: p.arcs.color,
    arcSpeed: clamp(num(p.arcs.speed, 50), 0, 100)
  });
  const mo = p.motion;
  engine.setMotion({
    autoRotate: !!mo.autoRotate,
    speed: clamp(num(mo.speed, 6), 0, 60),
    drag: !!mo.drag,
    startLng: clamp(num(mo.startLng, 10), -180, 180),
    tilt: clamp(num(mo.tilt, 22), -60, 60),
    pointerParallax: clamp(num(mo.pointerParallax, 0), 0, 1),
    reduce
  });
  if (mo.drag) {
    root.tabIndex = 0;
    root.setAttribute('role', 'img');
    root.setAttribute('aria-roledescription', 'interactive globe');
    const names = pins.map(q => q.label).filter(Boolean);
    root.setAttribute('aria-label', p.label || (names.length ? `Globe marking ${names.join(', ')}` : 'Dotted globe'));
    root.classList.add('dg-grab');
    const hint = document.createElement('span');
    hint.className = 'dg-sr';
    hint.textContent = 'Drag or use the arrow keys to turn the globe.';
    root.append(hint);
  }
  engine.setData(pins, p.arcs.mode, !!m.labels);
  engine.ready();
  return { engine, destroy() { engine.dispose(); root.innerHTML = ''; root.classList.remove('dg-root', 'dg-ready'); } };
}

if (typeof window !== 'undefined') window.DotGlobe = { init };
