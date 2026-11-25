# Celestia Banquets: Coming Soon

Scroll-driven coming soon page for **celestiabanquets.com** (Nagpur).

Scroll journey: Milky Way → solar system → Earth → India → Nagpur → through the clouds → a golden-hour 3D model of the finished building, which dissolves into the architect's photoreal render.

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
| `src/config.ts` | **Settings**: model URL, landing point, Mapbox token, 2D fallback photo |
| `src/main.ts` | Boot, scroll easing, frame loop, compositing of all layers |
| `src/timeline.ts` | Scroll progress → zoom level and globe rotation |
| `src/scenes/` | 2D canvas scenes: galaxy, solar system, Earth, clouds, 2D fallback ending |
| `src/geo/` | Coastline/city data and the dot layers built from it |
| `src/finale/` | Three.js finale: model loading, custom shaders, shadow map, bloom |
| `public/celestia-hall.glb` | 3D model of the finished building, matched to the architect's renders, on the real drone photo of the site (glTF 2.0) |
| `model/build_model.py` | Script that generates the model and its textures |

If WebGL2 or the model is unavailable, a flat 2D ending is shown instead.

## Settings

In `src/config.ts`:

- `SITE`: `[longitude, latitude]` the Earth dive lands on (default: Nagpur city centre)
- `MODEL_URL`: path to the 3D model
- `RENDER_IMAGE`: the architect's aerial render (`public/celestia-render.jpg`). The 3D camera ends on the same viewpoint and this picture fades in over it; set to `null` to end on the 3D model. Swap in a higher-resolution copy of the same image whenever you have one.

**Satellite dive (Mapbox):** copy `.env.example` to `.env.local` and set `VITE_MAPBOX_TOKEN` to your public Mapbox token (`pk.…`). For the live site, add it as a GitHub Actions secret named `VITE_MAPBOX_TOKEN`. Without a token the dive uses NASA imagery only. Each visit loads ~150 satellite tiles, so watch your Mapbox usage.

Textures: planets/Earth from Solar System Scope (CC BY 4.0) and NASA. The credit line in the corner must stay.

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

The building's dimensions (pavilions, floor heights, wings, canopy) are constants at the top of the script, measured off the renders. The canopy sign uses the first serif font it finds (Lora, Liberation Serif or DejaVu Serif); change `SERIF` in the script to use another.
