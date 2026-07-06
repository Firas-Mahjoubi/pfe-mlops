# -*- coding: utf-8 -*-
"""Case-study PROOF panel from the REAL churn model output (churn_real.json):
ROC curve + confusion matrix + risk segmentation, deck light theme, English.
All numbers are the model's actual test-set results."""
import os, json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle

D = json.load(open(r"C:\Users\frsma\AppData\Local\Temp\claude\d--pfe\af8e6915-ea97-408e-a073-e9829bc5980e\scratchpad\churn_real.json"))
OUT = r"D:\pfe\presentation\assets\casestudy_proof.png"
INK, INK2, INK3 = "#1F2937", "#475569", "#64748B"
BLUE, VIOLET, GOOD, BAD, AMBER = "#0B5394", "#7C3AED", "#059669", "#DC2626", "#D97706"
LINE = "#D7DEE8"

fig = plt.figure(figsize=(13.8, 4.7), dpi=175)
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 138); ax.set_ylim(0, 47); ax.axis("off")

def T(x, y, s, size, color, bold=True, ha="left", va="center", family="DejaVu Sans"):
    ax.text(x, y, s, ha=ha, va=va, fontsize=size, color=color,
            fontweight="bold" if bold else "normal", family=family, zorder=9)

def panel_title(x, s):
    T(x, 44, s, 11, INK, ha="left")

# ══ PANEL 1 · ROC curve ══════════════════════════════════════════════════════
panel_title(2, "ROC curve")
rx, ry, rw, rh = 4, 6, 34, 33          # plot box in data coords
ax.add_patch(FancyBboxPatch((rx - 2, ry - 2, ), rw + 6, rh + 8, boxstyle="round,pad=0,rounding_size=1.2",
             fc="white", ec=LINE, lw=1.2, zorder=2))
def px(v): return rx + v * rw
def py(v): return ry + v * rh
for g in (0, 0.25, 0.5, 0.75, 1.0):
    ax.plot([px(0), px(1)], [py(g), py(g)], color="#EEF2F7", lw=0.9, zorder=3)
    ax.plot([px(g), px(g)], [py(0), py(1)], color="#EEF2F7", lw=0.9, zorder=3)
ax.plot([px(0), px(1)], [py(0), py(1)], ls=(0, (4, 3)), color=INK3, lw=1.2, zorder=4)
fpr, tpr = D["fpr"], D["tpr"]
ax.fill_between([px(v) for v in fpr], [py(v) for v in tpr], py(0),
                color=BLUE, alpha=0.10, zorder=4)
ax.plot([px(v) for v in fpr], [py(v) for v in tpr], color=BLUE, lw=2.4, zorder=6)
T(px(0.02), py(0), "0", 8, INK3, bold=False, ha="left")
T(px(1), py(-0.06), "FPR", 8, INK3, bold=False, ha="right", va="top")
ax.text(rx - 3.4, py(0.5), "TPR", rotation=90, ha="center", va="center", fontsize=8, color=INK3, zorder=9)
# AUC badge
ax.add_patch(FancyBboxPatch((px(0.30), py(0.10)), 15.5, 5.2, boxstyle="round,pad=0,rounding_size=2.4",
             fc="#EAF4FB", ec=BLUE, lw=1.2, zorder=7))
T(px(0.30) + 7.7, py(0.10) + 2.6, "AUC  0.911", 10, BLUE, ha="center")

# ══ PANEL 2 · Confusion matrix ═══════════════════════════════════════════════
cx0 = 50
panel_title(cx0, "Confusion matrix — test set")
cm = D["cm"]; TN, FP, FN, TP = cm[0][0], cm[0][1], cm[1][0], cm[1][1]
gx, gy, cell = cx0 + 6, 10, 13
labels_pred = ["Active", "Churn"]; labels_true = ["Active", "Churn"]
vals = [[TN, FP], [FN, TP]]
diag = [[True, False], [False, True]]
for r in range(2):
    for c in range(2):
        x = gx + c * cell; y = gy + (1 - r) * cell
        fc = ("#E8F7F0" if diag[r][c] else "#FBEAEA")
        ec = (GOOD if diag[r][c] else BAD)
        ax.add_patch(FancyBboxPatch((x, y), cell - 1.2, cell - 1.2, boxstyle="round,pad=0,rounding_size=1.0",
                     fc=fc, ec=ec, lw=1.4, zorder=5))
        T(x + (cell - 1.2) / 2, y + (cell - 1.2) / 2 + 1.4, str(vals[r][c]), 15, ec, ha="center")
        tag = ["TN", "FP", "FN", "TP"][r * 2 + c]
        T(x + (cell - 1.2) / 2, y + 2.0, tag, 8, ec, ha="center")
# axis labels
T(gx + cell - 0.6, gy + 2 * cell + 1.2, "predicted", 8, INK3, bold=False, ha="center")
T(gx + 0.5 * (cell - 1.2), gy + 2 * cell + 4.2, "Active", 8.5, INK2, ha="center")
T(gx + cell + 0.5 * (cell - 1.2), gy + 2 * cell + 4.2, "Churn", 8.5, INK2, ha="center")
ax.text(gx - 3.2, gy + cell + (cell - 1.2) / 2, "Active", rotation=90, ha="center", va="center", fontsize=8.5, color=INK2, fontweight="bold")
ax.text(gx - 3.2, gy + (cell - 1.2) / 2, "Churn", rotation=90, ha="center", va="center", fontsize=8.5, color=INK2, fontweight="bold")

# ══ PANEL 3 · risk segmentation + headline metrics ═══════════════════════════
sx = 92
panel_title(sx, "Churn by ML risk segment")
seg = D["segments"]
order = [("Faible", "Low", GOOD), ("Moyen", "Medium", AMBER), ("Haut", "High", BAD)]
bx, bw, top = sx + 22, 15, 36
for i, (k, lab, col) in enumerate(order):
    yb = top - i * 8.5
    pct = seg[k]["churn_pct"]; n = seg[k]["n"]
    ax.add_patch(FancyBboxPatch((bx, yb - 2.6), bw, 5.2, boxstyle="round,pad=0,rounding_size=0.8",
                 fc="#EEF2F7", ec="none", zorder=4))
    ax.add_patch(FancyBboxPatch((bx, yb - 2.6), max(bw * pct / 100, 1.2), 5.2, boxstyle="round,pad=0,rounding_size=0.8",
                 fc=col, ec="none", zorder=5))
    T(sx, yb, lab, 9.5, INK, ha="left")
    T(sx + 9, yb, f"n={n}", 8, INK3, bold=False, ha="left")
    T(bx + bw + 1.5, yb, f"{pct:.0f}%", 10, col, ha="left")
# headline strip under
T(sx, 6.5, "High-risk = 96% churn", 10, BAD, ha="left")
T(sx, 2.8, "actionable retention list", 8.2, INK3, bold=False, ha="left")

fig.savefig(OUT, transparent=True)
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
