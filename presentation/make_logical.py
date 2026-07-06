# -*- coding: utf-8 -*-
"""Logical architecture (OctoNorm layered style): 4 stacked layers with labeled
data-flow arrows between them + Service layer branching to cluster systems.
Transparent PNG, deck light theme."""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.image as mpimg
from matplotlib.patches import FancyBboxPatch
from matplotlib.offsetbox import OffsetImage, AnnotationBbox

LOGO = r"D:\pfe\report\logo"
OUT = r"D:\pfe\presentation\assets\logical_arch.png"
INK, INK2, INK3 = "#1F2937", "#475569", "#64748B"
BLUE, TEAL, VIOLET, BROWN, AMBER = "#0B5394", "#0F766E", "#7C3AED", "#B45309", "#D97706"
TINTS = {"BLUE": "#EAF4FB", "TEAL": "#E6F5F5", "VIOLET": "#F3EFFC", "BROWN": "#FBF1E6"}
K = 5.62

fig = plt.figure(figsize=(13.6, 7.2), dpi=175)
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 136); ax.set_ylim(0, 72); ax.axis("off")

def rrect(x, y, w, h, fc, ec, lw=1.6, rs=2.0, dash=False, z=3):
    p = FancyBboxPatch((x, y), w, h, boxstyle=f"round,pad=0,rounding_size={rs}",
                       fc=fc, ec=ec, lw=lw, zorder=z, mutation_aspect=1)
    if dash: p.set_linestyle((0, (5, 3)))
    ax.add_patch(p)

def rich(x, y, parts, size, ha="left"):
    ax.text(x, y, "", zorder=8)  # anchor (unused)
    # simple two-color line via two text calls
    # parts = [(text, color, bold)]
    cx = x
    # measure not trivial; place sequentially with fig transform approximation
    # -> use a single text with the accent word first, rest second, spaced
    pass

LX, LW = 3, 88
layers = [
    (BLUE, "BLUE", "LAYER 1 · Presentation", "Angular 19 — Single-Page Application",
     "dashboard · projects · experiments · deployments · admin"),
    (TEAL, "TEAL", "LAYER 2 · API", "FastAPI routers",
     "request validation · authentication · ownership checks · OpenAPI"),
    (VIOLET, "VIOLET", "LAYER 3 · Service", "Business logic",
     "pipeline submission · MLflow · KServe · object-storage orchestration"),
    (BROWN, "BROWN", "LAYER 4 · Data", "SQLAlchemy → PostgreSQL",
     "users · projects · runs · models · deployments · API keys · telemetry"),
]
flows = [
    ("REST / JSON over HTTPS", "JWT access + refresh"),
    ("service calls", "typed results"),
    ("async SQLAlchemy", "ORM-mapped rows"),
]
LH, GAP = 11, 3.6
top0 = 66
tops = [top0 - i * (LH + GAP) for i in range(4)]

for i, (color, tk, title, tech, desc) in enumerate(layers):
    ty = tops[i]
    rrect(LX, ty - LH, LW, LH, TINTS[tk], color, lw=1.8)
    ax.text(LX + 3, ty - 3.4, title, ha="left", va="center", fontsize=12.5,
            color=color, fontweight="bold", family="DejaVu Sans", zorder=8)
    ax.text(LX + 30, ty - 3.4, "— " + tech, ha="left", va="center", fontsize=11.5,
            color=INK, fontweight="bold", family="DejaVu Sans", zorder=8)
    ax.text(LX + 3, ty - 7.8, desc, ha="left", va="center", fontsize=10,
            color=INK2, family="DejaVu Sans", zorder=8)
    # flow arrows to next layer
    if i < 3:
        gy_top, gy_bot = ty - LH, tops[i + 1]
        xdn, xup = LX + 22, LX + 66
        ax.annotate("", xy=(xdn, gy_bot + 0.4), xytext=(xdn, gy_top - 0.4),
                    arrowprops=dict(arrowstyle="-|>", color=INK3, lw=1.7, mutation_scale=13), zorder=6)
        ax.annotate("", xy=(xup, gy_top - 0.4), xytext=(xup, gy_bot + 0.4),
                    arrowprops=dict(arrowstyle="-|>", color=INK3, lw=1.7, mutation_scale=13), zorder=6)
        gy = (gy_top + gy_bot) / 2
        ax.text(xdn + 2.5, gy, flows[i][0], ha="left", va="center", fontsize=9,
                color=INK3, family="DejaVu Sans", zorder=8)
        ax.text(xup + 2.5, gy, flows[i][1], ha="left", va="center", fontsize=9,
                color=INK3, family="DejaVu Sans", zorder=8)

# ── cluster systems box (branch off the Service layer) ──────────────────────
CX, CW = 96, 38
cb_top, cb_bot = 47, 8
rrect(CX, cb_bot, CW, cb_top - cb_bot, "#FFFDF9", AMBER, lw=1.6, dash=True, rs=2.4, z=2)
ax.text(CX + 3, cb_top - 3, "CLUSTER SYSTEMS", ha="left", va="center", fontsize=11,
        color=AMBER, fontweight="bold", family="DejaVu Sans", zorder=8)
# arrow from Service layer to cluster box
svc_cy = tops[2] - LH / 2
ax.annotate("", xy=(CX - 0.4, svc_cy), xytext=(LX + LW + 0.4, svc_cy),
            arrowprops=dict(arrowstyle="-|>", color=AMBER, lw=2.0, mutation_scale=15), zorder=6)
ax.text((LX + LW + CX) / 2, svc_cy + 2.2, "orchestrates", ha="center", va="center",
        fontsize=8.8, color=AMBER, fontweight="bold", family="DejaVu Sans", zorder=8)

sysrows = [("mlflow.png", "MLflow", "experiments & registry"),
           ("minio.png", "MinIO", "code · datasets · artifacts"),
           ("kserve.png", "KServe", "InferenceServices"),
           ("kubeflow.png", "KFP / Argo", "training pods")]
ch_h = 8.2
for k, (lg, nm, role) in enumerate(sysrows):
    cy = cb_top - 8 - k * (ch_h + 1.2)
    rrect(CX + 2.5, cy - ch_h / 2, CW - 5, ch_h, "#FDF3E3", "#E4C48A", lw=1.2, rs=1.6, z=4)
    img = mpimg.imread(os.path.join(LOGO, lg)); ih, iw = img.shape[0], img.shape[1]
    zoom = K * min(5.6 / ih, 8 / iw)
    ax.add_artist(AnnotationBbox(OffsetImage(img, zoom=zoom), (CX + 8.5, cy), frameon=False, zorder=6))
    ax.text(CX + 15, cy + 1.6, nm, ha="left", va="center", fontsize=10.5, color=INK,
            fontweight="bold", family="DejaVu Sans", zorder=6)
    ax.text(CX + 15, cy - 2.1, role, ha="left", va="center", fontsize=8.5, color=INK3,
            family="DejaVu Sans", zorder=6)

fig.savefig(OUT, transparent=True)
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
