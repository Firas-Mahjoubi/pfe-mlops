# -*- coding: utf-8 -*-
"""Methodology slide graphic: Scrum ceremony loop (top) + 4-sprint chevron
roadmap (bottom). Transparent PNG, deck light theme."""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Polygon, Circle

OUT = r"D:\pfe\presentation\assets\methodology.png"
INK, INK2, INK3 = "#1F2937", "#475569", "#64748B"
PRIMARY, VIOLET, AMBER, GOOD = "#0B5394", "#7C3AED", "#D97706", "#059669"
LINE = "#D7DEE8"
TINT = "#EEF3F8"

fig = plt.figure(figsize=(13.6, 7.0), dpi=175)
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 136); ax.set_ylim(0, 70); ax.axis("off")

def ctext(x, y, s, size, color, bold=True, ls=1.08, alpha=1.0, mono=False):
    ax.text(x, y, s, ha="center", va="center", fontsize=size, color=color,
            fontweight="bold" if bold else "normal",
            family="DejaVu Sans Mono" if mono else "DejaVu Sans",
            zorder=8, linespacing=ls, alpha=alpha)

# ═══ TOP BAND — Scrum ceremony loop ═════════════════════════════════════════
ax.text(4, 66.5, "AGILE · SCRUM", ha="left", va="center", fontsize=12.5,
        color=PRIMARY, fontweight="bold", family="DejaVu Sans")
ax.text(30.5, 66.5, "— each sprint runs the same iterative loop",
        ha="left", va="center", fontsize=11, color=INK3, family="DejaVu Sans")

ceremonies = ["Product\nBacklog", "Sprint\nPlanning", "Sprint\n(2–4 weeks)", "Sprint\nReview", "Retro-\nspective"]
n = len(ceremonies)
cw, gap = 20, 5.6
x0 = 4
cy = 56
for i, c in enumerate(ceremonies):
    x = x0 + i * (cw + gap)
    ax.add_patch(FancyBboxPatch((x, cy - 5), cw, 10, boxstyle="round,pad=0,rounding_size=2",
                 fc=TINT, ec=PRIMARY, lw=1.3, zorder=4))
    ctext(x + cw / 2, cy, c, 10, INK, ls=1.05)
    if i < n - 1:
        ax.annotate("", xy=(x + cw + gap - 0.5, cy), xytext=(x + cw + 0.5, cy),
                    arrowprops=dict(arrowstyle="-|>", color=PRIMARY, lw=1.8, mutation_scale=14), zorder=5)
# repeat arrow: Retrospective -> Sprint Planning
xr = x0 + (n - 1) * (cw + gap) + cw / 2
xp = x0 + 1 * (cw + gap) + cw / 2
ax.annotate("", xy=(xp, cy + 5.2), xytext=(xr, cy + 5.2),
            arrowprops=dict(arrowstyle="-|>", color=AMBER, lw=1.8,
                            connectionstyle="arc3,rad=-0.35", mutation_scale=14), zorder=5)
ctext((xr + xp) / 2, 65.3, "repeat every sprint", 9, AMBER, bold=True)

# ═══ BOTTOM BAND — 4-sprint chevron roadmap ═════════════════════════════════
ax.text(4, 44, "THE 4 SPRINTS DELIVERED", ha="left", va="center", fontsize=12.5,
        color=INK, fontweight="bold", family="DejaVu Sans")

sprints = [
    ("SPRINT 1", "Foundation", "Auth · Projects", "02 Feb – 01 Mar", PRIMARY),
    ("SPRINT 2", "Training & Tracking", "Pipeline · Autolog", "02 Mar – 05 Apr", VIOLET),
    ("SPRINT 3", "Registry & Deploy", "Serving · Predict", "06 Apr – 03 May", AMBER),
    ("SPRINT 4", "Observability", "Dashboards · Public API", "04 May – 14 Jun", GOOD),
]
w, h, notch, step = 34, 27, 5.5, 30.5
y = 8
for i, (num, name, desc, dates, color) in enumerate(sprints):
    x = 3 + i * step
    pts = [(x, y + h), (x + w, y + h), (x + w + notch, y + h / 2),
           (x + w, y), (x, y), (x + notch, y + h / 2)]
    ax.add_patch(Polygon(pts, closed=True, fc=color, ec="white", lw=2.0, zorder=3 + i))
    tx = x + notch + (w - notch) / 2 + 1
    ctext(tx, y + h - 5.5, num, 9.5, "white", ls=1.0, alpha=0.9)
    ctext(tx, y + h - 12, name, 12.5, "white")
    ctext(tx, y + h - 17.5, desc, 9, "white", bold=False, alpha=0.95)
    ctext(tx, y + 3.6, dates, 8.5, "white", bold=True, alpha=0.9, mono=True)

fig.savefig(OUT, transparent=True)
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
