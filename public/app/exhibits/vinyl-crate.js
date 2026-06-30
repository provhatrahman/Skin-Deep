// ══════════════════════════════════════════
//  EXHIBITION: VINYL CRATE  (floater 3 — the pink torus)
// ══════════════════════════════════════════
// A crate of records the visitor opens, browses (↑/↓), and brings a disc into
// focus to reveal a SoundCloud embed. Self-contained: talks to the rest of the app
// only through the imported `core` surface (+ its own private DOM refs) and
// registers itself via core.registerExhibit().
import { core } from '../core.js';

const {
  THREE, scene, camera, isMobile, MAX_ANISO, floaters,
  CRATE_DIST, OPEN_DUR, CLOSE_DUR,
  registerExhibit, keys,
  initTex: _initTex, scheduleIdle: _scheduleIdle, texLoader: _texLoader,
  setFloaterVisible: _setFloaterVisible, restoreFloater: _restoreExhibitFloater,
  disposeObject3D: _disposeCrateObject, setTriggerFloater, beginExhibitDPR, endExhibitDPR,
  setCD, getCD, hidePrompt, renderFocusPrompt,
  computeFocusTarget: _computeExhibitFocusTarget, syncCamera: _syncCamera,
  showFocusEscapeHint: _showFocusEscapeHint, hideFocusEscapeHint: _hideFocusEscapeHint,
  elAimReticle: _elAimReticle, elPrompt: _elPrompt, elIprLabel: _elIprLabel, elIprIcon: _elIprIcon,
  elMmWrap: _elMmWrap, elUi: _elUi, jZone: _jZone,
} = core;

// ── crate dimensions / timing ──
const CRATE_SWAP_DUR     = 0.88;
const CRATE_FOCUS_DUR    = 0.6;
const RECORD_SIZE        = 2.65;  // governs crate inner dimensions
const RECORD_THICK       = 0.088;
const RECORD_BASE_Y      = RECORD_SIZE * 0.54;
const RECORD_FRONT_Z     = RECORD_SIZE * 0.2;          // shifted toward the front wall
const RECORD_BACK_Z      = RECORD_FRONT_Z - RECORD_SIZE * 0.12;
const DISC_PEEK          = RECORD_SIZE * 0.5;
const CRATE_Y            = 1.1;   // crate group height off the floor
const CRATE_WALL_THICK   = 0.13;
const CRATE_BOTTOM_THICK = 0.12;
const CRATE_DISC_R       = RECORD_SIZE * 0.46;
const CRATE_WOOD_TILE    = 0.52;

// ── state ──
let crateOpen = false;            // absorbs open/close assignments; arbitration is via core's activeExhibit
let cratePhase = null;            // 'opening' | 'browsing' | 'closing' | null
let crateT = 0;
let crateGroup = null;
let _crateSelGrp = null, _crateSeatedGrp = null, _crateIdx = 0;
let crateSwapPhase = null, crateSwapT = 0, _crateSwapDir = 1;
let crateFocusPhase = null, crateFocusT = 0, crateFocusMesh = null, crateFocusDiscRef = null, crateFocusRec = null;
let _crateNavUpWas = false, _crateNavDnWas = false;
let _vinylSteps = null, _vinylStepIdx = 0;   // lazy, idempotent texture/box build steps

// ── own scratch (was shared with the carousel; only one exhibition runs at a time) ──
const _raycaster = new THREE.Raycaster();
const _ndcCenter = new THREE.Vector2(0, 0);
const _panelWp = new THREE.Vector3();
const _focusFromPos = new THREE.Vector3();
const _focusToPos = new THREE.Vector3();
const _focusFromQuat = new THREE.Quaternion();
const _focusToQuat = new THREE.Quaternion();
const _focusLerpQuat = new THREE.Quaternion();
let _focusFromScale = 1;
let _focusToScale = 1;
const _crateFwd = new THREE.Vector3();
const _crateDiscPos = new THREE.Vector3();
const _crateDiscQuat = new THREE.Quaternion();
const _crateDiscScale = new THREE.Vector3();

// ── crate-owned HUD elements ──
const _elCratePrev = document.getElementById('crate-prev-btn');
const _elCrateNext = document.getElementById('crate-next-btn');
const _elCrateBrowseHint = document.getElementById('crate-browse-hint');
let _crateBrowseHintTimer = null;
let _crateNavPulseTimer = null;
// Dismissable guidance card — fuller "what is this / how to use it" copy shown ALONGSIDE the
// browse button pill, until the visitor closes it (one-time per session).
const _elCrateGuide      = document.getElementById('crate-guide');
const _elCrateGuideBody  = document.getElementById('crate-guide-body');
const _elCrateGuideClose = document.getElementById('crate-guide-close');
let _crateGuideDismissed = false;
const _elCrateSc = document.getElementById('crate-sc-embed');
const _elCrateScIframe = document.getElementById('crate-sc-iframe');
const _elCrateScCredit = document.getElementById('crate-sc-credit');

// Vinyl crate exhibit — triggered by floater 3 (the pink torus).
// Open/Close: the whole crateGroup scales from 0.04 → 1 (CRATE_OPEN_DUR) and back (CRATE_CLOSE_DUR)
// with a smoothstep curve. The group also bobs on Y: sin(t*1.4)*0.03.
const VINYL = {
  floaterIdx: 3,
  records: [{
    imagePath: 'images/infaith/in%20faith%20goldtooth.jpeg',
    soundcloud: 'https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/soundcloud%253Atracks%253A1594421781&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true',
    creditUser: 'https://soundcloud.com/user-612196404',
    creditUserLabel: 'NTS 2023',
    creditTrack: 'https://soundcloud.com/user-612196404/in-faith-w-provhat-goldtooth',
    creditTrackLabel: 'In Faith w/ Provhat & GoldTooth 150823',
    disc: {
      title: 'In Faith',
      host1: 'w/ Provhat',
      host2: '& GoldTooth',
      date: '15 Aug 2023',
      genres: 'Nasheed  \u00B7  Qawwali  \u00B7  Bhajan',
    },
  }, {
    imagePath: 'images/infaith/nasheeds.png',
    soundcloud: 'https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/soundcloud%253Atracks%253A1497537766&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true',
    creditUser: 'https://soundcloud.com/user-543006032',
    creditUserLabel: 'NTS Friday',
    creditTrack: 'https://soundcloud.com/user-543006032/nasheeds-naats-w-provhat-200423',
    creditTrackLabel: 'Nasheeds & Naats w/ Provhat 200423',
    disc: {
      title: 'Nasheeds & Naats',
      host1: 'w/ Provhat',
      host2: '',
      date: '20 Apr 2023',
      genres: 'Arabic Traditional',
    },
  }, {
    imagePath: 'images/infaith/guide.jpeg',
    soundcloud: 'https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/soundcloud%253Atracks%253A1855726125&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true',
    creditUser: 'https://soundcloud.com/user-643553014',
    creditUserLabel: 'NTS 2024-2025',
    creditTrack: 'https://soundcloud.com/user-643553014/songs-of-praise-guide-to-the',
    creditTrackLabel: 'Songs of Praise: Guide to The Modern Nasheed w/ Provhat 230624',
    disc: {
      title: 'Songs of Praise',
      host1: 'w/ Provhat',
      host2: '',
      date: '23 Jun 2024',
      genres: 'Modern Nasheed',
    },
  }, {
    imagePath: 'images/infaith/in%20faith%202.jpg',
    soundcloud: 'https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/soundcloud%253Atracks%253A1834815909&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true',
    creditUser: 'https://soundcloud.com/user-643553014',
    creditUserLabel: 'NTS 2024-2025',
    creditTrack: 'https://soundcloud.com/user-643553014/in-faith-w-provhat-iti-300524',
    creditTrackLabel: 'In Faith w/ Provhat & Iti 300524',
    disc: {
      title: 'In Faith',
      host1: 'w/ Provhat',
      host2: '& Iti',
      date: '30 May 2024',
      genres: 'Bhangra  \u00B7  Qawwali  \u00B7  Ghazal',
    },
  }],
  blankTex:  null,
  crateWoodV: null,
  crateWoodH: null,
  _box: null,
  _built: false,
  _labelCanvas: null,   // dynamic front nameplate (brand + current record detail)
  _labelCtx: null,
  _labelTex: null,
};

