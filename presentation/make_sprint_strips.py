# -*- coding: utf-8 -*-
"""Sprint deliverables strips (sprints 1-4): 4 compact feature cards each, drawn
icons, shared layout + color rotation. One band per sprint slide. Light theme."""
import os, math
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle, Circle, Arc, Polygon

ASSETS = r"D:\pfe\presentation\assets"
INK, INK3 = "#1F2937", "#64748B"
BLUE, VIOLET, TEAL, AMBER = "#0B5394", "#7C3AED", "#0F766E", "#D97706"
TINT = {BLUE: "#EAF4FB", VIOLET: "#F3EFFC", TEAL: "#E6F5F5", AMBER: "#FDF3E3"}
LINE = "#D7DEE8"
ROT = [BLUE, VIOLET, TEAL, AMBER]

# ── icon library (all draw around a centre cx,cy inside a badge) ──────────────
def ic_lock(ax, cx, cy, c):
    ax.add_patch(Arc((cx, cy + 1.4), 4.0, 4.4, theta1=0, theta2=180, lw=1.8, ec=c, zorder=7))
    ax.add_patch(FancyBboxPatch((cx - 2.6, cy - 3.0), 5.2, 4.2, boxstyle="round,pad=0,rounding_size=0.7", fc=c, ec="none", zorder=7))
    ax.add_patch(Circle((cx, cy - 0.7), 0.7, fc="white", ec="none", zorder=8))

def ic_folder(ax, cx, cy, c):
    ax.add_patch(FancyBboxPatch((cx - 3.2, cy + 0.6), 3.0, 1.6, boxstyle="round,pad=0,rounding_size=0.4", fc=c, ec="none", zorder=7))
    ax.add_patch(FancyBboxPatch((cx - 3.4, cy - 3.0), 6.8, 5.0, boxstyle="round,pad=0,rounding_size=0.7", fc=c, ec="none", zorder=8))
    ax.add_patch(Rectangle((cx - 3.4, cy - 0.2), 6.8, 0.55, fc="white", ec="none", zorder=9))

def ic_chart(ax, cx, cy, c):
    for i, h in enumerate([2.6, 4.4, 3.4]):
        ax.add_patch(FancyBboxPatch((cx - 3.3 + i * 2.4, cy - 3.0), 1.7, h, boxstyle="round,pad=0,rounding_size=0.3", fc=c, ec="none", zorder=7))

def ic_shield(ax, cx, cy, c):
    pts = [(cx, cy + 3.6), (cx + 3.2, cy + 2.0), (cx + 3.2, cy - 1.2), (cx, cy - 3.6), (cx - 3.2, cy - 1.2), (cx - 3.2, cy + 2.0)]
    ax.add_patch(Polygon(pts, closed=True, fc=c, ec="none", zorder=7))
    ax.plot([cx - 1.5, cx - 0.3, cx + 1.8], [cy - 0.2, cy - 1.5, cy + 1.6], color="white", lw=2.0, solid_capstyle="round", zorder=9)

def ic_upload(ax, cx, cy, c):
    ax.add_patch(Polygon([(cx, cy + 3.6), (cx - 2.2, cy + 0.8), (cx + 2.2, cy + 0.8)], closed=True, fc=c, ec="none", zorder=8))
    ax.add_patch(Rectangle((cx - 0.9, cy - 1.4), 1.8, 2.6, fc=c, ec="none", zorder=8))
    ax.plot([cx - 3.4, cx - 3.4, cx + 3.4, cx + 3.4], [cy - 1.0, cy - 3.4, cy - 3.4, cy - 1.0], color=c, lw=1.9, solid_capstyle="round", zorder=8)

def ic_code(ax, cx, cy, c):
    ax.text(cx, cy, "</>", ha="center", va="center", fontsize=12.5, color=c, fontweight="bold", family="DejaVu Sans", zorder=8)

def ic_cluster(ax, cx, cy, c):
    nodes = [(cx - 2.4, cy + 1.6), (cx + 2.4, cy + 1.6), (cx, cy - 2.4)]
    for a in nodes:
        ax.plot([cx, a[0]], [cy - 0.3, a[1]], color=c, lw=1.3, zorder=6)
    for (nx, ny) in nodes:
        ax.add_patch(FancyBboxPatch((nx - 1.4, ny - 1.1), 2.8, 2.2, boxstyle="round,pad=0,rounding_size=0.5", fc=c, ec="none", zorder=8))

