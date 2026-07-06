# -*- coding: utf-8 -*-
"""Technology Choices grid: 3 columns of logo cards, logos fit-to-box (no
overlap). Transparent PNG, deck light theme."""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.image as mpimg
from matplotlib.patches import FancyBboxPatch, Rectangle
from matplotlib.offsetbox import OffsetImage, AnnotationBbox

LOGO = r"D:\pfe\report\logo"
OUT = r"D:\pfe\presentation\assets\tech_stack.png"
INK, INK3 = "#1F2937", "#64748B"
PRIMARY, VIOLET, AMBER = "#0B5394", "#7C3AED", "#D97706"
LINE = "#D7DEE8"
K = 5.62

cols = [
    ("MLOPS CORE", PRIMARY, [
        ("mlflow.png", "MLflow", "tracking & registry"),
        ("kserve.png", "KServe", "model serving"),
        ("kubeflow.png", "Kubeflow · Argo", "training orchestration"),
        ("minio.png", "MinIO", "S3 object storage"),
    ]),
    ("APPLICATION", VIOLET, [
        ("angular.png", "Angular 19", "frontend SPA"),
        ("fastapi.png", "FastAPI", "async backend"),
        ("postgresql.png", "PostgreSQL", "platform + MLflow DB"),
    ]),
    ("INFRASTRUCTURE", AMBER, [
        ("kubernetes.png", "Kubernetes", "AKS / KinD"),
        ("github_actions.png", "GitHub Actions", "CI/CD pipeline"),
        ("acr.png", "Azure Container Registry", "image registry"),
        ("cloudflare.png", "Cloudflare Tunnel", "secure public edge"),
    ]),
]

fig = plt.figure(figsize=(13.6, 7.0), dpi=175)
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 136); ax.set_ylim(0, 70); ax.axis("off")

col_w, gap = 42, 4
x0s = [1, 1 + col_w + gap, 1 + 2 * (col_w + gap)]
card_h, pitch, top = 11, 13, 52

def logo(name, cx, cy, fw=13, fh=7.2):
    img = mpimg.imread(os.path.join(LOGO, name)); ih, iw = img.shape[0], img.shape[1]
    zoom = K * min(fh / ih, fw / iw)
    ax.add_artist(AnnotationBbox(OffsetImage(img, zoom=zoom), (cx, cy), frameon=False, zorder=6))

for c, (title, color, items) in enumerate(cols):
    x = x0s[c]
    ax.text(x + 1, 63.5, title, ha="left", va="center", fontsize=14, color=color,
            fontweight="bold", family="DejaVu Sans")
    ax.add_patch(Rectangle((x + 1, 60.5), 20, 0.6, fc=color, ec="none", zorder=4))
    for i, (lg, name, role) in enumerate(items):
        cy = top - i * pitch
        # card with a colored left accent
        ax.add_patch(FancyBboxPatch((x, cy - card_h / 2), col_w, card_h,
                     boxstyle="round,pad=0,rounding_size=1.8", fc="white", ec=LINE, lw=1.3, zorder=3))
        ax.add_patch(FancyBboxPatch((x, cy - card_h / 2), 1.8, card_h,
                     boxstyle="round,pad=0,rounding_size=0.6", fc=color, ec="none", zorder=4))
        logo(lg, x + 9, cy, fw=12, fh=7.4)
        ax.text(x + 17.5, cy + 1.9, name, ha="left", va="center", fontsize=11.5,
                color=INK, fontweight="bold", family="DejaVu Sans", zorder=6)
        ax.text(x + 17.5, cy - 2.2, role, ha="left", va="center", fontsize=9.5,
                color=INK3, family="DejaVu Sans", zorder=6)

fig.savefig(OUT, transparent=True)
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
