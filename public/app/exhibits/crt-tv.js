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
  THREE, scene, camera, renderer, isMobile, floaters, MAX_ANISO,
  CRATE_DIST, OPEN_DUR, CLOSE_DUR,
  registerExhibit, keys,
  initTex: _initTex,
  setFloaterVisible: _setFloaterVisible,
  restoreFloater: _restoreExhibitFloater,
  disposeObject3D: _disposeCrateObject,
  setTriggerFloater, beginExhibitDPR, endExhibitDPR, setCD, hidePrompt,
  elMmWrap: _elMmWrap, elUi: _elUi, jZone: _jZone,
  scheduleIdle,
} = core;

const CRT = {
  floaterIdx: 6,    // the white "static" sphere at the front of the room
  _model: null,     // cached THREE.Group — the body never changes, build once
  _built: false,
  staticTex: null,  // canvas textures, built once
  glareTex: null,
  logoTex: null,    // SKIN DEEP wordmark for the bouncing-DVD-logo screensaver
  logoMesh: null,   // the bouncing logo plane (kept so update() can drift it)
  panelTex: null,   // baked control-panel faceplate (dials' number rings, labels, grille, badges)
  badgeTex: null,   // SKIN DEEP wordmark plaque (front frame)
  brushedTex: null, // brushed-metal roughness/bump for the silver frame + trim
  woodTex: null,    // walnut wood-grain for the side end panels
  ventTex: null,    // bottom vent slats
  screenMat: null,  // kept so update() can flicker the screen emissive
  spot: null,       // dedicated key light from above the TV (scene-level, not parented)
  spotTarget: null,
  section: null,    // THREE.Group: screen + control panel, lifts out into focus (like the MPC deck)
  screen: null,     // screen mesh ref — used to measure the focused content for recentring
  faceplate: null,  // control-panel faceplate ref — the other measured extent
  _secLitMats: null,// section-only metals whose emissive ramps up in focus so they read off the spot
  haloTex: null,    // soft glowing ring drawn around the section (the "ready to focus" cue)
  halo: null,       // halo mesh framing the section (pulsed in update, hidden once focused)
  haloMat: null,    // kept so update() can pulse the halo opacity
  channelDials: null, // [{group,dir,turnTo}] — VHF(+1)/UHF(-1) dials that step the video list
  channelHits: null,  // invisible raycast discs over each dial (generous tap targets)
  dialGlowTex: null,  // soft ring glow texture drawn behind each dial (the "navigate here" cue)
  dialGlowMat: null,  // shared additive material, pulsed in update() while focused
};

const CRT_SIZE = 4.6;  // overall TV width; every part is a fraction of this
const CRT_Y    = 1.7;  // group-center height — screen sits near eye level (raised with the bigger cabinet so the feet clear the floor)
const SPOT_INT = 42;   // peak intensity of the overhead key light on the TV (decay 1, ~6.5u away — scaled up with the larger cabinet)
const _crtFwd  = new THREE.Vector3();

let crtPhase = null;   // 'opening' | 'open' | 'closing' | null
let crtT     = 0;
let crtGroup = null;

// ── Body proportions + section placement (hoisted to module scope so the section centre
//    can be derived once and shared between the builder and the focus maths) ──
const S  = CRT_SIZE;
const W  = S, H = S * 0.61, D = S * 0.74;  // landscape face (~1.5:1) like the reference, not square
const fz = D / 2;                          // front face plane (+Z faces the player)
const woodW = W * 0.06;                    // thin wood end-panels — let the silver front dominate
const WF = W - 2 * woodW;                  // front-frame span between the wood sides

const sx = -WF * 0.13, sy = H * 0.03;          // screen centre — shifted to claim more width
const openW = WF * 0.72, openH = openW * 0.82; // BIG screen window
const bezT = WF * 0.015, bezR = WF * 0.055;    // very thin bezel
const panelX = WF * 0.378, panelY = H * 0.01;  // control-panel pushed to the right edge
const PANEL_ASPECT = 0.38;   // width / height of the panel plane (must match the panel geometry/texture below).
const panelH = H * 0.84, panelW = panelH * PANEL_ASPECT;
const panelR = panelW * 0.06;

// Combined planar centre + extents of the screen window + control-panel window. The section
// group's origin sits here so it scales/rotates about itself (mirrors the MPC deck centre).
const _secMinX = Math.min(sx - openW / 2 - bezT, panelX - panelW / 2 - bezT);
const _secMaxX = Math.max(sx + openW / 2 + bezT, panelX + panelW / 2 + bezT);
const _secMinY = Math.min(sy - openH / 2 - bezT, panelY - panelH / 2 - bezT);
const _secMaxY = Math.max(sy + openH / 2 + bezT, panelY + panelH / 2 + bezT);
const SEC_CX = (_secMinX + _secMaxX) / 2;
const SEC_CY = (_secMinY + _secMaxY) / 2;
const SEC_CZ = fz;                         // front plane (per-mesh Z offsets stay small around it)
const SEC_W  = _secMaxX - _secMinX;        // combined width  (still sizes the "ready" halo plane)
const SEC_H  = _secMaxY - _secMinY;        // combined height
// (SEC_CX/CY/CZ position the section group inside the cabinet model; the section no longer lifts
//  out, so the focus-tween constants/scratch are gone — only the halo still reads SEC_W/SEC_H.)

// ── Watch state — is the centered video modal up? Replaces the old three-phase screen-lift focus.
//    The video is now an HTML lightbox (#crt-yt-embed), structurally identical to the MPC's (which
//    ad-blockers leave alone), NOT an iframe pinned to the 3D glass — so the section never reparents
//    or lifts; the cabinet just sits open while the modal plays on top. ──
let crtWatching = false;
let _crtNavL = false, _crtNavR = false;   // desktop ← / → channel-key edges (live only while watching)

