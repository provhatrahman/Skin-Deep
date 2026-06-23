// Boot timestamp (≈ page parse) — start() holds the splash to a minimum on-screen time from here.
const _bootT0 = performance.now();

// ══════════════════════════════════════════
//  PROCEDURAL TEXTURES
// ══════════════════════════════════════════



function makeOrbTexture() {
  // Upload to the GPU as soon as it decodes (via _initTex) instead of on the first frame that
  // renders the orb — removes a one-time texture-upload hitch right as the scene reveals.
  const tex = new THREE.TextureLoader().load('orb_tex.webp', t => _initTex(t));
  return tex;
}

// Generates a distinct procedural emissive pattern for each floater type
function makeFloaterTex(type) {
  // 64px (was 128): these are emissive maps on small, distant geometric objects — 64² is
  // visually indistinguishable but ~4× cheaper to generate (the crystal/marble/static/cells
  // generators are O(S²)), so each build fits inside one idle slice and never busts a frame
  // budget when it runs during the early roam.
  const S = 64, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,S,S);
  if (type === 'crystal') {
    // Voronoi cell-edge glow — crystalline facets
    const pts = Array.from({length:14}, () => [Math.random()*S, Math.random()*S]);
    for (let x=0; x<S; x++) for (let y=0; y<S; y++) {
      let d1=1e9, d2=1e9;
      for (const p of pts){const d=Math.hypot(x-p[0],y-p[1]);if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;}
      const e=d2-d1; if(e<2.2){const a=Math.pow((2.2-e)/2.2,1.8)*0.88;ctx.fillStyle=`rgba(255,255,255,${a})`;ctx.fillRect(x,y,1,1);}
    }
  } else if (type === 'circuit') {
    // Orthogonal circuit trace lines + nodes
    ctx.strokeStyle='rgba(255,255,255,0.82)'; ctx.lineWidth=0.9; const g=16;
    for (let x=0; x<=S; x+=g) for (let y=0; y<=S; y+=g) {
      if(Math.random()>.38){ctx.beginPath();ctx.moveTo(x,y);const h=Math.random()>.5;ctx.lineTo(x+(h?g:0),y+(h?0:g));ctx.stroke();}
      if(Math.random()>.62){ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.9)';ctx.fill();}
    }
  } else if (type === 'marble') {
    // Turbulence swirl bands
    const id=ctx.createImageData(S,S);
    for (let x=0; x<S; x++) for (let y=0; y<S; y++) {
      const v=Math.min(255,Math.max(0,((Math.sin((x/S+Math.sin(y/S*4.5)*0.35)*Math.PI*6)+1)*0.5*220)|0));
      const i=(y*S+x)*4; id.data[i]=id.data[i+1]=id.data[i+2]=v; id.data[i+3]=255;
    }
    ctx.putImageData(id,0,0);
  } else if (type === 'cells') {
    // Organic Voronoi cell ripples
    const pts=Array.from({length:18},()=>[Math.random()*S,Math.random()*S]);
    for (let x=0; x<S; x+=2) for (let y=0; y<S; y+=2) {
      let d1=1e9; for(const p of pts){const d=Math.hypot(x-p[0],y-p[1]);if(d<d1)d1=d;}
      const v=(Math.sin(d1*0.38)+1)*0.42; ctx.fillStyle=`rgba(255,255,255,${v})`; ctx.fillRect(x,y,2,2);
    }
  } else if (type === 'cosmos') {
    // Nebula soft patches + scattered star dots
    for (let i=0; i<6; i++) {
      const nx=Math.random()*S, ny=Math.random()*S, nr=S*(0.2+Math.random()*0.15);
      const grd=ctx.createRadialGradient(nx,ny,0,nx,ny,nr);
      grd.addColorStop(0,'rgba(255,255,255,0.18)'); grd.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=grd; ctx.fillRect(0,0,S,S);
    }
    for(let i=0;i<90;i++){const r=Math.random();ctx.beginPath();ctx.arc(Math.random()*S,Math.random()*S,r*1.5,0,Math.PI*2);ctx.fillStyle=`rgba(255,255,255,${0.25+r*0.75})`;ctx.fill();}
  } else if (type === 'static') {
    // Fine pixel static — ghostly noise
    const id=ctx.createImageData(S,S);
    for(let i=0;i<S*S;i++){const v=Math.random()<0.06?255:Math.random()*55|0;id.data[i*4]=id.data[i*4+1]=id.data[i*4+2]=v;id.data[i*4+3]=255;}
    ctx.putImageData(id,0,0);
  } else if (type === 'rune') {
    // Angular rune-like glyphs
    ctx.strokeStyle='rgba(255,255,255,0.78)'; ctx.lineWidth=1.2;
    for(let i=0;i<14;i++){
      const rx=8+Math.random()*(S-16), ry=8+Math.random()*(S-16), len=7+Math.random()*12, a=Math.random()*Math.PI;
      ctx.beginPath(); ctx.moveTo(rx,ry); ctx.lineTo(rx+Math.cos(a)*len,ry+Math.sin(a)*len);
      if(Math.random()>.45)ctx.lineTo(rx+Math.cos(a+Math.PI*0.62)*len*0.65,ry+Math.sin(a+Math.PI*0.62)*len*0.65);
      ctx.stroke();
    }
  } else if (type === 'weave') {
    // Diagonal crosshatch weave with bright intersections
    ctx.strokeStyle='rgba(255,255,255,0.48)'; ctx.lineWidth=0.9;
    for(let i=-S;i<S*2;i+=9){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+S,S);ctx.stroke();ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i-S,S);ctx.stroke();}
    for(let x=0;x<S;x+=9) for(let y=0;y<S;y+=9)
      if((((x+y)/9)|0)%2===0){ctx.beginPath();ctx.arc(x,y,1.5,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.9)';ctx.fill();}
  }
  return new THREE.CanvasTexture(cv);
}

function makeExhibitFrameTex(canvasW, canvasH) {
  const W = canvasW || 512, H = canvasH || 384;
  const SS = 2; // supersample: draw at 2x so borders stay crisp at full DPR
  const cv = document.createElement('canvas');
  cv.width = W * SS; cv.height = H * SS;
  const ctx = cv.getContext('2d');
  ctx.scale(SS, SS);
  const FW = Math.max(12, Math.round(Math.min(W, H) * 0.03125)); // scales with panel aspect

  // Dark warm backing for the frame border region
  ctx.fillStyle = 'rgba(8,4,1,0.82)';
  ctx.fillRect(0, 0, W, H);

  // Outer edge — faint amber perimeter line
  ctx.shadowColor = 'rgba(255,170,50,0.5)';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = 'rgba(255,180,60,0.32)';
  ctx.lineWidth = 1;
  ctx.strokeRect(1.5, 1.5, W-3, H-3);

  // Inner glow line — bright gold at image boundary
  ctx.shadowColor = 'rgba(255,195,80,0.9)';
  ctx.shadowBlur = 14;
  ctx.strokeStyle = 'rgba(255,215,110,0.75)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(FW - 0.75, FW - 0.75, W - FW*2 + 1.5, H - FW*2 + 1.5);

  // Corner L-bracket ornaments — matches ipr-icon / orb glow palette
  const CL = 24;
  ctx.shadowColor = 'rgba(255,230,130,1)';
  ctx.shadowBlur = 16;
  ctx.strokeStyle = 'rgba(255,240,160,0.92)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  // TL
  ctx.beginPath(); ctx.moveTo(FW+CL, FW); ctx.lineTo(FW, FW); ctx.lineTo(FW, FW+CL); ctx.stroke();
  // TR
  ctx.beginPath(); ctx.moveTo(W-FW-CL, FW); ctx.lineTo(W-FW, FW); ctx.lineTo(W-FW, FW+CL); ctx.stroke();
  // BR
  ctx.beginPath(); ctx.moveTo(W-FW, H-FW-CL); ctx.lineTo(W-FW, H-FW); ctx.lineTo(W-FW-CL, H-FW); ctx.stroke();
  // BL
  ctx.beginPath(); ctx.moveTo(FW+CL, H-FW); ctx.lineTo(FW, H-FW); ctx.lineTo(FW, H-FW-CL); ctx.stroke();

  // Punch transparent center so the photo shows through
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,1)';
  ctx.fillRect(FW, FW, W - FW*2, H - FW*2);
  ctx.globalCompositeOperation = 'source-over';

  return new THREE.CanvasTexture(cv);
}



// ── CRATE WOOD TEXTURES ──












const _texLoader = new THREE.TextureLoader();
const _frameTexCache = new Map();

// Photos are viewed near head-on, so skip mipmaps (no generation cost / memory) and
// clamp wrapping — makes the now-NPOT images valid in WebGL1 without a runtime POT resize.
function _configExhibitTex(tex) {
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function _texAspect(tex) {
  const ud = tex.userData || {};
  if (ud.aspect) return ud.aspect;
  if (tex.image && tex.image.width) return tex.image.width / tex.image.height;
  return 4 / 3;
}

function _setTexAspect(tex, aspect) {
  if (!tex.userData) tex.userData = {};
  tex.userData.aspect = aspect;
}

// Compute the UV rectangle covering a line of canvas text on an info-card texture, so the
// carousel click handler can detect a click/tap on it (see the card-link listeners below).
// `ctx` must already have the final font set; `cx` is the text's centre X and `baselineY`
// its alphabetic baseline; W,H are the card's LOGICAL canvas size. CanvasTextures default to
// flipY=true, so canvas (x,y) maps to UV (x/W, 1 - y/H). Returns { u0,v0,u1,v1 } in [0,1],
// padded so the tap target is a touch larger than the glyphs.
function _cardTextHotspot(ctx, text, cx, baselineY, W, H) {
  const tw = ctx.measureText(text).width;
  const PADX = 9, PADT = 15, PADB = 7;
  const x0 = cx - tw / 2 - PADX, x1 = cx + tw / 2 + PADX;
  const yTop = baselineY - PADT, yBot = baselineY + PADB;
  return { u0: x0 / W, u1: x1 / W, v0: 1 - yBot / H, v1: 1 - yTop / H };
}

// Draw the Instagram camera glyph (rounded square + lens circle + top-right dot) centred at
// (cx,cy) within a square of side `s`. Pure canvas — no external SVG to load (the buildless
// site can't fetch one). Used beside an info-card @handle so it reads unmistakably as Instagram.
function _drawInstagramGlyph(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, s * 0.11);
  ctx.lineJoin = 'round';
  const r = s * 0.28, x = cx - s / 2, y = cy - s / 2;
  ctx.beginPath();                                   // rounded square body
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + s, y,     x + s, y + s, r);
  ctx.arcTo(x + s, y + s, x,     y + s, r);
  ctx.arcTo(x,     y + s, x,     y,     r);
  ctx.arcTo(x,     y,     x + s, y,     r);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();                                   // lens
  ctx.arc(cx, cy, s * 0.26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();                                   // top-right dot
  ctx.arc(x + s * 0.74, y + s * 0.26, s * 0.065, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Draw a globe glyph (outline + equator + meridian + one parallel) centred at (cx,cy) within a
// square of side `s`. Pure canvas — denotes a website/reference link beside an info-card label,
// the website counterpart to the Instagram glyph above.
function _drawGlobeGlyph(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, s * 0.09);
  ctx.lineJoin = 'round';
  const r = s * 0.46;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();                  // outline
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();      // equator
  ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.46, r, 0, 0, Math.PI * 2); ctx.stroke(); // meridian
  ctx.beginPath();                                                                    // upper parallel
  ctx.moveTo(cx - r * 0.86, cy - r * 0.5); ctx.lineTo(cx + r * 0.86, cy - r * 0.5); ctx.stroke();
  ctx.restore();
}

// Draw an Instagram link row on an info card: the IG glyph, then the @handle (link-bright +
// underlined), centred as one block at baseline `y`, with a small "open profile" prompt beneath.
// Returns the hotspot { u0,v0,u1,v1,url } spanning the glyph + handle so a click/tap anywhere on
// the row opens the profile. `ctx` font is set internally; W,H are the card's logical size.
// Pass noPrompt to suppress the per-row prompt (when several link rows share one prompt beneath).
function _instagramLink(ctx, { handle, url, cx, y, W, H, hint, noPrompt }) {
  const GS = 13, GAP = 7;                            // glyph side + glyph→text gap
  ctx.font = '400 12px Georgia, serif';
  const tw = ctx.measureText(handle).width;
  const blockW = GS + GAP + tw;
  const left = cx - blockW / 2;
  _drawInstagramGlyph(ctx, left + GS / 2, y - 4, GS, 'rgba(255,214,130,0.82)');
  const textLeft = left + GS + GAP;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,214,130,0.72)';         // brighter than body text so it reads as a link
  ctx.fillText(handle, textLeft, y);
  ctx.strokeStyle = 'rgba(255,200,100,0.4)';        // underline cues it's tappable (no hover on mobile)
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(textLeft, y + 4); ctx.lineTo(textLeft + tw, y + 4); ctx.stroke();
  ctx.textAlign = 'center';
  if (!noPrompt) {
    const prompt = hint || (window.matchMedia('(pointer: coarse)').matches
      ? 'Tap to open profile' : 'Click to open profile');
    ctx.fillStyle = 'rgba(255,200,100,0.4)';
    ctx.font = '400 9px Georgia, serif';
    ctx.fillText(prompt, cx, y + 16);
  }
  ctx.textAlign = prevAlign;
  const PADX = 9, PADT = 15, PADB = 7;
  return {
    u0: (left - PADX) / W, u1: (left + blockW + PADX) / W,
    v0: 1 - (y + PADB) / H, v1: 1 - (y - PADT) / H, url,
  };
}

// Draw a website/reference link row on an info card: the globe glyph, then `label` (link-bright +
// underlined), centred as one block at baseline `y`, with an optional "open" prompt beneath. The
// website counterpart to _instagramLink — same geometry + hotspot, so a click/tap anywhere on the
// row opens `url`. Pass noPrompt when several link rows share one prompt beneath.
function _websiteLink(ctx, { label, url, cx, y, W, H, hint, noPrompt }) {
  const GS = 13, GAP = 7;                            // glyph side + glyph→text gap
  ctx.font = '400 12px Georgia, serif';
  const tw = ctx.measureText(label).width;
  const blockW = GS + GAP + tw;
  const left = cx - blockW / 2;
  _drawGlobeGlyph(ctx, left + GS / 2, y - 4, GS, 'rgba(255,214,130,0.82)');
  const textLeft = left + GS + GAP;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,214,130,0.72)';         // brighter than body text so it reads as a link
  ctx.fillText(label, textLeft, y);
  ctx.strokeStyle = 'rgba(255,200,100,0.4)';        // underline cues it's tappable (no hover on mobile)
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(textLeft, y + 4); ctx.lineTo(textLeft + tw, y + 4); ctx.stroke();
  ctx.textAlign = 'center';
  if (!noPrompt) {
    const prompt = hint || (window.matchMedia('(pointer: coarse)').matches
      ? 'Tap to open' : 'Click to open');
    ctx.fillStyle = 'rgba(255,200,100,0.4)';
    ctx.font = '400 9px Georgia, serif';
    ctx.fillText(prompt, cx, y + 16);
  }
  ctx.textAlign = prevAlign;
  const PADX = 9, PADT = 15, PADB = 7;
  return {
    u0: (left - PADX) / W, u1: (left + blockW + PADX) / W,
    v0: 1 - (y + PADB) / H, v1: 1 - (y - PADT) / H, url,
  };
}

