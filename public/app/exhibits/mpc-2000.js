// ══════════════════════════════════════════
//  EXHIBITION: AKAI MPC 2000  (floater 5 — the purple "cosmos" dodecahedron)
// ══════════════════════════════════════════
// A bespoke one-object exhibition modeled on the CRT TV: a simplified Akai MPC 2000
// sampler that scales up in front of the player, bobs, glows on its LCD, and dismisses.
// STEP 1 is the model + the appear/bob/dismiss lifecycle only — the interactive pad /
// screen content comes in a later pass (exactly how crt-tv.js was staged).
//
// Unlike the CRT (a vertical front face), the MPC is a tabletop device: all the detail
// lives on its top surface, so the whole unit is tilted back toward the player like a
// console. Most of the busy silkscreen — branding, section labels, and the dozens of
// small flush buttons — is BAKED into a single canvas "faceplate" texture (drawn with
// relief shading so the buttons read as raised). Only the genuinely tactile parts are
// real geometry: the 16 drum pads, the big data wheel, the two knobs, the volume slider
// cap, and the emissive LCD. This keeps the silhouette recognizable while the draw-call
// and geometry cost stays close to the CRT's.
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
  setTriggerFloater, beginExhibitDPR, endExhibitDPR, hidePrompt,
  computeFocusTarget: _computeExhibitFocusTarget, syncCamera: _syncCamera,
  elMmWrap: _elMmWrap, elUi: _elUi, jZone: _jZone,
} = core;

const MPC = {
  floaterIdx: 5,    // the purple "cosmos" dodecahedron on the room's right side (back corner)
  _model: null,     // cached THREE.Group — the body never changes, build once
  _built: false,
  faceTex: null,    // baked top-surface faceplate (branding + labels + flush buttons)
  screenTex: null,  // LCD emissive map
  grilleTex: null,  // speaker-grille slats
  haloTex: null,    // soft glowing ring drawn around the pad section
  screenMat: null,  // kept so update() can flicker the LCD emissive
  section: null,    // THREE.Group: deck + 16 pads + halo, lifts out into focus
  halo: null,       // halo mesh framing the whole pad section (pulsed in update)
  haloMat: null,    // kept so update() can pulse the halo opacity
  padMat: null,     // shared pad material — emissive ramps up in focus so pads read
  padDeckMat: null, // shared deck material — emissive ramps up in focus
  deck: null,       // deck mesh ref — used to measure the focused content for recentring
  pads: null,       // the 16 pad meshes (array index = row*4 + col)
  padHi: null,      // glowing selection frame laid over the cursored pad (desktop)
  padHiMat: null,   // kept so update() can pulse the highlight opacity
  padEmbeds: null,  // per-pad embed URL (one media clip per pad)
};

// Media each pad triggers — one iframe src per pad, keyed by the pad's PRINTED label.
// MPC pads count PAD 1 (bottom-left) → PAD 16 (top-right), so index 0 here = PAD 1.
// YouTube watch links are in their nocookie /embed/ form (autoplay on; lighter first load,
// pairs with the preconnect below); pad 6 keeps its playlist; pad 2 is a SoundCloud visual
// player (the iframe src lifted from its embed snippet).
const MPC_PAD_MEDIA = [
  'https://www.youtube-nocookie.com/embed/p3gUSymYa3o?rel=0&autoplay=1',                                         // PAD 1
  'https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/playlists/soundcloud%253Aplaylists%253A1962469520&color=%23ff5500&auto_play=true&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true', // PAD 2 — SoundCloud "One Take"
  'https://www.youtube-nocookie.com/embed/XKHMJKwawLM?rel=0&autoplay=1',                                         // PAD 3
  'https://www.youtube-nocookie.com/embed/GpFixR6aH9A?rel=0&autoplay=1',                                         // PAD 4
  'https://www.youtube-nocookie.com/embed/1lkWgpujSF0?rel=0&autoplay=1',                                         // PAD 5
  'https://www.youtube-nocookie.com/embed/MbJmx9DV7r4?rel=0&autoplay=1&list=PLedZ38aTJsKqREK4kZr2aVZ2QBDHJ1UFu', // PAD 6 — playlist
  'https://www.youtube-nocookie.com/embed/Cwy5eO1lhY0?rel=0&autoplay=1',                                         // PAD 7
  'https://www.youtube-nocookie.com/embed/R4LB2FKSBUo?rel=0&autoplay=1',                                         // PAD 8
  'https://www.youtube-nocookie.com/embed/g3EYSN_NweQ?rel=0&autoplay=1',                                         // PAD 9
  'https://www.youtube-nocookie.com/embed/lo6RiTvzWV4?rel=0&autoplay=1',                                         // PAD 10
  'https://www.youtube-nocookie.com/embed/123TKp04u9c?rel=0&autoplay=1',                                         // PAD 11
  'https://www.youtube-nocookie.com/embed/FUk0Zmkb4CM?rel=0&autoplay=1',                                         // PAD 12
  'https://www.youtube-nocookie.com/embed/4AtZNIW2AHY?rel=0&autoplay=1',                                         // PAD 13
  'https://www.youtube-nocookie.com/embed/8TGDPaQStT8?rel=0&autoplay=1',                                         // PAD 14
  'https://www.youtube-nocookie.com/embed/G7j3p6JyfAo?rel=0&autoplay=1',                                         // PAD 15
  'https://www.youtube-nocookie.com/embed/z8JkQA5Qz-Y?rel=0&autoplay=1',                                         // PAD 16
];

// Re-key into array order (row-major from the TOP-left pad) so it lines up with MPC.pads[],
// which the trigger code indexes directly. The geometry maps array idx (ri,ci) →
// printed pad (3-ri)*4+ci, so invert that here once rather than reshuffling the list above.
const MPC_PAD_EMBEDS = new Array(16);
for (let ri = 0; ri < 4; ri++)
  for (let ci = 0; ci < 4; ci++)
    MPC_PAD_EMBEDS[ri * 4 + ci] = MPC_PAD_MEDIA[(3 - ri) * 4 + ci];

// Derive a poster image from an embed URL: YouTube → its hqdefault thumbnail (always exists;
// shown behind the loading player so the press reads as instant). SoundCloud / anything else
// has no cheap thumbnail → null (the dark frame + spinner stand in). Built once, array-keyed
// to match MPC_PAD_EMBEDS so _showMpcEmbed can look it up by the same idx.
function _mpcPoster(url) {
  const m = url && url.match(/\/embed\/([\w-]+)/);
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null;
}
const MPC_PAD_POSTERS = MPC_PAD_EMBEDS.map(_mpcPoster);

// Origins the clip iframe pulls from. Preconnected once when the unit opens (a few seconds
// before any pad is pressed) so the first play skips the DNS+TLS+TCP cold start.
const MPC_PRECONNECT = [
  'https://www.youtube-nocookie.com',
  'https://i.ytimg.com',
  'https://w.soundcloud.com',
  'https://i1.sndcdn.com',
];
let _mpcWarmed = false;   // preconnect injected (once per session)
let _mpcThumbsQueued = false;   // idle thumbnail preload kicked off (once per session)

// Warm the video origins. Called from open() — the visitor is committed to the MPC and will
// hit a pad within seconds, so the socket is fresh exactly when needed; visitors who never
// open the unit pay nothing. Idempotent (guarded), so re-opening doesn't duplicate links.
function _warmMpcConnections() {
  if (_mpcWarmed) return;
  _mpcWarmed = true;
  for (const href of MPC_PRECONNECT) {
    const l = document.createElement('link');
    l.rel = 'preconnect';
    l.href = href;
    l.crossOrigin = '';
    document.head.appendChild(l);
  }
}

// Prime the browser cache with the pad thumbnails during idle time so the poster paints with
// zero delay on press. One image per idle tick (mirrors vinyl's _preloadVinylAssets chain) so
// it never competes with the frame budget. Runs once per session.
function _preloadMpcThumbs(i = 0) {
  if (i === 0) { if (_mpcThumbsQueued) return; _mpcThumbsQueued = true; }
  if (i >= MPC_PAD_POSTERS.length) return;
  const src = MPC_PAD_POSTERS[i];
  if (src) { const img = new Image(); img.src = src; }
  core.scheduleIdle(() => _preloadMpcThumbs(i + 1));
}