// ── Bouncing screensaver state (classic DVD-logo edge reflection) ──
// All in screen-local units, as an offset from the screen centre (_logoBaseX/Y).
let logoX = 0, logoY = 0;          // current offset from screen centre
let logoVX = 0, logoVY = 0;        // velocity (units/sec)
let logoHalfX = 0, logoHalfY = 0;  // travel bounds (set at build from screen size)
let logoHue = 0.58;                // cycles on each wall hit
let _logoBaseX = 0, _logoBaseY = 0;
const LOGO_SPEED = 0.6;            // base drift speed (units/sec); each axis gets 0.5–1.0× of it

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
  const N = 200;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d');
  const img = x.createImageData(N, N);
  const d = img.data;
  const cx = N / 2, cy = N / 2, maxd = Math.hypot(cx, cy);
  for (let yy = 0; yy < N; yy++) {
    for (let xx = 0; xx < N; xx++) {
      // Full-contrast NEUTRAL snow: each grain is an independent grey from near-black to
      // white. Writing the same value to R/G/B (no per-column phosphor tint) is what keeps it
      // reading as analogue "snow" — the old aperture-grille tint laid down fixed vertical RGB
      // stripes that, scrolled by the green emissive, looked like falling Matrix code.
      let v = Math.random() * 255;
      if (yy % 2 === 0) v *= 0.7;                             // gentle scanlines (not stripes)
      const vig = Math.max(0, 1 - (Math.hypot(xx - cx, yy - cy) / maxd) * 1.12);
      v *= 0.3 + 0.7 * vig;                                   // dim toward edges
      const i = (yy * N + xx) * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
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

// Focus halo — a soft glowing rounded-square ring with a transparent centre, framing the
// section to signal it's ready to be brought into focus (mirrors the MPC's pad halo). Used
// additively; the centre shows the screen/panel through it. Small inset so the ring sits
// right at the section perimeter.
function makeCrtHaloTex() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  const inset = S * 0.06;
  x.strokeStyle = 'rgba(150,225,255,0.95)';
  x.shadowColor = 'rgba(110,200,255,0.95)';
  for (let i = 0; i < 4; i++) {
    x.shadowBlur = 12 + i * 11;
    x.lineWidth  = 7 - i * 1.3;
    _rr(x, inset, inset, S - inset * 2, S - inset * 2, 22);
    x.stroke();
  }
  return new THREE.CanvasTexture(c);
}

// Dial navigation glow — a soft cyan ring (transparent centre + edges) used additively behind
// each channel dial so, once the screen is focused, it reads as "turn me to change channel".
// Same hue as the focus halo so the interactive language is consistent across the piece.
function makeCrtDialGlowTex() {
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  const cx = S / 2, cy = S / 2, r = S / 2;
  const g = x.createRadialGradient(cx, cy, r * 0.30, cx, cy, r);
  g.addColorStop(0,    'rgba(150,225,255,0)');     // clear centre (the dial sits here)
  g.addColorStop(0.55, 'rgba(150,225,255,0.85)');  // bright ring around the dial rim
  g.addColorStop(0.78, 'rgba(110,200,255,0.30)');
  g.addColorStop(1,    'rgba(110,200,255,0)');      // fade out
  x.fillStyle = g; x.fillRect(0, 0, S, S);
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

// SKIN DEEP wordmark — a raised brushed-silver plate with engraved dark letters, matching
// the reference's "SONY" badge that sits on the screen's bottom bezel rail. The metal plate
// catches a top sheen; the lettering is engraved (dark fill + a 1px light highlight below).
function makeCrtBadgeTex() {
  const W = 256, Hh = 80;
  const c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const x = c.getContext('2d');
  x.clearRect(0, 0, W, Hh);
  // Plate body — vertical brushed-aluminium gradient inside a rounded rect.
  _rr(x, 10, 14, W - 20, Hh - 28, 7);
  const g = x.createLinearGradient(0, 14, 0, Hh - 14);
  g.addColorStop(0, '#d6d9dd'); g.addColorStop(0.5, '#aeb2b8'); g.addColorStop(1, '#888c92');
  x.fillStyle = g; x.fill();
  // fine horizontal brushing
  x.save(); _rr(x, 10, 14, W - 20, Hh - 28, 7); x.clip();
  for (let i = 0; i < 140; i++) {
    const yy = 14 + Math.random() * (Hh - 28);
    x.strokeStyle = 'rgba(255,255,255,0.07)'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(14, yy); x.lineTo(W - 14, yy); x.stroke();
  }
  x.restore();
  // raised-edge bevel: light top/left, dark bottom/right
  _rr(x, 10, 14, W - 20, Hh - 28, 7); x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 1.5; x.stroke();
  _rr(x, 11, 16, W - 22, Hh - 30, 6); x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 1; x.stroke();
  // engraved lettering
  x.font = '800 26px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(255,255,255,0.45)'; x.fillText('SKIN DEEP', 128, Hh / 2 + 1.5);  // highlight under
  x.fillStyle = '#232529';                x.fillText('SKIN DEEP', 128, Hh / 2);          // engraved ink
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
// PANEL_ASPECT (width/height of the panel plane) is declared up in the hoisted body-proportions
// block so the section-centre maths can use it. All knob/label coords are normalized (u,v) +
// canvas-px radii, so circles stay circular at any aspect.

function makeCrtPanelTex() {
  // SS = supersample factor. The whole faceplate is authored in a logical 480×1103 space
  // (every coord, radius, and font size below is in those units), but at 480px the small
  // labels and number rings rendered soft once the TV scales up in front of the player.
  // We back the canvas with an SS× denser bitmap and pre-scale the context, so the identical
  // artwork is rasterised at high resolution — crisp text/controls, no code below changes.
  // SS 1.8 (was 2.5) ~halves this 3.3MP→1.7MP canvas: a much cheaper one-shot build + GPU upload
  // when the player approaches the TV (the prewarm), still crisp at the in-focus viewing distance.
  const SS = 1.8;
  const CW = 480, CH = Math.round(CW / PANEL_ASPECT);   // ≈ 1103 (logical design space)
  const c = document.createElement('canvas');
  c.width = Math.round(CW * SS); c.height = Math.round(CH * SS);
  const x = c.getContext('2d');
  x.scale(SS, SS);                                      // draw in logical units at SS× density
  const U = u => u * CW, V = v => v * CH;
  const ink = '#f2f4f8', faint = '#d2d6dd', red = '#ff4636';   // bright marks for contrast in the recess

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
    x.lineWidth = 2; x.strokeStyle = 'rgba(205,210,220,0.4)'; x.stroke();
    x.fillStyle = ink; x.font = '700 15px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const n = labels.length;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;   // start at top, clockwise
      const lr = rOuter - 13;
      x.fillText(labels[i], cx + Math.cos(a) * lr, cy + Math.sin(a) * lr);
      // tick mark just outside the numbers
      x.strokeStyle = 'rgba(205,210,220,0.5)'; x.lineWidth = 1.5;
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
    x.lineWidth = 2; x.strokeStyle = 'rgba(205,210,220,0.32)'; x.stroke();
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
  x.strokeStyle = '#e0e3ea'; x.lineWidth = 1.5; x.stroke();
  label('COLOR', 0.81, 0.055, '#f4f6fa', 18);
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
  x.strokeStyle = 'rgba(205,210,220,0.4)'; x.lineWidth = 1.5; x.stroke();
  label('SOLID STATE', 0.24, 0.523, '#eaedf2', 15);

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
  x.strokeStyle = 'rgba(205,210,220,0.25)'; x.lineWidth = 1.5; _rr(x, gx0, gy0, gw, gh, 6); x.stroke();

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
  x.strokeStyle = 'rgba(205,210,220,0.4)'; x.lineWidth = 1.5; x.stroke();
  label('SKIN DEEP', 0.57, 0.930, '#eaedf2', 14);
  label('EAR PHONE', 0.845, 0.880, faint, 10);
  PANEL.jacks.forEach(j => {
    x.beginPath(); x.arc(U(j.u), V(j.v), CW * 0.028, 0, Math.PI * 2);
    x.fillStyle = '#050608'; x.fill();
    x.lineWidth = 2; x.strokeStyle = 'rgba(205,210,220,0.45)'; x.stroke();
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
// Same, but centred at an arbitrary (cx, cy) — used to punch the screen + control-panel
// windows through the silver front frame so each module recesses into the cabinet.
function _roundRectAtInto(p, cx, cy, w, h, r) {
  const x = cx - w / 2, y = cy - h / 2;
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
  // Body proportions (S/W/H/D/fz/woodW/WF) + window placement (sx/sy/openW/… panelR) are now
  // hoisted to module scope so the section centre (SEC_*) is derived once and shared.

  // ── Materials ──
  const woodMat   = new THREE.MeshStandardMaterial({ color: 0xba864e, map: CRT.woodTex, bumpMap: CRT.woodTex, bumpScale: 0.05, roughness: 0.62, metalness: 0.04 });
  // Front frame + trim — satin anodised aluminium. LOW metalness on purpose: a high-metal
  // surface reflects the orb light directly and blows out to cream/gold near the player.
  // Low metalness + mid-high roughness reads as a stable matte silver-grey that holds tone.
  // A faint brushed bump remains for grain; no roughnessMap (its variation added sparkle).
  const frameMat  = new THREE.MeshStandardMaterial({ color: 0xacb0b6, roughness: 0.66, metalness: 0.16, bumpMap: CRT.brushedTex, bumpScale: 0.004 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xbcc0c6, roughness: 0.5,  metalness: 0.22 });
  // Dark glossy chassis / recesses — hold their tone under the orb (low roughness).
  const chassisMat = new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.5, metalness: 0.2 });
  const recessMat  = new THREE.MeshStandardMaterial({ color: 0x070809, roughness: 0.4, metalness: 0.1 });
  // The faceplate is UNLIT (MeshBasic) — it shows the baked panel verbatim, exactly as
  // designed: crisp bright printed marks (labels, number rings, badges) on the charcoal
  // base, at full contrast. A lit (MeshStandard) faceplate was fragile on this dark-on-dark
  // art: under the orb/spot the charcoal base washed to grey (see the lighting-washout rule)
  // and crushed the text, while in the dim recess the text fell into shadow and vanished.
  // The genuinely tactile parts (dials/knobs) stay MeshStandard below, so they still shade;
  // this matches how the SKIN DEEP badge and the vents already render their baked art.
  const panelMat   = new THREE.MeshBasicMaterial({ map: CRT.panelTex });
  // Section-only metals carry an emissive that's dark/off in the cabinet but ramps up in
  // focus — lifted toward the camera they leave the overhead spot, so this self-lights them
  // (emissiveIntensity driven in update). chromeMat is SHARED with cabinet hardware (handle,
  // antenna), so the section's chrome (bezel + dial rings) uses a dedicated clone instead, or
  // the whole cabinet would glow too.
  const chromeSecMat = chromeMat.clone(); chromeSecMat.emissive = new THREE.Color(0x36393f); chromeSecMat.emissiveIntensity = 0;
  const dialCapMat = new THREE.MeshStandardMaterial({ color: 0x121316, roughness: 0.26, metalness: 0.45, emissive: 0x2a2c30, emissiveIntensity: 0 });
  const knobMat    = new THREE.MeshStandardMaterial({ color: 0x8d9097, roughness: 0.58, metalness: 0.18, emissive: 0x3a3d44, emissiveIntensity: 0 });
  const pointerMat = new THREE.MeshBasicMaterial({ color: 0xe4e7ea });
  const jackMat    = new THREE.MeshStandardMaterial({ color: 0x4a4d54, roughness: 0.5, metalness: 0.25, emissive: 0x26282d, emissiveIntensity: 0 });
  // Emissive coloured pops (can't wash out — hue is added on top of the lighting).
  const btnOrangeMat = new THREE.MeshStandardMaterial({ color: 0x2a1402, roughness: 0.34, emissive: 0xff8a24, emissiveIntensity: 0.9 });
  const btnGreenMat  = new THREE.MeshStandardMaterial({ color: 0x05210f, roughness: 0.34, emissive: 0x33d66a, emissiveIntensity: 0.85 });
  const btnBlueMat   = new THREE.MeshStandardMaterial({ color: 0x041826, roughness: 0.34, emissive: 0x36a8ff, emissiveIntensity: 0.9 });
  const toneTopMat   = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.3, metalness: 0.4, emissive: 0x26282d, emissiveIntensity: 0 });
  const ledMat    = new THREE.MeshStandardMaterial({ color: 0x2a1402, roughness: 0.4, emissive: 0xff8a24, emissiveIntensity: 1.7 });
  const badgeMat  = new THREE.MeshBasicMaterial({ map: CRT.badgeTex, transparent: true, depthWrite: false });
  const ventMat   = new THREE.MeshBasicMaterial({ map: CRT.ventTex, transparent: true, depthWrite: false });
  const glareMat  = new THREE.MeshBasicMaterial({ map: CRT.glareTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.45 });
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x0b0d0c, roughness: 0.1, metalness: 0.22,
    // Cool near-neutral grey with only a whisper of green (CRT phosphor cast) — a saturated
    // green here turned the neutral snow back into "green code". The snow is in the map.
    emissive: 0x44524c, emissiveMap: CRT.staticTex, emissiveIntensity: 0.45,
  });
  CRT.screenMat = screenMat;
  CRT._secLitMats = [chromeSecMat, dialCapMat, knobMat, toneTopMat, jackMat];

  // ── Chassis core + tapered rear tube housing (mostly hidden; gives bulk + dark back) ──
  // Its front face must stay BEHIND the recessed control-panel faceplate (pZ = fz-0.055):
  // at the old -0.02 offset the chassis front (fz-0.02) poked IN FRONT of the faceplate and
  // hid the whole baked panel (labels, rings, grille) behind a flat dark box, while the
  // proud dials/knobs and the SKIN DEEP badge still showed. Pushed back so the panel reads.
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(WF + 0.04, H * 0.96, D * 0.5), chassisMat);
  chassis.position.set(0, 0, fz - D * 0.25 - 0.28);
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

  // ══ Section placement: sx/sy/openW/openH/bezT/bezR/panelX/panelY/panelW/panelH/panelR are
  //    hoisted to module scope (used to derive SEC_*). The silver frame is CUT with the two
  //    openings (absolute model coords); the recessed CONTENT is built into `section` below. ══

  // ── Brushed-silver front frame — a true picture-frame: a beveled rounded plate with the
  //    screen window and the control-panel window PUNCHED THROUGH it. The silver sits proud
  //    and the bevel rolls into each opening, so both modules recess into the cabinet. ──
  const frameDepth = 0.12;
  const frameShape = _roundedRectShape(WF, H * 0.98, 0.10);
  const scrHole = new THREE.Path(); _roundRectAtInto(scrHole, sx, sy, openW, openH, bezR);
  const pnlHole = new THREE.Path(); _roundRectAtInto(pnlHole, panelX, panelY, panelW, panelH, panelR);
  frameShape.holes.push(scrHole, pnlHole);
  const frameGeo = new THREE.ExtrudeGeometry(frameShape, {
    depth: frameDepth, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 2, curveSegments: 5,
  });
  frameGeo.translate(0, 0, fz - frameDepth);
  const frame = new THREE.Mesh(frameGeo, frameMat);
  g.add(frame);

  // ══ SECTION — the recessed screen + control-panel CONTENT, grouped so the whole thing can
  //    lift out of the cabinet into front-facing focus (like the MPC pad deck / a vinyl
  //    record). The group's origin sits at the combined window centre, so it scales/rotates
  //    about itself; children are positioned in section-local coords via lx/ly/lz/px/py. The
  //    silver frame + cabinet shell stay in `g`. ══
  const section = new THREE.Group();
  section.position.set(SEC_CX, SEC_CY, SEC_CZ);
  const lx = X => X - SEC_CX;   // absolute model coord → section-local
  const ly = Y => Y - SEC_CY;
  const lz = Z => Z - SEC_CZ;   // SEC_CZ === fz (the front plane)

  // ══ SCREEN — recessed into its window ══
  // Dark cavity (covers the window from behind) + a proud chrome bezel rim + the glass set
  // back inside the mouth, so the screen clearly sits in a well below the silver face. The
  // cavity moves WITH the section so each module lifts as a solid slab (no empty well over
  // the chassis), leaving a clean silver picture-frame aperture behind.
  const recess = new THREE.Mesh(new THREE.BoxGeometry(openW + bezT, openH + bezT, 0.14), recessMat);
  recess.position.set(lx(sx), ly(sy), lz(fz - 0.15));
  section.add(recess);

  // Chrome rounded bezel rim seated at the front of the window.
  const bezOuter = _roundedRectShape(openW + 2 * bezT, openH + 2 * bezT, bezR + bezT);
  const bezHole = new THREE.Path(); _roundRectInto(bezHole, openW, openH, bezR);
  bezOuter.holes.push(bezHole);
  const bezGeo = new THREE.ExtrudeGeometry(bezOuter, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2, curveSegments: 6 });
  const bezel = new THREE.Mesh(bezGeo, chromeSecMat);
  bezel.position.set(lx(sx), ly(sy), lz(fz - 0.03));
  section.add(bezel);

  // Glass — a RECTANGULAR plane that fills the whole screen window (a circular sphere-cap
  // read as an oval and left the corners empty). A gentle parabolic forward bulge gives the
  // subtle CRT curve without the dome; the bezel's rounded inner edge rounds off the corners.
  const scrW = openW * 1.02, scrH = openH * 1.02;   // slightly oversized so it tucks under the bezel rim (no dark margin)
  const screenGeo = new THREE.PlaneGeometry(scrW, scrH, 24, 18);
  const _sp = screenGeo.attributes.position, _hw = scrW / 2, _hh = scrH / 2, _bulge = 0.05;
  for (let i = 0; i < _sp.count; i++) {
    const nx = _sp.getX(i) / _hw, ny = _sp.getY(i) / _hh;   // -1..1 across the screen
    _sp.setZ(i, _bulge * Math.max(0, 1 - (nx * nx + ny * ny) * 0.5));  // peak at centre, flat at edges
  }
  screenGeo.computeVertexNormals();
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.position.set(lx(sx), ly(sy), lz(fz - 0.06));   // edges sit back in the well; centre bulges to ~fz-0.01
  section.add(screen);
  CRT.screen = screen;

  const glare = new THREE.Mesh(new THREE.PlaneGeometry(openW * 0.86, openH * 0.86), glareMat);
  glare.position.set(lx(sx), ly(sy), lz(fz + 0.0));
  glare.renderOrder = 3;
  section.add(glare);

  // ══ Bouncing "SKIN DEEP" screensaver ══
  // A glowing wordmark that drifts across the snow and reflects off the screen edges (the old
  // DVD-logo bounce), flipping colour on every hit. ADDITIVE blending drops the logo art's
  // black background for free — only the white lettering adds light over the static — so the
  // source PNG needs no alpha. The material colour multiplies the white, so cycling it on each
  // bounce tints the glow. Driven per-frame in update(); it sits just in front of the glass.
  const logoW = openW * 0.40, logoH = logoW * (630 / 1200);   // source art is 1200×630
  const logoMat = new THREE.MeshBasicMaterial({
    map: CRT.logoTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85,
  });
  logoMat.color.setHSL(logoHue, 0.85, 0.6);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(logoW, logoH), logoMat);
  logo.position.set(lx(sx), ly(sy), lz(fz + 0.002));
  logo.renderOrder = 2;
  section.add(logo);
  CRT.logoMesh = logo;
  // Travel bounds keep the whole wordmark inside the glass; seed a diagonal drift. The bounce
  // base is section-local (the logo now lives in the section), so update()'s _logoBaseX/Y + offset
  // writes land correctly whether the section is home or lifted into focus.
  _logoBaseX = lx(sx); _logoBaseY = ly(sy);
  logoHalfX = Math.max(0, scrW / 2 - logoW / 2);
  logoHalfY = Math.max(0, scrH / 2 - logoH / 2);
  logoX = (Math.random() * 2 - 1) * logoHalfX * 0.5;
  logoY = (Math.random() * 2 - 1) * logoHalfY * 0.5;
  // Different speed on each axis (NOT equal — equal vx/vy only ever travels at 45°, so it
  // retraces the same diagonal diamond forever). Unequal components make the path wander and
  // fill the screen before it repeats.
  logoVX = (Math.random() < 0.5 ? -1 : 1) * LOGO_SPEED * (0.5 + Math.random() * 0.5);
  logoVY = (Math.random() < 0.5 ? -1 : 1) * LOGO_SPEED * (0.5 + Math.random() * 0.5);

  // SKIN DEEP plate — seated on the bottom rail of the chrome screen bezel, centred under
  // the screen, exactly where the reference's "SONY" plate sits.
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(WF * 0.20, WF * 0.0625), badgeMat);
  badge.position.set(lx(sx), ly(sy - openH / 2 - bezT * 0.9), lz(fz + 0.062));
  badge.renderOrder = 2;
  section.add(badge);

  // Power LED on the frame, lower-left of the screen.
  const led = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 12), ledMat);
  led.rotation.x = Math.PI / 2;
  led.position.set(lx(sx - openW / 2 - bezT - 0.02), ly(sy - openH / 2), lz(fz + 0.02));
  section.add(led);

  // ══ CONTROL PANEL — recessed into its window, baked faceplate + tactile overlays ══
  // (u,v) on the faceplate → local model coords (u:0=left, v:0=top). pZ is set BACK behind
  // the silver face so the dark faceplate sits in a well; the dials/knobs rise from it up
  // toward the rim (just like the reference, where the controls are sunk into the cabinet).
  const px = u => lx(panelX + (u - 0.5) * panelW);   // (u,v) → section-local
  const py = v => ly(panelY + (0.5 - v) * panelH);
  const pZ = lz(fz - 0.055);                          // = -0.055

  // Charcoal cavity filling the window from behind + the recessed faceplate plane.
  const panelBox = new THREE.Mesh(new THREE.BoxGeometry(panelW + bezT, panelH + bezT, 0.13), recessMat);
  panelBox.position.set(lx(panelX), ly(panelY), lz(fz - 0.125));
  section.add(panelBox);
  const faceplate = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), panelMat);
  faceplate.position.set(lx(panelX), ly(panelY), pZ);
  section.add(faceplate);
  CRT.faceplate = faceplate;

  // ── The two big channel dials ── chrome ring + dark glossy cap + white pointer.
  // Each dial is its OWN group (positioned at the dial centre, children at relative offsets) so
  // the whole dial can spin about its screen-facing axis (group.rotation.z) for the channel-turn
  // feedback. A generous invisible hit disc rides on top of each as the raycast tap target — it
  // renders nothing (material.visible:false) but still registers pointer hits.
  const ringGeo = new THREE.TorusGeometry(panelW * 0.20, panelW * 0.022, 8, 36);
  const capGeo  = new THREE.CylinderGeometry(panelW * 0.15, panelW * 0.14, 0.07, 36);
  const ptrGeo  = new THREE.BoxGeometry(0.012, panelW * 0.12, 0.012);
  const hitGeo  = new THREE.CircleGeometry(panelW * 0.26, 24);
  const hitMat  = new THREE.MeshBasicMaterial({ visible: false });
  // Shared ring-glow behind each dial — additive, opacity driven in update() (off in the cabinet,
  // pulses while focused so the dials read as the channel control).
  const glowGeo = new THREE.PlaneGeometry(panelW * 0.72, panelW * 0.72);
  const glowMat = new THREE.MeshBasicMaterial({
    map: CRT.dialGlowTex, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, opacity: 0,
  });
  CRT.dialGlowMat = glowMat;
  CRT.channelDials = [];
  CRT.channelHits  = [];
  // VHF dial = next channel (+1); UHF dial = previous channel (-1).
  [{ d: PANEL.vhfDial, dir: 1 }, { d: PANEL.uhfDial, dir: -1 }].forEach(({ d, dir }) => {
    const dg = new THREE.Group();
    dg.position.set(px(d.u), py(d.v), 0);
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.z = pZ + 0.012;   // behind the ring/cap so it haloes out around the rim
    glow.renderOrder = 4;
    dg.add(glow);
    const ring = new THREE.Mesh(ringGeo, chromeSecMat);
    ring.position.z = pZ + 0.02;
    dg.add(ring);
    const cap = new THREE.Mesh(capGeo, dialCapMat);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = pZ + 0.05;
    dg.add(cap);
    const ptr = new THREE.Mesh(ptrGeo, pointerMat);
    ptr.position.set(0, panelW * 0.06, pZ + 0.09);
    dg.add(ptr);
    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.position.z = pZ + 0.1;
    hit.userData.chDir = dir;
    dg.add(hit);
    section.add(dg);
    CRT.channelDials.push({ group: dg, dir, turnTo: 0 });
    CRT.channelHits.push(hit);
  });

  // ── Four small knobs (FINE/VOL, CONTRAST, COLOR TONE, COLOR) ──
  const smallKnobGeo = new THREE.CylinderGeometry(panelW * 0.075, panelW * 0.068, 0.06, 24);
  const colorKnobGeo = new THREE.CylinderGeometry(panelW * 0.065, panelW * 0.06, 0.055, 24);
  [PANEL.fineKnob, PANEL.contKnob].forEach(k => {
    const knob = new THREE.Mesh(smallKnobGeo, knobMat);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(px(k.u), py(k.v), pZ + 0.04);
    section.add(knob);
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.01, panelW * 0.055, 0.02), pointerMat);
    notch.position.set(px(k.u), py(k.v) + panelW * 0.03, pZ + 0.072);
    section.add(notch);
  });
  [PANEL.toneKnob, PANEL.colorKnob].forEach(k => {
    const knob = new THREE.Mesh(colorKnobGeo, toneTopMat);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(px(k.u), py(k.v), pZ + 0.04);
    section.add(knob);
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.01, panelW * 0.05, 0.02), pointerMat);
    notch.position.set(px(k.u), py(k.v) + panelW * 0.028, pZ + 0.07);
    section.add(notch);
  });

  // ── AUTO COLOR AFT pushbutton ──
  const autoBtn = new THREE.Mesh(new THREE.BoxGeometry(panelW * 0.16, panelH * 0.03, 0.035), dialCapMat);
  autoBtn.position.set(px(PANEL.autoBtn.u), py(PANEL.autoBtn.v), pZ + 0.025);
  section.add(autoBtn);

  // ── Three coloured pushbuttons (orange / green / blue emissive) ──
  const ovalGeo = new THREE.BoxGeometry(panelW * 0.14, panelH * 0.022, 0.03);
  [btnOrangeMat, btnGreenMat, btnBlueMat].forEach((mat, i) => {
    const ov = new THREE.Mesh(ovalGeo, mat);
    ov.position.set(px(PANEL.ovals[i].u), py(PANEL.ovals[i].v), pZ + 0.022);
    section.add(ov);
  });

  // ── Earphone jacks ──
  const jackGeo = new THREE.CylinderGeometry(panelW * 0.028, panelW * 0.028, 0.04, 16);
  PANEL.jacks.forEach(j => {
    const jk = new THREE.Mesh(jackGeo, jackMat);
    jk.rotation.x = Math.PI / 2;
    jk.position.set(px(j.u), py(j.v), pZ + 0.015);
    section.add(jk);
  });

  // ── Focus halo: a glowing frame lying just in front of the section, signalling it's ready
  //    to be brought into focus. Sized a touch larger than the combined content; pulsed in
  //    update(). Hidden once focused (and in any non-open phase). ──
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(SEC_W * 1.08, SEC_H * 1.12),
    new THREE.MeshBasicMaterial({
      map: CRT.haloTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }),
  );
  halo.position.set(0, 0, lz(fz + 0.12));
  halo.renderOrder = 6;
  halo.visible = false;   // update() reveals it once the unit is fully open
  section.add(halo);
  CRT.halo = halo;
  CRT.haloMat = halo.material;

  // The assembled section joins the cabinet; focus reparents it to the scene and back.
  g.add(section);
  CRT.section = section;

  // ── Bottom vent slot across the lower silver rail (kept below both punched windows) ──
  const vents = new THREE.Mesh(new THREE.PlaneGeometry(WF * 0.62, H * 0.035), ventMat);
  vents.position.set(-WF * 0.06, -H * 0.465, fz + 0.005);
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

