# -*- coding: utf-8 -*-
"""Sprint 'Prediction & Public API' right-column panel: issue KEY -> REQUEST ->
RESPONSE, with folded-in guarantees. Replaces the plain Canva code box and loose
checkmarks. Light theme, transparent PNG."""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Circle

OUT = r"D:\pfe\presentation\assets\public_api.png"
CODEBG = "#F1F5F9"; BASE = "#334155"; INK, INK3 = "#1F2937", "#64748B"
BLUE, TEAL, GREEN, GOOD, AMBER = "#0B5394", "#0F766E", "#047857", "#059669", "#B45309"
LINE = "#D7DEE8"; MONO = "DejaVu Sans Mono"; CS = 9.5

fig = plt.figure(figsize=(9.2, 10.0), dpi=175)
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 92); ax.set_ylim(0, 100); ax.axis("off")
rend = fig.canvas.get_renderer(); inv = ax.transData.inverted()

def char_w(size):
    t = ax.text(0, 0, "M" * 20, fontsize=size, family=MONO)
    bb = t.get_window_extent(renderer=rend)
    (x0, _) = inv.transform((bb.x0, bb.y0)); (x1, _) = inv.transform((bb.x1, bb.y1))
    t.remove(); return (x1 - x0) / 20
CW = char_w(CS)

def code_line(x, y, spans):
    cx = x
    for sp in spans:
        txt, col = sp[0], sp[1]
        bold = sp[2] if len(sp) > 2 else False
        ax.text(cx, y, txt, ha="left", va="center", fontsize=CS, color=col,
                family=MONO, fontweight="bold" if bold else "normal", zorder=8)
        cx += len(txt) * CW

def tab(x, y, label, color, tint):
    ax.add_patch(FancyBboxPatch((x, y), 24, 4.6, boxstyle="round,pad=0,rounding_size=1.3",
                 fc=tint, ec=color, lw=1.2, zorder=6))
    ax.text(x + 3, y + 2.3, label, ha="left", va="center", fontsize=8.6, color=color,
            fontweight="bold", family="DejaVu Sans", zorder=7)

def ic_key(cx, cy, c):
    ax.add_patch(Circle((cx - 1.3, cy + 1.2), 1.7, fc="none", ec=c, lw=1.8, zorder=8))
    ax.add_patch(Circle((cx - 1.3, cy + 1.2), 0.65, fc="white", ec="none", zorder=9))
    ax.plot([cx - 0.1, cx + 2.7], [cy + 0.05, cy - 2.7], color=c, lw=1.9, solid_capstyle="round", zorder=8)
    ax.plot([cx + 1.7, cx + 2.6], [cy - 0.9, cy - 0.35], color=c, lw=1.9, solid_capstyle="round", zorder=8)

# ── API KEY banner ───────────────────────────────────────────────────────────
ax.add_patch(FancyBboxPatch((2, 89), 88, 9.5, boxstyle="round,pad=0,rounding_size=1.8",
             fc="#FDF3E3", ec=AMBER, lw=1.4, zorder=4))
ic_key(9, 93.8, AMBER)
ax.text(15, 95.6, "PUBLIC API KEY", ha="left", va="center", fontsize=9, color=AMBER,
        fontweight="bold", family="DejaVu Sans", zorder=7)
code_line(15, 91.7, [("mlops_LHIAQO", INK, True), ("••••••••", INK3)])
ax.add_patch(FancyBboxPatch((62, 91.6), 25, 4.6, boxstyle="round,pad=0,rounding_size=2.2",
             fc="white", ec=AMBER, lw=1.1, zorder=6))
ax.text(74.5, 93.9, "issued once · hashed", ha="center", va="center", fontsize=8, color=AMBER,
        fontweight="bold", family="DejaVu Sans", zorder=7)
ax.annotate("", xy=(46, 85.5), xytext=(46, 88.5),
            arrowprops=dict(arrowstyle="-|>", color=INK3, lw=2.0, mutation_scale=15), zorder=6)

# ── REQUEST card ─────────────────────────────────────────────────────────────
ax.add_patch(FancyBboxPatch((2, 49), 88, 36, boxstyle="round,pad=0,rounding_size=1.8",
             fc=CODEBG, ec=LINE, lw=1.4, zorder=4))
tab(4.5, 80.5, "REQUEST", BLUE, "#EAF4FB")
req = [
    [("curl ", BASE), ("-X POST ", TEAL, True), ("https://mlops.firasmahjoubi.app", BLUE)],
    [("     /api/public/predict/", BLUE), ("<deployment>", INK3)],
    [("     -H ", INK3), ('"Authorization: Bearer ', GREEN), ("mlops_<your_key>", AMBER, True), ('"', GREEN)],
    [("     -H ", INK3), ('"Content-Type: application/json"', GREEN)],
    [("     -d ", INK3), ('\'{"instances": [[13.54, 14.36, ...]]}\'', GREEN)],
]
for i, spans in enumerate(req):
    code_line(6, 76.5 - i * 4.9, spans)
ax.text(11, 53.2, "↳  paste the mlops_<your_key> you saved when the key was created",
        ha="left", va="center", fontsize=8, color=AMBER, family="DejaVu Sans", zorder=8)
ax.annotate("", xy=(46, 45.5), xytext=(46, 48.5),
            arrowprops=dict(arrowstyle="-|>", color=INK3, lw=2.0, mutation_scale=15), zorder=6)

# ── RESPONSE card ────────────────────────────────────────────────────────────
ax.add_patch(FancyBboxPatch((2, 30), 88, 14, boxstyle="round,pad=0,rounding_size=1.8",
             fc="white", ec=GOOD, lw=1.5, zorder=4))
tab(4.5, 39.5, "RESPONSE", GOOD, "#E8F7F0")
code_line(6, 34.5, [("{", BASE), ('"predictions"', BASE, True), (": [0]}", BASE)])
ax.add_patch(FancyBboxPatch((64, 32.6), 23, 5.2, boxstyle="round,pad=0,rounding_size=2.4",
             fc="#E8F7F0", ec=GOOD, lw=1.2, zorder=6))
ax.add_patch(Circle((68, 35.2), 1.0, fc=GOOD, ec="none", zorder=7))
ax.text(70.5, 35.2, "200 OK  ·  45 ms", ha="left", va="center", fontsize=8.6, color=GOOD,
        fontweight="bold", family="DejaVu Sans", zorder=7)

# ── guarantees footer ────────────────────────────────────────────────────────
ax.plot([2, 90], [26, 26], color=LINE, lw=1.2, zorder=3)
guards = [
    "Per-deployment API keys — SHA-256 hashed, shown once",
    "Any website / app can consume the model — no account",
    "Ready-to-paste cURL / JS / Python snippets",
]
for i, g in enumerate(guards):
    gy = 20.5 - i * 6.2
    ax.add_patch(Circle((5, gy), 1.9, fc=GOOD, ec="none", zorder=7))
    ax.plot([4.1, 4.8, 5.9], [gy, gy - 0.9, gy + 0.9], color="white", lw=1.6,
            solid_capstyle="round", zorder=8)
    ax.text(8.5, gy, g, ha="left", va="center", fontsize=9.2, color=INK,
            family="DejaVu Sans", zorder=8)

fig.savefig(OUT, transparent=True)
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
