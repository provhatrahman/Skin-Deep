// ══════════════════════════════════════════
//  EXHIBITION: Jummah Aesthetics  (floater 8 — photo carousel)
// ══════════════════════════════════════════
// A photo-carousel exhibition: a data file that builds its info card and registers
// with the shared carousel engine in core (see js/core.js → registerPhotoExhibit).
// Self-contained — edit this file to change this exhibit's photos or card without
// touching core or any other exhibition.
import { core, registerPhotoExhibit } from '../core.js';
const { THREE } = core;

function makeJummahCardTex() {
  const W = 512, H = 384;
  const SS = window.matchMedia('(pointer: coarse)').matches ? 2 : 4; // 1024 / 2048 px — crisp at focus fill
  const cv = document.createElement('canvas');
  cv.width = W * SS; cv.height = H * SS;
  const ctx = cv.getContext('2d');
  ctx.scale(SS, SS);

  ctx.fillStyle = 'rgb(4,2,1)';
  ctx.fillRect(0, 0, W, H);

  const vg = ctx.createRadialGradient(W/2, H/2, 40, W/2, H/2, W * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  const BM = 14;
  ctx.strokeStyle = 'rgba(255,200,100,0.32)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(BM, BM, W - BM*2, H - BM*2);

  ctx.strokeStyle = 'rgba(255,200,100,0.1)';
  ctx.lineWidth = 1;
  ctx.strokeRect(BM+4, BM+4, W-BM*2-8, H-BM*2-8);

  const CL = 28, F = BM;
  ctx.shadowColor = 'rgba(255,220,120,1)';
  ctx.shadowBlur = 10;
  ctx.strokeStyle = 'rgba(255,240,160,0.9)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(F+CL,F);   ctx.lineTo(F,F);   ctx.lineTo(F,F+CL);   ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W-F-CL,F); ctx.lineTo(W-F,F); ctx.lineTo(W-F,F+CL); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W-F,H-F-CL); ctx.lineTo(W-F,H-F); ctx.lineTo(W-F-CL,H-F); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(F+CL,H-F); ctx.lineTo(F,H-F); ctx.lineTo(F,H-F-CL); ctx.stroke();
  ctx.shadowBlur = 0;

  const cx = W / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = 'rgba(255,200,100,0.42)';
  ctx.font = '400 11px Georgia, serif';
  ctx.fillText('P H O T O   E S S A Y', cx, 60);

  ctx.fillStyle = 'rgba(255,238,175,0.98)';
  ctx.font = '400 28px Georgia, serif';
  ctx.shadowColor = 'rgba(255,200,80,0.18)';
  ctx.shadowBlur = 14;
  ctx.fillText('Jummah Aesthetics', cx, 100);
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(255,220,150,0.62)';
  ctx.font = 'italic 400 13px Georgia, serif';
  ctx.fillText('British Muslim men & their sartorial choices', cx, 122);

  ctx.strokeStyle = 'rgba(255,200,100,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 140, 138); ctx.lineTo(cx + 140, 138);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,220,150,0.82)';
  ctx.font = '400 14px Georgia, serif';
  ctx.fillText('Rehan Jamil  ·  curated by Dr Fatima Rajina', cx, 162);

  ctx.fillStyle = 'rgba(255,210,135,0.68)';
  ctx.font = '400 14px Georgia, serif';
  ctx.fillText('What men wear to Friday prayers at', cx, 196);
  ctx.fillText('four East London mosques — thobes,', cx, 216);
  ctx.fillText('kameez & streetwear as living faith.', cx, 236);

  ctx.fillStyle = 'rgba(255,200,100,0.52)';
  ctx.font = '400 11px Georgia, serif';
  ctx.fillText('Oxford House, Bethnal Green  ·  The Guardian', cx, 278);

  ctx.strokeStyle = 'rgba(255,200,100,0.14)';
  ctx.beginPath();
  ctx.moveTo(cx - 110, 294); ctx.lineTo(cx + 110, 294);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,200,100,0.38)';
  ctx.font = '400 12px Georgia, serif';
  ctx.fillText('@oxfordhouse1884', cx, 322);

  return new THREE.CanvasTexture(cv);
}

registerPhotoExhibit({
  id: 'jummah-aesthetics',
  floater: 8,
  paths: [
    'images/jummah/jummah-lead.webp',
    'images/jummah/jummah-white-thobe.webp',
    'images/jummah/jummah-charcoal-thobe.webp',
    'images/jummah/jummah-diptych.webp',
  ],
  cardTex: makeJummahCardTex(),
});
