# Canva Prompt — First PFE Review (English presentation)

> **How to use:** Open Claude with the Canva connector enabled. Paste the
> entire **PROMPT** section below (everything between the two `````` fences)
> into the chat. Claude will call the Canva MCP and produce the deck.

> *All names, dates, and company info are already inlined below. The only
> things to do after Canva returns the deck are to (1) drop the official
> INSOMEA logo onto the title and company slides, and (2) confirm the date
> on the footer once the meeting is scheduled.*

---

## 1. The PROMPT (copy everything inside the fence)

````
You are a senior technical-presentation designer. Use the Canva connector to
create a professional slide deck for a graduation-project (PFE) first review.
This is an ALIGNMENT meeting with the academic supervisor, the company
supervisor, and the industry expert — not the final defense. Tone:
confident, factual, forward-looking. Avoid marketing fluff. No emojis except
a tasteful checkmark on completed items.

# Audience and constraints
- Audience: ESPRIT academic supervisor (Ben Mardes Achref), INSOMEA company
  supervisor (Amine Gonji), and PFE industry expert (M. Benarous Abderrahmen)
- Language: English
- Talk duration: 20 minutes presenting + Q&A
- Aspect ratio: 16:9 presentation
- Theme: dark, dense, technical (think Linear / Databricks / Vercel) —
  charcoal background, soft cyan accent (#42C2FF), sparing white space,
  monospace for code and IDs, Inter or similar sans-serif for body text
- Slide count: exactly 10 slides (1 cover + 8 content + 1 closing)

# Required structure (one canvas slide per item, in this exact order)

────────────────────────────────────────────────────────────────────────────
SLIDE 1 — Cover
────────────────────────────────────────────────────────────────────────────
- Title: "End-to-End MLOps Platform on Kubernetes"
- Subtitle: "PFE — First Project Review"
- Student: Firas Mahjoubi
- Academic supervisor (ESPRIT): Ben Mardes Achref
- Company supervisor (INSOMEA): Amine Gonji
- Industry expert: M. Benarous Abderrahmen
- Host company: INSOMEA — Microsoft Cloud Gold Partner · Tunis, Tunisia
- University: ESPRIT — Higher School of Engineering
- Date: April 2026 · First Review
- Leave clear empty space (top-left) for the official INSOMEA logo to be
  dropped in manually after Canva generates the deck.

────────────────────────────────────────────────────────────────────────────
SLIDE 2 — Table of Contents
────────────────────────────────────────────────────────────────────────────
Numbered list, large readable type:
1. Company Introduction
2. Problem Statement
3. Project Objectives
4. Functional Scope
5. Selected Technologies
6. Current State of Progress
7. Remaining Tasks
8. Thank You

────────────────────────────────────────────────────────────────────────────
SLIDE 3 — Company Introduction (INSOMEA)
────────────────────────────────────────────────────────────────────────────
Use these real, vetted facts. Do not invent numbers.

Header line: "INSOMEA — Microsoft Cloud Gold Partner"
Sub-line: "Founded 2016 · Tunis, Tunisia"

Top stat strip (4 tiles across):
- 50+ Employees
- 500+ Customers
- 8+ Years of expertise
- 6 Offices

Two-column body below:

LEFT — Specialization:
- 15+ Microsoft Gold Competencies
- 8 Microsoft Advanced Specializations
- Practice areas: Microsoft 365, Microsoft Azure, Cybersecurity, Adoption
  & Change Management, Training
- 150+ Microsoft certifications across the team
- 15+ Microsoft Certified Trainers
- 1 Microsoft MVP (1 of only 6 in North Africa)

RIGHT — Recognition & Footprint:
- 5x Microsoft Partner of the Year (Bahrain 2020, Tunisia 2021 & 2022,
  plus two more recent)
- Offices: Tunisia · Bahrain · France · Algeria · Morocco · Ivory Coast
- Customer base: enterprises across the MEA region

Footer line on this slide:
"Hosting an MLOps platform built around Kubernetes and a planned
Microsoft Azure deployment inside a Microsoft Gold Partner gives this
project direct access to deep Microsoft-cloud expertise and a real
customer base for downstream pilot deployments."

Leave space for the INSOMEA logo near the title.

────────────────────────────────────────────────────────────────────────────
SLIDE 4 — Problem Statement
────────────────────────────────────────────────────────────────────────────
Headline (large, top of slide):
"70%+ of ML models never leave the notebook." — Gartner

Subhead: "From notebook to production: the persistent gap."

2x2 grid of blockers, each with a one-line consequence:
- Environment drift
  Dev and prod diverge — dependencies, runtime, compute. Models that work
  on a laptop break in production.
- No experiment lineage
  Metrics, parameters, and artifacts live in scattered notebooks.
  Reproducing last month's best model is impossible.
- Manual, fragile deployments
  Each team writes its own Dockerfile and YAML. No monitoring once live.
  Models silently rot.
- Pipeline reinvention
  Every data scientist rebuilds the same data → train → register → deploy
  flow from scratch.

Closing line at the bottom:
"Objective: a self-service platform that closes that gap end-to-end."

────────────────────────────────────────────────────────────────────────────
SLIDE 5 — Project Objectives
────────────────────────────────────────────────────────────────────────────
Five numbered objectives in a vertical list. Each gets a short
explanation line.

1. Self-service end-to-end ML lifecycle
   One UI takes a data scientist from a Python file to a live REST endpoint
   — no Dockerfiles, no YAML, no separate tools.

2. Full reproducibility and lineage
   Every run is automatically tracked: parameters, metrics, artifacts.
   Any production model traces back to the exact run that produced it.

3. Kubernetes-native compute
   Training and serving both run on Kubernetes — same orchestrator for
   dev, on-prem, and cloud. Scales horizontally, schedules GPUs, recovers
   from failure.

4. One-click deployment with live monitoring
   Promote a model from the registry, click Deploy, get a REST endpoint
   in ~30 seconds. CPU and RAM metrics stream live in the UI.

5. Cloud-portable architecture
   Built on open-source standards (KServe, MLflow, MinIO/S3) so the same
   stack can run on a laptop today and on Microsoft Azure tomorrow.

────────────────────────────────────────────────────────────────────────────
SLIDE 6 — Functional Scope
────────────────────────────────────────────────────────────────────────────
Two columns of features, eight features each.

CORE PLATFORM (left):
- Authentication: signup, login, JWT with auto-refresh, persistent session
- Multi-user projects: CRUD, table and grid views, multi-tenant isolation
- Code upload: .py / .ipynb / .zip, auto-detected entry point
- Training pipelines: prebuilt sklearn templates + custom user code
- Experiment tracking: automatic via MLflow autolog injection
- Model registry: versioning + lifecycle (Staging / Production / Archived)
- One-click KServe deployment with auto-fix for webhook timeout
- Real-time inference test from the UI

MONITORING & UX (right):
- Live dashboard: running pipelines, active deployments, cluster health
- Per-deployment metrics: CPU / RAM via Kubernetes API + cgroup files
- Professional log terminal: filter, search, copy, download, auto-tail
- Global list views: Experiments, Pipelines, Models, Deployments
- Project detail: 6 tabs (Overview, Code, Experiments, Pipelines, Models,
  Deployments) with badge counts
- Theme switching: light and dark
- OpenAPI-documented REST API at /docs
- Reproducible deployment: Docker Compose for dev, Helm for Kubernetes

────────────────────────────────────────────────────────────────────────────
SLIDE 7 — Selected Technologies
────────────────────────────────────────────────────────────────────────────
Two halves on this slide.

TOP HALF — compact layered architecture diagram:
User
  ↓
Angular 19 SPA (frontend)
  ↓
FastAPI Backend (orchestrator — only layer that talks to all the rest)
  ↓
[ PostgreSQL · MinIO · MLflow · Kubeflow Pipelines ]
  ↓
Kubernetes Cluster — Argo Workflows (training) + KServe (serving)

Use cyan arrows for control flow, dimmer arrows for data and artifact flow.
One callout: "the frontend never speaks to MLflow / MinIO / Kubernetes
directly — the backend is the single integration point."

BOTTOM HALF — technology grid (4 columns):
- FRONTEND:  Angular 19 · TypeScript · Tailwind CSS 4 · RxJS
- BACKEND:   FastAPI · async SQLAlchemy · Pydantic v2 · JWT
- ML:        scikit-learn · XGBoost · LightGBM · pandas · MLflow 2.11
- PLATFORM:  Kubernetes · Kubeflow Pipelines (Argo) · KServe ·
             PostgreSQL · MinIO (S3) · Docker · Helm

────────────────────────────────────────────────────────────────────────────
SLIDE 8 — Current State of Progress
────────────────────────────────────────────────────────────────────────────
Header line: "What is working today — phase: development & testing"

Two-column checklist with a tasteful check mark before each item:

LEFT (delivered features):
✓ Authentication, signup, JWT refresh, persistent session
✓ Project CRUD with table and grid views
✓ Code upload (.py / .ipynb / .zip) with auto-detection
✓ Custom-code pipeline running on Kubernetes via Kubeflow
✓ Prebuilt sklearn pipelines (iris, wine, breast cancer, housing)
✓ MLflow autolog injection — captures metrics, params, artifacts
✓ Model registry with promote / archive / delete

RIGHT (delivered features cont'd):
✓ KServe one-click deployment with auto-fix for webhook timeout
✓ Real-time inference test in the UI
✓ Live dashboard with running pipelines and deployment metrics
✓ Per-deployment CPU / RAM via Kubernetes API + cgroup files
✓ Global list views: Experiments / Pipelines / Models / Deployments
✓ Project detail with 6 tabbed views and live badge counts
✓ Professional log terminal with filter, search, copy, download, auto-tail

Footer strip — three pills showing current activity:
[ BUILDING ] drift detection, Experiments comparison restyle
[ TESTING ]  end-to-end flows, custom-code edge cases, KServe recovery
[ STARTING ] Microsoft Azure deployment work

────────────────────────────────────────────────────────────────────────────
SLIDE 9 — Remaining Tasks
────────────────────────────────────────────────────────────────────────────
Four lanes side-by-side, with 2–3 bullets each:

CLOUD MIGRATION
- Migrate the platform to Microsoft Azure
- Leverage INSOMEA's Microsoft Gold Partner expertise
- Service pickset (AKS, Storage, Identity, Monitor) to be finalized with
  the supervisor and the expert during this review

OBSERVABILITY
- Production-grade metrics: RPS and p95 latency per InferenceService
- Basic drift alerts on input distributions
- Centralized logs and structured per-pod metrics

UI POLISH
- Experiments comparison view restyle
- Signup page redesign aligned with the new theme
- Accessibility pass (keyboard, contrast, ARIA)

DELIVERABLES
- User guide and install guide (Helm chart)
- Final PFE report
- Defense rehearsal

Bottom strip — meeting asks:
"Asks for this review:  validate scope · agree on Azure approach ·
pick the three highest-priority tasks · set the next checkpoint."

────────────────────────────────────────────────────────────────────────────
SLIDE 10 — Thank You
────────────────────────────────────────────────────────────────────────────
Centered layout, generous whitespace.

Large headline: "Thank you."
Sub-headline: "Questions?"

Below, in smaller type, a one-sentence pitch:
"A self-service platform that takes a data scientist from a Python file to
a production REST endpoint in five clicks."

Contact line at the bottom:
"Firas Mahjoubi · ESPRIT × INSOMEA · April 2026"

# Visual rules
- One accent color (cyan #42C2FF) — never two accents on a single slide.
- Body text minimum 18 pt; titles 32–40 pt.
- Maximum 6 bullets per slide. If a slide hits 7, split it.
- Code-style font (JetBrains Mono / Fira Code / Roboto Mono) for any
  identifiers, paths, or short code.
- Footer on every slide: project short name on the left, page number on
  the right, and centered text:
  "PFE — First Review · INSOMEA × ESPRIT · April 2026"
- Avoid AI-generated photographic imagery and clip-art people. For the
  cover slide (slide 1) and the company slide (slide 3), leave clear
  empty space for the official INSOMEA logo to be dropped in manually
  after Canva generates the deck.
- Where a diagram is needed (slide 7), generate a clean schematic with
  boxes, arrows, and labels — not a decorative illustration.

# Output
Generate the deck in Canva via the connector. After creation, return the
shareable link plus a one-paragraph summary of the deck structure.
````

---

## 2. After Canva produces the deck

Manual checks before the meeting:
1. **Drop the official INSOMEA logo** onto the cover slide and the company slide (Canva will not have it).
2. Walk through every slide, fix any factual drift the AI introduced.
3. Add real screenshots in slide 8 (Current State): dashboard, project Overview tab, log terminal.
4. Replace any stock-image fallback Canva inserted with a clean text card.
5. **Confirm the date** on the footer matches the actual confirmed review date once the supervisor schedules it.
6. Export to PDF as a backup the day before the meeting.

---

## 3. Optional — Speaker notes appendix

If you also want a 20-minute speaking script, append this paragraph to the prompt above before sending:

> "Also write speaker notes for each slide — 3 to 4 sentences of what to say aloud when on that slide. Notes should be conversational, not a re-read of the slide content. Total reading time across all notes should target 20 minutes at 130 words per minute."
