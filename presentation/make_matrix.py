# -*- coding: utf-8 -*-
"""State-of-the-art capability matrix — the winning column is all green.
Transparent PNG, deck light theme."""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Circle

OUT = r"D:\pfe\presentation\assets\soa_matrix.png"
INK, INK2, INK3 = "#1F2937", "#475569", "#64748B"
PRIMARY = "#0B5394"
GOOD, AMBER, BAD = "#059669", "#D97706", "#DC2626"
GOOD_T, AMBER_T, BAD_T = "#E8F7F0", "#FDF3E3", "#FBEBEB"
BLUEBAND = "#EAF4FB"
LINEC = "#D7DEE8"

rows = [
    "Full ML lifecycle\n(train → deploy → consume)",
    "Automatic experiment tracking",
    "Model registry & versioning",
    "One-click deployment (serving)",
    "Public API for external apps",
    "100% open-source · no lock-in",
    "Browser-only · no Git/Docker",
]
cols = ["SageMaker /\nVertex · Azure ML", "Databricks", "AIchor", "Kubeflow", "This\nplatform"]
# y = yes, p = partial, n = no
data = [
    ["y", "p", "n", "p", "y"],
    ["y", "y", "p", "p", "y"],
    ["y", "y", "n", "p", "y"],
    ["y", "p", "n", "p", "y"],
    ["p", "p", "n", "n", "y"],
    ["n", "n", "n", "y", "y"],
    ["n", "p", "n", "n", "y"],
]

fig = plt.figure(figsize=(13.4, 6.4), dpi=170)
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 134); ax.set_ylim(0, 64); ax.axis("off")

LAB_X, LAB_W = 1.5, 41
col_w = (132 - (LAB_X + LAB_W)) / len(cols)
col_x0 = LAB_X + LAB_W
def col_center(j): return col_x0 + col_w * j + col_w / 2

HEAD_Y = 57.5
row_h = 6.9
row_top = 52.5
def row_center(i): return row_top - i * row_h - row_h / 2 + row_h/2 - 0.4 + (row_h/2 - (row_h/2))  # simplify below
def rc(i): return row_top - i * row_h - row_h / 2

# highlight winning column band
wx = col_x0 + col_w * (len(cols) - 1)
band = FancyBboxPatch((wx + 0.4, rc(len(rows) - 1) - row_h/2 - 0.6), col_w - 0.8,
                      (HEAD_Y + 2.6) - (rc(len(rows)-1) - row_h/2 - 0.6),
                      boxstyle="round,pad=0,rounding_size=2.2",
                      fc=BLUEBAND, ec=PRIMARY, lw=1.6, zorder=1)
ax.add_patch(band)

# headers
ax.text(LAB_X + 0.3, HEAD_Y, "CAPABILITY", ha="left", va="center", fontsize=11.5,
        color=INK3, fontweight="bold", family="DejaVu Sans")
for j, c in enumerate(cols):
    is_win = j == len(cols) - 1
    ax.text(col_center(j), HEAD_Y, c, ha="center", va="center",
            fontsize=12.5 if is_win else 11.5,
            color=PRIMARY if is_win else INK2, fontweight="bold", family="DejaVu Sans")
# header underline
ax.plot([LAB_X, 132], [HEAD_Y - 3.0, HEAD_Y - 3.0], color=LINEC, lw=1.4, zorder=2)

sym = {"y": ("✓", GOOD, GOOD_T), "p": ("~", AMBER, AMBER_T), "n": ("✗", BAD, BAD_T)}
for i in range(len(rows)):
    y = rc(i)
    ax.text(LAB_X + 0.3, y, rows[i], ha="left", va="center", fontsize=11.5,
            color=INK, fontweight="bold", family="DejaVu Sans", linespacing=1.15)
    if i < len(rows) - 1:
        ax.plot([LAB_X, 132], [y - row_h / 2, y - row_h / 2], color="#EDF1F6", lw=1, zorder=1)
    for j in range(len(cols)):
        v = data[i][j]
        glyph, color, tint = sym[v]
        is_win = j == len(cols) - 1
        cxp = col_center(j)
        if is_win:  # solid strong circle
            ax.add_patch(Circle((cxp, y), 2.05, fc=GOOD, ec="none", zorder=4))
            ax.text(cxp, y + 0.05, "✓", ha="center", va="center", fontsize=15,
                    color="white", fontweight="bold", family="DejaVu Sans", zorder=5)
        else:       # outlined tinted circle
            ax.add_patch(Circle((cxp, y), 1.95, fc=tint, ec=color, lw=1.5, zorder=4))
            ax.text(cxp, y + 0.05, glyph, ha="center", va="center",
                    fontsize=13 if v != "~" else 15, color=color, fontweight="bold",
                    family="DejaVu Sans", zorder=5)

# legend
ly = 2.4
items = [("✓", GOOD, GOOD_T, "Full support"), ("~", AMBER, AMBER_T, "Partial"),
         ("✗", BAD, BAD_T, "Not available")]
lx = LAB_X + 0.3
for glyph, color, tint, label in items:
    ax.add_patch(Circle((lx + 1.4, ly), 1.5, fc=tint, ec=color, lw=1.4, zorder=4))
    ax.text(lx + 1.4, ly + 0.05, glyph, ha="center", va="center", fontsize=11,
            color=color, fontweight="bold", family="DejaVu Sans", zorder=5)
    ax.text(lx + 3.4, ly, label, ha="left", va="center", fontsize=10.5, color=INK3,
            family="DejaVu Sans")
    lx += 22
ax.text(132, ly, "Only this platform covers every capability",
        ha="right", va="center", fontsize=11.5, color=PRIMARY, fontweight="bold",
        family="DejaVu Sans")

fig.savefig(OUT, transparent=True)
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
