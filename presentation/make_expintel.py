# -*- coding: utf-8 -*-
"""Sprint 2 'Experiments Intelligence' highlights strip: 4 cards to replace the
loose checkmarks under the screenshot. Same card style/colours as sprint strips."""
import os, math
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle, Circle, Polygon

OUT = r"D:\pfe\presentation\assets\expintel_features.png"
INK, INK3 = "#1F2937", "#64748B"
BLUE, VIOLET, TEAL, AMBER = "#0B5394", "#7C3AED", "#0F766E", "#D97706"
TINT = {BLUE: "#EAF4FB", VIOLET: "#F3EFFC", TEAL: "#E6F5F5", AMBER: "#FDF3E3"}
LINE = "#D7DEE8"; ROT = [BLUE, VIOLET, TEAL, AMBER]

def ic_folder(ax, cx, cy, c):
    ax.add_patch(FancyBboxPatch((cx - 3.2, cy + 0.6), 3.0, 1.6, boxstyle="round,pad=0,rounding_size=0.4", fc=c, ec="none", zorder=7))
    ax.add_patch(FancyBboxPatch((cx - 3.4, cy - 3.0), 6.8, 5.0, boxstyle="round,pad=0,rounding_size=0.7", fc=c, ec="none", zorder=8))
    ax.add_patch(Rectangle((cx - 3.4, cy - 0.2), 6.8, 0.55, fc="white", ec="none", zorder=9))

def ic_chart(ax, cx, cy, c):
    for i, h in enumerate([2.6, 4.4, 3.4]):
        ax.add_patch(FancyBboxPatch((cx - 3.3 + i * 2.4, cy - 3.0), 1.7, h, boxstyle="round,pad=0,rounding_size=0.3", fc=c, ec="none", zorder=7))

def ic_star(ax, cx, cy, c):
    pts = []
    for k in range(10):
        r = 3.6 if k % 2 == 0 else 1.6
        a = math.radians(-90 + k * 36)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    ax.add_patch(Polygon(pts, closed=True, fc=c, ec="none", zorder=8))

def ic_tag(ax, cx, cy, c):
    pts = [(cx - 3.0, cy + 3.0), (cx + 1.4, cy + 3.0), (cx + 3.6, cy), (cx + 1.4, cy - 3.0), (cx - 3.0, cy - 3.0)]
    ax.add_patch(Polygon(pts, closed=True, fc=c, ec="none", zorder=7))
    ax.add_patch(Circle((cx - 1.6, cy), 0.75, fc="white", ec="none", zorder=8))

cards = [
    (ic_folder, "Grouped by Family",   ["autolog tags cluster runs", "one bar group per model"]),
    (ic_chart,  "Ranked Fairly",       ["evaluation metrics only", "never training scores"]),
    (ic_star,   "Champion Model",      ["best run auto-flagged", "star-rated leaderboard"]),
    (ic_tag,    "One-Click Register",  ["any run → model version", "straight to the registry"]),
]

fig = plt.figure(figsize=(13.8, 3.0), dpi=175)
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 138); ax.set_ylim(0, 30); ax.axis("off")

def T(x, y, s, size, color, bold=True):
    ax.text(x, y, s, ha="left", va="center", fontsize=size, color=color,
            fontweight="bold" if bold else "normal", family="DejaVu Sans", zorder=9)

W, GAP, x0, cy, ch_h = 33, 1.8, 1, 15, 24
for i, (icon, title, lines) in enumerate(cards):
    color = ROT[i]; x = x0 + i * (W + GAP)
    ax.add_patch(FancyBboxPatch((x, cy - ch_h / 2), W, ch_h, boxstyle="round,pad=0,rounding_size=1.8", fc="white", ec=LINE, lw=1.3, zorder=3))
    ax.add_patch(FancyBboxPatch((x, cy - ch_h / 2), W, 1.6, boxstyle="round,pad=0,rounding_size=0.5", fc=color, ec="none", zorder=4))
    ax.add_patch(Circle((x + 7.5, cy + 1.5), 5.2, fc=TINT[color], ec=color, lw=1.4, zorder=5))
    icon(ax, x + 7.5, cy + 1.5, color)
    T(x + 14, cy + 4.2, title, 11, INK)
    for k, ln in enumerate(lines):
        ax.add_patch(Circle((x + 14.6, cy - 1.4 - k * 4.0), 0.5, fc=color, ec="none", zorder=8))
        T(x + 16.4, cy - 1.4 - k * 4.0, ln, 8.6, INK3, bold=False)

fig.savefig(OUT, transparent=True)
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
