// ══════════════════════════════════════════
//  EXHIBITION: CRT TV  (floater 6 — the white "static" sphere)
// ══════════════════════════════════════════
// A bespoke one-object exhibition: a 1970s Sony-Trinitron-style colour television that
// scales up in front of the player, bobs, shows a faint static glow, and dismisses.
//
// REBUILD (2026-06): modelled on the reference set and on the technique that made the
// MPC look good — the busy silkscreen (channel-dial number rings, the COLOR / SOLID
// STATE / SKIN DEEP badges, every small label, the woven speaker grille) is BAKED into
// a single relief-shaded "control-panel" canvas texture; only the genuinely tactile
// parts (the two big channel dials, the four small knobs, the AUTO-COLOR button, the
// three coloured pushbuttons, the earphone jacks) are real geometry placed on top via a
// shared (u,v)→local mapping. This keeps the silhouette dense and "video-game" detailed
// while the draw-call / geometry budget stays close to the old set.
//
// Material strategy follows the lighting rules: the front frame and trim are brushed
// metal (controlled specular — read as bright aluminium, never wash to cream), the
// control panel + screen recess are dark glossy (hold their tone), and the side panels
// are a dark-baked walnut map (holds brown). There is no light diffuse plastic to blow
// out, so the room is only PARTIALLY dimmed (≈0.5) — enough for the green screen glow to
// read while keeping the silver bright.
//
// Self-contained — it talks to the rest of the app only through the imported `core`
// surface and registers itself via core.registerExhibit().
import { core } from '../core.js';

const {
  THREE, scene, isMobile, floaters, MAX_ANISO,
  CRATE_DIST, OPEN_DUR, CLOSE_DUR,
  registerExhibit,
  initTex: _initTex,
  setFloaterVisible: _setFloaterVisible,
  restoreFloater: _restoreExhibitFloater,
  disposeObject3D: _disposeCrateObject,
  setTriggerFloater, beginExhibitDPR, endExhibitDPR, setCD, hidePrompt,
} = core;

const CRT = {
  floaterIdx: 6,    // the white "static" sphere at the front of the room
  _model: null,     // cached THREE.Group — the body never changes, build once
  _built: false,
  staticTex: null,  // canvas textures, built once
  glareTex: null,
  panelTex: null,   // baked control-panel faceplate (dials' number rings, labels, grille, badges)
  badgeTex: null,   // SKIN DEEP wordmark plaque (front frame)
  brushedTex: null, // brushed-metal roughness/bump for the silver frame + trim
  woodTex: null,    // walnut wood-grain for the side end panels
  ventTex: null,    // bottom vent slats
  screenMat: null,  // kept so update() can flicker the screen emissive
};

const CRT_SIZE = 2.6;  // overall TV width; every part is a fraction of this
const CRT_Y    = 1.2;  // group-center height — screen sits near eye level
const _crtFwd  = new THREE.Vector3();

let crtPhase = null;   // 'opening' | 'open' | 'closing' | null
let crtT     = 0;
let crtGroup = null;

// ── small canvas helpers (shared with the MPC faceplate idiom) ──
function _rr(x, cx, cy, w, h, r) {
  x.beginPath();
  x.moveTo(cx + r, cy);
  x.arcTo(cx + w, cy, cx + w, cy + h, r);
  x.arcTo(cx + w, cy + h, cx, cy + h, r);
  x.arcTo(cx, cy + h, cx, cy, r);
  x.arcTo(cx, cy, cx + w, cy, r);
  x.closePath();
}
// An engraved separator: a dark groove with a 1px highlight under it (reads as a moulded
// step under the flat room light).
function _engrave(x, x0, y0, x1, y1) {
  x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
  x.strokeStyle = 'rgba(180,184,192,0.18)'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(x0, y0 + 2); x.lineTo(x1, y1 + 2); x.stroke();
}
// A baked raised pushbutton with a top sheen + drop shadow (texture-only; no geometry).
function _bakeBtn(x, cx, cy, w, h, fill, r) {
  r = r || 4;
  _rr(x, cx - 1, cy - 1, w + 2, h + 2, r + 1); x.fillStyle = 'rgba(0,0,0,0.55)'; x.fill();
  _rr(x, cx, cy + 2, w, h, r);   x.fillStyle = 'rgba(0,0,0,0.45)'; x.fill();
  _rr(x, cx, cy, w, h, r);       x.fillStyle = fill;              x.fill();
  _rr(x, cx + 1, cy + 1, w - 2, h * 0.4, r); x.fillStyle = 'rgba(255,255,255,0.30)'; x.fill();
}

