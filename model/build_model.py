"""
Celestia Banquets, Nagpur: finished-look 3D model, matched to the architect's renders.
Outputs textures + celestia-hall.glb (glTF 2.0 binary, Y-up, metres, front faces +Z).

Plan coordinates used below: x runs 0..L along the front, from the left end as seen from
the main road; z runs 0..D from the front wall to the back.  Pavilions, the entrance canopy
and the forecourt sit at z < 0.

Layout (renders + drone photo of the site):
  * front block across the full width, with three projecting pavilions (fluted pilasters,
    roundels, arched top windows, louvred strips, deep cornices) and two recessed bays;
  * two back wings, the wide one on the left (west) and the narrow one on the right (east),
    whose top storey is open to the sky;
  * the banquet hall between the wings, whose roof is a lawn terrace;
  * dark hipped entrance canopy with the lit CELESTIA sign, boundary wall with a gold jali
    panel, palms and warm uplighting.
"""
import json, struct, io, math, os, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)
rnd = random.Random(7)


def find_font(*paths):
    for p in paths:
        if os.path.exists(p):
            return p
    return None


SERIF = find_font('/usr/share/fonts/truetype/google-fonts/Lora-Variable.ttf',
                  '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf',
                  '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf')

# ---------------------------------------------------------------- dimensions (metres)
L, D = 67.0, 30.0          # footprint: x along the main road, z depth
FRONT_W = 10.0             # depth of the front block
LW_X1 = 21.0               # left (west, wide) wing: x 0..21
RW_X0 = 54.0               # right (east, narrow) wing: x 54..67
HH = 19.0                  # hall roof = lawn terrace
HP = 20.0                  # hall parapet top
TOP = 33.4                 # top of the outer walls
ROOF_F = 32.6              # front block roof
ROOF_W = 28.0              # wing roofs (their top storey is open to the sky)
FH = 34.6                  # height covered by the facade textures

# vertical grid shared by every elevation (measured off the front render)
GF_BAND = (4.9, 5.6)
LOWER = [(6.6, 8.5), (8.9, 11.0)]          # two stacked windows in the lower zone
BELT = (11.3, 12.0)
ROWS = [12.3, 15.6, 18.9, 22.2]            # upper floors, window bottoms
ROW_H = 2.0
TOPBAND = (24.9, 25.3)
TOPROW, TOPROW_H = 25.5, 2.1               # arched top row on the pavilions
ENT = (28.2, 30.1)                         # entablature over the pavilions' giant order
CORN0 = 30.8                               # cornice zone 30.8 .. top

# front pavilions: x range, projection, top of cornice
PAVS = [dict(x0=0.0, x1=18.0, kind='side', proj=1.0, top=34.2, inner=+1),
        dict(x0=22.8, x1=44.2, kind='centre', proj=1.5, top=34.5, inner=0),
        dict(x0=49.0, x1=67.0, kind='side', proj=1.0, top=34.2, inner=-1)]
BAYS = [(18.0, 22.8), (44.2, 49.0)]
CANOPY = dict(x0=20.5, x1=46.5, z0=-1.5, z1=-11.5, eave=4.5, fascia=3.5, ridge=6.4)


def P(x, y, z):            # plan (x from left, z from front) -> model (centred, front at +Z)
    return (x - L / 2, y, D / 2 - z)


# ================================================================ textures
WALL = (240, 226, 203)
WALL_L = (246, 236, 216)
WALL_D = (228, 213, 190)
TRIM = (250, 242, 226)
SHADE = (190, 176, 154)
FRAME = (36, 31, 28)                       # bronze window frames
WASH = (255, 224, 180)                     # warm uplight
RELIEF = {}                                # facade name -> raised parts, filled by the texture builders


def noise_layer(w, h, amp=6, blur=1.2, seed=1):
    g = np.random.default_rng(seed).normal(0, 1, (h, w)).astype(np.float32)
    im = Image.fromarray(np.clip(128 + g * 40, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))
    return (np.asarray(im).astype(np.float32) - 128) / 40 * amp