// Per-field build steps — each idempotent (skips a field already built), so they run either
// all-at-once (_buildCrtAssets, the open-time fallback) or one-per-idle-tick (_crtIdlePrebuild,
// the on-approach preload). The ExtrudeGeometry model + the panel canvas are the heavy ones.
function _crtAssetSteps() {
  return [
    () => { if (!CRT.staticTex)   { CRT.staticTex   = makeCrtStaticTex();   _initTex(CRT.staticTex); } },
    () => { if (!CRT.glareTex)    { CRT.glareTex    = makeCrtGlareTex();    _initTex(CRT.glareTex); } },
    () => { if (!CRT.logoTex)     { CRT.logoTex     = new THREE.TextureLoader().load('images/skindeep/image.png', _initTex); } },
    () => { if (!CRT.brushedTex)  { CRT.brushedTex  = makeCrtBrushedTex();  _initTex(CRT.brushedTex); } },
    () => { if (!CRT.ventTex)     { CRT.ventTex     = makeCrtVentTex();     _initTex(CRT.ventTex); } },
    () => { if (!CRT.badgeTex)    { CRT.badgeTex    = makeCrtBadgeTex();    _initTex(CRT.badgeTex); } },
    () => { if (!CRT.haloTex)     { CRT.haloTex     = makeCrtHaloTex();     _initTex(CRT.haloTex); } },
    () => { if (!CRT.dialGlowTex) { CRT.dialGlowTex = makeCrtDialGlowTex(); _initTex(CRT.dialGlowTex); } },
    () => { if (!CRT.woodTex)     { CRT.woodTex     = makeCrtWoodTex();     _initTex(CRT.woodTex); } },
    () => { if (!CRT.panelTex)    { CRT.panelTex    = makeCrtPanelTex();    CRT.panelTex.anisotropy = MAX_ANISO; _initTex(CRT.panelTex); } },
    () => { if (!CRT._model)      { CRT._model      = _buildCrtTv(); } },
  ];
}

