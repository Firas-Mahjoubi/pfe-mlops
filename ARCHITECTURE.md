# MLOps Platform — Architecture & Tool Guide

A deep-dive companion to [PRESENTATION.md](PRESENTATION.md). The presentation is the *what*; this document is the *why* and the *how*.

---

## 1. What the platform is

An **end-to-end MLOps platform** that takes a data scientist from "I have a Python script on my laptop" to "I have a REST endpoint serving predictions on Kubernetes" — without leaving the UI and without writing any Dockerfiles, Helm charts, or YAML.

Concretely, one project groups together:

- **Code** — uploaded `.py` / `.ipynb` / `.zip` files
- **Experiments** — every training run's metrics, parameters, and artifacts
- **Pipelines** — the actual Kubernetes-orchestrated training jobs
- **Models** — versioned registered artifacts with a lifecycle (Staging → Production → Archived)
- **Deployments** — live KServe InferenceServices with real-time CPU/RAM metrics

The user never sees Kubernetes, MinIO, or MLflow directly — they see a single Angular app that hides all of it behind REST calls.

---

## 2. The problem it solves

**The "notebook → production" gap.** Gartner estimates 70%+ of ML models never leave the notebook. The reasons are always the same:

| Blocker | Why it hurts | How we fix it |
|---|---|---|
| Dev vs. prod drift | Different Python versions, system libs, CUDA | Training runs in a clean container on K8s — same image for dev and prod |
| No lineage | Can't reproduce last month's best model | MLflow autolog captures params, metrics, artifact — tied to a run ID |
| Manual deploys | Each team writes its own Dockerfile + YAML | One-click KServe deployment from the registry |
| No monitoring | Models rot silently | Live CPU/RAM per pod from cgroup + Prometheus hooks |
| Reinvention | Every DS builds their own pipeline | Prebuilt training pipeline that works for any sklearn/XGBoost dataset |

---