def ic_logs(ax, cx, cy, c):
    ax.add_patch(FancyBboxPatch((cx - 3.6, cy - 3.0), 7.2, 6.0, boxstyle="round,pad=0,rounding_size=0.8", fc="none", ec=c, lw=1.8, zorder=7))
    ax.plot([cx - 2.4, cx - 1.4, cx - 2.4], [cy + 1.2, cy + 0.4, cy - 0.4], color=c, lw=1.6, solid_capstyle="round", zorder=8)
    ax.plot([cx - 0.6, cx + 2.4], [cy - 0.4, cy - 0.4], color=c, lw=1.6, solid_capstyle="round", zorder=8)

def ic_tag(ax, cx, cy, c):
    pts = [(cx - 3.0, cy + 3.0), (cx + 1.4, cy + 3.0), (cx + 3.6, cy), (cx + 1.4, cy - 3.0), (cx - 3.0, cy - 3.0)]
    ax.add_patch(Polygon(pts, closed=True, fc=c, ec="none", zorder=7))
    ax.add_patch(Circle((cx - 1.6, cy), 0.75, fc="white", ec="none", zorder=8))

def ic_layers(ax, cx, cy, c):
    shades = [TINT[c], c, c]
    for k, sh in enumerate(shades):
        y = cy - 3.0 + k * 2.2
        ax.add_patch(FancyBboxPatch((cx - 3.2, y), 6.4, 1.7, boxstyle="round,pad=0,rounding_size=0.4",
                     fc=sh, ec=c, lw=1.2, zorder=7 + k))

def ic_rocket(ax, cx, cy, c):
    body = [(cx, cy + 3.6), (cx + 1.7, cy + 0.8), (cx + 1.7, cy - 2.0), (cx - 1.7, cy - 2.0), (cx - 1.7, cy + 0.8)]
    ax.add_patch(Polygon(body, closed=True, fc=c, ec="none", zorder=8))
    ax.add_patch(Polygon([(cx - 1.7, cy - 0.6), (cx - 3.2, cy - 2.4), (cx - 1.7, cy - 2.2)], closed=True, fc=c, ec="none", zorder=7))
    ax.add_patch(Polygon([(cx + 1.7, cy - 0.6), (cx + 3.2, cy - 2.4), (cx + 1.7, cy - 2.2)], closed=True, fc=c, ec="none", zorder=7))
    ax.add_patch(Circle((cx, cy + 0.9), 0.85, fc="white", ec="none", zorder=9))

def ic_target(ax, cx, cy, c):
    ax.add_patch(Circle((cx, cy), 3.4, fc="none", ec=c, lw=1.9, zorder=7))
    ax.add_patch(Circle((cx, cy), 1.8, fc="none", ec=c, lw=1.7, zorder=7))
    ax.add_patch(Circle((cx, cy), 0.7, fc=c, ec="none", zorder=8))

def ic_key(ax, cx, cy, c):
    ax.add_patch(Circle((cx - 1.3, cy + 1.3), 1.9, fc="none", ec=c, lw=1.9, zorder=8))
    ax.add_patch(Circle((cx - 1.3, cy + 1.3), 0.7, fc="white", ec="none", zorder=9))
    ax.plot([cx - 0.1, cx + 3.0], [cy + 0.1, cy - 3.0], color=c, lw=2.0, solid_capstyle="round", zorder=8)
    ax.plot([cx + 1.9, cx + 2.9], [cy - 1.0, cy - 0.4], color=c, lw=2.0, solid_capstyle="round", zorder=8)
    ax.plot([cx + 1.1, cx + 1.9], [cy - 1.8, cy - 1.3], color=c, lw=2.0, solid_capstyle="round", zorder=8)

def ic_pulse(ax, cx, cy, c):
    xs = [cx - 3.6, cx - 1.6, cx - 0.6, cx + 0.5, cx + 1.4, cx + 3.6]
    ys = [cy, cy, cy + 2.8, cy - 2.8, cy, cy]
    ax.plot(xs, ys, color=c, lw=2.1, solid_capstyle="round", solid_joinstyle="round", zorder=8)