// Build an info card in a tall PORTRAIT layout for mobile. All five photo exhibits share one
// landscape card template (kicker → title → optional tagline → byline → body → credits → IG
// handles) baked at 512×384; fit to a phone screen at focus, that landscape card fills only the
// width and reads tiny (it's short on a 9:16+ viewport). On mobile each exhibit instead calls this
// with a small content spec, producing a 9:16 card that fills the portrait viewport with large
// type. Same warm border/vignette/corner treatment as the landscape card, scaled up. The engine's
// outer frame + focus fill come for free via the texture's portrait aspect (set on userData).
// spec: { kicker?, title:[lines], titleSize?, tagline?, byline?, body?:[lines], credits?,
//         handles?:[{handle,url}], links?:[{label,url}] }. Returns a CanvasTexture with
//         userData.{aspect,hotspots}. handles render with the IG glyph, links with the globe glyph.
function _buildInfoCardPortrait(spec) {
  const W = 600, H = 1066;          // 9:16 — fills a phone screen at focus
  const SS = 2;                     // 1200×2132 backing — crisp at full-screen focus
  const cv = document.createElement('canvas');
  cv.width = W * SS; cv.height = H * SS;
  const ctx = cv.getContext('2d');
  ctx.scale(SS, SS);

  // ── backing + vignette ──
  ctx.fillStyle = 'rgb(4,2,1)';
  ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W/2, H/2, 60, W/2, H/2, H * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // ── borders + corner accents ──
  const BM = 22;
  ctx.strokeStyle = 'rgba(255,200,100,0.32)';
  ctx.lineWidth = 2;
  ctx.strokeRect(BM, BM, W - BM*2, H - BM*2);
  ctx.strokeStyle = 'rgba(255,200,100,0.1)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(BM+6, BM+6, W-BM*2-12, H-BM*2-12);

  const CL = 44, F = BM;
  ctx.shadowColor = 'rgba(255,220,120,1)';
  ctx.shadowBlur = 14;
  ctx.strokeStyle = 'rgba(255,240,160,0.9)';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(F+CL,F);     ctx.lineTo(F,F);     ctx.lineTo(F,F+CL);     ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W-F-CL,F);   ctx.lineTo(W-F,F);   ctx.lineTo(W-F,F+CL);   ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W-F,H-F-CL); ctx.lineTo(W-F,H-F); ctx.lineTo(W-F-CL,H-F); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(F+CL,H-F);   ctx.lineTo(F,H-F);   ctx.lineTo(F,H-F-CL);   ctx.stroke();
  ctx.shadowBlur = 0;

  const cx = W / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // ── flowing vertical layout: collect blocks (gapBefore = px from the previous baseline to this
  // one + a render fn taking the final baseline y), measure the total, then centre the block ──
  const TITLE = spec.titleSize || 42;
  const hotspots = [];
  const items = [];
  const push = (gap, render) => items.push({ gap, render });

  if (spec.kicker) push(0, (y) => {
    ctx.fillStyle = 'rgba(255,200,100,0.42)';
    ctx.font = '400 19px Georgia, serif';
    ctx.fillText(spec.kicker, cx, y);
  });

  spec.title.forEach((t, i) => push(i === 0 ? (spec.kicker ? 56 : 0) : Math.round(TITLE * 1.2), (y) => {
    ctx.fillStyle = 'rgba(255,238,175,0.98)';
    ctx.font = `400 ${TITLE}px Georgia, serif`;
    ctx.shadowColor = 'rgba(255,200,80,0.18)';
    ctx.shadowBlur = 18;
    ctx.fillText(t, cx, y);
    ctx.shadowBlur = 0;
  }));

  if (spec.tagline) push(40, (y) => {
    ctx.fillStyle = 'rgba(255,220,150,0.62)';
    ctx.font = 'italic 400 20px Georgia, serif';
    ctx.fillText(spec.tagline, cx, y);
  });

  push(46, (y) => {                                   // title divider
    ctx.strokeStyle = 'rgba(255,200,100,0.22)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - 170, y); ctx.lineTo(cx + 170, y); ctx.stroke();
  });

  if (spec.byline) push(46, (y) => {
    ctx.fillStyle = 'rgba(255,220,150,0.82)';
    ctx.font = '400 23px Georgia, serif';
    ctx.fillText(spec.byline, cx, y);
  });

  (spec.body || []).forEach((t, i) => push(i === 0 ? 56 : 38, (y) => {
    ctx.fillStyle = 'rgba(255,210,135,0.7)';
    ctx.font = '400 24px Georgia, serif';
    ctx.fillText(t, cx, y);
  }));

  if (spec.credits) push(62, (y) => {
    ctx.fillStyle = 'rgba(255,200,100,0.52)';
    ctx.font = '400 18px Georgia, serif';
    ctx.fillText(spec.credits, cx, y);
  });

  push(42, (y) => {                                   // lower divider
    ctx.strokeStyle = 'rgba(255,200,100,0.14)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - 150, y); ctx.lineTo(cx + 150, y); ctx.stroke();
  });

  // Link row(s) — IG handles + website links, stacked vertically (one per line) so each is a
  // comfortable tap target on a phone; a single prompt sits beneath the last. Larger glyph/text
  // than the landscape helpers. Hotspots are recorded at the FINAL (centred) baseline.
  const GS = 22, GAP = 11;
  const drawRow = (row, y) => {
    ctx.font = '400 22px Georgia, serif';
    const tw = ctx.measureText(row.label).width;
    const blockW = GS + GAP + tw;
    const left = cx - blockW / 2;
    if (row.kind === 'web') _drawGlobeGlyph(ctx, left + GS / 2, y - 7, GS, 'rgba(255,214,130,0.82)');
    else _drawInstagramGlyph(ctx, left + GS / 2, y - 7, GS, 'rgba(255,214,130,0.82)');
    const textLeft = left + GS + GAP;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,214,130,0.74)';
    ctx.fillText(row.label, textLeft, y);
    ctx.strokeStyle = 'rgba(255,200,100,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(textLeft, y + 7); ctx.lineTo(textLeft + tw, y + 7); ctx.stroke();
    ctx.textAlign = 'center';
    const PADX = 16, PADT = 28, PADB = 16;            // generous — finger-sized tap target
    hotspots.push({
      u0: (left - PADX) / W, u1: (left + blockW + PADX) / W,
      v0: 1 - (y + PADB) / H, v1: 1 - (y - PADT) / H, url: row.url,
    });
  };
  const rows = [
    ...(spec.handles || []).map((h) => ({ kind: 'ig', label: h.handle, url: h.url })),
    ...(spec.links || []).map((l) => ({ kind: 'web', label: l.label, url: l.url })),
  ];
  rows.forEach((r, i) => push(i === 0 ? 58 : 52, (y) => drawRow(r, y)));

  if (rows.length) push(32, (y) => {
    ctx.fillStyle = 'rgba(255,200,100,0.4)';
    ctx.font = '400 15px Georgia, serif';
    ctx.fillText(rows.length > 1 ? 'Tap a link to open' : 'Tap to open', cx, y);
  });

  let total = 0;
  for (const it of items) total += it.gap;            // first baseline → last baseline
  let y = (H - total) / 2;                             // centre the block vertically
  for (const it of items) { y += it.gap; it.render(y); }

  const tex = new THREE.CanvasTexture(cv);
  // No mipmaps + clamp: the card is viewed near head-on at focus, and this keeps the tall NPOT
  // canvas at native size (WebGL1 would otherwise upscale it to a power of two — softer + heavier).
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.userData = tex.userData || {};                  // fresh textures can have undefined userData here
  tex.userData.aspect = W / H;                        // portrait — _ensureCardTex defers to this
  tex.userData.hotspots = hotspots;
  return tex;
}

function _fitExhibitSize(aspect) {
  let w = EXHIBIT_W, h = w / aspect;
  if (h > EXHIBIT_H) { h = EXHIBIT_H; w = h * aspect; }
  return { w, h };
}

function _getExhibitFrameTex(panelW, panelH) {
  const key = panelW.toFixed(3) + 'x' + panelH.toFixed(3);
  if (!_frameTexCache.has(key)) {
    const base = 512;
    const cw = base, ch = Math.round(base * (panelH / panelW));
    _frameTexCache.set(key, makeExhibitFrameTex(cw, ch));
  }
  return _frameTexCache.get(key);
}

// Photo-carousel exhibitions register themselves from their own data files
// (js/exhibits/*.js) via the exported registerPhotoExhibit(); each spec is pushed
// here so the proximity preloader + background drain (_loadExhibitTexturesFor /
// _startExhibitPreloadDrain) can warm them. The carousel ENGINE (open / focus / orbit
// tick) is the shared machinery below + in animate().
const _photoSpecs = [];





// Force a texture's GPU upload now instead of on the first frame it's rendered.
// Pre-warming during idle keeps the crate's first open from stalling on ~70 MB
// of disc/wood texture uploads.
function _initTex(t) {
  if (t && renderer.initTexture) { try { renderer.initTexture(t); } catch (e) {} }
}

const _scheduleIdle = (fn) =>
  (window.requestIdleCallback ? requestIdleCallback(() => fn(), { timeout: 1000 }) : setTimeout(fn, 60));

// Exhibit warm-up work — supersampled canvas builds + synchronous GPU uploads
// (renderer.initTexture) — is queued and drained from animate() instead of firing whenever it
// finishes decoding, so several completing at once can't stack into one long frame. Two tiers:
//   • _warmQueue (photos/frames, ~light): drained ONE unit/frame always — small enough that one
//     per frame stays on budget even while walking.
//   • _warmHeavy (the 2048px info-card build, ~400ms): drained only while the player is
//     STATIONARY, so it warms during the natural pause at the reveal / before opening rather
//     than hitching mid-stride. If an exhibit is opened before its card warms, the panel builder
//     (_ensureCardTex at open) still produces it on demand.
// This changes only WHEN warm-up runs, never what gets warmed — the look is unaffected.
const _warmQueue = [];
const _warmHeavy = [];
const _enqueueWarm      = (fn) => { _warmQueue.push(fn); };
const _enqueueWarmHeavy = (fn) => { _warmHeavy.push(fn); };
function _drainWarmQueue(moving) {
  if (_warmQueue.length) { const fn = _warmQueue.shift(); try { fn(); } catch (e) {} return; }
  if (!moving && _warmHeavy.length) { const fn = _warmHeavy.shift(); try { fn(); } catch (e) {} }
}



// Pre-build the framed-panel's GPU resources once the photo's aspect is known:
// generate (and cache) its border frame texture and force both the photo and the
// frame onto the GPU. Doing this while the textures stream in keeps the first
// exhibit open from stalling on ~6 supersampled canvas builds + uploads mid-spin.
function _warmExhibitPanel(tex) {
  if (!tex) return;
  _initTex(tex);
  const { w, h } = _fitExhibitSize(_texAspect(tex));
  _initTex(_getExhibitFrameTex(w, h));
}

// Build a photo exhibit's info-card texture on first need and cache it on the spec.
// The card is a large supersampled canvas (up to 2048×1536); deferring it off the
// import path — built during idle warm-up or at first open — keeps ~0.5-1s of canvas
// work out of the initial load. spec.cardTex arrives as a factory function from the
// exhibit module (see js/exhibits/*.js); the aspect is fixed so layout never waits.
function _ensureCardTex(spec) {
  if (!spec.cardTex && spec._cardFactory) {
    spec.cardTex = spec._cardFactory();
    // The factory may already set its own aspect (the mobile portrait card does); only fall back
    // to the spec/landscape default when it hasn't, so the portrait card's frame + focus fill fit.
    if (!(spec.cardTex.userData && spec.cardTex.userData.aspect)) {
      _setTexAspect(spec.cardTex, spec.cardAspect || 512 / 384);
    }
    _initTex(spec.cardTex);
  }
  return spec.cardTex;
}

// Load ONE exhibit's photos + warm its card. Idempotent. Proximity (in the floater loop)
// preloads the exhibit the player is approaching so it's decoded by open; the background
// drain trickles in the rest. Replaces the old all-at-once burst (~29 loads + 5 card builds).
function _loadExhibitTexturesFor(ex) {
  if (!ex || ex._loaded) return;
  ex._loaded = true;
  _enqueueWarmHeavy(() => _warmExhibitPanel(_ensureCardTex(ex)));
  ex.textures = ex.paths.map(path => {
    const tex = _configExhibitTex(_texLoader.load(path, img => {
      _setTexAspect(tex, img.width / img.height);
      _enqueueWarm(() => _warmExhibitPanel(tex));
    }));
    if (tex.image && tex.image.width) {
      _setTexAspect(tex, tex.image.width / tex.image.height);
      _enqueueWarm(() => _warmExhibitPanel(tex));
    }
    return tex;
  });
}

// Background preload: trickle the remaining exhibits in, one per idle tick, so the whole
// gallery warms without a burst. Proximity/open just jump a spec's queue (the _loaded guard
// makes the drain skip anything already loaded).
let _bgDrainStarted = false;
function _startExhibitPreloadDrain() {
  if (_bgDrainStarted) return;
  _bgDrainStarted = true;
  const step = () => {
    const next = _photoSpecs.find(s => !s._loaded);
    if (!next) return;
    _loadExhibitTexturesFor(next);
    _scheduleIdle(step);
  };
  _scheduleIdle(step);
}

// ══════════════════════════════════════════
//  SCENE
// ══════════════════════════════════════════
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.032);

// Mobile = coarse primary pointer AND no fine pointer anywhere. The `any-pointer: fine`
// guard keeps touchscreen desktops/laptops (mouse + touch) on the full-quality path.
// `?mobile=1` / `?desktop=1` force a mode for local testing.
const _qp = new URLSearchParams(location.search);
const _qpMode = _qp.get('mobile') === '1' ? true : _qp.get('desktop') === '1' ? false : null;
const isMobile = _qpMode != null ? _qpMode
  : window.matchMedia('(pointer: coarse)').matches
    && !window.matchMedia('(any-pointer: fine)').matches;
// powerPreference: pick the discrete GPU on dual-GPU laptops (no visual change, pure throughput).
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
// Adaptive resolution scaling — DPR is tuned at runtime to hold ~60fps (see animate()).
// Mobile floor is held at 1.5 so a transient FPS dip never drops to a blurry 1.0.
const MIN_DPR = isMobile ? 1.5 : 1.0;
const MAX_DPR = Math.min(window.devicePixelRatio, isMobile ? 2.0 : 2);
// Soft-start: open slightly below full resolution so the heaviest first second (compile + first
// GPU-warmed frames) never drops frames, then the governor climbs to MAX_DPR within ~1s once the
// frame rate is steady. Barely perceptible behind the ~1s splash veil.
let curDPR = Math.max(MIN_DPR, MAX_DPR - 0.4);
// While an exhibit card is open the viewer studies the photos head-on, so we push
// the framebuffer to full resolution and pause the adaptive downscaler (see animate()).
const EXHIBIT_DPR = MAX_DPR;
let _savedDPR = curDPR;
renderer.setPixelRatio(curDPR);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
renderer.toneMapping = isMobile ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
if (!isMobile) renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

// Anisotropy sharpens the tiled floor at grazing angles; near-free on modern GPUs so match desktop
const MAX_ANISO = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth/window.innerHeight, 0.1, 80);

// ── FLOOR ──
const floorTex = new THREE.TextureLoader().load('tile.webp', t => _initTex(t));
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
floorTex.repeat.set(6, 6);
floorTex.generateMipmaps = true;
floorTex.minFilter = THREE.LinearMipmapLinearFilter;
floorTex.magFilter = THREE.LinearFilter;
floorTex.anisotropy = MAX_ANISO;
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(38, 38),
  new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85, metalness: 0.05, color: 0x222222 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// ── ROOM WALLS + CEILING (no bottom face) ──
const wallTex = new THREE.TextureLoader().load('tile.webp', t => _initTex(t));
wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
wallTex.repeat.set(5, 3);
wallTex.generateMipmaps = true;
wallTex.minFilter = THREE.LinearMipmapLinearFilter;
wallTex.magFilter = THREE.LinearFilter;
wallTex.anisotropy = MAX_ANISO;
const roomMat = new THREE.MeshStandardMaterial({
  map: wallTex, roughness: 0.85, metalness: 0.05,
  color: 0x666666, side: THREE.FrontSide,
});
const W = 35, H = 16;
// Four walls
[
  { pos:[0, H/2, -W/2], rx:0,   ry:0 },
  { pos:[0, H/2,  W/2], rx:0,   ry:Math.PI },
  { pos:[-W/2, H/2, 0], rx:0,   ry:Math.PI/2 },
  { pos:[ W/2, H/2, 0], rx:0,   ry:-Math.PI/2 },
].forEach(({pos, rx, ry}) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), roomMat);
  m.position.set(...pos); m.rotation.set(rx, ry, 0);
  scene.add(m);
});
// Ceiling
const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, W), roomMat);
ceiling.position.set(0, H, 0);
ceiling.rotation.x = Math.PI / 2;
scene.add(ceiling);

// ── LIGHTS ──
// Ambient starts dark — fades in after the player interacts with the first object
const ambientLight = new THREE.AmbientLight(0xffffff, 0.0);
scene.add(ambientLight);

// ══════════════════════════════════════════
//  PLAYER / ORB
// ══════════════════════════════════════════
const player = new THREE.Group();
player.position.set(0, 0, -8.5);
scene.add(player);

// Core
const _orbTex = makeOrbTexture();
const orbMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.22, 16, 16),
  new THREE.MeshStandardMaterial({ map:_orbTex, emissiveMap:_orbTex, color:0xfff5d0, emissive:0xffaa33, emissiveIntensity:0.8, roughness:0.15 })
);
orbMesh.position.y = 0.55;
player.add(orbMesh);

// Main orb light — inverse-square decay, no hard distance cutoff
const orbLight = new THREE.PointLight(0xffa040, 12.0, 8, 1.2);
orbLight.position.y = 0.55;
player.add(orbLight);

// Secondary soft fill — capped range so it only warms the immediate vicinity of the player
const fillLight = new THREE.PointLight(0xff8844, 0.45, 6, 2);
fillLight.position.y = 0.8;
player.add(fillLight);

// Distant feather fill — slightly wider but still bounded so distant walls stay dark
const featherLight = new THREE.PointLight(0xff6622, 0.15, 9, 2);
featherLight.position.y = 1.2;
player.add(featherLight);

// ── BLOB SHADOW ──
const _shadowCanvas = document.createElement('canvas');
_shadowCanvas.width = _shadowCanvas.height = 128;
const _shadowCtx = _shadowCanvas.getContext('2d');
const _shadowGrad = _shadowCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
_shadowGrad.addColorStop(0,   'rgba(0,0,0,0.72)');
_shadowGrad.addColorStop(0.45,'rgba(0,0,0,0.38)');
_shadowGrad.addColorStop(0.75,'rgba(0,0,0,0.10)');
_shadowGrad.addColorStop(1,   'rgba(0,0,0,0)');
_shadowCtx.fillStyle = _shadowGrad;
_shadowCtx.fillRect(0, 0, 128, 128);
const blobShadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.82, 48),
  new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(_shadowCanvas),
    transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.NormalBlending,
  })
);
blobShadow.renderOrder = 1;
blobShadow.rotation.x = -Math.PI / 2;
blobShadow.position.y = 0.001;
scene.add(blobShadow);

// ══════════════════════════════════════════
//  DUST MOTES
// ══════════════════════════════════════════
// Soft circular sprite so particles look like dust, not square pixels
const _moteCanvas = document.createElement('canvas');
_moteCanvas.width = _moteCanvas.height = 32;
const _moteCtx = _moteCanvas.getContext('2d');
const _moteGrad = _moteCtx.createRadialGradient(16,16,0, 16,16,16);
_moteGrad.addColorStop(0,   'rgba(255,235,180,1)');
_moteGrad.addColorStop(0.4, 'rgba(255,210,130,0.6)');
_moteGrad.addColorStop(1,   'rgba(0,0,0,0)');
_moteCtx.fillStyle = _moteGrad;
_moteCtx.fillRect(0,0,32,32);
const _moteTex = new THREE.CanvasTexture(_moteCanvas);

const MOTE_N = isMobile ? 600 : 3000;
const motePos = new Float32Array(MOTE_N * 3);
const motePhase = new Float32Array(MOTE_N);
for (let i = 0; i < MOTE_N; i++) {
  motePos[i*3]   = (Math.random()-0.5)*22;
  motePos[i*3+1] = Math.random()*4;
  motePos[i*3+2] = (Math.random()-0.5)*22;
  motePhase[i]   = Math.random()*Math.PI*2;
}
// Per-particle constant fed to the GPU animation (its original loop index).
const moteIndex = new Float32Array(MOTE_N);
for (let i = 0; i < MOTE_N; i++) moteIndex[i] = i;

const moteGeo = new THREE.BufferGeometry();
moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3)); // bind only — overwritten in the vertex shader
moteGeo.setAttribute('aPhase', new THREE.BufferAttribute(motePhase, 1));
moteGeo.setAttribute('aIndex', new THREE.BufferAttribute(moteIndex, 1));

const _moteMat = new THREE.PointsMaterial({
  map: _moteTex, color:0xffe8b0, size:0.014, transparent:true, opacity:0.55,
  sizeAttenuation:true, depthWrite:false, alphaTest:0.01
});
// Animate the motes entirely on the GPU — same drift + player-follow as before, but the
// position is computed in the vertex shader from a time uniform + per-particle phase/index.
// This removes the per-frame 3000-iteration JS loop and the 36KB buffer upload; the loop
// just advances three uniforms. PointsMaterial is kept so the sprite map / sizeAttenuation
// / fog all stay intact; onBeforeCompile only rewrites where `transformed` comes from.
const _moteUniforms = { uTime: { value: 0 }, uPlayerX: { value: 0 }, uPlayerZ: { value: 0 } };
_moteMat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime    = _moteUniforms.uTime;
  shader.uniforms.uPlayerX = _moteUniforms.uPlayerX;
  shader.uniforms.uPlayerZ = _moteUniforms.uPlayerZ;
  shader.vertexShader =
    'attribute float aPhase;\nattribute float aIndex;\nuniform float uTime;\nuniform float uPlayerX;\nuniform float uPlayerZ;\n' +
    shader.vertexShader.replace(
      '#include <begin_vertex>',
      [
        '#include <begin_vertex>',
        'float _moteP = aPhase + uTime;',
        'transformed.x = uPlayerX + sin(_moteP * 1.1 + aIndex * 0.7) * 10.0;',
        'transformed.y = 0.25 + abs(sin(_moteP * 0.6 + aIndex * 0.4)) * 3.5;',
        'transformed.z = uPlayerZ + cos(_moteP * 0.9 + aIndex * 0.3) * 10.0;'
      ].join('\n')
    );
};
const moteMesh = new THREE.Points(moteGeo, _moteMat);
moteMesh.frustumCulled = false; // positions are computed in the shader, so the CPU bounding sphere is stale
scene.add(moteMesh);