// Seeded PRNG so crate wood looks identical every load.
function _crateRand(seed) {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

function _crateWoodRGB(rand, bias) {
  const v = 0.68 + rand() * 0.2 + (bias || 0);
  const r = Math.min(255, (38 + rand() * 34) * v);
  const g = Math.min(255, (10 + rand() * 14) * v);
  const b = Math.min(255, (5 + rand() * 9) * v);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function _strokeCratePath(ctx, bctx, vertical, x, y, w, h, gx, gy, wob, phase, dark, rand, thickMul) {
  const mul = thickMul || 1;
  const alpha = dark ? 0.11 + rand() * 0.2 : 0.045 + rand() * 0.09;
  ctx.strokeStyle = dark ? `rgba(10,2,1,${alpha})` : `rgba(112,38,20,${alpha})`;
  ctx.lineWidth = (dark ? 0.7 + rand() * 1.6 : 0.35 + rand() * 0.85) * mul;
  ctx.beginPath();
  if (vertical) {
    ctx.moveTo(gx, y + 1);
    for (let py = y + 1; py < y + h - 1; py += 4 + rand() * 5) {
      ctx.lineTo(gx + Math.sin(py * 0.075 + phase) * wob, py);
    }
  } else {
    ctx.moveTo(x + 1, gy);
    for (let px = x + 1; px < x + w - 1; px += 4 + rand() * 5) {
      ctx.lineTo(px, gy + Math.sin(px * 0.075 + phase) * wob);
    }
  }
  ctx.stroke();
  if (bctx) {
    bctx.strokeStyle = dark ? `rgba(0,0,0,${0.09 + rand() * 0.14})` : `rgba(55,55,55,${0.03 + rand() * 0.04})`;
    bctx.lineWidth = ctx.lineWidth;
    bctx.beginPath();
    if (vertical) {
      bctx.moveTo(gx, y + 1);
      for (let py = y + 1; py < y + h - 1; py += 4 + rand() * 5) {
        bctx.lineTo(gx + Math.sin(py * 0.075 + phase) * wob, py);
      }
    } else {
      bctx.moveTo(x + 1, gy);
      for (let px = x + 1; px < x + w - 1; px += 4 + rand() * 5) {
        bctx.lineTo(px, gy + Math.sin(px * 0.075 + phase) * wob);
      }
    }
    bctx.stroke();
  }
}

function _drawCrateGrain(ctx, bctx, x, y, w, h, vertical, rand) {
  const fineN = Math.max(30, Math.floor((vertical ? w : h) * 3.6));
  for (let i = 0; i < fineN; i++) {
    const dark = rand() > 0.38;
    const wob = 1.4 + rand() * 2.8;
    const phase = rand() * Math.PI * 2;
    if (vertical) {
      const gx = x + 2 + rand() * (w - 4);
      _strokeCratePath(ctx, bctx, vertical, x, y, w, h, gx, 0, wob, phase, dark, rand);
    } else {
      const gy = y + 2 + rand() * (h - 4);
      _strokeCratePath(ctx, bctx, vertical, x, y, w, h, 0, gy, wob, phase, dark, rand);
    }
  }
  const broadN = Math.max(7, Math.floor(fineN * 0.2));
  for (let i = 0; i < broadN; i++) {
    const dark = rand() > 0.25;
    const wob = 3.5 + rand() * 6;
    const phase = rand() * Math.PI * 2;
    if (vertical) {
      const gx = x + 4 + rand() * (w - 8);
      _strokeCratePath(ctx, bctx, vertical, x, y, w, h, gx, 0, wob, phase, dark, rand, 2.4);
    } else {
      const gy = y + 4 + rand() * (h - 8);
      _strokeCratePath(ctx, bctx, vertical, x, y, w, h, 0, gy, wob, phase, dark, rand, 2.4);
    }
  }
}

function _drawCrateKnot(ctx, bctx, cx, cy, r, rand) {
  ctx.fillStyle = `rgba(8,2,1,${0.45 + rand() * 0.28})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 1.15, r * 0.92, rand() * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(28,8,4,${0.3 + rand() * 0.16})`;
  for (let ring = 1; ring <= 4; ring++) {
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * ring * 0.3, r * ring * 0.24, rand() * 0.35, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (bctx) {
    bctx.fillStyle = 'rgba(0,0,0,0.48)';
    bctx.beginPath();
    bctx.ellipse(cx, cy, r * 1.15, r * 0.92, 0, 0, Math.PI * 2);
    bctx.fill();
  }
}

function _drawCrateNail(ctx, bctx, nx, ny) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath(); ctx.arc(nx, ny, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,235,200,0.1)';
  ctx.beginPath(); ctx.arc(nx - 0.7, ny - 0.7, 0.75, 0, Math.PI * 2); ctx.fill();
  if (bctx) {
    bctx.fillStyle = 'rgba(0,0,0,0.22)';
    bctx.beginPath(); bctx.arc(nx, ny, 2.4, 0, Math.PI * 2); bctx.fill();
  }
}

function _drawCrateGap(ctx, bctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(x, y, w, h);
  bctx.fillStyle = '#121212';
  bctx.fillRect(x, y, w, h);
}

function _drawCratePlank(ctx, bctx, x, y, w, h, vertical, rand) {
  ctx.fillStyle = _crateWoodRGB(rand, 0);
  ctx.fillRect(x, y, w, h);
  bctx.fillStyle = '#484848';
  bctx.fillRect(x, y, w, h);

  const bodyGrad = vertical
    ? (() => {
        const g = ctx.createLinearGradient(x, y, x + w, y);
        g.addColorStop(0, 'rgba(0,0,0,0.18)');
        g.addColorStop(0.5, 'rgba(90,28,14,0.08)');
        g.addColorStop(1, 'rgba(0,0,0,0.2)');
        return g;
      })()
    : (() => {
        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, 'rgba(0,0,0,0.16)');
        g.addColorStop(0.5, 'rgba(90,28,14,0.07)');
        g.addColorStop(1, 'rgba(0,0,0,0.18)');
        return g;
      })();
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(x, y, w, h);

  const fade = vertical
    ? (sy => {
        const g = ctx.createLinearGradient(0, sy, 0, sy + h);
        g.addColorStop(0, 'rgba(0,0,0,0.38)');
        g.addColorStop(0.08, 'rgba(0,0,0,0)');
        g.addColorStop(0.92, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.38)');
        return g;
      })(y)
    : (sx => {
        const g = ctx.createLinearGradient(sx, 0, sx + w, 0);
        g.addColorStop(0, 'rgba(0,0,0,0.32)');
        g.addColorStop(0.06, 'rgba(0,0,0,0)');
        g.addColorStop(0.94, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.32)');
        return g;
      })(x);
  ctx.fillStyle = fade;
  ctx.fillRect(x, y, w, h);

  _drawCrateGrain(ctx, bctx, x, y, w, h, vertical, rand);
  if (rand() > 0.55) {
    _drawCrateKnot(ctx, bctx, x + w * (0.25 + rand() * 0.5), y + h * (0.2 + rand() * 0.6), 5 + rand() * 10, rand);
  }
}

// Procedural mahogany crate panels. `orient`: 'v' = vertical slats (walls), 'h' = floor boards.
function makeCrateWoodTextures(orient) {
  const S = 512;
  const vertical = orient === 'v';
  const cv = document.createElement('canvas');
  const bcv = document.createElement('canvas');
  cv.width = cv.height = bcv.width = bcv.height = S;
  const ctx = cv.getContext('2d');
  const bctx = bcv.getContext('2d');
  const rand = _crateRand(vertical ? 90210 : 42173);

  ctx.fillStyle = '#120604';
  ctx.fillRect(0, 0, S, S);
  bctx.fillStyle = '#2e2e2e';
  bctx.fillRect(0, 0, S, S);

  const gap = 6;
  const frame = Math.round(S * (vertical ? 0.075 : 0.08));

  if (vertical) {
    const frameCol = _crateWoodRGB(rand, -0.18);
    ctx.fillStyle = frameCol;
    ctx.fillRect(0, 0, S, frame);
    ctx.fillRect(0, S - frame, S, frame);
    ctx.fillRect(0, 0, frame, S);
    ctx.fillRect(S - frame, 0, frame, S);
    bctx.fillStyle = '#3a3a3a';
    bctx.fillRect(0, 0, S, frame);
    bctx.fillRect(0, S - frame, S, frame);
    bctx.fillRect(0, 0, frame, S);
    bctx.fillRect(S - frame, 0, frame, S);
    _drawCrateGrain(ctx, bctx, 0, 0, S, frame, false, rand);
    _drawCrateGrain(ctx, bctx, 0, S - frame, S, frame, false, rand);

    const slatN = 6;
    const innerX = frame + 2;
    const innerW = S - frame * 2 - 4;
    const slatW = Math.floor((innerW - gap * (slatN - 1)) / slatN);
    const slatY = frame + 3;
    const slatH = S - frame * 2 - 6;
    for (let i = 0; i < slatN; i++) {
      const sx = innerX + i * (slatW + gap);
      _drawCratePlank(ctx, bctx, sx, slatY, slatW, slatH, true, rand);
      if (i < slatN - 1) _drawCrateGap(ctx, bctx, sx + slatW, slatY - 2, gap, slatH + 4);
      if (i % 2 === 0) _drawCrateNail(ctx, bctx, sx + slatW * 0.5, slatY + 10);
      if (i % 2 === 1) _drawCrateNail(ctx, bctx, sx + slatW * 0.5, slatY + slatH - 10);
    }
    _drawCrateNail(ctx, bctx, frame * 0.5, frame * 0.55);
    _drawCrateNail(ctx, bctx, S - frame * 0.5, frame * 0.55);
    _drawCrateNail(ctx, bctx, frame * 0.5, S - frame * 0.55);
    _drawCrateNail(ctx, bctx, S - frame * 0.5, S - frame * 0.55);
  } else {
    const plankN = 5;
    const plankH = Math.floor((S - gap * (plankN - 1) - 16) / plankN);
    let py = 8;
    for (let i = 0; i < plankN; i++) {
      _drawCratePlank(ctx, bctx, 6, py, S - 12, plankH, false, rand);
      if (i < plankN - 1) _drawCrateGap(ctx, bctx, 4, py + plankH, S - 8, gap);
      if (i % 2 === 0) {
        _drawCrateNail(ctx, bctx, 18, py + plankH * 0.35);
        _drawCrateNail(ctx, bctx, S - 18, py + plankH * 0.35);
      }
      py += plankH + gap;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, S, 10);
    ctx.fillRect(0, S - 10, S, 10);
  }

  // Dark wear marks in the grain.
  for (let s = 0; s < 12; s++) {
    const sx = rand() * S;
    const sy = rand() * S;
    const sw = 24 + rand() * 70;
    ctx.strokeStyle = `rgba(0,0,0,${0.06 + rand() * 0.1})`;
    ctx.lineWidth = 1 + rand() * 1.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + sw * (0.4 + rand()), sy + (rand() - 0.5) * 10);
    ctx.stroke();
  }

  const glaze = ctx.createLinearGradient(0, 0, S, S);
  glaze.addColorStop(0, 'rgba(72,16,8,0.16)');
  glaze.addColorStop(0.45, 'rgba(0,0,0,0)');
  glaze.addColorStop(1, 'rgba(40,8,4,0.22)');
  ctx.fillStyle = glaze;
  ctx.fillRect(0, 0, S, S);

  const vig = ctx.createRadialGradient(S / 2, S / 2, S * 0.12, S / 2, S / 2, S * 0.8);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, S, S);

  const map = new THREE.CanvasTexture(cv);
  const bumpMap = new THREE.CanvasTexture(bcv);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  return { map, bumpMap };
}

