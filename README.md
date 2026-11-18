# Celestia Banquets — Coming Soon

Scroll-driven coming soon page for **celestiabanquets.com** (Nagpur).

Scroll journey: Milky Way → solar system → Earth → India → Nagpur → through the clouds → a golden-hour 3D model of the building → a maroon satin drape falls over it with "Coming Soon".

## Files

| File | What it is |
|---|---|
| `index.html` | The whole page (canvas + WebGL, no build step, no dependencies) |
| `celestia-hall.glb` | 3D model of the finished building on the real drone photo of the site (glTF 2.0) |
| `model/build_model.py` | Script that generates the model and its textures |
| `model/source/site-top.jpg` | Top-down drone frame used for the ground |

## Deploy (Hostinger)

hPanel → Websites → Dashboard → **Advanced → Git** → connect GitHub → pick this repo, branch `main`, directory blank (`public_html`).
Every push to `main` then goes live automatically.

`index.html` and `celestia-hall.glb` must sit in the same folder. Opening `index.html` straight from disk shows a 2D ending, because browsers block loading the model from local files; serve it over HTTP to see the 3D version (`python3 -m http.server`).

## Settings

At the top of the script in `index.html`:

- `MODEL_URL` – path to the 3D model
- `DRAPE_RGB` – drape colour
- `DRAPE_TOP`, `DRAPE_MAIN`, `DRAPE_BOTTOM` – text printed on the drape

The scroll captions are the `.line` elements in the HTML.

## Rebuilding the model

```bash
pip install numpy pillow
python3 model/build_model.py      # writes model/out/celestia-hall.glb
```

Uses the Lora font from `/usr/share/fonts/truetype/google-fonts/`; change `SERIF` in the script if it lives elsewhere.