// ══════════════════════════════════════════
//  FLOATERS
// ══════════════════════════════════════════
// Shared shadow texture for floater ground discs
const _fShadowCanvas = document.createElement('canvas');
_fShadowCanvas.width = _fShadowCanvas.height = 64;
const _fShadowCtx = _fShadowCanvas.getContext('2d');
const _fShadowGrad = _fShadowCtx.createRadialGradient(32,32,0, 32,32,32);
_fShadowGrad.addColorStop(0,   'rgba(0,0,0,0.6)');
_fShadowGrad.addColorStop(0.5, 'rgba(0,0,0,0.24)');
_fShadowGrad.addColorStop(1,   'rgba(0,0,0,0)');
_fShadowCtx.fillStyle = _fShadowGrad;
_fShadowCtx.fillRect(0,0,64,64);
const _floaterShadowTex = new THREE.CanvasTexture(_fShadowCanvas);

// Mobile-only: soft radial floor disc that stands in for a real beam SpotLight (mobile uses the
// cheap fake-beam path; desktop uses real per-floater SpotLights and never references this).
let _floaterSpotTex = null;
if (isMobile) {
  const _fSpotCanvas = document.createElement('canvas');
  _fSpotCanvas.width = _fSpotCanvas.height = 128;
  const _fSpotCtx = _fSpotCanvas.getContext('2d');
  const _fSpotGrad = _fSpotCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
  _fSpotGrad.addColorStop(0,   'rgba(255,255,255,0.42)');
  _fSpotGrad.addColorStop(0.45,'rgba(255,255,255,0.16)');
  _fSpotGrad.addColorStop(0.8, 'rgba(255,255,255,0.04)');
  _fSpotGrad.addColorStop(1,   'rgba(255,255,255,0)');
  _fSpotCtx.fillStyle = _fSpotGrad;
  _fSpotCtx.fillRect(0, 0, 128, 128);
  _floaterSpotTex = new THREE.CanvasTexture(_fSpotCanvas);
}

const floaterData = [
  { pos:[   0,1.1,    0], geo:new THREE.OctahedronGeometry(0.32),         color:0xffcc44, em:0xff8800, tex:'rune',   msg:"[ROOM OPENED]" },
  { pos:[ -11,1.2,  -11], geo:new THREE.OctahedronGeometry(0.25),         color:0x88ddff, em:0x2299cc, tex:'crystal', msg:"[EXHIBIT PIECE TRIGGERED]" },
  { pos:[   0,1.0,  -12], geo:new THREE.TetrahedronGeometry(0.28),         color:0xffcc55, em:0xdd8800, tex:'circuit', msg:"[EXHIBIT PIECE TRIGGERED]" },
  { pos:[  11,1.5,  -11], geo:new THREE.TorusGeometry(0.22,0.08,16,48),    color:0xff88aa, em:0xcc2255, tex:'marble',  msg:"[EXHIBIT PIECE TRIGGERED]" },
  { pos:[  12,1.1,    0], geo:new THREE.IcosahedronGeometry(0.22),         color:0xaaffcc, em:0x22aa55, tex:'cells',   msg:"[EXHIBIT PIECE TRIGGERED]" },
  { pos:[  11,0.9,   11], geo:new THREE.DodecahedronGeometry(0.22),        color:0xcc99ff, em:0x7733cc, tex:'cosmos',  msg:"[EXHIBIT PIECE TRIGGERED]" },
  { pos:[   0,1.3,   12], geo:new THREE.SphereGeometry(0.18,16,16),        color:0xffffff, em:0xaaaaff, tex:'static',  msg:"[EXHIBIT PIECE TRIGGERED]" },
  { pos:[ -11,1.0,   11], geo:new THREE.BoxGeometry(0.25,0.25,0.25),       color:0xffeeaa, em:0xcc9900, tex:'rune',    msg:"[EXHIBIT PIECE TRIGGERED]" },
  { pos:[ -12,1.2,    0], geo:new THREE.TorusKnotGeometry(0.14,0.05,64,8), color:0xff99cc, em:0xcc3388, tex:'weave',   msg:"[EXHIBIT PIECE TRIGGERED]" },
];

// ── SEEN MARKER (EYE) ──
// A small glowing eye — a circle (iris) inside a wide oval — that hovers above an exhibit
// the visitor has already opened, so completed pieces can be spotted from across the room
// ("seen this"). A Sprite (always camera-facing) keeps it legible from any angle; one shared
// texture, per-floater material so each can fade in on its own. Built for every floater but
// only ever shown for visited exhibits (floater 0 / the welcome piece is never "seen").
const _seenHaloTex = (() => {
  const W = 128, H = 72, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d'), cx = W / 2, cy = H / 2;
  c.shadowColor = 'rgba(255,210,120,0.9)';
  // Eye outline — a wide oval
  c.shadowBlur = 8;
  c.strokeStyle = 'rgba(255,228,150,0.92)';
  c.lineWidth = 3;
  c.beginPath();
  c.ellipse(cx, cy, W * 0.42, H * 0.36, 0, 0, Math.PI * 2);
  c.stroke();
  // Iris — a circle inside, with a soft fill
  c.shadowBlur = 6;
  c.lineWidth = 2.5;
  c.beginPath();
  c.arc(cx, cy, H * 0.22, 0, Math.PI * 2);
  c.stroke();
  c.shadowBlur = 0;
  c.fillStyle = 'rgba(255,225,150,0.22)';
  c.fill();
  // Pupil — bright centre dot
  c.beginPath();
  c.arc(cx, cy, H * 0.08, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,242,185,0.95)';
  c.fill();
  return new THREE.CanvasTexture(cv);
})();

const floaters = [];
floaterData.forEach(fd => {
  // Main mesh — procedural emissive texture, built SYNCHRONOUSLY here so the material is final
  // before the first frame (deferring + needsUpdate swaps caused GPU stalls). DESKTOP uses
  // MeshPhysicalMaterial with clearcoat for the rich single-file look; MOBILE uses the cheaper
  // MeshStandardMaterial (no clearcoat) — clearcoat is the most expensive program to compile and
  // barely visible on small emissive objects, so it stays off the mobile path.
  const _matCommon = {
    color:fd.color, emissive:fd.em, emissiveIntensity:1.4,
    emissiveMap: makeFloaterTex(fd.tex),
    roughness:0.12, metalness:0.55
  };
  const mesh = new THREE.Mesh(fd.geo, isMobile
    ? new THREE.MeshStandardMaterial(_matCommon)
    : new THREE.MeshPhysicalMaterial({ ..._matCommon, clearcoat:0.45, clearcoatRoughness:0.15 }));
  mesh.position.set(...fd.pos);
  scene.add(mesh);

  // Back-face aura shell — soft glow halo from behind
  const aura = new THREE.Mesh(fd.geo, new THREE.MeshBasicMaterial({
    color:fd.color, transparent:true, opacity:0.07,
    side:THREE.BackSide, blending:THREE.AdditiveBlending, depthWrite:false
  }));
  aura.scale.setScalar(1.22);
  aura.position.copy(mesh.position);
  scene.add(aura);

  // Orbit ring — spins on a tilted axis like a planetary ring
  const ringR = (fd.geo.parameters.radius || fd.geo.parameters.width || 0.22) + 0.19;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(ringR, 0.011, 6, 32),
    new THREE.MeshBasicMaterial({
      color:fd.color, transparent:true, opacity:0.36,
      blending:THREE.AdditiveBlending, depthWrite:false
    })
  );
  ring.position.copy(mesh.position);
  ring.rotation.x = (Math.random()*0.6 + 0.4) * Math.PI;
  ring.rotation.z = Math.random() * Math.PI;
  scene.add(ring);

  // Shadow disc — fades as floater rises
  const fShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.44, 32),
    new THREE.MeshBasicMaterial({
      map:_floaterShadowTex, transparent:true,
      depthWrite:false, depthTest:false, blending:THREE.NormalBlending
    })
  );
  fShadow.rotation.x = -Math.PI/2;
  fShadow.position.set(fd.pos[0], 0.004, fd.pos[2]);
  fShadow.renderOrder = 2;
  scene.add(fShadow);

  // Floater dynamic lights are POOLED on every platform now (see the shared pools below): a fixed
  // handful of lights repositioned each frame to the nearest floaters, instead of one light per
  // object. Floaters sit 11+ units apart while a floater light reaches only ~4.5 units, so the
  // nearest few read identically to one-per-floater — at a fraction of the per-pixel shading cost
  // and a far shorter renderer.compile().
  // Seen-marker eye — hovers above the piece; hidden until the exhibit is visited (toggled
  // in the floater loop from f._seen). Own material so it can fade in independently. Scale
  // keeps the texture's wide-oval aspect (128:72) so the eye isn't squashed.
  const seenHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: _seenHaloTex, color: 0xffe6a0, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true
  }));
  seenHalo.scale.set(0.34, 0.19, 1.0);
  seenHalo.position.set(fd.pos[0], fd.pos[1] + 0.7, fd.pos[2]);
  seenHalo.visible = false;
  scene.add(seenHalo);

  floaters.push({ mesh, aura, ring, fShadow, seenHalo, color:fd.color, message:fd.msg, baseY:fd.pos[1], phase:Math.random()*Math.PI*2, rotSpeed:(Math.random()-0.5)*0.02+0.015, texType:fd.tex });
});

// Shared floater light pools — a fixed handful of lights repositioned each frame to the nearest
// floaters (see the loop), instead of one light per object. This keeps NUM_*_LIGHTS — and so the
// per-pixel shading cost (the dominant cost when panning) and the renderer.compile() time — low.
// Sizing is visually safe: floaters are 11+ units apart and a floater light reaches only ~4.5
// units, so the nearest few read identically to per-floater lights. Desktop also pools real
// SpotLights for the beam floor-splash; mobile keeps its cheaper textured floor discs (spot pool
// stays empty there). These are the one tuning knob if more GPU headroom is ever needed.
const FLOATER_POINT_POOL = isMobile ? 3 : 4;
const FLOATER_SPOT_POOL  = isMobile ? 0 : 4;
const _poolLights = [];
for (let i = 0; i < FLOATER_POINT_POOL; i++) {
  const pl = new THREE.PointLight(0xffffff, 0, 4.5, 2);
  scene.add(pl);
  _poolLights.push(pl);
}
const _poolSpots = [];
for (let i = 0; i < FLOATER_SPOT_POOL; i++) {
  const sp = new THREE.SpotLight(0xffffff, 0, 18, Math.PI / 11, 0.25, 1.5);
  sp.position.set(0, 13, 0);
  scene.add(sp); scene.add(sp.target);
  _poolSpots.push(sp);
}
// Reusable nearest-floater list for the pools — refilled allocation-free each frame.
const _poolNearest = new Array(Math.max(_poolLights.length, _poolSpots.length)).fill(null);

// ── DARK ROOM INITIAL STATE ──
// All floaters start invisible; the beam + reveal animation will bring them in
floaters.forEach(f => {
  f.mesh.material.emissiveIntensity = 0;
  f.aura.material.opacity = 0;
  f.ring.material.opacity = 0;
});

// Volumetric-cone opacity for the soft additive glow that sells each beam shape (restored
// to the original single-file value; the brightness now comes from real SpotLights again).
const BEAM_CONE_OPACITY = 0.045;

// ── BEAM OF LIGHT on first floater (octahedron) ──
const beamLight = new THREE.SpotLight(0xfff5d0, 6.0, 18, Math.PI / 11, 0.25, 1.5);
beamLight.position.set(0, 9, 0);
beamLight.target.position.set(0, 0.5, 0);
scene.add(beamLight);
scene.add(beamLight.target);

// Volumetric cone — soft additive glow to sell the beam shape
// CylinderGeometry top/bottom radii match spotlight cone at source and floor:
// bottom = distance(9) * tan(PI/11) ≈ 2.64
const beamCone = new THREE.Mesh(
  new THREE.CylinderGeometry(0.05, 2.64, 9, 24, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0xfff8d0, transparent: true, opacity: BEAM_CONE_OPACITY,
    side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false
  })
);
beamCone.position.set(0, 4.5, 0);  // midpoint between source (y=9) and floor (y=0)
scene.add(beamCone);

// ── BEAMS OF LIGHT on remaining floaters (fade in after room reveals) ──
// Every floater gets an always-on volumetric cone (the visible shaft). The real floor-splash light
// is POOLED: desktop drives a few shared SpotLights onto the nearest floaters (so NUM_SPOT_LIGHTS
// stays small); mobile uses a textured floor disc and no per-floater spot. Only the central
// octahedron keeps its own dedicated SpotLight (beamLight, above).
const BEAM_FLOOR_SPOT_OPACITY = 0.28; // mobile floor-disc brightness
floaters.forEach((f, i) => {
  if (i === 0) return; // first floater's beam already created above
  const px = floaterData[i].pos[0], pz = floaterData[i].pos[2];
  const col = floaterData[i].color;
  const cone = new THREE.Mesh(
    // bottom = distance(13) * tan(PI/11) ≈ 3.82
    new THREE.CylinderGeometry(0.05, 3.82, 13, isMobile ? 12 : 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: 0,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  cone.position.set(px, 6.5, pz);
  scene.add(cone);
  f.beamCone = cone;
  // Desktop's per-floater beam floor-splash now comes from the shared SpotLight pool (the nearest
  // few floaters get a real spot). Mobile keeps its cheap textured floor disc.
  if (isMobile) {
    const floorSpot = new THREE.Mesh(
      new THREE.CircleGeometry(3.55, 24),
      new THREE.MeshBasicMaterial({
        map: _floaterSpotTex, color: col, transparent: true, opacity: 0,
        depthWrite: false, depthTest: true, blending: THREE.NormalBlending
      })
    );
    floorSpot.rotation.x = -Math.PI / 2;
    floorSpot.position.set(px, 0.003, pz);
    floorSpot.renderOrder = 1;
    scene.add(floorSpot);
    f.floorSpot = floorSpot;
  }
});

let roomRevealed = false;
let revealT = 0; // 0 = fully dark, 1 = fully lit

// Exhibition state
let exhibitOpen   = false;
let exhibitPhase  = null;    // 'opening' | 'open' | 'closing' | null
let exhibitT      = 0;
let exhibitPlanes = null;
let exhibitPanelN = 0;       // photo count + info card
let exhibitAngle  = 0;       // current orbit angle (radians)
let exhibitCX     = 0;       // orbit centre X (player pos at trigger)
let exhibitCZ     = 0;       // orbit centre Z

const EXHIBIT_OPEN_DUR  = 0.55;
const EXHIBIT_CLOSE_DUR = 0.35;
const EXHIBIT_W         = 3.6;   // landscape 4:3
const EXHIBIT_H         = 2.7;
const FRAME_BORDER      = 0.12;  // world-unit overhang of frame plane beyond image edges
// Sleek reveal: panels fade in (opacity 0→1) with a subtle scale SETTLE from this start
// scale, instead of ballooning up from near-zero. Cheap (opacity+scale writes only) and
// reads far smoother. Gentle per-panel stagger gives an elegant cascade.
const EXHIBIT_OPEN_SCALE0 = 0.9;
const EXHIBIT_STAGGER   = [0.0, 0.05, 0.10, 0.15, 0.20, 0.25];
const EXHIBIT_ORBIT_R    = 4.5;   // radius of the orbit circle
const EXHIBIT_ORBIT_R2   = EXHIBIT_ORBIT_R * EXHIBIT_ORBIT_R;
const EXHIBIT_ORBIT_SPD  = 0.04;  // radians/second (one lap ≈ 157 s)
const EXHIBIT_FOCUS_DUR  = 0.62;
const EXHIBIT_FOCUS_SWITCH_DUR = 0.48;
const EXHIBIT_FOCUS_CAM_DIST = isMobile ? 1.18 : 1.32; // distance from camera — fills the viewport
const EXHIBIT_FOCUS_FILL = 0.94;
const EXHIBIT_TRIGGER_R  = 2.8;
const EXHIBIT_TRIGGER_R2 = EXHIBIT_TRIGGER_R * EXHIBIT_TRIGGER_R;
const EXHIBIT_LEAVE_R    = 6;  // auto-close only — must walk further out than interact radius
const EXHIBIT_LEAVE_R2   = EXHIBIT_LEAVE_R * EXHIBIT_LEAVE_R;
const EXHIBIT_PRELOAD_R  = 9;  // start loading an exhibit's photos when the player gets this close
const EXHIBIT_PRELOAD_R2 = EXHIBIT_PRELOAD_R * EXHIBIT_PRELOAD_R;
const FOG_BASE           = 0.032;
let exhibitTriggerFloater = null;
let exhibitFocusIdx    = -1;
let exhibitFocusPhase  = null;   // 'focusing' | 'focused' | 'switching' | 'unfocusing'
let exhibitFocusSwitchTo = -1;
let exhibitFocusT      = 0;
let focusDimT          = 0;
let _exhibitNavLWas    = false;
let _exhibitNavRWas    = false;
let _crateNavUpWas     = false;
let _crateNavDnWas     = false;
let _exhibitSwipeAcc   = 0;

// Shared exhibition timing/positioning (used by core + multiple exhibition modules
// via core.OPEN_DUR / core.CLOSE_DUR / core.CRATE_DIST). Crate-specific constants,
// state, and scratch live in js/exhibits/vinyl-crate.js.
const CRATE_OPEN_DUR     = 0.5;
const CRATE_CLOSE_DUR    = 0.35;
const CRATE_DIST         = 3.2;   // distance in front of player an exhibition opens

// ══════════════════════════════════════════
//  INPUT
// ══════════════════════════════════════════
const keys = {};
const keyUIMap = { KeyW:'key-w', KeyA:'key-a', KeyS:'key-s', KeyD:'key-d', ArrowLeft:'key-left', ArrowRight:'key-right', Space:'key-space' };
document.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') e.preventDefault();
  if (!isMobile && e.code === 'Escape' && activeExhibit) e.preventDefault();
  keys[e.code] = true;
  if (keyUIMap[e.code]) document.getElementById(keyUIMap[e.code])?.classList.add('active');
});
document.addEventListener('keyup', e => {
  keys[e.code] = false;
  if (keyUIMap[e.code]) document.getElementById(keyUIMap[e.code])?.classList.remove('active');
});

let yaw = 0;
const CAM_TURN = 2.2; // radians per second

