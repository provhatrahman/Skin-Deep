// ══════════════════════════════════════════
//  EXHIBITION: OUTSAEDA  (floater 7 — photo carousel)
// ══════════════════════════════════════════
// A photo-carousel exhibition: a data file that builds its info card and registers
// with the shared carousel engine in core (see js/core.js → registerPhotoExhibit).
// Self-contained — edit this file to change this exhibit's photos or card without
// touching core or any other exhibition.
import { core, registerPhotoExhibit } from '../core.js';
const { THREE } = core;

function makeOutsaedaCardTex() {
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
  ctx.fillText('M O D E S T   S T R E E T W E A R', cx, 62);

  ctx.fillStyle = 'rgba(255,238,175,0.98)';
  ctx.font = '400 34px Georgia, serif';
  ctx.shadowColor = 'rgba(255,200,80,0.18)';
  ctx.shadowBlur = 14;
  ctx.fillText('OUTSAEDA', cx, 112);
  ctx.shadowBlur = 0;

  ctx.strokeStyle = 'rgba(255,200,100,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 130, 132); ctx.lineTo(cx + 130, 132);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,220,150,0.82)';
  ctx.font = '400 14px Georgia, serif';
  ctx.fillText('Saeedah Haque', cx, 158);

  ctx.fillStyle = 'rgba(255,210,135,0.68)';
  ctx.font = '400 14px Georgia, serif';
  ctx.fillText('The abaya reinvented as techwear —', cx, 192);
  ctx.fillText('utilitarian, active streetwear for the', cx, 212);
  ctx.fillText('modern modest wardrobe.', cx, 232);

  ctx.fillStyle = 'rgba(255,200,100,0.52)';
  ctx.font = '400 11px Georgia, serif';
  ctx.fillText('VFILES  ·  London  ·  modest tech wear', cx, 278);

  ctx.strokeStyle = 'rgba(255,200,100,0.14)';
  ctx.beginPath();
  ctx.moveTo(cx - 110, 294); ctx.lineTo(cx + 110, 294);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,200,100,0.38)';
  ctx.font = '400 12px Georgia, serif';
  ctx.fillText('@saeedahhaque', cx, 322);

  return new THREE.CanvasTexture(cv);
}

registerPhotoExhibit({
  id: 'outsaeda',
  floater: 7,
  paths: [
    'images/outsaeda/outsaeda-7.webp',
    'images/outsaeda/outsaeda-1.webp',
    'images/outsaeda/outsaeda-2.webp',
    'images/outsaeda/outsaeda-6.webp',
    'images/outsaeda/outsaeda-5.webp',
    'images/outsaeda/outsaeda-4.webp',
    'images/outsaeda/outsaeda-3.webp',
  ],
  cardTex: makeOutsaedaCardTex(),
});