const MPC_SIZE = 5.6;            // overall body width; every part is a fraction of this
const MPC_Y    = 2.1;            // group-center height — scaled with MPC_SIZE (~0.38×) so the tilted unit keeps its floor clearance
const MPC_TILT = 0.32 * Math.PI; // backward tilt so the top control surface faces the player
const MPC_FOCUS_DUR = 0.55;      // pad-section focus / unfocus tween (matches the crate's feel)
const MPC_FOCUS_MARGIN = 1.25;   // >1 leaves breathing room around the focused grid (vs edge-to-edge)
const _mpcFwd  = new THREE.Vector3();

let mpcPhase = null;   // 'opening' | 'open' | 'closing' | null
let mpcT     = 0;
let mpcGroup = null;

// ── Pad-section focus state (the whole 4×4 deck lifts out to front-facing focus) ──
let mpcFocusPhase = null;   // 'focusing' | 'focused' | 'unfocusing' | null
let mpcFocusT     = 0;
const _secFromPos  = new THREE.Vector3();
const _secFromQuat = new THREE.Quaternion();
let   _secFromScale = 1;
const _secToPos    = new THREE.Vector3();
const _secToQuat   = new THREE.Quaternion();
let   _secToScale  = 1;
const _secLerpQuat = new THREE.Quaternion();
const _secHomeMat  = new THREE.Matrix4();     // section's home local matrix (filled once we know W/D/topY)
const _tmpMat      = new THREE.Matrix4();
const _tmpScale    = new THREE.Vector3();
// Pre-rotation turning the section's top surface (+Y) toward the camera, so the
// pad grid lands flat-on like a focused record instead of edge-on.
const _faceQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
// Scratch for measuring + recentring the focused content on screen.
const _focusBox  = new THREE.Box3();
const _focusCtr  = new THREE.Vector3();
const _camDir    = new THREE.Vector3();
const _toCtr     = new THREE.Vector3();
const _lateral   = new THREE.Vector3();

// ── Pad selection / trigger state (live only once the section is focused) ──
let mpcPadSel = 12;            // cursored pad (desktop), array idx; 12 = bottom-left ("PAD 1")
let mpcEmbedOn = false;        // is the triggered-clip overlay showing
let _mpcPressIdx = -1;         // pad currently playing its press-dip animation
let _mpcPressT   = 0;
let _mpcNavL = false, _mpcNavR = false, _mpcNavU = false, _mpcNavD = false; // arrow-key edges
const MPC_PRESS_DUR = 0.22;

// Embed overlay DOM (the YouTube iframe that takes over when a pad is triggered).
const _elMpcYt       = document.getElementById('mpc-yt-embed');
const _elMpcYtFrame  = document.getElementById('mpc-yt-frame');    // gets .loaded to crossfade poster out
const _elMpcYtIframe = document.getElementById('mpc-yt-iframe');
const _elMpcYtPoster = document.getElementById('mpc-yt-poster');   // thumbnail shown while the player loads
const _elMpcYtClose  = document.getElementById('mpc-yt-close');
const _elMpcYtReload = document.getElementById('mpc-yt-reload');   // ↻ re-kicks the current clip
let _mpcLoadTimer = null;   // safety fallback: reveal the player even if iframe.onload never fires
let _mpcEmbedIdx = -1;      // pad idx of the clip currently up (so ↻ knows what to reload)

// Control hints reuse the shared focus-escape-hint banner (only one exhibit is open at a
// time, so owning its contents here is safe). The MPC drives it with its own copy.
const _elMpcHint = document.getElementById('focus-escape-hint');
let _mpcHintTimer = null;

// Dismissable pad-grid guidance card — richer "what is this / how to use it" copy that
// appears the first time the grid focuses and stays until the visitor closes it. Once
// dismissed (this session) the terse focus pill takes over instead.
const _elMpcGuide      = document.getElementById('mpc-pad-guide');
const _elMpcGuideBody  = document.getElementById('mpc-pad-guide-body');
const _elMpcGuideClose = document.getElementById('mpc-pad-guide-close');
let _mpcGuideDismissed = false;

// Mobile tap → pad raycast (desktop uses the arrow-key cursor instead).
const _padRay = new THREE.Raycaster();
const _padNdc = new THREE.Vector2();

// ── Body proportions (a flat slab) ──
const W = MPC_SIZE;          // width  (left↔right)
const D = MPC_SIZE * 0.74;   // depth  (back↔front)
const H = MPC_SIZE * 0.16;   // height (thin)
const topY = H / 2;          // y of the top control surface

// Faceplate UV → local model coords on the top surface.
//   u: 0 = left  .. 1 = right        v: 0 = back .. 1 = front (toward player)
// (Chosen so a CanvasTexture drawn in photo orientation — top-of-image = back of unit —
//  maps 1:1 onto the top plane, and 3D props placed with the same (u,v) line up with it.)
const fx = u => (u - 0.5) * W;
const fz = v => (v - 0.5) * D;

// Pad-section geometry: the deck spans W*0.43 × D*0.44, centred at (0.76, 0.62) in UV.
// The section group's origin is the deck centre so it scales/rotates about itself.
const SEC_CX = fx(0.76);   // deck centre x (model coords)
const SEC_CZ = fz(0.62);   // deck centre z
const SEC_W  = W * 0.43;   // deck planar width  (horizontal once focused)
const SEC_H  = D * 0.44;   // deck planar depth  (vertical once focused)
_secHomeMat.makeTranslation(SEC_CX, topY, SEC_CZ);

// ── small canvas helpers ──
function _rr(x, cx, cy, w, h, r) {
  x.beginPath();
  x.moveTo(cx + r, cy);
  x.arcTo(cx + w, cy, cx + w, cy + h, r);
  x.arcTo(cx + w, cy + h, cx, cy + h, r);
  x.arcTo(cx, cy + h, cx, cy, r);
  x.arcTo(cx, cy, cx + w, cy, r);
  x.closePath();
}

// Baked button with a top highlight + bottom shadow so it reads as raised under the
// flat room light (these are texture-only; no geometry).
function _bakeBtn(x, cx, cy, w, h, fill) {
  _rr(x, cx - 1, cy - 1, w + 2, h + 2, 5); x.fillStyle = 'rgba(0,0,0,0.55)'; x.fill();   // dark inset frame (separates from body)
  _rr(x, cx, cy + 2, w, h, 4);   x.fillStyle = 'rgba(0,0,0,0.45)'; x.fill();             // drop shadow
  _rr(x, cx, cy, w, h, 4);       x.fillStyle = fill;              x.fill();              // face
  _rr(x, cx + 1, cy + 1, w - 2, h * 0.42, 3); x.fillStyle = 'rgba(255,255,255,0.38)'; x.fill(); // top sheen
}

