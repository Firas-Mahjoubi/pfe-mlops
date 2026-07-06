# -*- coding: utf-8 -*-
"""Physical / deployment architecture (OctoMiro 'architecture physique' style,
but for a cloud-native MLOps platform): runtime path (users -> Cloudflare Tunnel
-> ingress -> pods) + delivery path (git -> Actions -> ACR -> cluster), laid on
a Kubernetes cluster with namespace groupings. Transparent PNG, deck light theme."""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.image as mpimg
from matplotlib.patches import FancyBboxPatch, Rectangle, Circle, Wedge
from matplotlib.offsetbox import OffsetImage, AnnotationBbox

LOGO = r"D:\pfe\report\logo"
OUT = r"D:\pfe\presentation\assets\physical_arch.png"
INK, INK2, INK3 = "#1F2937", "#475569", "#64748B"
BLUE, TEAL, VIOLET, AMBER, GOOD = "#0B5394", "#0F766E", "#7C3AED", "#D97706", "#059669"
LINE = "#CBD5E1"
K = 5.62

fig = plt.figure(figsize=(14.0, 7.4), dpi=175)
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 140); ax.set_ylim(0, 74); ax.axis("off")

def rrect(x, y, w, h, fc, ec, lw=1.4, rs=1.6, dash=False, z=3):
    p = FancyBboxPatch((x, y), w, h, boxstyle=f"round,pad=0,rounding_size={rs}",
                       fc=fc, ec=ec, lw=lw, zorder=z)
    if dash: p.set_linestyle((0, (5, 3)))
    ax.add_patch(p); return p

def T(x, y, s, size, color, bold=True, ha="left", va="center", z=9, ls=1.05):
    ax.text(x, y, s, ha=ha, va=va, fontsize=size, color=color,
            fontweight="bold" if bold else "normal", family="DejaVu Sans",
            zorder=z, linespacing=ls)

def logo(name, cx, cy, fw=9, fh=6, z=7):
    img = mpimg.imread(os.path.join(LOGO, name)); ih, iw = img.shape[0], img.shape[1]
    zoom = K * min(fh / ih, fw / iw)
    ax.add_artist(AnnotationBbox(OffsetImage(img, zoom=zoom), (cx, cy), frameon=False, zorder=z))

def arrow(p0, p1, color, lw=1.8, dash=False, ms=13, z=6, rad=0.0):
    st = "-|>"
    ap = dict(arrowstyle=st, color=color, lw=lw, mutation_scale=ms,
              connectionstyle=f"arc3,rad={rad}")
    if dash: ap["linestyle"] = (0, (4, 3))
    ax.annotate("", xy=p1, xytext=p0, arrowprops=ap, zorder=z)

def fit_text(x, y, s, size, color, max_right, bold=False, z=8):
    """Left-aligned text that auto-shrinks until its right edge clears max_right."""
    rend = fig.canvas.get_renderer()
    inv = ax.transData.inverted()
    t = ax.text(x, y, s, ha="left", va="center", fontsize=size, color=color,
                fontweight="bold" if bold else "normal", family="DejaVu Sans", zorder=z)
    for _ in range(12):
        bb = t.get_window_extent(renderer=rend)
        (dx1, _) = inv.transform((bb.x1, bb.y1))
        if dx1 <= max_right or size <= 6.0:
            break
        size -= 0.4
        t.set_fontsize(size)
    return t

def pod(x, y, w, h, logo_name, name, sub, accent, fw=8.5, fh=5.6):
    rrect(x, y, w, h, "white", LINE, lw=1.2, rs=1.2, z=6)
    rrect(x, y, 1.5, h, accent, "none", lw=0, rs=0.5, z=7)
    logo(logo_name, x + 7, y + h / 2, fw=fw, fh=fh, z=8)
    right = x + w - 2.5
    fit_text(x + 12.5, y + h / 2 + 1.6, name, 9.3, INK, right, bold=True)
    fit_text(x + 12.5, y + h / 2 - 1.9, sub, 7.6, INK3, right, bold=False)

