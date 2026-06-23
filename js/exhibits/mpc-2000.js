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
  THREE, scene, isMobile, floaters, MAX_ANISO,
  CRATE_DIST, OPEN_DUR, CLOSE_DUR,
  registerExhibit,
  initTex: _initTex,
  setFloaterVisible: _setFloaterVisible,
  restoreFloater: _restoreExhibitFloater,
  disposeObject3D: _disposeCrateObject,
  setTriggerFloater, beginExhibitDPR, endExhibitDPR, hidePrompt,
} = core;

const MPC = {
  floaterIdx: 5,    // the purple "cosmos" dodecahedron on the room's right side (back corner)
  _model: null,     // cached THREE.Group — the body never changes, build once
  _built: false,
  faceTex: null,    // baked top-surface faceplate (branding + labels + flush buttons)
  screenTex: null,  // LCD emissive map
  grilleTex: null,  // speaker-grille slats
  screenMat: null,  // kept so update() can flicker the LCD emissive
};

const MPC_SIZE = 5.6;            // overall body width; every part is a fraction of this
const MPC_Y    = 2.1;            // group-center height — scaled with MPC_SIZE (~0.38×) so the tilted unit keeps its floor clearance
const MPC_TILT = 0.32 * Math.PI; // backward tilt so the top control surface faces the player
const _mpcFwd  = new THREE.Vector3();

let mpcPhase = null;   // 'opening' | 'open' | 'closing' | null
let mpcT     = 0;
let mpcGroup = null;

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
  const padDeckMat = new THREE.MeshStandardMaterial({ color: 0xbcc0c7, roughness: 0.55, metalness: 0.06 });
  const padMat    = new THREE.MeshStandardMaterial({ color: 0x24272d, roughness: 0.7, metalness: 0.08 });
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

  // ── Raised pad deck + 4×4 drum pads (individually addressable for Step 2) ──
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W * 0.43, 0.03, D * 0.44), padDeckMat);
  deck.position.set(fx(0.76), topY + 0.015, fz(0.62)); g.add(deck);
  const padGeo = new THREE.BoxGeometry(W * 0.090, 0.05, D * 0.090);
  MPC.pads = [];
  for (let ri = 0; ri < 4; ri++) {
    for (let ci = 0; ci < 4; ci++) {
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.set(fx(0.595 + ci * 0.108), topY + 0.055, fz(0.46 + ri * 0.108));
      pad.userData.padIndex = (3 - ri) * 4 + ci;   // bottom-left = PAD 1
      g.add(pad);
      MPC.pads.push(pad);
    }
  }

  // Tilt the whole console back so the top control surface faces the player.
  g.rotation.x = MPC_TILT;
  return g;
}

function _buildMpcAssets() {
  if (MPC._built) return;
  MPC.faceTex   = makeMpcFaceTex();   _initTex(MPC.faceTex);
  MPC.screenTex = makeMpcScreenTex(); _initTex(MPC.screenTex);
  MPC.grilleTex = makeMpcGrilleTex(); _initTex(MPC.grilleTex);
  MPC._model = _buildMpc();
  MPC._built = true;
}

function _openMpc(px, pz, openYaw) {
  if (mpcPhase) return;
  _buildMpcAssets();
  beginExhibitDPR();

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
  if (mpcGroup) {
    if (mpcGroup.userData.model) mpcGroup.remove(mpcGroup.userData.model); // keep the cached model
    _disposeCrateObject(mpcGroup);
    scene.remove(mpcGroup);
    mpcGroup = null;
  }
  mpcPhase = null;
  mpcT     = 0;
  endExhibitDPR();
  _restoreExhibitFloater();
}

function _dismissMpc() {
  if (!mpcPhase || mpcPhase === 'closing') return;
  mpcPhase = 'closing';
  mpcT = 1;
  _restoreExhibitFloater();
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
  update(ctx) {
    // Escape (desktop) or tap (mobile) dismisses, same as walking out of radius.
    if (ctx.escEdge && ctx.iCD <= 0 && mpcPhase && mpcPhase !== 'closing') {
      _dismissMpc(); hidePrompt(); ctx.setCD(0.3);
    } else if (ctx.eEdge && isMobile && ctx.iCD <= 0 && mpcPhase === 'open') {
      _dismissMpc(); hidePrompt(); ctx.setCD(0.3);
    }
    // Open / close scale animation
    if (mpcPhase === 'opening') {
      mpcT = Math.min(1, mpcT + ctx.dt / OPEN_DUR);
      const s = mpcT * mpcT * (3 - 2 * mpcT);
      if (mpcGroup) mpcGroup.scale.setScalar(0.04 + s * 0.96);
      if (mpcT >= 1) mpcPhase = 'open';
    } else if (mpcPhase === 'closing') {
      mpcT = Math.max(0, mpcT - ctx.dt / CLOSE_DUR);
      const s = mpcT * mpcT * (3 - 2 * mpcT);
      if (mpcGroup) mpcGroup.scale.setScalar(0.04 + s * 0.96);
      if (mpcT <= 0) _closeMpc();
    }
    if (mpcGroup) mpcGroup.position.y = MPC_Y + Math.sin(ctx.t * 1.4) * 0.03;
    // Faint LCD glow — one scalar nudge (no array writes, no DOM queries)
    if (MPC.screenMat) MPC.screenMat.emissiveIntensity = 0.5 + Math.sin(ctx.t * 6) * 0.06;
  },
});
