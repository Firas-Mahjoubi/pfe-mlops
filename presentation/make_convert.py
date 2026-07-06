# -*- coding: utf-8 -*-
"""Sprint 2 signature feature: notebook -> script conversion, as ONE cohesive
before/after graphic (syntax-coloured code cards + transform arrow + footer
guarantees). Replaces the loose Canva text boxes. Light theme, transparent PNG."""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Circle

OUT = r"D:\pfe\presentation\assets\notebook_convert.png"
CODEBG = "#F1F5F9"; BASE = "#334155"; COMMENT = "#94A3B8"
RED = "#DC2626"; GREEN = "#047857"
INK, INK3 = "#1F2937", "#64748B"; GOOD = "#059669"; AMBER = "#B45309"; LINE = "#D7DEE8"
MONO = "DejaVu Sans Mono"; CODE_SIZE = 9.5

fig = plt.figure(figsize=(13.8, 6.2), dpi=175)
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 138); ax.set_ylim(0, 62); ax.axis("off")
rend = fig.canvas.get_renderer(); inv = ax.transData.inverted()

def char_w(size):
    t = ax.text(0, 0, "M" * 20, fontsize=size, family=MONO)
    bb = t.get_window_extent(renderer=rend)
    (x0, _) = inv.transform((bb.x0, bb.y0)); (x1, _) = inv.transform((bb.x1, bb.y1))
    t.remove(); return (x1 - x0) / 20
CW = char_w(CODE_SIZE)

def code_line(x, y, spans):
    cx = x
    for txt, col in spans:
        ax.text(cx, y, txt, ha="left", va="center", fontsize=CODE_SIZE, color=col,
                family=MONO, zorder=8)
        cx += len(txt) * CW

def code_card(x, w, header, hcolor, htint, lines):
    ax.add_patch(FancyBboxPatch((x, 18), w, 36, boxstyle="round,pad=0,rounding_size=1.8",
                 fc=CODEBG, ec=LINE, lw=1.4, zorder=4))
    ax.add_patch(FancyBboxPatch((x + 2.5, 49.5), 34, 4.8, boxstyle="round,pad=0,rounding_size=1.4",
                 fc=htint, ec=hcolor, lw=1.2, zorder=6))
    ax.text(x + 5, 51.9, header, ha="left", va="center", fontsize=9, color=hcolor,
            fontweight="bold", family="DejaVu Sans", zorder=7)
    for i, spans in enumerate(lines):
        code_line(x + 4.5, 45.5 - i * 4.4, spans)

left_lines = [
    [("# messy Colab notebook", COMMENT)],
    [("!pip install xgboost", RED)],
    [("%matplotlib inline", RED)],
    [("%%time", RED)],
    [("model.fit(X_train, y_train)", BASE)],
    [("files = ", BASE), ("!ls", RED)],
]
right_lines = [
    [("# clean runnable script", COMMENT)],
    [("subprocess.check_call([sys.executable,", GREEN)],
    [("    '-m','pip','install','xgboost'])", GREEN)],
    [("# magic removed - code kept:", COMMENT)],
    [("model.fit(X_train, y_train)", BASE)],
    [("files = ", BASE), ("subprocess.run('ls', ...)", GREEN)],
]

code_card(2, 58, "BEFORE  ·  Jupyter notebook", AMBER, "#FDF3E3", left_lines)
code_card(78, 58, "AFTER  ·  runnable script", GREEN, "#E8F7F0", right_lines)

# ── transform arrow between the cards ────────────────────────────────────────
ax.annotate("", xy=(76.5, 36), xytext=(61.5, 36),
            arrowprops=dict(arrowstyle="-|>", color=INK, lw=2.6, mutation_scale=22), zorder=7)
ax.text(69, 41.5, "IPython", ha="center", va="center", fontsize=8.6, color=INK,
        fontweight="bold", family="DejaVu Sans", zorder=8)
ax.text(69, 38.4, "Transformer", ha="center", va="center", fontsize=8.6, color=INK,
        fontweight="bold", family="DejaVu Sans", zorder=8)
ax.text(69, 31.5, "not fragile", ha="center", va="center", fontsize=7.6, color=INK3,
        family="DejaVu Sans", zorder=8)
ax.text(69, 28.8, "regex", ha="center", va="center", fontsize=7.6, color=INK3,
        family="DejaVu Sans", zorder=8)

# ── footer guarantees ────────────────────────────────────────────────────────
ax.plot([2, 136], [13.5, 13.5], color=LINE, lw=1.2, zorder=3)
guards = [
    "Magics inside strings untouched",
    "!pip preserved as real installs",
    "%%time body kept — never lost",
    "Always compiles, or safe fallback",
]
gw, x0 = 34, 2
for i, g in enumerate(guards):
    gx = x0 + i * gw
    ax.add_patch(Circle((gx + 2.2, 7.5), 1.9, fc=GOOD, ec="none", zorder=7))
    ax.plot([gx + 1.3, gx + 2.0, gx + 3.1], [7.5, 6.6, 8.4], color="white", lw=1.6,
            solid_capstyle="round", zorder=8)
    ax.text(gx + 5.5, 7.5, g, ha="left", va="center", fontsize=8.6, color=INK,
            family="DejaVu Sans", zorder=8)

fig.savefig(OUT, transparent=True)
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
