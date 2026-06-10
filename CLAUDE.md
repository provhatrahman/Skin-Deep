# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**Digital Exhibition Faith** is a browser-based 3D interactive WebGL experience for [Skin Deep magazine](https://skindeepmag.com). The visitor navigates a dimly lit liminal space as a glowing orb, discovering floating geometric exhibition pieces that trigger individual art pieces when interacted with.

The entire application lives in a **single HTML file** (`digital_exhibition_faith.html`) with no build process, bundler, or package manager. Three.js r128 is loaded from CDN.

## Running locally

```
python -m http.server 8080
```

Then open `http://localhost:8080/digital_exhibition_faith.html`.

> Must be served over HTTP — not `file://` — because textures load as separate files.

## Deployment

Push to `main` → Cloudflare Pages auto-deploys. No build step. The experience is embedded as an `<iframe>` on the Skin Deep site.

## Architecture

### File layout

```
digital_exhibition_faith.html   — Entire application (~1350 lines)
orb_tex.png                     — Player orb texture
tile.png                        — Floor and wall tile texture
```

### Internal structure of `digital_exhibition_faith.html`

The file is split into logical sections separated by `// ══ SECTION NAME ══` headers:

1. **PROCEDURAL TEXTURES** — `makeOrbTexture()` loads `orb_tex.png`; `makeFloaterTex(type)` generates unique canvas-based emissive maps for each of 8 floater types (`crystal`, `circuit`, `marble`, `cells`, `cosmos`, `static`, `rune`, `weave`).

2. **SCENE SETUP** — Three.js scene, renderer (ACES Filmic tone-mapping on desktop; disabled on mobile), fog, floor/walls/ceiling from tiled geometry.

3. **PLAYER / ORB** — Player group with a 0.22-radius orb mesh, 3 nested point lights (`orbLight`, `fillLight`, `featherLight`), and a blob shadow disc.

4. **DUST MOTES** — 3 000 (desktop) / 600 (mobile) `BufferGeometry` particles with phase-based sinusoidal orbits. **Throttled to every 2nd frame.**

5. **FLOATERS** — 9 geometric exhibition objects. Each has: main mesh, back-face aura shell (additive blend), orbit ring, shadow disc, and a point light. Proximity detection triggers emissive glow increase. A `SpotLight` volumetric cone sits above the first floater.

6. **INPUT HANDLING** — WASD + arrow key + `Space`/`E` for desktop; virtual joystick + interact button for mobile. Touch and mouse events both handled.

7. **UI SYSTEMS** — Toast notifications, 5-stage tutorial overlay, particle trail (max 90 particles), and a 120×120 circular minimap (GTA-style, player always points up). Minimap appears after first interaction; throttled to 30 fps (desktop) / 20 fps (mobile).

8. **MAIN ANIMATION LOOP** — `requestAnimationFrame` loop with mobile 60 fps cap. Per-frame: camera/player movement, boundary clamping (±21 units), orb pulse, room-reveal transition, floater bobbing/rotation/proximity, interaction cooldown, minimap draw.

### Key constants

| Constant | Value | Purpose |
|---|---|---|
| `SPEED` | 4.2 | Player movement units/sec |
| `BOUND` | 21 | Player boundary clamp |
| `CAM_TURN` | 2.2 | Camera rotation rad/sec |
| `MOTE_N` | 3000 / 600 | Dust particle count desktop/mobile |
| `MAX_P` | 90 | Particle trail max |
| `MM_SIZE` | 120 | Minimap canvas px |

## Performance rules

These optimisations are already in place — all changes must stay consistent with them.

- **No DOM queries inside `animate()`** — cache all `getElementById` / `querySelector` refs as `const` variables at init time, just above `function animate()`. Add new cached refs there.
- **Squared distance comparisons** — use `dx*dx + dz*dz < r*r` instead of `Math.sqrt(...) < r` everywhere except when the actual distance value is required.
- **Throttle bulk attribute updates** — follow the `_moteFrame % 2 === 0` pattern for any new particle systems or per-frame array writes. Ask whether new work can run every 2nd frame or be skipped when the player hasn't moved.
- **Never embed textures as base64** — always save image assets as separate files and load with `new THREE.TextureLoader().load('filename.png')`. New textures should be compressed to <2 MB (use `python compress_textures.py` on the dev branch).
- **Dispose WebGL resources explicitly** — geometries, materials, and textures created dynamically must call `.dispose()` and be set to `null` when no longer needed.

## Code style

- Single-file vanilla JS + Three.js. Do not introduce npm, bundlers, or build tools.
- Section headers: `// ══ SECTION NAME ══` style.
- Prefer `const` over `let` for values that don't change.
