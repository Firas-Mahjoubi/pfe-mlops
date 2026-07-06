# -*- coding: utf-8 -*-
"""Business -> System objectives mapping. Left blue 'need' cards, arrow,
right green 'delivered' cards with a check. Transparent PNG, deck light theme."""
import os, textwrap
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Circle

OUT = r"D:\pfe\presentation\assets\bodso.png"
INK, INK2, INK3 = "#1F2937", "#475569", "#64748B"
PRIMARY, GOOD = "#0B5394", "#059669"
BLUE_T, GOOD_T, LINE = "#EAF4FB", "#E8F7F0", "#D7DEE8"

pairs = [
    ("Train without owning infrastructure",
     "Any .py / .ipynb / .zip runs in an isolated, resource-limited Kubernetes pod"),
    ("Never lose an experiment",
     "MLflow autolog captures params, metrics & artifacts of every run — zero code changes"),
    ("Choose the best model objectively",
     "Leaderboard groups runs by model family, ranked on evaluation metrics only"),
    ("Ship a model like software",
     "Registry versions + stages; one-click deployment as a KServe InferenceService"),
    ("Let external apps consume models",
     "Public endpoint secured by hashed API keys — no platform account needed"),
    ("Operate & trust the system",
     "Model-evolution KPIs, serving telemetry, failure diagnostics & admin area"),
]

fig = plt.figure(figsize=(13.6, 7.3), dpi=175)
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 136); ax.set_ylim(0, 73); ax.axis("off")

def rrect(x, y, w, h, fc, ec, lw=1.4, rs=2.0, z=3):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle=f"round,pad=0,rounding_size={rs}",
                 fc=fc, ec=ec, lw=lw, zorder=z, mutation_aspect=1))

LX, LW = 2, 49
RX, RW = 58, 76
row_top, pitch, ch = 61, 9.6, 8.0

# headers
ax.text(LX + 1, 68, "BUSINESS OBJECTIVE", ha="left", va="center", fontsize=12,
        color=PRIMARY, fontweight="bold", family="DejaVu Sans")
ax.text(RX + 5, 68, "DELIVERED SYSTEM CAPABILITY", ha="left", va="center", fontsize=12,
        color=GOOD, fontweight="bold", family="DejaVu Sans")

for i, (obj, cap) in enumerate(pairs):
    cy = row_top - i * pitch - ch / 2
    # left card + number badge + objective
    rrect(LX, cy - ch/2, LW, ch, BLUE_T, PRIMARY, lw=1.5)
    ax.add_patch(Circle((LX + 4.6, cy), 2.5, fc=PRIMARY, ec="none", zorder=5))
    ax.text(LX + 4.6, cy + 0.1, str(i + 1), ha="center", va="center", fontsize=13,
            color="white", fontweight="bold", family="DejaVu Sans", zorder=6)
    ax.text(LX + 9.5, cy, "\n".join(textwrap.wrap(obj, 30)), ha="left", va="center",
            fontsize=12, color=INK, fontweight="bold", family="DejaVu Sans",
            zorder=6, linespacing=1.1)
    # arrow
    ax.annotate("", xy=(RX - 0.5, cy), xytext=(LX + LW + 0.5, cy),
                arrowprops=dict(arrowstyle="-|>", color=INK3, lw=2.2, mutation_scale=18), zorder=6)
    # right card + check + capability
    rrect(RX, cy - ch/2, RW, ch, GOOD_T, GOOD, lw=1.5)
    ax.add_patch(Circle((RX + 4.6, cy), 2.5, fc=GOOD, ec="none", zorder=5))
    ax.text(RX + 4.6, cy + 0.1, "✓", ha="center", va="center", fontsize=13,
            color="white", fontweight="bold", family="DejaVu Sans", zorder=6)
    ax.text(RX + 9.5, cy, "\n".join(textwrap.wrap(cap, 58)), ha="left", va="center",
            fontsize=11, color=INK2, family="DejaVu Sans", zorder=6, linespacing=1.12)

fig.savefig(OUT, transparent=True)
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