let tX = 0, tLookId = -1;
const _tutTX = {}; // separate touch-X tracking for tutorial (before main listener mutates tX)
renderer.domElement.addEventListener('touchstart', e => {
  for (const t of e.changedTouches)
    if (t.clientX > window.innerWidth * 0.4 && tLookId === -1) {
      tX = t.clientX; tLookId = t.identifier;
      _tutTX[t.identifier] = t.clientX;
      _exhibitSwipeAcc = 0;
    }
});
renderer.domElement.addEventListener('touchmove', e => {
  if (exhibitPhase === 'open') {
    if (exhibitFocusPhase === 'focused') {
      for (const t of e.changedTouches) {
        if (t.identifier === tLookId) {
          _exhibitSwipeAcc += (t.clientX - tX);
          tX = t.clientX;
          if (_exhibitSwipeAcc < -55) { _exhibitFocusStep(1); _exhibitSwipeAcc = 0; }
          else if (_exhibitSwipeAcc > 55) { _exhibitFocusStep(-1); _exhibitSwipeAcc = 0; }
        }
      }
      return;
    }
    if (exhibitFocusPhase) return;
  }
  for (const t of e.changedTouches)
    if (t.identifier === tLookId) { yaw -= (t.clientX - tX) * 0.003; tX = t.clientX; }
});
renderer.domElement.addEventListener('touchend',    e => { for (const t of e.changedTouches) if (t.identifier === tLookId) tLookId = -1; });
renderer.domElement.addEventListener('touchcancel', e => { for (const t of e.changedTouches) if (t.identifier === tLookId) tLookId = -1; });

// Virtual joystick
const _joy = { active: false, id: -1, dx: 0, dy: 0 };
const JR = 60;
const _jZone  = document.getElementById('joystick-zone');
const _jKnob  = document.getElementById('joystick-knob');

_jZone.addEventListener('touchstart', e => {
  e.preventDefault(); e.stopPropagation();
  const t = e.changedTouches[0];
  _joy.active = true; _joy.id = t.identifier; _joy.dx = 0; _joy.dy = 0;
  _joy.rect = _jZone.getBoundingClientRect(); // cache once per gesture
}, { passive: false });

_jZone.addEventListener('touchmove', e => {
  e.preventDefault();
  const r = _joy.rect || _jZone.getBoundingClientRect();
  for (const t of e.changedTouches) {
    if (t.identifier !== _joy.id) continue;
    let dx = t.clientX - (r.left + r.width  / 2);
    let dy = t.clientY - (r.top  + r.height / 2);
    const len = Math.sqrt(dx*dx + dy*dy);
    if (len > JR) { dx = dx/len*JR; dy = dy/len*JR; }
    _joy.dx = dx; _joy.dy = dy;
    _jKnob.style.transform = `translate(${dx}px,${dy}px)`;
  }
}, { passive: false });

const _endJoy = e => {
  for (const t of e.changedTouches) if (t.identifier === _joy.id) {
    _joy.active = false; _joy.dx = 0; _joy.dy = 0; _jKnob.style.transform = '';
  }
};
_jZone.addEventListener('touchend',    _endJoy);
_jZone.addEventListener('touchcancel', _endJoy);

// Tap to interact — quick touch with minimal movement fires KeyE
const _tapStarts = {};
renderer.domElement.addEventListener('touchstart', e => {
  for (const t of e.changedTouches)
    _tapStarts[t.identifier] = { x: t.clientX, y: t.clientY, t: Date.now() };
});
renderer.domElement.addEventListener('touchend', e => {
  for (const t of e.changedTouches) {
    const s = _tapStarts[t.identifier];
    if (!s) continue;
    delete _tapStarts[t.identifier];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Date.now() - s.t < 280 && dx*dx + dy*dy < 225) {
      // A tap on the focused info-card's @handle opens the profile instead of unfocusing.
      if (exhibitFocusPhase === 'focused' && _tryOpenExhibitLink(t.clientX, t.clientY)) continue;
      keys['KeyE'] = true;
      setTimeout(() => { keys['KeyE'] = false; }, 120);
    }
  }
});
renderer.domElement.addEventListener('touchcancel', e => {
  for (const t of e.changedTouches) delete _tapStarts[t.identifier];
});

// ══════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════
let toastTimer = null;
let _toastSwapTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  clearTimeout(toastTimer);
  clearTimeout(_toastSwapTimer);
  const wasVisible = el.classList.contains('visible');
  el.classList.remove('visible');
  _toastSwapTimer = setTimeout(() => {
    el.textContent = msg;
    // Double rAF: first frame commits layout at new text height,
    // second frame begins the opacity transition from a stable position.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.add('visible');
      toastTimer = setTimeout(() => el.classList.remove('visible'), 3800);
    }));
  }, wasVisible ? 460 : 20);
}

// ══════════════════════════════════════════
//  TUTORIAL
// ══════════════════════════════════════════
const _tutOverlay  = document.getElementById('tut-overlay');
const _tutStep     = document.getElementById('tut-step');
const _tutMsg      = document.getElementById('tut-msg');
const _tutHint     = document.getElementById('tut-hint');
const _tutGuideDot = document.getElementById('tut-guide-dot');

let tutStage = 0; // 0=swipe-right, 1=swipe-left, 2=move, 3=walk-to-shape, 4=interact, 5=done

function _tutDismiss() {
  _tutOverlay.classList.add('hidden');
  setTimeout(() => {
    _tutOverlay.style.display = 'none';
    _tutOverlay.classList.remove('tut-top');
  }, 550);
  document.getElementById('key-space')?.classList.remove('tut-highlight');
  _tutGuideDot.classList.remove('visible');
  tutStage = 5;
  // Free the preview renderer and all scene resources
  if (_tutPreview) {
    _tutPreview.scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        if (obj.material.emissiveMap) obj.material.emissiveMap.dispose();
        obj.material.dispose();
      }
    });
    _tutPreview.renderer.dispose();
    _tutPreview = null;
  }
}

function _tutShow(stage) {
  tutStage = stage;
  _tutStep.textContent = `Step ${stage + 1} of 5`;
  document.getElementById('key-space')?.classList.remove('tut-highlight');
  _tutGuideDot.classList.remove('visible');
  _tutOverlay.classList.remove('tut-top');

  const _gdotBall = _tutGuideDot.querySelector('.tut-gdot-ball');
  // Force reflow so removing+re-adding 'visible' actually restarts child animations
  void _tutGuideDot.offsetWidth;
  if (stage === 0) {
    _tutMsg.textContent = isMobile ? 'Swipe the orb right to rotate your view' : 'Press → to rotate your view';
    _tutHint.innerHTML = isMobile
      ? `<div style="display:flex;align-items:center;gap:10px;color:rgba(255,200,100,0.8)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="22" height="22"><path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.258a1 1 0 01-1.447.894L15 14"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M5 12h14M14 7l5 5-5 5"/></svg>
        </div>`
      : `<div style="display:flex;align-items:center;gap:8px;color:rgba(255,200,100,0.8)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="22" height="22"><path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.258a1 1 0 01-1.447.894L15 14"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>
          <div class="tut-k" style="width:36px;height:36px;font-size:16px;animation:tut-pulse 1.3s ease-in-out infinite">→</div>
        </div>`;
    if (isMobile) { _gdotBall.classList.remove('swipe-left'); void _tutGuideDot.offsetWidth; _tutGuideDot.classList.add('visible'); }
  } else if (stage === 1) {
    _tutMsg.textContent = isMobile ? 'Now swipe left to rotate the other way' : 'Press ← to rotate the other way';
    _tutHint.innerHTML = isMobile
      ? `<div style="display:flex;align-items:center;gap:10px;color:rgba(255,200,100,0.8)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M19 12H5M10 17l-5-5 5-5"/></svg>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="22" height="22"><path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.258a1 1 0 01-1.447.894L15 14"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>
        </div>`
      : `<div style="display:flex;align-items:center;gap:8px;color:rgba(255,200,100,0.8)">
          <div class="tut-k" style="width:36px;height:36px;font-size:16px;animation:tut-pulse 1.3s ease-in-out infinite">←</div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="22" height="22"><path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.258a1 1 0 01-1.447.894L15 14"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>
        </div>`;
    if (isMobile) { _gdotBall.classList.add('swipe-left'); void _tutGuideDot.offsetWidth; _tutGuideDot.classList.add('visible'); }
  } else if (stage === 2) {
    _tutMsg.textContent = isMobile ? 'Use the joystick to walk' : 'Use WASD to move';
    if (isMobile) _jZone.classList.add('visible');
    _tutHint.innerHTML = isMobile
      ? `<div class="tut-joy"><div class="tut-joy-knob"></div></div>`
      : `<div class="tut-wasd"><div class="tut-wasd-row"><div class="tut-k">W</div></div><div class="tut-wasd-row"><div class="tut-k">A</div><div class="tut-k">S</div><div class="tut-k">D</div></div></div>`;
  } else if (stage === 3) {
    _tutMsg.textContent = 'Move towards the Octahedron ahead of you';
    _tutHint.innerHTML = `<canvas id="tut-shape-canvas" width="72" height="72" style="border-radius:10px;"></canvas>`;
    _tutOverlay.classList.add('tut-top');
    _initTutPreview();
  } else if (stage === 4) {
    _tutMsg.textContent = isMobile ? 'Tap the object to interact' : 'Press Space to interact';
    _tutHint.innerHTML = isMobile
      ? ``
      : `<div class="tut-k" style="width:auto;height:36px;padding:0 12px;font-size:12px;animation:tut-interact-anim 1.3s ease-in-out infinite;box-shadow:0 0 0 0 rgba(255,180,60,0.55),0 0 18px rgba(255,180,60,0.4)">space</div>`;
    if (!isMobile) document.getElementById('key-space')?.classList.add('tut-highlight');
    _tutOverlay.classList.add('tut-top');
  }
}

// Track look direction — stage 0: arrow right, stage 1: arrow left (desktop)
document.addEventListener('keydown', e => {
  if (tutStage === 0 && e.code === 'ArrowRight') _tutShow(1);
  if (tutStage === 1 && e.code === 'ArrowLeft')  _tutShow(2);
});
// Tutorial touch tracking uses _tutTX (independent of main listener's tX)
renderer.domElement.addEventListener('touchmove', e => {
  if (tutStage === 0 || tutStage === 1) {
    for (const t of e.changedTouches) {
      if (t.identifier === tLookId && _tutTX[t.identifier] !== undefined) {
        const dx = t.clientX - _tutTX[t.identifier];
        if (tutStage === 0 && dx >  8) _tutShow(1);
        if (tutStage === 1 && dx < -8) _tutShow(2);
        _tutTX[t.identifier] = t.clientX;
      }
    }
  }
}, { passive: true });

// Mini preview renderer for tutorial step 3 (octahedron)
let _tutPreview = null;
function _initTutPreview() {
  if (_tutPreview) return;
  const canvas = document.getElementById('tut-shape-canvas');
  if (!canvas) return;
  const pr = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  pr.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  pr.setSize(72, 72);
  const ps = new THREE.Scene();
  const pc = new THREE.PerspectiveCamera(42, 1, 0.1, 10);
  pc.position.set(0, 0.15, 2.2);
  pc.lookAt(0, 0, 0);
  ps.add(new THREE.AmbientLight(0xffdd88, 0.55));
  const pl = new THREE.PointLight(0xff8800, 4.5, 6);
  pl.position.set(1.2, 1.2, 2);
  ps.add(pl);
  // Main mesh — same material as the in-room floater
  const pm = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.62),
    new THREE.MeshPhysicalMaterial({
      color: 0xffcc44, emissive: 0xff8800, emissiveIntensity: 1.8,
      emissiveMap: makeFloaterTex('rune'),
      roughness: 0.12, metalness: 0.55,
      clearcoat: 0.45, clearcoatRoughness: 0.15
    })
  );
  ps.add(pm);
  // Aura shell
  const aura = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.62),
    new THREE.MeshBasicMaterial({
      color: 0xffcc44, transparent: true, opacity: 0.12,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  aura.scale.setScalar(1.22);
  ps.add(aura);
  // Orbit ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.62 + 0.19, 0.011, 6, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffcc44, transparent: true, opacity: 0.36,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  ring.rotation.x = 1.1;
  ring.rotation.z = 0.4;
  ps.add(ring);
  _tutPreview = { renderer: pr, scene: ps, camera: pc, mesh: pm, aura, ring };
}
function _tickTutPreview() {
  if (!_tutPreview || tutStage !== 3) return;
  _tutPreview.mesh.rotation.y += 0.022;
  _tutPreview.mesh.rotation.x += 0.009;
  _tutPreview.aura.rotation.copy(_tutPreview.mesh.rotation);
  _tutPreview.ring.rotation.y += 0.015;
  _tutPreview.ring.rotation.z += 0.009;
  _tutPreview.renderer.render(_tutPreview.scene, _tutPreview.camera);
}

// Direct-link shortcut: ?goto=crate skips tutorial and teleports to the vinyl crate
const _PARAMS = new URLSearchParams(location.search);
if (_PARAMS.get('goto') === 'crate') {
  _tutOverlay.style.opacity = '0';
  tutStage = 5;
  _tutGuideDot.classList.remove('visible');
  roomRevealed = true;
  const _cf = floaterData[3];   // the vinyl crate's floater (see js/exhibits/vinyl-crate.js)
  player.position.set(_cf.pos[0], 0, _cf.pos[2] + 3);
  yaw = Math.PI;
} else {
  setTimeout(() => _tutShow(0), 900);
}

// ══════════════════════════════════════════
//  WELCOME CARD (first room open)
// ══════════════════════════════════════════
const _welcomeOverlay = document.getElementById('welcome-overlay');
const _welcomeBody     = document.getElementById('welcome-body');
const _welcomeDismiss   = document.getElementById('welcome-dismiss');
let _welcomeOpen = false;

function _onWelcomeKey(e) {
  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') _dismissWelcome();
}
function _onWelcomeTap() { _dismissWelcome(); }

function _dismissWelcome() {
  if (!_welcomeOpen) return;
  _welcomeOpen = false;
  // Re-arm the DPR governor's settle window (it was paused while the card was open) so it judges
  // fresh post-dismiss frames rather than the residual reveal burst. _emaReset is left alone — it's
  // a one-shot already spent on the cold-start settle.
  _warmupUntil = performance.now() + 700;
  _emaFrameMs  = 1000 / 60;
  _welcomeOverlay.classList.add('hidden');
  document.removeEventListener('keydown', _onWelcomeKey);
  renderer.domElement.removeEventListener('pointerdown', _onWelcomeTap);
  renderer.domElement.removeEventListener('touchend', _onWelcomeTap);
  _disposeWelcomeFloaters();
  // Absorb the dismissing Space/Esc/tap so the loop's interaction dispatch
  // doesn't read the same press as a re-open of the central floater.
  iCD = 0.5;
}

function showWelcomeCard() {
  const _divider = `<canvas id="welcome-floaters-canvas"></canvas>`;
  _welcomeBody.innerHTML = isMobile
    ? `<p>You're inside the Yaqeen digital exhibition: a quiet, explorable gallery.</p>
       <p>Drift up to any glowing object or spotlight and <b>tap</b> it to open its exhibit.</p>
       ${_divider}
       <p>Inside, <b>swipe</b> to move between pieces and play any media.</p>
       <p><b>Tap away</b> or drift off to step back into the room.</p>`
    : `<p>You're inside the Yaqeen digital exhibition: a quiet, explorable gallery.</p>
       <p>Drift up to any glowing object or spotlight and press <b>Space</b> to open its exhibit.</p>
       ${_divider}
       <p>Inside, <b>read the on screen instructions</b> for how to view pieces and play any media.</p>
       <p>Press <b>Esc</b> or simply drift away to step back into the room.</p>`;
  _welcomeDismiss.textContent = isMobile ? 'Tap to begin' : 'Press Space to begin';
  _welcomeOverlay.classList.remove('hidden');
  _welcomeOpen = true;
  // Build the mini-floater divider once the card has laid out (so the canvas has a width).
  requestAnimationFrame(() => { if (_welcomeOpen) _initWelcomeFloaters(); });
  // Attach dismissal listeners after a beat so the same Space/tap that opened
  // the card doesn't immediately close it.
  setTimeout(() => {
    if (!_welcomeOpen) return;
    document.addEventListener('keydown', _onWelcomeKey);
    renderer.domElement.addEventListener('pointerdown', _onWelcomeTap);
    renderer.domElement.addEventListener('touchend', _onWelcomeTap);
  }, 400);
}

// Mini live renders of the 9 floater geometries, laid out in a row as a divider strip
// inside the welcome card. Reuses the shared floaterData geometries (NOT disposed here) and
// builds its own disposable emissive materials/textures — mirrors _initTutPreview.
let _welcomeFloaters = null;
function _initWelcomeFloaters() {
  if (_welcomeFloaters) return;
  const canvas = document.getElementById('welcome-floaters-canvas');
  if (!canvas) return;
  const w = canvas.clientWidth || 280, h = 46;
  const pr = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  pr.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  pr.setSize(w, h, false); // CSS controls display size; only the drawing buffer is set
  const ps = new THREE.Scene();
  const aspect = w / h;
  const halfH = 0.62, halfW = halfH * aspect;
  const pc = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 10);
  pc.position.set(0, 0, 4);
  ps.add(new THREE.AmbientLight(0xffdd88, 0.6));
  const pl = new THREE.PointLight(0xffaa55, 6, 20);
  pl.position.set(2, 3, 5);
  ps.add(pl);

  const n = floaterData.length;
  const spacing = (halfW * 2) / n;
  const targetR = spacing * 0.38;
  const meshes = [], mats = [];
  floaterData.forEach((fd, i) => {
    fd.geo.computeBoundingSphere();
    const r = (fd.geo.boundingSphere && fd.geo.boundingSphere.radius) || 0.3;
    const mat = new THREE.MeshStandardMaterial({
      color: fd.color, emissive: fd.em, emissiveIntensity: 1.5,
      emissiveMap: makeFloaterTex(fd.tex), roughness: 0.12, metalness: 0.55
    });
    const mesh = new THREE.Mesh(fd.geo, mat);
    mesh.scale.setScalar(targetR / r);
    mesh.position.x = -halfW + spacing * (i + 0.5);
    mesh.rotation.set(i * 0.7, i, 0); // varied start angles
    ps.add(mesh);
    meshes.push(mesh); mats.push(mat);
  });
  _welcomeFloaters = { renderer: pr, scene: ps, camera: pc, meshes, mats };
}
function _tickWelcomeFloaters() {
  if (!_welcomeFloaters || !_welcomeOpen) return;
  for (const m of _welcomeFloaters.meshes) { m.rotation.y += 0.012; m.rotation.x += 0.005; }
  _welcomeFloaters.renderer.render(_welcomeFloaters.scene, _welcomeFloaters.camera);
}
function _disposeWelcomeFloaters() {
  if (!_welcomeFloaters) return;
  // Geometries belong to floaterData / the main scene — never dispose them here.
  _welcomeFloaters.mats.forEach(m => { m.emissiveMap?.dispose(); m.dispose(); });
  _welcomeFloaters.renderer.dispose();
  _welcomeFloaters = null;
}

// ══════════════════════════════════════════
//  PARTICLE TRAIL
// ══════════════════════════════════════════
const MAX_P = 90;
const pPos = new Float32Array(MAX_P*3);
const pBuf = new THREE.BufferGeometry();
pBuf.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
scene.add(new THREE.Points(pBuf, new THREE.PointsMaterial({ color:0xff9933, size:0.09, transparent:true, opacity:0.42, sizeAttenuation:true, depthWrite:false })));
const pData = Array.from({length:MAX_P}, () => ({x:0,y:0,z:0,life:0}));
let pIdx=0, spawnAcc=0, _pAny=false;

