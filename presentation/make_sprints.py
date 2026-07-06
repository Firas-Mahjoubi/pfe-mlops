# -*- coding: utf-8 -*-
"""4-sprint roadmap: big colored chevrons with per-sprint deliverables + dates.
Transparent PNG, deck light theme. For the 'sprints overview' slide."""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Circle

OUT = r"D:\pfe\presentation\assets\sprints.png"
INK, INK3 = "#1F2937", "#64748B"
PRIMARY, VIOLET, AMBER, GOOD = "#0B5394", "#7C3AED", "#D97706", "#059669"

fig = plt.figure(figsize=(13.6, 6.6), dpi=175)
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 136); ax.set_ylim(0, 66); ax.axis("off")

def ctext(x, y, s, size, color, bold=True, ls=1.1, alpha=1.0, ha="center", mono=False):
    ax.text(x, y, s, ha=ha, va="center", fontsize=size, color=color,
            fontweight="bold" if bold else "normal",
            family="DejaVu Sans Mono" if mono else "DejaVu Sans",
            zorder=8, linespacing=ls, alpha=alpha)

# caption
ctext(3, 62, "6 months", 12.5, PRIMARY, ha="left")
ctext(20, 62, "· product backlog of 15 user stories · a demonstrable, deployed increment every sprint",
      11, INK3, bold=False, ha="left")

sprints = [
    ("SPRINT 1", "Foundation",
     ["JWT authentication", "Project management", "MLflow per project"],
     "02 Feb – 01 Mar · 4 wks", PRIMARY),
    ("SPRINT 2", "Training & Tracking",
     ["Upload & run on cluster", "Notebook → script", "Live logs · autolog"],
     "02 Mar – 05 Apr · 5 wks", VIOLET),
    ("SPRINT 3", "Registry & Deploy",
     ["Registry & stages", "One-click KServe deploy", "Prediction tester"],
     "06 Apr – 03 May · 4 wks", AMBER),
    ("SPRINT 4", "Observability",
     ["Metrics dashboards", "Public API keys", "Diagnostics · admin"],
     "04 May – 14 Jun · 6 wks", GOOD),
]
w, h, notch, step, y = 34, 44, 5.5, 30.5, 8
for i, (num, name, bullets, dates, color) in enumerate(sprints):
    x = 3 + i * step
    pts = [(x, y + h), (x + w, y + h), (x + w + notch, y + h / 2),
           (x + w, y), (x, y), (x + notch, y + h / 2)]
    ax.add_patch(Polygon(pts, closed=True, fc=color, ec="white", lw=2.2, zorder=3 + i))
    cxm = x + notch + (w - notch) / 2 + 1
    ctext(cxm, y + h - 5, num, 10, "white", alpha=0.9)
    ctext(cxm, y + h - 11, name, 13.5, "white")
    # bullets, left aligned
    bx = x + notch + 3.5
    for k, b in enumerate(bullets):
        by = y + h - 18.5 - k * 5.2
        ax.add_patch(Circle((bx, by), 0.6, fc="white", ec="none", zorder=8))
        ctext(bx + 2.2, by, b, 9.3, "white", bold=False, alpha=0.96, ha="left")
    ctext(cxm, y + 4.5, dates, 8.6, "white", alpha=0.92, mono=True)

fig.savefig(OUT, transparent=True)
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
