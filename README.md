# Void Walker

A browser-based 3D interactive experience for [Skin Deep magazine](https://skindeepmag.com), built with [Three.js](https://threejs.org/).

The visitor navigates a dark infinite room as a glowing orb, discovering floating geometric objects. Approaching and interacting with each object reveals a short text fragment. Works on desktop and mobile.

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
void_walker.html   — The entire application (self-contained)
orb_tex.png        — Player orb texture
tile.png           — Floor and wall tile texture
start_server.txt   — How to run locally
```

All game logic, UI, and shaders live inside `void_walker.html`. There is no build process, bundler, or package manager.

---

## Running locally

1. Open a terminal in this folder and run:
   ```
   python -m http.server 8080
   ```
2. Open `http://localhost:8080/void_walker.html` in a browser.
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

## Development

Development files (texture source data, compression scripts, performance notes) are preserved on the `dev` branch.