// Screen emissive layer — RGBA noise with baked-in scanlines + a radial vignette so the
// glow concentrates in the centre and falls off at the edges (reads as a CRT). Crawls via
// offset.y in update().
function makeCrtStaticTex() {
  const N = 160;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d');
  const img = x.createImageData(N, N);
  const d = img.data;
  const cx = N / 2, cy = N / 2, maxd = Math.hypot(cx, cy);
  for (let yy = 0; yy < N; yy++) {
    for (let xx = 0; xx < N; xx++) {
      let v = 70 + Math.random() * 105;
      if (yy % 2 === 0) v *= 0.55;                            // scanlines
      const vig = Math.max(0, 1 - (Math.hypot(xx - cx, yy - cy) / maxd) * 1.12);
      v *= 0.22 + 0.78 * vig;                                 // dim toward edges
      const i = (yy * N + xx) * 4;
      const ph = xx % 3;                                      // aperture-grille phosphor tint
      d[i]     = ph === 0 ? v : v * 0.84;
      d[i + 1] = ph === 1 ? v : v * 0.84;
      d[i + 2] = ph === 2 ? v : v * 0.84;
      d[i + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Soft angled highlight (a window reflection) in the upper-left of the glass — additive.
function makeCrtGlareTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 128);
  x.save();
  x.translate(50, 40); x.rotate(-0.42); x.scale(1.5, 0.62);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 52);
  g.addColorStop(0,   'rgba(255,255,255,0.42)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.10)');
  g.addColorStop(1,   'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(-128, -128, 256, 256);
  x.restore();
  return new THREE.CanvasTexture(c);
}

// Brushed-metal surface — fine horizontal streaks. Used as a roughnessMap (+ gentle bump)
// on the silver front frame and trim so the metal reads as satin brushed aluminium.
function makeCrtBrushedTex() {
  const W = 256, Hh = 64;
  const c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const x = c.getContext('2d');
  x.fillStyle = '#9c9ea2'; x.fillRect(0, 0, W, Hh);
  for (let i = 0; i < 2600; i++) {
    const yy = Math.random() * Hh, xx = Math.random() * W;
    const len = 24 + Math.random() * 130, gtone = 90 + Math.random() * 130 | 0;
    x.strokeStyle = `rgba(${gtone},${gtone},${gtone},0.16)`; x.lineWidth = 1;
    x.beginPath(); x.moveTo(xx, yy); x.lineTo(xx + len, yy); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Walnut wood-grain — a warm brown vertical gradient with wavy grain streaks + an edge
// vignette. Kept dark (like the crate's mahogany) so the orb light lifts it to a rich
// brown instead of washing it to tan. Used on the side end-panels.
function makeCrtWoodTex() {
  const W = 256, Hh = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#4f3318'); g.addColorStop(0.5, '#6b4626'); g.addColorStop(1, '#42290f');
  x.fillStyle = g; x.fillRect(0, 0, W, Hh);
  for (let i = 0; i < 90; i++) {
    const x0 = Math.random() * W;
    const dark = Math.random() < 0.5;
    x.strokeStyle = dark ? 'rgba(24,13,4,0.55)' : 'rgba(150,108,68,0.28)';
    x.lineWidth = 0.5 + Math.random() * 1.8;
    x.beginPath(); x.moveTo(x0, 0);
    for (let yy = 0; yy <= Hh; yy += 16) x.lineTo(x0 + Math.sin((yy / Hh) * 6.28 + i) * 4, yy);
    x.stroke();
  }
  const vig = x.createRadialGradient(W / 2, Hh / 2, Hh * 0.2, W / 2, Hh / 2, W * 0.62);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.4)');
  x.fillStyle = vig; x.fillRect(0, 0, W, Hh);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Bottom vent — dark horizontal slats over the lower front bar (transparent overlay).
function makeCrtVentTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 48;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 256, 48);
  for (let yy = 6; yy < 42; yy += 6) {
    x.fillStyle = 'rgba(0,0,0,0.62)'; x.fillRect(8, yy, 240, 3);
    x.fillStyle = 'rgba(200,204,210,0.12)'; x.fillRect(8, yy + 3, 240, 1);
  }
  return new THREE.CanvasTexture(c);
}

// SKIN DEEP wordmark on a dark plaque (front frame, below the screen).
function makeCrtBadgeTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const x = c.getContext('2d');
  _rr(x, 6, 22, 244, 52, 8); x.fillStyle = '#0a0b0d'; x.fill();
  _rr(x, 8, 24, 240, 48, 7); x.strokeStyle = 'rgba(150,154,162,0.5)'; x.lineWidth = 2; x.stroke();
  x.fillStyle = '#d7dade';
  x.font = '800 30px Arial, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('SKIN DEEP', 128, 50);
  return new THREE.CanvasTexture(c);
}

// ══ The control-panel faceplate ══
// One canvas holding the whole busy right-hand control column: the two channel-dial
// number rings, the COLOR / SOLID STATE / SKIN DEEP badges, every knob/button label, the
// woven speaker grille, and the earphone-jack labels — all relief-shaded so they read as
// moulded/printed. Real geometry (dials, knobs, buttons, jacks) is placed on top using
// the SAME normalized (u,v) coordinates listed in PANEL below, so they line up exactly.
//
//   u: 0 = left .. 1 = right        v: 0 = top .. 1 = bottom
const PANEL = {
  vhfDial:   { u: 0.30, v: 0.115 },   // big VHF channel selector
  uhfDial:   { u: 0.30, v: 0.380 },   // big UHF channel selector
  fineKnob:  { u: 0.80, v: 0.130 },   // FINE / VOL
  contKnob:  { u: 0.80, v: 0.235 },   // CONTRAST
  autoBtn:   { u: 0.80, v: 0.345 },   // AUTO COLOR AFT
  toneKnob:  { u: 0.85, v: 0.600 },   // COLOR TONE (red/green ring)
  colorKnob: { u: 0.85, v: 0.745 },   // COLOR (red ring)
  ovals:     [{ u: 0.115, v: 0.880 }, { u: 0.205, v: 0.880 }, { u: 0.295, v: 0.880 }],
  jacks:     [{ u: 0.80, v: 0.925 }, { u: 0.895, v: 0.925 }],
};
const PANEL_ASPECT = 0.435;   // width / height of the panel plane (must match the geometry)

function makeCrtPanelTex() {
  const CW = 480, CH = Math.round(CW / PANEL_ASPECT);   // ≈ 1103
  const c = document.createElement('canvas'); c.width = CW; c.height = CH;
  const x = c.getContext('2d');
  const U = u => u * CW, V = v => v * CH;
  const ink = '#cdd0d6', faint = '#9a9ea6', red = '#d23b2f';

  // Charcoal base + subtle vertical brushed sheen + a recessed inner border.
  x.fillStyle = '#191a1e'; x.fillRect(0, 0, CW, CH);
  for (let i = 0; i < CW; i += 3) { x.fillStyle = 'rgba(255,255,255,0.012)'; x.fillRect(i, 0, 1, CH); }
  x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 6; x.strokeRect(3, 3, CW - 6, CH - 6);
  x.strokeStyle = 'rgba(170,174,182,0.16)'; x.lineWidth = 1; x.strokeRect(7, 7, CW - 14, CH - 14);

  // Helper: a baked dial number ring — a recessed dark annulus with channel numbers
  // around it (the real dial cap mesh covers the centre).
  const bakeDialRing = (cx, cy, rOuter, labels) => {
    x.beginPath(); x.arc(cx, cy, rOuter, 0, Math.PI * 2);
    x.fillStyle = '#0d0e11'; x.fill();
    x.lineWidth = 2; x.strokeStyle = 'rgba(150,154,162,0.4)'; x.stroke();
    x.fillStyle = ink; x.font = '700 15px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const n = labels.length;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;   // start at top, clockwise
      const lr = rOuter - 13;
      x.fillText(labels[i], cx + Math.cos(a) * lr, cy + Math.sin(a) * lr);
      // tick mark just outside the numbers
      x.strokeStyle = 'rgba(150,154,162,0.5)'; x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(cx + Math.cos(a) * (rOuter - 3), cy + Math.sin(a) * (rOuter - 3));
      x.lineTo(cx + Math.cos(a) * (rOuter - 1), cy + Math.sin(a) * (rOuter - 1));
      x.stroke();
    }
  };
  // A baked knob socket — a recessed ring the real knob mesh sits in.
  const bakeSocket = (cx, cy, r) => {
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fillStyle = '#0e0f12'; x.fill();
    x.lineWidth = 2; x.strokeStyle = 'rgba(150,154,162,0.32)'; x.stroke();
  };
  const label = (s, u, v, col, px) => {
    x.fillStyle = col || faint; x.font = '700 ' + (px || 12) + 'px Arial';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(s, U(u), V(v));
  };

  x.textBaseline = 'middle';

  // ── VHF section ──
  label('VHF', 0.13, 0.028, ink, 16);
  x.fillStyle = red; x.fillRect(U(0.22), V(0.018), 5, V(0.022));   // red index tick
  bakeDialRing(U(PANEL.vhfDial.u), V(PANEL.vhfDial.v), CW * 0.205,
    ['1', '2', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13']);
  // COLOR badge (top-right)
  _rr(x, U(0.66), V(0.03), U(0.30), V(0.05), 4); x.fillStyle = '#0c0d10'; x.fill();
  x.strokeStyle = '#c0c4cc'; x.lineWidth = 1.5; x.stroke();
  label('COLOR', 0.81, 0.055, '#d7dade', 18);
  // small knob labels
  bakeSocket(U(PANEL.fineKnob.u), V(PANEL.fineKnob.v), CW * 0.082);
  bakeSocket(U(PANEL.contKnob.u), V(PANEL.contKnob.v), CW * 0.082);
  label('FINE / VOL', 0.80, 0.185, faint, 11);
  label('CONTRAST', 0.80, 0.290, faint, 11);

  // ── UHF section ──
  label('UHF', 0.13, 0.293, ink, 16);
  x.fillStyle = red; x.fillRect(U(0.22), V(0.283), 5, V(0.022));
  bakeDialRing(U(PANEL.uhfDial.u), V(PANEL.uhfDial.v), CW * 0.205,
    ['14', '20', '26', '32', '38', '44', '50', '56', '62', '68', '74', '83']);
  // AUTO COLOR AFT button + AUTO/MANUAL switch (right column)
  label('AUTO COLOR', 0.80, 0.300, faint, 11);
  label('AFT', 0.80, 0.318, faint, 11);
  _bakeBtn(x, U(0.745), V(0.330), U(0.11), V(0.030), '#101114', 4);
  label('AUTO', 0.86, 0.420, faint, 9);
  label('MANUAL', 0.86, 0.438, faint, 9);
  _rr(x, U(0.715), V(0.405), U(0.075), V(0.045), 4); x.fillStyle = '#0c0d10'; x.fill();
  _bakeBtn(x, U(0.722), V(0.410), U(0.030), V(0.034), '#3a3d44', 3);   // switch nub

  // ── SOLID STATE plate + separator ──
  _engrave(x, U(0.05), V(0.485), U(0.95), V(0.485));
  _rr(x, U(0.07), V(0.500), U(0.34), V(0.045), 4); x.fillStyle = '#0c0d10'; x.fill();
  x.strokeStyle = 'rgba(150,154,162,0.4)'; x.lineWidth = 1.5; x.stroke();
  label('SOLID STATE', 0.24, 0.523, '#c4c8cf', 15);

  // ── Woven speaker grille (the big block, lower-left) ──
  const gx0 = U(0.06), gy0 = V(0.565), gw = U(0.56), gh = V(0.23);
  _rr(x, gx0, gy0, gw, gh, 6); x.fillStyle = '#0a0b0d'; x.fill();
  x.save(); _rr(x, gx0, gy0, gw, gh, 6); x.clip();
  for (let yy = gy0 + 5; yy < gy0 + gh; yy += 6) {
    for (let xx = gx0 + 5; xx < gx0 + gw; xx += 6) {
      x.fillStyle = 'rgba(150,154,160,0.18)'; x.fillRect(xx, yy, 2, 2);          // weave highlight
      x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(xx + 2, yy + 2, 2, 2);         // weave shadow
    }
  }
  x.restore();
  x.strokeStyle = 'rgba(150,154,162,0.25)'; x.lineWidth = 1.5; _rr(x, gx0, gy0, gw, gh, 6); x.stroke();

  // ── Right strip: COLOR TONE + COLOR knobs ──
  label('COLOR TONE', 0.85, 0.540, faint, 10);
  bakeSocket(U(PANEL.toneKnob.u), V(PANEL.toneKnob.v), CW * 0.072);
  // red/green index arc behind the COLOR TONE knob
  x.lineWidth = 4; x.strokeStyle = red;
  x.beginPath(); x.arc(U(PANEL.toneKnob.u), V(PANEL.toneKnob.v), CW * 0.078, -2.2, -0.5); x.stroke();
  x.strokeStyle = '#2faa55';
  x.beginPath(); x.arc(U(PANEL.toneKnob.u), V(PANEL.toneKnob.v), CW * 0.078, -2.7, -2.3); x.stroke();
  label('COLOR', 0.85, 0.688, faint, 10);
  bakeSocket(U(PANEL.colorKnob.u), V(PANEL.colorKnob.v), CW * 0.072);
  x.lineWidth = 4; x.strokeStyle = red;
  x.beginPath(); x.arc(U(PANEL.colorKnob.u), V(PANEL.colorKnob.v), CW * 0.078, -2.2, -0.5); x.stroke();

  // ── Bottom row: SKIN DEEP badge + earphone jacks ──
  _engrave(x, U(0.05), V(0.835), U(0.62), V(0.835));
  _rr(x, U(0.42), V(0.905), U(0.30), V(0.05), 4); x.fillStyle = '#0c0d10'; x.fill();
  x.strokeStyle = 'rgba(150,154,162,0.4)'; x.lineWidth = 1.5; x.stroke();
  label('SKIN DEEP', 0.57, 0.930, '#c4c8cf', 14);
  label('EAR PHONE', 0.845, 0.880, faint, 10);
  PANEL.jacks.forEach(j => {
    x.beginPath(); x.arc(U(j.u), V(j.v), CW * 0.028, 0, Math.PI * 2);
    x.fillStyle = '#050608'; x.fill();
    x.lineWidth = 2; x.strokeStyle = 'rgba(150,154,162,0.45)'; x.stroke();
  });

  const t = new THREE.CanvasTexture(c);
  return t;
}

// A centred rounded-rectangle Shape (outer cabinet / frame extrudes).
function _roundedRectShape(w, h, r) {
  const x = -w / 2, y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
// Trace a centred rounded-rect onto an existing Path/Shape (used to punch the screen hole
// in the chrome bezel frame).
function _roundRectInto(p, w, h, r) {
  const x = -w / 2, y = -h / 2;
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);  p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r);  p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);  p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r);  p.quadraticCurveTo(x, y, x + r, y);
}