// Plain dark sleeve face for blank records.
function makeVinylBlankSleeveTex() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgb(4,2,1)';
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(cv);
}

// Dynamic engraved gold nameplate on the front of the crate. The brushed-brass
// backing is kept deliberately deep/saturated so it never blows to cream under the
// player's light, and every line is engraved (bright chiseled edge + near-black
// face) so the dark lettering stays legible against the glowing metal. Repainted
// per record via _drawGoldLabel — the "NTS SHOWS" brand sits above the title, host,
// date and genres of whatever record is currently raised.
const LABEL_W = 560, LABEL_H = 202;

// Engraved line: a faint bright chisel edge, a thin dark outline for crispness, then
// a near-OPAQUE dark face. The face must stay opaque — a translucent fill lets the
// bright gold show through and the line reads as light embossing, not dark engraving.
function _engLine(ctx, txt, x, y) {
  if (!txt) return;
  ctx.fillStyle = 'rgba(255,240,195,0.28)';
  ctx.fillText(txt, x, y + 1);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(8,4,0,0.85)';
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = 'rgba(10,5,0,0.97)';
  ctx.fillText(txt, x, y);
}

// Heavier engraved line (title) — adds a dark stroke so the strokes stay bold.
function _engHeavy(ctx, txt, x, y) {
  if (!txt) return;
  ctx.fillStyle = 'rgba(255,240,195,0.6)';
  ctx.fillText(txt, x, y + 2);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(8,4,0,0.95)';
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = 'rgba(10,5,0,0.98)';
  ctx.fillText(txt, x, y);
}

// Pick the largest font (up to maxPx) at which `txt` fits within targetW, so short
// strings render big and fill the plate while long ones shrink to stay on one line.
function _fitFont(ctx, txt, prefix, maxPx, targetW, minPx) {
  ctx.font = `${prefix}${maxPx}px Georgia, serif`;
  const w = ctx.measureText(txt).width;
  const px = (w > targetW) ? Math.max(minPx || 10, Math.floor(maxPx * targetW / w)) : maxPx;
  return `${prefix}${px}px Georgia, serif`;
}

function _engDivider(ctx, cx, y, halfW) {
  ctx.strokeStyle = 'rgba(40,24,4,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - halfW, y); ctx.lineTo(cx + halfW, y); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,240,195,0.35)';
  ctx.beginPath(); ctx.moveTo(cx - halfW, y + 1); ctx.lineTo(cx + halfW, y + 1); ctx.stroke();
}

// Repaint the crate's nameplate for `rec`. Cheap + user-triggered (open / browse),
// so we redraw the shared canvas and flag the texture for re-upload.
function _drawGoldLabel(rec) {
  const ctx = VINYL._labelCtx;
  if (!ctx) return;
  const W = LABEL_W, H = LABEL_H, cx = W / 2;
  const d = (rec && rec.disc) || {};

  // Brushed gold base — deep saturated vertical gradient.
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0,    '#b07e2a');
  base.addColorStop(0.45, '#8f6418');
  base.addColorStop(0.6,  '#7d5612');
  base.addColorStop(1,    '#5c3f0c');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // Fine horizontal brushed streaks.
  for (let i = 0; i < 150; i++) {
    const y = Math.floor((i / 150) * H);
    ctx.strokeStyle = (i % 2 === 0) ? 'rgba(255,248,210,0.09)' : 'rgba(90,60,12,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke();
  }

  // Beveled border — dark outer recess, bright inner highlight.
  const inset = 10;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(70,46,8,0.65)';
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,246,205,0.5)';
  ctx.strokeRect(inset + 3, inset + 3, W - inset * 2 - 6, H - inset * 2 - 6);

  // Faint diagonal sheen — drawn BEFORE the text so it can't lift the dark letters.
  const sheen = ctx.createLinearGradient(0, 0, W, H);
  sheen.addColorStop(0,   'rgba(255,235,180,0.09)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(1,   'rgba(255,235,180,0.05)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Brand eyebrow — spaced caps, fit to width.
  ctx.font = _fitFont(ctx, 'N T S   S H O W S', '700 ', 20, W * 0.5, 14);
  _engLine(ctx, 'N T S   S H O W S', cx, 32);
  _engDivider(ctx, cx, 46, 140);

  // Title — auto-fit to fill the plate width; the focal line, big as it fits.
  const title = d.title || '';
  ctx.font = _fitFont(ctx, title, 'italic 700 ', 58, W * 0.84, 30);
  _engHeavy(ctx, title, cx, 100);

  // Host subtitle, fit to width.
  const host = [d.host1, d.host2].filter(Boolean).join(' ');
  if (host) {
    ctx.font = _fitFont(ctx, host, '400 ', 30, W * 0.82, 15);
    _engLine(ctx, host, cx, 136);
  }

  _engDivider(ctx, cx, host ? 156 : 142, 150);

  // Date · genres combined on one line, fit to width.
  const meta = [d.date, d.genres].filter(Boolean).join('   ·   ');
  ctx.font = _fitFont(ctx, meta, '400 ', 21, W * 0.92, 12);
  _engLine(ctx, meta, cx, host ? 178 : 166);

  if (VINYL._labelTex) VINYL._labelTex.needsUpdate = true;
}

