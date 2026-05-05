# Digital Exhibition Faith

A browser-based 3D interactive experience for [Skin Deep magazine](https://skindeepmag.com), built with [Three.js](https://threejs.org/).

The visitor navigates a dimly lit liminal space, acting as a digital art exhibition, as a glowing orb, discovering floating geometric objects. Approaching and interacting with each object will trigger individual exhibition pieces

---

## How to deploy

This repo is set up for **Cloudflare static hosting with GitHub integration** — once linked, every push to `main` goes live automatically. No build step is required; the project is plain static files.

The experience is intended to be **embedded as an `<iframe>`** on the Skin Deep site:

```html
<iframe
  src="https://your-subdomain.skindeepmag.com"
  style="width:100%; height:100vh; border:none;"
  allow="fullscreen"
></iframe>
```

---

## Repository structure

```
digital_exhibition_faith.html   — The entire application (self-contained)
orb_tex.png        — Player orb texture
tile.png           — Floor and wall tile texture
```

All game logic, UI, and shaders live inside `digital_exhibition_faith.html`. There is no build process, bundler, or package manager.

---

## Running locally

1. Open a terminal in this folder and run:
   ```
   python -m http.server 8080
   ```
2. Open `http://localhost:8080/digital_exhibition_faith.html` in a browser.
3. Press `Ctrl+C` to stop.

> The page must be served over HTTP (not opened as a `file://` URL) because textures are loaded as separate files.

---

## Controls

| Desktop | Action |
|---|---|
| `W A S D` | Move |
| Mouse drag | Look around |
| `← →` arrow keys | Turn |
| `Space` | Interact with nearby object |

| Mobile | Action |
|---|---|
| Drag screen | Look around |
| On-screen joystick | Move |
| Tap interact button | Interact |

---