## 3. High-level architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER (browser)                              │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ HTTPS
┌────────────────────────────────▼────────────────────────────────────┐
│  Angular 19 SPA              (standalone components + signals)      │
│  - Dashboard   - Projects   - Experiments  - Pipelines              │
│  - Models      - Deployments - Data & Platform                      │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ REST /api/v1/*  (JWT)
┌────────────────────────────────▼────────────────────────────────────┐
│  FastAPI Backend             (async SQLAlchemy + Pydantic)          │
│  ┌──────────────┬───────────┬──────────────┬──────────────┐         │
│  │ auth         │ projects  │ experiments  │ pipelines    │         │
│  │ uploads      │ models    │ deployments  │ admin        │         │
│  └──────┬───────┴─────┬─────┴──────┬───────┴──────┬───────┘         │
│         │             │            │              │                 │
└─────────┼─────────────┼────────────┼──────────────┼─────────────────┘
          │             │            │              │
          │ SQL         │ S3         │ HTTP         │ Kubernetes API
          ▼             ▼            ▼              ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐
   │PostgreSQL│  │  MinIO   │  │  MLflow  │  │  Kubeflow    │
   │          │  │  (S3)    │  │  Server  │  │  Pipelines   │
   │ users    │  │          │  │          │  │  (Argo)      │
   │ projects │  │ code     │  │ runs     │  └──────┬───────┘
   │ runs     │  │ datasets │  │ metrics  │         │
   │ models   │  │ artifacts│  │ registry │         │ builds workflows
   │ deploys  │  └─────┬────┘  └────┬─────┘         ▼
   └──────────┘        │            │        ┌──────────────┐
                       └────────────┤        │  K8s Cluster │
                       artifacts    │        │              │
                                    │        │  + KServe    │
                                    ▼        │  InferenceSvc│
                               ┌────────────┴──────────────┐
                               │   Training pods +          │
                               │   Serving pods              │
                               └─────────────────────────────┘
```

**Three big responsibilities, cleanly separated:**

1. **Angular** — UI state + user interactions
2. **FastAPI** — business logic, auth, orchestration calls, metadata
3. **Kubernetes ecosystem** — actually runs the compute (training, serving)

FastAPI is the *only* component that talks to everything else. The frontend never calls MLflow, MinIO, or K8s directly.

---

## 4. Tool-by-tool breakdown

### 4.1 Frontend

#### Angular 19
**What it is:** A TypeScript SPA framework with standalone components, signals, and a new control-flow syntax (`@if`, `@for`, `@switch`).

**What we use it for:**
- 10 pages (Dashboard, Projects list + detail, Experiments, Pipelines, Models, Deployments, Feature Store, Datasets, Artifacts, Monitoring)
- Routing via `app.routes.ts` with `loadComponent()` (lazy-loaded chunks)
- Forms (login, signup, project create, predict input)
- HTTP client with an auth interceptor that attaches JWT + auto-refreshes on 401

**Why Angular over React/Vue:**
- Opinionated structure — a PFE project benefits from one obvious way to do things
- Standalone components + signals remove the need for NgModules and RxJS-heavy state
- First-class TypeScript — every HTTP response is typed end-to-end

#### Tailwind CSS 4
**What it is:** Utility-first CSS framework.

**What we use it for:** Every style in the app. Custom theme tokens (`bg-card`, `border-line`, `text-ink`, `cyan3`) defined in a `theme.css` file match a Databricks/Linear-inspired design.

**Why Tailwind:** Design consistency without a component library. Dark mode via `html.dark` class. Co-locating styles with templates makes components self-contained.

#### RxJS
**What it is:** Reactive extensions library — observables, operators, subscriptions.

**What we use it for:**
- `HttpClient` returns observables
- Polling: `interval(5000)` for dashboard metrics, deployment metrics, pipeline status
- `BehaviorSubject` for auth state (`AuthService.currentUser$`)

---

### 4.2 Backend

#### FastAPI
**What it is:** Async Python web framework built on Starlette + Pydantic.

**What we use it for:** The entire backend API under `/api/v1/*`. Each router file in `backend/app/api/v1/` maps to one domain (auth, projects, uploads, experiments, pipelines, models, deployments, admin).

**Why FastAPI:**
- **Async by default** — training triggers, MLflow calls, and K8s exec calls all benefit from non-blocking I/O
- **Auto-generated OpenAPI** — `/docs` gives us a free interactive API doc for the presentation
- **Pydantic schemas** — request/response validation without boilerplate

#### SQLAlchemy (async) + asyncpg
**What it is:** ORM + async Postgres driver.

**What we use it for:** All metadata tables:
- `users` — login + JWT
- `projects` — one row per project, owned by a user
- `pipeline_runs` — one row per KFP run, linked back to KFP run ID
- `ml_models` — registered model versions (mirrored from MLflow for fast listing)
- `deployments` — one row per KServe InferenceService

**Why async:** A FastAPI endpoint that queries the DB *and* calls MLflow *and* calls the K8s API can run all three concurrently. Sync SQLAlchemy would block the event loop.

#### Pydantic v2
**What it is:** Data-validation library. Every `BaseModel` is a typed, validated contract.

**Where:** Every request body (`TriggerRequest`, `PromoteRequest`) and response schema.

#### JWT (jose + bcrypt)
**What it is:** Stateless token-based auth. `jose` signs tokens; `bcrypt` hashes passwords.

**How it flows:**
1. `POST /auth/login` → server verifies password → returns access + refresh tokens
2. Frontend stores them in `localStorage`
3. `AuthInterceptor` attaches `Authorization: Bearer <token>` to every request
4. On 401, the interceptor calls `/auth/refresh`, gets a new pair, and retries the original request

**Why JWT:** Stateless — no server-side session store. Refresh tokens give long sessions without exposing the access token for days.

---

### 4.3 Data & storage

#### PostgreSQL 16
**What it is:** Relational database.

**What lives here:** All the *metadata* — users, projects, the pointers to MLflow/MinIO/K8s resources. **No model artifacts, no datasets.** Those go to MinIO.

**Why Postgres and not Mongo/SQLite:**
- Foreign keys matter (a run belongs to a project belongs to a user — cascade deletes)
- MLflow itself uses Postgres as its backend → one fewer DB to operate
- Mature async driver (`asyncpg`)

#### MinIO
**What it is:** S3-compatible object storage. Runs as a single container in dev, as a StatefulSet in k8s.

**Buckets:**
- `mlflow-artifacts` — MLflow writes models, plots, notebooks here
- `user-code` — uploaded `.py` / `.zip` files per project
- `models` — promoted model binaries (populated by KFP pipelines)

**Why MinIO:** S3-compatible means we can swap to real AWS S3 in prod with zero code change — the `boto3` client just needs different credentials. Self-hosted S3 is the industry standard for on-prem MLOps.

#### MLflow 2.11
**What it is:** Experiment tracking + model registry. Three things in one:
1. **Tracking server** — logs parameters, metrics, tags per run
2. **Model registry** — versioned, staged model entries (None → Staging → Production → Archived)
3. **Artifact store** — proxies to MinIO behind S3 credentials

**How we integrate:**
- Training scripts call `mlflow.autolog()` → no code changes needed to track sklearn/XGBoost
- Backend calls MLflow's REST API (`/api/2.0/mlflow/*`) to list runs and transition stages
- KServe pulls model artifacts directly from MinIO via MLflow's tracking URI

**Why MLflow:** It's the default in industry for sklearn-era workflows. Open source, battle-tested, and has a mature registry API.

---

### 4.4 Compute & orchestration

#### Kubernetes (K3s / kind in dev)
**What it is:** Container orchestrator — the substrate everything else runs on.

**What we run on it:**
- Kubeflow Pipelines (training jobs)
- KServe (inference services)
- MLflow server + Postgres + MinIO
- The backend and frontend themselves (in k8s deployment mode)

**Why K8s:** Every tool we picked assumes K8s. It gives us isolation, GPU scheduling, auto-restart, and horizontal scaling for free.

#### Kubeflow Pipelines (KFP) + Argo Workflows
**What KFP is:** A Python DSL that compiles Python functions into Argo Workflow YAML. Argo then runs them as a DAG of pods on K8s.

**Our pipeline** (`pipelines/training_pipeline.py`) has 4 components in `pipelines/components/`:
1. `data_loader.py` — fetches the sklearn dataset, writes it as a KFP artifact
2. `preprocessor.py` — train/test split, scaling
3. `trainer.py` — fits a model, saves with joblib
4. `evaluator.py` — scores on test set, registers to MLflow if accuracy > threshold

Each component is a `@dsl.component` — KFP builds a lightweight image per component (`python:3.11-slim` + pip installs declared inline).

**Why KFP + Argo over Airflow/Prefect:**
- **Cloud-native** — everything is a pod. No special worker to manage.
- **Artifact-first** — outputs between components are typed (`Input[Dataset]`, `Output[Model]`) and automatically stored/fetched via MinIO
- **Kubeflow ecosystem** — integrates with Katib (HPO), KServe (deploy), Notebooks (dev)

#### KServe
**What it is:** A Kubernetes-native model-serving layer. Built on Knative for scale-to-zero.

**What we use:** The `InferenceService` CRD. One CRD = one deployment = one REST endpoint.

```yaml
apiVersion: serving.kserve.io/v1beta1
kind: InferenceService
spec:
  predictor:
    sklearn:
      storageUri: "s3://mlflow-artifacts/.../model"
```

The `sklearn` runtime is a prebuilt container that knows how to load a sklearn `Pipeline` from MLflow and expose `POST /v1/models/<name>:predict`.

**Why KServe over plain FastAPI wrapping:**
- Zero custom serving code — the runtime handles HTTP, loading, batching, auto-scale
- Scale-to-zero on Knative — idle deployments cost $0
- Standard predict protocol — same API for sklearn, XGBoost, PyTorch, TensorFlow

---

### 4.5 Containerization & distribution

#### Docker + Docker Compose
**Dev mode:** A single `docker-compose.yml` (`infrastructure/docker-compose/`) brings up Postgres, MinIO, MLflow, backend, and frontend with one command. Code volumes are mounted with `--reload`, so edits to Python files are live.

**Why compose for dev:** K8s has too much overhead for local iteration. Compose is good enough to validate business logic; K8s is required only for the pipeline and serving layers.

#### Helm / kustomize manifests (`infrastructure/k8s/`)
One folder per component: `backend/`, `frontend/`, `postgres/`, `minio/`, `mlflow/`, `kserve/`, `kubeflow/`, `kaniko/`, `registry/`. Each holds a `Deployment`, `Service`, and `Namespace` manifest. `kind-config.yaml` bootstraps a local k8s cluster for end-to-end testing.

---

### 4.6 ML libraries

| Library | Used for |
|---|---|
| **scikit-learn 1.5** | The actual models — RandomForest, GradientBoosting, LogisticRegression, and `Pipeline` (which is critical — it bundles the scaler with the classifier so train-time preprocessing matches inference-time) |
| **XGBoost** | Gradient boosting when perf matters (breast-cancer example) |
| **pandas** | Dataframe manipulation inside training components |
| **joblib** | Serialization between KFP pipeline steps |
| **numpy** | Numeric primitives everywhere |

---

## 5. End-to-end flow: "I upload code, I get an endpoint"

Step-by-step, following what the UI triggers and what each tool does:

1. **User drops `wine_classifier.zip` in the Code tab**
   - Frontend: `UploadService.upload()` → `POST /projects/{id}/upload`
   - Backend: `boto3` uploads to MinIO bucket `user-code/{project_id}/wine_classifier.zip`
   - DB: a row in `project_files` records the MinIO path

2. **User clicks "Trigger Custom Pipeline"**
   - Frontend: `PipelineService.triggerCustom()` → `POST /pipelines/trigger-custom`
   - Backend (`pipeline_service.py`):
     - Creates a `PipelineRun` row (status = PENDING)
     - Builds a KFP pipeline that pulls the zip from MinIO, pip-installs requirements, runs the user's entry script in a pod
     - Submits it to the KFP API → gets a `kfp_run_id` → saves it on the row → status = RUNNING

3. **Argo creates pods on K8s**
   - Pod 1 downloads the zip, unpacks, runs `mlflow.autolog()` + user script
   - MLflow records every metric and the final model pipeline artifact to MinIO
   - Pod finishes → KFP marks the workflow SUCCEEDED

4. **Frontend polls status**
   - `interval(5000)` hits `GET /pipelines/running` — backend queries KFP + DB — pod metrics come from `kubectl top` via the Python `kubernetes` client
   - UI progress bar + logs update live

5. **Model appears in the Models tab**
   - Frontend: `ModelService.listProjectModels()` → backend reads MLflow registry + syncs a local `ml_models` row
   - User clicks "Promote to Production" → `POST /models/{name}/versions/{v}/promote` → MLflow `transition_model_version_stage` + DB update

6. **User clicks "Deploy"**
   - Frontend: `DeploymentService.create()` → `POST /deployments/`
   - Backend (`deployment_service.py`):
     - Creates a `deployments` row (status = CREATING)
     - Applies a KServe `InferenceService` CRD to the `mlops` namespace with the model's MinIO URI
     - Polls `kubectl get inferenceservice` until status = READY → DB update

7. **User tests the endpoint**
   - Frontend: `DeploymentService.predict()` → `POST /deployments/{id}/predict`
   - Backend proxies to the KServe endpoint URL
   - KServe loads the sklearn `Pipeline` from MinIO, scales the input, runs prediction, returns JSON

8. **User watches CPU/RAM live**
   - `interval(5000)` → `GET /deployments/{id}/metrics`
   - Backend uses the Python `kubernetes` client to `exec` into the serving pod and `cat` cgroup v1 files (`memory.usage_in_bytes`, `cpuacct.usage`)
   - Returns `cpu_pct`, `mem_pct` → UI renders bars

---

## 6. Why these choices over the alternatives

| Concern | Our pick | Why not X |
|---|---|---|
| Serving | KServe | **Seldon Core** — heavier, more YAML. **BentoML** — requires custom wrapper code. **FastAPI handwritten** — reinvents serving runtime. |
| Tracking | MLflow | **Weights & Biases** — SaaS, phones home. **Neptune** — commercial. **TensorBoard** — logs only, no registry. |
| Orchestration | Kubeflow Pipelines | **Airflow** — not K8s-native, scheduler process is a SPOF. **Prefect** — great DX but cloud-first. **Argo CD** — is deployment not pipelines. |
| Storage | MinIO | **AWS S3** — vendor lock for dev. **Ceph** — operational nightmare for a PFE. |
| DB | Postgres | **MySQL** — weaker JSON + concurrency. **MongoDB** — joins and FKs matter here. |
| UI | Angular | **React** — ecosystem tax (routing, state, forms = 3 picks). **Vue** — smaller community in enterprise. |

---

## 7. Directory layout

```
d:/pfe/
├── backend/                       FastAPI app
│   └── app/
│       ├── api/v1/                Route handlers by domain
│       ├── models/                SQLAlchemy ORM classes
│       ├── schemas/               Pydantic request/response models
│       ├── services/              mlflow_service, pipeline_service, deployment_service
│       └── main.py                FastAPI app factory
│
├── frontend/                      Angular 19 SPA
│   └── src/app/
│       ├── core/                  Auth, services, HTTP interceptor, models
│       ├── pages/                 Route components (dashboard, projects, etc.)
│       └── shared/                Reusable UI (icons, buttons, sidebar, dialogs)
│
├── pipelines/                     Kubeflow Pipeline definitions
│   ├── components/                One file per DAG node
│   └── training_pipeline.py       Main DAG
│
├── infrastructure/
│   ├── docker-compose/            Dev stack (Postgres + MinIO + MLflow + backend)
│   ├── k8s/                       Production Kubernetes manifests
│   │   ├── kserve/                InferenceService templates
│   │   ├── kubeflow/              Pipeline runtime
│   │   └── ...
│   └── scripts/                   Bootstrap helpers
│
└── examples/                      Demo scripts users can upload
    ├── iris_classifier.py
    ├── wine_classifier.py         sklearn Pipeline (scaler + classifier)
    ├── breast_cancer_xgboost.py   XGBoost in a Pipeline
    └── housing_regression.py
```

---

## 8. Two runtime modes

**Local dev** (Docker Compose):
- Backend, Postgres, MinIO, MLflow all in one `docker-compose up`
- For pipelines: backend talks to a local K3s / kind cluster via mounted kubeconfig
- Hot-reload on the backend (`uvicorn --reload`)

**Production** (Kubernetes):
- Everything lives as Deployments in the `mlops` namespace
- Ingress for frontend + backend
- Real S3 or self-hosted MinIO StatefulSet
- KServe + Kubeflow installed via Helm

The same `docker-compose.yml` and `infrastructure/k8s/` directory demonstrate both paths — one for iteration speed, one for realism.

---

## 9. Key trade-offs worth knowing

- **No GPU scheduler in dev** — the K3s cluster on a laptop has no GPU. Training examples are CPU-only sklearn/XGBoost. A prod cluster with `nvidia.com/gpu` resources would support PyTorch/TensorFlow.
- **KServe webhook timeout** — in dev clusters, the KServe admission webhook can time out on first create. We added an auto-fix endpoint (`POST /deployments/kserve-fix-webhook`) that restarts the webhook pod.
- **MLflow model versions are a flat namespace** — two projects can't both have a `wine-classifier` registered. We prefix with the project slug in practice.
- **No multi-tenancy at the K8s level** — every user's pipelines run in the same namespace. Row-level isolation in Postgres is enforced, but a motivated user could see others' pods. A production version would use namespace-per-tenant + RBAC.

---

## 10. In one sentence

> A FastAPI backend orchestrates Kubeflow Pipelines for training and KServe for serving, tracks everything in MLflow, stores artifacts in MinIO, and exposes it all through an Angular UI — so a data scientist can go from a Python file to a production endpoint in five clicks.