// Black vinyl disc — concentric grooves + centre label.
function makeVinylDiscTex(info) {
  const title   = info.title   || 'In Faith';
  const host1   = info.host1   || 'w/ Provhat';
  const host2   = info.host2   ?? '& GoldTooth';
  const date    = info.date    || '15 Aug 2023';
  const genres  = info.genres  || 'Nasheed  \u00B7  Qawwali  \u00B7  Bhajan';
  // S is the logical layout size — every coordinate below stays in this space.
  // The canvas is supersampled (SS) so the label text stays crisp when the disc
  // is brought forward to fill the viewport in focus mode. SS 3 (was 4) on desktop drops each
  // disc from a 2048² ~16MB upload to 1536² ~9MB — a lighter idle-prewarm slice on approach,
  // still crisp full-screen — while the four discs build one-per-idle-slice in _vinylSteps.
  const S = 512;
  const SS = isMobile ? 2 : 3;   // 1024 / 1536 px backing texture
  const cv = document.createElement('canvas');
  cv.width = cv.height = S * SS;
  const ctx = cv.getContext('2d');
  ctx.scale(SS, SS);
  const cx = S / 2, cy = S / 2, R = S / 2 - 2;

  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#0b0b0d';
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = 'rgba(120,120,130,0.22)';
  ctx.lineWidth = 1;
  for (let r = R * 0.36; r < R - 4; r += 4) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }

  const sheen = ctx.createLinearGradient(0, 0, S, S);
  sheen.addColorStop(0, 'rgba(255,255,255,0.05)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(255,255,255,0.06)');
  ctx.fillStyle = sheen;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

  // Centre label — warm amber gradient, classic NTS style.
  const LR = R * 0.34;
  const lg = ctx.createRadialGradient(cx, cy - LR * 0.25, 4, cx, cy, LR);
  lg.addColorStop(0,   '#edb545');
  lg.addColorStop(0.5, '#d8902a');
  lg.addColorStop(1,   '#b8720a');
  ctx.fillStyle = lg;
  ctx.beginPath(); ctx.arc(cx, cy, LR, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, LR, 0, Math.PI * 2); ctx.stroke();

  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, LR - 5, 0, Math.PI * 2); ctx.stroke();

  // Clip all label text to within the label circle.
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, LR - 2, 0, Math.PI * 2); ctx.clip();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const dw = LR * 0.52;

  // "N T S" — record label name, spaced caps (matches app-wide uppercase style).
  ctx.fillStyle = 'rgba(25,8,0,0.52)';
  ctx.font = '400 8.5px Georgia, serif';
  ctx.fillText('N T S', cx, cy - 64);

  // Divider below label name.
  ctx.strokeStyle = 'rgba(25,8,0,0.2)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - dw, cy - 53); ctx.lineTo(cx + dw, cy - 53);
  ctx.stroke();

  // Show title — italic, prominent.
  ctx.fillStyle = 'rgba(18,5,0,0.88)';
  ctx.font = title.length > 12 ? 'italic 400 12px Georgia, serif' : 'italic 400 15px Georgia, serif';
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 2;
  ctx.fillText(title, cx, cy - 30);
  ctx.shadowBlur = 0;

  // Host line, split across spindle hole — upper half above, lower half below.
  ctx.fillStyle = 'rgba(18,5,0,0.62)';
  ctx.font = '400 8px Georgia, serif';
  ctx.fillText(host1, cx, cy - 13);

  // [spindle hole sits at cy ± 8px — text resumes below it]

  if (host2) ctx.fillText(host2, cx, cy + 22);

  // Divider above date.
  ctx.strokeStyle = 'rgba(25,8,0,0.18)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - dw * 0.7, cy + 35); ctx.lineTo(cx + dw * 0.7, cy + 35);
  ctx.stroke();

  // Date.
  ctx.fillStyle = 'rgba(18,5,0,0.46)';
  ctx.font = '400 7.5px Georgia, serif';
  ctx.fillText(date, cx, cy + 50);

  // Genres — spaced dots like the rest of the app.
  ctx.fillStyle = 'rgba(18,5,0,0.32)';
  ctx.font = '400 6.5px Georgia, serif';
  ctx.fillText(genres, cx, cy + 64);

  ctx.restore();

  // Spindle hole — drawn on top so it punches cleanly through the label.
  ctx.fillStyle = '#0b0b0d';
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.03, 0, Math.PI * 2); ctx.fill();

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = MAX_ANISO;
  return tex;
}