// Synchronous build — the open-time fallback if the player opens before the idle preload finishes.
function _buildCrtAssets() {
  if (CRT._built) return;
  const steps = _crtAssetSteps();
  for (let i = 0; i < steps.length; i++) steps[i]();
  CRT._built = true;
}

// On-approach preload (fired once by core's floater-loop proximity hook): build the assets one
// slice per idle tick — so the first open is instant without a single long hitch during roam —
// then pre-warm the tone-map shader programs.
let _crtPrebuilding = false;
function _crtIdlePrebuild() {
  if (CRT._built || _crtPrebuilding) return;
  _crtPrebuilding = true;
  const steps = _crtAssetSteps();
  let i = 0;
  const step = () => {
    if (i >= steps.length) { CRT._built = true; _prewarmCrtToneMap(); return; }
    steps[i++]();
    scheduleIdle(step);
  };
  scheduleIdle(step);
}

// ══ Tone-mapping override (mobile only) ══
// Desktop already runs ACESFilmicToneMapping, whose smooth highlight rolloff renders the set as
// the soft, contained look we want. Mobile runs NoToneMapping globally (so the photo exhibits stay
// punchy), which clamps the warm overhead key linearly — the silver frame snaps to a harsh flat
// white. While THIS exhibit is open we temporarily give the renderer the same ACES curve + exposure
// as desktop, then restore NoToneMapping on close so every other mobile exhibit is untouched.
//
// Three.js bakes the tone-mapping operator into each compiled shader program, so changing
// renderer.toneMapping at runtime has NO effect until every affected material is flagged for
// recompile. Hence the scene-wide needsUpdate sweep below — it runs exactly once on open and once
// on close (never per-frame); the resulting one-time shader rebuild is masked by the open/close
// scale animation.
const CRT_TONEMAP_EXPOSURE = 1.15;   // mirrors the desktop toneMappingExposure set in core.js
let _savedToneMapping = null, _savedExposure = 1;

