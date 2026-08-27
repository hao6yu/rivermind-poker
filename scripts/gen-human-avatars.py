"""Author the human-avatar tiles for Slice 3.6.

Each avatar is a rounded-corner square tile with a vertical gradient
background, a subtle central glow, and a simple, name-free human silhouette.
They are authored visuals (distinct from the initials fallback) and contain
no text so the same display name never has to be inferred from the image.
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "human-avatars")
SIZE = 512

AVATARS = [
    ("human-ash",   "AS", ( 60, 100, 190), ( 30,  70, 150)),
    ("human-bay",   "BY", ( 30, 120, 130), ( 10,  85, 100)),
    ("human-cove",  "CV", (120,  90, 180), ( 90,  60, 150)),
    ("human-dawn",  "DW", (220, 100, 150), (190,  70, 120)),
    ("human-ember", "EM", ( 35, 130,  90), ( 20,  95,  60)),
    ("human-fern",  "FN", (130, 110,  90), (100,  80,  60)),
]


def clamp(value):
    return int(max(0, min(255, round(value))))


def gradient_tile(top, bottom):
    img = Image.new("RGB", (SIZE, SIZE))
    px = img.load()
    cy = SIZE // 2
    cx = SIZE // 2
    for y in range(SIZE):
        row_t = y / (SIZE - 1)
        for x in range(SIZE):
            base_r = top[0] + (bottom[0] - top[0]) * row_t
            base_g = top[1] + (bottom[1] - top[1]) * row_t
            base_b = top[2] + (bottom[2] - top[2]) * row_t
            # A soft central glow: nearer the center is slightly brighter.
            dx = (x - cx) / cx
            dy = (y - cy) / cy
            glow = 1.0 - 0.18 * (dx * dx + dy * dy)
            px[x, y] = (clamp(base_r * glow), clamp(base_g * glow), clamp(base_b * glow))
    return img


def add_silhouette(draw):
    head_cy = int(SIZE * 0.30)
    head_r = int(SIZE * 0.15)
    draw.ellipse([int(SIZE * 0.35), head_cy - head_r, int(SIZE * 0.65), head_cy + head_r],
                 fill=(255, 255, 255, 150))
    neck_y = head_cy + head_r
    shoulder_r = int(SIZE * 0.34)
    draw.ellipse([int(SIZE * 0.16), neck_y, int(SIZE * 0.84), neck_y + 2 * shoulder_r],
                 fill=(255, 255, 255, 150))


def round_corners(image, radius):
    rgba = image.convert("RGBA")
    mask = Image.new("L", (SIZE, SIZE), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=radius, fill=255)
    rgba.paste(rgba, mask=mask)
    return rgba


def main():
    os.makedirs(OUT, exist_ok=True)
    for key, _letters, top, bottom in AVATARS:
        img = gradient_tile(top, bottom)
        add_silhouette(ImageDraw.Draw(img))
        round_corners(img, 96).save(os.path.join(OUT, f"{key}.png"), quality=92)
        print(f"wrote {os.path.join(OUT, key + '.png')}")


if __name__ == "__main__":
    main()