// A box whose back face (most-negative Z) is scaled inward — the tapered tube housing that
// gives the set its bulky CRT depth instead of a flat slab back.
function _makeTaperedBox(w, h, d, backScale) {
  const geo = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  const pos = geo.attributes.position;
  const zb = -d / 2;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getZ(i) - zb) < 1e-4) {
      pos.setX(i, pos.getX(i) * backScale);
      pos.setY(i, pos.getY(i) * backScale);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

// Assemble the TV from primitives. The body never changes, so this is built once and
// cached on CRT._model, reused across opens.
function _buildCrtTv() {
  const g = new THREE.Group();
  const S  = CRT_SIZE;
  const W  = S, H = S * 0.72, D = S * 0.74;
  const fz = D / 2;                          // front face plane (+Z faces the player)
  const woodW = W * 0.075;                   // each wood end-panel thickness
  const WF = W - 2 * woodW;                  // front-frame span between the wood sides

  // ── Materials ──
  const woodMat   = new THREE.MeshStandardMaterial({ color: 0xb07a45, map: CRT.woodTex, bumpMap: CRT.woodTex, bumpScale: 0.05, roughness: 0.66, metalness: 0.04 });
  // Brushed-silver front frame + trim — bright satin aluminium (specular, never washes).
  const frameMat  = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.34, metalness: 0.92, roughnessMap: CRT.brushedTex, bumpMap: CRT.brushedTex, bumpScale: 0.005 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xaab0b8, roughness: 0.2,  metalness: 0.96 });
  // Dark glossy chassis / recesses — hold their tone under the orb (low roughness).
  const chassisMat = new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.5, metalness: 0.2 });
  const recessMat  = new THREE.MeshStandardMaterial({ color: 0x070809, roughness: 0.4, metalness: 0.1 });
  const panelMat   = new THREE.MeshStandardMaterial({ map: CRT.panelTex, roughness: 0.62, metalness: 0.12, bumpMap: CRT.panelTex, bumpScale: 0.006 });
  const dialCapMat = new THREE.MeshStandardMaterial({ color: 0x121316, roughness: 0.26, metalness: 0.45 });
  const knobMat    = new THREE.MeshStandardMaterial({ color: 0x86898f, roughness: 0.34, metalness: 0.9, roughnessMap: CRT.brushedTex });
  const pointerMat = new THREE.MeshBasicMaterial({ color: 0xe4e7ea });
  const jackMat    = new THREE.MeshStandardMaterial({ color: 0x4a4d54, roughness: 0.3, metalness: 0.85 });
  // Emissive coloured pops (can't wash out — hue is added on top of the lighting).
  const btnOrangeMat = new THREE.MeshStandardMaterial({ color: 0x2a1402, roughness: 0.34, emissive: 0xff8a24, emissiveIntensity: 0.9 });
  const btnGreenMat  = new THREE.MeshStandardMaterial({ color: 0x05210f, roughness: 0.34, emissive: 0x33d66a, emissiveIntensity: 0.85 });
  const btnBlueMat   = new THREE.MeshStandardMaterial({ color: 0x041826, roughness: 0.34, emissive: 0x36a8ff, emissiveIntensity: 0.9 });
  const toneTopMat   = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.3, metalness: 0.4 });
  const ledMat    = new THREE.MeshStandardMaterial({ color: 0x2a1402, roughness: 0.4, emissive: 0xff8a24, emissiveIntensity: 1.7 });
  const badgeMat  = new THREE.MeshBasicMaterial({ map: CRT.badgeTex, transparent: true, depthWrite: false });
  const ventMat   = new THREE.MeshBasicMaterial({ map: CRT.ventTex, transparent: true, depthWrite: false });
  const glareMat  = new THREE.MeshBasicMaterial({ map: CRT.glareTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.45 });
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x070f0c, roughness: 0.1, metalness: 0.22,
    emissive: 0x2b4a3a, emissiveMap: CRT.staticTex, emissiveIntensity: 0.45,
  });
  CRT.screenMat = screenMat;

  // ── Chassis core + tapered rear tube housing (mostly hidden; gives bulk + dark back) ──
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(WF + 0.04, H * 0.96, D * 0.5), chassisMat);
  chassis.position.set(0, 0, fz - D * 0.25 - 0.02);
  g.add(chassis);
  const rearLen = D * 0.56;
  const rear = new THREE.Mesh(_makeTaperedBox(WF * 0.92, H * 0.9, rearLen, 0.66), chassisMat);
  rear.position.set(0, 0, -D / 2 + rearLen / 2);
  g.add(rear);

  // ── Wood side end-panels — protrude slightly past the front frame and the top. ──
  const sideGeo = new THREE.BoxGeometry(woodW, H * 1.02, D * 0.98);
  [-1, 1].forEach(sx => {
    const side = new THREE.Mesh(sideGeo, woodMat);
    side.position.set(sx * (W / 2 - woodW / 2), 0, -0.01);
    g.add(side);
  });

  // ── Brushed-silver front frame — a beveled rounded plate between the wood sides. ──
  const frameDepth = 0.09;
  const frameGeo = new THREE.ExtrudeGeometry(_roundedRectShape(WF, H * 0.98, 0.10), {
    depth: frameDepth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 2, curveSegments: 5,
  });
  frameGeo.translate(0, 0, fz - frameDepth);
  const frame = new THREE.Mesh(frameGeo, frameMat);
  g.add(frame);

  // ══ SCREEN (left of the frame) ══
  const sx = -WF * 0.17, sy = H * 0.045;
  const openW = WF * 0.50, openH = openW * 0.80;
  const bezT = WF * 0.045, bezR = WF * 0.07;

  // Dark recess box behind the glass so the cavity never shows the silver through.
  const recess = new THREE.Mesh(new THREE.BoxGeometry(openW, openH, 0.12), recessMat);
  recess.position.set(sx, sy, fz - 0.05);
  g.add(recess);

  // Chrome rounded bezel frame around the opening (extruded ring with a rounded hole).
  const bezOuter = _roundedRectShape(openW + 2 * bezT, openH + 2 * bezT, bezR + bezT);
  const bezHole = new THREE.Path(); _roundRectInto(bezHole, openW, openH, bezR);
  bezOuter.holes.push(bezHole);
  const bezGeo = new THREE.ExtrudeGeometry(bezOuter, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2, curveSegments: 6 });
  const bezel = new THREE.Mesh(bezGeo, chromeMat);
  bezel.position.set(sx, sy, fz - 0.02);
  g.add(bezel);

  // Convex glass — a shallow spherical cap bulging toward the player.
  const capR = S * 1.6, capTheta = 0.22;
  const screenGeo = new THREE.SphereGeometry(capR, 40, 26, 0, Math.PI * 2, 0, capTheta);
  screenGeo.rotateX(Math.PI / 2);
  screenGeo.translate(0, 0, -capR);
  const rim = capR * Math.sin(capTheta);
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.scale.set((openW * 0.94 / 2) / rim, (openH * 0.94 / 2) / rim, 1);
  screen.position.set(sx, sy, fz + 0.02);
  g.add(screen);

  const glare = new THREE.Mesh(new THREE.PlaneGeometry(openW * 0.86, openH * 0.86), glareMat);
  glare.position.set(sx, sy, fz + 0.07);
  glare.renderOrder = 3;
  g.add(glare);

  // SKIN DEEP plaque on the frame, under the screen.
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(WF * 0.22, WF * 0.082), badgeMat);
  badge.position.set(sx, sy - openH / 2 - bezT - H * 0.07, fz + 0.005);
  g.add(badge);

  // Power LED on the frame, lower-left of the screen.
  const led = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 12), ledMat);
  led.rotation.x = Math.PI / 2;
  led.position.set(sx - openW / 2 - bezT - 0.02, sy - openH / 2, fz + 0.02);
  g.add(led);

  // ══ CONTROL PANEL (right of the frame) — baked faceplate + tactile overlays ══
  const panelX = WF * 0.345, panelY = H * 0.01;
  const panelH = H * 0.86, panelW = panelH * PANEL_ASPECT;
  // (u,v) on the faceplate → local model coords (u:0=left, v:0=top).
  const px = u => panelX + (u - 0.5) * panelW;
  const py = v => panelY + (0.5 - v) * panelH;
  const pZ = fz + 0.005;

  // Recessed charcoal panel box + a chrome surround lip, then the faceplate plane.
  const panelBox = new THREE.Mesh(new THREE.BoxGeometry(panelW + 0.04, panelH + 0.04, 0.06), recessMat);
  panelBox.position.set(panelX, panelY, fz - 0.02);
  g.add(panelBox);
  const faceplate = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), panelMat);
  faceplate.position.set(panelX, panelY, pZ);
  g.add(faceplate);

  // ── The two big channel dials ── chrome ring + dark glossy cap + white pointer.
  const ringGeo = new THREE.TorusGeometry(panelW * 0.20, panelW * 0.022, 8, 36);
  const capGeo  = new THREE.CylinderGeometry(panelW * 0.15, panelW * 0.14, 0.07, 36);
  const ptrGeo  = new THREE.BoxGeometry(0.012, panelW * 0.12, 0.012);
  [PANEL.vhfDial, PANEL.uhfDial].forEach(d => {
    const ring = new THREE.Mesh(ringGeo, chromeMat);
    ring.position.set(px(d.u), py(d.v), pZ + 0.02);
    g.add(ring);
    const cap = new THREE.Mesh(capGeo, dialCapMat);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(px(d.u), py(d.v), pZ + 0.05);
    g.add(cap);
    const ptr = new THREE.Mesh(ptrGeo, pointerMat);
    ptr.position.set(px(d.u), py(d.v) + panelW * 0.06, pZ + 0.09);
    g.add(ptr);
  });

  // ── Four small knobs (FINE/VOL, CONTRAST, COLOR TONE, COLOR) ──
  const smallKnobGeo = new THREE.CylinderGeometry(panelW * 0.075, panelW * 0.068, 0.06, 24);
  const colorKnobGeo = new THREE.CylinderGeometry(panelW * 0.065, panelW * 0.06, 0.055, 24);
  [PANEL.fineKnob, PANEL.contKnob].forEach(k => {
    const knob = new THREE.Mesh(smallKnobGeo, knobMat);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(px(k.u), py(k.v), pZ + 0.04);
    g.add(knob);
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.01, panelW * 0.055, 0.02), pointerMat);
    notch.position.set(px(k.u), py(k.v) + panelW * 0.03, pZ + 0.072);
    g.add(notch);
  });
  [PANEL.toneKnob, PANEL.colorKnob].forEach(k => {
    const knob = new THREE.Mesh(colorKnobGeo, toneTopMat);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(px(k.u), py(k.v), pZ + 0.04);
    g.add(knob);
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.01, panelW * 0.05, 0.02), pointerMat);
    notch.position.set(px(k.u), py(k.v) + panelW * 0.028, pZ + 0.07);
    g.add(notch);
  });

  // ── AUTO COLOR AFT pushbutton ──
  const autoBtn = new THREE.Mesh(new THREE.BoxGeometry(panelW * 0.16, panelH * 0.03, 0.035), dialCapMat);
  autoBtn.position.set(px(PANEL.autoBtn.u), py(PANEL.autoBtn.v), pZ + 0.025);
  g.add(autoBtn);

  // ── Three coloured pushbuttons (orange / green / blue emissive) ──
  const ovalGeo = new THREE.BoxGeometry(panelW * 0.14, panelH * 0.022, 0.03);
  [btnOrangeMat, btnGreenMat, btnBlueMat].forEach((mat, i) => {
    const ov = new THREE.Mesh(ovalGeo, mat);
    ov.position.set(px(PANEL.ovals[i].u), py(PANEL.ovals[i].v), pZ + 0.022);
    g.add(ov);
  });

  // ── Earphone jacks ──
  const jackGeo = new THREE.CylinderGeometry(panelW * 0.028, panelW * 0.028, 0.04, 16);
  PANEL.jacks.forEach(j => {
    const jk = new THREE.Mesh(jackGeo, jackMat);
    jk.rotation.x = Math.PI / 2;
    jk.position.set(px(j.u), py(j.v), pZ + 0.015);
    g.add(jk);
  });

  // ── Bottom vent slot across the lower front frame ──
  const vents = new THREE.Mesh(new THREE.PlaneGeometry(WF * 0.7, H * 0.08), ventMat);
  vents.position.set(0, -H * 0.43, fz + 0.005);
  g.add(vents);

  // ══ TOP: carry handle + telescoping antenna ══
  // Chrome carry handle — a low flat loop near the rear-centre of the top.
  const handleBarGeo = new THREE.BoxGeometry(W * 0.34, 0.05, 0.05);
  const handleBar = new THREE.Mesh(handleBarGeo, chromeMat);
  handleBar.position.set(0, H / 2 + 0.10, -D * 0.06);
  g.add(handleBar);
  const handlePostGeo = new THREE.BoxGeometry(0.05, 0.13, 0.05);
  [-1, 1].forEach(sx2 => {
    const post = new THREE.Mesh(handlePostGeo, chromeMat);
    post.position.set(sx2 * W * 0.16, H / 2 + 0.04, -D * 0.06);
    g.add(post);
  });

  // Telescoping antenna — a brushed base + two thin chrome rods rising and splaying back.
  const antBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.06, 16), frameMat);
  antBase.position.set(W * 0.22, H / 2 + 0.03, -D * 0.18);
  g.add(antBase);
  const rodLen = S * 0.95;
  const rodGeo = new THREE.CylinderGeometry(0.006, 0.012, rodLen, 10);
  rodGeo.translate(0, rodLen / 2, 0);
  [-1, 1].forEach(side => {
    const ear = new THREE.Group();
    ear.position.set(W * 0.22, H / 2 + 0.06, -D * 0.18);
    ear.rotation.z = side * 0.42;
    ear.rotation.x = -0.30;
    const rod = new THREE.Mesh(rodGeo, chromeMat);
    ear.add(rod);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), chromeMat);
    tip.position.y = rodLen;
    ear.add(tip);
    g.add(ear);
  });

  // ── Feet (dark, bottom corners) ──
  const footMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.8, metalness: 0.0 });
  const footGeo = new THREE.BoxGeometry(W * 0.07, H * 0.06, D * 0.07);
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([fxs, fzs]) => {
    const foot = new THREE.Mesh(footGeo, footMat);
    foot.position.set(fxs * (W / 2 - W * 0.09), -H / 2 - H * 0.02, fzs * (D / 2 - D * 0.1));
    g.add(foot);
  });

  return g;
}