// Flag every material in the scene for a shader rebuild so they pick up the new tone mapping.
function _refreshSceneMaterials() {
  scene.traverse(o => {
    const m = o.material;
    if (!m) return;
    if (Array.isArray(m)) m.forEach(mm => { if (mm) mm.needsUpdate = true; });
    else m.needsUpdate = true;
  });
}
function _applyCrtToneMap() {
  if (!isMobile) return;                 // desktop is already ACES — nothing to do
  const r = core.renderer;
  _savedToneMapping = r.toneMapping;
  _savedExposure    = r.toneMappingExposure;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = CRT_TONEMAP_EXPOSURE;
  _refreshSceneMaterials();
}
function _restoreCrtToneMap() {
  if (!isMobile || _savedToneMapping === null) return;
  const r = core.renderer;
  r.toneMapping = _savedToneMapping;
  r.toneMappingExposure = _savedExposure;
  _savedToneMapping = null;
  _refreshSceneMaterials();
}

// Pre-compile the ACES tone-map shader variants once (mobile), during the on-approach idle
// preload, so the scene-wide recompile that _applyCrtToneMap triggers is already cached when
// the CRT actually opens — making the first open hitch-free. No visual change: toggle to ACES,
// force the compile, then toggle straight back to the live NoToneMapping (whose variants were
// already compiled at startup, so the restore is a cheap cached re-derive).
let _crtToneWarmed = false;
let _crtUIHidden = false;   // cached focus-hidden state so update() only toggles HUD classes on change
function _prewarmCrtToneMap() {
  if (!isMobile || _crtToneWarmed || crtPhase) return;
  _crtToneWarmed = true;
  const savedTM = renderer.toneMapping, savedExp = renderer.toneMappingExposure;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CRT_TONEMAP_EXPOSURE;
  _refreshSceneMaterials();
  try { renderer.compile(scene, camera); } catch (e) {}   // compile + cache the ACES programs now
  renderer.toneMapping = savedTM;
  renderer.toneMappingExposure = savedExp;
  _refreshSceneMaterials();   // back to the live (already-cached) NoToneMapping variants
}

function _openCrt(px, pz, openYaw) {
  if (crtPhase) return;
  _buildCrtAssets();
  _crtPreconnect();      // warm the video hosts now; the iframe src is set later, on watch
  _preloadCrtThumbs();   // prime the channel posters during idle so the first press is instant
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

  // ── Dedicated key light ──
  // While this exhibit is open the orb is knocked right back (see dimsRoom), so the set
  // would otherwise sit in the dark. A soft spot mounted above and slightly in FRONT of
  // the TV (player side) rakes down the face — it lights the cabinet evenly without the
  // hot orb specular that was blowing the front out. Scene-level so it doesn't scale with
  // the open animation; intensity ramps with crtT in update().
  const tx = crtGroup.position.x, tz = crtGroup.position.z;
  // Offsets scale with the cabinet (≈1.28× the old 3.6 set) so the spot keeps the same rake
  // across the taller/wider face; range + cone widen to match the larger footprint.
  const spot = new THREE.SpotLight(0xfff1d6, 0, 22, 0.78, 0.55, 1.0);
  spot.position.set(tx - _crtFwd.x * 2.0, CRT_Y + 6.1, tz - _crtFwd.z * 2.0);
  const tgt = new THREE.Object3D();
  tgt.position.set(tx, CRT_Y - 0.3, tz);
  scene.add(tgt);
  spot.target = tgt;
  scene.add(spot);
  CRT.spot = spot;
  CRT.spotTarget = tgt;

  // Switch the renderer to the desktop ACES curve (mobile only) now that the model + spot are in
  // the scene, so the sweep recompiles the CRT's own materials along with the room's.
  _applyCrtToneMap();
}

function _closeCrt() {
  _resetCrtWatch();   // stop the clip + drop the modal (the section never reparents now)
  _resetCrtDials();   // back to channel 1, dials at rest (cabinet model is cached across opens)
  if (crtGroup) {
    if (crtGroup.userData.model) crtGroup.remove(crtGroup.userData.model); // keep the cached model
    _disposeCrateObject(crtGroup);
    scene.remove(crtGroup);
    crtGroup = null;
  }
  if (CRT.spot) {
    scene.remove(CRT.spot); scene.remove(CRT.spotTarget);
    CRT.spot.dispose?.();
    CRT.spot = null; CRT.spotTarget = null;
  }
  _restoreCrtToneMap();   // mobile: hand NoToneMapping back to the rest of the experience
  crtPhase = null;
  crtT     = 0;
  _hideCrtHint();
  _crtUIHidden = false;
  _elMmWrap.classList.remove('focus-hidden');
  _elUi?.classList.remove('focus-hidden');
  _jZone.classList.remove('focus-hidden');
  endExhibitDPR();
  _restoreExhibitFloater();
  setCD(0.6);
}