# ══ 1. DELIVERY PIPELINE (top strip) ═════════════════════════════════════════
T(3, 71.5, "CI / CD  ·  BUILD & DEPLOY", 9.5, AMBER)
dp_y, dp_h = 63.5, 6.2
def chip(x, w, lg, label, sub):
    rrect(x, dp_y, w, dp_h, "#FDF7EC", "#E4C48A", lw=1.2, rs=1.2, z=5)
    logo(lg, x + 5.5, dp_y + dp_h / 2, fw=7, fh=4.6, z=7)
    fit_text(x + 10, dp_y + dp_h / 2 + 1.4, label, 8.8, INK, x + w - 2, bold=True, z=7)
    fit_text(x + 10, dp_y + dp_h / 2 - 1.7, sub, 7.2, INK3, x + w - 2, bold=False, z=7)
chip(3, 27, "github_actions.png", "GitHub repo", "push / pull-request")
chip(35, 30, "github_actions.png", "GitHub Actions", "build · test · scan")
chip(70, 24, "acr.png", "ACR", "container images")
for a, b in [(30, 35), (65, 70)]:
    arrow((a, dp_y + dp_h / 2), (b, dp_y + dp_h / 2), AMBER, lw=1.8, ms=12)
# ACR deploys down into the cluster
arrow((82, dp_y), (82, 60.5), AMBER, lw=1.9, dash=True, ms=13)
T(83.5, 61.6, "deploy / image pull", 7.6, AMBER, bold=False)

# ══ 2. USERS (left column) ═══════════════════════════════════════════════════
T(3, 57, "USERS", 9.5, BLUE)
rrect(3, 30, 22, 24, "#F7FAFD", "#D7DEE8", lw=1.3, rs=1.6, z=3)
def icon_person(cx, cy):
    ax.add_patch(Circle((cx, cy + 1.7), 1.35, fc=BLUE, ec="none", zorder=8))
    ax.add_patch(Wedge((cx, cy - 0.9), 2.2, 0, 180, fc=BLUE, ec="none", zorder=8))

def icon_api(cx, cy):
    rrect(cx - 2.3, cy - 2.0, 4.6, 4.0, "#EAF4FB", BLUE, lw=1.3, rs=0.8, z=8)
    ax.text(cx, cy - 0.1, "{ }", ha="center", va="center", fontsize=8.5,
            color=BLUE, fontweight="bold", zorder=9)

def userbox(cy, title, sub, drawer):
    drawer(7.2, cy)
    fit_text(12, cy + 1.6, title, 9.2, INK, 23, bold=True)
    fit_text(12, cy - 1.9, sub, 7.4, INK3, 23, bold=False)
userbox(48, "Data Scientist", "browser · Angular UI", icon_person)
userbox(36, "API Client", "public prediction API", icon_api)

# Cloudflare tunnel pill on the boundary
rrect(27, 39, 8.5, 8.5, "#FDF3E3", AMBER, lw=1.4, rs=1.4, z=6)
logo("cloudflare.png", 31.2, 44.2, fw=6.5, fh=4.2, z=8)
T(31.2, 40.4, "Tunnel", 7.4, "#B45309", z=8)
arrow((25, 45), (27, 44.5), BLUE, lw=1.8, ms=12)   # DS -> tunnel
arrow((25, 37), (27.2, 42), BLUE, lw=1.6, ms=11, rad=-0.15)  # API -> tunnel
arrow((35.5, 43.5), (41, 43.5), BLUE, lw=1.9, ms=13)  # tunnel -> ingress