// ── Faceplate: the entire top graphic baked once ──
function makeMpcFaceTex() {
  const CW = 1024, CH = Math.round(1024 * (D / W));   // match the W×D plane aspect
  const c = document.createElement('canvas'); c.width = CW; c.height = CH;
  const x = c.getContext('2d');
  const U = u => u * CW, V = v => v * CH;
  // Higher-contrast palette: lighter body + near-black ink so the silkscreen reads clearly
  // even at the dimmed exhibition light level.
  const body = '#d4cfc1', ink = '#171511', faint = '#403e37', cream = '#e0d8c4', red = '#c22f4d';

  // Base body + faint vertical sheen
  x.fillStyle = body; x.fillRect(0, 0, CW, CH);
  for (let i = 0; i < CW; i += 3) { x.fillStyle = 'rgba(255,255,255,0.015)'; x.fillRect(i, 0, 1, CH); }

  // Raised pad deck (right) + pad-bank sub-panel — baked tone; pad meshes sit on top.
  x.fillStyle = '#b7bcc4'; _rr(x, U(0.545), V(0.40), U(0.43), V(0.44), 12); x.fill();
  x.fillStyle = '#adb1b8'; _rr(x, U(0.468), V(0.565), U(0.078), V(0.235), 6); x.fill();

  x.textBaseline = 'middle';

  // ── Branding ──
  x.fillStyle = red; x.font = 'italic 900 32px Arial'; x.textAlign = 'left';
  const _logoX = U(0.05);
  x.fillText('SD', _logoX, V(0.06));
  const _sdW = x.measureText('SD').width;                 // measured at the 32px logo font
  x.font = 'italic 600 19px Georgia, serif';
  x.fillText('professional', _logoX + _sdW + 8, V(0.066));
  x.fillStyle = faint; x.font = '600 11px Arial';
  x.fillText('INTEGRATED RHYTHM MACHINE', U(0.33), V(0.045));
  x.fillText('16 BIT DRUM SAMPLER / MIDI SEQUENCER', U(0.33), V(0.075));

  x.font = '900 italic 60px Arial'; x.textAlign = 'left';
  const _bx = U(0.63), _by = V(0.30);
  x.fillStyle = '#7d7b76'; x.fillText('SD', _bx, _by);
  const _numX = _bx + x.measureText('SD').width + 10;     // place "2000" right after "SD", no overlap
  x.fillStyle = ink; x.fillText('2000', _numX, _by);
  const _numW = x.measureText('2000').width;
  x.fillStyle = red; x.fillRect(_numX, V(0.34), _numW, 4);
  x.fillStyle = faint; x.font = '700 15px Arial';
  x.fillText('MIDI PRODUCTION CENTER', _bx, V(0.365));

  // ── LCD bezel backing (the emissive screen geometry overlays this) ──
  x.fillStyle = '#0a0c10'; _rr(x, U(0.18), V(0.105), U(0.32), V(0.155), 6); x.fill();
  x.fillStyle = '#cfcabd'; x.font = '700 11px Arial'; x.textAlign = 'center';
  ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'].forEach((s, i) => x.fillText(s, U(0.232 + i * 0.046), V(0.245)));

  // F-button row (baked)
  for (let i = 0; i < 6; i++) _bakeBtn(x, U(0.21 + i * 0.046), V(0.285), U(0.034), V(0.028), cream);

  // ── Knob labels (knob geometry overlays the circles) ──
  x.fillStyle = faint; x.font = '600 10px Arial'; x.textAlign = 'center';
  x.fillText('MAIN VOLUME', U(0.10), V(0.15));
  x.fillText('REC GAIN', U(0.10), V(0.26));

  // ── Numeric keypad (baked) ──
  const keys = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['SHIFT', '0', 'ENTER']];
  keys.forEach((row, ri) => row.forEach((k, ci) => {
    const cu = 0.10 + ci * 0.072, cv = 0.40 + ri * 0.040;
    _bakeBtn(x, U(cu) - U(0.028), V(cv) - V(0.013), U(0.056), V(0.026), cream);
    x.fillStyle = ink; x.font = '700 ' + (k.length > 2 ? 8 : 11) + 'px Arial';
    x.fillText(k, U(cu), V(cv));
  }));

  // ── Center cluster: data wheel + cursor labels ──
  x.fillStyle = faint; x.font = '600 9px Arial';
  x.fillText('DATA', U(0.30), V(0.425)); x.fillText('DIGIT', U(0.39), V(0.425));
  // data-wheel base tone (cylinder overlays)
  x.fillStyle = '#b0aca1'; x.beginPath(); x.arc(U(0.345), V(0.50), 60, 0, Math.PI * 2); x.fill();
  x.fillStyle = faint; x.fillText('CURSOR', U(0.35), V(0.55));

  // ── Note variation / slider (slider cap geometry overlays the track) ──
  x.fillStyle = faint; x.font = '600 9px Arial';
  x.fillText('NOTE', U(0.085), V(0.55)); x.fillText('VARIATION', U(0.085), V(0.565));
  _bakeBtn(x, U(0.065), V(0.585), U(0.04), V(0.022), cream);
  x.fillStyle = ink; x.fillText('AFTER', U(0.085), V(0.596));
  x.fillStyle = '#5a584f'; _rr(x, U(0.083) - 4, V(0.625), 8, V(0.79) - V(0.625), 4); x.fill(); // track

  _bakeBtn(x, U(0.175), V(0.60), U(0.06), V(0.026), cream);
  _bakeBtn(x, U(0.255), V(0.60), U(0.05), V(0.026), cream);
  x.fillStyle = ink; x.font = '700 9px Arial';
  x.fillText('UNDO SEQ', U(0.205), V(0.613)); x.fillText('ERASE', U(0.28), V(0.613));

  // ── Locate + transport rows (baked) ──
  x.fillStyle = faint; x.font = '700 10px Arial'; x.fillText('LOCATE', U(0.30), V(0.655));
  for (let i = 0; i < 5; i++) _bakeBtn(x, U(0.18 + i * 0.052), V(0.675), U(0.04), V(0.026), cream);
  const trans = [['REC', red], ['OVER DUB', red], ['STOP', cream], ['PLAY', cream], ['PLAY START', cream]];
  trans.forEach(([s, col], i) => {
    _bakeBtn(x, U(0.18 + i * 0.052), V(0.745), U(0.04), V(0.032), col);
    x.fillStyle = ink; x.font = '700 8px Arial'; x.fillText(s, U(0.20 + i * 0.052), V(0.79));
  });

  // ── Pad-bank column (baked) ──
  x.fillStyle = ink; x.font = '700 9px Arial';
  x.fillText('A', U(0.485), V(0.585)); x.fillText('B', U(0.525), V(0.585));
  x.fillText('C', U(0.485), V(0.605)); x.fillText('D', U(0.525), V(0.605));
  [['PAD BANK', 0.655], ['FULL LEVEL', 0.71], ['16 LEVELS', 0.765]].forEach(([s, v]) => {
    _bakeBtn(x, U(0.483), V(v), U(0.05), V(0.024), cream);
    x.fillStyle = ink; x.font = '700 8px Arial'; x.fillText(s, U(0.508), V(v - 0.018));
  });

  // ── DRUMS + per-pad labels (pad meshes sit just below each label) ──
  x.fillStyle = faint; x.font = '700 12px Arial'; x.fillText('DRUMS', U(0.745), V(0.41));
  x.font = '600 8px Arial'; x.fillStyle = '#5f5d56';
  [[13, 14, 15, 16], [9, 10, 11, 12], [5, 6, 7, 8], [1, 2, 3, 4]].forEach((row, ri) =>
    row.forEach((n, ci) => x.fillText('PAD ' + n, U(0.595 + ci * 0.108), V(0.435 + ri * 0.108))));

  return new THREE.CanvasTexture(c);
}

// LCD emissive — dim green field with scanlines and a faint waveform row.
function makeMpcScreenTex() {
  const CW = 256, CH = 120;
  const c = document.createElement('canvas'); c.width = CW; c.height = CH;
  const x = c.getContext('2d');
  x.fillStyle = '#0c1a12'; x.fillRect(0, 0, CW, CH);
  x.fillStyle = 'rgba(120,220,150,0.10)';
  for (let y = 0; y < CH; y += 3) x.fillRect(0, y, CW, 1);          // scanlines
  x.strokeStyle = 'rgba(150,240,170,0.55)'; x.lineWidth = 2;        // waveform
  x.beginPath();
  for (let i = 0; i <= CW; i += 6) {
    const yy = CH * 0.5 + Math.sin(i * 0.12) * Math.sin(i * 0.31) * CH * 0.26;
    i === 0 ? x.moveTo(i, yy) : x.lineTo(i, yy);
  }
  x.stroke();
  x.fillStyle = 'rgba(150,240,170,0.5)'; x.font = '12px monospace';
  x.fillText('SKIN DEEP', 10, 16);
  return new THREE.CanvasTexture(c);
}