function _dismissCrt() {
  if (!crtPhase || crtPhase === 'closing') return;
  if (crtWatching) _resetCrtWatch();   // tear the modal down so it doesn't linger over the close
  _hideCrtHint();
  crtPhase = 'closing';
  crtT = 1;
  _restoreExhibitFloater();
}

// (The old screen-lift focus had a render-DPR cap because the lifted section filled ~94% of the
//  viewport. The section no longer lifts — the video is an HTML modal over the cabinet — so the
//  WebGL fill stays at cabinet size and the focus DPR cap is gone.)

// ══ SCREEN VIDEO — a YouTube embed shown in a CENTERED modal lightbox ══
// You can't render YouTube into a WebGL texture (cross-origin), so the established pattern in
// this app is an HTML <iframe> overlay. This MIRRORS the MPC's centred-modal embed exactly — a
// fixed, centered lightbox (#crt-yt-embed) — rather than the old approach of pinning the iframe
// over the 3D glass per-frame. A fixed, JS-repositioned video iframe reads to ad-blockers as a
// floating/sticky player and gets cosmetically filtered (that's what hid the old CRT clips); a
// centered modal does not, so an ad-blocker can't tell it apart from the known-good MPC embed.
// Opening it is a user gesture (Space/E/tap), so autoplay with sound is allowed.
const _elCrtYt       = document.getElementById('crt-yt-embed');
const _elCrtYtFrame  = document.getElementById('crt-yt-frame');    // gets .loaded to crossfade poster out / .switching to blink
const _elCrtYtIframe = document.getElementById('crt-yt-iframe');
const _elCrtYtPoster = document.getElementById('crt-yt-poster');   // channel thumbnail shown while the player loads
const _elCrtYtClose  = document.getElementById('crt-yt-close');
const _elCrtChPrev   = document.getElementById('crt-ch-prev');
const _elCrtChNext   = document.getElementById('crt-ch-next');
const _elCrtChLabel  = document.getElementById('crt-ch-label');
const _elCrtKnobPrev = document.getElementById('crt-knob-prev');    // desktop channel dials flanking the screen
const _elCrtKnobNext = document.getElementById('crt-knob-next');
const _elCrtKnobFaceP = _elCrtKnobPrev && _elCrtKnobPrev.querySelector('.crt-knob-face');
const _elCrtKnobFaceN = _elCrtKnobNext && _elCrtKnobNext.querySelector('.crt-knob-face');
let _crtLoadTimer = null;   // safety fallback: reveal the player even if iframe.onload never fires
// Embed URLs — the "channels". The on-screen ◀/▶ + arrow keys step through this list, and the big
// VHF/UHF dials turn in sync (VHF next, UHF prev). -nocookie host like the MPC; all load in #crt-yt-iframe.
const _yt = id => `https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1&playsinline=1`;
const CRT_VIDEOS = [
  _yt('khrkw63aMwc'),
  _yt('0qmO8XouJ2U'),
  _yt('B0pMVv0PdW0'),
  _yt('2HQXtAWhLbI'),
  _yt('fXgY54oVWHI'),
  _yt('jX_Ves0PcAE') + '&list=PLME_H0d0E0DeoKkjrZtzuv3PpmXPQWFTi',                      // + playlist
  _yt('ilwZYil6lXI'),
  _yt('wLyVYHYQIb8'),
  _yt('Y8gudyUHMgw'),
];
let _crtVidIdx = 0;

// Derive each channel's poster from its embed URL (YouTube → its hqdefault thumbnail), so the press
// reads as instant: the thumbnail paints behind a spinner while the player loads. Mirrors the MPC.
function _crtPoster(url) {
  const m = url && url.match(/\/embed\/([\w-]+)/);
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null;
}
const CRT_POSTERS = CRT_VIDEOS.map(_crtPoster);

// Prime the browser cache with the channel thumbnails during idle time so the poster paints with
// zero delay. One image per idle tick (mirrors the MPC) so it never competes with the frame budget.
let _crtThumbsQueued = false;
function _preloadCrtThumbs(i = 0) {
  if (i === 0) { if (_crtThumbsQueued) return; _crtThumbsQueued = true; }
  if (i >= CRT_POSTERS.length) return;
  const src = CRT_POSTERS[i];
  if (src) { const img = new Image(); img.src = src; }
  scheduleIdle(() => _preloadCrtThumbs(i + 1));
}
// (The old _fitCrtYtToScreen projected the glass corners every frame to pin the iframe over the
//  3D screen — that per-frame-repositioned fixed iframe was the ad-blocker signature. Gone: the
//  modal is a static centered box.)

// Warm TCP/TLS to the video hosts the instant the CRT opens — well before the iframe src is
// set on focus — so the first video starts faster. Done dynamically (not a static <head>
// preconnect, which would expire long before anyone opens the TV). One-shot.
let _crtPreconnected = false;
function _crtPreconnect() {
  if (_crtPreconnected) return;
  _crtPreconnected = true;
  ['https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://i.ytimg.com']
    .forEach(href => {
      const l = document.createElement('link');
      l.rel = 'preconnect'; l.href = href; l.crossOrigin = '';
      document.head.appendChild(l);
    });
}

// ── Loading facade — set the channel's poster + reset the crossfade so the thumbnail shows while
//    the player (re)loads. Mirrors the MPC's facade. ──
function _resetCrtFacade(idx) {
  const poster = CRT_POSTERS[idx];
  if (_elCrtYtPoster) _elCrtYtPoster.style.backgroundImage = poster ? `url("${poster}")` : 'none';
  if (_elCrtYtFrame)  _elCrtYtFrame.classList.remove('loaded');
}

// Write the "CH nn / NN" readout in the on-screen channel bar.
function _crtChannelLabel() {
  if (!_elCrtChLabel) return;
  const pad = x => String(x).padStart(2, '0');
  _elCrtChLabel.textContent = `CH ${pad(_crtVidIdx + 1)} / ${pad(CRT_VIDEOS.length)}`;
}

// (Re)load a channel URL into the iframe. Crossfade the poster facade out when the player document
// loads; a safety timer reveals the player even if onload never fires (flaky network / blocked frame).
function _loadCrtYt(url) {
  if (!_elCrtYtIframe) return;
  if (_elCrtYtIframe.src === url) { _elCrtYtFrame?.classList.add('loaded'); return; }   // same clip — reveal now
  _elCrtYtIframe.onload = () => { clearTimeout(_crtLoadTimer); _elCrtYtFrame?.classList.add('loaded'); };
  clearTimeout(_crtLoadTimer);
  _crtLoadTimer = setTimeout(() => _elCrtYtFrame?.classList.add('loaded'), 4000);
  _elCrtYtIframe.src = url;
}

function _showCrtYt() {
  if (!_elCrtYt || !_elCrtYtIframe) return;
  const url = CRT_VIDEOS[_crtVidIdx];
  if (!url) return;
  _resetCrtFacade(_crtVidIdx);   // poster + spinner showing before the player fetches
  _crtChannelLabel();
  // Make the modal visible (a non-zero box) BEFORE setting src — the same size-before-src guard the
  // MPC relies on so the cross-origin frame paints in skindeepmag's nested production iframe (never
  // created at 0×0). The fixed modal box has its full size the instant .visible applies.
  _elCrtYt.classList.add('visible');
  _loadCrtYt(url);
}

function _hideCrtYt() {
  if (!_elCrtYt) return;
  _elCrtYt.classList.remove('visible');
  if (_elCrtYtFrame) _elCrtYtFrame.classList.remove('switching', 'loaded');
  clearTimeout(_crtSwitchTimer);
  clearTimeout(_crtLoadTimer);
  if (_elCrtYtIframe) { _elCrtYtIframe.onload = null; _elCrtYtIframe.src = ''; }   // clearing src halts playback
  if (_elCrtYtPoster) _elCrtYtPoster.style.backgroundImage = 'none';
}

// ── Channel switching (on-screen ◀/▶ + arrow keys; the VHF/UHF dials turn in sync) ──
const _crtRay = new THREE.Raycaster();
const _crtPtr = new THREE.Vector2();
let _crtSwitchTimer = null;

// Brief "change the channel" static-blink — drop the iframe out fast (the new channel's poster shows
// through), then it fades back as the player reloads.
function _flashCrtChannel() {
  if (!_elCrtYtFrame) return;
  _elCrtYtFrame.classList.add('switching');
  clearTimeout(_crtSwitchTimer);
  _crtSwitchTimer = setTimeout(() => _elCrtYtFrame && _elCrtYtFrame.classList.remove('switching'), 260);
}

