# -*- coding: utf-8 -*-
"""Title-slide hero: MLOps lifecycle constellation from real tech logos.
Transparent PNG, deck light-theme colors. Logos fit-to-box inside uniform cards."""
import math, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.image as mpimg
from matplotlib.patches import FancyBboxPatch, Circle, Ellipse
from matplotlib.offsetbox import OffsetImage, AnnotationBbox

LOGO = r"D:\pfe\report\logo"
OUT = r"D:\pfe\presentation\assets\title_hero.png"
CYAN, VIOLET = "#2E9BE0", "#7C3AED"
LINEC = "#CBD5E1"

fig = plt.figure(figsize=(10, 10), dpi=210)
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis("off")
cx = cy = 50
rx = ry = 35
K = 5.62  # empirical: data-units per (image_px * zoom)

ax.add_patch(Ellipse((cx, cy), rx * 2, ry * 2, fill=False, lw=1.6,
                      ec=CYAN, alpha=0.32, ls=(0, (5, 5)), zorder=1))

nodes = ["kubernetes.png", "mlflow.png", "kserve.png", "minio.png",
         "kubeflow.png", "postgresql.png", "fastapi.png", "angular.png"]
N = len(nodes)
CARD_W, CARD_H = 20.5, 12.5
INNER_W, INNER_H = CARD_W - 4.6, CARD_H - 4.6

def rounded(x, y, w, h, fc, ec, lw=1.2, z=3, alpha=1.0):
    ax.add_patch(FancyBboxPatch((x - w / 2, y - h / 2), w, h,
                 boxstyle="round,pad=0,rounding_size=2.4",
                 fc=fc, ec=ec, lw=lw, zorder=z, alpha=alpha, mutation_aspect=1))

for i, logo in enumerate(nodes):
    ang = math.radians(90 - i * (360 / N))
    nx, ny = cx + rx * math.cos(ang), cy + ry * math.sin(ang)
    ax.plot([cx, nx], [cy, ny], color=CYAN, lw=1.1, alpha=0.26, zorder=1)
    rounded(nx + 0.3, ny - 0.45, CARD_W, CARD_H, "#0B1220", "none", lw=0, z=2, alpha=0.06)
    rounded(nx, ny, CARD_W, CARD_H, "white", LINEC, lw=1.3, z=3)
    img = mpimg.imread(os.path.join(LOGO, logo))
    ih, iw = img.shape[0], img.shape[1]
    zoom = K * min(INNER_H / ih, INNER_W / iw)
    ax.add_artist(AnnotationBbox(OffsetImage(img, zoom=zoom), (nx, ny),
                  frameon=False, zorder=5))

# center badge
for r, a in [(15.5, 0.05), (12.8, 0.07), (10.8, 0.09)]:
    ax.add_patch(Circle((cx, cy), r, fc=CYAN, ec="none", alpha=a, zorder=2))
grad = np.zeros((256, 256, 4)); yy, xx = np.mgrid[0:256, 0:256]
d = np.clip(np.sqrt((xx - 128) ** 2 + (yy - 100) ** 2) / 165.0, 0, 1)
c1, c2 = np.array([46, 155, 224]) / 255, np.array([109, 58, 214]) / 255
for k in range(3):
    grad[..., k] = c1[k] * (1 - d) + c2[k] * d
grad[..., 3] = 1.0
disc = ax.imshow(grad, extent=(cx - 11, cx + 11, cy - 11, cy + 11), zorder=3)
disc.set_clip_path(Circle((cx, cy), 11, transform=ax.transData))
ax.add_patch(Circle((cx, cy), 11, fill=False, ec="white", lw=2.2, zorder=4, alpha=0.9))
ax.text(cx, cy + 1.7, "MLOps", ha="center", va="center", fontsize=21,
        color="white", fontweight="bold", family="DejaVu Sans", zorder=5)
ax.text(cx, cy - 3.4, "LIFECYCLE", ha="center", va="center", fontsize=9.5,
        color="white", fontweight="bold", family="DejaVu Sans", alpha=0.92, zorder=5)

fig.savefig(OUT, transparent=True)
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
