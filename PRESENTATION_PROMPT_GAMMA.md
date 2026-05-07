# Gamma Prompt — First PFE Review (English, 10 cards)

> **How to use:**
> 1. Open [gamma.app](https://gamma.app) → **Create new** → **Paste in text**
> 2. Copy **everything inside the fence below** (between the two `````` markers)
> 3. Click **Continue**
> 4. Set: **Number of cards = 10** · **Language = English** · **Tone = Professional**
> 5. Pick a dark theme (Eclipse, Nightfall, Linear, Aurora, or Oasis)
> 6. Click **Generate**
>
> Optional — paste this into the **Additional instructions** field if Gamma asks for one:
> *"Audience: ESPRIT academic supervisor + INSOMEA company supervisor + PFE industry expert. 20-minute first review, not a final defense. Confident, factual tone — no marketing fluff. Use one cyan accent (#42C2FF). For diagrams, use clean schematic shapes with arrows, not decorative imagery."*

---

## The PROMPT (copy everything inside the fence)

````
End-to-End MLOps Platform on Kubernetes

PFE — First Project Review · ESPRIT × INSOMEA · April 2026

Student: Firas Mahjoubi
Academic supervisor (ESPRIT): Ben Mardes Achref
Company supervisor (INSOMEA): Amine Gonji
Industry expert: M. Benarous Abderrahmen
Host company: INSOMEA — Microsoft Cloud Gold Partner · Tunis, Tunisia
University: ESPRIT — Higher School of Engineering
---

Table of Contents

1. Company Introduction
2. Problem Statement
3. Project Objectives
4. Functional Scope
5. Selected Technologies
6. Current State of Progress
7. Remaining Tasks
8. Thank You
---

Company Introduction: INSOMEA

Microsoft Cloud Gold Partner · Founded 2016 · Tunis, Tunisia

Key figures: 50+ Employees, 500+ Customers, 8+ Years of expertise, 6 Offices.

Specialization: 15+ Microsoft Gold Competencies and 8 Advanced Specializations across Microsoft 365, Microsoft Azure, Cybersecurity, Adoption & Change Management, and Training.

Talent: 150+ Microsoft certifications across the team, 15+ Microsoft Certified Trainers, and 1 Microsoft MVP — only 6 exist in North Africa.

Recognition: 5x Microsoft Partner of the Year (Bahrain 2020, Tunisia 2021 & 2022, plus two more recent).

Footprint: offices in Tunisia, Bahrain, France, Algeria, Morocco, and Ivory Coast. Customer base: enterprises across the MEA region.

Hosting an MLOps platform on Kubernetes with a planned Microsoft Azure deployment inside a Microsoft Gold Partner gives this project direct access to deep Microsoft-cloud expertise and a real customer base for downstream pilot deployments.
---

Problem Statement

70%+ of ML models never leave the notebook (Gartner). From notebook to production: the persistent gap.

Environment drift — dev and prod diverge in dependencies, runtime, and compute. Models that work on a laptop break in production.

No experiment lineage — metrics, parameters, and artifacts live in scattered notebooks. Reproducing last month's best model is impossible.

Manual, fragile deployments — each team writes its own Dockerfile and YAML. No monitoring once live. Models silently rot.

Pipeline reinvention — every data scientist rebuilds the same data → train → register → deploy flow from scratch.

Objective: a self-service platform that closes that gap end-to-end.
---

Project Objectives

Self-service end-to-end ML lifecycle — one UI takes a data scientist from a Python file to a live REST endpoint, with no Dockerfiles, no YAML, no separate tools.

Full reproducibility and lineage — every run is automatically tracked: parameters, metrics, artifacts. Any production model traces back to the exact run that produced it.

Kubernetes-native compute — training and serving both run on Kubernetes. Same orchestrator for dev, on-prem, and cloud. Scales horizontally and schedules GPUs.

One-click deployment with live monitoring — promote a model from the registry, click Deploy, get a REST endpoint in roughly 30 seconds. CPU and RAM stream live in the UI.

Cloud-portable architecture — built on open-source standards (KServe, MLflow, MinIO/S3) so the same stack runs on a laptop today and on Microsoft Azure tomorrow.
---

Functional Scope

Core platform features:

Authentication: signup, login, JWT with auto-refresh, persistent session.
Multi-user projects: CRUD, table and grid views, multi-tenant isolation.
Code upload: .py, .ipynb, .zip with auto-detected entry point.
Training pipelines: prebuilt sklearn templates plus custom user code.
Experiment tracking: automatic via MLflow autolog injection.
Model registry: versioning and lifecycle (Staging, Production, Archived).
One-click KServe deployment with auto-fix for webhook timeout.
Real-time inference test from the UI.

Monitoring and UX features:

Live dashboard: running pipelines, active deployments, cluster health.
Per-deployment metrics: CPU and RAM via Kubernetes API and cgroup files.
Professional log terminal: filter, search, copy, download, auto-tail.
Global list views: Experiments, Pipelines, Models, Deployments.
Project detail with 6 tabbed views and live badge counts.
Theme switching: light and dark.
OpenAPI-documented REST API at /docs.
Reproducible deployment: Docker Compose for dev, Helm for Kubernetes.
---

Selected Technologies

Architecture, top to bottom: User → Angular SPA → FastAPI Backend → (PostgreSQL, MinIO, MLflow, Kubeflow Pipelines) → Kubernetes Cluster running Argo Workflows for training and KServe for serving.

The frontend never talks to MLflow, MinIO, or Kubernetes directly. The FastAPI backend is the single integration point.

Frontend stack: Angular 19, TypeScript, Tailwind CSS 4, RxJS.

Backend stack: FastAPI, async SQLAlchemy, Pydantic v2, JWT authentication.

Machine Learning stack: scikit-learn, XGBoost, LightGBM, pandas, MLflow 2.11.

Platform stack: Kubernetes, Kubeflow Pipelines (Argo Workflows), KServe, PostgreSQL, MinIO (S3-compatible), Docker, Helm.
---

Current State of Progress

Phase: development and testing.

Delivered features:

Authentication, signup, JWT refresh, persistent session.
Project CRUD with table and grid views.
Code upload (.py, .ipynb, .zip) with auto-detection.
Custom-code pipeline running on Kubernetes via Kubeflow.
Prebuilt sklearn pipelines: iris, wine, breast cancer, housing.
MLflow autolog injection — captures metrics, parameters, artifacts.
Model registry with promote, archive, delete.
KServe one-click deployment with webhook auto-fix.
Real-time inference test in the UI.
Live dashboard with running pipelines and deployment metrics.
Per-deployment CPU and RAM via Kubernetes API and cgroup files.
Global list views: Experiments, Pipelines, Models, Deployments.
Project detail with 6 tabbed views and live badge counts.
Professional log terminal: filter, search, copy, download, auto-tail.

Active workstreams: building drift detection and Experiments comparison restyle. Testing end-to-end flows, custom-code edge cases, KServe recovery. Starting Microsoft Azure deployment work.
---

Remaining Tasks

Cloud Migration: migrate the platform to Microsoft Azure, leveraging INSOMEA's Microsoft Gold Partner expertise. Specific Azure service pickset to be finalized with the supervisor and the expert during this review.

Observability: production-grade metrics (RPS and p95 latency per InferenceService), basic drift alerts on input distributions, centralized logs and structured per-pod metrics.

UI Polish: Experiments comparison view restyle, Signup page redesign aligned with the new theme, accessibility pass for keyboard navigation, contrast, and ARIA.

Deliverables: user guide and install guide (Helm chart), final PFE report, defense rehearsal.

Asks for this review: validate scope, agree on the Azure approach, pick the three highest-priority remaining tasks, set the next checkpoint date.
---

Thank You

Questions?

A self-service platform that takes a data scientist from a Python file to a production REST endpoint in five clicks.

Firas Mahjoubi · ESPRIT × INSOMEA · April 2026
---
````

---

## After Gamma generates the deck

1. **Drop the official INSOMEA logo** onto the cover and the company card (Gamma will not have it).
2. Walk through every card and fix any factual drift the AI introduced.
3. Add real screenshots in card 7 (Current State): dashboard, project Overview tab, log terminal.
4. If Gamma's auto-architecture diagram on card 6 is weak, click the card and use Gamma's **Diagram** block to draw it manually.
5. Confirm the date on the cover matches the actual confirmed review date once your supervisor schedules it.
6. Export to PDF as a backup the day before the meeting.

---

## Format notes

- Each card = title line, blank line, body content, then `---` to close the card.
- No `#` markdown headings — Gamma reads the first line of each section as the card title.
- No `**bold**` or `-` bullet markers — plain text lines and paragraphs only.
- The 10 `---` separators give Gamma exactly 10 cards.