// Turn the on-screen DOM knob (the one matching dir) a notch, accumulating its angle on the element
// so it keeps spinning the right way. Mirrors the cabinet's 3D dial turn; harmless when the knob is
// hidden (mobile). Angle is stored on the face's dataset so no extra module state is needed.
function _turnCrtKnobDom(dir) {
  const face = dir < 0 ? _elCrtKnobFaceP : _elCrtKnobFaceN;
  if (!face) return;
  const deg = (parseFloat(face.dataset.deg) || 0) + (dir || 1) * 42;
  face.dataset.deg = deg;
  face.style.transform = `rotate(${deg}deg)`;
}

// Step the video list by dir (+1 next / -1 previous), reset the facade to the new channel's poster,
// reload the iframe (autoplay rides the click/tap/key gesture), turn the matching dials, blink.
function _changeCrtChannel(dir) {
  if (!crtWatching || CRT_VIDEOS.length < 2) return;
  const n = CRT_VIDEOS.length;
  _crtVidIdx = (_crtVidIdx + (dir || 1) + n) % n;
  _resetCrtFacade(_crtVidIdx);
  _crtChannelLabel();
  _loadCrtYt(CRT_VIDEOS[_crtVidIdx]);
  if (CRT.channelDials) {
    const d = CRT.channelDials.find(c => c.dir === (dir || 1)) || CRT.channelDials[0];
    if (d) d.turnTo += (dir || 1) * (Math.PI / 3);   // a satisfying click-to-next turn
  }
  _turnCrtKnobDom(dir);   // spin the matching on-screen dial in sync
  _flashCrtChannel();
}

// Hit-test the channel dials at a client (x,y); returns the dial direction or null. The dials sit on
// the cabinet behind/beside the modal — clicking a visible one still switches (a bonus to the bar).
function _crtDialDirAtClient(clientX, clientY) {
  if (!CRT.channelHits || !crtWatching || !renderer || !renderer.domElement) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  _crtPtr.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _crtPtr.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  _crtRay.setFromCamera(_crtPtr, camera);
  const hits = _crtRay.intersectObjects(CRT.channelHits, false);
  return hits.length ? hits[0].object.userData.chDir : null;
}

// Snap the dials back to rest and reset the channel (cabinet model is cached across opens, so
// dial rotation + the current channel must be reset explicitly on close).
function _resetCrtDials() {
  if (CRT.channelDials) for (const d of CRT.channelDials) { d.turnTo = 0; d.group.rotation.z = 0; }
  for (const face of [_elCrtKnobFaceP, _elCrtKnobFaceN]) {
    if (face) { face.dataset.deg = '0'; face.style.transform = ''; }
  }
  _crtVidIdx = 0;
}

// ══ WATCH MODE — open / close the centered video modal. Replaces the old screen-lift focus:
//    no reparenting, no tween, no DPR cap. The cabinet stays open behind the modal. ══

// Open the modal. Triggered by Space/E (desktop) or tap (mobile) — a user gesture, so autoplay
// with sound is allowed. Hide the "ready" halo + the open hint, then show the clip.
function _startCrtWatch() {
  if (crtWatching || crtPhase !== 'open') return;
  crtWatching = true;
  if (CRT.halo) CRT.halo.visible = false;
  _showCrtYt();
  _showCrtWatchHint();
}

// Close the modal back to the open cabinet (Escape / × / tap-away). Stops the clip.
function _closeCrtWatch() {
  if (!crtWatching) return;
  _hideCrtYt();
  crtWatching = false;
  if (crtPhase === 'open') _showCrtOpenHint();   // back at the cabinet — re-offer "watch"
}

// Hard reset (on dismiss / close of the whole unit) — stop the clip + drop watch state, no hint.
function _resetCrtWatch() {
  _hideCrtYt();
  crtWatching = false;
  if (CRT.halo) CRT.halo.visible = false;
  _hideCrtHint();
}

// ── CONTROL HINTS ────────────────────────────────────────────────────────────
// Reuses the shared focus-escape-hint banner (only one exhibit is open at a time) with
// CRT-specific copy, mirroring the MPC's hint behaviour (show → auto-dim).
const _elCrtHint = document.getElementById('focus-escape-hint');
let _crtHintTimer = null;

function _setCrtHint(html, dimAfter) {
  if (!_elCrtHint) return;
  _elCrtHint.innerHTML = html;
  _elCrtHint.classList.remove('dim');
  _elCrtHint.classList.add('visible');
  clearTimeout(_crtHintTimer);
  if (dimAfter) _crtHintTimer = setTimeout(() => _elCrtHint.classList.add('dim'), dimAfter);
}

function _hideCrtHint() {
  clearTimeout(_crtHintTimer);
  if (_elCrtHint) _elCrtHint.classList.remove('visible', 'dim');
}

// Unit open, not yet watching — how to bring the video up. The "ready" halo around the screen is
// the affordance, so this discovery prompt stays put (no auto-dim) until the visitor watches or
// walks away — otherwise it fades after a few seconds and the feature is undiscoverable.
function _showCrtOpenHint() {
  _setCrtHint(isMobile
    ? `<span class="feh-label">tap to watch</span>`
    : `<span class="feh-key">spc</span><span class="feh-label">watch</span>`,
    0);
}

// Modal up — how to change channel (when there's more than one video) and how to close. The
// on-screen ◀/▶ buttons are always present too; this just surfaces the keyboard/tap shortcuts.
function _showCrtWatchHint() {
  const sep = `<span class="feh-label" style="opacity:0.35;margin:0 6px">&middot;</span>`;
  const ch = CRT_VIDEOS.length > 1
    ? (isMobile
        ? `<span class="feh-label">&#9664; &#9654; change channel</span>${sep}`
        : `<span style="display:inline-flex;gap:4px"><span class="feh-key">&larr;</span><span class="feh-key">&rarr;</span></span><span class="feh-label">channel</span>${sep}`)
    : '';
  _setCrtHint(isMobile
    ? ch + `<span class="feh-label">tap away to close</span>`
    : ch + `<span class="feh-key">esc</span><span class="feh-label">close</span>`,
    CRT_VIDEOS.length > 1 ? 11000 : 9000);
}

// Mobile: a tap on the CANVAS while watching either changes channel (if it lands on a visible dial)
// or closes the modal (anywhere else). Taps on the modal / its ◀/▶/× buttons land on those DOM
// elements (pointer-events:auto) and never reach the canvas. Watch-open is driven by ctx.eEdge in
// update(), matching the MPC. A short, stationary touch counts as a tap (same thresholds as core).
if (isMobile && renderer && renderer.domElement) {
  const _crtTapStarts = {};
  renderer.domElement.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) _crtTapStarts[t.identifier] = { x: t.clientX, y: t.clientY, t: Date.now() };
  });
  renderer.domElement.addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
      const s = _crtTapStarts[t.identifier];
      delete _crtTapStarts[t.identifier];
      if (!s || !crtWatching) continue;
      const dx = t.clientX - s.x, dy = t.clientY - s.y;
      if (Date.now() - s.t >= 280 || dx * dx + dy * dy >= 225) continue;   // not a tap
      const dir = _crtDialDirAtClient(t.clientX, t.clientY);
      if (dir !== null) _changeCrtChannel(dir);
      else _closeCrtWatch();
    }
  });
  renderer.domElement.addEventListener('touchcancel', e => {
    for (const t of e.changedTouches) delete _crtTapStarts[t.identifier];
  });
}

// Desktop: click a visible channel dial to change the channel while watching. (Clicks on the video
// go to the YouTube iframe; clicks on empty canvas do nothing — Escape / the × close the modal.)
if (!isMobile && renderer && renderer.domElement) {
  renderer.domElement.addEventListener('click', e => {
    if (!crtWatching) return;
    const dir = _crtDialDirAtClient(e.clientX, e.clientY);
    if (dir !== null) _changeCrtChannel(dir);
  });
}

// On-screen channel bar + close button (in the modal; work on desktop + mobile).
function _wireCrtBtn(el, fn) {
  if (!el) return;
  const f = e => { e.preventDefault(); e.stopPropagation(); fn(); };
  el.addEventListener('click', f);
  el.addEventListener('touchstart', f, { passive: false });
}
_wireCrtBtn(_elCrtChPrev, () => _changeCrtChannel(-1));
_wireCrtBtn(_elCrtChNext, () => _changeCrtChannel(1));
_wireCrtBtn(_elCrtKnobPrev, () => _changeCrtChannel(-1));   // desktop side dials
_wireCrtBtn(_elCrtKnobNext, () => _changeCrtChannel(1));
_wireCrtBtn(_elCrtYtClose, () => _closeCrtWatch());

