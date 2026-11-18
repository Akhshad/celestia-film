# Celestia Banquets: Coming Soon

Scroll-driven coming soon page for **celestiabanquets.com** (Nagpur).

Scroll journey: Milky Way → solar system → Earth → India → Nagpur → through the clouds → a golden-hour 3D model of the building → a maroon satin drape falls over it with "Coming Soon".

Built with **Vite + TypeScript**. The journey is drawn on a 2D canvas; the 3D finale uses **Three.js** and is loaded lazily, so the galaxy appears instantly while the model downloads.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm run preview    # serve dist/ locally
```

## Project layout

| Path | What it is |
|---|---|
| `index.html` | Page markup and scroll captions (`.line` elements, `data-a`/`data-b` = scroll range) |
| `src/config.ts` | **Settings**: model URL, drape colour and text, 2D fallback photo |
| `src/main.ts` | Boot, scroll easing, frame loop, compositing of all layers |
| `src/timeline.ts` | Scroll progress → zoom level and globe rotation |
| `src/scenes/` | 2D canvas scenes: galaxy, solar system, Earth, clouds, 2D fallback ending |
| `src/geo/` | Coastline/city data and the dot layers built from it |
| `src/finale/` | Three.js finale: model loading, custom shaders, shadow map, bloom, drape |
| `public/celestia-hall.glb` | 3D model of the finished building on the real drone photo of the site (glTF 2.0) |
| `model/build_model.py` | Script that generates the model and its textures |

If WebGL2 or the model is unavailable, a flat 2D ending is shown instead.

## Settings

In `src/config.ts`:

- `MODEL_URL`: path to the 3D model
- `DRAPE_RGB`: drape colour
- `DRAPE_TOP`, `DRAPE_MAIN`, `DRAPE_BOTTOM`: text printed on the drape

Debug: in the browser console, `__celestia.setP(0.9)` jumps to a point in the journey (0–1).

## Deploy (Hostinger)

Hostinger serves static files, so the site has to be built first. `.github/workflows/deploy.yml` does that on every push to `main` and publishes `dist/` to the **`deploy`** branch.

hPanel → Websites → Dashboard → **Advanced → Git** → connect GitHub → pick this repo, branch **`deploy`**, directory blank (`public_html`).
Every push to `main` then builds and goes live automatically.

## Rebuilding the model

```bash
pip install numpy pillow
python3 model/build_model.py      # writes model/out/celestia-hall.glb
cp model/out/celestia-hall.glb public/
```

Uses the Lora font from `/usr/share/fonts/truetype/google-fonts/`; change `SERIF` in the script if it lives elsewhere.