// Build the canvas textures + cache the model once.
function _buildCrtAssets() {
  if (CRT._built) return;
  CRT.staticTex = makeCrtStaticTex(); _initTex(CRT.staticTex);
  CRT.glareTex  = makeCrtGlareTex();  _initTex(CRT.glareTex);
  CRT.brushedTex = makeCrtBrushedTex(); _initTex(CRT.brushedTex);
  CRT.woodTex   = makeCrtWoodTex();   _initTex(CRT.woodTex);
  CRT.ventTex   = makeCrtVentTex();   _initTex(CRT.ventTex);
  CRT.badgeTex  = makeCrtBadgeTex();  _initTex(CRT.badgeTex);
  CRT.panelTex  = makeCrtPanelTex();  CRT.panelTex.anisotropy = MAX_ANISO; _initTex(CRT.panelTex);
  CRT._model = _buildCrtTv();
  CRT._built = true;
}

function _openCrt(px, pz, openYaw) {
  if (crtPhase) return;
  _buildCrtAssets();
  beginExhibitDPR();

  const fl = floaters[CRT.floaterIdx];
  setTriggerFloater(fl);
  _setFloaterVisible(fl, false);

  crtPhase = 'opening';
  crtT     = 0;
  crtGroup = new THREE.Group();
  _crtFwd.set(Math.sin(openYaw), 0, Math.cos(openYaw));
  crtGroup.position.set(px + _crtFwd.x * CRATE_DIST, CRT_Y, pz + _crtFwd.z * CRATE_DIST);
  crtGroup.rotation.y = openYaw + Math.PI;   // face the player
  scene.add(crtGroup);

  // The cached model is detached (not disposed) on close, so it survives across opens.
  crtGroup.add(CRT._model);
  crtGroup.userData.model = CRT._model;
  crtGroup.scale.setScalar(0.04);
}

