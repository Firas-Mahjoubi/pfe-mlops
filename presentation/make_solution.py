# -*- coding: utf-8 -*-
"""Proposed-solution pipeline diagram (OctoNorm style): input -> 2 dashed
pipeline boxes with tool logos -> output. Transparent PNG, deck light theme."""
import os, math
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.image as mpimg
from matplotlib.patches import FancyBboxPatch, Circle, Polygon, Rectangle
from matplotlib.offsetbox import OffsetImage, AnnotationBbox

LOGO = r"D:\pfe\report\logo"
OUT = r"D:\pfe\presentation\assets\solution_pipeline.png"
INK, INK2, INK3 = "#1F2937", "#475569", "#64748B"
PRIMARY, VIOLET, GOOD, TEAL, AMBER = "#0B5394", "#7C3AED", "#059669", "#0F766E", "#D97706"
LINE = "#D7DEE8"
BLUE_T, VIOLET_T = "#EAF4FB", "#F3EFFC"
K = 5.62

fig = plt.figure(figsize=(14.2, 6.3), dpi=175)
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 142); ax.set_ylim(0, 63); ax.axis("off")

def rrect(x, y, w, h, fc, ec, lw=1.3, dash=False, rs=2.2, z=3, alpha=1.0):
    p = FancyBboxPatch((x, y), w, h, boxstyle=f"round,pad=0,rounding_size={rs}",
                       fc=fc, ec=ec, lw=lw, zorder=z, alpha=alpha, mutation_aspect=1)
    if dash: p.set_linestyle((0, (6, 4)))
    ax.add_patch(p); return p

def ctext(x, y, s, size, color, bold=True, ls=1.1):
    ax.text(x, y, s, ha="center", va="center", fontsize=size, color=color,
            fontweight="bold" if bold else "normal", family="DejaVu Sans",
            zorder=6, linespacing=ls)

def arrow(x1, x2, y, color=INK2, lw=2.4):
    ax.annotate("", xy=(x2, y), xytext=(x1, y),
                arrowprops=dict(arrowstyle="-|>", color=color, lw=lw,
                                mutation_scale=20), zorder=6)

def logo(name, x, y, fit_w=13, fit_h=5.2):
    img = mpimg.imread(os.path.join(LOGO, name)); ih, iw = img.shape[0], img.shape[1]
    zoom = K * min(fit_h / ih, fit_w / iw)
    ax.add_artist(AnnotationBbox(OffsetImage(img, zoom=zoom), (x, y),
                  frameon=False, zorder=6))

def check(x, y, r=2.4):
    ax.add_patch(Circle((x, y), r, fc=GOOD, ec="none", zorder=6))
    ax.text(x, y + 0.1, "✓", ha="center", va="center", fontsize=13, color="white",
            fontweight="bold", family="DejaVu Sans", zorder=7)

def chip(cx, cy, label, tintc, w=13, h=11):
    rrect(cx - w/2, cy - h/2, w, h, "white", tintc, lw=1.6, rs=1.8, z=5)
    ctext(cx, cy, label, 10, INK, bold=True, ls=1.15)

# ── INPUT ───────────────────────────────────────────────────────────────────
ix = 10
rrect(ix - 8, 27, 16, 18, "#F7F9FC", LINE, lw=1.4, rs=2.2)
# upload glyph
ax.add_patch(Rectangle((ix - 1.1, 38.5), 2.2, 3.0, fc=PRIMARY, ec="none", zorder=6))
ax.add_patch(Polygon([(ix - 3, 40.5), (ix + 3, 40.5), (ix, 43.8)], fc=PRIMARY, ec="none", zorder=6))
ax.add_patch(Rectangle((ix - 3.6, 37.3), 7.2, 1.4, fc=PRIMARY, ec="none", zorder=6))
ctext(ix, 33.5, "Notebook\n+ Dataset", 11.5, INK)
ctext(ix, 29.6, ".py · .ipynb · .zip", 8.5, INK3, bold=False)
arrow(19, 24.5, 36)

# ── helper to build a pipeline box ──────────────────────────────────────────
def pipeline(x0, w, accent, tint, title, chipA, chipB, logos):
    rrect(x0, 8, w, 47, "white", accent, lw=1.8, dash=True, rs=3, z=2, alpha=1.0)
    # title pill
    tw = w - 8
    rrect(x0 + 4, 48, tw, 5.4, tint, accent, lw=1.2, rs=2.6, z=4)
    ctext(x0 + w/2, 50.7, title, 11, accent)
    # inner chips
    cy = 37
    cax, cbx = x0 + w*0.30, x0 + w*0.62
    chip(cax, cy, chipA, accent)
    arrow(cax + 6.8, cbx - 6.8, cy, color=accent, lw=2.0)
    chip(cbx, cy, chipB, accent)
    check(cbx + 9.6, cy)
    # divider
    ax.plot([x0 + 4, x0 + w - 4], [26, 26], color="#EAEFF5", lw=1.2, zorder=3)
    # logos
    n = len(logos)
    span = w - 12
    for k, (nm, lbl) in enumerate(logos):
        lx = x0 + 6 + span * (k + 0.5) / n
        logo(nm, lx, 19.5, fit_w=span/n - 1.5, fit_h=5.4)
        ctext(lx, 13.5, lbl, 8.5, INK2, bold=True)

# PIPELINE 1
pipeline(25, 44, PRIMARY, BLUE_T, "PIPELINE 1  ·  TRAIN & TRACK",
         "Run on\ncluster pod", "Autolog\ncapture",
         [("kubernetes.png", "Kubernetes"), ("kubeflow.png", "KFP · Argo"), ("mlflow.png", "MLflow")])
arrow(69.5, 74.5, 36)
# PIPELINE 2
pipeline(75, 44, VIOLET, VIOLET_T, "PIPELINE 2  ·  REGISTER & DEPLOY",
         "Register\nversion", "Deploy\nlive",
         [("mlflow.png", "Registry"), ("kserve.png", "KServe"), ("minio.png", "MinIO")])
arrow(119.5, 124.5, 36)

# ── OUTPUT ──────────────────────────────────────────────────────────────────
ox = 133
rrect(ox - 8, 27, 16, 18, "#F0FBF6", GOOD, lw=1.6, rs=2.2)
ax.add_patch(Circle((ox, 40), 3.6, fc=GOOD, ec="none", zorder=6))
ax.text(ox, 40.2, "✓", ha="center", va="center", fontsize=20, color="white",
        fontweight="bold", family="DejaVu Sans", zorder=7)
ctext(ox, 33.5, "Live model\nPublic API", 11.5, INK)
ctext(ox, 29.6, "predict from anywhere", 8.5, INK3, bold=False)

fig.savefig(OUT, transparent=True)
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