// Speaker grille — horizontal slats (mirrors makeCrtGrilleTex).
function makeMpcGrilleTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 80;
  const x = c.getContext('2d');
  x.fillStyle = '#bcb8ad'; x.fillRect(0, 0, 128, 80);
  for (let y = 4; y < 80; y += 7) {
    x.fillStyle = '#3a3833'; x.fillRect(8, y, 112, 3);
    x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(8, y + 3, 112, 1);
  }
  return new THREE.CanvasTexture(c);
}

// Select halo — a soft amber glowing rounded-square ring with a transparent center,
// so it reads as an outline around the pad (which shows through). Used additively.
function makeMpcHaloTex() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  const inset = S * 0.10;   // keep the ring near the plane edge so it can wrap the outer pads
  // Stroke the same rounded rect several times with growing blur for a layered bloom.
  x.strokeStyle = 'rgba(255,205,120,0.95)';
  x.shadowColor = 'rgba(255,185,90,0.95)';
  for (let i = 0; i < 4; i++) {
    x.shadowBlur = 14 + i * 12;
    x.lineWidth  = 8 - i * 1.5;
    _rr(x, inset, inset, S - inset * 2, S - inset * 2, 26);
    x.stroke();
  }
  return new THREE.CanvasTexture(c);
}

// Assemble the MPC from primitives. Built once, cached on MPC._model, reused across opens.
function _buildMpc() {
  const g = new THREE.Group();

  // Materials (shared where repeated)
  const bodyMat   = new THREE.MeshStandardMaterial({ color: 0xb7b3a8, roughness: 0.74, metalness: 0.06 });
  const faceMat   = new THREE.MeshStandardMaterial({ map: MPC.faceTex, roughness: 0.7, metalness: 0.04 });
  const bezelMat  = new THREE.MeshStandardMaterial({ color: 0x090b0f, roughness: 0.45, metalness: 0.08 });
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x06120b, roughness: 0.22, metalness: 0.1,
    emissive: 0x2f6a44, emissiveMap: MPC.screenTex, emissiveIntensity: 0.5,
  });
  const grilleMat = new THREE.MeshStandardMaterial({ map: MPC.grilleTex, roughness: 0.85, metalness: 0.0 });
  // Deck + pads carry an emissive that's dark/off in the room but ramps up in focus —
  // away from the orb the section would otherwise read as black-on-black, so this self-
  // lights it so all 16 pads stay visible and centred. (emissiveIntensity driven in update)
  const padDeckMat = new THREE.MeshStandardMaterial({ color: 0xbcc0c7, roughness: 0.55, metalness: 0.06, emissive: 0x6a6f78, emissiveIntensity: 0 });
  const padMat    = new THREE.MeshStandardMaterial({ color: 0x24272d, roughness: 0.7, metalness: 0.08, emissive: 0x3a3e45, emissiveIntensity: 0 });
  MPC.padMat = padMat;
  MPC.padDeckMat = padDeckMat;
  const knobMat   = new THREE.MeshStandardMaterial({ color: 0xd7d0c0, roughness: 0.38, metalness: 0.14 });
  const redMat    = new THREE.MeshStandardMaterial({ color: 0xb22f46, roughness: 0.42, metalness: 0.1 });
  const wheelMat  = new THREE.MeshStandardMaterial({ color: 0xd8d1c0, roughness: 0.34, metalness: 0.16 });
  const darkMat   = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6, metalness: 0.1 });
  const lipMat    = new THREE.MeshStandardMaterial({ color: 0xc9c0a8, roughness: 0.5, metalness: 0.12 });
  MPC.screenMat = screenMat;

  // ── Body slab + baked faceplate on the top face ──
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), bodyMat);
  g.add(body);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.997, D * 0.997), faceMat);
  face.rotation.x = -Math.PI / 2;
  face.position.y = topY + 0.001;
  g.add(face);
  if (MPC.faceTex) MPC.faceTex.anisotropy = MAX_ANISO;

  // Beveled front lip + recessed floppy slot on the front face (+Z, toward player)
  const lip = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.34, 0.04), lipMat);
  lip.position.set(0, -H * 0.18, D / 2 + 0.005);
  g.add(lip);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(W * 0.22, H * 0.16, 0.03), darkMat);
  slot.position.set(W * 0.26, H * 0.05, D / 2 + 0.01);
  g.add(slot);

  // ── LCD: raised bezel + emissive screen plane (faces up) ──
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(W * 0.34, 0.05, D * 0.16), bezelMat);
  bezel.position.set(fx(0.34), topY + 0.02, fz(0.185));
  g.add(bezel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.30, D * 0.115), screenMat);
  screen.rotation.x = -Math.PI / 2;
  screen.position.set(fx(0.34), topY + 0.048, fz(0.185));
  g.add(screen);

  // ── Speaker grille (top-right) ──
  const grille = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.29, D * 0.10), grilleMat);
  grille.rotation.x = -Math.PI / 2;
  grille.position.set(fx(0.71), topY + 0.002, fz(0.16));
  g.add(grille);

  // ── Two knobs (axis up). REC GAIN gets a red cap. ──
  const knobGeo = new THREE.CylinderGeometry(W * 0.024, W * 0.026, 0.06, 24);
  const kVol = new THREE.Mesh(knobGeo, knobMat);
  kVol.position.set(fx(0.10), topY + 0.03, fz(0.205)); g.add(kVol);
  const kGain = new THREE.Mesh(knobGeo, redMat);
  kGain.position.set(fx(0.10), topY + 0.03, fz(0.315)); g.add(kGain);

  // ── Data wheel (big jog dial) ──
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.058, W * 0.062, 0.085, 36), wheelMat);
  wheel.position.set(fx(0.345), topY + 0.04, fz(0.50)); g.add(wheel);
  const dimple = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.008, W * 0.008, 0.02, 12), darkMat);
  dimple.position.set(fx(0.345) + W * 0.04, topY + 0.082, fz(0.50)); g.add(dimple);

  // ── Volume slider cap (track is baked) ──
  const cap = new THREE.Mesh(new THREE.BoxGeometry(W * 0.04, 0.03, D * 0.025), darkMat);
  cap.position.set(fx(0.083), topY + 0.018, fz(0.70)); g.add(cap);

  // ── Cursor pad (small raised cross) ──
  const cur = new THREE.Mesh(new THREE.BoxGeometry(W * 0.05, 0.025, D * 0.05), knobMat);
  cur.position.set(fx(0.35), topY + 0.014, fz(0.575)); g.add(cur);

  // ── Pad section: raised deck + 4×4 drum pads + select halo, grouped so the whole
  //    thing can lift out into front-facing focus (like a vinyl record). The group's
  //    origin sits at the deck centre, so it scales/rotates about itself; children are
  //    positioned relative to that centre. ──
  const section = new THREE.Group();
  section.position.set(SEC_CX, topY, SEC_CZ);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(SEC_W, 0.03, SEC_H), padDeckMat);
  deck.position.set(0, 0.015, 0); section.add(deck);
  MPC.deck = deck;
  const padGeo = new THREE.BoxGeometry(W * 0.090, 0.05, D * 0.090);
  MPC.pads = [];
  for (let ri = 0; ri < 4; ri++) {
    for (let ci = 0; ci < 4; ci++) {
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.set(fx(0.595 + ci * 0.108) - SEC_CX, 0.055, fz(0.46 + ri * 0.108) - SEC_CZ);
      pad.userData.padIndex = (3 - ri) * 4 + ci;   // bottom-left = PAD 1
      section.add(pad);
      MPC.pads.push(pad);
    }
  }
  MPC.padEmbeds = MPC_PAD_EMBEDS;

  // Selection cursor — a small glowing frame laid over the active pad while focused on
  // desktop (mobile triggers by direct tap, so it has no persistent cursor). Reuses the
  // amber halo texture; repositioned over the cursored pad and pulsed in update().
  const padHi = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 0.135, D * 0.135),
    new THREE.MeshBasicMaterial({
      map: MPC.haloTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }),
  );
  padHi.rotation.x = -Math.PI / 2;
  padHi.position.y = 0.092;
  padHi.renderOrder = 7;
  padHi.visible = false;
  section.add(padHi);
  MPC.padHi = padHi;
  MPC.padHiMat = padHi.material;

  // ── Select halo: a glowing frame lying flat over the whole pad section, signalling
  // it's ready to be brought into focus. Sized a touch larger than the deck; pulsed in
  // update(). Hidden once focused. ──
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(SEC_W * 1.42, SEC_H * 1.40),
    new THREE.MeshBasicMaterial({
      map: MPC.haloTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.set(0, 0.09, 0);
  halo.renderOrder = 6;
  halo.visible = false;   // update() reveals it once the unit is fully open
  section.add(halo);
  MPC.halo = halo;
  MPC.haloMat = halo.material;

  g.add(section);
  MPC.section = section;

  // Tilt the whole console back so the top control surface faces the player.
  g.rotation.x = MPC_TILT;
  return g;
}

// Per-field build steps — each idempotent (skips a field already built), so they run either
// all-at-once (_buildMpcAssets, the open-time fallback) or one-per-idle-tick (_mpcIdlePrebuild,
// the on-approach preload). The face canvas (1024px silkscreen), the screen canvas, and the
// model are the heavy slices, so each gets its own step.
function _mpcAssetSteps() {
  return [
    () => { if (!MPC.faceTex)   { MPC.faceTex   = makeMpcFaceTex();   _initTex(MPC.faceTex); } },
    () => { if (!MPC.screenTex) { MPC.screenTex = makeMpcScreenTex(); _initTex(MPC.screenTex); } },
    () => { if (!MPC.grilleTex) { MPC.grilleTex = makeMpcGrilleTex(); _initTex(MPC.grilleTex); } },
    () => { if (!MPC.haloTex)   { MPC.haloTex   = makeMpcHaloTex();   _initTex(MPC.haloTex); } },
    () => { if (!MPC._model)    { MPC._model    = _buildMpc(); } },
  ];
}

// Synchronous build — the open-time fallback if the player opens before the idle preload finishes.
function _buildMpcAssets() {
  if (MPC._built) return;
  const steps = _mpcAssetSteps();
  for (let i = 0; i < steps.length; i++) steps[i]();
  MPC._built = true;
}

// On-approach preload (fired once by core's floater-loop proximity hook): build the assets one
// slice per idle tick — so the first open is instant without a single long hitch during roam.
let _mpcPrebuilding = false;
let _mpcUIHidden = false;   // cached focus-hidden state so update() only toggles HUD classes on change
function _mpcIdlePrebuild() {
  if (MPC._built || _mpcPrebuilding) return;
  _mpcPrebuilding = true;
  const steps = _mpcAssetSteps();
  let i = 0;
  const step = () => {
    if (i >= steps.length) { MPC._built = true; return; }
    steps[i++]();
    core.scheduleIdle(step);
  };
  core.scheduleIdle(step);
}

function _openMpc(px, pz, openYaw) {
  if (mpcPhase) return;
  _buildMpcAssets();
  beginExhibitDPR();

  // The visitor will hit a pad within seconds — warm the clip origins now (skips the cold
  // DNS+TLS on first play) and prime the pad thumbnails during idle so the poster is instant.
  _warmMpcConnections();
  _preloadMpcThumbs();

  const fl = floaters[MPC.floaterIdx];
  setTriggerFloater(fl);
  _setFloaterVisible(fl, false);

  mpcPhase = 'opening';
  mpcT     = 0;
  mpcGroup = new THREE.Group();
  _mpcFwd.set(Math.sin(openYaw), 0, Math.cos(openYaw));
  mpcGroup.position.set(px + _mpcFwd.x * CRATE_DIST, MPC_Y, pz + _mpcFwd.z * CRATE_DIST);
  mpcGroup.rotation.y = openYaw + Math.PI;   // face the player
  scene.add(mpcGroup);

  // The cached model is detached (not disposed) on close, so it survives across opens.
  mpcGroup.add(MPC._model);
  mpcGroup.userData.model = MPC._model;
  mpcGroup.scale.setScalar(0.04);
}

function _closeMpc() {
  _hideMpcEmbed();
  _resetMpcPads();
  // The section may still be reparented to the scene (mid-focus dismiss) — re-home it so
  // it travels with the cached model rather than being orphaned / disposed separately.
  if (mpcFocusPhase || (MPC.section && MPC.section.parent !== MPC._model)) _resetMpcFocus();
  if (mpcGroup) {
    if (mpcGroup.userData.model) mpcGroup.remove(mpcGroup.userData.model); // keep the cached model
    _disposeCrateObject(mpcGroup);
    scene.remove(mpcGroup);
    mpcGroup = null;
  }
  mpcPhase = null;
  mpcT     = 0;
  _hideMpcHint();
  _mpcUIHidden = false;
  _elMmWrap.classList.remove('focus-hidden');
  _elUi?.classList.remove('focus-hidden');
  _jZone.classList.remove('focus-hidden');
  endExhibitDPR();
  _restoreExhibitFloater();
}

function _dismissMpc() {
  if (!mpcPhase || mpcPhase === 'closing') return;
  if (mpcFocusPhase) _resetMpcFocus();   // snap the section home so the cached model stays intact
  _hideMpcHint();
  mpcPhase = 'closing';
  mpcT = 1;
  _restoreExhibitFloater();
}

// ── PAD-SECTION FOCUS — the whole deck lifts out of the unit, turns flat-on, and
//    scales up to fill the view, reusing the carousel/crate focus maths. ──

// Live home (world) transform of the section had it stayed inside the model — the unit
// bobs each frame, so the unfocus tween re-targets this every frame.
function _sectionHomeWorld(outPos, outQuat) {
  MPC._model.updateWorldMatrix(true, false);
  _tmpMat.multiplyMatrices(MPC._model.matrixWorld, _secHomeMat);
  _tmpMat.decompose(outPos, outQuat, _tmpScale);
  return _tmpScale.x;
}

function _refreshMpcFocusTarget() {
  // Inflate the target panel size by the margin so the grid fills less than the full
  // viewport — leaving a clear border so no pads run off the edge.
  _secToScale = _computeExhibitFocusTarget(_secToPos, _secToQuat, SEC_W * MPC_FOCUS_MARGIN, SEC_H * MPC_FOCUS_MARGIN);
  _secToQuat.multiply(_faceQuat);   // turn the pad-grid top toward the camera
}

// Measure where the visible content (deck + pads, NOT the larger halo) actually lands
// and slide the section sideways so its centre sits on the camera axis — guaranteeing
// equal blank space left/right and top/bottom regardless of any in-deck offset or the
// perspective skew from the pads' depth. Called after the transform is applied.
function _recenterMpcFocus(w) {
  if (!MPC.section || !MPC.deck) return;
  MPC.section.updateMatrixWorld(true);
  _focusBox.makeEmpty();
  _focusBox.expandByObject(MPC.deck);
  for (let i = 0; i < MPC.pads.length; i++) _focusBox.expandByObject(MPC.pads[i]);
  _focusBox.getCenter(_focusCtr);

  camera.getWorldDirection(_camDir);
  _toCtr.copy(_focusCtr).sub(camera.position);
  const along = _toCtr.dot(_camDir);                 // depth of the content centre on the view axis
  _lateral.copy(_toCtr).addScaledVector(_camDir, -along); // its off-axis (sideways) component
  MPC.section.position.addScaledVector(_lateral, -(w === undefined ? 1 : w)); // slide onto the axis
}

function _startMpcFocus() {
  if (mpcFocusPhase || mpcPhase !== 'open' || !MPC.section) return;
  _syncCamera();
  scene.attach(MPC.section);                 // reparent to world, preserving the deck's pose
  _secFromPos.copy(MPC.section.position);
  _secFromQuat.copy(MPC.section.quaternion);
  _secFromScale = MPC.section.scale.x;
  if (MPC.halo) MPC.halo.visible = false;
  _positionMpcPadHi();   // seat the cursor over the default pad before it appears
  _refreshMpcFocusTarget();
  mpcFocusPhase = 'focusing';
  mpcFocusT = 0;
  _hideMpcHint();
}

function _startMpcUnfocus() {
  if (mpcFocusPhase !== 'focused' || !MPC.section) return;
  _hideMpcEmbed();
  _resetMpcPads();
  _secFromPos.copy(MPC.section.position);
  _secFromQuat.copy(MPC.section.quaternion);
  _secFromScale = MPC.section.scale.x;
  mpcFocusPhase = 'unfocusing';
  mpcFocusT = 0;
  _hideMpcHint();
}

// Re-home the section under the cached model with its original local transform.
function _homeMpcSection() {
  if (!MPC.section) return;
  MPC._model.add(MPC.section);
  MPC.section.position.set(SEC_CX, topY, SEC_CZ);
  MPC.section.quaternion.identity();
  MPC.section.scale.setScalar(1);
}

function _finishMpcUnfocus() {
  _homeMpcSection();
  mpcFocusPhase = null;
  mpcFocusT = 0;
  if (mpcPhase === 'open') _showMpcOpenHint();   // back to the unit — re-offer "focus pads"
}

// Hard reset (on dismiss/close) — snap the section home immediately, no tween.
function _resetMpcFocus() {
  _hideMpcEmbed();
  _resetMpcPads();
  _homeMpcSection();
  if (MPC.halo) MPC.halo.visible = false;
  if (MPC.padHi) MPC.padHi.visible = false;
  mpcFocusPhase = null;
  mpcFocusT = 0;
  _hideMpcHint();
}

function _tickMpcFocus(dt) {
  if (!mpcFocusPhase || !MPC.section) return;
  const sec = MPC.section;
  if (mpcFocusPhase === 'focusing') {
    _refreshMpcFocusTarget();
    mpcFocusT = Math.min(1, mpcFocusT + dt / MPC_FOCUS_DUR);
    const s = mpcFocusT * mpcFocusT * (3 - 2 * mpcFocusT);
    sec.position.lerpVectors(_secFromPos, _secToPos, s);
    _secLerpQuat.slerpQuaternions(_secFromQuat, _secToQuat, s);
    sec.quaternion.copy(_secLerpQuat);
    sec.scale.setScalar(_secFromScale + (_secToScale - _secFromScale) * s);
    _recenterMpcFocus(s);   // ease the screen-centring in with the lift (no pop at settle)
    if (mpcFocusT >= 1) { mpcFocusPhase = 'focused'; _showMpcFocusHint(); }
  } else if (mpcFocusPhase === 'focused') {
    _refreshMpcFocusTarget();
    sec.position.copy(_secToPos);
    sec.quaternion.copy(_secToQuat);
    sec.scale.setScalar(_secToScale);
    _recenterMpcFocus(1);   // hold it screen-centred
  } else if (mpcFocusPhase === 'unfocusing') {
    mpcFocusT = Math.min(1, mpcFocusT + dt / MPC_FOCUS_DUR);
    const s = mpcFocusT * mpcFocusT * (3 - 2 * mpcFocusT);
    const homeScale = _sectionHomeWorld(_secToPos, _secToQuat);   // live (the unit bobs)
    sec.position.lerpVectors(_secFromPos, _secToPos, s);
    _secLerpQuat.slerpQuaternions(_secFromQuat, _secToQuat, s);
    sec.quaternion.copy(_secLerpQuat);
    sec.scale.setScalar(_secFromScale + (homeScale - _secFromScale) * s);
    if (mpcFocusT >= 1) _finishMpcUnfocus();
  }
}

// ── CONTROL HINTS ────────────────────────────────────────────────────────────
// Mirrors core's focus-escape-hint behaviour (show → auto-dim) but with MPC-specific
// copy so the visitor always knows what to press at each stage.
const _MPC_HINT_SEP = `<span class="feh-label feh-sep">&middot;</span>`;
// Wrap a hint chunk so mobile can stack whole segments as centred rows (desktop keeps them inline,
// dot-separated — .feh-seg is display:contents there). Mirrors the CRT hint structure.
const _mpcSeg = inner => `<span class="feh-seg">${inner}</span>`;

function _setMpcHint(html, dimAfter) {
  if (!_elMpcHint) return;
  _elMpcHint.innerHTML = html;
  _elMpcHint.classList.remove('dim');
  _elMpcHint.classList.add('visible');
  clearTimeout(_mpcHintTimer);
  if (dimAfter) _mpcHintTimer = setTimeout(() => _elMpcHint.classList.add('dim'), dimAfter);
}

function _hideMpcHint() {
  clearTimeout(_mpcHintTimer);
  if (_elMpcHint) _elMpcHint.classList.remove('visible', 'dim');
  _hideMpcPadGuide();   // the guide card is part of the same focus guidance — tear it down together
}

// Dismissable guidance card: fuller explanation of the pad grid, shown the first time it
// focuses. Returns true if it actually displayed (so the focus pill can stand down).
function _showMpcPadGuide() {
  if (!_elMpcGuide || _mpcGuideDismissed) return false;
  if (_elMpcGuideBody) {
    _elMpcGuideBody.innerHTML = isMobile
      ? `Each of these 16 pads triggers a clip. <b>Tap a pad</b> to play it, and <b>tap outside</b> the grid to step back.`
      : `Each of these 16 pads triggers a clip. Use the ` +
        `<span class="feh-key">&larr;</span><span class="feh-key">&rarr;</span>` +
        `<span class="feh-key">&uarr;</span><span class="feh-key">&darr;</span> arrow keys to move between pads, ` +
        `press <span class="feh-key">spc</span> to play the selected one, and ` +
        `<span class="feh-key">esc</span> to step back.`;
  }
  _elMpcGuide.classList.add('visible');
  return true;
}

function _hideMpcPadGuide() {
  if (_elMpcGuide) _elMpcGuide.classList.remove('visible');
}

// Closing the card dismisses it for the session; the button pill at the bottom stays put,
// so the controls remain reachable at a glance.
if (_elMpcGuideClose) _elMpcGuideClose.addEventListener('click', () => {
  _mpcGuideDismissed = true;
  _hideMpcPadGuide();
});

// Unit open, not yet focused — how to bring the pad grid forward.
function _showMpcOpenHint() {
  _setMpcHint(isMobile
    ? `<span class="feh-label">tap to focus the pads</span>`
    : `<span class="feh-key">spc</span><span class="feh-label">focus pads</span>`,
    8500);
}

// Pad grid focused — guide the visitor: each pad holds a clip, here's how to move
// across the grid, trigger one for its media, and step back. The fuller dismissable card
// shows ALONGSIDE this terse button pill (until the visitor closes the card).
function _showMpcFocusHint() {
  _showMpcPadGuide();
  if (isMobile) {
    _setMpcHint(
      _mpcSeg(`<span class="feh-label">tap a pad to play its clip</span>`) + _MPC_HINT_SEP +
      _mpcSeg(`<span class="feh-label">tap outside to return</span>`),
      9000);
  } else {
    _setMpcHint(
      _mpcSeg(
        `<span style="display:inline-flex;gap:4px"><span class="feh-key">&larr;</span><span class="feh-key">&rarr;</span>` +
        `<span class="feh-key">&uarr;</span><span class="feh-key">&darr;</span></span><span class="feh-label">move between pads</span>`) +
      `${_MPC_HINT_SEP}` + _mpcSeg(`<span class="feh-key">spc</span><span class="feh-label">play its clip</span>`) +
      `${_MPC_HINT_SEP}` + _mpcSeg(`<span class="feh-key">esc</span><span class="feh-label">back</span>`),
      9000);
  }
}

// Clip overlay up — how to dismiss it, plus the ↻ reload (top-left): YouTube occasionally throws a
// transient "try again later" error on a clip, and a tap on ↻ re-kicks it. Named here so the glyph
// isn't a mystery — this hint shows exactly when the visitor might hit that error.
function _showMpcEmbedHint() {
  const reload = _MPC_HINT_SEP + _mpcSeg(`<span class="feh-label">&#8635;&#xFE0E; reload if it won&rsquo;t play</span>`);
  _setMpcHint((isMobile
    ? _mpcSeg(`<span class="feh-label">tap outside to close</span>`)
    : _mpcSeg(`<span class="feh-key">esc</span><span class="feh-label">close video</span>`)) + reload,
    4200);
}

// ── PAD SELECTION + TRIGGER ──────────────────────────────────────────────────
// Lay the selection cursor over the currently-selected pad.
function _positionMpcPadHi() {
  if (!MPC.padHi || !MPC.pads) return;
  const p = MPC.pads[mpcPadSel];
  if (p) MPC.padHi.position.set(p.position.x, 0.092, p.position.z);
}

// Move the desktop cursor across the 4×4 grid (rows top→bottom, cols left→right) with wrap.
function _moveMpcSel(dRow, dCol) {
  if (!MPC.pads) return;
  let row = Math.floor(mpcPadSel / 4) + dRow;
  let col = (mpcPadSel % 4) + dCol;
  row = (row + 4) % 4;
  col = (col + 4) % 4;
  mpcPadSel = row * 4 + col;
  _positionMpcPadHi();
}

// Restore every pad to rest (cancels any in-flight press dip).
function _resetMpcPads() {
  if (MPC.pads) for (let i = 0; i < MPC.pads.length; i++) MPC.pads[i].scale.set(1, 1, 1);
  _mpcPressIdx = -1;
  _mpcPressT = 0;
}

// Bring the triggered pad's clip up in an iframe overlay. The pad's thumbnail paints
// instantly behind a spinner (the "facade") so the press reads as snappy; the live player
// crossfades in on top once it loads, masking the cold iframe fetch / pad-to-pad reload.
function _showMpcEmbed(idx) {
  const url = MPC.padEmbeds && MPC.padEmbeds[idx];
  if (!_elMpcYt || !url) return;

  // Reset to the loading state (poster + spinner showing) before the player starts fetching.
  const poster = MPC_PAD_POSTERS[idx];
  if (_elMpcYtPoster) _elMpcYtPoster.style.backgroundImage = poster ? `url("${poster}")` : 'none';
  if (_elMpcYtFrame)  _elMpcYtFrame.classList.remove('loaded');
  clearTimeout(_mpcLoadTimer);

  if (_elMpcYtIframe) {
    if (_elMpcYtIframe.src !== url) {
      // Crossfade the facade out when the player document loads; safety timer guarantees the
      // player is revealed even if onload never fires (flaky network / blocked frame).
      _elMpcYtIframe.onload = () => { clearTimeout(_mpcLoadTimer); _elMpcYtFrame?.classList.add('loaded'); };
      _mpcLoadTimer = setTimeout(() => _elMpcYtFrame?.classList.add('loaded'), 4000);
      _elMpcYtIframe.src = url;
    } else {
      _elMpcYtFrame?.classList.add('loaded');   // same clip already loaded — reveal immediately
    }
  }

  _elMpcYt.classList.add('visible');
  _hideMpcPadGuide();   // the clip takes over — the grid guidance isn't relevant while it plays
  mpcEmbedOn = true;
  _mpcEmbedIdx = idx;
  _showMpcEmbedHint();
}

// Re-kick the clip that's currently up — for when YouTube throws its transient, server-side "An
// error occurred, please try again later" playback error. That error can't be caught in the
// cross-origin iframe (onload fires fine; the error shows inside YouTube's own player), so the
// visitor taps ↻ to force a fresh load; it rides their gesture so autoplay still works. Blanking
// src first guarantees the reload — _showMpcEmbed otherwise short-circuits when the url is unchanged.
function _reloadMpcEmbed() {
  if (!mpcEmbedOn || _mpcEmbedIdx < 0 || !_elMpcYtIframe) return;
  _elMpcYtIframe.src = '';
  _showMpcEmbed(_mpcEmbedIdx);
}

// Tear the overlay down and stop playback (clearing src halts the video), and reset the
// facade so the next press starts from a clean loading state.
function _hideMpcEmbed() {
  if (!mpcEmbedOn && (!_elMpcYt || !_elMpcYt.classList.contains('visible'))) return;
  if (_elMpcYt) _elMpcYt.classList.remove('visible');
  clearTimeout(_mpcLoadTimer);
  if (_elMpcYtIframe) { _elMpcYtIframe.onload = null; _elMpcYtIframe.src = ''; }
  if (_elMpcYtFrame)  _elMpcYtFrame.classList.remove('loaded');
  if (_elMpcYtPoster) _elMpcYtPoster.style.backgroundImage = 'none';
  _mpcEmbedIdx = -1;
  mpcEmbedOn = false;
  if (mpcFocusPhase === 'focused') _showMpcFocusHint();
}

// Fire a pad: select it, kick its press dip, and load its clip.
function _triggerMpcPad(idx) {
  if (idx == null || idx < 0 || !MPC.pads || idx >= MPC.pads.length) return;
  mpcPadSel = idx;
  _positionMpcPadHi();
  _mpcPressIdx = idx;
  _mpcPressT = 0;
  _showMpcEmbed(idx);
}

// Mobile: tap a pad to trigger it; tap blank space (or while the clip is up) to step back.
if (isMobile && renderer && renderer.domElement) {
  const _padTapStarts = {};
  renderer.domElement.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) _padTapStarts[t.identifier] = { x: t.clientX, y: t.clientY, t: Date.now() };
  });
  renderer.domElement.addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
      const s = _padTapStarts[t.identifier];
      delete _padTapStarts[t.identifier];
      if (!s || mpcFocusPhase !== 'focused' || !MPC.pads) continue;
      const dx = t.clientX - s.x, dy = t.clientY - s.y;
      if (Date.now() - s.t >= 280 || dx * dx + dy * dy >= 225) continue;   // not a tap (matches core)
      if (mpcEmbedOn) { _hideMpcEmbed(); continue; }                       // clip up → dismiss it
      _padNdc.set((t.clientX / window.innerWidth) * 2 - 1, -(t.clientY / window.innerHeight) * 2 + 1);
      _padRay.setFromCamera(_padNdc, camera);
      const hit = _padRay.intersectObjects(MPC.pads, false)[0];
      if (hit) _triggerMpcPad(MPC.pads.indexOf(hit.object));               // pad → play
      else _startMpcUnfocus();                                            // blank → step out
    }
  });
  renderer.domElement.addEventListener('touchcancel', e => {
    for (const t of e.changedTouches) delete _padTapStarts[t.identifier];
  });
}