# ══ 3. KUBERNETES CLUSTER (main box) ═════════════════════════════════════════
CX, CY, CW, CH = 39, 5, 100, 55
rrect(CX, CY, CW, CH, "#F9FBFD", BLUE, lw=1.7, rs=2.2, dash=True, z=2)
logo("kubernetes.png", CX + 4.5, CY + CH - 4, fw=6, fh=5, z=8)
T(CX + 9, CY + CH - 4, "Kubernetes Cluster", 11, BLUE, z=8)
T(CX + 42, CY + CH - 4, "— AKS (cloud)  /  KinD (local)", 9.5, INK2, bold=False, z=8)

# ingress vertical pill just inside the left edge
rrect(CX + 2, 30, 7, 26, "#EAF4FB", BLUE, lw=1.3, rs=1.2, z=5)
for i, ch in enumerate("INGRESS"):
    ax.text(CX + 5.5, 52 - i * 3.1, ch, ha="center", va="center", fontsize=8,
            color=BLUE, fontweight="bold", zorder=8)
T(CX + 5.5, 32.5, "nginx", 7.2, INK3, ha="center", bold=False, z=8)

# ── namespace columns ────────────────────────────────────────────────────────
def ns(x, w, title, color, cards, top=48):
    rrect(x, 9, w, 43, "#FFFFFF", color, lw=1.1, rs=1.6, z=3)
    rrect(x, 9, w, 43, color + "00", color, lw=0, rs=1.6, z=3)
    T(x + w / 2, 49.4, title, 8.6, color, ha="center", z=8)
    ph = 8.6
    for i, (lg, nm, sub, ac, fw, fh) in enumerate(cards):
        cy = top - 5 - i * (ph + 2.4)
        pod(x + 2.5, cy - ph, w - 5, ph, lg, nm, sub, ac, fw=fw, fh=fh)
    return x + w

# tint the namespace fills subtly
def nsfill(x, w, tint):
    rrect(x, 9, w, 43, tint, "none", lw=0, rs=1.6, z=2)

nsfill(52, 26, "#F3EFFC"); ns(52, 26, "APPLICATION  ·  ns", VIOLET, [
    ("angular.png", "Frontend", "Angular + nginx", VIOLET, 7.5, 5.2),
    ("fastapi.png", "Backend", "FastAPI (async)", VIOLET, 7.5, 5.2),
])
nsfill(80, 28, "#EAF4FB"); ns(80, 28, "MLOPS  ·  ns", BLUE, [
    ("mlflow.png", "MLflow", "tracking · registry", BLUE, 8.5, 4.6),
    ("kubeflow.png", "Kubeflow · Argo", "training pods (GPU)", BLUE, 7.5, 5.2),
    ("kserve.png", "KServe", "InferenceServices", BLUE, 7.5, 5.4),
])
nsfill(110, 27, "#E8F7F0"); ns(110, 27, "DATA & STORAGE  ·  ns", GOOD, [
    ("postgresql.png", "PostgreSQL", "platform + MLflow DB", GOOD, 7.5, 5.4),
    ("minio.png", "MinIO", "datasets · artifacts", GOOD, 8.5, 4.4),
])

# internal service arrows (thin gray)
arrow((CX + 9, 43), (52, 43), INK3, lw=1.5, ms=11)          # ingress -> app
arrow((78, 40), (80, 40), INK3, lw=1.4, ms=10)              # app -> mlops
arrow((108, 34), (110, 34), INK3, lw=1.4, ms=10)            # mlops -> data

# ══ 4. LEGEND (bottom) ═══════════════════════════════════════════════════════
lg_y = 1.8
items = [("public HTTPS (Cloudflare Tunnel)", BLUE, False),
         ("internal service traffic", INK3, False),
         ("CI/CD image build & deploy", AMBER, True)]
lx = 4
for label, col, dash in items:
    ax.plot([lx, lx + 5], [lg_y, lg_y], color=col, lw=2.0,
            linestyle=(0, (4, 3)) if dash else "-", zorder=8)
    T(lx + 6.2, lg_y, label, 7.8, INK2, bold=False, z=8)
    lx += 8 + len(label) * 1.28

fig.savefig(OUT, transparent=True)
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
