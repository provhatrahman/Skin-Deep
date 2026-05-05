# Void Walker — Copilot Instructions

## Project overview
A single-page Three.js WebGL experience (`void_walker.html`) served as a static site alongside two PNG texture assets (`orb_tex.png`, `tile.png`). There is no build step. The page is served via a local Python HTTP server during development (`python -m http.server 8080`).

---

## Performance rules

These rules reflect optimisations already applied. All future changes must stay consistent with them.

### Textures and assets
- **Never embed textures as base64 data URLs** inside the HTML or JS. Always save image assets as separate files and load them with `new THREE.TextureLoader().load('filename.png')`.
- If new textures are added, compress them before committing: use `python compress_textures.py` (already in the project) or equivalent lossless/quantised PNG compression. Target file sizes: <2 MB per texture.
- The page must remain fully static — no server-side rendering or dynamic asset generation.

### DOM access
- **Never call `document.getElementById()` or `document.querySelector()` inside `animate()` or any function called every frame.** Cache all DOM references as `const` variables at initialisation time (outside the animation loop) and reference those variables instead.
- Current cached refs live just above `function animate()` — add new ones there.

### WebGL resource management
- Any `THREE.WebGLRenderer`, geometry, material, or texture created dynamically (e.g. for overlays, previews, or UI) **must be explicitly disposed** when no longer needed:
  ```js
  scene.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (obj.material.map) obj.material.map.dispose();
      obj.material.dispose();
    }
  });
  renderer.dispose();
  ```
- Set the reference to `null` after disposing so the GC can collect it.

### Animation loop
- **Throttle expensive per-frame work** to every 2nd frame (or less) where the visual difference is imperceptible. The dust mote update (`_moteFrame % 2 === 0`) is the existing pattern — follow it for any new particle systems or bulk attribute updates.
- Avoid adding new work inside `animate()` that runs unconditionally every frame. Ask: can this run every 2nd frame? Can it be skipped when the player hasn't moved?

### Math
- Use **squared distance comparisons** (`dx*dx + dz*dz < threshold * threshold`) instead of `Math.sqrt(dx*dx + dz*dz) < threshold` wherever possible. Only call `Math.sqrt` when the actual distance value is needed (e.g. for normalisation or screen projection).

---

## Code style
- This is a single-file vanilla JS + Three.js project. Do not introduce bundlers, npm packages, or build tools unless explicitly agreed.
- Section headers use the existing `// ══ SECTION NAME ══` style.
- Prefer `const` over `let` for values that don't change.
