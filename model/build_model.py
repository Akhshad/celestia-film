"""
Celestia Banquets, Nagpur - finished-look 3D model built from drone footage.
Outputs textures + celestia-hall.glb (glTF 2.0 binary, Y-up, metres, front faces +Z).
"""
import json, struct, io, math, os, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)
rnd = random.Random(7)
nrng = np.random.default_rng(7)
SERIF = '/usr/share/fonts/truetype/google-fonts/Lora-Variable.ttf'

# ---------------------------------------------------------------- dimensions
L, D = 67.0, 30.0          # footprint (x along the road, z depth)
HT = 31.0                  # roof of the three tall wings
HH = 20.0                  # roof of the lower hall block (terrace)
FRONT_W = 10.0             # depth of the front wing
LEFT_W = 13.0              # width of the left wing  (plan x 0..13)
RIGHT_X = 46.0             # right wing starts      (plan x 46..67)
FH = 33.5                  # height covered by facade textures
GF = 5.2                   # ground floor height
FLOOR = 3.55               # typical floor height (7 floors above GF)


def P(x, y, z):            # plan (x from left, z from front) -> model (centred, front at +Z)
    return (x - L / 2, y, D / 2 - z)


# ================================================================ textures
WALL = (236, 230, 218)
WALL_LIGHT = (245, 241, 233)
WALL_SHADE = (208, 200, 187)
TRIM = (250, 247, 241)


def noise_layer(w, h, amp=6, blur=1.2, seed=1):
    g = np.random.default_rng(seed).normal(0, 1, (h, w)).astype(np.float32)
    im = Image.fromarray(np.clip(128 + g * 40, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))
    a = (np.asarray(im).astype(np.float32) - 128) / 40 * amp
    return a


