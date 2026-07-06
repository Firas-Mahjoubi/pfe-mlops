# -*- coding: utf-8 -*-
"""Classic SCRUM PROCESS schema recreated in the deck theme:
chevron flow (User Stories -> Backlog -> Planning -> Sprint backlog -> Sprint
loop -> Deployment -> Review/Retro), roles above. Transparent PNG."""
import os, math
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Circle, Wedge, Polygon, Rectangle

OUT = r"D:\pfe\presentation\assets\scrum.png"
INK, INK2, INK3 = "#1F2937", "#475569", "#64748B"
VIOLET, VIOLET_D = "#8B5CF6", "#6D28D9"
ORANGE = "#F5901E"
AMBER = "#F59E0B"
GOOD = "#10B981"
AVA = "#94A3B8"
LT = "#EDE7FA"

fig = plt.figure(figsize=(14.2, 7.2), dpi=175)
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 142); ax.set_ylim(0, 72); ax.axis("off")

def T(x, y, s, size, color, bold=True, ls=1.05, ha="center", alpha=1.0):
    ax.text(x, y, s, ha=ha, va="center", fontsize=size, color=color,
            fontweight="bold" if bold else "normal", family="DejaVu Sans",
            zorder=12, linespacing=ls, alpha=alpha)

def person(cx, cy, color, s=1.0, z=6):
    ax.add_patch(Wedge((cx, cy - 0.6 * s), 2.6 * s, 0, 180, fc=color, ec="none", zorder=z))
    ax.add_patch(Circle((cx, cy + 2.0 * s), 1.55 * s, fc=color, ec="none", zorder=z))

def avatar(cx, cy, ring, r=5.2):
    ax.add_patch(Circle((cx, cy), r, fc="white", ec=ring, lw=2.6, zorder=5))
    clip = Circle((cx, cy), r - 0.4, transform=ax.transData)
    w = Wedge((cx, cy - 1.6), 4.0, 0, 180, fc=AVA, ec="none", zorder=6); w.set_clip_path(clip); ax.add_patch(w)
    h = Circle((cx, cy + 1.3), 2.2, fc=AVA, ec="none", zorder=7); ax.add_patch(h)

def chevron(x0, w, y0, h, color, label):
    notch = 4.6
    pts = [(x0, y0 + h), (x0 + w, y0 + h), (x0 + w + notch, y0 + h / 2),
           (x0 + w, y0), (x0, y0), (x0 + notch, y0 + h / 2)]
    ax.add_patch(Polygon(pts, closed=True, fc=color, ec="none", zorder=4))
    T(x0 + notch + (w - notch) / 2, y0 + h / 2, label, 11, "white")

def lightbulb(cx, cy):
    ax.add_patch(Circle((cx, cy + 0.5), 3.1, fc=AMBER, ec="none", zorder=6))
    ax.add_patch(Rectangle((cx - 1.4, cy - 3.4), 2.8, 2.2, fc="#64748B", ec="none", zorder=6))
    for dy in (-2.0, -2.8):
        ax.plot([cx - 1.4, cx + 1.4], [cy + dy, cy + dy], color="white", lw=1.0, zorder=7)
    for a in range(0, 360, 45):
        r1, r2 = 3.7, 4.8
        ax.plot([cx + r1 * math.cos(math.radians(a)), cx + r2 * math.cos(math.radians(a))],
                [cy + 0.5 + r1 * math.sin(math.radians(a)), cy + 0.5 + r2 * math.sin(math.radians(a))],
                color=AMBER, lw=1.4, zorder=5)

def docstack(cx, cy):
    for k, off in enumerate([(1.4, -1.4), (0.7, -0.7), (0, 0)]):
        x = cx - 3 + off[0]; y = cy - 3 + off[1]
        ax.add_patch(FancyBboxPatch((x, y), 6, 7, boxstyle="round,pad=0,rounding_size=0.5",
                     fc=AMBER, ec="white", lw=1.2, zorder=5 + k))
    for i in range(3):
        ax.plot([cx - 1.6, cx + 2.2], [cy + 2 - i * 1.6, cy + 2 - i * 1.6], color="white", lw=1.1, zorder=9)