function spawnP(x,z) {
  const p = pData[pIdx++%MAX_P];
  p.x=x+(Math.random()-0.5)*0.3; p.y=0.05+Math.random()*0.18; p.z=z+(Math.random()-0.5)*0.3; p.life=1;
  _pAny=true;
}
function tickP(dt) {
  if (!_pAny) return; // nothing alive — skip the 90-iter loop + buffer upload while standing still
  let anyActive = false;
  for(let i=0;i<MAX_P;i++){
    const p=pData[i];
    if(p.life>0){anyActive=true;p.life-=dt*0.72;p.y+=dt*0.07;}
    pPos[i*3]=p.life>0?p.x:9999; pPos[i*3+1]=p.y; pPos[i*3+2]=p.z;
  }
  pBuf.attributes.position.needsUpdate=true; // ran this frame (decay or the final fade-out write)
  _pAny=anyActive;
}

// ══════════════════════════════════════════
//  LOOP
// ══════════════════════════════════════════
const clock = new THREE.Clock();
const SPEED=4.2, BOUND=15;
let eWas=false, escWas=false, iCD=0;
const near={ref:null,dist:Infinity};
const _fwd = new THREE.Vector3();
const _rgt = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _ndcCenter = new THREE.Vector2(0, 0);
const _panelWp = new THREE.Vector3();
const _focusFromPos = new THREE.Vector3();
const _focusToPos = new THREE.Vector3();
const _focusFromQuat = new THREE.Quaternion();
const _focusToQuat = new THREE.Quaternion();
const _focusLerpQuat = new THREE.Quaternion();
const _focusHelper = new THREE.Object3D();
const _focusBasis = new THREE.Matrix4();
const _camLookDir = new THREE.Vector3();
let _focusFromScale = 1;
let _focusToScale = 1;
const _slideCenterPos = new THREE.Vector3();
const _slideCenterQuat = new THREE.Quaternion();
const _slideToQuat = new THREE.Quaternion();
const _slideOff = new THREE.Vector3();
let _slideFromScale = 1;
let _slideToScale = 1;
const _exhibitRayMeshes = [];
// Shared scratch for per-frame world→screen projections (prompt + guide dot) — avoids
// allocating a Vector3 every frame.
const _projTmp = new THREE.Vector3();

function _syncCamera() {
  const camX = player.position.x - Math.sin(yaw) * 4.6;
  const camZ = player.position.z - Math.cos(yaw) * 4.6;
  camera.position.lerp(_camTarget.set(camX, player.position.y + 3.05, camZ), 0.1);
  camera.lookAt(player.position.x, player.position.y + 1.9, player.position.z);
  camera.updateMatrixWorld();
}

function _exhibitPanelAngle(i) {
  return exhibitAngle + i * (Math.PI * 2 / exhibitPanelN);
}

function _exhibitFocusScale(panelW, panelH) {
  const dist = EXHIBIT_FOCUS_CAM_DIST;
  const vFov = (camera.fov * Math.PI) / 180;
  const visibleH = 2 * dist * Math.tan(vFov / 2);
  const visibleW = visibleH * camera.aspect;
  return Math.min(
    (visibleW * EXHIBIT_FOCUS_FILL) / panelW,
    (visibleH * EXHIBIT_FOCUS_FILL) / panelH
  );
}

function _computeExhibitFocusTarget(outPos, outQuat, panelW, panelH) {
  camera.getWorldDirection(_camLookDir);
  outPos.copy(camera.position).addScaledVector(_camLookDir, EXHIBIT_FOCUS_CAM_DIST);
  // Build a proper right-handed basis matching the camera's own axes so the panel
  // sits flush with the viewport. right × up = backward (det=+1); negating right
  // would flip the handedness to -1, breaking setFromRotationMatrix.
  _rgt.setFromMatrixColumn(camera.matrixWorld, 0);
  _fwd.setFromMatrixColumn(camera.matrixWorld, 1);
  _panelWp.copy(_camLookDir).negate();
  _focusBasis.makeBasis(_rgt, _fwd, _panelWp);
  outQuat.setFromRotationMatrix(_focusBasis);
  return _exhibitFocusScale(panelW, panelH);
}


function _applyExhibitFocusView(mesh) {
  mesh.position.copy(_focusToPos);
  mesh.quaternion.copy(_focusToQuat);
  mesh.scale.setScalar(_focusToScale);
  mesh.renderOrder = 200;
}

function _captureExhibitFocusFrom(mesh) {
  mesh.getWorldPosition(_focusFromPos);
  _focusFromQuat.copy(mesh.quaternion);
  _focusFromScale = mesh.scale.x;
}

function _refreshExhibitFocusTarget(mesh) {
  const geo = mesh.geometry.parameters;
  _focusToScale = _computeExhibitFocusTarget(_focusToPos, _focusToQuat, geo.width, geo.height);
}

function _applyExhibitPanelTransform(p, i, orbitAngle) {
  const a = orbitAngle + i * (Math.PI * 2 / exhibitPanelN);
  p.mesh.position.x = exhibitCX + Math.sin(a) * EXHIBIT_ORBIT_R;
  p.mesh.position.y = 2.0;
  p.mesh.position.z = exhibitCZ + Math.cos(a) * EXHIBIT_ORBIT_R;
  // Use rotation.set to explicitly zero X and Z axes so no residual tilt from
  // the focus slerp animation carries over into the orbit state.
  p.mesh.rotation.set(0, a + Math.PI, 0);
}

function _exhibitStep(dir) {
  if (!exhibitPlanes || exhibitPhase !== 'open' || exhibitFocusPhase || exhibitPanelN < 2) return;
  exhibitAngle += dir * (Math.PI * 2 / exhibitPanelN);
}

function _exhibitFocusStep(dir) {
  if (!exhibitPlanes || exhibitFocusPhase !== 'focused' || exhibitPanelN < 2) return;
  const toIdx = (exhibitFocusIdx + dir + exhibitPanelN) % exhibitPanelN;
  exhibitFocusSwitchTo = toIdx;
  exhibitFocusPhase = 'switching';
  exhibitFocusT = 0;
  exhibitAngle += dir * (Math.PI * 2 / exhibitPanelN);

  const fromMesh = exhibitPlanes[exhibitFocusIdx].mesh;
  const toMesh = exhibitPlanes[toIdx].mesh;
  _syncCamera();
  const fromGeo = fromMesh.geometry.parameters;
  _computeExhibitFocusTarget(_slideCenterPos, _slideCenterQuat, fromGeo.width, fromGeo.height);
  _slideFromScale = fromMesh.scale.x;
  const toGeo = toMesh.geometry.parameters;
  _slideToScale = _exhibitFocusScale(toGeo.width, toGeo.height);
  _slideToQuat.copy(_slideCenterQuat);
  _rgt.setFromMatrixColumn(camera.matrixWorld, 0);
  _slideOff.copy(_rgt).multiplyScalar(2.6 * dir);

  fromMesh.visible = true;
  toMesh.visible = true;
  fromMesh.renderOrder = 200;
  toMesh.renderOrder = 201;
  exhibitPlanes.forEach((p, i) => {
    if (i !== exhibitFocusIdx && i !== toIdx) p.mesh.visible = false;
  });
}

function _hideExhibitNav() {
  _elExhibitPrev?.classList.remove('visible');
  _elExhibitNext?.classList.remove('visible');
}

function _showExhibitFocusNav() {
  if (exhibitPanelN < 2) return;
  _elExhibitPrev?.classList.add('visible');
  _elExhibitNext?.classList.add('visible');
}

const _exhPanWrap  = document.getElementById('exh-pan-wrap');
const _exhPanGuide = document.getElementById('exh-pan-guide');
let _exhPanGuideOn = false;
let _exhPanGuideYaw0 = 0;
let _exhPanGuideTimer = null;
let _exhPanGuideAltTimer = null;

function _hideExhibitPanGuide() {
  clearTimeout(_exhPanGuideTimer);
  clearInterval(_exhPanGuideAltTimer);
  _exhPanGuideTimer = null;
  _exhPanGuideAltTimer = null;
  _exhPanWrap.classList.remove('visible');
  _exhPanGuideOn = false;
}

function _showExhibitPanGuide() {
  if (!isMobile || exhibitPanelN < 2 || exhibitFocusPhase) return;
  clearTimeout(_exhPanGuideTimer);
  clearInterval(_exhPanGuideAltTimer);
  const ball = _exhPanGuide.querySelector('.tut-gdot-ball');
  ball.classList.remove('swipe-left');
  void _exhPanWrap.offsetWidth;
  _exhPanWrap.classList.add('visible');
  _exhPanGuideOn = true;
  _exhPanGuideYaw0 = yaw;
  _exhPanGuideAltTimer = setInterval(() => {
    ball.classList.toggle('swipe-left');
    void _exhPanWrap.offsetWidth;
  }, 3500);
  _exhPanGuideTimer = setTimeout(_hideExhibitPanGuide, 12000);
}

function _showExhibitHint() {
  _elFocusEscapeHint.innerHTML = isMobile
    ? `<span class="feh-label">tap to focus</span>`
    : `<span class="feh-key">spc</span><span class="feh-label">focus</span><span class="feh-key">esc</span><span class="feh-label">close</span>`;
  _elFocusEscapeHint.classList.remove('dim');
  _elFocusEscapeHint.classList.add('visible');
  clearTimeout(_focusEscapeTimer);
  _focusEscapeTimer = setTimeout(() => _elFocusEscapeHint.classList.add('dim'), 7000);
  if (exhibitPanelN >= 2) {
    _elExhibitPrev?.classList.add('visible');
    _elExhibitNext?.classList.add('visible');
    _showExhibitPanGuide();
  } else {
    _hideExhibitNav();
    _hideExhibitPanGuide();
  }
}

function _playerInExhibitOrbit() {
  const dx = player.position.x - exhibitCX;
  const dz = player.position.z - exhibitCZ;
  return dx * dx + dz * dz <= EXHIBIT_ORBIT_R2;
}

function _getAimedExhibitPanelIdx() {
  if (!exhibitPlanes || exhibitPhase !== 'open' || exhibitFocusPhase) return -1;
  if (!_playerInExhibitOrbit()) return -1;

  // Raycast first when a panel crosses the exact reticle
  _exhibitRayMeshes.length = 0;
  exhibitPlanes.forEach(p => {
    if (p.mesh.visible) _exhibitRayMeshes.push(p.mesh);
  });
  if (_exhibitRayMeshes.length) {
    _raycaster.setFromCamera(_ndcCenter, camera);
    const hits = _raycaster.intersectObjects(_exhibitRayMeshes, false);
    if (hits.length) return hits[0].object.userData.exhibitIdx;
  }

  // Inside the orbit: pick the visible panel nearest the screen centre
  const cx = window.innerWidth * 0.5;
  const cy = window.innerHeight * 0.5;
  let bestIdx = -1;
  let bestD2 = Infinity;
  exhibitPlanes.forEach((p, i) => {
    if (!p.mesh.visible) return;
    p.mesh.getWorldPosition(_panelWp);
    _panelWp.project(camera);
    if (_panelWp.z > 1) return;
    const sx = (_panelWp.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-_panelWp.y * 0.5 + 0.5) * window.innerHeight;
    const dx = sx - cx, dy = sy - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; bestIdx = i; }
  });
  return bestIdx;
}

function _startExhibitFocus(idx) {
  if (!exhibitPlanes || idx < 0 || exhibitFocusPhase) return;
  const p = exhibitPlanes[idx];
  exhibitFocusIdx = idx;
  exhibitFocusPhase = 'focusing';
  exhibitFocusSwitchTo = -1;
  exhibitFocusT = 0;
  // Boost to full resolution now — focus is the only place the photo is studied 1:1.
  // (DRS is paused while an exhibit is open, so this DPR stays put until unfocus/close.)
  if (curDPR !== EXHIBIT_DPR) { curDPR = EXHIBIT_DPR; _applyDPR(); }
  _hideFocusEscapeHint();
  _hideExhibitNav();
  _hideExhibitPanGuide();
  _captureExhibitFocusFrom(p.mesh);
}

function _startExhibitUnfocus() {
  if (exhibitFocusPhase !== 'focused') return;
  _hideFocusEscapeHint();
  _hideExhibitNav();
  const p = exhibitPlanes[exhibitFocusIdx];
  _syncCamera();
  _refreshExhibitFocusTarget(p.mesh);
  _focusFromPos.copy(_focusToPos);
  _focusFromQuat.copy(_focusToQuat);
  _focusFromScale = _focusToScale;
  exhibitFocusPhase = 'unfocusing';
  exhibitFocusT = 0;
}

function _resetExhibitFocus() {
  _hideFocusEscapeHint();
  exhibitFocusIdx = -1;
  exhibitFocusPhase = null;
  exhibitFocusSwitchTo = -1;
  exhibitFocusT = 0;
  focusDimT = 0;
  if (exhibitPlanes) {
    exhibitPlanes.forEach(p => { p.mesh.renderOrder = 0; });
  }
}

function _setFloaterVisible(f, visible) {
  if (!f) return;
  f._hidden = !visible;
  f.mesh.visible = visible;
  f.aura.visible = visible;
  f.ring.visible = visible;
  f.fShadow.visible = visible;
  // Pooled floater lights need no per-object toggle: the _hidden flag (set above) excludes this
  // floater from the nearest-light pools, so its share of the pool goes dark on its own.
  if (f.beamCone) f.beamCone.visible = visible;
  if (f.floorSpot) f.floorSpot.visible = visible;
}

function _restoreExhibitFloater() {
  if (exhibitTriggerFloater) {
    _setFloaterVisible(exhibitTriggerFloater, true);
    exhibitTriggerFloater = null;
  }
}

function _dismissExhibit() {
  if (!exhibitPhase || exhibitPhase === 'closing') return;
  if (exhibitFocusPhase) {
    _resetExhibitFocus();
    if (exhibitPlanes) exhibitPlanes.forEach(p => { p.mesh.visible = true; p.mesh.material.opacity = 1; });
  }
  exhibitPhase = 'closing';
  _hideExhibitNav();
  _hideFocusEscapeHint();
  _hideExhibitPanGuide();
  _restoreExhibitFloater();
}


function _leaveExhibitRadius() {
  if (!exhibitTriggerFloater || !activeExhibit) return;
  const fp = exhibitTriggerFloater.mesh.position;
  const ldx = player.position.x - fp.x;
  const ldz = player.position.z - fp.z;
  if (ldx * ldx + ldz * ldz <= EXHIBIT_LEAVE_R2) return;
  // Generic auto-close — the active exhibition supplies its own dismiss().
  activeExhibit.dismiss?.();
}

function _openExhibit(ex, px, pz, openYaw) {
  if (exhibitPhase) return;
  _resetExhibitFocus();
  _loadExhibitTexturesFor(ex); // safety: ensure this exhibit's textures exist if opened early
  // Remember the roaming DPR. The full-resolution boost is applied at FOCUS (where 1:1
  // pixels matter), not here — so the open spin-in doesn't pay a framebuffer realloc, and
  // the orbiting cards (in motion, at distance) render at the cheaper roaming DPR.
  _savedDPR = curDPR;
  exhibitOpen  = true;
  exhibitPhase = 'opening';
  exhibitT     = 0;
  exhibitPanelN = ex.textures.length + 1;
  exhibitAngle = openYaw - (exhibitPanelN - 1) * (Math.PI * 2 / exhibitPanelN);
  exhibitCX    = px;
  exhibitCZ    = pz;
  exhibitTriggerFloater = floaters[ex.floaterIdx];
  _setFloaterVisible(exhibitTriggerFloater, false);
  exhibitPlanes = Array.from({ length: exhibitPanelN }, (_, i) => {
    const a   = exhibitAngle + i * (Math.PI * 2 / exhibitPanelN);
    const tex = i < ex.textures.length ? ex.textures[i] : _ensureCardTex(ex);
    const { w: panelW, h: panelH } = _fitExhibitSize(_texAspect(tex));
    const geo = new THREE.PlaneGeometry(panelW, panelH);
    // toneMapped:false — skip the room's ACES Filmic curve + exposure boost so the
    // photo renders 1:1 with its source pixels (no highlight roll-off / desaturation).
    // Start invisible (opacity 0) + at the settle scale — the 'opening' tick fades them in.
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false, transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.exhibitIdx = i;
    mesh.position.set(px + Math.sin(a) * EXHIBIT_ORBIT_R, 2.0, pz + Math.cos(a) * EXHIBIT_ORBIT_R);
    mesh.rotation.y = a + Math.PI;
    mesh.scale.setScalar(EXHIBIT_OPEN_SCALE0);
    scene.add(mesh);

    // Frame: same size + FRAME_BORDER overhang, sits just behind image plane
    const frameGeo = new THREE.PlaneGeometry(panelW + FRAME_BORDER*2, panelH + FRAME_BORDER*2);
    const frameMat = new THREE.MeshBasicMaterial({
      map: _getExhibitFrameTex(panelW, panelH), transparent: true, side: THREE.DoubleSide,
      depthWrite: false, alphaTest: 0.01, opacity: 0
    });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.position.z = -0.012; // slightly behind in local space
    mesh.add(frameMesh);

    return { mesh, geo, mat, frameGeo, frameMat };
  });
}

function _closeExhibit() {
  _resetExhibitFocus();
  _hideExhibitNav();
  _hideFocusEscapeHint();
  _hideExhibitPanGuide();
  if (exhibitPlanes) {
    exhibitPlanes.forEach(p => {
      scene.remove(p.mesh);
      p.geo.dispose();
      p.mat.dispose();
      p.frameGeo.dispose();
      p.frameMat.dispose();
      // photo textures and frame texture are shared; don't dispose
    });
    exhibitPlanes = null;
  }
  // Restore the pre-exhibit resolution; the adaptive loop re-tunes from here
  curDPR = _savedDPR;
  _applyDPR();
  exhibitOpen  = false;
  exhibitPhase = null;
  exhibitT     = 0;
  _restoreExhibitFloater();
  iCD = 0.6;
}

// ══════════════════════════════════════════
//  VINYL CRATE
// ══════════════════════════════════════════









function _disposeCrateObject(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => m.dispose());
    }
  });
}











// Mobile frame-rate governor (caps to 60fps on high-refresh devices)
let _mobileAcc = 0;
const _MOBILE_TARGET = 1 / 60;
// Per-frame counter for the throttled minimap redraw
let _mmFrame   = 0;
// Cached room-light level — lets the floater beam/spot opacities skip their writes when
// the reveal level is steady (the common case during free roam after reveal completes).
let _lastRoomLight = -1;
// Cached per-frame DOM state — only touch the DOM when the value actually changes.
let _promptLastX = -1, _promptLastY = -1;
let _keySpaceActive = false;