function _closeCrt() {
  if (crtGroup) {
    if (crtGroup.userData.model) crtGroup.remove(crtGroup.userData.model); // keep the cached model
    _disposeCrateObject(crtGroup);
    scene.remove(crtGroup);
    crtGroup = null;
  }
  crtPhase = null;
  crtT     = 0;
  endExhibitDPR();
  _restoreExhibitFloater();
  setCD(0.6);
}

function _dismissCrt() {
  if (!crtPhase || crtPhase === 'closing') return;
  crtPhase = 'closing';
  crtT = 1;
  _restoreExhibitFloater();
}

registerExhibit({
  id: 'crt-tv',
  floater: CRT.floaterIdx,
  open: (px, pz, yaw) => _openCrt(px, pz, yaw),
  isActive: () => !!crtPhase,
  dismiss: () => _dismissCrt(),
  // PARTIAL dim (≈0.5). Unlike the old cream-cabinet set (which needed a full black-out so
  // it didn't blow to white), this rebuild is brushed metal + dark glossy + walnut — none
  // of which wash out. A full dim would dull the bright-silver Trinitron look, so the room
  // only drops to ~50%: the green screen glow reads while the aluminium stays bright.
  dimsRoom: () => (crtPhase === 'opening' || crtPhase === 'open') ? 0.5 : 0,
  update(ctx) {
    // Escape (desktop) or tap (mobile) dismisses, same as walking out of radius.
    if (ctx.escEdge && ctx.iCD <= 0 && crtPhase && crtPhase !== 'closing') {
      _dismissCrt(); hidePrompt(); ctx.setCD(0.3);
    } else if (ctx.eEdge && isMobile && ctx.iCD <= 0 && crtPhase === 'open') {
      _dismissCrt(); hidePrompt(); ctx.setCD(0.3);
    }
    // Open / close scale animation
    if (crtPhase === 'opening') {
      crtT = Math.min(1, crtT + ctx.dt / OPEN_DUR);
      const s = crtT * crtT * (3 - 2 * crtT);
      if (crtGroup) crtGroup.scale.setScalar(0.04 + s * 0.96);
      if (crtT >= 1) crtPhase = 'open';
    } else if (crtPhase === 'closing') {
      crtT = Math.max(0, crtT - ctx.dt / CLOSE_DUR);
      const s = crtT * crtT * (3 - 2 * crtT);
      if (crtGroup) crtGroup.scale.setScalar(0.04 + s * 0.96);
      if (crtT <= 0) _closeCrt();
    }
    if (crtGroup) crtGroup.position.y = CRT_Y + Math.sin(ctx.t * 1.4) * 0.03;
    // Faint static glow — one scalar nudge + a cheap texture crawl (no array writes)
    if (CRT.screenMat) CRT.screenMat.emissiveIntensity = 0.72 + Math.sin(ctx.t * 40) * 0.14 + Math.sin(ctx.t * 7.3) * 0.07;
    if (CRT.staticTex) CRT.staticTex.offset.y = (ctx.t * 0.6) % 1;
  },
});