// Keyboard Escape can't reach us while the clip iframe holds focus: it's cross-origin, so its
// keydowns fire in YouTube's document, not ours. When the iframe grabs focus (the player blurs the
// top window), pull focus back to the overlay so the document receives keys again — the click that
// moved focus already registered inside the player, so play/pause still toggles. Guarded on
// document.hasFocus() so we don't fight a real tab-switch (then the iframe isn't the active element).
if (_elCrtYt && _elCrtYtIframe) {
  _elCrtYt.tabIndex = -1;   // focusable target, but not a Tab stop
  window.addEventListener('blur', () => {
    if (!crtWatching) return;
    setTimeout(() => {
      if (crtWatching && document.hasFocus() && document.activeElement === _elCrtYtIframe) {
        try { _elCrtYt.focus({ preventScroll: true }); } catch (e) {}
      }
    }, 0);
  });
}

registerExhibit({
  id: 'crt-tv',
  floater: CRT.floaterIdx,
  open: (px, pz, yaw) => _openCrt(px, pz, yaw),
  isActive: () => !!crtPhase,
  dismiss: () => _dismissCrt(),
  // STRONG dim (≈0.95). The set has its own overhead key light (see _openCrt), so the orb
  // is knocked right back: this kills the hot orb specular that was blowing the front out
  // and turns the scene into a spotlit TV in a dark room. The dedicated spot does the
  // lighting; the orb is left at only a faint floor (~18%).
  dimsRoom: () => (crtPhase === 'opening' || crtPhase === 'open') ? 0.95 : 0,
  // Freeze the player while the video modal is up (matches the crate / MPC).
  locksMovement: () => crtWatching,
  update(ctx) {
    // ── Input ── layered Escape (modal → whole unit); Space/E (desktop) or tap (mobile, via
    // eEdge) brings the video modal up.
    if (ctx.iCD <= 0) {
      if (ctx.escEdge) {
        if (crtWatching) { _closeCrtWatch(); hidePrompt(); ctx.setCD(0.35); }
        else if (crtPhase && crtPhase !== 'closing') { _dismissCrt(); hidePrompt(); ctx.setCD(0.3); }
      } else if (ctx.eEdge) {
        if (crtPhase === 'open' && !crtWatching) { _startCrtWatch(); hidePrompt(); ctx.setCD(0.35); }
      }
    }

    // Desktop ← / → cycle channels while watching (movement is locked in watch mode, so the arrows
    // are free). Edges tracked every frame for clean single steps (mirrors the MPC's pad nav).
    if (!isMobile && crtWatching) {
      const l = !!keys['ArrowLeft'], r = !!keys['ArrowRight'];
      if (ctx.iCD <= 0) {
        if (l && !_crtNavL) { _changeCrtChannel(-1); ctx.setCD(0.2); }
        else if (r && !_crtNavR) { _changeCrtChannel(1); ctx.setCD(0.2); }
      }
      _crtNavL = l; _crtNavR = r;
    } else {
      _crtNavL = _crtNavR = false;
    }
    // Open / close scale animation
    if (crtPhase === 'opening') {
      crtT = Math.min(1, crtT + ctx.dt / OPEN_DUR);
      const s = crtT * crtT * (3 - 2 * crtT);
      if (crtGroup) crtGroup.scale.setScalar(0.04 + s * 0.96);
      if (crtT >= 1) { crtPhase = 'open'; _showCrtOpenHint(); }
    } else if (crtPhase === 'closing') {
      crtT = Math.max(0, crtT - ctx.dt / CLOSE_DUR);
      const s = crtT * crtT * (3 - 2 * crtT);
      if (crtGroup) crtGroup.scale.setScalar(0.04 + s * 0.96);
      if (crtT <= 0) _closeCrt();
    }
    if (crtGroup) crtGroup.position.y = CRT_Y + Math.sin(ctx.t * 1.4) * 0.03;
    // Overhead key light ramps in/out with the open animation (crtT smoothstep).
    if (CRT.spot) CRT.spot.intensity = (crtT * crtT * (3 - 2 * crtT)) * SPOT_INT;

    // "Ready to watch" halo — frames the screen while open & idle, signalling it's interactive.
    // Breathing pulse on opacity + a subtle scale. Hidden while watching (and any non-open phase).
    if (CRT.halo) {
      if (crtPhase === 'open' && !crtWatching) {
        CRT.halo.visible = true;
        CRT.haloMat.opacity = 0.45 + (Math.sin(ctx.t * 3.0) * 0.5 + 0.5) * 0.5;  // 0.45 → 0.95
        const sc = 1 + Math.sin(ctx.t * 3.0) * 0.02;
        CRT.halo.scale.set(sc, sc, 1);
      } else {
        CRT.halo.visible = false;
      }
    }

    // Ease each channel dial toward its target rotation (the click-to-next "turn") — the dials turn
    // in sync with the on-screen channel bar, visible on the cabinet beside/behind the modal.
    if (CRT.channelDials) {
      for (let i = 0; i < CRT.channelDials.length; i++) {
        const d = CRT.channelDials[i];
        d.group.rotation.z += (d.turnTo - d.group.rotation.z) * Math.min(1, ctx.dt * 10);
      }
    }

    // Watch ramp — 1 while the modal is up, 0 otherwise (drives the dial glow). The section stays
    // under the overhead key spot now (it never lifts away), so no per-metal self-lighting is needed.
    const _crtLit = crtWatching ? 1 : 0;

    // Dial navigation glow — pulses around the VHF/UHF dials while watching, so the visitor sees the
    // dials turn as the channel changes. Off when there's only one video.
    if (CRT.dialGlowMat) {
      const pulse = 0.5 + (Math.sin(ctx.t * 3.0) * 0.5 + 0.5) * 0.5;   // 0.5 → 1.0
      CRT.dialGlowMat.opacity = CRT_VIDEOS.length > 1 ? _crtLit * pulse : 0;
    }

    // Hide the HUD while the video modal is up (matches the crate / MPC).
    if (crtWatching !== _crtUIHidden) {
      _crtUIHidden = crtWatching;
      _elMmWrap.classList.toggle('focus-hidden', crtWatching);
      _elUi?.classList.toggle('focus-hidden', crtWatching);
      _jZone.classList.toggle('focus-hidden', crtWatching);
    }

    // Faint static glow — one scalar nudge + a cheap texture crawl (no array writes)
    if (CRT.screenMat) CRT.screenMat.emissiveIntensity = 0.72 + Math.sin(ctx.t * 40) * 0.14 + Math.sin(ctx.t * 7.3) * 0.07;
    // Jump the noise tile to a fresh random region each frame so the snow re-samples (flicker)
    // instead of scrolling a fixed pattern downward — a clean vertical scroll read as Matrix rain.
    if (CRT.staticTex) { CRT.staticTex.offset.x = Math.random(); CRT.staticTex.offset.y = Math.random(); }
    // Bounce the SKIN DEEP screensaver: constant drift, reflect off the screen edges, recolour
    // on each hit (the DVD-logo idle animation, baked over the static).
    if (CRT.logoMesh && crtPhase !== 'closing') {
      logoX += logoVX * ctx.dt;
      logoY += logoVY * ctx.dt;
      let hit = false;
      if (logoX >  logoHalfX) { logoX =  logoHalfX; logoVX = -Math.abs(logoVX); hit = true; }
      else if (logoX < -logoHalfX) { logoX = -logoHalfX; logoVX = Math.abs(logoVX); hit = true; }
      if (logoY >  logoHalfY) { logoY =  logoHalfY; logoVY = -Math.abs(logoVY); hit = true; }
      else if (logoY < -logoHalfY) { logoY = -logoHalfY; logoVY = Math.abs(logoVY); hit = true; }
      if (hit) {
        // Re-pick each axis speed (keeping the just-reflected sign) so the trajectory keeps
        // changing angle and never settles into a repeating loop.
        logoVX = Math.sign(logoVX) * LOGO_SPEED * (0.5 + Math.random() * 0.5);
        logoVY = Math.sign(logoVY) * LOGO_SPEED * (0.5 + Math.random() * 0.5);
        logoHue = (logoHue + 0.137) % 1;
        CRT.logoMesh.material.color.setHSL(logoHue, 0.85, 0.6);
      }
      CRT.logoMesh.position.x = _logoBaseX + logoX;
      CRT.logoMesh.position.y = _logoBaseY + logoY;
    }
  },
});

// Pre-build the cabinet + textures (and warm the tone-map shaders) on approach, so the first
// open is instant. core's floater-loop fires this once when the player nears the CRT floater,
// then nulls it. Falls back to the synchronous _buildCrtAssets() in _openCrt if opened early.
if (floaters[CRT.floaterIdx]) floaters[CRT.floaterIdx]._preload = _crtIdlePrebuild;