def add_noise(img, amp=5, blur=1.0, seed=1):
    a = np.asarray(img).astype(np.float32)
    n = noise_layer(img.width, img.height, amp, blur, seed)
    a += n[..., None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


class Facade:
    """Draw in metres; (0,0) is bottom-left of the facade."""
    def __init__(self, w_m, h_m, w_px, h_px, bg=WALL):
        self.sx, self.sy = w_px / w_m, h_px / h_m
        self.w, self.h = w_px, h_px
        self.im = Image.new('RGB', (w_px, h_px), bg)
        self.d = ImageDraw.Draw(self.im, 'RGBA')
        self.lit_p = 0.0
        self.rng = random.Random(int(w_m * 1000 + h_px))

    def X(self, x): return x * self.sx
    def Y(self, y): return self.h - y * self.sy

    def rect(self, x0, y0, x1, y1, fill, outline=None, width=1):
        self.d.rectangle([self.X(x0), self.Y(y1), self.X(x1), self.Y(y0)], fill=fill, outline=outline, width=width)

    def ellipse(self, cx, cy, r, fill, outline=None, width=1):
        self.d.ellipse([self.X(cx - r), self.Y(cy + r * self.sx / self.sy), self.X(cx + r), self.Y(cy - r * self.sx / self.sy)], fill=fill, outline=outline, width=width)

    def glass(self, x0, y0, x1, y1, arch=False, lit=None):
        """reflective glass with mullions and reveal shadow; some panes show a warm lit interior"""
        X0, X1, Y0, Y1 = self.X(x0), self.X(x1), self.Y(y1), self.Y(y0)
        w, h = int(X1 - X0), int(Y1 - Y0)
        if w < 2 or h < 2:
            return
        if lit is None:
            lit = self.rng.random() < self.lit_p
        g = Image.new('RGB', (w, h))
        gd = ImageDraw.Draw(g)
        top, bot = ((255, 214, 150), (232, 150, 78)) if lit else ((112, 136, 156), (38, 50, 64))
        for j in range(h):
            t = j / max(1, h - 1)
            c = tuple(int(a + (b - a) * t) for a, b in zip(top, bot))
            gd.line([(0, j), (w, j)], fill=c)
        if lit:
            # curtains / interior variation
            k = self.rng.random()
            if k < .4:
                cw = int(w * self.rng.uniform(.18, .32))
                gd.rectangle([0, 0, cw, h], fill=(214, 168, 112)); gd.rectangle([w - cw, 0, w, h], fill=(214, 168, 112))
            elif k < .6:
                gd.rectangle([0, int(h * .62), w, h], fill=(170, 110, 62))
        else:
            # diagonal sky reflection
            refl = Image.new('L', (w, h), 0)
            rd = ImageDraw.Draw(refl)
            rd.polygon([(w * .15, 0), (w * .55, 0), (w * .2, h), (-w * .2, h)], fill=46)
            g = Image.composite(Image.new('RGB', (w, h), (190, 210, 228)), g, refl)
        gd = ImageDraw.Draw(g)
        mw = max(2, int(0.06 * self.sx))
        gd.rectangle([w // 2 - mw // 2, 0, w // 2 + mw // 2, h], fill=(214, 208, 198))
        ty = int(h * .3)
        gd.rectangle([0, ty - mw // 2, w, ty + mw // 2], fill=(214, 208, 198))
        # reveal shadow (top + left)
        sh = max(2, int(0.14 * self.sx))
        gd.rectangle([0, 0, w, sh], fill=(22, 26, 34))
        gd.rectangle([0, 0, sh, h], fill=(30, 35, 44))
        mask = Image.new('L', (w, h), 255)
        if arch:
            mask = Image.new('L', (w, h), 0)
            md = ImageDraw.Draw(mask)
            md.rectangle([0, w // 2, w, h], fill=255)
            md.ellipse([0, 0, w, w], fill=255)
        self.im.paste(g, (int(X0), int(Y0)), mask)

    def window(self, xc, yb, w=1.35, h=2.05, arch=False, cap=True, rich=True):
        s = 0.17
        top = yb + h
        # surround with shadow
        self.rect(xc - w / 2 - s + .05, yb - .2 - .05, xc + w / 2 + s + .05, top + s - .05, (196, 188, 176, 150))
        if arch:
            self.rect(xc - w / 2 - s, yb - .2, xc + w / 2 + s, top - w / 2, TRIM)
            self.ellipse(xc, top - w / 2, w / 2 + s, TRIM)
        else:
            self.rect(xc - w / 2 - s, yb - .2, xc + w / 2 + s, top + s, TRIM)
        self.glass(xc - w / 2, yb, xc + w / 2, top, arch)
        # sill
        self.rect(xc - w / 2 - .32, yb - .34, xc + w / 2 + .32, yb - .2, TRIM)
        self.rect(xc - w / 2 - .32, yb - .42, xc + w / 2 + .32, yb - .34, (190, 182, 170, 170))
        if arch:
            # keystone
            self.rect(xc - .16, top + .02, xc + .16, top + s + .22, TRIM)
            self.rect(xc - .16, top + .02, xc - .12, top + s + .22, (205, 197, 185))
        elif cap and rich:
            self.rect(xc - w / 2 - .36, top + s, xc + w / 2 + .36, top + s + .2, TRIM)
            self.rect(xc - w / 2 - .36, top + s - .05, xc + w / 2 + .36, top + s, (186, 178, 166, 190))
            # small scroll ornament under the cap
            self.rect(xc - .3, top + s + .2, xc + .3, top + s + .3, (232, 226, 214))

    def pilaster(self, xc, y0, y1, w=.7):
        self.rect(xc - w / 2 - .06, y0, xc + w / 2 + .1, y1, (200, 192, 180, 160))
        self.rect(xc - w / 2, y0, xc + w / 2, y1, WALL_LIGHT)
        self.rect(xc - w / 2, y0, xc - w / 2 + .07, y1, (252, 250, 246))
        self.rect(xc + w / 2 - .07, y0, xc + w / 2, y1, (214, 206, 194))
        # flutes
        for k in (-.16, 0, .16):
            self.rect(xc + k - .02, y0 + .5, xc + k + .02, y1 - .6, (226, 219, 207))
        # capital + base
        self.rect(xc - w / 2 - .14, y1 - .45, xc + w / 2 + .14, y1, TRIM)
        self.rect(xc - w / 2 - .14, y1 - .5, xc + w / 2 + .14, y1 - .45, (190, 182, 170, 170))
        self.rect(xc - w / 2 - .1, y0, xc + w / 2 + .1, y0 + .35, TRIM)

    def band(self, x0, x1, y0, y1, shadow=.12):
        self.rect(x0, y0 - shadow, x1, y0, (182, 174, 162, 170))
        self.rect(x0, y0, x1, y1, TRIM)
        self.rect(x0, y1 - .05, x1, y1, (255, 255, 255))

    def cornice(self, x0, x1, y0, y1):
        self.rect(x0, y0 - .25, x1, y0, (170, 162, 150, 190))
        self.rect(x0, y0, x1, y1, TRIM)
        # dentils
        dx = .32
        x = x0 + .1
        while x < x1 - .2:
            self.rect(x, y0 + .08, x + .17, y0 + .32, (222, 215, 203))
            x += dx
        self.rect(x0, y0 + .42, x1, y0 + .5, (214, 206, 194))
        self.rect(x0, y1 - .12, x1, y1, (255, 255, 255))

    def rustication(self, x0, x1, y0, y1, step=.5):
        y = y0 + step
        while y < y1:
            self.rect(x0, y - .03, x1, y + .03, (212, 205, 193))
            y += step

    def oculus(self, cx, cy, r=.62):
        self.ellipse(cx + .05, cy - .06, r + .22, (190, 182, 170, 160))
        self.ellipse(cx, cy, r + .22, TRIM)
        self.ellipse(cx, cy, r, (226, 219, 207))
        self.ellipse(cx, cy, r * .62, TRIM)
        # star (four point) - nod to "Celestia"
        X, Y = self.X(cx), self.Y(cy)
        R = r * .5 * self.sx
        pts = []
        for i in range(8):
            a = i * math.pi / 4 - math.pi / 2
            rr = R if i % 2 == 0 else R * .32
            pts.append((X + rr * math.cos(a), Y + rr * math.sin(a)))
        self.d.polygon(pts, fill=(201, 168, 104))

    def finish(self, amp=4, seed=3):
        self.im = add_noise(self.im, amp, 1.0, seed)
        return self.im


def floor_base(i):          # i = 1..7 (above ground floor)
    return GF + (i - 1) * FLOOR


def build_front():
    F = Facade(L, FH, 4096, 2048)
    F.lit_p = .3
    # sky above the roofline (never mapped, keep neutral)
    F.rect(0, 31.0, L, FH, WALL)
    # ---------------- sections
    PAVS = [
        dict(x0=0, x1=13, cols=[2.4, 6.5, 10.6], pil=[.45, 4.45, 8.55, 12.55], top=33.0, oc=None),
        dict(x0=25, x1=35, cols=[27.5, 32.5], pil=[25.45, 30.0, 34.55], top=32.8, oc=30.0),
        dict(x0=46, x1=67, cols=[48.7, 53.2, 59.8, 64.3], pil=[46.5, 51.0, 56.5, 62.0, 66.5], top=33.5, oc=56.5),
    ]
    # pavilion tone
    for p in PAVS:
        F.rect(p['x0'], 0, p['x1'], p['top'], (240, 235, 225))
    # ground floor rustication across
    F.rustication(0, L, 0, GF)
    # ground floor openings
    def gf_arch(xc, w=2.3):
        F.rect(xc - w / 2 - .25, .0, xc + w / 2 + .25, 4.3, TRIM)
        F.glass(xc - w / 2, .0, xc + w / 2, 4.05, arch=True, lit=True)
    for p in PAVS:
        for c in p['cols']:
            gf_arch(c)
    for c in [15.0, 19.0, 23.0]:
        gf_arch(c, 2.2)
    # main entrance (centre pavilion, behind the porte-cochere) - tall glass doors with gold frames
    F.rect(26.3, 0, 33.7, 4.6, TRIM)
    F.glass(26.6, 0, 33.4, 4.35, lit=True)
    for xx in [28.3, 30.0, 31.7]:
        F.rect(xx - .05, 0, xx + .05, 4.35, (196, 160, 92))
    F.rect(26.6, 3.2, 33.4, 3.28, (196, 160, 92))
    # core section ground floor
    F.rect(37.5, 0, 43.5, 4.1, TRIM)
    F.glass(37.8, 0, 43.2, 3.85, lit=True)
    # string course above GF
    F.band(0, L, GF, GF + .38)
    # ---------------- upper floors
    for p in PAVS:
        for c in p['cols']:
            for i in range(1, 8):
                yb = floor_base(i) + .95
                top_row = i == 7
                if p['oc'] is not None and top_row and abs(c - p['oc']) < 1:
                    continue
                F.window(c, yb, 1.35 if (c - p['x0'] > 1.5 and p['x1'] - c > 1.5) else 1.1, 2.0 if not top_row else 2.25, arch=top_row)
        for x in p['pil']:
            F.pilaster(x, GF + .38, 29.6)
        if p['oc'] is not None:
            F.oculus(p['oc'], 28.4)
    for c in [15.0, 19.0, 23.0]:
        for i in range(1, 8):
            F.window(c, floor_base(i) + .95, 1.3, 2.0, arch=False)
    # core: recessed panel + slot windows
    F.rect(37.4, GF + .4, 43.6, 29.6, (229, 222, 210))
    F.rect(37.4, GF + .4, 37.55, 29.6, (206, 198, 186))
    F.rect(43.45, GF + .4, 43.6, 29.6, (250, 248, 243))
    for i in range(1, 7):
        F.window(40.5, floor_base(i) + 1.05, .7, 1.8, cap=False, rich=False)
    F.oculus(40.5, 28.4, .55)
    # band under the top floor
    F.band(0, L, floor_base(7) - .25, floor_base(7) + .05, .08)
    # ---------------- cornice + parapets
    F.cornice(0, L, 29.95, 31.0)
    F.rect(0, 31.0, L, 32.2, (238, 233, 223))
    F.rect(0, 32.05, L, 32.2, TRIM)
    for x in np.arange(1.2, L, 2.4):
        F.rect(x - .5, 31.25, x + .5, 31.9, (228, 221, 209))
    for p in PAVS:
        F.rect(p['x0'], 31.0, p['x1'], p['top'], (241, 236, 227))
        F.rect(p['x0'], p['top'] - .2, p['x1'], p['top'], TRIM)
        F.rect(p['x0'], 31.0, p['x1'], 31.12, (196, 188, 176))
        cx = (p['x0'] + p['x1']) / 2
        F.rect(cx - 2.2, 31.35, cx + 2.2, p['top'] - .45, (231, 224, 212))
        if p['x1'] - p['x0'] > 15:
            F.oculus(cx, (31.35 + p['top'] - .45) / 2, .5)
    # soft ambient occlusion near ground and under cornice
    a = np.asarray(F.im).astype(np.float32)
    ys = np.arange(F.h)[:, None]
    yb = F.h - ys
    ao = 1 - .16 * np.exp(-(yb / (0.9 * F.sy)))
    a *= ao[..., None]
    F.im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    return F.finish(4, 11)


def build_side():
    """tileable 13.6 m wide (four bays) x 33.5 m"""
    SW = 13.6
    F = Facade(SW, FH, 2048, 2048)
    F.lit_p = .26
    F.rustication(0, SW, 0, GF)
    cols = (1.7, 5.1, 8.5, 11.9)
    for c in cols:
        F.rect(c - .9, 0, c + .9, 3.4, TRIM)
        F.glass(c - .7, 0, c + .7, 3.2, lit=True)
    F.band(0, SW, GF, GF + .35)
    for c in cols:
        for i in range(1, 8):
            F.window(c, floor_base(i) + 1.0, 1.25, 1.9, cap=(i % 2 == 1), rich=True)
    F.band(0, SW, floor_base(7) - .25, floor_base(7) + .05, .08)
    F.cornice(0, SW, 29.95, 31.0)
    F.rect(0, 31.0, SW, 32.2, (238, 233, 223))
    F.rect(0, 32.05, SW, 32.2, TRIM)
    a = np.asarray(F.im).astype(np.float32)
    yb = F.h - np.arange(F.h)[:, None]
    a *= (1 - .16 * np.exp(-(yb / (0.9 * F.sy))))[..., None]
    F.im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    return F.finish(4, 12)


def build_roof():
    n = 1024
    im = Image.new('RGB', (n, n), (196, 194, 188))
    d = ImageDraw.Draw(im)
    step = n / (8 / .75)
    for k in range(int(n / step) + 1):
        d.line([(k * step, 0), (k * step, n)], fill=(176, 174, 168), width=3)
        d.line([(0, k * step), (n, k * step)], fill=(176, 174, 168), width=3)
    im = add_noise(im, 7, 2.5, 21)
    # a few stains
    st = Image.new('L', (n, n), 0)
    sd = ImageDraw.Draw(st)
    for _ in range(14):
        x, y, r = rnd.uniform(0, n), rnd.uniform(0, n), rnd.uniform(30, 120)
        sd.ellipse([x - r, y - r, x + r, y + r], fill=rnd.randint(8, 22))
    st = st.filter(ImageFilter.GaussianBlur(40))
    im = ImageChops.subtract(im, Image.merge('RGB', [st, st, st]))
    return im


def build_plain():
    im = Image.new('RGB', (512, 512), WALL)
    return add_noise(im, 5, 1.5, 31)


def build_terrace():
    """hall roof (33 m x 20 m) landscaped terrace, top view; image top = front (+Z)"""
    W, H = 2048, 1024
    sx, sy = W / 33.0, H / 20.0
    im = Image.new('RGB', (W, H), (214, 205, 188))
    d = ImageDraw.Draw(im, 'RGBA')
    X = lambda x: x * sx
    Y = lambda z: (20 - z) * sy          # z measured from back (0) to front (20)
    # stone paving grid
    for x in np.arange(0, 33, .9):
        d.line([(X(x), 0), (X(x), H)], fill=(198, 189, 172), width=2)
    for z in np.arange(0, 20, .9):
        d.line([(0, Y(z)), (W, Y(z))], fill=(198, 189, 172), width=2)
    def rect(x0, z0, x1, z1, fill, outline=None, width=1):
        d.rectangle([X(x0), Y(z1), X(x1), Y(z0)], fill=fill, outline=outline, width=width)
    # lawns
    for (x0, z0, x1, z1) in [(2, 2, 13.5, 8.5), (19.5, 2, 31, 8.5), (2, 11.5, 13.5, 18), (19.5, 11.5, 31, 18)]:
        rect(x0 - .3, z0 - .3, x1 + .3, z1 + .3, (186, 176, 158))
        rect(x0, z0, x1, z1, (104, 142, 70))
    # central circle feature
    cx, cz = 16.5, 10
    for r, col in [(3.6, (186, 176, 158)), (3.3, (226, 216, 198)), (2.2, (95, 135, 172)), (1.9, (120, 165, 200)), (.6, (236, 230, 220))]:
        d.ellipse([X(cx - r), Y(cz + r), X(cx + r), Y(cz - r)], fill=col)
    # pergolas (beams with shadows)
    for (x0, x1, z) in [(3, 12.5, 9.6), (20.5, 30, 9.6)]:
        for x in np.arange(x0, x1, .6):
            d.rectangle([X(x) + 6, Y(z + 1.1) + 8, X(x + .16) + 6, Y(z - .2) + 8], fill=(0, 0, 0, 40))
            d.rectangle([X(x), Y(z + 1.1), X(x + .16), Y(z - .2)], fill=(246, 242, 234))
    # planters with shrubs along the edges
    for x in np.arange(1.2, 32, 2.4):
        for z in (.8, 19.2):
            r = .55
            d.ellipse([X(x - r) + 5, Y(z + r) + 7, X(x + r) + 5, Y(z - r) + 7], fill=(0, 0, 0, 45))
            d.ellipse([X(x - r), Y(z + r), X(x + r), Y(z - r)], fill=(62, 104, 46))
            d.ellipse([X(x - r * .5), Y(z + r * .7), X(x + r * .1), Y(z + r * .1)], fill=(92, 140, 66))
    # seating clusters
    for (x, z) in [(6, 5), (9.5, 14.5), (23.5, 5.2), (27, 14.8)]:
        d.ellipse([X(x - .8), Y(z + .8), X(x + .8), Y(z - .8)], fill=(245, 242, 236))
        for a in range(4):
            ang = a * math.pi / 2 + .4
            px, pz = x + 1.3 * math.cos(ang), z + 1.3 * math.sin(ang)
            d.ellipse([X(px - .35), Y(pz + .35), X(px + .35), Y(pz - .35)], fill=(201, 168, 104))
    im = add_noise(im, 5, 1.2, 41)
    return im


def build_fascia(text='CELESTIA  BANQUETS'):
    W, H = 4096, 256
    im = Image.new('RGB', (W, H), (34, 30, 42))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 10], fill=(201, 168, 104))
    d.rectangle([0, H - 10, W, H], fill=(201, 168, 104))
    f = ImageFont.truetype(SERIF, 132)
    f.set_variation_by_name('Medium')
    # letter-spaced text
    spacing = 46
    widths = [d.textlength(ch, font=f) for ch in text]
    total = sum(widths) + spacing * (len(text) - 1)
    x = (W - total) / 2
    for ch, wch in zip(text, widths):
        d.text((x + 3, 40 + 4), ch, font=f, fill=(12, 10, 16))
        d.text((x, 40), ch, font=f, fill=(222, 190, 122))
        x += wch + spacing
    return add_noise(im, 3, 1, 51)


def build_foliage():
    im = Image.new('RGB', (256, 256), (92, 132, 62))
    a = np.asarray(im).astype(np.float32)
    n = noise_layer(256, 256, 22, 2.5, 61)
    a += n[..., None] * np.array([.6, 1, .5])
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def build_gold():
    im = Image.new('RGB', (512, 512), (214, 172, 98))
    a = np.asarray(im).astype(np.float32)
    streak = np.random.default_rng(81).normal(0, 1, (512, 1)).astype(np.float32)
    streak = np.repeat(streak, 512, axis=1)
    a += (streak * 7)[..., None] * np.array([1, .9, .6])
    a += noise_layer(512, 512, 5, 1, 82)[..., None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def build_trunk():
    return add_noise(Image.new('RGB', (64, 64), (96, 78, 60)), 8, 1, 71)


# ---------------------------------------------------------------- ground (real aerial photo, cleaned plot)
G_W, G_H = 215.0, 107.5            # metres covered by the site texture
G_PXW, G_PXH = 4096, 2048
SUN = np.array([-0.5, 0.75, 0.45]); SUN = SUN / np.linalg.norm(SUN)
PLOT = (-51.0, -20.5, 45.0, 38.0)  # x0, z0(back), x1, z1(front) in model metres


def build_ground(trees):
    src = Image.open(os.path.join(HERE, 'source', 'site-top.jpg')).convert('RGB')
    # roof centre in the frame (full-res px) and rotation that squares the building up
    cx, cy = 1903, 1128
    rot = src.convert('RGBA').rotate(6.15, resample=Image.BICUBIC, center=(cx, cy), expand=False, fillcolor=(0, 0, 0, 0))
    base = rot.copy()
    for flip in (Image.FLIP_LEFT_RIGHT, Image.FLIP_TOP_BOTTOM, Image.ROTATE_180):
        fl = rot.transpose(flip)
        holes = base.split()[3].point(lambda v: 255 if v < 250 else 0)
        base.paste(fl, (0, 0), holes)
    src = Image.alpha_composite(Image.new('RGBA', base.size, (120, 118, 112, 255)), base).convert('RGB')
    m_per_px = 0.055                       # ground scale from parked cars
    s = (G_PXW / G_W) * m_per_px           # resample factor photo px -> texture px
    big = src.resize((int(src.width * s), int(src.height * s)), Image.LANCZOS)
    bcx, bcy = cx * s, cy * s
    canvas = Image.new('RGB', (G_PXW, G_PXH), (120, 118, 112))
    # mirror-fill so rotated corners / edges never show blanks
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
    # base paving
    rect(x0, z0, x1, z1, (204, 197, 184))
    for x in np.arange(x0, x1, 1.2):
        d.line([(TX(x), TY(z1)), (TX(x), TY(z0))], fill=(192, 185, 172), width=1)
    for z in np.arange(z0, z1, 1.2):
        d.line([(TX(x0), TY(z)), (TX(x1), TY(z))], fill=(192, 185, 172), width=1)
    # lawns
    LAWN = (98, 134, 64)
    for r in [(-49.5, 17.5, -21, 36.5), (11, 17.5, 43.5, 36.5), (36, -18.5, 43.5, 13.5), (-34.5, -18.5, -36.5 + 2.5, 13.5)]:
        rect(r[0] - .6, r[1] - .6, r[2] + .6, r[3] + .6, (176, 168, 150))
        rect(*r, LAWN)
    # parking (left side, empty)
    rect(-49.5, -18.5, -36.5, 13.5, (96, 98, 102))
    for z in np.arange(-18.0, 13.5, 2.6):
        d.line([(TX(-49.5), TY(z)), (TX(-44.3), TY(z))], fill=(236, 236, 230), width=4)
        d.line([(TX(-41.7), TY(z)), (TX(-36.5), TY(z))], fill=(236, 236, 230), width=4)
    # driveway loop from the two gates to the porte-cochere
    ASPH = (84, 86, 92)
    drive = [(-32.5, 39.5), (-32.5, 31.5), (-25.5, 22.0), (-4.5, 21.0), (13.0, 22.0), (17.5, 31.5), (17.5, 39.5)]
    line(drive, (176, 168, 150), 8.2)
    line(drive, ASPH, 7.0)
    line([(-36.5, 14), (-36.5, 20.5), (-28, 22)], ASPH, 6.0)        # link to parking
    # drop-off under the canopy (stone)
    rect(-16.5, 15.4, 7.5, 26.0, (222, 214, 198))
    for x in np.arange(-16.5, 7.5, .6):
        d.line([(TX(x), TY(26)), (TX(x), TY(15.4))], fill=(208, 199, 182), width=1)
    # central island with fountain
    poly([(-24, 27.5), (11.5, 27.5), (14.5, 36.5), (-29, 36.5)], (176, 168, 150))
    poly([(-23.4, 28.1), (11.0, 28.1), (13.8, 35.9), (-28.3, 35.9)], LAWN)
    fx, fz = -6.0, 32.0
    for r, col in [(4.2, (216, 208, 192)), (3.8, (238, 232, 220)), (3.2, (70, 120, 160)), (2.7, (96, 150, 190)), (.7, (240, 238, 232))]:
        d.ellipse([TX(fx - r), TY(fz + r), TX(fx + r), TY(fz - r)], fill=col)
    # walkway gates -> entrance
    line([(-6, 39.5), (-6, 36.4)], (226, 218, 202), 2.2)
    # compound wall line (geometry sits on top)
    for (a, b) in [((x0, z1), (x1, z1)), ((x0, z0), (x0, z1)), ((x1, z0), (x1, z1)), ((x0, z0), (x1, z0))]:
        d.line([(TX(a[0]), TY(a[1])), (TX(b[0]), TY(b[1]))], fill=(230, 224, 212), width=int(.5 * sx))
    # under the building (hidden) - darken
    rect(-L / 2 - .2, -D / 2 - .2, L / 2 + .2, D / 2 + .2, (70, 68, 64))
    # ---- baked shadows (building, canopy, trees) + contact AO
    sh = Image.new('L', (G_PXW, G_PXH), 0)
    sd = ImageDraw.Draw(sh)
    off = lambda h: (-SUN[0] / SUN[1] * h, -SUN[2] / SUN[1] * h)
    def shadow_box(px0, pz0, px1, pz1, h, val=255, hb=0.0):
        o0, o1 = off(hb), off(h)
        corners = [(px0, pz0), (px1, pz0), (px1, pz1), (px0, pz1)]
        pts = [(x + o0[0], z + o0[1]) for x, z in corners] + [(x + o1[0], z + o1[1]) for x, z in corners]
        # convex hull
        pts = sorted(set(pts))
        def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
        lo, up = [], []
        for p in pts:
            while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
            lo.append(p)
        for p in reversed(pts):
            while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
            up.append(p)
        hull = lo[:-1] + up[:-1]
        sd.polygon([(TX(x), TY(z)) for x, z in hull], fill=val)
    hx0, hx1 = -L / 2, L / 2
    shadow_box(hx0, D / 2 - FRONT_W, hx1, D / 2, HT)                         # front wing
    shadow_box(hx0, -D / 2, hx0 + LEFT_W, D / 2, HT)                          # left wing
    shadow_box(RIGHT_X - L / 2, -D / 2, hx1, D / 2, HT)                       # right wing
    shadow_box(hx0 + LEFT_W, -D / 2, RIGHT_X - L / 2, D / 2 - FRONT_W, HH)    # hall
    shadow_box(-16.5, 15.3, 7.5, 26.0, 7.0, 230, 6.0)                         # canopy
    for (tx, tz, r, h) in trees:
        o = off(h * .75)
        sd.ellipse([TX(tx + o[0] - r), TY(tz + o[1] + r * .9), TX(tx + o[0] + r), TY(tz + o[1] - r * .9)], fill=200)
    sh = sh.filter(ImageFilter.GaussianBlur(9))
    ao = Image.new('L', (G_PXW, G_PXH), 0)
    ad = ImageDraw.Draw(ao)
    ad.rectangle([TX(-L / 2 - 1.2), TY(D / 2 + 1.2), TX(L / 2 + 1.2), TY(-D / 2 - 1.2)], fill=255)
    ao = ao.filter(ImageFilter.GaussianBlur(14))
    a = np.asarray(g).astype(np.float32)
    k = 1 - .2 * (np.asarray(ao).astype(np.float32) / 255)
    a *= np.clip(k, .35, 1)[..., None]
    # cool tint in shadow
    g = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    # far ground: same photo, but the plot is replaced by the houses behind it (so mirrored copies never repeat the site)
    px0, pz0, px1, pz1 = -53, -23, 47, 41
    bw, bh = int((px1 - px0) * sx), int((pz1 - pz0) * sx)
    fa = np.asarray(far)
    r0 = int(TY(pz0))                                   # row of the plot's back edge
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

    def tri_mesh(self, verts, norms, uvs, faces):
        base = len(self.pos)
        self.pos += [list(v) for v in verts]; self.nor += [list(n) for n in norms]; self.uv += [list(u) for u in uvs]
        for f in faces:
            self.idx += [base + f[0], base + f[1], base + f[2]]


M = {k: Mesh(k, k) for k in ['front', 'side', 'roof', 'terrace', 'plain', 'fascia', 'foliage', 'trunk', 'gold']}
M['ground'] = Mesh('ground', 'ground', 'clamp')
M['groundfar'] = Mesh('groundfar', 'groundfar', 'mirror')
M = {'groundfar': M.pop('groundfar'), 'ground': M.pop('ground'), **M}
M['front'].wrap = 'clamp'; M['terrace'].wrap = 'clamp'; M['fascia'].wrap = 'clamp'


def wall(mesh, p0, p1, y0, y1, uvf):
    """vertical wall from plan point p0 to p1 (plan x,z), outward normal on the right-hand side
    when walking p0->p1 seen from above... we pass points so that the quad is CCW from outside."""
    (x0, z0), (x1, z1) = p0, p1
    a, b = P(x0, y0, z0), P(x1, y0, z1)
    c, d = P(x1, y1, z1), P(x0, y1, z0)
    mesh.quad(a, b, c, d, uvf(x0, z0, y0), uvf(x1, z1, y0), uvf(x1, z1, y1), uvf(x0, z0, y1))


def box(mesh, x0, y0, z0, x1, y1, z1, s=4.0, faces='nsewtb'):
    """axis aligned box in MODEL coords; uv in metres / s"""
    if 't' in faces:
        mesh.quad((x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0), (x0 / s, z1 / s), (x1 / s, z1 / s), (x1 / s, z0 / s), (x0 / s, z0 / s))
    if 'b' in faces:
        mesh.quad((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1), (x0 / s, z0 / s), (x1 / s, z0 / s), (x1 / s, z1 / s), (x0 / s, z1 / s))
    if 'n' in faces:   # +Z face
        mesh.quad((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1), (x0 / s, -y0 / s), (x1 / s, -y0 / s), (x1 / s, -y1 / s), (x0 / s, -y1 / s))
    if 's' in faces:   # -Z face
        mesh.quad((x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (-x1 / s, -y0 / s), (-x0 / s, -y0 / s), (-x0 / s, -y1 / s), (-x1 / s, -y1 / s))
    if 'e' in faces:   # +X face
        mesh.quad((x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (-z1 / s, -y0 / s), (-z0 / s, -y0 / s), (-z0 / s, -y1 / s), (-z1 / s, -y1 / s))
    if 'w' in faces:   # -X face
        mesh.quad((x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0), (z0 / s, -y0 / s), (z1 / s, -y0 / s), (z1 / s, -y1 / s), (z0 / s, -y1 / s))


def cylinder(mesh, cx, cz, r, y0, y1, seg=14, s=2.0, cap=True):
    verts, norms, uvs, faces = [], [], [], []
    for i in range(seg + 1):
        a = i / seg * 2 * math.pi
        x, z = math.cos(a), math.sin(a)
        verts += [(cx + r * x, y0, cz + r * z), (cx + r * x, y1, cz + r * z)]
        norms += [(x, 0, z), (x, 0, z)]
        uvs += [(i / seg * 2 * math.pi * r / s, -y0 / s), (i / seg * 2 * math.pi * r / s, -y1 / s)]
    for i in range(seg):
        a, b, c, d = 2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1
        faces += [(a, d, c), (a, c, b)]
    mesh.tri_mesh(verts, norms, uvs, faces)
    if cap:
        base = len(verts)
        cv, cn, cu, cf = [(cx, y1, cz)], [(0, 1, 0)], [(cx / s, cz / s)], []
        for i in range(seg):
            a = i / seg * 2 * math.pi
            cv.append((cx + r * math.cos(a), y1, cz + r * math.sin(a))); cn.append((0, 1, 0)); cu.append(((cx + r * math.cos(a)) / s, (cz + r * math.sin(a)) / s))
        for i in range(seg):
            cf.append((0, 1 + (i + 1) % seg, 1 + i))
        mesh.tri_mesh(cv, cn, cu, cf)


def tree(cx, cz, r, h, seed):
    rr = random.Random(seed)
    cylinder(M['trunk'], cx, cz, .22, 0, h * .55, seg=7, s=1.0, cap=False)
    blob(cx, cz, r, h * .55 + r * .75, rr)
    for k in range(2):
        a = rr.uniform(0, 6.283)
        blob(cx + math.cos(a) * r * .55, cz + math.sin(a) * r * .55, r * rr.uniform(.6, .75), h * .55 + r * rr.uniform(.35, 1.15), rr)


def blob(cx, cz, r, cy, rr):
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
        k = 1 + rr.uniform(-.13, .13)
        p = v * k
        verts.append((cx + p[0] * r, cy + p[1] * r * .85, cz + p[2] * r))
        norms.append(tuple(v))
        uvs.append((.5 + v[0] * .5, .5 + v[2] * .5))
    M['foliage'].tri_mesh(verts, norms, [(u * 3, w * 3) for u, w in uvs], [(a, c, b) for a, b, c in F2])


def build_geometry():
    fr, sd, rf, tr, pl = M['front'], M['side'], M['roof'], M['terrace'], M['plain']
    uv_front = lambda x, z, y: (x / L, 1 - y / FH)
    def uv_side_s(s0):
        return lambda x, z, y, s0=s0: (s0, 1 - y / FH)
    # ---- front (plan z = 0); walking left->right seen from the front, normal +Z
    wall(fr, (0, 0), (L, 0), 0, 32.2, uv_front)
    # ---- pavilions protruding from the front
    PAV = [(0, 13, 33.0, .9), (25, 35, 32.8, .6), (46, 67, 33.5, 1.2)]
    for x0, x1, top, pr in PAV:
        X0, X1 = x0 - L / 2, x1 - L / 2
        Zf = D / 2 + pr
        fr.quad((X0, 0, Zf), (X1, 0, Zf), (X1, top, Zf), (X0, top, Zf), (x0 / L, 1), (x1 / L, 1), (x1 / L, 1 - top / FH), (x0 / L, 1 - top / FH))
        box(pl, X0, 0, D / 2 - .05, X1, top, Zf, s=4.0, faces='ewt')
        # pavilion cornice ledge
        box(M['gold'], X0 - .25, 29.95, Zf - .1, X1 + .25, 30.95, Zf + .38, s=2.0, faces='nsewtb')
        # gold cap on the pavilion parapet
        box(M['gold'], X0 - .12, top, D / 2 - .2, X1 + .12, top + .28, Zf + .14, s=2.0, faces='nsewt')
    # ---- sides of the tall wings and back
    def side_wall(p0, p1, y0, y1):
        (x0, z0), (x1, z1) = p0, p1
        length = math.hypot(x1 - x0, z1 - z0)
        A, B = P(x0, y0, z0), P(x1, y0, z1)
        C, Dd = P(x1, y1, z1), P(x0, y1, z0)
        sd.quad(A, B, C, Dd, (0, 1 - y0 / FH), (length / 13.6, 1 - y0 / FH), (length / 13.6, 1 - y1 / FH), (0, 1 - y1 / FH))
    side_wall((L, 0), (L, D), 0, 32.2)                     # right face (+X)
    side_wall((0, D), (0, 0), 0, 32.2)                     # left face (-X)
    side_wall((L, D), (RIGHT_X, D), 0, 32.2)               # back of right wing
    side_wall((LEFT_W, D), (0, D), 0, 32.2)                # back of left wing
    side_wall((RIGHT_X, D), (LEFT_W, D), 0, HH + 1.1)      # hall back (low)
    # courtyard faces above the hall roof
    side_wall((LEFT_W, FRONT_W), (RIGHT_X, FRONT_W), HH, 32.2)   # back face of front wing (faces -Z)
    side_wall((LEFT_W, D), (LEFT_W, FRONT_W), HH, 32.2)          # inner face of left wing (+X)
    side_wall((RIGHT_X, FRONT_W), (RIGHT_X, D), HH, 32.2)        # inner face of right wing (-X)
    # ---- roofs
    def roof_rect(mesh, x0, z0, x1, z1, y, s=8.0, uvfun=None):
        A, B, C, Dd = P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1)
        if uvfun is None:
            uvfun = lambda p: (p[0] / s, p[2] / s)
        # CCW from above: front-left, front-right, back-right, back-left  -> in model coords front is +Z
        mesh.quad(A, B, C, Dd, uvfun(A), uvfun(B), uvfun(C), uvfun(Dd))
    roof_rect(rf, 0, 0, L, FRONT_W, HT)
    roof_rect(rf, 0, FRONT_W, LEFT_W, D, HT)
    roof_rect(rf, RIGHT_X, FRONT_W, L, D, HT)
    hx0, hz0 = LEFT_W - L / 2, D / 2 - D       # terrace texture: x across 33 m, z from back (0) to front (20)
    roof_rect(tr, LEFT_W, FRONT_W, RIGHT_X, D, HH, uvfun=lambda p: ((p[0] - (LEFT_W - L / 2)) / 33.0, 1 - (p[2] - (-D / 2)) / 20.0))
    # ---- parapets (outer perimeter of tall roof, courtyard edges, terrace edge)
    t = .32
    def par(x0, z0, x1, z1, y0, y1):
        a, b = P(x0, y0, z0), P(x1, y0, z1)
        bx0, bx1 = min(a[0], b[0]), max(a[0], b[0]); bz0, bz1 = min(a[2], b[2]), max(a[2], b[2])
        box(pl, bx0, y0, bz0, bx1, y1, bz1, s=3.0)
    par(0, D - t, LEFT_W, D, HT, 32.2); par(RIGHT_X, D - t, L, D, HT, 32.2)
    par(0, 0, t, D, HT, 32.2); par(L - t, 0, L, D, HT, 32.2)
    par(LEFT_W, FRONT_W, RIGHT_X, FRONT_W + t, HT, 32.0)
    par(LEFT_W - t, FRONT_W, LEFT_W, D, HT, 32.0); par(RIGHT_X, FRONT_W, RIGHT_X + t, D, HT, 32.0)
    par(LEFT_W, D - t, RIGHT_X, D, HH, HH + 1.1)
    # ---- cornice ring (outer) + string course
    box(M['gold'], -L / 2 - .45, 29.95, -D / 2 - .45, L / 2 + .45, 30.95, -D / 2, s=2.0, faces='swtb')
    box(M['gold'], -L / 2 - .45, 29.95, -D / 2, -L / 2, 30.95, D / 2 + .45, s=2.0, faces='wtb')
    box(M['gold'], L / 2, 29.95, -D / 2, L / 2 + .45, 30.95, D / 2 + .45, s=2.0, faces='etb')
    box(M['gold'], -L / 2 - .45, 29.95, D / 2, L / 2 + .45, 30.95, D / 2 + .45, s=2.0, faces='ntb')
    box(M['gold'], -L / 2 - .25, GF, D / 2, L / 2 + .25, GF + .4, D / 2 + .28, s=2.0, faces='ntb')
    box(M['gold'], -L / 2 - .25, GF, -D / 2 - .25, -L / 2, GF + .4, D / 2 + .28, s=2.0, faces='wtb')
    box(M['gold'], L / 2, GF, -D / 2 - .25, L / 2 + .25, GF + .4, D / 2 + .28, s=2.0, faces='etb')
    # ---- rooftop services
    box(pl, -30.5, HT, 7.5, -25.5, HT + 3.6, 11.5, s=3.0)
    box(pl, 23.5, HT, -9.0, 29.0, HT + 3.6, -4.5, s=3.0)
    box(pl, -4.0, HT, 7.0, 4.0, HT + 2.4, 11.0, s=3.0)
    for i, (x, z) in enumerate([(26.0, 8.5), (29.0, 8.5), (-29.5, -6), (-26.5, -6)]):
        cylinder(pl, x, z, 1.1, HT, HT + 2.2, seg=12, s=2.0)
    for i in range(6):
        box(rf, 16 + i * 2.2, HT, 10.5, 17.4 + i * 2.2, HT + 1.0, 12.0, s=2.0)
    # ---- porte-cochere (in front of the centre)
    cx0, cx1, cz0, cz1 = -16.5, 7.5, D / 2 + .3, D / 2 + 11.0
    box(pl, cx0, 6.0, cz0, cx1, 7.0, cz1, s=3.0, faces='sewb')
    box(rf, cx0, 7.0, cz0, cx1, 7.05, cz1, s=6.0, faces='t')
    box(M['gold'], cx0 - .2, 7.0, cz0, cx1 + .2, 7.6, cz1 + .2, s=3.0, faces='ewt')
    M['fascia'].quad((cx0, 6.0, cz1 + .01), (cx1, 6.0, cz1 + .01), (cx1, 7.6, cz1 + .21), (cx0, 7.6, cz1 + .21), (0, 1), (1, 1), (1, 0), (0, 0))
    for x in np.linspace(cx0 + 1.0, cx1 - 1.0, 6):
        cylinder(pl, x, cz1 - .9, .42, 0, 6.0, seg=16, s=1.0, cap=False)
        box(pl, x - .65, 5.55, cz1 - 1.55, x + .65, 6.0, cz1 - .25, s=1.0)
        box(pl, x - .6, 0, cz1 - 1.5, x + .6, .5, cz1 - .3, s=1.0)
    box(pl, -10.0, 0, D / 2, 1.0, .45, D / 2 + 2.2, s=2.0, faces='ntew')   # entrance steps
    # ---- compound wall + gate pillars
    x0, z0, x1, z1 = PLOT
    def cwall(ax, az, bx, bz):
        box(pl, min(ax, bx) - .18, 0, min(az, bz) - .18, max(ax, bx) + .18, 1.5, max(az, bz) + .18, s=2.0)
    gates = [(-36.4, -28.6), (13.6, 21.4)]
    xs = [x0] + [g for gg in gates for g in gg] + [x1]
    for i in range(0, len(xs), 2):
        cwall(xs[i], z1, xs[i + 1], z1)
    cwall(x0, z0, x0, z1); cwall(x1, z0, x1, z1)
    for x in np.arange(x0, x1 + .01, 4.8):
        if any(g0 - .5 < x < g1 + .5 for g0, g1 in gates):
            continue
        box(pl, x - .35, 0, z1 - .35, x + .35, 2.0, z1 + .35, s=1.0)
    for g0, g1 in gates:
        for x in (g0, g1):
            box(pl, x - .55, 0, z1 - .55, x + .55, 3.2, z1 + .55, s=1.0)
            box(M['gold'], x - .7, 3.2, z1 - .7, x + .7, 3.45, z1 + .7, s=1.0)
    # ---- trees
    trees = []
    for x in np.arange(-48, 44, 6.2):
        if any(g0 - 3 < x < g1 + 3 for g0, g1 in gates):
            continue
        trees.append((x + rnd.uniform(-.6, .6), 36.2 + rnd.uniform(-.4, .4), rnd.uniform(2.3, 3.0), rnd.uniform(6.5, 8.5)))
    for z in np.arange(-16, 14, 6.0):
        trees.append((41.5 + rnd.uniform(-.4, .4), z, rnd.uniform(2.0, 2.6), rnd.uniform(6, 8)))
        trees.append((-34.3 + rnd.uniform(-.3, .3), z + 2, rnd.uniform(1.7, 2.2), rnd.uniform(5.5, 7)))
    for (x, z) in [(-40, 26), (-44, 21), (30, 25), (36, 21), (24, 32), (-17, 33.5), (5, 33.5)]:
        trees.append((x, z, rnd.uniform(2.4, 3.2), rnd.uniform(7, 9)))
    for i, (x, z, r, h) in enumerate(trees):
        tree(x, z, r, h, i)
    # ---- ground (site texture)
    gx0, gx1, gz0, gz1 = -G_W / 2, G_W / 2, -G_H / 2, G_H / 2
    M['ground'].quad((gx0, 0, gz1), (gx1, 0, gz1), (gx1, 0, gz0), (gx0, 0, gz0), (0, 0), (1, 0), (1, 1), (0, 1))
    F = 900.0
    fu = lambda x: (x + G_W / 2) / G_W
    fv = lambda z: (G_H / 2 - z) / G_H
    M['groundfar'].quad((-F, -.05, F), (F, -.05, F), (F, -.05, -F), (-F, -.05, -F), (fu(-F), fv(F)), (fu(F), fv(F)), (fu(F), fv(-F)), (fu(-F), fv(-F)))
    return trees


# ================================================================ glTF writer
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
        assert len(pos) < 65536, (name, len(pos))
        idx = np.array(mesh.idx, np.uint16)
        a_pos = len(accessors); accessors.append({'bufferView': add_view(pos.tobytes(), 34962), 'componentType': 5126, 'count': len(pos), 'type': 'VEC3', 'min': pos.min(0).tolist(), 'max': pos.max(0).tolist()})
        a_nor = len(accessors); accessors.append({'bufferView': add_view(nor.tobytes(), 34962), 'componentType': 5126, 'count': len(nor), 'type': 'VEC3'})
        a_uv = len(accessors); accessors.append({'bufferView': add_view(uv.tobytes(), 34962), 'componentType': 5126, 'count': len(uv), 'type': 'VEC2'})
        a_idx = len(accessors); accessors.append({'bufferView': add_view(idx.tobytes(), 34963), 'componentType': 5123, 'count': len(idx), 'type': 'SCALAR'})
        gl['textures'].append({'sampler': {'repeat': 0, 'clamp': 1, 'mirror': 2}[mesh.wrap], 'source': img_index[mesh.tex], 'name': mesh.tex})
        gl['materials'].append({'name': name, 'pbrMetallicRoughness': {'baseColorTexture': {'index': len(gl['textures']) - 1}, 'metallicFactor': 1.0 if name == 'gold' else 0.0, 'roughnessFactor': .3 if name == 'gold' else (.85 if name != 'fascia' else .5)}, 'doubleSided': name in ('foliage',)})
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
    trees = build_geometry()
    tex = {
        'front': build_front(), 'side': build_side(), 'roof': build_roof(), 'plain': build_plain(),
        'terrace': build_terrace(), 'fascia': build_fascia(), 'foliage': build_foliage(), 'trunk': build_trunk(), 'gold': build_gold(),
    }
    tex['ground'], tex['groundfar'] = build_ground(trees)
    for k, im in tex.items():
        im.save(f'{OUT}/{k}.jpg', quality=88)
    images = {k: (jpg(im, 82 if k in ('ground', 'front', 'groundfar') else 86), 'image/jpeg') for k, im in tex.items()}
    n = write_glb(f'{OUT}/celestia-hall.glb', images)
    print('glb bytes', n, {k: len(v[0]) for k, v in images.items()})
    print({k: (len(m.pos), len(m.idx) // 3) for k, m in M.items()})