if (_elMpcYtClose) {
  const _close = e => { e.preventDefault(); e.stopPropagation(); _hideMpcEmbed(); };
  _elMpcYtClose.addEventListener('click', _close);
  _elMpcYtClose.addEventListener('touchstart', _close, { passive: false });
}
if (_elMpcYtReload) {
  const _reload = e => { e.preventDefault(); e.stopPropagation(); _reloadMpcEmbed(); };
  _elMpcYtReload.addEventListener('click', _reload);
  _elMpcYtReload.addEventListener('touchstart', _reload, { passive: false });
}

// Keyboard Escape can't reach us while the clip iframe holds focus: it's cross-origin, so
// its keydowns fire in YouTube's/SoundCloud's document, not ours, and core never sees the
// Escape. When the iframe grabs focus (the player blurs the top window), pull focus back to
// the overlay so the document receives keys again — the click that moved focus has already
// registered inside the player, so play/pause still toggles. Guarded on document.hasFocus()
// so we don't fight a real tab-switch / alt-tab (then the iframe isn't the active element).
if (_elMpcYt && _elMpcYtIframe) {
  _elMpcYt.tabIndex = -1;   // focusable target, but not a Tab stop
  window.addEventListener('blur', () => {
    if (!mpcEmbedOn) return;
    setTimeout(() => {
      if (mpcEmbedOn && document.hasFocus() && document.activeElement === _elMpcYtIframe) {
        try { _elMpcYt.focus({ preventScroll: true }); } catch (e) {}
      }
    }, 0);
  });
}

