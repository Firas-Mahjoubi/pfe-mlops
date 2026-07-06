# -*- coding: utf-8 -*-
"""Case Study end-to-end journey ribbon: one churn zip flowing through every
platform stage (upload -> monitor), each node colour-coded by the sprint that
built it. Replaces the loose checkmarks. Light theme, transparent PNG."""
import os, math
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle, Circle, Polygon

OUT = r"D:\pfe\presentation\assets\casestudy_journey.png"
INK, INK3 = "#1F2937", "#64748B"
BLUE, VIOLET, TEAL, AMBER, GREEN = "#0B5394", "#7C3AED", "#0F766E", "#D97706", "#059669"
TINT = {BLUE: "#EAF4FB", VIOLET: "#F3EFFC", TEAL: "#E6F5F5", AMBER: "#FDF3E3", GREEN: "#E8F7F0"}

# ── icons (draw around cx,cy) ─────────────────────────────────────────────────
def ic_upload(ax, cx, cy, c):
    ax.add_patch(Polygon([(cx, cy + 3.4), (cx - 2.1, cy + 0.7), (cx + 2.1, cy + 0.7)], closed=True, fc=c, ec="none", zorder=8))
    ax.add_patch(Rectangle((cx - 0.85, cy - 1.4), 1.7, 2.4, fc=c, ec="none", zorder=8))
    ax.plot([cx - 3.2, cx - 3.2, cx + 3.2, cx + 3.2], [cy - 1.0, cy - 3.2, cy - 3.2, cy - 1.0], color=c, lw=1.8, solid_capstyle="round", zorder=8)

def ic_code(ax, cx, cy, c):
    ax.text(cx, cy, "</>", ha="center", va="center", fontsize=12, color=c, fontweight="bold", family="DejaVu Sans", zorder=8)

def ic_cluster(ax, cx, cy, c):
    nodes = [(cx - 2.3, cy + 1.5), (cx + 2.3, cy + 1.5), (cx, cy - 2.3)]
    for a in nodes:
        ax.plot([cx, a[0]], [cy - 0.3, a[1]], color=c, lw=1.2, zorder=6)
    for (nx, ny) in nodes:
        ax.add_patch(FancyBboxPatch((nx - 1.3, ny - 1.0), 2.6, 2.0, boxstyle="round,pad=0,rounding_size=0.5", fc=c, ec="none", zorder=8))

def ic_chart(ax, cx, cy, c):
    for i, h in enumerate([2.4, 4.2, 3.2]):
        ax.add_patch(FancyBboxPatch((cx - 3.1 + i * 2.3, cy - 2.8), 1.6, h, boxstyle="round,pad=0,rounding_size=0.3", fc=c, ec="none", zorder=7))

def ic_tag(ax, cx, cy, c):
    pts = [(cx - 2.8, cy + 2.8), (cx + 1.3, cy + 2.8), (cx + 3.4, cy), (cx + 1.3, cy - 2.8), (cx - 2.8, cy - 2.8)]
    ax.add_patch(Polygon(pts, closed=True, fc=c, ec="none", zorder=7))
    ax.add_patch(Circle((cx - 1.5, cy), 0.7, fc="white", ec="none", zorder=8))

def ic_rocket(ax, cx, cy, c):
    body = [(cx, cy + 3.4), (cx + 1.6, cy + 0.7), (cx + 1.6, cy - 1.9), (cx - 1.6, cy - 1.9), (cx - 1.6, cy + 0.7)]
    ax.add_patch(Polygon(body, closed=True, fc=c, ec="none", zorder=8))
    ax.add_patch(Polygon([(cx - 1.6, cy - 0.5), (cx - 3.0, cy - 2.2), (cx - 1.6, cy - 2.1)], closed=True, fc=c, ec="none", zorder=7))
    ax.add_patch(Polygon([(cx + 1.6, cy - 0.5), (cx + 3.0, cy - 2.2), (cx + 1.6, cy - 2.1)], closed=True, fc=c, ec="none", zorder=7))
    ax.add_patch(Circle((cx, cy + 0.8), 0.8, fc="white", ec="none", zorder=9))

def ic_api(ax, cx, cy, c):
    ax.text(cx, cy, "{ }", ha="center", va="center", fontsize=12, color=c, fontweight="bold", family="DejaVu Sans", zorder=8)

def ic_pulse(ax, cx, cy, c):
    xs = [cx - 3.3, cx - 1.5, cx - 0.5, cx + 0.5, cx + 1.3, cx + 3.3]
    ys = [cy, cy, cy + 2.6, cy - 2.6, cy, cy]
    ax.plot(xs, ys, color=c, lw=2.0, solid_capstyle="round", solid_joinstyle="round", zorder=8)

stages = [
    (ic_upload,  BLUE,   "Upload",     "notebook zip", "S1"),
    (ic_code,    VIOLET, "Convert",    "nb → script",  "S2"),
    (ic_cluster, VIOLET, "Train",      "on cluster",   "S2"),
    (ic_chart,   VIOLET, "Rank",       "3 families",   "S2"),
    (ic_tag,     AMBER,  "Register",   "champion",     "S3"),
    (ic_rocket,  AMBER,  "Deploy",     "KServe",       "S3"),
    (ic_api,     GREEN,  "Public API", "keyed access", "S4"),
    (ic_pulse,   GREEN,  "Monitor",    "live KPIs",    "S4"),
]

fig = plt.figure(figsize=(13.8, 3.5), dpi=175)
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 138); ax.set_ylim(0, 35); ax.axis("off")

N = len(stages)
x0, x1, ny = 10, 128, 24
xs = [x0 + i * (x1 - x0) / (N - 1) for i in range(N)]
R = 5.6

# connecting ribbon + flow chevrons
ax.plot([xs[0], xs[-1]], [ny, ny], color="#D7DEE8", lw=3.0, zorder=2, solid_capstyle="round")
for i in range(N - 1):
    mx = (xs[i] + xs[i + 1]) / 2
    ax.add_patch(Polygon([(mx - 1.0, ny + 1.4), (mx + 1.4, ny), (mx - 1.0, ny - 1.4)],
                 closed=True, fc="#B4BECC", ec="none", zorder=3))

for i, (icon, color, title, sub, sp) in enumerate(stages):
    cx = xs[i]
    ax.add_patch(Circle((cx, ny), R, fc=TINT[color], ec=color, lw=1.8, zorder=5))
    icon(ax, cx, ny, color)
    # sprint chip above
    ax.add_patch(FancyBboxPatch((cx - 3.0, ny + R + 0.6), 6.0, 3.4, boxstyle="round,pad=0,rounding_size=1.4",
                 fc=color, ec="none", zorder=6))
    ax.text(cx, ny + R + 2.3, sp, ha="center", va="center", fontsize=7.6, color="white",
            fontweight="bold", family="DejaVu Sans", zorder=7)
    # labels below
    ax.text(cx, ny - R - 2.4, title, ha="center", va="center", fontsize=9.6, color=INK,
            fontweight="bold", family="DejaVu Sans", zorder=7)
    ax.text(cx, ny - R - 5.6, sub, ha="center", va="center", fontsize=7.8, color=INK3,
            family="DejaVu Sans", zorder=7)

fig.savefig(OUT, transparent=True)
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