function _loadRecordTex(path) {
  const tex = _texLoader.load(path, function(t) {
    const aspect = t.image.width / t.image.height;
    if (aspect > 1) {
      tex.repeat.set(1 / aspect, 1);
      tex.offset.set(0.5 * (1 - 1 / aspect), 0);
    } else {
      tex.repeat.set(1, aspect);
      tex.offset.set(0, 0.5 * (1 - aspect));
    }
    tex.needsUpdate = true;
  });
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function _ensureVinylSteps() {
  if (_vinylSteps) return _vinylSteps;
  const recSteps = VINYL.records.map(r => () => {
    r.coverTex = r.imagePath ? _loadRecordTex(r.imagePath) : VINYL.blankTex;
    r.backTex  = VINYL.blankTex;
    r.discTex  = makeVinylDiscTex(r.disc);
    _initTex(r.discTex);
  });
  _vinylSteps = [
    () => { VINYL.blankTex = makeVinylBlankSleeveTex(); _initTex(VINYL.blankTex); },
    () => { VINYL.crateWoodV = makeCrateWoodTextures('v'); _initTex(VINYL.crateWoodV.map); _initTex(VINYL.crateWoodV.bumpMap); },
    () => { VINYL.crateWoodH = makeCrateWoodTextures('h'); _initTex(VINYL.crateWoodH.map); _initTex(VINYL.crateWoodH.bumpMap); },
    ...recSteps,
    () => {
      VINYL._box = _buildCrateBox();
      VINYL._box.userData.boxMats.forEach(m => { _initTex(m.map); _initTex(m.bumpMap); });
    },
  ];
  return _vinylSteps;
}

function _buildVinylAssets() {
  if (VINYL._built) return;
  const steps = _ensureVinylSteps();
  while (_vinylStepIdx < steps.length) steps[_vinylStepIdx++]();
  VINYL._built = true;
}

function _preloadVinylAssets() {
  if (VINYL._built) return;
  const steps = _ensureVinylSteps();
  if (_vinylStepIdx < steps.length) steps[_vinylStepIdx++]();
  if (_vinylStepIdx >= steps.length) { VINYL._built = true; return; }
  _scheduleIdle(_preloadVinylAssets);
}

function _dismissCrate() {
  if (!cratePhase || cratePhase === 'closing') return;
  _hideFocusEscapeHint();
  _hideCrateNav();
  _hideCrateBrowseHint();
  cratePhase = 'closing';
  crateSwapPhase = null;
  crateT = 1;
  _restoreExhibitFloater();
}

function _crateFaceMat(faceW, faceH, horizontal) {
  const src = horizontal ? VINYL.crateWoodH : VINYL.crateWoodV;
  const map = src.map.clone();
  const bumpMap = src.bumpMap.clone();
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  map.repeat.set(Math.max(1, faceW / CRATE_WOOD_TILE), Math.max(1, faceH / CRATE_WOOD_TILE));
  bumpMap.repeat.copy(map.repeat);
  return new THREE.MeshStandardMaterial({
    map, bumpMap, bumpScale: 0.052,
    roughness: 0.83, metalness: 0.015,
    color: 0x6e3020,
    side: THREE.DoubleSide,
  });
}

function _buildCrateBox() {
  const g = new THREE.Group();
  const innerW = RECORD_SIZE + 0.57;
  const depth  = RECORD_SIZE * 0.714;
  const tall   = RECORD_SIZE * 0.72;   // back/side wall height
  const front  = RECORD_SIZE * 0.4;    // shorter front wall so records stay visible
  const T  = CRATE_WALL_THICK;
  const BT = CRATE_BOTTOM_THICK;
  const outerW = innerW + T * 2;
  const outerD = depth + T * 2;
  const floorY = -tall / 2;
  const corner = T * 1.15;

  const bottomMat = _crateFaceMat(outerW, outerD, true);
  const backMat   = _crateFaceMat(outerW, tall, false);
  const frontMat  = _crateFaceMat(outerW, front, false);
  const sideMat   = _crateFaceMat(depth, tall, false);
  const railMat   = _crateFaceMat(outerW, T, false);
  const cornerMat = _crateFaceMat(corner, tall, false);

  const bottom = new THREE.Mesh(new THREE.BoxGeometry(outerW, BT, outerD), bottomMat);
  bottom.position.y = floorY - BT / 2;
  g.add(bottom);

  const back = new THREE.Mesh(new THREE.BoxGeometry(outerW, tall, T), backMat);
  back.position.set(0, 0, -depth / 2 - T / 2);
  g.add(back);

  const frontW = new THREE.Mesh(new THREE.BoxGeometry(outerW, front, T), frontMat);
  frontW.position.set(0, floorY + front / 2, depth / 2 + T / 2);
  g.add(frontW);

  const left = new THREE.Mesh(new THREE.BoxGeometry(T, tall, depth), sideMat);
  left.position.set(-innerW / 2 - T / 2, 0, 0);
  g.add(left);
  const right = new THREE.Mesh(new THREE.BoxGeometry(T, tall, depth), sideMat);
  right.position.set(innerW / 2 + T / 2, 0, 0);
  g.add(right);

  // Top rails — thicker lip along the upper edge of each wall panel.
  const backRail = new THREE.Mesh(new THREE.BoxGeometry(outerW, T, T), railMat);
  backRail.position.set(0, tall / 2 + T / 2, -depth / 2 - T / 2);
  g.add(backRail);

  const sideRailGeo = new THREE.BoxGeometry(T, T, depth + T * 2);
  const leftRail = new THREE.Mesh(sideRailGeo, railMat);
  leftRail.position.set(-innerW / 2 - T / 2, tall / 2 + T / 2, 0);
  g.add(leftRail);
  const rightRail = new THREE.Mesh(sideRailGeo, railMat);
  rightRail.position.set(innerW / 2 + T / 2, tall / 2 + T / 2, 0);
  g.add(rightRail);

  const frontRail = new THREE.Mesh(new THREE.BoxGeometry(outerW, T, T), railMat);
  frontRail.position.set(0, floorY + front + T / 2, depth / 2 + T / 2);
  g.add(frontRail);

  // Corner posts tie the frame together and sell the plank depth at every edge.
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(corner, tall, corner), cornerMat);
    post.position.set(sx * (innerW / 2 + T / 2), 0, sz * (depth / 2 + T / 2));
    g.add(post);
  });

  // Dynamic gold nameplate on the front wall — repainted per record by _drawGoldLabel.
  const labelCv = document.createElement('canvas');
  labelCv.width = LABEL_W; labelCv.height = LABEL_H;
  VINYL._labelCanvas = labelCv;
  VINYL._labelCtx = labelCv.getContext('2d');
  const goldTex = new THREE.CanvasTexture(labelCv);
  goldTex.anisotropy = MAX_ANISO;
  VINYL._labelTex = goldTex;
  _drawGoldLabel(VINYL.records[0]);   // initial paint (first record)
  // Plate sized to nearly fill the front wall; aspect matches the LABEL_W×LABEL_H canvas.
  const plateH = front * 0.95;
  const plateW = plateH * (LABEL_W / LABEL_H);
  const plateThick = 0.03;
  // The plaque is EMISSIVE-DOMINANT so it reads the same no matter how close the
  // player's orb lights get: the gold canvas is shown via the emissive map (self-lit),
  // while the lit diffuse is multiplied near-black (color 0x140d04) and the surface is
  // non-metallic + rough so the orb's point lights can't blow it out to cream. The
  // near-black engraved letters emit almost nothing, so they stay dark on glowing gold.
  const goldMat = new THREE.MeshStandardMaterial({
    map: goldTex, color: 0x140d04,
    emissive: 0xffffff, emissiveMap: goldTex, emissiveIntensity: 0.85,
    metalness: 0.0, roughness: 0.65,
  });
  const edgeGoldMat = new THREE.MeshStandardMaterial({
    color: 0x2a1d08, emissive: 0x6e5212, emissiveIntensity: 0.35,
    metalness: 0.0, roughness: 0.6,
  });
  const plateGeo = new THREE.BoxGeometry(plateW, plateH, plateThick);
  // BoxGeometry face order: +x,-x,+y,-y,+z,-z — gold face is +z (toward viewer).
  const plate = new THREE.Mesh(plateGeo, [
    edgeGoldMat, edgeGoldMat, edgeGoldMat, edgeGoldMat, goldMat, edgeGoldMat,
  ]);
  plate.position.set(0, floorY + front / 2, depth / 2 + T + plateThick / 2);
  g.add(plate);

  g.userData.parts = [bottom, back, frontW, left, right, backRail, leftRail, rightRail, frontRail];
  g.userData.boxMats = [bottomMat, backMat, frontMat, sideMat, railMat, cornerMat, goldMat, edgeGoldMat];
  g.userData.plateGeo = plateGeo;
  return g;
}