// ── ADAPTIVE RESOLUTION SCALING ──
// Measures the interval between processed frames and nudges the render DPR up/down
// to stay at ~60fps: lower fast when we drop frames, raise gently when steady.
let _lastFrameTs = performance.now();
let _emaFrameMs  = 1000 / 60;
let _drsFrame    = 0;
const _DRS_INTERVAL = 20; // evaluate ~three times per second — corrects a dip quickly
// The first processed frame runs only after shader compile + the deferred floater-texture
// build, so its elapsed interval is huge and would spike the average. Discard that gap and
// hold DPR steady for a short settle window — otherwise the governor misreads the load-in
// as a slow device and drops resolution, and each change reallocates the framebuffer (a
// visible hitch) right as the scene is revealed.
let _firstLoopFrame = true;
let _warmupUntil    = 0;
let _emaReset       = false; // reset the frame-time average once, when the settle window ends
// Re-applying the same pixel ratio + size still reallocates the WebGL drawing
// buffer in most browsers, which shows up as a one-frame hitch. Opening/closing
// an exhibit calls this every time, so skip the resize when nothing actually
// changed (the common case on machines already holding full DPR) to keep the
// spin-in animation smooth.
let _lastAppliedDPR = curDPR;
let _lastAppliedW = window.innerWidth;
let _lastAppliedH = window.innerHeight;
function _applyDPR(force) {
  const w = window.innerWidth, h = window.innerHeight;
  if (!force && curDPR === _lastAppliedDPR && w === _lastAppliedW && h === _lastAppliedH) return;
  _lastAppliedDPR = curDPR;
  _lastAppliedW = w;
  _lastAppliedH = h;
  renderer.setPixelRatio(curDPR);
  renderer.setSize(w, h);
}

// (tutorial handles initial guidance)

// Cached DOM references — queried once instead of every frame
const _elKeySpace    = document.getElementById('key-space');
const _elPrompt      = document.getElementById('interact-prompt');
const _elToast       = document.getElementById('toast');
const _elIprLabel    = document.getElementById('ipr-label');
const _elIprIcon     = document.getElementById('ipr-icon');
const _elAimReticle  = document.getElementById('aim-reticle');
const _elUi               = document.getElementById('ui');
const _elMmWrap           = document.getElementById('minimap-wrap');
const _elFocusEscapeHint  = document.getElementById('focus-escape-hint');






const _elExhibitPrev = document.getElementById('exhibit-prev');
const _elExhibitNext = document.getElementById('exhibit-next');
let   _focusEscapeTimer = null;

function _showFocusEscapeHint() {
  _elFocusEscapeHint.innerHTML = isMobile
    ? `<span class="feh-label">tap to return</span>`
    : `<span class="feh-key">esc</span><span class="feh-label">back</span>`;
  _elFocusEscapeHint.classList.remove('dim');
  _elFocusEscapeHint.classList.add('visible');
  clearTimeout(_focusEscapeTimer);
  _focusEscapeTimer = setTimeout(() => _elFocusEscapeHint.classList.add('dim'), 6500);
}

function _showExhibitFocusHints() {
  const sep = `<span class="feh-label" style="opacity:0.35;margin:0 6px">&middot;</span>`;
  if (isMobile) {
    _elFocusEscapeHint.innerHTML = exhibitPanelN >= 2
      ? `<span class="feh-label">tap sides to browse</span>${sep}<span class="feh-label">tap to return</span>`
      : `<span class="feh-label">tap to return</span>`;
  } else {
    const browse = exhibitPanelN >= 2
      ? `<span style="display:inline-flex;gap:4px"><span class="feh-key">&larr;</span><span class="feh-key">&rarr;</span></span><span class="feh-label">browse</span>${sep}`
      : '';
    _elFocusEscapeHint.innerHTML = browse + `<span class="feh-key">esc</span><span class="feh-label">back</span>`;
  }
  _elFocusEscapeHint.classList.remove('dim');
  _elFocusEscapeHint.classList.add('visible');
  clearTimeout(_focusEscapeTimer);
  _focusEscapeTimer = setTimeout(() => _elFocusEscapeHint.classList.add('dim'), 7000);
  _showExhibitFocusNav();
}

function _hideFocusEscapeHint() {
  clearTimeout(_focusEscapeTimer);
  _elFocusEscapeHint.classList.remove('visible', 'dim');
}


const _exhibitNavFire = (dir, e) => {
  e.preventDefault();
  e.stopPropagation();
  _hideExhibitPanGuide();
  if (exhibitFocusPhase === 'focused') _exhibitFocusStep(dir);
  else if (exhibitPhase === 'open' && !exhibitFocusPhase) _exhibitStep(dir);
};
if (_elExhibitPrev) {
  _elExhibitPrev.addEventListener('click', e => _exhibitNavFire(-1, e));
  _elExhibitPrev.addEventListener('touchstart', e => _exhibitNavFire(-1, e), { passive: false });
  _elExhibitPrev.addEventListener('touchmove', e => { e.stopPropagation(); }, { passive: false });
}
if (_elExhibitNext) {
  _elExhibitNext.addEventListener('click', e => _exhibitNavFire(1, e));
  _elExhibitNext.addEventListener('touchstart', e => _exhibitNavFire(1, e), { passive: false });
  _elExhibitNext.addEventListener('touchmove', e => { e.stopPropagation(); }, { passive: false });
}

// ── Carousel info-card links ──
// An info card's @handle is drawn into the card canvas with a UV hotspot recorded on its
// texture (tex.userData.hotspots = [{ u0,v0,u1,v1, url }], built by the exhibit module via
// core.cardTextHotspot). While that card is held in focus, a click (desktop) or tap (mobile)
// that raycasts onto a hotspot opens that profile in a new tab. Only the focused panel is
// tested, and only the card carries hotspots — photos return null and behave as before.
const _linkRay = new THREE.Raycaster();
const _linkNdc = new THREE.Vector2();
function _exhibitHotspotAtClient(clientX, clientY) {
  if (exhibitFocusPhase !== 'focused' || !exhibitPlanes) return null;
  const p = exhibitPlanes[exhibitFocusIdx];
  const hs = p && p.mat.map && p.mat.map.userData && p.mat.map.userData.hotspots;
  if (!hs || !hs.length) return null;
  _linkNdc.x = (clientX / window.innerWidth) * 2 - 1;
  _linkNdc.y = -(clientY / window.innerHeight) * 2 + 1;
  _linkRay.setFromCamera(_linkNdc, camera);
  const hit = _linkRay.intersectObject(p.mesh, false)[0];
  if (!hit || !hit.uv) return null;
  const u = hit.uv.x, v = hit.uv.y;
  for (const h of hs) if (u >= h.u0 && u <= h.u1 && v >= h.v0 && v <= h.v1) return h;
  return null;
}
// Open the profile in a NEW TAB. window.open('_blank') always spawns a separate browsing
// context — it can never replace this frame (the experience runs inside an <iframe> on the
// Skin Deep site, so an in-place navigation would blank the app). If a popup blocker stops
// it, it simply no-ops rather than navigating away. noopener keeps the new tab detached.
// Returns true if a link was hit (so the caller can swallow the gesture).
function _tryOpenExhibitLink(clientX, clientY) {
  const h = _exhibitHotspotAtClient(clientX, clientY);
  if (!h) return false;
  window.open(h.url, '_blank', 'noopener,noreferrer');
  return true;
}
if (renderer && renderer.domElement && !isMobile) {
  renderer.domElement.addEventListener('click', e => {
    if (exhibitFocusPhase === 'focused') _tryOpenExhibitLink(e.clientX, e.clientY);
  });
  // Cursor affordance — a pointer over a live handle, default elsewhere.
  renderer.domElement.addEventListener('pointermove', e => {
    const want = (exhibitFocusPhase === 'focused' && _exhibitHotspotAtClient(e.clientX, e.clientY)) ? 'pointer' : '';
    if (renderer.domElement.style.cursor !== want) renderer.domElement.style.cursor = want;
  });
}

// ══════════════════════════════════════════
//  EXHIBITION REGISTRY
// ══════════════════════════════════════════
// Each exhibition (photo carousel, vinyl crate, CRT TV) registers a definition so
// the core loop/dispatch drive it generically — no hard-coded names in animate().
// Adding a new exhibition = register one more def (and, once split out, one file).
//
// A def is { id, floater (index), open(px,pz,yaw), isActive() } and may add an
// optional update(dt,t,eDown,escDown) hook (populated as each exhibition is moved
// into its own module). `activeExhibit` is the single open-arbitration reference.
const _exhibitDefs = [];
const _exhibitByFloaterRef = new Map();   // floater object -> def
let activeExhibit = null;
function registerExhibit(def) {
  const fl = floaters[def.floater];
  if (!fl) { console.warn('registerExhibit: no floater at index', def.floater); return; }
  if (_exhibitByFloaterRef.has(fl)) console.warn('registerExhibit: floater already claimed:', def.floater);
  def._floater = fl;
  _exhibitDefs.push(def);
  _exhibitByFloaterRef.set(fl, def);
}

// ── SEEN-EXHIBIT TRACKING ──
// Which exhibitions the visitor has OPENED, so the HUD can show overall progress
// (n / total under the minimap), recede visited floaters on the minimap, label an
// approach as a "revisit", and toast once the last one is found. Persisted to
// localStorage under a versioned key so the state survives reloads / return visits;
// any storage failure (private mode, partitioned third-party storage in the iframe)
// degrades silently to session-only.
const _SEEN_KEY = 'sd_seen_exhibits_v1';
const _seenExhibits = new Set();
try {
  const raw = localStorage.getItem(_SEEN_KEY);
  if (raw) for (const id of JSON.parse(raw)) _seenExhibits.add(id);
} catch (e) {}

const _elMmProgress = document.getElementById('minimap-progress');
let _mmSeenDirty = false;        // force a minimap redraw when seen-state changes while standing still
let _completionPending = false;  // fire the "all seen" toast once the last exhibit closes

const _isExhibitSeen = (def) => !!def && _seenExhibits.has(def.id);

// Count only ids that map to a still-registered exhibit, so a stale stored id (a renamed
// exhibit) can never push the tally past the real total (no "9 / 8").
function _seenCount() {
  let n = 0;
  for (const d of _exhibitDefs) if (_seenExhibits.has(d.id)) n++;
  return n;
}

function _updateProgressLabel() {
  if (!_elMmProgress) return;
  const total = _exhibitDefs.length, seen = _seenCount();
  _elMmProgress.textContent = total ? `${seen} / ${total}` : '';
  _elMmProgress.classList.toggle('complete', total > 0 && seen >= total);
}

function _markExhibitSeen(def) {
  if (!def || _seenExhibits.has(def.id)) return;
  _seenExhibits.add(def.id);
  if (def._floater) def._floater._seen = true;  // drives the floating seen-halo in the loop
  try { localStorage.setItem(_SEEN_KEY, JSON.stringify([..._seenExhibits])); } catch (e) {}
  _mmSeenDirty = true;
  _updateProgressLabel();
  // Defer the completion toast to dismissal (see the animate() close hook) so it never
  // surfaces over the exhibit that's still on screen.
  if (_exhibitDefs.length && _seenCount() >= _exhibitDefs.length) _completionPending = true;
}

// ── Register the still-inline exhibitions (photo carousel + vinyl crate) ──
// Photo-carousel exhibitions register from their own data files (js/exhibits/
// alim-photographer.js, masjid-uncles.js, …) by calling registerPhotoExhibit().
// The vinyl crate and CRT TV register from their own modules too. Adding a photo
// exhibit = a new data file + one import in js/main.js; nothing here changes.
export function registerPhotoExhibit(spec) {
  // spec: { id, floater, paths: [...], cardTex, cardAspect? }
  // cardTex is a FACTORY function — its texture is built lazily via _ensureCardTex()
  // so the heavy supersampled canvas stays off the import path. The card aspect is
  // fixed (512/384) and stored on the spec so panel layout never waits on the build.
  spec._cardFactory = (typeof spec.cardTex === 'function') ? spec.cardTex : null;
  spec.cardTex = null;
  spec.floaterIdx = spec.floater;
  spec.textures = [];
  spec._loaded = false;
  _photoSpecs.push(spec);
  // Link the floater to its spec so the loop can proximity-preload this exhibit's photos as
  // the player approaches (floaters are built at module-eval, before exhibits register).
  if (floaters[spec.floater]) floaters[spec.floater]._photoSpec = spec;
  registerExhibit({
    id: spec.id,
    floater: spec.floater,
    open: (px, pz, yaw) => _openExhibit(spec, px, pz, yaw),
    isActive: () => !!exhibitPhase,
    dismiss: () => _dismissExhibit(),
  });
}

// ══════════════════════════════════════════
//  CORE API — the surface exhibition modules import
// ══════════════════════════════════════════
// A single object that exhibition modules (js/exhibits/*.js) destructure from.
// Exposes shared scene/runtime, helpers, constants, and lifecycle services so an
// exhibition file references only `core` + its own private state. Per-frame
// transient state (dt, t, input edges, cooldown) is delivered via the ctx passed
// to each def.update(ctx) instead.
const core = {
  THREE, scene, camera, renderer, player, isMobile, MAX_ANISO, MAX_DPR,
  floaters,
  // shared positioning / timing
  CRATE_DIST, OPEN_DUR: CRATE_OPEN_DUR, CLOSE_DUR: CRATE_CLOSE_DUR, EXHIBIT_DPR,
  // registry
  registerExhibit,
  // texture / scheduling helpers
  initTex: _initTex,
  cardTextHotspot: _cardTextHotspot,
  instagramLink: _instagramLink,
  websiteLink: _websiteLink,
  drawInstagramGlyph: _drawInstagramGlyph,
  drawGlobeGlyph: _drawGlobeGlyph,
  buildInfoCardPortrait: _buildInfoCardPortrait,
  scheduleIdle: _scheduleIdle,
  showToast,
  // floater + exhibition lifecycle services
  setFloaterVisible: _setFloaterVisible,
  restoreFloater: _restoreExhibitFloater,
  setTriggerFloater(fl) { exhibitTriggerFloater = fl; },
  disposeObject3D: _disposeCrateObject,
  // resolution boost while an exhibition is on screen
  beginExhibitDPR() { _savedDPR = curDPR; curDPR = EXHIBIT_DPR; _applyDPR(); },
  endExhibitDPR()   { curDPR = _savedDPR; _applyDPR(); },
  // shared interaction cooldown + HUD
  setCD(v) { iCD = v; },
  getCD()  { return iCD; },
  hidePrompt() { _elPrompt.classList.remove('visible'); },
  // shared focus-mode services (carousel + crate disc focus)
  computeFocusTarget: _computeExhibitFocusTarget,
  syncCamera: _syncCamera,
  showFocusEscapeHint: _showFocusEscapeHint,
  hideFocusEscapeHint: _hideFocusEscapeHint,
  // raw input + texture loader + shared HUD element refs (for exhibition reticles)
  keys,
  texLoader: _texLoader,
  elAimReticle: _elAimReticle, elPrompt: _elPrompt, elIprLabel: _elIprLabel, elIprIcon: _elIprIcon,
  elMmWrap: _elMmWrap, elUi: _elUi, jZone: _jZone,
};

// Reused per-frame context handed to the active exhibition's update(ctx).
const _exhibitCtx = { dt: 0, t: 0, eEdge: false, escEdge: false, iCD: 0, setCD: (v) => { iCD = v; } };

export { core, registerExhibit };

// Called by js/main.js after every exhibition module has registered itself.
export function start() {
  // Seed the progress counter now that every exhibition has registered (at module-eval it was
  // empty), so it shows the right "n / total" the moment the minimap fades in.
  _updateProgressLabel();
  // Reflect any localStorage-restored seen-state onto the floaters so their halos appear.
  for (const d of _exhibitDefs) if (_seenExhibits.has(d.id) && d._floater) d._floater._seen = true;
  // A ~1s splash (loading bar) veils the cold-start entirely: the one-time shader compile, the
  // first GPU-warmed frames, and the camera's settle. Behind it the loop runs normally; when the
  // splash fades we snap the camera to a clean wide pose so the follow-cam glide plays a smooth
  // "settle onto the orb" intro AFTER the splash — rather than leaking the jittery swoop the
  // camera does from its default (0,0,0) origin during those first uneven-dt frames.
  const _elSplash = document.getElementById('splash');
  let _revealed = false;
  const _reveal = () => {
    if (_revealed) return;
    _revealed = true;
    // Reset to a wide pose along the current view axis (works for the tutorial spawn and the
    // ?goto debug spawn alike). _syncCamera then lerps from here onto the orb — the intro glide.
    const camX = player.position.x - Math.sin(yaw) * 7.5;
    const camZ = player.position.z - Math.cos(yaw) * 7.5;
    camera.position.set(camX, 6.0, camZ);
    if (_elSplash) {
      _elSplash.classList.add('hidden');
      setTimeout(() => _elSplash.remove(), 500); // after the 0.45s opacity fade
    }
  };
  // Two rAFs let the black page + splash paint, then compile every material once (cheap now that
  // the scene is down to a handful of lights) so the first painted frame and the later room reveal
  // are both hitch-free, and start the loop.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try { renderer.compile(scene, camera); } catch (e) {}
    animate();
    // Reveal once the splash has been up ~1s (its bar fills over ~1.05s) and frames are painting.
    const _tick = () => {
      if (performance.now() - _bootT0 >= 1050) _reveal();
      else requestAnimationFrame(_tick);
    };
    requestAnimationFrame(_tick);
  }));
  // Safety: never let the splash stick even if the warm-up stalls.
  setTimeout(_reveal, 4000);
}