def clipboard(cx, cy):
    ax.add_patch(FancyBboxPatch((cx - 3.4, cy - 4), 6.8, 8.4, boxstyle="round,pad=0,rounding_size=0.7",
                 fc="white", ec="#CBD5E1", lw=1.4, zorder=5))
    ax.add_patch(FancyBboxPatch((cx - 1.4, cy + 3.4), 2.8, 1.6, boxstyle="round,pad=0,rounding_size=0.4",
                 fc="#94A3B8", ec="none", zorder=6))
    for i in range(3):
        yy = cy + 1.4 - i * 2.0
        ax.add_patch(Rectangle((cx - 2.4, yy - 0.5), 1.1, 1.1, fc="none", ec=AMBER, lw=1.0, zorder=7))
        ax.plot([cx - 2.15, cx - 1.9, cx - 1.5], [yy, yy - 0.35, yy + 0.4], color=AMBER, lw=1.0, zorder=8)
        ax.plot([cx - 0.6, cx + 2.4], [yy, yy], color="#CBD5E1", lw=1.2, zorder=7)

def circ_arrow(cx, cy, R, width, color, a1, a2, headsize=4.2, z=3):
    ax.add_patch(Wedge((cx, cy), R, a1, a2, width=width, fc=color, ec="none", zorder=z))
    ang = math.radians(a1)
    rm = R - width / 2
    bx, by = cx + rm * math.cos(ang), cy + rm * math.sin(ang)
    tx, ty = math.sin(ang), -math.cos(ang)     # clockwise tangent at a1
    nx, ny = math.cos(ang), math.sin(ang)      # radial
    tip = (bx + tx * headsize * 1.5, by + ty * headsize * 1.5)
    p1 = (bx + nx * headsize, by + ny * headsize)
    p2 = (bx - nx * headsize, by - ny * headsize)
    ax.add_patch(Polygon([tip, p1, p2], closed=True, fc=color, ec="none", zorder=z))

# ── title ───────────────────────────────────────────────────────────────────
T(4, 68, "SCRUM PROCESS", 17, INK3, ha="left")

BASE = 20   # chevron baseline
CH = 8

# 1. Product vision (lightbulb)
lightbulb(7, BASE + CH / 2)
T(7, 11, "Product\nVision", 9.5, INK3)

# 2. User Stories chevron  (+ PO avatar above)
chevron(12, 20, BASE, CH, VIOLET, "User Stories")
avatar(24, 44, VIOLET)
T(24, 36, "Product Owner", 11, INK)

# 3. Product Backlog
docstack(43, BASE + CH / 2 + 1)
T(43, 11, "Product\nBacklog", 9.5, INK3)

# 4. Planning meeting
clipboard(56, BASE + CH / 2)
T(56, 10.5, "Planning\nmeeting", 9.5, INK3)

# 5. Sprint backlog chevron
chevron(63, 20, BASE, CH, VIOLET, "Sprint backlog")

# 6. Sprint loop (orange circular arrow) with dev team + Scrum Master above
SCX, SCY, SR = 100, 36, 14.5
circ_arrow(SCX, SCY, SR, 4.4, ORANGE, 205, 150, headsize=4.6)
T(SCX + 1, SCY + 6.5, "Sprint\n2–4 weeks", 10.5, "#B45309")
# dev team (3 silhouettes)
person(SCX - 4, SCY - 4, VIOLET, s=0.85)
person(SCX + 4, SCY - 4, AMBER, s=0.85)
person(SCX, SCY - 3, "#F472B6", s=1.0)
T(SCX, SCY - 9.5, "Dev team", 10.5, INK)
# Scrum Master above the loop
avatar(70, 52, ORANGE)
T(70, 44, "Scrum Master", 11, INK)
# daily stand-up mini loop (top-right of circle)
circ_arrow(SCX + 12, SCY + 15, 5.2, 2.4, VIOLET, 300, 210, headsize=2.6)
T(SCX + 12, SCY + 15, "Daily\nStand Up", 8.5, VIOLET_D)

# 7. Deployment chevron
chevron(118, 20, BASE, CH, VIOLET, "Deployment")
# 8. Review + Retro (check + stars)
ax.add_patch(Circle((129, 12.5), 2.4, fc=GOOD, ec="none", zorder=6))
T(129, 12.6, "✓", 12, "white")
ax.scatter([125.5, 129, 132.5], [7, 7, 7], marker="*", s=160, color=AMBER, zorder=7)
T(129, 3.5, "Sprint Review + Retrospective", 9, INK3)

fig.savefig(OUT, transparent=True)
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