def add_noise(img, amp=5, blur=1.0, seed=1):
    a = np.asarray(img).astype(np.float32)
    a += noise_layer(img.width, img.height, amp, blur, seed)[..., None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


class Facade:
    """Draw an elevation in metres; (0,0) is the bottom-left corner as seen from outside."""
    def __init__(self, w_m, h_m, w_px, h_px, bg=WALL, seed=1):
        self.sx, self.sy = w_px / w_m, h_px / h_m
        self.w, self.h = w_px, h_px
        self.im = Image.new('RGB', (w_px, h_px), bg)
        self.d = ImageDraw.Draw(self.im, 'RGBA')
        self.rng = random.Random(seed)
        self.washes = []
        self.relief = []           # (x0, y0, x1, y1, depth): painted parts that are also built in 3D

    def raise_(self, x0, y0, x1, y1, d):
        if x1 - x0 > .02 and y1 - y0 > .02:
            self.relief.append((x0, y0, x1, y1, d))

    def X(self, x): return x * self.sx
    def Y(self, y): return self.h - y * self.sy

    def rect(self, x0, y0, x1, y1, fill, outline=None, width=1):
        self.d.rectangle([self.X(x0), self.Y(y1), self.X(x1) - 1, self.Y(y0) - 1], fill=fill, outline=outline, width=width)

    def ellipse(self, cx, cy, rx, ry, fill, outline=None, width=1):
        self.d.ellipse([self.X(cx - rx), self.Y(cy + ry), self.X(cx + rx), self.Y(cy - ry)], fill=fill, outline=outline, width=width)

    # ---- relief helpers: a lit top edge, a shadow under, so flat paint reads as depth
    def ledge(self, x0, x1, y0, y1, col=TRIM, shadow=.14, d=.1):
        if d:
            self.raise_(x0, y0, x1, y1, d)
        self.rect(x0, y0 - shadow, x1, y0, (150, 134, 112, 120))
        self.rect(x0, y0, x1, y1, col)
        self.rect(x0, y1 - .04, x1, y1, (255, 252, 244))
        self.rect(x0, y0, x1, y0 + .04, (214, 200, 178))

    def cornice(self, x0, x1, y0, y1, dentils=True):
        """stacked classical cornice from y0 (bottom) to y1 (top)"""
        h = y1 - y0
        self.rect(x0, y0 - .3, x1, y0, (140, 124, 102, 140))                # shadow under
        self.rect(x0, y0, x1, y0 + h * .18, TRIM)                            # bed moulding
        self.rect(x0, y0 + h * .18, x1, y0 + h * .2, (200, 186, 164))
        self.rect(x0, y0 + h * .2, x1, y0 + h * .55, WALL_L)                  # frieze
        if dentils:
            x = x0 + .12
            while x < x1 - .2:
                self.rect(x, y0 + h * .5, x + .16, y0 + h * .58, (214, 200, 178))
                x += .34
        self.rect(x0, y0 + h * .58, x1, y0 + h * .62, (196, 182, 160))       # shadow line
        self.rect(x0, y0 + h * .62, x1, y1 - h * .08, TRIM)                   # corona
        self.rect(x0, y1 - h * .32, x1, y1 - h * .3, (210, 196, 174))
        self.rect(x0, y1 - h * .08, x1, y1, (255, 252, 244))                  # lit crown

    def fluted(self, xc, y0, y1, w=1.6):
        self.rect(xc + w / 2, y0, xc + w / 2 + .14, y1, (160, 144, 120, 110))
        self.rect(xc - w / 2, y0, xc + w / 2, y1, WALL_L)
        self.rect(xc - w / 2, y0, xc - w / 2 + .06, y1, (255, 250, 240))
        self.rect(xc + w / 2 - .07, y0, xc + w / 2, y1, (212, 198, 176))
        n = 5
        for k in range(n):
            fx = xc - w / 2 + w * (k + .5) / n
            self.rect(fx - .045, y0 + .55, fx + .045, y1 - .65, (216, 203, 181))
            self.rect(fx + .045, y0 + .55, fx + .07, y1 - .65, (252, 247, 236))
        self.raise_(xc - w / 2, y0, xc + w / 2, y1 - .5, .24)
        self.raise_(xc - w / 2 - .16, y1 - .5, xc + w / 2 + .16, y1, .34)
        self.raise_(xc - w / 2 - .12, y0, xc + w / 2 + .12, y0 + .4, .3)
        self.rect(xc - w / 2 - .16, y1 - .5, xc + w / 2 + .16, y1, TRIM)            # capital
        self.rect(xc - w / 2 - .16, y1 - .55, xc + w / 2 + .16, y1 - .5, (170, 154, 130, 150))
        self.rect(xc - w / 2 - .12, y0, xc + w / 2 + .12, y0 + .4, TRIM)            # base

    def pier(self, xc, y0, y1, w=1.2, cap=True):
        self.rect(xc + w / 2, y0, xc + w / 2 + .12, y1, (160, 144, 120, 100))
        self.rect(xc - w / 2, y0, xc + w / 2, y1, WALL_L)
        self.rect(xc - w / 2, y0, xc - w / 2 + .05, y1, (255, 250, 240))
        self.rect(xc + w / 2 - .06, y0, xc + w / 2, y1, (214, 200, 178))
        self.raise_(xc - w / 2, y0, xc + w / 2, y1 - (.35 if cap else 0), .16)
        if cap:
            self.raise_(xc - w / 2 - .12, y1 - .35, xc + w / 2 + .12, y1, .24)
            self.rect(xc - w / 2 - .12, y1 - .35, xc + w / 2 + .12, y1, TRIM)
            self.rect(xc - w / 2 - .12, y1 - .4, xc + w / 2 + .12, y1 - .35, (170, 154, 130, 140))

    def pane(self, x0, y0, x1, y1, arch=False, leaves=None, lit=False, chand=True, transom=True):
        X0, X1, Y0, Y1 = int(self.X(x0)), int(self.X(x1)), int(self.Y(y1)), int(self.Y(y0))
        w, h = X1 - X0, Y1 - Y0
        if w < 3 or h < 3:
            return
        j = np.linspace(0, 1, h)[:, None]
        if lit:          # warm, brightly lit interior (ground-floor halls)
            top, bot = np.array([255, 222, 168]), np.array([214, 150, 84])
        else:            # warm room seen through dark glass: chandeliers, cool sky reflection at the top
            top, bot = np.array([58, 50, 46]), np.array([112, 80, 50])
        a = (top + (bot - top) * j)[:, None, :].repeat(w, 1).reshape(h, w, 3).astype(np.float32)
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        if not lit:
            refl = np.clip(1 - yy / (h * .45), 0, 1) ** 1.5 * .7
            a = a * (1 - refl[..., None]) + np.array([66, 82, 104]) * refl[..., None]
            if chand:   # chandeliers: one per ~1.4 m of width
                n = max(1, int(round((x1 - x0) / 1.4)))
                for k in range(n):
                    cx, cy, r = w * (k + .5) / n, h * .3, min(w / n, h) * .075
                    g = np.exp(-((xx - cx) ** 2 + ((yy - cy) * 1.4) ** 2) / (2 * r * r))
                    halo = np.exp(-((xx - cx) ** 2 + ((yy - cy) * .8) ** 2) / (2 * (r * 4.5) ** 2)) * .45
                    a = a * (1 - halo[..., None]) + np.array([176, 112, 62]) * halo[..., None]
                    a = a * (1 - g[..., None] * .9) + np.array([255, 222, 160]) * g[..., None] * .9
                    for dx in (-2.2, 2.2):        # wall lights either side
                        g2 = np.exp(-((xx - cx - dx * r * 2.4) ** 2 + ((yy - h * .45) * 1.2) ** 2) / (2 * (r * .7) ** 2)) * .6
                        a = a * (1 - g2[..., None]) + np.array([255, 210, 150]) * g2[..., None]
            for _ in range(int(w / 50) + 1):
                fx, fw = self.rng.uniform(0, w), self.rng.uniform(w * .05, w * .14)
                fh = self.rng.uniform(.1, .22) * h
                a[int(h - fh):, int(max(0, fx - fw)):int(min(w, fx + fw))] *= .6
        else:
            # furniture and people silhouettes against the warm light
            for _ in range(int(w / 40) + 1):
                fx, fw = self.rng.uniform(0, w), self.rng.uniform(w * .04, w * .12)
                fh = self.rng.uniform(.12, .3) * h
                a[int(h - fh):, int(max(0, fx - fw)):int(min(w, fx + fw))] *= .72
        g = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
        gd = ImageDraw.Draw(g)
        mw = max(2, int(.07 * self.sx))
        n = leaves or max(1, int(round((x1 - x0) / .85)))
        for k in range(1, n):
            mx = int(w * k / n)
            gd.rectangle([mx - mw // 2, 0, mx + mw // 2, h], fill=FRAME)
        if transom and h > w * .9:
            ty = int(h * .24)
            gd.rectangle([0, ty - mw // 2, w, ty + mw // 2], fill=FRAME)
        gd.rectangle([0, 0, w - 1, h - 1], outline=FRAME, width=mw)
        sh = max(2, int(.12 * self.sx))
        gd.rectangle([0, 0, w, sh], fill=(18, 18, 22))
        gd.rectangle([0, 0, sh, h], fill=(26, 26, 30))
        mask = None
        if arch:
            mask = Image.new('L', (w, h), 0)
            md = ImageDraw.Draw(mask)
            md.rectangle([0, w // 2, w, h], fill=255)
            md.ellipse([0, 0, w, w], fill=255)
        self.im.paste(g, (X0, Y0), mask)

    def window(self, xc, yb, w, h, arch=False, cap=False, sill=True, leaves=None, s=.13, chand=True):
        top = yb + h
        self.rect(xc - w / 2 - s + .07, yb - .1, xc + w / 2 + s + .07, top + s - .07, (150, 134, 112, 110))
        if arch:
            self.rect(xc - w / 2 - s, yb - .06, xc + w / 2 + s, top - w / 2, TRIM)
            self.ellipse(xc, top - w / 2, w / 2 + s, (w / 2 + s), TRIM)
        else:
            self.rect(xc - w / 2 - s, yb - .06, xc + w / 2 + s, top + s, TRIM)
        self.pane(xc - w / 2, yb, xc + w / 2, top, arch=arch, leaves=leaves, chand=chand)
        d = .14 if s >= .12 else .1
        self.raise_(xc - w / 2 - s, yb - .06, xc - w / 2, top - (w / 2 if arch else 0), d)
        self.raise_(xc + w / 2, yb - .06, xc + w / 2 + s, top - (w / 2 if arch else 0), d)
        if not arch:
            self.raise_(xc - w / 2, top, xc + w / 2, top + s, d)
        if sill:
            self.raise_(xc - w / 2 - .22, yb - .26, xc + w / 2 + .22, yb - .06, .26)
            self.rect(xc - w / 2 - .22, yb - .26, xc + w / 2 + .22, yb - .06, TRIM)
            self.rect(xc - w / 2 - .22, yb - .34, xc + w / 2 + .22, yb - .26, (150, 134, 112, 130))
        if arch:
            self.rect(xc - .14, top - .02, xc + .14, top + s + .14, TRIM)             # keystone
        if cap:
            self.raise_(xc - w / 2 - .3, top + s, xc + w / 2 + .3, top + s + .17, .24)
            self.rect(xc - w / 2 - .3, top + s, xc + w / 2 + .3, top + s + .17, TRIM)
            self.rect(xc - w / 2 - .3, top + s + .13, xc + w / 2 + .3, top + s + .17, (255, 252, 244))

    def small(self, xc, yb, w=.6, h=.72):
        self.window(xc, yb, w, h, sill=False, s=.1, leaves=1, chand=False)

    def louvre(self, x0, y0, x1, y1, step=.24):
        self.rect(x0, y0, x1, y1, (34, 31, 30))
        y = y0 + .05
        while y < y1 - .1:
            self.rect(x0 + .05, y, x1 - .05, y + .07, (176, 164, 148))
            self.rect(x0 + .05, y + .07, x1 - .05, y + .1, (70, 62, 56))
            y += step
        self.rect(x0 - .1, y0, x0, y1, TRIM); self.rect(x1, y0, x1 + .1, y1, TRIM)

    def roundel(self, cx, cy, r=.62):
        self.raise_(cx - r * .7, cy - r * .7, cx + r * .7, cy + r * .7, .08)
        self.ellipse(cx + .06, cy - .07, r + .16, r + .16, (150, 134, 112, 120))
        self.ellipse(cx, cy, r + .16, r + .16, TRIM)
        self.ellipse(cx, cy, r, r, (214, 201, 180))
        self.ellipse(cx, cy, r - .1, r - .1, WALL_L)

    def swag(self, cx, cy, w=1.5):
        """small carved ornament under a window"""
        self.rect(cx - w / 2, cy - .2, cx + w / 2, cy + .2, WALL_L)
        X0, X1, Yc = self.X(cx - w * .36), self.X(cx + w * .36), self.Y(cy)
        r = (X1 - X0) / 2
        self.d.arc([X0, Yc - r * .55, X1, Yc + r * .35], 15, 165, fill=(190, 174, 150), width=max(2, int(.05 * self.sx)))
        for k in (-1, 0, 1):
            self.ellipse(cx + k * w * .3, cy + .05, .07, .07, (196, 180, 156))

    def sconce(self, x, y):
        self.rect(x - .09, y - .16, x + .09, y + .16, (60, 54, 48))
        self.rect(x - .06, y + .02, x + .06, y + .14, (255, 230, 180))
        self.washes.append((x, y + .1, 1.4, .25, .7))
        self.washes.append((x, y - .1, -1.0, .22, .45))

    def uplight(self, x, y0, h, w=.5, k=.85):
        self.washes.append((x, y0, h, w, k))

    def apply_washes(self):
        """warm light pools thrown up the wall by spotlights at the base"""
        a = np.asarray(self.im).astype(np.float32)
        for (x, y0, h, w, k) in self.washes:
            up = h > 0
            h = abs(h)
            xa, xb = int(self.X(x - w * 3)), int(self.X(x + w * 3))
            if up:
                ya, yb = int(self.Y(y0 + h)), int(self.Y(y0))
            else:
                ya, yb = int(self.Y(y0)), int(self.Y(y0 - h))
            xa, ya = max(0, xa), max(0, ya)
            xb, yb = min(self.w, xb), min(self.h, yb)
            if xb <= xa or yb <= ya:
                continue
            yy, xx = np.mgrid[ya:yb, xa:xb].astype(np.float32)
            t = (yb - yy) / max(1, (h * self.sy)) if up else (yy - ya) / max(1, (h * self.sy))
            t = np.clip(t, 0, 1)
            dx = (xx - self.X(x)) / (w * self.sx * (.6 + 1.4 * t))
            al = k * .8 * (1 - t) ** 1.3 * np.exp(-dx * dx) + k * .5 * np.exp(-t * 10) * np.exp(-dx * dx * 3)
            al = np.clip(al, 0, .9)[..., None]
            a[ya:yb, xa:xb] = a[ya:yb, xa:xb] * (1 - al) + np.array(WASH) * al
        self.im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
        self.d = ImageDraw.Draw(self.im, 'RGBA')

    def finish(self, amp=3, seed=3, ao=True):
        self.apply_washes()
        if ao:
            a = np.asarray(self.im).astype(np.float32)
            yb = self.h - np.arange(self.h)[:, None]
            a *= (1 - .14 * np.exp(-(yb / (0.8 * self.sy))))[..., None]
            self.im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
        return add_noise(self.im, amp, 1.0, seed)


def shopfront(F, x0, x1, y0=.3, y1=4.4, bay=1.25):
    F.rect(x0 - .2, y0 - .05, x1 + .2, y1 + .2, TRIM)
    F.pane(x0, y0, x1, y1, lit=True, leaves=max(1, int(round((x1 - x0) / bay))), transom=False)
    F.rect(x0, y1 - .7, x1, y1 - .64, FRAME)


def plinth(F, x0, x1):
    F.rect(x0, 0, x1, .35, (204, 190, 166))
    F.rect(x0, .35, x1, .4, (230, 218, 196))


# ---------------------------------------------------------------- front elevation
def build_front():
    F = Facade(L, FH, 4096, 2112, seed=11)
    for bx0, bx1 in BAYS:          # recessed bays: a touch darker, plain panels
        F.rect(bx0, 0, bx1, TOP, WALL_D)
        for y in np.arange(GF_BAND[1] + 2.2, TOP - 1, 3.3):
            F.rect(bx0 + .2, y, bx1 - .2, y + .03, (210, 196, 172))
        F.rect(bx0, TOP - .5, bx1, TOP, TRIM)
        F.rect(bx0, TOP - .55, bx1, TOP - .5, (170, 154, 130, 150))
        shopfront(F, bx0 + 1.2, bx1 - 1.2, bay=.8)
        F.ledge(bx0, bx1, *GF_BAND)
        F.ledge(bx0, bx1, *BELT)
    for p in PAVS:
        x0, x1 = p['x0'], p['x1']
        c = (x0 + x1) / 2
        F.rect(x0, 0, x1, p['top'], WALL)
        plinth(F, x0, x1)
        # ground floor: tall lit shopfronts between stone piers
        if p['kind'] == 'centre':
            shopfront(F, x0 + 1.0, x1 - 1.0, bay=1.2)
        else:
            for a, b in [(x0 + 1.0, c - 3.6), (c - 2.6, c + 2.6), (c + 3.6, x1 - 1.0)]:
                shopfront(F, a, b, bay=1.1)
            for xp in (c - 3.1, c + 3.1):
                F.uplight(xp, .4, 4.2, .4, .7)
        F.ledge(x0, x1, *GF_BAND)
        # wall sconces along the lower zone
        if p['kind'] == 'centre':
            cols = [c - 7.05, c - 2.35, c + 2.35, c + 7.05]
            pils = [c - 4.7, c, c + 4.7]
            for xs in pils:
                F.sconce(xs, 9.6)
            F.pier(c - 9.6, GF_BAND[1], ENT[0], 1.3, cap=False)
            F.pier(c + 9.6, GF_BAND[1], ENT[0], 1.3, cap=False)
            wcol = 2.1
        else:
            cols = [c - 2.3, c + 2.3]
            pils = [c]
            for xs in (c - 4.5, c, c + 4.5):
                F.sconce(xs, 9.6)
            for sgn in (-1, 1):
                F.pier(c + sgn * 4.5, GF_BAND[1], ENT[0], 1.5, cap=False)
                xl = c + sgn * 6.4
                if sgn == p['inner']:        # louvred service strip on the side facing the centre
                    F.louvre(xl - .65, GF_BAND[1] + .6, xl + .65, BELT[0] - .2)
                    F.louvre(xl - .65, BELT[1] + .3, xl + .65, TOPBAND[0] - .2)
                    F.small(xl, TOPROW + .3, .9, 1.4)
                else:                         # narrow windows on the outer strip
                    for yb, yt in LOWER:
                        F.window(xl, yb + .2, .85, yt - yb - .3, sill=False, leaves=1, chand=False)
                    for yb in ROWS:
                        F.window(xl, yb, .85, ROW_H, sill=False, leaves=1)
                    F.window(xl, TOPROW, .85, 1.6, sill=False, leaves=1)
            wcol = 2.0
        for xc in cols:
            for yb, yt in LOWER:
                F.window(xc, yb, wcol, yt - yb, sill=False, leaves=2)
        F.ledge(x0, x1, *BELT)
        for xc in cols:
            for i, yb in enumerate(ROWS):
                F.window(xc, yb, wcol, ROW_H, leaves=2)
                if i > 0:
                    F.swag(xc, yb - .55, wcol * .8)
        for xp in pils:
            F.fluted(xp, BELT[1], TOPBAND[0], 1.7 if p['kind'] == 'centre' else 1.6)
            F.uplight(xp, BELT[1], 9.0, .7, .9)
            F.uplight(xp, GF_BAND[1], 3.5, .5, .55)
        F.ledge(x0 + .3, x1 - .3, *TOPBAND, shadow=.1)
        for xc in cols:
            F.window(xc, TOPROW, wcol, TOPROW_H, arch=True, sill=False, leaves=2)
        for xp in pils:
            F.roundel(xp, 27.0, .62)
        # entablature over the giant order, then attic and the main cornice
        hw = 10.2 if p['kind'] == 'centre' else 7.2
        F.rect(c - hw, ENT[0], c + hw, ENT[1], WALL_L)
        F.cornice(c - hw, c + hw, ENT[0], ENT[1], dentils=False)
        F.rect(x0, ENT[1], x1, CORN0, WALL)
        F.cornice(x0, x1, CORN0, p['top'])
        F.uplight(x0 + .5, BELT[1], 12, .5, .6)
        F.uplight(x1 - .5, BELT[1], 12, .5, .6)
    RELIEF['front'] = F.relief
    return F.finish(3, 11)


# ---------------------------------------------------------------- east side (ornate, faces the side road)
def build_east():
    W = D
    F = Facade(W, FH, 2048, 2048, seed=21)
    F.rect(0, 0, 1.6, TOP, WALL_L); F.rect(W - 1.6, 0, W, TOP, WALL_L)
    plinth(F, 0, W)
    pil = [2.4, 6.4, 9.9, 13.7, 16.3, 20.1, 23.6, 27.6]
    # ground floor: open, softly lit undercroft bays between the piers
    edges = [1.6] + pil[1:-1] + [W - 1.6]
    for a, b in zip(edges[:-1], edges[1:]):
        F.rect(a + .5, .35, b - .5, 4.3, (44, 38, 34))
        F.rect(a + .5, 3.9, b - .5, 4.3, (70, 60, 52))
        F.rect((a + b) / 2 - .25, 4.05, (a + b) / 2 + .25, 4.2, (255, 226, 170))
        F.washes.append(((a + b) / 2, 4.0, -3.5, (b - a) * .25, .55))
    F.ledge(0, W, *GF_BAND)
    for xp in pil:
        F.pier(xp, GF_BAND[1], 28.0, .9)
        F.uplight(xp, GF_BAND[1], 9.0, .45, .85)
        F.uplight(xp, BELT[1], 7.0, .4, .5)
    major = [(4.4, 1.6, 1), (11.8, 3.0, 2), (18.2, 3.0, 2), (25.6, 1.6, 1)]
    smalls = [8.15, 14.55, 15.45, 21.85]
    for xc, w, lv in major:
        for yb, yt in LOWER:
            F.window(xc, yb, w, yt - yb, sill=False, leaves=lv * 2 if lv == 2 else 1)
    for xs in smalls:
        for yb, yt in LOWER:
            F.small(xs, (yb + yt) / 2 - .36)
    F.ledge(0, W, *BELT)
    for xc, w, lv in major:
        for yb in ROWS + [TOPROW]:
            F.window(xc, yb, w, ROW_H, leaves=lv * 2 if lv == 2 else 1)
        F.rect(xc - w / 2 - .5, 27.7, xc + w / 2 + .5, 28.0, TRIM)
    for xs in smalls:
        for yb in ROWS + [TOPROW]:
            F.small(xs, yb + .6)
    F.ledge(1.2, W - 1.2, 28.0, 28.8)
    for xc, w, lv in major:
        F.rect(xc - w / 2 - .2, 29.1, xc + w / 2 + .2, 30.3, WALL_L, outline=(214, 200, 178), width=3)
    F.cornice(0, W, CORN0, 34.2)
    RELIEF['east'] = F.relief
    return F.finish(3, 21)


# ---------------------------------------------------------------- west side (plain, faces the neighbours)
def build_west():
    """left 0..20 m = the wide back wing (open loggia on top), right 20..30 m = the front block"""
    W = D
    F = Facade(W, FH, 2048, 2048, seed=31)
    plinth(F, 0, W)
    F.rect(20.0, 0, 20.25, TOP, (214, 200, 178))
    F.ledge(0, W, *GF_BAND)
    cols = [3.0, 6.5, 10.0, 13.5, 17.0]
    rows = [12.4, 15.6, 18.8, 22.0, 25.0]
    for x in (6.0, 10.0, 14.0):
        F.window(x, 7.2, 2.2, 1.0, sill=False, leaves=3)
    F.ledge(0, W, *BELT)
    for i, yb in enumerate(rows):
        F.ledge(.6, 19.4, yb - .55, yb - .4, shadow=.08)
        for xc in cols:
            F.window(xc, yb, 1.5, 1.6, cap=True, leaves=2)
            F.uplight(xc + 1.75, yb - .4, 2.6, .35, .55)
    for k in range(9):                                   # corbels under the lowest band
        F.rect(1.5 + k * 2.1, rows[0] - 1.0, 1.9 + k * 2.1, rows[0] - .55, TRIM)
    # open loggia in the wing's top storey
    lx = [0.8, 4.6, 8.4, 12.2, 16.0, 19.6]
    F.rect(.4, ROOF_W - .2, 19.9, CORN0 - .2, (40, 34, 30))
    for a, b in zip(lx[:-1], lx[1:]):
        F.rect(a + .35, ROOF_W, b - .35, ROOF_W + .6, (180, 130, 80))
        F.rect((a + b) / 2 - .3, CORN0 - .55, (a + b) / 2 + .3, CORN0 - .45, (255, 226, 170))
        F.washes.append(((a + b) / 2, CORN0 - .5, -2.4, 1.0, .6))
    for x in lx:
        F.pier(x, ROOF_W - .2, CORN0 - .2, .7, cap=False)
    # front block end: one column of narrow windows
    for yb in rows:
        F.window(21.6, yb, .9, 1.6, sill=False, leaves=1)
    F.window(21.6, 28.2, .9, 1.6, sill=False, leaves=1)
    F.cornice(0, W, CORN0, 34.2)
    RELIEF['west'] = F.relief
    return F.finish(3, 31)


# ---------------------------------------------------------------- back of the two wings (atlas 13 m + 21 m)
def build_back():
    W = 34.0
    F = Facade(W, FH, 2048, 2048, seed=41)
    plinth(F, 0, W)
    F.ledge(0, W, 6.2, 6.7)
    rows = [7.6] + ROWS + [TOPROW]
    def wing(o, piers, bigs, smalls):
        for xp, pw in piers:
            F.pier(o + xp, 6.7, 28.0, pw)
            F.uplight(o + xp, 6.7, 10, .5, .85)
            F.uplight(o + xp, .4, 5.5, .4, .55)
        for xb in bigs:
            for yb in rows:
                F.window(o + xb, yb, 2.0, 1.85, cap=True, leaves=2)
        for xs in smalls:
            for yb in rows:
                F.small(o + xs, yb + .55, .7, .8)
        F.ledge(o, o + piers[-1][0] + .8, 28.0, 28.7)
    wing(0.0, [(.9, 1.2), (6.6, 1.0), (12.1, 1.2)], [3.75], [8.6, 10.4])
    wing(13.0, [(1.0, 1.2), (7.6, 1.0), (13.4, 1.0), (20.0, 1.2)], [4.3, 16.7], [9.7, 11.3])
    F.rect(12.95, 0, 13.05, TOP, (200, 186, 164))
    F.cornice(0, W, CORN0, 34.2)
    RELIEF['back'] = F.relief
    return F.finish(3, 41)


# ---------------------------------------------------------------- back elevation of the hall + front block above the lawn
def build_hall():
    W = 33.0
    F = Facade(W, FH, 2048, 2048, seed=51)
    plinth(F, 0, W)
    F.ledge(0, W, 4.6, 5.0)
    pairs = [3.0 + 5.4 * k for k in range(6)]
    for yb in (6.4, 12.2):
        F.ledge(.4, W - .4, yb - .5, yb - .32, shadow=.08)
        for xc in pairs:
            for s in (-1, 1):
                F.window(xc + s * .98, yb, 1.85, 1.25, sill=False, leaves=2, chand=True)
        F.ledge(.4, W - .4, yb + 1.55, yb + 1.85)
    for x in np.arange(1.6, W, 3.3):
        F.uplight(x, .4, 5.5, .5, .7)
        F.uplight(x, 8.05, 3.8, .45, .5)
        F.uplight(x, 14.05, 4.2, .45, .5)
    F.rect(0, HP - .35, W, HP, TRIM)
    F.rect(0, HP - .4, W, HP - .35, (170, 154, 130, 150))
    # front block's back wall, seen above the lawn
    F.rect(0, HP, W, TOP, WALL_D)
    for x in np.arange(5.5, W, 5.5):
        F.rect(x - .02, HP, x + .02, TOP - .6, (206, 192, 168))
    lx = [9.5, 13.0, 16.5, 20.0, 23.5]
    F.rect(lx[0], HP, lx[-1], HP + 3.0, (44, 36, 30))
    for a, b in zip(lx[:-1], lx[1:]):
        F.rect(a + .3, HP, b - .3, HP + .5, (200, 150, 96))
        F.rect((a + b) / 2 - .3, HP + 2.7, (a + b) / 2 + .3, HP + 2.8, (255, 226, 170))
    for x in lx:
        F.pier(x, HP, HP + 3.0, .55, cap=False)
    F.ledge(lx[0] - .5, lx[-1] + .5, HP + 3.0, HP + 3.5)
    for x in np.arange(2.75, W, 5.5):
        F.uplight(x, HP + .05, 6.5, .55, .7)
    F.rect(0, TOP - .5, W, TOP, TRIM)
    RELIEF['hall'] = F.relief
    return F.finish(3, 51)


# ---------------------------------------------------------------- courtyard faces of the wings (above the hall roof)
def build_court():
    W = 20.0
    F = Facade(W, FH, 1024, 2048, bg=WALL_D, seed=61)
    for yb in (HH + .9, HH + 4.1, ROOF_W + 1.0):
        for xc in (2.5, 6.25, 10.0, 13.75, 17.5):
            F.window(xc, yb, 1.3, 1.6, leaves=2)
    for x in (4.4, 11.9):
        F.uplight(x, HP, 6, .5, .6)
    F.rect(0, ROOF_W - .3, W, ROOF_W, TRIM)
    F.rect(0, TOP - .45, W, TOP, TRIM)
    return F.finish(3, 61, ao=False)


def build_roof():
    n = 1024
    im = Image.new('RGB', (n, n), (192, 188, 180))
    d = ImageDraw.Draw(im)
    step = n / (8 / .75)
    for k in range(int(n / step) + 1):
        d.line([(k * step, 0), (k * step, n)], fill=(174, 170, 162), width=3)
        d.line([(0, k * step), (n, k * step)], fill=(174, 170, 162), width=3)
    im = add_noise(im, 6, 2.5, 21)
    st = Image.new('L', (n, n), 0)
    sd = ImageDraw.Draw(st)
    for _ in range(14):
        x, y, r = rnd.uniform(0, n), rnd.uniform(0, n), rnd.uniform(30, 120)
        sd.ellipse([x - r, y - r, x + r, y + r], fill=rnd.randint(6, 18))
    st = st.filter(ImageFilter.GaussianBlur(40))
    return ImageChops.subtract(im, Image.merge('RGB', [st, st, st]))


def build_plain():
    return add_noise(Image.new('RGB', (512, 512), WALL), 4, 1.5, 71)


def build_trim():
    return add_noise(Image.new('RGB', (256, 256), TRIM), 3, 1.2, 72)


def build_terrace():
    """hall roof (33 m x 20 m) lawn, top view; image top = the front block side"""
    W, H = 2048, 1240
    sx, sy = W / 33.0, H / 20.0
    im = Image.new('RGB', (W, H), (216, 206, 188))
    d = ImageDraw.Draw(im, 'RGBA')
    def rect(x0, z0, x1, z1, fill):
        d.rectangle([x0 * sx, z0 * sy, x1 * sx, z1 * sy], fill=fill)
    for x in np.arange(0, 33, .8):
        d.line([(x * sx, 0), (x * sx, H)], fill=(202, 192, 172), width=2)
    for z in np.arange(0, 20, .8):
        d.line([(0, z * sy), (W, z * sy)], fill=(202, 192, 172), width=2)
    rect(2.2, 2.6, 30.8, 18.6, (196, 186, 166))
    for k, x in enumerate(np.arange(2.4, 30.6, 1.6)):           # mown stripes
        rect(x, 2.8, x + 1.6, 18.4, (96, 146, 56) if k % 2 else (106, 156, 62))
    for (x0, z0, x1, z1) in [(1.0, 1.0, 32.0, 1.9), (1.0, 1.9, 1.9, 19.2), (31.1, 1.9, 32.0, 19.2)]:
        rect(x0, z0, x1, z1, (44, 78, 34))
    for x in np.arange(1.6, 32, 1.1):
        d.ellipse([(x - .38) * sx, (1.45 - .38) * sy, (x + .38) * sx, (1.45 + .38) * sy], fill=(66, 104, 46))
    for x in (2.2, 8.0, 25.0, 30.8):                             # ornamental shrubs at the back corners
        for z in (19.0,):
            d.ellipse([(x - .5) * sx, (z - .5) * sy, (x + .5) * sx, (z + .5) * sy], fill=(58, 96, 42))
    im = add_noise(im, 5, 1.2, 81)
    return im


def build_fascia(text='CELESTIA'):
    W, H = 4096, 160
    im = Image.new('RGB', (W, H), (40, 38, 40))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 5], fill=(90, 86, 84))
    d.rectangle([0, H - 8, W, H], fill=(255, 214, 150))      # concealed light strip under the edge
    f = ImageFont.truetype(SERIF, 118) if SERIF else ImageFont.load_default()
    try:
        f.set_variation_by_name('Medium')
    except Exception:
        pass
    spacing = 26
    widths = [d.textlength(ch, font=f) for ch in text]
    total = sum(widths) + spacing * (len(text) - 1)
    x = (W - total) / 2
    for ch, wch in zip(text, widths):
        d.text((x, 12), ch, font=f, fill=(255, 224, 160))
        x += wch + spacing
    glow = im.filter(ImageFilter.GaussianBlur(6))
    return ImageChops.lighter(im, Image.blend(im, glow, .5))


def build_metal():
    """dark standing-seam roofing for the canopy"""
    im = Image.new('RGB', (512, 512), (62, 54, 48))
    d = ImageDraw.Draw(im)
    for x in range(0, 512, 32):
        d.line([(x, 0), (x, 512)], fill=(86, 78, 70), width=3)
        d.line([(x + 3, 0), (x + 3, 512)], fill=(40, 36, 34), width=2)
    return add_noise(im, 3, 1, 91)


def build_jali():
    """gold lattice screen (laser-cut star pattern)"""
    n = 384
    im = Image.new('RGB', (n * 4, n), (92, 66, 34))
    d = ImageDraw.Draw(im)
    cell = 26
    for gy in range(-1, n // cell + 2):
        for gx in range(-1, 4 * n // cell + 2):
            cx, cy = gx * cell + (cell / 2 if gy % 2 else 0), gy * cell * .87
            r = cell * .5
            pts = []
            for i in range(16):
                a = i * math.pi / 8
                rr = r if i % 2 == 0 else r * .62
                pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
            d.line(pts + [pts[0]], fill=(226, 184, 112), width=3)
            d.ellipse([cx - r * .2, cy - r * .2, cx + r * .2, cy + r * .2], outline=(226, 184, 112), width=2)
    d.rectangle([0, 0, 4 * n - 1, n - 1], outline=(236, 196, 124), width=9)
    return add_noise(im, 4, 1, 92)


def build_lamp():
    return Image.new('RGB', (64, 64), (255, 200, 128))


def build_foliage():
    im = Image.new('RGB', (256, 256), (92, 132, 62))
    a = np.asarray(im).astype(np.float32)
    a += noise_layer(256, 256, 22, 2.5, 61)[..., None] * np.array([.6, 1, .5])
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def build_trunk():
    return add_noise(Image.new('RGB', (64, 64), (112, 96, 78)), 8, 1, 71)


# ---------------------------------------------------------------- ground (real aerial photo, cleaned plot)
G_W, G_H = 215.0, 107.5            # metres covered by the site texture
G_PXW, G_PXH = 4096, 2048
SUN = np.array([-0.55, 0.75, -0.4]); SUN = SUN / np.linalg.norm(SUN)   # matches the finale's sun (back left)
PLOT = (-45.0, -20.5, 51.0, 38.0)  # x0, z0(back), x1, z1(front) in model metres
GATES = [(-26.5, -19.5), (19.5, 26.5)]
JALI = (-8.0, 8.0)


def build_ground(trees):
    src = Image.open(os.path.join(HERE, 'source', 'site-top.jpg')).convert('RGB')
    # The drone photo has the main road at the top. Mirrored left-right it is laid out the way the
    # ground plane is mapped (texture top = front), so the side road ends up on the building's right
    # and the wide wing on its left, as on site.
    src = src.transpose(Image.FLIP_LEFT_RIGHT)
    cx, cy = src.width - 1 - 1903, 1128      # roof centre in the (mirrored) frame
    rot = src.convert('RGBA').rotate(-6.15, resample=Image.BICUBIC, center=(cx, cy), expand=False, fillcolor=(0, 0, 0, 0))
    base = rot.copy()
    for flip in (Image.FLIP_LEFT_RIGHT, Image.FLIP_TOP_BOTTOM, Image.ROTATE_180):
        fl = rot.transpose(flip)
        holes = base.split()[3].point(lambda v: 255 if v < 250 else 0)
        base.paste(fl, (0, 0), holes)
    src = Image.alpha_composite(Image.new('RGBA', base.size, (120, 118, 112, 255)), base).convert('RGB')
    m_per_px = 0.055                       # ground scale from parked cars
    s = (G_PXW / G_W) * m_per_px
    big = src.resize((int(src.width * s), int(src.height * s)), Image.LANCZOS)
    bcx, bcy = cx * s, cy * s
    canvas = Image.new('RGB', (G_PXW, G_PXH), (120, 118, 112))
    ox, oy = int(G_PXW / 2 - bcx), int(G_PXH / 2 - bcy)
    for fx in (-1, 0, 1):
        for fy in (-1, 0, 1):
            tile = big
            if fx: tile = tile.transpose(Image.FLIP_LEFT_RIGHT)
            if fy: tile = tile.transpose(Image.FLIP_TOP_BOTTOM)
            canvas.paste(tile, (ox + fx * big.width, oy + fy * big.height))
    canvas.paste(big, (ox, oy))
    far = canvas.copy()
    g = canvas
    d = ImageDraw.Draw(g, 'RGBA')
    sx = G_PXW / G_W
    TX = lambda x: (x + G_W / 2) * sx
    TY = lambda z: (G_H / 2 - z) * sx
    def poly(pts, fill):
        d.polygon([(TX(x), TY(z)) for x, z in pts], fill=fill)
    def rect(x0, z0, x1, z1, fill):
        d.rectangle([TX(x0), TY(z1), TX(x1), TY(z0)], fill=fill)
    def line(pts, fill, w):
        d.line([(TX(x), TY(z)) for x, z in pts], fill=fill, width=int(w * sx), joint='curve')
        for x, z in pts:
            r = w * sx / 2
            d.ellipse([TX(x) - r, TY(z) - r, TX(x) + r, TY(z) + r], fill=fill)
    x0, z0, x1, z1 = PLOT
    # stone paving over the whole plot, laid in bands like the renders
    rect(x0, z0, x1, z1, (196, 184, 166))
    for k, z in enumerate(np.arange(z0, z1, 1.2)):
        if k % 3 == 0:
            rect(x0, z, x1, z + 1.2, (176, 162, 142))
    for x in np.arange(x0, x1, 1.2):
        d.line([(TX(x), TY(z1)), (TX(x), TY(z0))], fill=(184, 172, 154), width=1)
    LAWN = (90, 128, 58)
    # west strip and back strip: lawn with trees
    rect(x0 + .8, z0 + .8, -35.5, 14.0, LAWN)
    rect(x0 + .8, z0 + .8, x1 - .8, -16.8, LAWN)
    # east side: driveway along the side road (render: striped paving + planter strip)
    for k, x in enumerate(np.arange(35.0, x1 - 2.0, 1.4)):
        rect(x, -16.0, x + 1.4, 16.0, (160, 146, 126) if k % 2 else (186, 172, 152))
    rect(x1 - 2.2, -16.0, x1 - .8, 30.0, (70, 98, 48))
    # driveway loop from the two gates under the canopy
    DRV = (150, 138, 122)
    drive = [(-23.0, 39.0), (-23.0, 30.0), (-16.0, 21.8), (16.0, 21.8), (23.0, 30.0), (23.0, 39.0)]
    line(drive, (214, 204, 186), 7.8)
    line(drive, DRV, 6.6)
    rect(-13.0, 16.4, 13.0, 26.5, (210, 200, 182))                # drop-off under the canopy
    for x in np.arange(-13.0, 13.0, .9):
        d.line([(TX(x), TY(26.5)), (TX(x), TY(16.4))], fill=(196, 186, 166), width=1)
    # island between the driveway and the jali wall: lawn with low planting
    poly([(-14.5, 28.6), (14.5, 28.6), (18.2, 36.6), (-18.2, 36.6)], (214, 204, 186))
    poly([(-13.8, 29.2), (13.8, 29.2), (17.2, 36.0), (-17.2, 36.0)], LAWN)
    # palm planters in the forecourt
    for px, pz, _, _ in trees:
        if abs(px) > 25 and 16 < pz < 34:
            rect(px - 1.6, pz - 1.6, px + 1.6, pz + 1.6, (214, 204, 186))
            rect(px - 1.3, pz - 1.3, px + 1.3, pz + 1.3, (64, 92, 44))
    # planting strip inside the front wall
    rect(x0 + .5, z1 - 1.6, x1 - .5, z1 - .4, (62, 92, 44))
    for g0, g1 in GATES:
        rect(g0, z1 - 1.7, g1, z1 + .3, DRV)
    # compound wall line (geometry sits on top)
    for (a, b) in [((x0, z1), (x1, z1)), ((x0, z0), (x0, z1)), ((x1, z0), (x1, z1)), ((x0, z0), (x1, z0))]:
        d.line([(TX(a[0]), TY(a[1])), (TX(b[0]), TY(b[1]))], fill=(230, 222, 206), width=int(.5 * sx))
    # under the building (hidden) - darken
    rect(-L / 2 - .2, -D / 2 - .2, L / 2 + .2, D / 2 + 1.7, (70, 68, 64))
    # ---- baked soft shadows (building, canopy, trees) + contact AO
    sh = Image.new('L', (G_PXW, G_PXH), 0)
    sd = ImageDraw.Draw(sh)
    off = lambda h: (-SUN[0] / SUN[1] * h, -SUN[2] / SUN[1] * h)
    def shadow_box(px0, pz0, px1, pz1, h, val=255, hb=0.0):
        o0, o1 = off(hb), off(h)
        corners = [(px0, pz0), (px1, pz0), (px1, pz1), (px0, pz1)]
        pts = sorted(set([(x + o0[0], z + o0[1]) for x, z in corners] + [(x + o1[0], z + o1[1]) for x, z in corners]))
        def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
        lo, up = [], []
        for p in pts:
            while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
            lo.append(p)
        for p in reversed(pts):
            while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
            up.append(p)
        sd.polygon([(TX(x), TY(z)) for x, z in lo[:-1] + up[:-1]], fill=val)
    mz = lambda zp: D / 2 - zp
    mx = lambda xp: xp - L / 2
    shadow_box(mx(0), mz(FRONT_W), mx(L), mz(-1.5), TOP, 150)
    shadow_box(mx(0), mz(D), mx(LW_X1), mz(FRONT_W), TOP, 150)
    shadow_box(mx(RW_X0), mz(D), mx(L), mz(FRONT_W), TOP, 150)
    shadow_box(mx(LW_X1), mz(D), mx(RW_X0), mz(FRONT_W), HP, 150)
    shadow_box(mx(CANOPY['x0']), mz(CANOPY['z0']), mx(CANOPY['x1']), mz(CANOPY['z1']), CANOPY['ridge'], 140, CANOPY['fascia'])
    for (tx, tz, r, h) in trees:
        o = off(h * .8)
        sd.ellipse([TX(tx + o[0] - r), TY(tz + o[1] + r * .9), TX(tx + o[0] + r), TY(tz + o[1] - r * .9)], fill=120)
    sh = sh.filter(ImageFilter.GaussianBlur(10))
    ao = Image.new('L', (G_PXW, G_PXH), 0)
    ImageDraw.Draw(ao).rectangle([TX(-L / 2 - 1.2), TY(D / 2 + 2.6), TX(L / 2 + 1.2), TY(-D / 2 - 1.2)], fill=255)
    ao = ao.filter(ImageFilter.GaussianBlur(14))
    a = np.asarray(g).astype(np.float32)
    k = 1 - .22 * (np.asarray(ao).astype(np.float32) / 255) - .3 * (np.asarray(sh).astype(np.float32) / 255)
    a *= np.clip(k, .35, 1)[..., None]
    g = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    # far ground: same photo, but the plot is replaced by the houses behind it (so mirrored copies never repeat the site)
    px0, pz0, px1, pz1 = -47, -23, 53, 41
    bw, bh = int((px1 - px0) * sx), int((pz1 - pz0) * sx)
    fa = np.asarray(far)
    r0 = int(TY(pz0))
    avail = fa.shape[0] - r0
    rows = [r0 + (k % (2 * avail) if k % (2 * avail) < avail else 2 * avail - 1 - k % (2 * avail)) for k in range(bh)]
    c0 = int(TX(px0))
    patch = Image.fromarray(fa[rows][:, c0:c0 + bw]).transpose(Image.FLIP_TOP_BOTTOM)
    mask = Image.new('L', (bw, bh), 0)
    ImageDraw.Draw(mask).rectangle([60, 60, bw - 60, bh - 60], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(30))
    far.paste(patch, (int(TX(px0)), int(TY(pz1))), mask)
    far = far.filter(ImageFilter.GaussianBlur(1.2)).resize((2048, 1024), Image.LANCZOS)
    return g, far


# ================================================================ geometry
class Mesh:
    def __init__(self, name, tex, wrap='repeat'):
        self.name, self.tex, self.wrap = name, tex, wrap
        self.pos, self.nor, self.uv, self.idx = [], [], [], []

    def quad(self, a, b, c, d, uva, uvb, uvc, uvd):
        """a,b,c,d counter-clockwise when seen from the outside"""
        a, b, c, d = map(np.array, (a, b, c, d))
        n = np.cross(b - a, d - a); n = n / (np.linalg.norm(n) or 1)
        base = len(self.pos)
        for p, t in zip((a, b, c, d), (uva, uvb, uvc, uvd)):
            self.pos.append(p.tolist()); self.nor.append(n.tolist()); self.uv.append(list(t))
        self.idx += [base, base + 1, base + 2, base, base + 2, base + 3]

    def tri(self, a, b, c, uva, uvb, uvc):
        a, b, c = map(np.array, (a, b, c))
        n = np.cross(b - a, c - a); n = n / (np.linalg.norm(n) or 1)
        base = len(self.pos)
        for p, t in zip((a, b, c), (uva, uvb, uvc)):
            self.pos.append(p.tolist()); self.nor.append(n.tolist()); self.uv.append(list(t))
        self.idx += [base, base + 1, base + 2]

    def tri_mesh(self, verts, norms, uvs, faces):
        base = len(self.pos)
        self.pos += [list(v) for v in verts]; self.nor += [list(n) for n in norms]; self.uv += [list(u) for u in uvs]
        for f in faces:
            self.idx += [base + f[0], base + f[1], base + f[2]]


NAMES = ['front', 'east', 'west', 'back', 'hall', 'court', 'roof', 'terrace', 'plain', 'trim', 'metal',
         'fascia', 'jali', 'lamp', 'foliage', 'trunk']
M = {'groundfar': Mesh('groundfar', 'groundfar', 'mirror'), 'ground': Mesh('ground', 'ground', 'clamp')}
M.update({k: Mesh(k, k) for k in NAMES})
for k in ('front', 'east', 'west', 'back', 'hall', 'terrace', 'fascia', 'jali'):
    M[k].wrap = 'clamp'


def wall(mesh, p0, p1, y0, y1, u0=None, u1=None, s=None):
    """Vertical wall between plan points p0 -> p1, outside on the left of the walk direction seen from
    above-front, i.e. the walk runs left -> right as seen from outside.  Elevation textures map u0..u1
    across and y/FH up; tiling materials (s given) use metres / s."""
    (x0, z0), (x1, z1) = p0, p1
    a, b, c, d = P(x0, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z0)
    if s is not None:
        ln = math.hypot(x1 - x0, z1 - z0)
        mesh.quad(a, b, c, d, (0, -y0 / s), (ln / s, -y0 / s), (ln / s, -y1 / s), (0, -y1 / s))
    else:
        v0, v1 = 1 - y0 / FH, 1 - y1 / FH
        mesh.quad(a, b, c, d, (u0, v0), (u1, v0), (u1, v1), (u0, v1))


def box(mesh, x0, y0, z0, x1, y1, z1, s=4.0, faces='nsewtb'):
    """axis aligned box in MODEL coords; uv in metres / s.  n = +Z (front), s = -Z, e = +X, w = -X"""
    if 't' in faces:
        mesh.quad((x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0), (x0 / s, z1 / s), (x1 / s, z1 / s), (x1 / s, z0 / s), (x0 / s, z0 / s))
    if 'b' in faces:
        mesh.quad((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1), (x0 / s, z0 / s), (x1 / s, z0 / s), (x1 / s, z1 / s), (x0 / s, z1 / s))
    if 'n' in faces:
        mesh.quad((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1), (x0 / s, -y0 / s), (x1 / s, -y0 / s), (x1 / s, -y1 / s), (x0 / s, -y1 / s))
    if 's' in faces:
        mesh.quad((x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (-x1 / s, -y0 / s), (-x0 / s, -y0 / s), (-x0 / s, -y1 / s), (-x1 / s, -y1 / s))
    if 'e' in faces:
        mesh.quad((x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (-z1 / s, -y0 / s), (-z0 / s, -y0 / s), (-z0 / s, -y1 / s), (-z1 / s, -y1 / s))
    if 'w' in faces:
        mesh.quad((x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0), (z0 / s, -y0 / s), (z1 / s, -y0 / s), (z1 / s, -y1 / s), (z0 / s, -y1 / s))


def pbox(mesh, x0, x1, y0, y1, z0, z1, s=2.0, faces='nsewtb'):
    """box in PLAN coords (z from the front wall backwards); faces named in model terms"""
    box(mesh, x0 - L / 2, y0, D / 2 - z1, x1 - L / 2, y1, D / 2 - z0, s=s, faces=faces)


def cylinder(mesh, cx, cz, r, y0, y1, seg=14, s=2.0, cap=True, r1=None):
    r1 = r if r1 is None else r1
    verts, norms, uvs, faces = [], [], [], []
    for i in range(seg + 1):
        a = i / seg * 2 * math.pi
        x, z = math.cos(a), math.sin(a)
        verts += [(cx + r * x, y0, cz + r * z), (cx + r1 * x, y1, cz + r1 * z)]
        norms += [(x, 0, z), (x, 0, z)]
        uvs += [(i / seg * 2 * math.pi * r / s, -y0 / s), (i / seg * 2 * math.pi * r / s, -y1 / s)]
    for i in range(seg):
        a, b, c, d = 2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1
        faces += [(a, d, c), (a, c, b)]
    mesh.tri_mesh(verts, norms, uvs, faces)
    if cap:
        cv, cn, cu, cf = [(cx, y1, cz)], [(0, 1, 0)], [(cx / s, cz / s)], []
        for i in range(seg):
            a = i / seg * 2 * math.pi
            cv.append((cx + r1 * math.cos(a), y1, cz + r1 * math.sin(a))); cn.append((0, 1, 0))
            cu.append(((cx + r1 * math.cos(a)) / s, (cz + r1 * math.sin(a)) / s))
        for i in range(seg):
            cf.append((0, 1 + (i + 1) % seg, 1 + i))
        mesh.tri_mesh(cv, cn, cu, cf)


def blob(mesh, cx, cz, r, cy, rr, squash=.85):
    # icosphere (1 subdivision) blob canopy
    t = (1 + 5 ** .5) / 2
    V = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t), (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    F = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    V = [np.array(v) / np.linalg.norm(v) for v in V]
    cache = {}
    def mid(i, j):
        k = (min(i, j), max(i, j))
        if k not in cache:
            m = (V[i] + V[j]) / 2; V.append(m / np.linalg.norm(m)); cache[k] = len(V) - 1
        return cache[k]
    F2 = []
    for a, b, c in F:
        ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
        F2 += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
    verts, norms, uvs = [], [], []
    for v in V:
        p = v * (1 + rr.uniform(-.13, .13))
        verts.append((cx + p[0] * r, cy + p[1] * r * squash, cz + p[2] * r))
        norms.append(tuple(v))
        uvs.append((1.5 + v[0] * 1.5, 1.5 + v[2] * 1.5))
    mesh.tri_mesh(verts, norms, uvs, [(a, c, b) for a, b, c in F2])


def tree(cx, cz, r, h, seed):
    rr = random.Random(seed)
    cylinder(M['trunk'], cx, cz, .22, 0, h * .55, seg=7, s=1.0, cap=False)
    blob(M['foliage'], cx, cz, r, h * .55 + r * .75, rr)
    for k in range(2):
        a = rr.uniform(0, 6.283)
        blob(M['foliage'], cx + math.cos(a) * r * .55, cz + math.sin(a) * r * .55, r * rr.uniform(.6, .75), h * .55 + r * rr.uniform(.35, 1.15), rr)


def palm(cx, cz, h, seed):
    rr = random.Random(seed)
    lean = rr.uniform(-.25, .25), rr.uniform(-.25, .25)
    tx, tz = cx + lean[0], cz + lean[1]
    cylinder(M['trunk'], cx, cz, .24, 0, h * .5, seg=8, s=.8, cap=False, r1=.2)
    cylinder(M['trunk'], cx + lean[0] * .5, cz + lean[1] * .5, .2, h * .5 - .05, h, seg=8, s=.8, cap=False, r1=.17)
    blob(M['foliage'], tx, tz, .45, h, rr, squash=1.0)
    verts, norms, uvs, faces = [], [], [], []
    n = 11
    for k in range(n):
        a = k / n * 2 * math.pi + rr.uniform(-.15, .15)
        ln = rr.uniform(2.6, 3.4)
        lift = rr.uniform(.4, 1.0)
        dx, dz = math.cos(a), math.sin(a)
        px, pz = -dz, dx
        base = len(verts)
        seg = 6
        for i in range(seg + 1):
            t = i / seg
            cxp, czp = tx + dx * ln * t, tz + dz * ln * t
            y = h + lift * t * 1.6 - 2.4 * t * t * (1 + lift * .3)
            w = .62 * math.sin(math.pi * min(1, t * 1.15)) ** .6 + .02
            verts += [(cxp + px * w, y, czp + pz * w), (cxp - px * w, y, czp - pz * w)]
            nn = np.array([-dx * .3, 1, -dz * .3]); nn /= np.linalg.norm(nn)
            norms += [tuple(nn)] * 2
            uvs += [(t * 2, 0), (t * 2, 1)]
        for i in range(seg):
            a0 = base + 2 * i
            faces += [(a0, a0 + 2, a0 + 1), (a0 + 1, a0 + 2, a0 + 3)]
    M['foliage'].tri_mesh(verts, norms, uvs, faces)


def face_map(name, xf, y):
    """facade texture coords (metres from its left edge, height) -> (plan x, plan z, outward plan dir, texture width)"""
    if name == 'front':
        for p in PAVS:
            if p['x0'] - 1e-6 <= xf <= p['x1'] + 1e-6:
                return xf, -p['proj'], (0, -1), L
        return xf, 0.0, (0, -1), L
    if name == 'east':
        return L, xf, (1, 0), D
    if name == 'west':
        return 0.0, D - xf, (-1, 0), D
    if name == 'back':
        return (L - xf if xf <= 13 else LW_X1 - (xf - 13)), D, (0, 1), 34.0
    if name == 'hall':
        return RW_X0 - xf, (D if y < HP else FRONT_W), (0, 1), RW_X0 - LW_X1
    raise KeyError(name)


def build_relief():
    """Raise the painted window surrounds, sills, pilasters and piers off the wall as real geometry.
    Each raised block reuses the facade texture: its face shows the same paint, its sides stretch the
    edge pixels, so light and shadow now fall across the mouldings."""
    for name, parts in RELIEF.items():
        mesh = M[name]
        for (x0, y0, x1, y1, d) in parts:
            x0, x1, y0, y1 = x0 + .005, x1 - .005, y0 + .005, y1 - .005
            ax, az, n, W = face_map(name, x0, y0)
            bx, bz, _, _ = face_map(name, x1, y0)
            if name == 'front' and abs(az - bz) > 1e-6:
                continue                                    # straddles a pavilion edge
            if name == 'back' and (x0 < 13 < x1):
                continue
            if name == 'hall' and y0 < HP < y1:
                continue
            nx, nz = n
            u0, u1 = x0 / W, x1 / W
            v0, v1 = 1 - y0 / FH, 1 - y1 / FH
            out = lambda px, pz, k: (px + nx * d * k, pz + nz * d * k)
            A0, B0 = (ax, az), (bx, bz)
            A1, B1 = out(ax, az, 1), out(bx, bz, 1)
            onrm = np.array([nx, 0, -nz], float)            # outward in model coords (model z = -plan z)
            def q(pts, uvs, want):
                pts = [P(px, y, pz) for (px, pz, y) in pts]
                a, b, c, dd = map(np.array, pts)
                nn = np.cross(b - a, dd - a)
                if np.dot(nn, want) < 0:
                    pts = pts[::-1]; uvs = uvs[::-1]
                mesh.quad(*pts, *uvs)
            q([(A1[0], A1[1], y0), (B1[0], B1[1], y0), (B1[0], B1[1], y1), (A1[0], A1[1], y1)],
              [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], onrm)                                       # face
            eu = .002
            q([(A0[0], A0[1], y1), (B0[0], B0[1], y1), (B1[0], B1[1], y1), (A1[0], A1[1], y1)],
              [(u0, v1 + eu), (u1, v1 + eu), (u1, v1 + eu), (u0, v1 + eu)], np.array([0, 1, 0]))      # top
            q([(A0[0], A0[1], y0), (B0[0], B0[1], y0), (B1[0], B1[1], y0), (A1[0], A1[1], y0)],
              [(u0, v0 - eu), (u1, v0 - eu), (u1, v0 - eu), (u0, v0 - eu)], np.array([0, -1, 0]))     # bottom
            side = np.array([bx - ax, 0, -(bz - az)], float); side /= (np.linalg.norm(side) or 1)
            q([(A0[0], A0[1], y0), (A1[0], A1[1], y0), (A1[0], A1[1], y1), (A0[0], A0[1], y1)],
              [(u0 + eu, v0), (u0 + eu, v0), (u0 + eu, v1), (u0 + eu, v1)], -side)                  # left
            q([(B0[0], B0[1], y0), (B1[0], B1[1], y0), (B1[0], B1[1], y1), (B0[0], B0[1], y1)],
              [(u1 - eu, v0), (u1 - eu, v0), (u1 - eu, v1), (u1 - eu, v1)], side)                   # right


def build_geometry():
    build_relief()
    fr = M['front']
    # ---------------- front: pavilions project, the two bays between them are recessed
    for p in PAVS:
        x0, x1, zf, top = p['x0'], p['x1'], -p['proj'], p['top']
        wall(fr, (x0, zf), (x1, zf), 0, top, x0 / L, x1 / L)
        wall(M['plain'], (x0, 0), (x0, zf), 0, TOP, s=4.0)              # left return
        wall(M['plain'], (x1, zf), (x1, 0), 0, TOP, s=4.0)              # right return
        c = (x0 + x1) / 2
        # cornice: bed moulding, corona step, deep crown
        pbox(M['trim'], x0 - .45, x1 + .45, CORN0, CORN0 + .6, zf - .45, .4)
        pbox(M['trim'], x0 - .5, x1 + .5, top - 1.3, top - .9, zf - .5, .6)
        pbox(M['trim'], x0 - .95, x1 + .95, top - .9, top, zf - .95, .8)
        # entablature over the giant order + band under the arched row
        hw = 10.2 if p['kind'] == 'centre' else 7.2
        pbox(M['trim'], c - hw, c + hw, ENT[0], ENT[1] - .35, zf - .25, zf, faces='newtb')
        pbox(M['trim'], c - hw - .2, c + hw + .2, ENT[1] - .35, ENT[1], zf - .5, zf, faces='newtb')
        pbox(M['trim'], x0, x1, TOPBAND[0], TOPBAND[1], zf - .14, zf, faces='newtb')
        for (y0, y1, o) in [(GF_BAND[0], GF_BAND[1], .2), (BELT[0], BELT[1], .28)]:
            pbox(M['trim'], x0 - (o if x0 == 0 else 0), x1 + (o if x1 == L else 0), y0, y1, zf - o, zf, faces='newtb')
    for bx0, bx1 in BAYS:
        wall(fr, (bx0, 0), (bx1, 0), 0, TOP, bx0 / L, bx1 / L)
        for (y0, y1, o) in [(GF_BAND[0], GF_BAND[1], .2), (BELT[0], BELT[1], .28)]:
            pbox(M['trim'], bx0, bx1, y0, y1, -o, 0, faces='ntb')
        pbox(M['trim'], bx0, bx1, TOP - .45, TOP, -.3, .3, faces='ntb')
    # ---------------- sides
    wall(M['east'], (L, 0), (L, D), 0, TOP, 0, 1)
    wall(M['west'], (0, D), (0, 0), 0, TOP, 0, 1)
    # ---------------- back: wings + hall, and the front block above the lawn
    wall(M['back'], (L, D), (RW_X0, D), 0, TOP, 0, 13 / 34)
    wall(M['back'], (LW_X1, D), (0, D), 0, TOP, 13 / 34, 1)
    wall(M['hall'], (RW_X0, D), (LW_X1, D), 0, HP, 0, 1)
    wall(M['hall'], (RW_X0, FRONT_W), (LW_X1, FRONT_W), HH, TOP, 0, 1)
    # courtyard faces of the wings above the hall roof
    wall(M['court'], (LW_X1, FRONT_W), (LW_X1, D), HH, TOP, 0, 1)
    wall(M['court'], (RW_X0, D), (RW_X0, FRONT_W), HH, TOP, 0, 1)
    # front block's back wall above the open top storey of each wing
    wall(M['plain'], (LW_X1, FRONT_W), (0, FRONT_W), ROOF_W, TOP, s=4.0)
    wall(M['plain'], (L, FRONT_W), (RW_X0, FRONT_W), ROOF_W, TOP, s=4.0)
    # ---------------- the wings' open top storey: inner faces of the parapet walls + pergola beams
    t = .35
    for (wx0, wx1) in [(0.0, LW_X1), (RW_X0, L)]:
        wall(M['plain'], (wx0 + t, FRONT_W), (wx0 + t, D - t), ROOF_W, TOP, s=4.0)
        wall(M['plain'], (wx0 + t, D - t), (wx1 - t, D - t), ROOF_W, TOP, s=4.0)
        wall(M['plain'], (wx1 - t, D - t), (wx1 - t, FRONT_W), ROOF_W, TOP, s=4.0)
        for z in np.arange(FRONT_W + 3.0, D - 1.0, 3.2):
            pbox(M['trim'], wx0 + t, wx1 - t, TOP - .7, TOP - .2, z - .18, z + .18)
        for x in np.arange(wx0 + 3.0, wx1 - 1.0, 4.2):
            pbox(M['trim'], x - .2, x + .2, ROOF_W, TOP - .7, D - t - .45, D - t)
        pbox(M['trim'], wx0 + t, wx1 - t, TOP - .7, TOP - .2, FRONT_W + .2, FRONT_W + .6)
    # ---------------- roofs
    def roof_rect(mesh, x0, z0, x1, z1, y, s=8.0, uvfun=None):
        A, B, C, Dd = P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1)
        if uvfun is None:
            uvfun = lambda p: (p[0] / s, p[2] / s)
        mesh.quad(A, B, C, Dd, uvfun(A), uvfun(B), uvfun(C), uvfun(Dd))
    roof_rect(M['roof'], 0, -.2, L, FRONT_W, ROOF_F)
    roof_rect(M['roof'], 0, FRONT_W, LW_X1, D, ROOF_W)
    roof_rect(M['roof'], RW_X0, FRONT_W, L, D, ROOF_W)
    roof_rect(M['terrace'], LW_X1, FRONT_W, RW_X0, D, HH,
              uvfun=lambda p: ((p[0] - (LW_X1 - L / 2)) / (RW_X0 - LW_X1), (D / 2 - FRONT_W - p[2]) / (D - FRONT_W)))
    # hall parapet (inside face + top) and the coping on every parapet
    pbox(M['plain'], LW_X1, RW_X0, HH, HP, D - .35, D, s=3.0, faces='nt')
    cop = lambda x0, x1, z0, z1, y: pbox(M['trim'], x0, x1, y, y + .18, z0, z1, faces='nsewt')
    cop(LW_X1 - .1, LW_X1 + .45, FRONT_W, D, TOP)
    cop(RW_X0 - .45, RW_X0 + .1, FRONT_W, D, TOP)
    cop(LW_X1, RW_X0, FRONT_W - .1, FRONT_W + .45, TOP)
    cop(0, LW_X1, FRONT_W - .1, FRONT_W + .3, TOP)
    cop(RW_X0, L, FRONT_W - .1, FRONT_W + .3, TOP)
    # outer cornice around the sides and back (front has the pavilion cornices)
    for (y0, y1, o) in [(CORN0, CORN0 + .6, .45), (33.0, 33.3, .5), (33.3, 34.2, .95)]:
        pbox(M['trim'], L - .6, L + o, y0, y1, 0, D + o, faces='nsetb')                # east
        pbox(M['trim'], -o, .6, y0, y1, 0, D + o, faces='nswtb')                      # west
        pbox(M['trim'], 0, LW_X1, y0, y1, D - .6, D + o, faces='sewtb')               # west wing back
        pbox(M['trim'], RW_X0, L, y0, y1, D - .6, D + o, faces='sewtb')               # east wing back
    for (y0, y1, o) in [(GF_BAND[0], GF_BAND[1], .2), (BELT[0], BELT[1], .28)]:
        pbox(M['trim'], L, L + o, y0, y1, 0, D, faces='etb')
        pbox(M['trim'], -o, 0, y0, y1, 0, D, faces='wtb')
    pbox(M['trim'], LW_X1, RW_X0, HP, HP + .2, D - .4, D + .25, faces='nswtb')
    # ---------------- rooftop services on the front block
    pbox(M['plain'], 30.0, 37.0, ROOF_F, ROOF_F + 2.2, 4.0, 8.5, s=3.0)
    pbox(M['trim'], 29.8, 37.2, ROOF_F + 2.2, ROOF_F + 2.4, 3.8, 8.7)
    for i in range(5):
        pbox(M['roof'], 8 + i * 2.3, 9.6 + i * 2.3, ROOF_F, ROOF_F + 1.0, 6.0, 7.4, s=2.0)
    for x in (54.0, 57.0):
        cylinder(M['plain'], x - L / 2, D / 2 - 5.0, 1.0, ROOF_F, ROOF_F + 2.0, seg=12, s=2.0)
    # ---------------- entrance canopy: dark hipped roof, lit CELESTIA fascia, slim columns
    C = CANOPY
    x0, x1, z0, z1, ey, fy, ry = C['x0'], C['x1'], C['z0'], C['z1'], C['eave'], C['fascia'], C['ridge']
    zm = (z0 + z1) / 2
    hw = (z0 - z1) / 2
    rx0, rx1 = x0 + hw, x1 - hw
    q = lambda x, y, z: P(x, y, z)
    met = M['metal']
    uvm = lambda p: (p[0] / 3.0, p[2] / 3.0)
    def up_quad(a, b, c, d):
        n = np.cross(np.array(b) - np.array(a), np.array(d) - np.array(a))
        if n[1] < 0:
            a, b, c, d = d, c, b, a
        met.quad(a, b, c, d, uvm(a), uvm(b), uvm(c), uvm(d))
    def up_tri(a, b, c):
        n = np.cross(np.array(b) - np.array(a), np.array(c) - np.array(a))
        if n[1] < 0:
            a, b, c = c, b, a
        met.tri(a, b, c, uvm(a), uvm(b), uvm(c))
    up_quad(q(x0, ey, z1), q(x1, ey, z1), q(rx1, ry, zm), q(rx0, ry, zm))           # front slope
    up_quad(q(x1, ey, z0), q(x0, ey, z0), q(rx0, ry, zm), q(rx1, ry, zm))           # back slope
    up_tri(q(x0, ey, z0), q(x0, ey, z1), q(rx0, ry, zm))                             # hips
    up_tri(q(x1, ey, z1), q(x1, ey, z0), q(rx1, ry, zm))
    M['fascia'].quad(q(x0 - .05, fy, z1 - .05), q(x1 + .05, fy, z1 - .05), q(x1 + .05, ey, z1 - .05), q(x0 - .05, ey, z1 - .05), (0, 1), (1, 1), (1, 0), (0, 0))
    pbox(met, x0 - .05, x1 + .05, fy, ey, z1, z0, s=3.0, faces='ewb')
    pbox(M['plain'], x0, x1, fy - .02, fy, z1, z0, s=3.0, faces='b')
    pbox(M['lamp'], x0 + .3, x1 - .3, fy - .06, fy - .02, z1 + .25, z1 + .4, faces='b')
    for x in np.linspace(x0 + .8, x1 - .8, 5):
        cylinder(M['trim'], x - L / 2, D / 2 - (z1 + .6), .2, 0, fy, seg=12, s=1.0, cap=False)
        pbox(M['trim'], x - .35, x + .35, 0, .3, z1 + .25, z1 + .95)
        pbox(M['lamp'], x - .08, x + .08, fy - .1, fy - .02, z1 + .55, z1 + .7, faces='b')
    pbox(M['plain'], x0 + 4.0, x1 - 4.0, 0, .3, -3.2, 0, s=2.0, faces='newt')        # entrance steps
    # ---------------- compound wall: pillars, gold jali panel at the centre, gates, lights
    X0, Z0, X1, Z1 = PLOT
    pl, tr = M['plain'], M['trim']
    def cwall(ax, az, bx, bz, h=2.0):
        box(pl, min(ax, bx) - .18, 0, min(az, bz) - .18, max(ax, bx) + .18, h, max(az, bz) + .18, s=2.0)
        box(tr, min(ax, bx) - .24, h, min(az, bz) - .24, max(ax, bx) + .24, h + .12, max(az, bz) + .24, s=1.0)
    def pillar(x, z, h=2.6, w=.45):
        box(pl, x - w, 0, z - w, x + w, h, z + w, s=1.0)
        box(tr, x - w - .1, h, z - w - .1, x + w + .1, h + .18, z + w + .1, s=1.0)
        box(tr, x - w - .05, .0, z - w - .05, x + w + .05, .35, z + w + .05, s=1.0)
        box(M['lamp'], x - .09, 1.55, z + w, x + .09, 1.85, z + w + .06)
    xs = [X0] + [g for gg in GATES for g in gg] + [X1]
    for i in range(0, len(xs), 2):
        a, b = xs[i], xs[i + 1]
        if a < JALI[0] < b:
            cwall(a, Z1, JALI[0], Z1); cwall(JALI[1], Z1, b, Z1)
        else:
            cwall(a, Z1, b, Z1)
    # raised centre wall with the jali screen
    box(pl, JALI[0], 0, Z1 - .3, JALI[1], 2.7, Z1 + .3, s=2.0)
    box(tr, JALI[0] - .1, 2.7, Z1 - .38, JALI[1] + .1, 2.85, Z1 + .38, s=1.0)
    M['jali'].quad((JALI[0] + .5, .45, Z1 + .32), (JALI[1] - .5, .45, Z1 + .32), (JALI[1] - .5, 2.45, Z1 + .32), (JALI[0] + .5, 2.45, Z1 + .32), (0, 1), (1, 1), (1, 0), (0, 0))
    for x in (JALI[0] - .55, JALI[1] + .55):
        pillar(x, Z1, 3.1, .55)
    for x in np.arange(X0, X1 + .01, 4.8):
        if any(g0 - 1.2 < x < g1 + 1.2 for g0, g1 in GATES) or JALI[0] - 2 < x < JALI[1] + 2:
            continue
        pillar(x, Z1)
    for g0, g1 in GATES:
        for x in (g0, g1):
            pillar(x, Z1, 3.0, .6)
    cwall(X0, Z0, X0, Z1); cwall(X1, Z0, X1, Z1); cwall(X0, Z0, X1, Z0)
    # ground uplights along the outside of the wall and the building's base
    for x in np.arange(X0 + 1.2, X1, 2.4):
        if any(g0 - .5 < x < g1 + .5 for g0, g1 in GATES):
            continue
        box(M['lamp'], x - .1, 0, Z1 + .5, x + .1, .1, Z1 + .7)
    # low hedges inside and outside the front wall
    hr = random.Random(5)
    for x in np.arange(X0 + 1.0, X1 - .5, 1.3):
        if any(g0 - .8 < x < g1 + .8 for g0, g1 in GATES):
            continue
        blob(M['foliage'], x, Z1 - 1.0, .75, .45, hr, squash=.6)
        blob(M['foliage'], x + .6, Z1 + 1.0, .55, .3, hr, squash=.6)
    # ---------------- trees and palms
    trees = []
    for x in (-39.0, -31.0, 31.0, 39.0):
        for z in (20.5, 29.5):
            trees.append((x, z, 2.3, 8.0 + rnd.uniform(-.8, .8), 'palm'))
    for z in np.arange(-17, 12, 5.5):
        trees.append((-40.5 + rnd.uniform(-.5, .5), z, rnd.uniform(2.0, 2.6), rnd.uniform(6.5, 8.5), 'tree'))
        trees.append((48.8, z + 2.0, 1.9, rnd.uniform(6.5, 7.5), 'palm'))
    for x in np.arange(-34, 30, 6.5):
        trees.append((x + rnd.uniform(-.6, .6), -18.6 + rnd.uniform(-.3, .3), rnd.uniform(2.2, 2.9), rnd.uniform(7, 9), 'tree'))
    for (x, z) in [(-43.0, 25.0), (47.5, 24.0)]:
        trees.append((x, z, 2.6, 8.5, 'tree'))
    for i, (x, z, r, h, kind) in enumerate(trees):
        if kind == 'palm':
            palm(x, z, h, i)
        else:
            tree(x, z, r, h, i)
    # low planting in the island in front of the canopy
    for x in np.arange(-14, 14.5, 2.0):
        blob(M['foliage'], x, 33.2 + hr.uniform(-1, 1), .9, .5, hr, squash=.55)
    # ---------------- ground (site texture)
    gx0, gx1, gz0, gz1 = -G_W / 2, G_W / 2, -G_H / 2, G_H / 2
    M['ground'].quad((gx0, 0, gz1), (gx1, 0, gz1), (gx1, 0, gz0), (gx0, 0, gz0), (0, 0), (1, 0), (1, 1), (0, 1))
    F = 900.0
    fu = lambda x: (x + G_W / 2) / G_W
    fv = lambda z: (G_H / 2 - z) / G_H
    M['groundfar'].quad((-F, -.05, F), (F, -.05, F), (F, -.05, -F), (-F, -.05, -F), (fu(-F), fv(F)), (fu(F), fv(F)), (fu(F), fv(-F)), (fu(-F), fv(-F)))
    return [(x, z, r, h) for x, z, r, h, _ in trees]


# ================================================================ glTF writer
METAL = set()     # the jali is lit from behind, so it reads as glowing gold rather than polished metal


def write_glb(path, images):
    bin_parts, views, accessors = [], [], []
    def add_view(data, target=None):
        off = sum(len(b) for b in bin_parts)
        pad = (-off) % 4
        if pad:
            bin_parts.append(b'\x00' * pad); off += pad
        bin_parts.append(data)
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target: v['target'] = target
        views.append(v)
        return len(views) - 1
    gl = {'asset': {'version': '2.0', 'generator': 'Celestia model builder'}, 'scene': 0, 'scenes': [{'name': 'Celestia Banquets', 'nodes': []}],
          'nodes': [], 'meshes': [], 'materials': [], 'textures': [], 'images': [], 'samplers': [
              {'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497},
              {'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071},
              {'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33648, 'wrapT': 33648}]}
    img_index = {}
    for name, (data, mime) in images.items():
        bv = add_view(data)
        gl['images'].append({'name': name, 'bufferView': bv, 'mimeType': mime})
        img_index[name] = len(gl['images']) - 1
    for name, mesh in M.items():
        if not mesh.idx:
            continue
        pos = np.array(mesh.pos, np.float32); nor = np.array(mesh.nor, np.float32); uv = np.array(mesh.uv, np.float32)
        big = len(pos) >= 65536
        idx = np.array(mesh.idx, np.uint32 if big else np.uint16)
        a_pos = len(accessors); accessors.append({'bufferView': add_view(pos.tobytes(), 34962), 'componentType': 5126, 'count': len(pos), 'type': 'VEC3', 'min': pos.min(0).tolist(), 'max': pos.max(0).tolist()})
        a_nor = len(accessors); accessors.append({'bufferView': add_view(nor.tobytes(), 34962), 'componentType': 5126, 'count': len(nor), 'type': 'VEC3'})
        a_uv = len(accessors); accessors.append({'bufferView': add_view(uv.tobytes(), 34962), 'componentType': 5126, 'count': len(uv), 'type': 'VEC2'})
        a_idx = len(accessors); accessors.append({'bufferView': add_view(idx.tobytes(), 34963), 'componentType': 5125 if big else 5123, 'count': len(idx), 'type': 'SCALAR'})
        gl['textures'].append({'sampler': {'repeat': 0, 'clamp': 1, 'mirror': 2}[mesh.wrap], 'source': img_index[mesh.tex], 'name': mesh.tex})
        metal = name in METAL
        gl['materials'].append({'name': name, 'pbrMetallicRoughness': {'baseColorTexture': {'index': len(gl['textures']) - 1}, 'metallicFactor': 1.0 if metal else 0.0, 'roughnessFactor': .3 if metal else (.5 if name in ('fascia', 'metal') else .85)}, 'doubleSided': name == 'foliage'})
        gl['meshes'].append({'name': name, 'primitives': [{'attributes': {'POSITION': a_pos, 'NORMAL': a_nor, 'TEXCOORD_0': a_uv}, 'indices': a_idx, 'material': len(gl['materials']) - 1}]})
        gl['nodes'].append({'name': name, 'mesh': len(gl['meshes']) - 1})
        gl['scenes'][0]['nodes'].append(len(gl['nodes']) - 1)
    binary = b''.join(bin_parts)
    binary += b'\x00' * ((-len(binary)) % 4)
    gl['bufferViews'] = views; gl['accessors'] = accessors; gl['buffers'] = [{'byteLength': len(binary)}]
    js = json.dumps(gl, separators=(',', ':')).encode()
    js += b' ' * ((-len(js)) % 4)
    total = 12 + 8 + len(js) + 8 + len(binary)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(binary), 0x004E4942)); f.write(binary)
    return total


def jpg(im, q=84):
    b = io.BytesIO(); im.save(b, 'JPEG', quality=q, optimize=True, progressive=False); return b.getvalue()


if __name__ == '__main__':
    tex = {
        'front': build_front(), 'east': build_east(), 'west': build_west(), 'back': build_back(),
        'hall': build_hall(), 'court': build_court(), 'roof': build_roof(), 'plain': build_plain(),
        'trim': build_trim(), 'terrace': build_terrace(), 'fascia': build_fascia(), 'metal': build_metal(),
        'jali': build_jali(), 'lamp': build_lamp(), 'foliage': build_foliage(), 'trunk': build_trunk(),
    }
    trees = build_geometry()          # after the facades: it raises their mouldings in 3D
    tex['ground'], tex['groundfar'] = build_ground(trees)
    for k, im in tex.items():
        im.save(f'{OUT}/{k}.jpg', quality=88)
    images = {k: (jpg(im, 80 if k in ('ground', 'front', 'groundfar', 'east', 'west', 'back', 'hall') else 86), 'image/jpeg') for k, im in tex.items()}
    n = write_glb(f'{OUT}/celestia-hall.glb', images)
    print('glb bytes', n, {k: len(v[0]) for k, v in images.items()})
    print({k: (len(m.pos), len(m.idx) // 3) for k, m in M.items()})