function animate() {
  requestAnimationFrame(animate);
  const rawDt = clock.getDelta();
  // On mobile: accumulate time and only update/render at ~60fps
  if (isMobile) {
    _mobileAcc += rawDt;
    if (_mobileAcc < _MOBILE_TARGET) return;
  }
  const dt = Math.min(isMobile ? _mobileAcc : rawDt, 0.05);
  if (isMobile) _mobileAcc = 0;
  const t  = clock.elapsedTime;

  // Adaptive resolution: track the processed-frame interval and retune DPR periodically.
  const _nowTs = performance.now();
  if (_firstLoopFrame) {
    _firstLoopFrame = false;
    _lastFrameTs = _nowTs;          // discard the warm-up gap so it can't spike the average
    _warmupUntil = _nowTs + 1500;   // let the frame rate settle before judging the device
  }
  _emaFrameMs = _emaFrameMs * 0.9 + (_nowTs - _lastFrameTs) * 0.1;
  _lastFrameTs = _nowTs;
  // Paused while an exhibit is open so an FPS dip can't claw back card resolution, during the
  // initial settle window so load-in cost can't trigger a spurious DPR drop, and while the welcome
  // card is open — the reveal is a second load-in burst (welcome's own renderer + texture warm-ups)
  // long after the cold-start window, so judging it would drop resolution then climb back (a visible
  // "throttle, then stabilise"). _dismissWelcome re-arms _warmupUntil so it re-judges on fresh frames.
  if (_nowTs >= _warmupUntil && !exhibitPhase && !activeExhibit && !_welcomeOpen && ++_drsFrame >= _DRS_INTERVAL) {
    _drsFrame = 0;
    // First judgement after the settle window: discard the average accumulated during cold-start
    // (module eval + shader compile + first GPU-warmed frames) so those one-time slow frames
    // can't be misread as a slow device and back resolution off — which on a hi-DPI display left
    // the intro rendering at half-res for several seconds before climbing back. Judge only on
    // post-settle frames.
    if (!_emaReset) { _emaReset = true; _emaFrameMs = 1000 / 60; }
    const fps = 1000 / _emaFrameMs;
    if (fps < 54 && curDPR > MIN_DPR) {            // dropping frames — back off resolution fast
      curDPR = Math.max(MIN_DPR, curDPR - 0.2); _applyDPR();
    } else if (fps > 58.5 && curDPR < MAX_DPR) {   // steady 60 — climb back toward max
      curDPR = Math.min(MAX_DPR, curDPR + 0.2); _applyDPR();
    }
  }

  _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
  _rgt.set(-Math.cos(yaw), 0, Math.sin(yaw));
  let moving = false;
  const _exhibitLocked = exhibitFocusPhase === 'focusing' || exhibitFocusPhase === 'focused' || exhibitFocusPhase === 'switching';
  // Generic: the active exhibition may freeze movement (e.g. while a disc/panel is
  // held in focus so it stays centred). The visitor otherwise roams freely.
  const _inputLocked = _exhibitLocked || !!activeExhibit?.locksMovement?.();

  // Arrow keys rotate camera — frozen while reading a focused panel / crate
  if (!_inputLocked) {
    if(keys['ArrowLeft'])  yaw += CAM_TURN * dt;
    if(keys['ArrowRight']) yaw -= CAM_TURN * dt;
  }

  // WASD moves
  if (!_inputLocked) {
    if(keys['KeyW']) { player.position.addScaledVector(_fwd, SPEED*dt); moving=true; }
    if(keys['KeyS']) { player.position.addScaledVector(_fwd,-SPEED*dt); moving=true; }
    if(keys['KeyA']) { player.position.addScaledVector(_rgt,-SPEED*dt); moving=true; }
    if(keys['KeyD']) { player.position.addScaledVector(_rgt, SPEED*dt); moving=true; }
  }

  // Virtual joystick movement
  if (!_inputLocked && _joy.active && (Math.abs(_joy.dx) > 8 || Math.abs(_joy.dy) > 8)) {
    player.position.addScaledVector(_rgt,  (_joy.dx / JR) * SPEED * dt);
    player.position.addScaledVector(_fwd, -(_joy.dy / JR) * SPEED * dt);
    moving = true;
  }

  player.position.x = Math.max(-BOUND, Math.min(BOUND, player.position.x));
  player.position.z = Math.max(-BOUND, Math.min(BOUND, player.position.z));
  player.position.y = 0;

  // Orb pulse
  const pulse = 1 + Math.sin(t*2.7)*0.06;
  orbMesh.scale.setScalar(pulse);

  // Room reveal — progress from 0 (dark) to 1 (fully lit) after first interaction
  if (roomRevealed && revealT < 1) revealT = Math.min(1, revealT + dt * 0.32);
  const _rSmooth = revealT * revealT * (3 - 2 * revealT); // smoothstep
  // Focus mode forces a full dim. An exhibit's dimsRoom() may instead return a number
  // in 0..1 to request a *partial* dim (e.g. a light-coloured device that only needs the
  // orb knocked back a bit, not the room blacked out); a bare truthy still means full.
  const _exhibitDim = activeExhibit?.dimsRoom?.();
  const _wantFocusDim = (exhibitFocusPhase === 'focusing' || exhibitFocusPhase === 'focused' || exhibitFocusPhase === 'switching') ? 1
                      : (typeof _exhibitDim === 'number' ? _exhibitDim : (_exhibitDim ? 1 : 0));
  focusDimT += (_wantFocusDim - focusDimT) * Math.min(1, dt * 5.5);
  const _roomLight = _rSmooth * (1 - focusDimT * 0.94);
  ambientLight.intensity    = _roomLight * 0.15;
  beamLight.intensity       = Math.max(0, 1 - _rSmooth * 2.5) * 6.0 * (1 - focusDimT);
  beamCone.material.opacity = Math.max(0, 1 - _rSmooth * 2.5) * BEAM_CONE_OPACITY * (1 - focusDimT);
  scene.fog.density         = FOG_BASE + focusDimT * 0.11;

  // Beam fade-in is folded into the single floater pass below. Track whether the reveal
  // level actually changed so those beam writes can be skipped once the room is steady.
  const _roomLightChanged = Math.abs(_roomLight - _lastRoomLight) > 1e-4;
  _lastRoomLight = _roomLight;

  const _orbDim = 1 - focusDimT * 0.82;
  orbLight.intensity    = (12.0 + Math.sin(t*2.4)*1.2) * _orbDim;
  fillLight.intensity   = (0.45 + Math.sin(t*1.8+1)*0.06) * _orbDim;
  featherLight.intensity= (0.15 + Math.sin(t*1.3+2)*0.02) * _orbDim;

  // Blob shadow follows orb
  blobShadow.position.x = player.position.x;
  blobShadow.position.z = player.position.z;
  blobShadow.material.opacity = 0.72 - Math.sin(t*2.7)*0.08;

  // Dust motes — animated on the GPU (see moteMesh onBeforeCompile). No CPU loop / upload:
  // just advance time and feed the player position as uniforms.
  _moteUniforms.uTime.value   += dt * 0.04;
  _moteUniforms.uPlayerX.value = player.position.x;
  _moteUniforms.uPlayerZ.value = player.position.z;

  // Particle trail
  if(moving){ spawnAcc+=dt; if(spawnAcc>0.055){spawnP(player.position.x,player.position.z);spawnAcc=0;} }
  tickP(dt);

  // Tutorial step advancement
  if (tutStage === 2 && moving) _tutShow(3);

  // Floaters — one indexed pass: bob/spin/track, beam fade-in, proximity glow, nearest trigger,
  // and (mobile only) maintain the N nearest for the shared light pool.
  near.ref=null; near.dist=Infinity;
  for (let k = 0; k < _poolNearest.length; k++) _poolNearest[k] = null; // no-op on desktop (empty)
  for (let fi = 0; fi < floaters.length; fi++) {
    const f = floaters[fi];
    f.phase += dt;
    const floatY = Math.sin(f.phase*1.3)*0.14;
    f.mesh.position.y = f.baseY + floatY;
    f.mesh.rotation.x += f.rotSpeed;
    f.mesh.rotation.y += f.rotSpeed*1.4;

    // Aura tracks main mesh exactly
    f.aura.position.copy(f.mesh.position);
    f.aura.rotation.copy(f.mesh.rotation);

    // Orbit ring spins on its own tilted axes
    f.ring.position.copy(f.mesh.position);
    f.ring.rotation.y += f.rotSpeed * 0.75;
    f.ring.rotation.z += f.rotSpeed * 0.45;

    // Shadow disc: tracks X/Z, opacity deepens as floater descends
    f.fShadow.position.x = f.mesh.position.x;
    f.fShadow.position.z = f.mesh.position.z;
    f.fShadow.material.opacity = 0.4 - floatY * 0.8;
    if (f.floorSpot) { // mobile fake-beam floor disc tracks the floater
      f.floorSpot.position.x = f.mesh.position.x;
      f.floorSpot.position.z = f.mesh.position.z;
    }

    // Seen-marker eye: hovers above visited exhibits so they're spottable from across the room.
    // Hidden until the piece is opened (f._seen) — and hidden again while ANY exhibition is open
    // (activeExhibit), so an eye never floats over the dimmed room behind an open exhibit.
    if (f._seen) {
      const h = f.seenHalo;
      if (activeExhibit) {
        h.visible = false;
      } else {
        f._haloFade = Math.min(1, (f._haloFade || 0) + dt * 1.6);
        h.visible = true;
        h.position.set(f.mesh.position.x, f.mesh.position.y + 0.7, f.mesh.position.z);
        const pulse = 0.6 + Math.sin(t * 1.6 + f.phase) * 0.18;
        h.material.opacity = f._haloFade * pulse * _rSmooth;
      }
    }

    // Beam fade-in with the reveal — skipped once the reveal is steady. The cone shaft (every
    // floater) and the mobile floor disc fade here; the desktop floor-splash SpotLights are driven
    // by the shared pool below.
    if (_roomLightChanged && fi !== 0) {
      f.beamCone.material.opacity = _roomLight * BEAM_CONE_OPACITY;
      if (f.floorSpot) f.floorSpot.material.opacity = _roomLight * BEAM_FLOOR_SPOT_OPACITY;
    }

    const dx=player.position.x-f.mesh.position.x, dz=player.position.z-f.mesh.position.z;
    const dist2=dx*dx+dz*dz;
    // Only sqrt when within influence radius (dist < 5 → dist2 < 25); saves 9 sqrts/frame when far
    const prox=dist2<25 ? Math.max(0,1-Math.sqrt(dist2)/5) : 0;
    f.mesh.material.emissiveIntensity = (1.4 + prox * 3.2) * _rSmooth;
    f.aura.material.opacity = (0.07 + prox * 0.15) * _rSmooth;
    f.ring.material.opacity  = (0.36 + prox * 0.28) * _rSmooth;
    f._lightI = (0.9 + prox * 2.2) * _rSmooth;  // consumed by the shared point-light pool (all platforms)
    f._dist2  = dist2;

    if(!f._hidden && dist2<near.dist){ near.dist=dist2; if(dist2<EXHIBIT_TRIGGER_R2)near.ref=f; }
    // Proximity preload: warm this exhibit's photos + card as the player approaches, so the
    // carousel is decoded by the time they open it (the _loaded guard makes this a no-op once done).
    // Gated on roomRevealed: the start position already sits inside an exhibit's preload radius
    // (masjid is ~3.5 units away), so without this the heavy card/frame canvas builds + GPU uploads
    // fire during the tutorial and stutter it. Exhibits can't be opened until the room is revealed
    // anyway, so warming them only once the tutorial ends loses nothing and keeps startup smooth.
    if (roomRevealed) {
      if (f._photoSpec && !f._photoSpec._loaded && dist2 < EXHIBIT_PRELOAD_R2) _loadExhibitTexturesFor(f._photoSpec);
      // Generic one-shot preload hook any exhibit can attach to its floater (e.g. the CRT
      // pre-builds its model + textures on approach so its first open is hitch-free).
      if (f._preload && dist2 < EXHIBIT_PRELOAD_R2) { const fn = f._preload; f._preload = null; fn(); }
    }
    // Advance tutorial when player reaches the octahedron
    if (tutStage === 3 && f === floaters[0] && dist2 < 7.84) _tutShow(4);

    // Insertion into the fixed-size nearest list (ascending _dist2), no allocation. Feeds the
    // shared light pools below on every platform; hidden floaters are skipped so they stay dark.
    if (_poolNearest.length && !f._hidden) {
      for (let k = 0; k < _poolNearest.length; k++) {
        const cur = _poolNearest[k];
        if (cur === null || dist2 < cur._dist2) {
          for (let m = _poolNearest.length - 1; m > k; m--) _poolNearest[m] = _poolNearest[m-1];
          _poolNearest[k] = f;
          break;
        }
      }
    }
  }

  // Drive the shared light pools from the nearest floaters collected above (all platforms). The
  // point pool gives each nearby floater its proximity glow; the desktop spot pool adds the beam
  // floor-splash for the nearest few (floater 0 keeps its own central beamLight, so it's skipped).
  for (let i = 0; i < _poolLights.length; i++) {
    const pl = _poolLights[i];
    const f  = _poolNearest[i];
    if (f) { pl.position.copy(f.mesh.position); pl.color.setHex(f.color); pl.intensity = f._lightI; }
    else pl.intensity = 0;
  }
  for (let i = 0; i < _poolSpots.length; i++) {
    const sp = _poolSpots[i];
    const f  = _poolNearest[i];
    if (f && f !== floaters[0]) {
      sp.position.set(f.mesh.position.x, 13, f.mesh.position.z);
      sp.target.position.set(f.mesh.position.x, 0.5, f.mesh.position.z);
      sp.color.setHex(f.color);
      sp.intensity = _roomLight * 6.0;
    } else {
      sp.intensity = 0;
    }
  }

  // Auto-close exhibit/crate when player walks away from the trigger floater
  _leaveExhibitRadius();

  // Spread queued exhibit warm-up work across frames. Paused while an exhibit is
  // opening/closing/open so its spin-in animation keeps the full frame budget, and while the
  // welcome card is open so the heavy card builds stay out of the (visible, translucent) reveal
  // pause — they resume the instant the card is dismissed. Proximity preload still warms whatever
  // the player approaches afterwards, so first-open stays hitch-free.
  if (!exhibitPhase && !activeExhibit && !_welcomeOpen) _drainWarmQueue(moving);

  // Interact (Space / E) and dismiss (Escape — desktop only)
  const eDown = keys['KeyE'] || keys['Space'];
  const escDown = !isMobile && keys['Escape'];

  // Camera — sync early so raycasts and screen projections match the rendered view
  _syncCamera();

  const exhibitAimable = exhibitPhase === 'open' && !exhibitFocusPhase;
  const exhibitAimedIdx = exhibitAimable ? _getAimedExhibitPanelIdx() : -1;
  let exhibitCanFocus = exhibitAimedIdx >= 0;

  // Proximity prompt — project above the near object (hidden while any exhibition is open)
  if (near.ref && tutStage >= 3 && iCD <= 0 && !exhibitOpen && !activeExhibit && !_elToast.classList.contains('visible')) {
    near.ref.mesh.getWorldPosition(_projTmp);
    _projTmp.y += 0.55; // offset just above object
    _projTmp.project(camera);
    const px = ( _projTmp.x * 0.5 + 0.5) * window.innerWidth;
    const py = (-_projTmp.y * 0.5 + 0.5) * window.innerHeight;
    if (Math.abs(px - _promptLastX) > 0.5 || Math.abs(py - _promptLastY) > 0.5) {
      _elPrompt.style.left = px + 'px';
      _elPrompt.style.top  = py + 'px';
      _promptLastX = px; _promptLastY = py;
    }
    if (!_elPrompt.classList.contains('visible')) {
      const _seenHere = _isExhibitSeen(_exhibitByFloaterRef.get(near.ref));
      _elIprLabel.textContent = _seenHere
        ? (isMobile ? 'tap to revisit' : 'revisit')
        : (isMobile ? 'tap' : 'interact');
      const iconEl = _elIprIcon;
      if (isMobile) {
        iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,210,120,0.95)" stroke-width="1.5" width="28" height="28"><path d="M12 3v2M12 19v2M3 12H1M23 12h-2M18.36 5.64l-1.41 1.41M7.05 16.95l-1.41 1.41M18.36 18.36l-1.41-1.41M7.05 7.05L5.64 5.64"/><circle cx="12" cy="12" r="4" fill="rgba(255,180,60,0.15)"/></svg>`;
      } else {
        iconEl.innerHTML = `<span style="font-family:Georgia,serif;font-size:15px;letter-spacing:0.05em;color:rgba(255,220,140,0.95)">spc</span>`;
      }
      _elPrompt.classList.add('visible');
    }
  } else {
    _elPrompt.classList.remove('visible');
  }

  // Exhibit focus prompt — projected above the aimed panel. No aim reticle: the focus
  // prompt alone does the job (the carousel never shows _elAimReticle).
  if (exhibitPhase === 'open' && !exhibitFocusPhase) {
    if (exhibitCanFocus) {
      const tp = exhibitPlanes[exhibitAimedIdx].mesh;
      tp.getWorldPosition(_panelWp);
      _panelWp.project(camera);
      const rx = (_panelWp.x * 0.5 + 0.5) * window.innerWidth;
      const ry = (-_panelWp.y * 0.5 + 0.5) * window.innerHeight;
      _elPrompt.style.left = rx + 'px';
      _elPrompt.style.top  = (ry - 36) + 'px';
      _elIprLabel.textContent = isMobile ? 'tap to focus' : 'focus';
      const iconEl = _elIprIcon;
      if (isMobile) {
        iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,210,120,0.95)" stroke-width="1.5" width="28" height="28"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" fill="rgba(255,180,60,0.35)"/></svg>`;
      } else {
        iconEl.innerHTML = `<span style="font-family:Georgia,serif;font-size:15px;letter-spacing:0.05em;color:rgba(255,220,140,0.95)">spc</span>`;
      }
      _elPrompt.classList.add('visible');
    } else {
      _elPrompt.classList.remove('visible');
    }
  }

  // ── EXHIBIT FOCUSED SLIDESHOW (arrows / WASD only while an image is in focus) ──
  if (exhibitFocusPhase === 'focused' && exhibitPanelN >= 2 && iCD <= 0) {
    const navL = keys['ArrowLeft'] || keys['KeyA'];
    const navR = keys['ArrowRight'] || keys['KeyD'];
    if (navL && !_exhibitNavLWas) { _exhibitFocusStep(-1); iCD = 0.28; }
    if (navR && !_exhibitNavRWas) { _exhibitFocusStep(1); iCD = 0.28; }
    _exhibitNavLWas = navL; _exhibitNavRWas = navR;
  } else {
    _exhibitNavLWas = false; _exhibitNavRWas = false;
  }

  // Desktop Escape — unfocus when zoomed in, otherwise dismiss (same as walking out of radius)
  if (escDown && !escWas && iCD <= 0) {
    if (exhibitFocusPhase === 'focused') {
      _startExhibitUnfocus();
      _elPrompt.classList.remove('visible');
      iCD = 0.35;
    } else if (exhibitPhase && exhibitPhase !== 'closing') {
      _dismissExhibit();
      _elPrompt.classList.remove('visible');
      iCD = 0.3;
    }
  // Mobile tap to dismiss when nothing is aimed (desktop uses Escape above)
  } else if (eDown && !eWas && isMobile && iCD <= 0 &&
    (exhibitPhase === 'open' && !exhibitFocusPhase && !exhibitCanFocus)
  ) {
    _dismissExhibit();
    _elPrompt.classList.remove('visible');
    iCD = 0.3;
  // Focus the panel under the reticle
  } else if (eDown && !eWas && exhibitCanFocus && iCD <= 0) {
    _startExhibitFocus(exhibitAimedIdx);
    _elPrompt.classList.remove('visible');
    iCD = 0.35;
  // Mobile tap to return from focused view (desktop Escape unfocuses above)
  } else if (eDown && !eWas && isMobile && exhibitFocusPhase === 'focused' && iCD <= 0) {
    _startExhibitUnfocus();
    _elPrompt.classList.remove('visible');
    iCD = 0.35;
  // Normal floater interaction — open via the registry (generic; no hard-coded names)
  } else if(eDown&&!eWas&&near.ref&&iCD<=0){
    const f=near.ref;
    const def = !activeExhibit ? _exhibitByFloaterRef.get(f) : null;
    if (def) {
      def.open(player.position.x, player.position.z, yaw);
      activeExhibit = def;
      _markExhibitSeen(def);
      iCD = 0.5;
    } else if (!_exhibitByFloaterRef.has(f)) {
      if (f === floaters[0]) {
        showWelcomeCard();
        if (!roomRevealed) {
          roomRevealed = true;
          _startExhibitPreloadDrain(); // trickle the gallery in; proximity prioritises the nearest
        }
      } else {
        showToast(f.message);
      }
      if (tutStage === 4) _tutDismiss();
      iCD=1.0;
      let b=0;
      const burst=()=>{b+=0.04;f.mesh.scale.setScalar(1+Math.sin(b*Math.PI)*0.7);if(b<1)requestAnimationFrame(burst);else f.mesh.scale.setScalar(1);};
      burst();
      for(let i=0;i<14;i++){
        const a=(i/14)*Math.PI*2, p=pData[pIdx++%MAX_P];
        p.x=f.mesh.position.x+Math.cos(a)*0.6; p.y=f.mesh.position.y; p.z=f.mesh.position.z+Math.sin(a)*0.6; p.life=1;
      }
    }
  }
  // Capture press edges before eWas/escWas update — the active exhibition's
  // update(ctx) reads these to handle its own focus/dismiss interactions.
  const eEdge = eDown && !eWas;
  const escEdge = escDown && !escWas;
  eWas=eDown;
  escWas=escDown;
  if(iCD>0)iCD-=dt;

  // Active exhibition per-frame hook. Clears the arbitration ref once it closes.
  if (activeExhibit) {
    _exhibitCtx.dt = dt; _exhibitCtx.t = t;
    _exhibitCtx.eEdge = eEdge; _exhibitCtx.escEdge = escEdge; _exhibitCtx.iCD = iCD;
    activeExhibit.update?.(_exhibitCtx);
    if (!activeExhibit.isActive()) activeExhibit = null;
  }
  // Once the last unseen exhibit has been opened and then closed, congratulate once.
  if (_completionPending && !activeExhibit) {
    _completionPending = false;
    showToast("✦ You've explored every exhibit ✦");
  }

  // Exhibition animation tick
  if (exhibitPhase) {
    const _exhibitFocusUIHidden = exhibitFocusPhase === 'focusing' || exhibitFocusPhase === 'focused' || exhibitFocusPhase === 'switching';
    _elMmWrap.classList.toggle('focus-hidden', _exhibitFocusUIHidden);
    _elUi?.classList.toggle('focus-hidden', _exhibitFocusUIHidden);
    _jZone.classList.toggle('focus-hidden', _exhibitFocusUIHidden);
    if (!exhibitFocusPhase) exhibitAngle += dt * EXHIBIT_ORBIT_SPD;

    if (exhibitFocusPhase === 'focusing') {
      const fp = exhibitPlanes[exhibitFocusIdx];
      _refreshExhibitFocusTarget(fp.mesh);
      exhibitFocusT = Math.min(1, exhibitFocusT + dt / EXHIBIT_FOCUS_DUR);
      const s = exhibitFocusT * exhibitFocusT * (3 - 2 * exhibitFocusT);
      fp.mesh.visible = true;
      fp.mesh.position.lerpVectors(_focusFromPos, _focusToPos, s);
      _focusLerpQuat.slerpQuaternions(_focusFromQuat, _focusToQuat, s);
      fp.mesh.quaternion.copy(_focusLerpQuat);
      fp.mesh.scale.setScalar(_focusFromScale + (_focusToScale - _focusFromScale) * s);
      fp.mesh.renderOrder = 200;
      fp.mesh.material.opacity = 1;
      fp.mesh.material.transparent = false;
      exhibitPlanes.forEach((p, i) => {
        if (i === exhibitFocusIdx) return;
        p.mesh.material.transparent = true;
        p.mesh.material.opacity = Math.max(0, 1 - s * 1.2);
        p.mesh.visible = p.mesh.material.opacity > 0.04;
      });
      if (exhibitFocusT >= 1) { exhibitFocusPhase = 'focused'; _showExhibitFocusHints(); }
    } else if (exhibitFocusPhase === 'switching') {
      const fromMesh = exhibitPlanes[exhibitFocusIdx].mesh;
      const toMesh = exhibitPlanes[exhibitFocusSwitchTo].mesh;
      exhibitFocusT = Math.min(1, exhibitFocusT + dt / EXHIBIT_FOCUS_SWITCH_DUR);
      const s = exhibitFocusT * exhibitFocusT * (3 - 2 * exhibitFocusT);

      fromMesh.position.copy(_slideCenterPos).addScaledVector(_slideOff, -s);
      fromMesh.quaternion.copy(_slideCenterQuat);
      fromMesh.scale.setScalar(_slideFromScale);
      fromMesh.visible = true;
      fromMesh.renderOrder = 200;

      toMesh.position.copy(_slideCenterPos).addScaledVector(_slideOff, 1 - s);
      toMesh.quaternion.copy(_slideToQuat);
      toMesh.scale.setScalar(_slideToScale);
      toMesh.visible = true;
      toMesh.renderOrder = 201;
      toMesh.material.opacity = 1;
      toMesh.material.transparent = false;

      if (exhibitFocusT >= 1) {
        exhibitFocusIdx = exhibitFocusSwitchTo;
        exhibitFocusPhase = 'focused';
        exhibitFocusSwitchTo = -1;
        exhibitFocusT = 0;
        _refreshExhibitFocusTarget(toMesh);
        _applyExhibitFocusView(toMesh);
        fromMesh.visible = false;
        exhibitPlanes.forEach((p, i) => {
          if (i !== exhibitFocusIdx) p.mesh.visible = false;
        });
        _showExhibitFocusHints();
      }
    } else if (exhibitFocusPhase === 'focused') {
      const fp = exhibitPlanes[exhibitFocusIdx];
      _refreshExhibitFocusTarget(fp.mesh);
      _applyExhibitFocusView(fp.mesh);
      fp.mesh.visible = true;
      fp.mesh.material.opacity = 1;
      fp.mesh.material.transparent = false;
      exhibitPlanes.forEach((p, i) => {
        if (i !== exhibitFocusIdx) p.mesh.visible = false;
      });
    } else if (exhibitFocusPhase === 'unfocusing') {
      const tp = exhibitPlanes[exhibitFocusIdx];
      exhibitFocusT = Math.min(1, exhibitFocusT + dt / EXHIBIT_FOCUS_DUR);
      const s = exhibitFocusT * exhibitFocusT * (3 - 2 * exhibitFocusT);
      const a = _exhibitPanelAngle(exhibitFocusIdx);
      _focusToPos.set(
        exhibitCX + Math.sin(a) * EXHIBIT_ORBIT_R,
        2.0,
        exhibitCZ + Math.cos(a) * EXHIBIT_ORBIT_R
      );
      _focusHelper.position.copy(_focusToPos);
      _focusHelper.rotation.set(0, a + Math.PI, 0);
      _focusToQuat.copy(_focusHelper.quaternion);
      tp.mesh.position.lerpVectors(_focusFromPos, _focusToPos, s);
      _focusLerpQuat.slerpQuaternions(_focusFromQuat, _focusToQuat, s);
      tp.mesh.quaternion.copy(_focusLerpQuat);
      tp.mesh.scale.setScalar(_focusFromScale + (1 - _focusFromScale) * s);
      tp.mesh.renderOrder = Math.round(200 * (1 - s));
      tp.mesh.visible = true;
      tp.mesh.material.transparent = false;
      tp.mesh.material.opacity = 1;
      exhibitPlanes.forEach((p, i) => {
        if (i === exhibitFocusIdx) return;
        p.mesh.material.transparent = true;
        p.mesh.material.opacity = Math.min(1, s * 1.15);
        p.mesh.visible = p.mesh.material.opacity > 0.04;
        _applyExhibitPanelTransform(p, i, exhibitAngle);
        p.mesh.scale.setScalar(0.05 + s * 0.95);
      });
      if (exhibitFocusT >= 1) {
        tp.mesh.renderOrder = 0;
        exhibitFocusIdx = -1;
        exhibitFocusPhase = null;
        exhibitFocusT = 0;
        // Back to the roaming DPR — the boost was only for the focused 1:1 view.
        if (curDPR !== _savedDPR) { curDPR = _savedDPR; _applyDPR(); }
        for (let i = 0; i < exhibitPlanes.length; i++) {
          const p = exhibitPlanes[i];
          p.mesh.material.transparent = false;
          p.mesh.material.opacity = 1;
          p.mesh.renderOrder = 0;
        }
        _showExhibitHint();
      }
    } else {
      // Steady orbit (runs every frame while browsing) — indexed loop, no closures. The
      // panels' transparent/opacity stay false/1 from creation + the unfocus restore, so
      // they're NOT rewritten each frame (which would otherwise force transparency re-sorts).
      for (let i = 0; i < exhibitPlanes.length; i++) {
        const p = exhibitPlanes[i];
        const a = _exhibitPanelAngle(i);
        p.mesh.position.x = exhibitCX + Math.sin(a) * EXHIBIT_ORBIT_R;
        p.mesh.position.y = 2.0;
        p.mesh.position.z = exhibitCZ + Math.cos(a) * EXHIBIT_ORBIT_R;
        // Explicitly zero X/Z so no residual tilt from focus slerp survives.
        p.mesh.rotation.set(0, a + Math.PI, 0);
        p.mesh.scale.setScalar(1);
        // Cull the cards that sit behind the camera (it trails the player by 4.6
        // units, just past the 4.5-unit orbit). Apply this during 'opening' too,
        // not only 'open', so the rear card never scales up through the camera as
        // the exhibit spins in — it simply stays hidden until the player turns.
        if (exhibitPhase === 'open' || exhibitPhase === 'opening') p.mesh.visible = Math.cos(a - yaw) > -0.6;
      }
    }

    if (exhibitPhase === 'opening') {
      exhibitT = Math.min(1, exhibitT + dt / EXHIBIT_OPEN_DUR);
      for (let i = 0; i < exhibitPlanes.length; i++) {
        const p = exhibitPlanes[i];
        const stagger = EXHIBIT_STAGGER[i] || EXHIBIT_STAGGER[EXHIBIT_STAGGER.length - 1];
        const elapsed = exhibitT * EXHIBIT_OPEN_DUR - stagger;
        const rem     = EXHIBIT_OPEN_DUR - stagger;
        const lt      = Math.max(0, Math.min(1, elapsed / rem));
        const s       = lt * lt * (3 - 2 * lt);
        p.mesh.scale.setScalar(EXHIBIT_OPEN_SCALE0 + s * (1 - EXHIBIT_OPEN_SCALE0));
        p.mat.opacity = s;       // fade the photo in
        p.frameMat.opacity = s;  // and its frame
      }
      if (exhibitT >= 1) {
        exhibitPhase = 'open';
        // Restore the steady-orbit invariant: photo fully opaque & non-transparent (so the
        // orbit tick needn't touch it), frame fully shown.
        for (let i = 0; i < exhibitPlanes.length; i++) {
          exhibitPlanes[i].mat.transparent = false;
          exhibitPlanes[i].mat.opacity = 1;
          exhibitPlanes[i].frameMat.opacity = 1;
        }
        _showExhibitHint();
      }
    } else if (exhibitPhase === 'closing') {
      exhibitT = Math.max(0, exhibitT - dt / EXHIBIT_CLOSE_DUR);
      const s = exhibitT * exhibitT * (3 - 2 * exhibitT); // 1 → 0
      for (let i = 0; i < exhibitPlanes.length; i++) {
        const p = exhibitPlanes[i];
        p.mesh.scale.setScalar(EXHIBIT_OPEN_SCALE0 + s * (1 - EXHIBIT_OPEN_SCALE0));
        p.mat.transparent = true; // fade the photo out to match the open
        p.mat.opacity = s;
        p.frameMat.opacity = s;
      }
      if (exhibitT <= 0) _closeExhibit();
    }
  }

  const _wantKeyHint = !!(near.ref && !activeExhibit) || exhibitCanFocus || !!activeExhibit?.wantsHint?.();
  if (_wantKeyHint !== _keySpaceActive) { _elKeySpace.classList.toggle('active', _wantKeyHint); _keySpaceActive = _wantKeyHint; }

  renderer.render(scene, camera);
  _tickTutPreview();
  _tickWelcomeFloaters();
  _mmFrame++;
  if (_mmFrame % (isMobile ? 3 : 2) === 0) drawMinimap();

  // Position guide dots at the orb's screen projection
  if ((tutStage <= 1 && _tutGuideDot.classList.contains('visible')) || _exhPanGuideOn) {
    orbMesh.getWorldPosition(_projTmp);
    _projTmp.project(camera);
    const sx = ( _projTmp.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-_projTmp.y * 0.5 + 0.5) * window.innerHeight;
    if (tutStage <= 1 && _tutGuideDot.classList.contains('visible')) {
      _tutGuideDot.style.left = (sx - 10) + 'px';
      _tutGuideDot.style.top  = (sy - 10) + 'px';
    }
    if (_exhPanGuideOn) {
      if (Math.abs(yaw - _exhPanGuideYaw0) > 0.12) _hideExhibitPanGuide();
      else {
        _exhPanWrap.style.left = sx + 'px';
        _exhPanWrap.style.top  = sy + 'px';
      }
    }
  }
}

window.addEventListener('resize', () => {
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  _applyDPR(true); // force: viewport genuinely changed, and keep the resize-skip cache in sync
});

// The render loop + idle preload are launched by start(), which js/main.js calls
// after all exhibition modules have registered themselves.

// ══════════════════════════════════════════
//  MINIMAP
// ══════════════════════════════════════════
const _mm     = document.getElementById('minimap');
const _mmCtx  = _mm.getContext('2d');
const _mmWrap = document.getElementById('minimap-wrap');
const MM_SIZE  = 120;  // canvas px
const MM_WORLD = 36;   // world units across the map
const MM_SCALE = MM_SIZE / MM_WORLD;
const MM_CX    = MM_SIZE / 2;
const MM_CY    = MM_SIZE / 2;
const MM_R     = MM_SIZE / 2 - 1;

// Per-floater dot colours are constant — build the rgba strings once instead of
// allocating 18 template strings every redraw.
const _mmDotFill = floaterData.map(fd => `rgba(${(fd.color>>16)&0xff},${(fd.color>>8)&0xff},${fd.color&0xff},0.18)`);
const _mmDotCore = floaterData.map(fd => `rgba(${(fd.color>>16)&0xff},${(fd.color>>8)&0xff},${fd.color&0xff},0.9)`);
// Dimmer variants for VISITED exhibits — a ringed, recessed dot so unvisited pieces draw the eye.
const _mmDotSeenFill = floaterData.map(fd => `rgba(${(fd.color>>16)&0xff},${(fd.color>>8)&0xff},${fd.color&0xff},0.07)`);
const _mmDotSeenCore = floaterData.map(fd => `rgba(${(fd.color>>16)&0xff},${(fd.color>>8)&0xff},${fd.color&0xff},0.4)`);

// Pre-bake the player marker (triangle + glow) once, so the per-frame redraw avoids
// canvas shadowBlur — one of the most expensive 2d ops — and just drawImage's it.
const _mmMarker = document.createElement('canvas');
_mmMarker.width = _mmMarker.height = 32;
(() => {
  const c = _mmMarker.getContext('2d');
  c.translate(16, 16);
  c.beginPath(); c.moveTo(0, -7); c.lineTo(4, 4); c.lineTo(-4, 4); c.closePath();
  c.fillStyle = 'rgba(255,235,160,0.97)';
  c.shadowColor = 'rgba(255,180,60,0.9)'; c.shadowBlur = 7;
  c.fill();
})();

// Dirty-check state — the map only changes when the player moves or turns (floater bob is
// sub-pixel at this scale), so we skip the redraw entirely while stationary. Seeded to
// Infinity so the first post-reveal draw always runs (and makes the wrapper visible).
let _mmLastX = Infinity, _mmLastZ = Infinity, _mmLastYaw = Infinity;

function _mmPt(wx, wz) {
  return [ MM_CX + wx * MM_SCALE, MM_CY + wz * MM_SCALE ];
}

function drawMinimap() {
  if (!roomRevealed) return;
  if (!_mmWrap.classList.contains('visible')) _mmWrap.classList.add('visible');

  // Skip the whole redraw when the player hasn't moved or turned since last time — unless
  // seen-state just changed (a piece opened while standing still alters its marker in place).
  if (!_mmSeenDirty &&
      Math.abs(player.position.x - _mmLastX) < 1e-3 &&
      Math.abs(player.position.z - _mmLastZ) < 1e-3 &&
      Math.abs(yaw - _mmLastYaw) < 1e-3) return;
  _mmSeenDirty = false;
  _mmLastX = player.position.x; _mmLastZ = player.position.z; _mmLastYaw = yaw;

  const ctx = _mmCtx;
  ctx.clearRect(0, 0, MM_SIZE, MM_SIZE);
  ctx.save();

  // Circular clip
  ctx.beginPath();
  ctx.arc(MM_CX, MM_CY, MM_R, 0, Math.PI * 2);
  ctx.clip();

  // Background
  ctx.fillStyle = 'rgba(4,2,1,0.82)';
  ctx.fillRect(0, 0, MM_SIZE, MM_SIZE);

  // Rotate entire world around canvas centre by player yaw
  // so "forward" is always up, GTA-style
  ctx.save();
  ctx.translate(MM_CX, MM_CY);
  ctx.rotate(yaw - Math.PI);   // forward (+Z) maps to canvas-down, so offset by π to flip it up
  ctx.translate(-MM_CX, -MM_CY);

  // Helper: world pos → canvas pos, relative to player (player = canvas centre)
  const toMM = (wx, wz) => [
    MM_CX + (wx - player.position.x) * MM_SCALE,
    MM_CY + (wz - player.position.z) * MM_SCALE
  ];

  // Room boundary
  ctx.strokeStyle = 'rgba(255,200,100,0.12)';
  ctx.lineWidth = 1;
  const [bx0, by0] = toMM(-23, -23);
  const [bx1, by1] = toMM( 23,  23);
  ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);

  // Floater dots — colours precomputed once (see _mmDotFill/_mmDotCore)
  floaters.forEach((f, i) => {
    const [fx, fz] = toMM(f.mesh.position.x, f.mesh.position.z);
    if (_isExhibitSeen(_exhibitByFloaterRef.get(f))) {
      // Visited: recessed core inside a thin gold ring — reads as "done".
      ctx.beginPath();
      ctx.arc(fx, fz, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = _mmDotSeenFill[i];
      ctx.fill();
      ctx.beginPath();
      ctx.arc(fx, fz, 3.4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,225,150,0.85)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(fx, fz, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = _mmDotSeenCore[i];
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(fx, fz, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = _mmDotFill[i];
      ctx.fill();
      ctx.beginPath();
      ctx.arc(fx, fz, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = _mmDotCore[i];
      ctx.fill();
    }
  });

  ctx.restore(); // end world rotation

  // Player — pre-baked marker (triangle + glow) drawn at canvas centre
  ctx.drawImage(_mmMarker, MM_CX - 16, MM_CY - 16);

  ctx.restore(); // end clip

  // Outer border ring
  ctx.beginPath();
  ctx.arc(MM_CX, MM_CY, MM_R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,200,100,0.28)';
  ctx.lineWidth = 1;
  ctx.stroke();
}