function _buildCrateRecord(rec) {
  const grp = new THREE.Group();

  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.8, metalness: 0.0 });
  const coverMat = new THREE.MeshBasicMaterial({ map: rec.coverTex });
  const backMat  = new THREE.MeshBasicMaterial({ map: rec.backTex });
  const sleeveGeo = new THREE.BoxGeometry(RECORD_SIZE, RECORD_SIZE, RECORD_THICK);
  const sleeve = new THREE.Mesh(sleeveGeo, [edgeMat, edgeMat, edgeMat, edgeMat, coverMat, backMat]);
  grp.add(sleeve);

  const discGeo = new THREE.CircleGeometry(RECORD_SIZE * 0.46, 48);
  const discMat = new THREE.MeshBasicMaterial({ map: rec.discTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.position.set(0, DISC_PEEK, -RECORD_THICK * 0.5 - 0.002);
  grp.add(disc);

  grp.userData = { sleeve, disc, sleeveGeo, discGeo, mats: [edgeMat, coverMat, backMat, discMat], rec };
  return grp;
}

// Next record in the crate — disc starts inside (y=0, hidden), ready to animate up.
function _buildCrateSeatedRecord(rec) {
  const grp = new THREE.Group();
  const edgeMat  = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.8, metalness: 0.0 });
  const coverTex = rec ? rec.coverTex : VINYL.blankTex;
  const backTex  = rec ? rec.backTex  : VINYL.blankTex;
  const coverMat = new THREE.MeshBasicMaterial({ map: coverTex });
  const backMat  = new THREE.MeshBasicMaterial({ map: backTex });
  const sleeveGeo = new THREE.BoxGeometry(RECORD_SIZE, RECORD_SIZE, RECORD_THICK);
  const sleeve = new THREE.Mesh(sleeveGeo, [edgeMat, edgeMat, edgeMat, edgeMat, coverMat, backMat]);
  grp.add(sleeve);
  const discGeo = new THREE.CircleGeometry(RECORD_SIZE * 0.46, 48);
  const discTex = (rec && rec.discTex) ? rec.discTex : VINYL.records[0].discTex;
  const discMat = new THREE.MeshBasicMaterial({ map: discTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.position.set(0, 0, -RECORD_THICK * 0.5 - 0.002);
  grp.add(disc);
  grp.userData = { sleeve, disc, sleeveGeo, discGeo, mats: [edgeMat, coverMat, backMat, discMat], rec: rec || null };
  return grp;
}

// Re-point an existing record group's sleeve/disc materials at another record's
// shared textures. Used to cycle the seated (hidden) record through the crate so
// any number of records can flow past with the same two-mesh swap animation.
function _retextureCrateRecord(grp, rec) {
  if (!grp || !rec) return;
  const ud = grp.userData;
  if (!ud || !ud.mats) return;
  // mats = [edgeMat, coverMat, backMat, discMat]
  ud.mats[1].map = rec.coverTex || VINYL.blankTex; ud.mats[1].needsUpdate = true;
  ud.mats[2].map = rec.backTex  || VINYL.blankTex; ud.mats[2].needsUpdate = true;
  ud.mats[3].map = rec.discTex  || VINYL.records[0].discTex; ud.mats[3].needsUpdate = true;
  ud.rec = rec;
}

function _startCrateSwap(dir) {
  if (!crateGroup || crateSwapPhase || cratePhase !== 'browsing') return;
  if (!_crateSelGrp || !_crateSeatedGrp) return;
  const N = VINYL.records.length;
  _crateSwapDir = dir < 0 ? -1 : 1;
  // The seated record (fully hidden behind the raised one) always rises to the
  // front next, so re-point it at the record we're stepping toward — forward or
  // back — before the swap animation lifts it into view.
  if (N > 1) {
    const target = (_crateIdx + _crateSwapDir + N) % N;
    _retextureCrateRecord(_crateSeatedGrp, VINYL.records[target]);
    // Repaint the front nameplate to the record rising into view.
    _drawGoldLabel(VINYL.records[target]);
  }
  crateSwapPhase = 'swapping';
  crateSwapT = 0;
  _hideCrateNav();
}

function _tickCrateSwap(dt) {
  if (!crateSwapPhase || !crateGroup) return;
  crateSwapT += dt / CRATE_SWAP_DUR;
  const t = Math.min(1, crateSwapT);

  const sel = _crateSelGrp;
  const sat = _crateSeatedGrp;

  // Records trade height and depth — the incoming record slides to the front so its
  // sleeve artwork is fully visible, while the outgoing record sinks and moves back.
  const LOW_Y = RECORD_SIZE * 0.14;

  function eio(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
  function seg(v, s, e) { return eio(Math.max(0, Math.min(1, (v - s) / (e - s)))); }

  const ezDisc = seg(t, 0,    0.25);  // selected disc slides into its sleeve
  const ezDrop = seg(t, 0.10, 0.65);  // selected record sinks and slides back
  const ezRise = seg(t, 0.30, 0.85);  // seated record lifts and slides forward
  const ezLift = seg(t, 0.55, 1.0);   // seated disc lifts above sleeve

  // Selected disc closes.
  if (sel && sel.userData.disc) sel.userData.disc.position.y = DISC_PEEK * (1 - ezDisc);

  // Selected record sinks and moves to the back of the stack.
  if (sel) {
    sel.position.y = RECORD_BASE_Y + (LOW_Y - RECORD_BASE_Y) * ezDrop;
    sel.position.z = RECORD_FRONT_Z + (RECORD_BACK_Z - RECORD_FRONT_Z) * ezDrop;
  }

  // Seated record lifts and moves to the front.
  if (sat) {
    sat.position.y = LOW_Y + (RECORD_BASE_Y - LOW_Y) * ezRise;
    sat.position.z = RECORD_BACK_Z + (RECORD_FRONT_Z - RECORD_BACK_Z) * ezRise;
  }

  // Seated disc lifts.
  if (sat && sat.userData.disc) sat.userData.disc.position.y = DISC_PEEK * ezLift;

  if (crateSwapT >= 1) {
    crateSwapPhase = null;
    crateSwapT = 0;
    if (sel) {
      sel.position.y = RECORD_SIZE * 0.14;
      sel.position.z = RECORD_BACK_Z;
    }
    if (sat) {
      sat.position.y = RECORD_BASE_Y;
      sat.position.z = RECORD_FRONT_Z;
    }
    if (sel && sel.userData.disc) sel.userData.disc.position.y = 0;
    if (sat && sat.userData.disc) sat.userData.disc.position.y = DISC_PEEK;
    _crateSelGrp    = sat;
    _crateSeatedGrp = sel;
    // Advance the index in the direction we stepped. The record that just sank
    // to the back stays hidden until the next button press re-textures it for
    // whichever direction is chosen then.
    const N = VINYL.records.length;
    _crateIdx = (_crateIdx + _crateSwapDir + N) % N;
    _showCrateNav(false);
  }
}

function _openCrate(px, pz, openYaw) {
  if (cratePhase) return;
  _buildVinylAssets();
  beginExhibitDPR();

  crateOpen  = true;
  cratePhase = 'opening';
  crateT     = 0;
  const fl = floaters[VINYL.floaterIdx];
  setTriggerFloater(fl);
  _setFloaterVisible(fl, false);

  crateGroup = new THREE.Group();
  _crateFwd.set(Math.sin(openYaw), 0, Math.cos(openYaw));
  crateGroup.position.set(px + _crateFwd.x * CRATE_DIST, CRATE_Y, pz + _crateFwd.z * CRATE_DIST);
  crateGroup.rotation.y = openYaw + Math.PI;
  scene.add(crateGroup);

  // The crate box never changes, so build it once and reuse it across opens —
  // this avoids re-cloning 12 wood textures and rebuilding ~17 geometries every
  // launch. _closeCrate() detaches it before disposal so it survives.
  if (!VINYL._box) VINYL._box = _buildCrateBox();
  const box = VINYL._box;
  crateGroup.add(box);
  crateGroup.userData.box = box;
  // Reset the nameplate to the first record (the box is cached across opens).
  _drawGoldLabel(VINYL.records[0]);

  _crateSelGrp    = null;
  _crateSeatedGrp = null;
  _crateIdx       = 0;
  const recs = VINYL.records;
  if (recs.length >= 2) {
    const seated = _buildCrateSeatedRecord(recs[1]);
    seated.position.set(0, RECORD_SIZE * 0.14, RECORD_BACK_Z);
    crateGroup.add(seated);
    _crateSeatedGrp = seated;

    const grp = _buildCrateRecord(recs[0]);
    grp.position.set(0, RECORD_BASE_Y, RECORD_FRONT_Z);
    crateGroup.add(grp);
    _crateSelGrp = grp;
  } else if (recs.length === 1) {
    const seated = _buildCrateSeatedRecord();
    seated.position.set(0, RECORD_SIZE * 0.14, RECORD_BACK_Z);
    crateGroup.add(seated);
    _crateSeatedGrp = seated;

    const grp = _buildCrateRecord(recs[0]);
    grp.position.set(0, RECORD_BASE_Y, RECORD_FRONT_Z);
    crateGroup.add(grp);
    _crateSelGrp = grp;
  }

  crateGroup.scale.setScalar(0.04);
}

// ── CRATE DISC FOCUS — brings the selected record's disc forward to fill the
//    viewport, reusing the exhibit carousel's focus maths and escape hint. ──
function _discWorldTransform(disc) {
  disc.updateWorldMatrix(true, false);
  disc.matrixWorld.decompose(_crateDiscPos, _crateDiscQuat, _crateDiscScale);
}

function _getAimedCrateDisc() {
  if (!_crateSelGrp || cratePhase !== 'browsing' || crateSwapPhase || crateFocusPhase) return null;
  const disc = _crateSelGrp.userData.disc;
  if (!disc || !disc.visible) return null;
  // Direct hit if the reticle is right on the disc.
  _raycaster.setFromCamera(_ndcCenter, camera);
  if (_raycaster.intersectObject(disc, false).length) return disc;
  // Otherwise lock on whenever the disc is on screen in front of the player —
  // the fixed camera pitch keeps it high in the frame, so a centred raycast
  // alone would rarely connect (mirrors the carousel's nearest-to-centre aim).
  disc.getWorldPosition(_panelWp);
  _panelWp.project(camera);
  if (_panelWp.z > 1) return null;
  return (Math.abs(_panelWp.x) < 0.6 && _panelWp.y > -0.9 && _panelWp.y < 0.97) ? disc : null;
}

function _refreshCrateFocusTarget() {
  const D = CRATE_DISC_R * 2;
  _focusToScale = _computeExhibitFocusTarget(_focusToPos, _focusToQuat, D, D);
}

function _startCrateFocus(disc) {
  if (!disc || crateFocusPhase || cratePhase !== 'browsing' || crateSwapPhase) return;
  _syncCamera();
  _discWorldTransform(disc);

  const focusRec = (_crateSelGrp && _crateSelGrp.userData) ? _crateSelGrp.userData.rec || null : null;
  const geo = new THREE.CircleGeometry(CRATE_DISC_R, 64);
  const mat = new THREE.MeshBasicMaterial({ map: focusRec.discTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  crateFocusMesh = new THREE.Mesh(geo, mat);
  crateFocusMesh.renderOrder = 250;
  crateFocusMesh.position.copy(_crateDiscPos);
  crateFocusMesh.quaternion.copy(_crateDiscQuat);
  crateFocusMesh.scale.setScalar(_crateDiscScale.x);
  scene.add(crateFocusMesh);

  crateFocusDiscRef = disc;
  crateFocusRec = (_crateSelGrp && _crateSelGrp.userData) ? _crateSelGrp.userData.rec || null : null;
  disc.visible = false;

  _focusFromPos.copy(_crateDiscPos);
  _focusFromQuat.copy(_crateDiscQuat);
  _focusFromScale = _crateDiscScale.x;
  _refreshCrateFocusTarget();

  crateFocusPhase = 'focusing';
  crateFocusT = 0;
  _hideFocusEscapeHint();
  _hideCrateNav();
  _hideCrateBrowseHint();
}

function _startCrateUnfocus() {
  if (crateFocusPhase !== 'focused' || !crateFocusMesh) return;
  _hideFocusEscapeHint();
  _hideCrateScEmbed();
  _focusFromPos.copy(crateFocusMesh.position);
  _focusFromQuat.copy(crateFocusMesh.quaternion);
  _focusFromScale = crateFocusMesh.scale.x;
  crateFocusPhase = 'unfocusing';
  crateFocusT = 0;
}

function _disposeCrateFocusMesh() {
  if (crateFocusDiscRef) crateFocusDiscRef.visible = true;
  if (crateFocusMesh) {
    scene.remove(crateFocusMesh);
    crateFocusMesh.geometry.dispose();
    crateFocusMesh.material.dispose();
    crateFocusMesh = null;
  }
  crateFocusDiscRef = null;
}

function _finishCrateUnfocus() {
  _disposeCrateFocusMesh();
  crateFocusRec = null;
  crateFocusPhase = null;
  crateFocusT = 0;
  if (cratePhase === 'browsing' && !crateSwapPhase) {
    _showCrateNav(false);
    _showCrateBrowseHint();
  }
  setCD(0.3);
}

function _resetCrateFocus() {
  _disposeCrateFocusMesh();
  _hideCrateScEmbed();
  crateFocusRec = null;
  crateFocusPhase = null;
  crateFocusT = 0;
}

function _tickCrateFocus(dt) {
  if (!crateFocusPhase || !crateFocusMesh) return;
  if (crateFocusPhase === 'focusing') {
    _refreshCrateFocusTarget();
    crateFocusT = Math.min(1, crateFocusT + dt / CRATE_FOCUS_DUR);
    const s = crateFocusT * crateFocusT * (3 - 2 * crateFocusT);
    crateFocusMesh.position.lerpVectors(_focusFromPos, _focusToPos, s);
    _focusLerpQuat.slerpQuaternions(_focusFromQuat, _focusToQuat, s);
    crateFocusMesh.quaternion.copy(_focusLerpQuat);
    crateFocusMesh.scale.setScalar(_focusFromScale + (_focusToScale - _focusFromScale) * s);
    if (crateFocusT >= 1) { crateFocusPhase = 'focused'; _showFocusEscapeHint(); _showCrateScEmbed(crateFocusRec); }
  } else if (crateFocusPhase === 'focused') {
    _refreshCrateFocusTarget();
    crateFocusMesh.position.copy(_focusToPos);
    crateFocusMesh.quaternion.copy(_focusToQuat);
    crateFocusMesh.scale.setScalar(_focusToScale);
  } else if (crateFocusPhase === 'unfocusing') {
    crateFocusT = Math.min(1, crateFocusT + dt / CRATE_FOCUS_DUR);
    const s = crateFocusT * crateFocusT * (3 - 2 * crateFocusT);
    if (crateFocusDiscRef) _discWorldTransform(crateFocusDiscRef);
    crateFocusMesh.position.lerpVectors(_focusFromPos, _crateDiscPos, s);
    _focusLerpQuat.slerpQuaternions(_focusFromQuat, _crateDiscQuat, s);
    crateFocusMesh.quaternion.copy(_focusLerpQuat);
    crateFocusMesh.scale.setScalar(_focusFromScale + (_crateDiscScale.x - _focusFromScale) * s);
    if (crateFocusT >= 1) _finishCrateUnfocus();
  }
}

function _closeCrate() {
  _resetCrateFocus();
  if (crateGroup) {
    // Detach the cached, reusable box so it isn't disposed with the records.
    if (crateGroup.userData.box) crateGroup.remove(crateGroup.userData.box);
    _disposeCrateObject(crateGroup);
    scene.remove(crateGroup);
    crateGroup = null;
  }
  crateOpen       = false;
  cratePhase      = null;
  crateT          = 0;
  crateSwapPhase  = null;
  crateSwapT      = 0;
  _crateSelGrp    = null;
  _crateSeatedGrp = null;
  _crateIdx       = 0;
  _hideFocusEscapeHint();
  _hideCrateNav();
  _hideCrateBrowseHint();
  _elMmWrap.classList.remove('focus-hidden');
  _elUi?.classList.remove('focus-hidden');
  _jZone.classList.remove('focus-hidden');
  endExhibitDPR();
  _restoreExhibitFloater();
  setCD(0.6);
}

function _hideCrateNav() {
  if (_elCratePrev) _elCratePrev.classList.remove('visible', 'hint-pulse');
  if (_elCrateNext) _elCrateNext.classList.remove('visible', 'hint-pulse');
  clearTimeout(_crateNavPulseTimer);
}

function _showCrateNav(pulse) {
  if (VINYL.records.length < 2) return;
  if (_elCratePrev) _elCratePrev.classList.add('visible');
  if (_elCrateNext) _elCrateNext.classList.add('visible');
  if (pulse && isMobile) {
    _elCratePrev?.classList.add('hint-pulse');
    _elCrateNext?.classList.add('hint-pulse');
    clearTimeout(_crateNavPulseTimer);
    _crateNavPulseTimer = setTimeout(() => {
      _elCratePrev?.classList.remove('hint-pulse');
      _elCrateNext?.classList.remove('hint-pulse');
    }, 4200);
  }
}

function _hideCrateBrowseHint() {
  clearTimeout(_crateBrowseHintTimer);
  _elCrateBrowseHint?.classList.remove('visible', 'dim');
  _hideCrateGuide();   // the guide card is part of the same guidance — tear it down together
}

// Dismissable guidance card explaining the crate: flip through the records, then play one.
function _showCrateGuide() {
  if (!_elCrateGuide || _crateGuideDismissed) return;
  const multi = VINYL.records.length > 1;
  if (_elCrateGuideBody) {
    if (isMobile) {
      _elCrateGuideBody.innerHTML = multi
        ? `A crate of records. <b>Tap the arrows</b> to flip through it, then <b>tap a record</b> to hear it. Tap away to close.`
        : `A crate of records. <b>Tap the record</b> to hear it, or tap away to close.`;
    } else {
      _elCrateGuideBody.innerHTML = (multi
        ? `A crate of records. Use the <span class="feh-key">&uarr;</span><span class="feh-key">&darr;</span> arrow keys to flip through it, then `
        : `A crate of records. `) +
        `<b>click a record</b> (or press <span class="feh-key">spc</span>) to hear it, and <span class="feh-key">esc</span> to close.`;
    }
  }
  _elCrateGuide.classList.add('visible');
}

function _hideCrateGuide() {
  if (_elCrateGuide) _elCrateGuide.classList.remove('visible');
}

// Closing the card dismisses it for the session; the button pill stays put.
if (_elCrateGuideClose) _elCrateGuideClose.addEventListener('click', () => {
  _crateGuideDismissed = true;
  _hideCrateGuide();
});

function _showCrateBrowseHint() {
  if (!_elCrateBrowseHint || cratePhase !== 'browsing' || crateFocusPhase) return;
  _showCrateGuide();   // fuller dismissable guidance alongside the button pill
  const multi = VINYL.records.length > 1;
  if (isMobile) {
    // Single record — nothing to browse, so drop the pill but keep the guide (tap-to-play still applies).
    if (!multi) { clearTimeout(_crateBrowseHintTimer); _elCrateBrowseHint.classList.remove('visible', 'dim'); return; }
    _elCrateBrowseHint.innerHTML =
      `<span class="cbh-keys"><span class="feh-key">&lsaquo;</span><span class="feh-key">&rsaquo;</span></span>` +
      `<span class="feh-label">tap arrows to browse records</span>`;
  } else {
    const browseKeys = multi
      ? `<span class="cbh-keys"><span class="feh-key">&uarr;</span><span class="feh-key">&darr;</span></span><span class="feh-label">browse records</span><span class="feh-label feh-sep">&middot;</span>`
      : '';
    _elCrateBrowseHint.innerHTML = browseKeys + `<span class="feh-key">esc</span><span class="feh-label">close</span>`;
  }
  _elCrateBrowseHint.classList.remove('dim');
  _elCrateBrowseHint.classList.add('visible');
  clearTimeout(_crateBrowseHintTimer);
  if (isMobile && multi) {
    _crateBrowseHintTimer = setTimeout(() => _elCrateBrowseHint.classList.add('dim'), 8000);
  }
}

function _showCrateScEmbed(rec) {
  if (!_elCrateSc || !rec || !rec.soundcloud) return;
  if (_elCrateScIframe && _elCrateScIframe.src !== rec.soundcloud) _elCrateScIframe.src = rec.soundcloud;
  if (_elCrateScCredit && rec.creditUser && rec.creditTrack) {
    _elCrateScCredit.innerHTML =
      `<a href="${rec.creditUser}" title="${rec.creditUserLabel}" target="_blank">${rec.creditUserLabel}</a>` +
      ` &middot; <a href="${rec.creditTrack}" title="${rec.creditTrackLabel}" target="_blank">${rec.creditTrackLabel}</a>`;
  }
  _elCrateSc.classList.add('visible');
}

function _hideCrateScEmbed() {
  if (!_elCrateSc) return;
  _elCrateSc.classList.remove('visible');
  // Clearing the src stops any playing audio when leaving the focused record.
  if (_elCrateScIframe) _elCrateScIframe.src = '';
}

if (_elCratePrev) {
  const _cratePrevFire = e => {
    e.preventDefault(); e.stopPropagation();
    _elCratePrev.classList.remove('hint-pulse');
    _elCrateNext?.classList.remove('hint-pulse');
    clearTimeout(_crateNavPulseTimer);
    _startCrateSwap(-1);
  };
  _elCratePrev.addEventListener('click', _cratePrevFire);
  _elCratePrev.addEventListener('touchstart', _cratePrevFire, { passive: false });
}
if (_elCrateNext) {
  const _crateNextFire = e => {
    e.preventDefault(); e.stopPropagation();
    _elCrateNext.classList.remove('hint-pulse');
    _elCratePrev?.classList.remove('hint-pulse');
    clearTimeout(_crateNavPulseTimer);
    _startCrateSwap(1);
  };
  _elCrateNext.addEventListener('click', _crateNextFire);
  _elCrateNext.addEventListener('touchstart', _crateNextFire, { passive: false });
}

registerExhibit({
  id: 'vinyl-crate',
  floater: VINYL.floaterIdx,
  open: (px, pz, yaw) => _openCrate(px, pz, yaw),
  isActive: () => !!cratePhase,
  dismiss: () => _dismissCrate(),
  locksMovement: () => crateFocusPhase === 'focusing' || crateFocusPhase === 'focused',
  dimsRoom:      () => crateFocusPhase === 'focusing' || crateFocusPhase === 'focused',
  wantsHint:     () => !!_getAimedCrateDisc(),
  update(ctx) {
    const crateAimedDisc = _getAimedCrateDisc();
    const crateCanFocus = !!crateAimedDisc;

    // Focus prompt — follows the raised record's disc while browsing (no aim reticle)
    if (cratePhase === 'browsing' && !crateFocusPhase) {
      if (crateCanFocus) {
        crateAimedDisc.getWorldPosition(_panelWp);
        _panelWp.project(camera);
        const rx = (_panelWp.x * 0.5 + 0.5) * window.innerWidth;
        const ry = (-_panelWp.y * 0.5 + 0.5) * window.innerHeight;
        _elPrompt.style.left = rx + 'px';
        _elPrompt.style.top  = (ry - 36) + 'px';
        // Shared focus prompt (matches the photo carousel): desktop "click to focus / or press
        // space" + click glyph, mobile tap circle. Set once on the show transition; clicking the
        // aimed disc focuses it just like Space (core's click handler fires KeyE while it's up).
        if (!_elPrompt.classList.contains('visible')) {
          renderFocusPrompt();
          _elPrompt.classList.add('visible');
        }
      } else {
        _elPrompt.classList.remove('visible');
      }
    }

    // Record cycling — desktop up/down arrows while browsing
    const _crateBrowsable = cratePhase === 'browsing' && !crateFocusPhase && VINYL.records.length > 1;
    if (_crateBrowsable && !crateSwapPhase && !isMobile && ctx.iCD <= 0) {
      const navUp = keys['ArrowUp'];
      const navDn = keys['ArrowDown'];
      if (navUp && !_crateNavUpWas) { _startCrateSwap(-1); ctx.setCD(0.28); }  // up = previous
      if (navDn && !_crateNavDnWas) { _startCrateSwap(1);  ctx.setCD(0.28); }  // down = next
      _crateNavUpWas = navUp; _crateNavDnWas = navDn;
    } else {
      _crateNavUpWas = false; _crateNavDnWas = false;
    }

    // Escape (desktop) — unfocus a held disc, else dismiss the crate
    if (ctx.escEdge && ctx.iCD <= 0) {
      if (crateFocusPhase === 'focused') { _startCrateUnfocus(); hidePrompt(); ctx.setCD(0.35); }
      else if (cratePhase && cratePhase !== 'closing') { _dismissCrate(); hidePrompt(); ctx.setCD(0.3); }
    } else if (ctx.eEdge && ctx.iCD <= 0) {
      if (crateCanFocus) {
        _startCrateFocus(crateAimedDisc); hidePrompt(); ctx.setCD(0.35);
      } else if (isMobile && crateFocusPhase === 'focused') {
        _startCrateUnfocus(); hidePrompt(); ctx.setCD(0.35);
      } else if (isMobile && cratePhase === 'browsing' && !crateFocusPhase) {
        _dismissCrate(); hidePrompt(); ctx.setCD(0.3);
      }
    }

    // Open / close scale animation + bob
    if (cratePhase === 'opening') {
      crateT = Math.min(1, crateT + ctx.dt / OPEN_DUR);
      const s = crateT * crateT * (3 - 2 * crateT);
      if (crateGroup) crateGroup.scale.setScalar(0.04 + s * 0.96);
      if (crateT >= 1) { cratePhase = 'browsing'; _showCrateNav(true); _showCrateBrowseHint(); }
    } else if (cratePhase === 'closing') {
      crateT = Math.max(0, crateT - ctx.dt / CLOSE_DUR);
      const s = crateT * crateT * (3 - 2 * crateT);
      if (crateGroup) crateGroup.scale.setScalar(0.04 + s * 0.96);
      if (crateT <= 0) _closeCrate();
    }
    if (crateGroup) crateGroup.position.y = CRATE_Y + Math.sin(ctx.t * 1.4) * 0.03;

    // Hide the HUD while a disc is held in focus
    const _crateFocusUIHidden = crateFocusPhase === 'focusing' || crateFocusPhase === 'focused';
    _elMmWrap.classList.toggle('focus-hidden', _crateFocusUIHidden);
    _elUi?.classList.toggle('focus-hidden', _crateFocusUIHidden);
    _jZone.classList.toggle('focus-hidden', _crateFocusUIHidden);

    // Sub-animations
    _tickCrateSwap(ctx.dt);
    _tickCrateFocus(ctx.dt);
  },
});

// Warm the crate's procedural textures + box on approach so the first open is instant. Attached
// as the floater's _preload hook (like the CRT and MPC) instead of firing at module-eval: the
// core only runs _preload once the room is revealed, so the crate's heavy wood/record texture
// builds + GPU uploads stay out of the loading/tutorial window where they used to stutter startup.
if (floaters[VINYL.floaterIdx]) floaters[VINYL.floaterIdx]._preload = _preloadVinylAssets;