registerExhibit({
  id: 'mpc-2000',
  floater: MPC.floaterIdx,
  open: (px, pz, yaw) => _openMpc(px, pz, yaw),
  isActive: () => !!mpcPhase,
  dismiss: () => _dismissMpc(),
  // The MPC is a light cream/grey device that blows out under the orb's full 12-intensity
  // light at close range (unlike the CRT, which is near-black). Request a *partial* room
  // dim (≈0.5) via core's hook: a full dim leaves it too dark, full light blows it out, so
  // this knocks the orb back to ~60% and softly lowers the room — a middle ground that's
  // light-based (so it holds as the player moves). Released on 'closing' so light ramps back.
  dimsRoom: () => (mpcPhase === 'opening' || mpcPhase === 'open') ? 0.38 : 0,
  // Freeze the player while the pad section is held in focus (matches the crate).
  locksMovement: () => mpcFocusPhase === 'focusing' || mpcFocusPhase === 'focused',
  update(ctx) {
    // ── Input ──
    if (ctx.iCD <= 0) {
      if (ctx.escEdge) {
        // Escape backs out one layer at a time: clip overlay → focus → the whole unit.
        if (mpcEmbedOn) { _hideMpcEmbed(); hidePrompt(); ctx.setCD(0.3); }
        else if (mpcFocusPhase === 'focused') { _startMpcUnfocus(); hidePrompt(); ctx.setCD(0.35); }
        else if (mpcPhase && mpcPhase !== 'closing') { _dismissMpc(); hidePrompt(); ctx.setCD(0.3); }
      } else if (ctx.eEdge) {
        // Space/E (desktop) or tap (mobile): bring the pad section into focus.
        if (mpcPhase === 'open' && !mpcFocusPhase) { _startMpcFocus(); hidePrompt(); ctx.setCD(0.35); }
        // Desktop, focused: Space/E triggers the cursored pad (or closes the clip if up).
        // Mobile interaction while focused is owned by the pad-tap raycast listener above.
        else if (!isMobile && mpcFocusPhase === 'focused') {
          if (mpcEmbedOn) { _hideMpcEmbed(); ctx.setCD(0.3); }
          else { _triggerMpcPad(mpcPadSel); ctx.setCD(0.3); }
        }
      }
    }

    // Desktop arrow keys cycle the pad cursor across the 4×4 grid while focused (movement
    // is locked in focus, so the arrows are free). Edges tracked every frame for clean steps.
    if (!isMobile && mpcFocusPhase === 'focused' && !mpcEmbedOn) {
      const l = !!keys['ArrowLeft'], r = !!keys['ArrowRight'], u = !!keys['ArrowUp'], d = !!keys['ArrowDown'];
      if (ctx.iCD <= 0) {
        if (l && !_mpcNavL) { _moveMpcSel(0, -1); ctx.setCD(0.15); }
        else if (r && !_mpcNavR) { _moveMpcSel(0, 1); ctx.setCD(0.15); }
        else if (u && !_mpcNavU) { _moveMpcSel(-1, 0); ctx.setCD(0.15); }
        else if (d && !_mpcNavD) { _moveMpcSel(1, 0); ctx.setCD(0.15); }
      }
      _mpcNavL = l; _mpcNavR = r; _mpcNavU = u; _mpcNavD = d;
    } else {
      _mpcNavL = _mpcNavR = _mpcNavU = _mpcNavD = false;
    }

    // ── Open / close scale animation ──
    if (mpcPhase === 'opening') {
      mpcT = Math.min(1, mpcT + ctx.dt / OPEN_DUR);
      const s = mpcT * mpcT * (3 - 2 * mpcT);
      if (mpcGroup) mpcGroup.scale.setScalar(0.04 + s * 0.96);
      if (mpcT >= 1) { mpcPhase = 'open'; _showMpcOpenHint(); }
    } else if (mpcPhase === 'closing') {
      mpcT = Math.max(0, mpcT - ctx.dt / CLOSE_DUR);
      const s = mpcT * mpcT * (3 - 2 * mpcT);
      if (mpcGroup) mpcGroup.scale.setScalar(0.04 + s * 0.96);
      if (mpcT <= 0) _closeMpc();
    }
    if (mpcGroup) mpcGroup.position.y = MPC_Y + Math.sin(ctx.t * 1.4) * 0.03;

    // ── Select halo — frames the whole pad section while open & idle, signalling it's
    // ready to be brought into focus. Breathing pulse on opacity + a subtle scale.
    // Hidden during focus (and any non-open phase). ──
    if (MPC.halo) {
      if (mpcPhase === 'open' && !mpcFocusPhase) {
        MPC.halo.visible = true;
        MPC.haloMat.opacity = 0.5 + (Math.sin(ctx.t * 3.0) * 0.5 + 0.5) * 0.5;  // 0.5 → 1.0
        const sc = 1 + Math.sin(ctx.t * 3.0) * 0.05;
        MPC.halo.scale.set(sc, sc, 1);
      } else {
        MPC.halo.visible = false;
      }
    }

    // Pad-section focus tween (lift-out / settle / return).
    _tickMpcFocus(ctx.dt);

    // Self-light the section in focus — ramp emissive with the lift so the grid reads
    // (it sits away from the orb, so unlit it would be black-on-black at the edges).
    if (MPC.padMat) {
      const lit = mpcFocusPhase === 'focused'    ? 1
                : mpcFocusPhase === 'focusing'    ? mpcFocusT
                : mpcFocusPhase === 'unfocusing'  ? 1 - mpcFocusT
                : 0;
      MPC.padMat.emissiveIntensity = lit;
      MPC.padDeckMat.emissiveIntensity = lit;
    }

    // Pad press dip — the triggered pad punches down briefly for tactile feedback.
    if (_mpcPressIdx >= 0 && MPC.pads && MPC.pads[_mpcPressIdx]) {
      _mpcPressT = Math.min(1, _mpcPressT + ctx.dt / MPC_PRESS_DUR);
      const dip = Math.sin(_mpcPressT * Math.PI);   // 0 → 1 → 0
      MPC.pads[_mpcPressIdx].scale.y = 1 - dip * 0.55;
      if (_mpcPressT >= 1) { MPC.pads[_mpcPressIdx].scale.y = 1; _mpcPressIdx = -1; }
    }

    // Selection cursor — desktop only, while focused and the clip isn't up. Breathing pulse.
    if (MPC.padHi) {
      const showHi = !isMobile && mpcFocusPhase === 'focused' && !mpcEmbedOn;
      MPC.padHi.visible = showHi;
      if (showHi) MPC.padHiMat.opacity = 0.55 + (Math.sin(ctx.t * 4.0) * 0.5 + 0.5) * 0.45;
    }

    // Hide the HUD while the section is held in focus (matches the crate). Only touch the DOM
    // when the state actually flips — not every frame.
    const _focusUIHidden = mpcFocusPhase === 'focusing' || mpcFocusPhase === 'focused';
    if (_focusUIHidden !== _mpcUIHidden) {
      _mpcUIHidden = _focusUIHidden;
      _elMmWrap.classList.toggle('focus-hidden', _focusUIHidden);
      _elUi?.classList.toggle('focus-hidden', _focusUIHidden);
      _jZone.classList.toggle('focus-hidden', _focusUIHidden);
    }

    // Faint LCD glow — one scalar nudge (no array writes, no DOM queries)
    if (MPC.screenMat) MPC.screenMat.emissiveIntensity = 0.5 + Math.sin(ctx.t * 6) * 0.06;
  },
});

// Pre-build the unit + textures on approach so the first open is instant. core's floater-loop
// fires this once when the player nears the MPC floater, then nulls it. Falls back to the
// synchronous _buildMpcAssets() in _openMpc if opened before the idle build finishes.
if (floaters[MPC.floaterIdx]) floaters[MPC.floaterIdx]._preload = _mpcIdlePrebuild;