def ic_sliders(ax, cx, cy, c):
    for y, kx in [(cy + 1.7, cx - 1.0), (cy - 1.7, cx + 1.2)]:
        ax.plot([cx - 3.4, cx + 3.4], [y, y], color=c, lw=1.7, solid_capstyle="round", zorder=7)
        ax.add_patch(Circle((kx, y), 1.15, fc="white", ec=c, lw=1.7, zorder=8))

# ── card renderer ─────────────────────────────────────────────────────────────
def render_strip(cards, out):
    fig = plt.figure(figsize=(13.8, 3.0), dpi=175)
    ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 138); ax.set_ylim(0, 30); ax.axis("off")

    def T(x, y, s, size, color, bold=True):
        ax.text(x, y, s, ha="left", va="center", fontsize=size, color=color,
                fontweight="bold" if bold else "normal", family="DejaVu Sans", zorder=9)

    W, GAP, x0, cy, ch_h = 33, 1.8, 1, 15, 24
    for i, (icon, title, lines) in enumerate(cards):
        color = ROT[i]
        x = x0 + i * (W + GAP)
        ax.add_patch(FancyBboxPatch((x, cy - ch_h / 2), W, ch_h, boxstyle="round,pad=0,rounding_size=1.8", fc="white", ec=LINE, lw=1.3, zorder=3))
        ax.add_patch(FancyBboxPatch((x, cy - ch_h / 2), W, 1.6, boxstyle="round,pad=0,rounding_size=0.5", fc=color, ec="none", zorder=4))
        ax.add_patch(Circle((x + 7.5, cy + 1.5), 5.2, fc=TINT[color], ec=color, lw=1.4, zorder=5))
        icon(ax, x + 7.5, cy + 1.5, color)
        T(x + 14, cy + 4.2, title, 11, INK)
        for k, ln in enumerate(lines):
            ax.add_patch(Circle((x + 14.6, cy - 1.4 - k * 4.0), 0.5, fc=color, ec="none", zorder=8))
            T(x + 16.4, cy - 1.4 - k * 4.0, ln, 8.6, INK3, bold=False)
    fig.savefig(out, transparent=True)
    print("wrote", os.path.basename(out), os.path.getsize(out) // 1024, "KB")
    plt.close(fig)

# ── sprint specs ──────────────────────────────────────────────────────────────
sprints = {
 "sprint1_features.png": [
    (ic_lock,   "JWT Authentication", ["access + refresh tokens", "bcrypt-hashed credentials"]),
    (ic_folder, "Project Workspaces", ["full CRUD lifecycle", "one owner per project"]),
    (ic_chart,  "MLflow per Project", ["experiment auto-provisioned", "isolated tracking store"]),
    (ic_shield, "Strict Isolation",   ["ownership enforced in API", "404 on foreign resources"]),
 ],
 "sprint2_features.png": [
    (ic_upload,  "Upload Code & Data", ["single project bundle", "stored in MinIO (S3)"]),
    (ic_code,    "Notebook → Script", ["auto-converted for pods", "reproducible entrypoint"]),
    (ic_cluster, "Run on Cluster",     ["Kubeflow / Argo pod", "GPU-scheduled training"]),
    (ic_logs,    "Live Logs + Autolog", ["streamed run output", "MLflow autolog metrics"]),
 ],
 "sprint3_features.png": [
    (ic_tag,    "Model Registry",    ["versioned model store", "MLflow-backed"]),
    (ic_layers, "Stage Promotion",   ["Staging → Production", "one-click transitions"]),
    (ic_rocket, "KServe Deploy",     ["one-click InferenceService", "autoscaling endpoint"]),
    (ic_target, "Prediction Tester", ["try the live model", "sample-input playground"]),
 ],
 "sprint4_features.png": [
    (ic_chart,   "Metrics Dashboards",   ["per-model KPIs over time", "drift & volume trends"]),
    (ic_key,     "Public API Keys",      ["scoped key issuance", "external prediction access"]),
    (ic_pulse,   "Prediction Telemetry", ["every call logged", "latency + outcome capture"]),
    (ic_sliders, "Admin & Diagnostics",  ["user & role management", "platform health checks"]),
 ],
}

for fn, cards in sprints.items():
    render_strip(cards, os.path.join(ASSETS, fn))
