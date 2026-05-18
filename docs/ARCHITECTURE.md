# MLOps Platform — Architecture & Technology Documentation

A full end-to-end MLOps platform built as a PFE (final-year project). This document explains every technology choice, every component, how the whole thing fits together, and how it's deployed.

---

## Part 1 — What this project is

It lets a single user:

1. Sign up / sign in (JWT auth).
2. Create a **project** as an organising unit (gets its own MLflow experiment).
3. Upload code (`.py` / `.ipynb` / `.zip`) and a dataset (`.csv`) via the browser.
4. Trigger a **training pipeline** that runs on a Kubernetes cluster (orchestrated by Kubeflow Pipelines / Argo Workflows).
5. Watch the run autolog **metrics, parameters and artifacts** into MLflow.
6. Browse and **register / promote** model versions (Staging / Production / Archived).
7. **Deploy** a promoted model as a live HTTP prediction service (managed by KServe).
8. Send sample inputs and get **predictions** back.
9. See live **cluster + per-pod metrics** on a dashboard.

The whole thing runs on a real Kubernetes cluster (AKS in production, KinD locally), with CI/CD that ships every push to `main` to the live URL `https://mlops.firasmahjoubi.app`.

---

## Part 2 — The big picture

```
                ┌───────────────────────────────────────────────────────┐
                │  USER'S BROWSER                                       │
                │  https://mlops.firasmahjoubi.app                      │
                └──────────────────────────┬────────────────────────────┘
                                           │ HTTPS
                                           ▼
                ┌───────────────────────────────────────────────────────┐
                │  CLOUDFLARE EDGE (TLS termination, free real cert)    │
                └──────────────────────────┬────────────────────────────┘
                                           │ outbound QUIC tunnel
                                           ▼                                  ╔══════════════════════════╗
┌──────────────────────────────────────────────────────────────────────────┐  ║  Outside our cluster     ║
│  AKS  ·  namespace: mlops                                                │  ║                          ║
│                                                                          │  ║  - GitHub Actions runner ║
│  ┌──────────────┐  ┌─────────────┐  ┌───────────┐  ┌──────────────────┐  │  ║    (CI/CD)               ║
│  │ cloudflared  │  │ frontend    │  │ backend   │  │ KServe predictor │  │  ║                          ║
│  │ (2 replicas) │→→│ Angular SPA │→→│ FastAPI   │  │ pods (per model) │  │  ║  - Azure ACR             ║
│  │              │  │ nginx :80   │  │  :8000    │  │ kserve/sklearn   │  │  ║    (Docker images)       ║
│  └──────────────┘  └─────────────┘  └──┬────────┘  └─────────▲────────┘  │  ║                          ║
│                                        │ K8s API proxy       │           │  ╚══════════════════════════╝
│                                        ▼                     │
│  ┌─────────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──┴────────┐
│  │ Postgres        │  │ MinIO        │  │ MLflow       │  │ KFP /     │
│  │ StatefulSet     │◀─│ Object store │◀─│ Tracking     │  │ Argo      │
│  │ schema + MLflow │  │ user-code/   │  │ server :5000 │  │ Workflow- │
│  │ tables          │  │ mlflow-      │  │              │  │ Controller│
│  │                 │  │ artifacts/   │  │              │  │ (kubeflow │
│  │                 │  │ mlpipeline/  │  │              │  │ namespace)│
│  └─────────────────┘  └──────────────┘  └──────────────┘  └───────────┘
└──────────────────────────────────────────────────────────────────────────┘
```

Reading order: **browser → Cloudflare → cloudflared pod → in-cluster Service → wherever**. Cloudflare Tunnel is a *replacement for a public LoadBalancer + Ingress*, because INSOMEA's Azure subscription blocks inbound 80/443 to AKS Public IPs (their NSG sits on the AKS-managed `MC_*` resource group, which our scoped Contributor role can't edit).

---

## Part 3 — Technology stack, with reasoning

### Backend: **FastAPI (Python 3.11) + SQLAlchemy 2 async + Pydantic v2**

**What it is**: an async Python web framework that auto-generates an OpenAPI schema and uses type hints for validation.

**Why we picked it**:
- The whole ML ecosystem is Python — using a Python backend means no marshalling between languages when we call MLflow, kfp, or the kubernetes SDK.
- Async support gives us cheap I/O concurrency (database, MLflow REST, K8s API) without threads.
- Pydantic v2 gives runtime validation, free OpenAPI, and Settings classes for environment-driven config — all from a single source of truth.

**Production server**: Gunicorn with 2 Uvicorn workers (`backend/Dockerfile.prod:46-53`). `--forwarded-allow-ips '*'` so it trusts the `X-Forwarded-Proto` header from nginx → Cloudflare and builds `https://` URLs in its redirects. Without that one flag, the redirect would be `http://`, the browser would block it as Mixed Content, and the whole app would feel broken behind the tunnel.

### Frontend: **Angular 19 (standalone components + signals) + Tailwind v4**

**What it is**: a modern Angular SPA with no NgModule overhead, served as static files by nginx.

**Why we picked it**:
- Angular's batteries-included design (RxJS, forms, router, HTTP, dependency injection) means less third-party glue.
- Standalone components + signals are the post-2024 idiom — same productivity as React but with stronger types and a tighter framework contract.
- Tailwind v4's `@theme` tokens (`frontend/src/styles.css:3-28`) let us define design colours once (`--color-bg`, `--color-cyan3`, …) and use them everywhere.
- ng2-charts wraps Chart.js for the dashboard widgets.

**Build & serve**: production build outputs hashed chunks (`outputHashing: all` in `angular.json`), served by nginx with `Cache-Control: public, immutable; expires 1y` for `*.js / *.css` and `no-store, no-cache` for `index.html` so deploys aren't stranded behind browser caches.

### Database: **PostgreSQL 16 (in-cluster)**

**What it is**: a single Postgres StatefulSet, 8 Gi managed-disk PVC, holds both our app's tables (users, projects, deployments, …) **and** MLflow's tracking tables (experiments, runs, metrics, …).

**Why one database for both**:
- A single point of backup / restore.
- Smaller cluster footprint — one StatefulSet to manage.
- MLflow accepts `postgresql+psycopg2://…` as its backend store, so it slots in cleanly.
- For a single-tenant PFE the safety guarantees of separating MLflow's DB from app DB don't matter.

**Why in-cluster, not Azure Database for PostgreSQL**:
- Costs $13+/mo for a managed Postgres on Azure; in-cluster is ~free (just disk).
- One fewer set of credentials and firewall rules.
- `helm uninstall` cleanly resets everything.

### Object storage: **MinIO (in-cluster, S3-compatible)**

**What it is**: a single-node MinIO deployment with three buckets created by a Helm post-install job:
- `user-code` — uploaded `.py / .ipynb / .zip / .csv` files (keyed by `<project_id>/<short>/<filename>`).
- `mlflow-artifacts` — MLflow stores all model files, plots, autologged artifacts here.
- `models` — reserved for future use.

KFP has its own MinIO in the `kubeflow` namespace (for pipeline step artifacts). They're separate.

**Why in-cluster, not Azure Blob**:
- Azure Blob's "S3-compatible" surface is incomplete — multi-part uploads, certain auth flows, and a few bucket policies behave differently from real S3. MLflow + KServe + boto3 all hit edge cases. MinIO is **the** drop-in S3.
- MinIO Pod on a managed-disk PVC is still Azure-native at the storage layer.
- Zero code changes when porting between local dev (KinD) and AKS.

### MLflow tracking: **MLflow 2.18.0 (in-cluster)**

**What it is**: a single MLflow tracking server pointed at Postgres (metadata) and MinIO (artifacts).

**Why we use MLflow**:
- It's the de-facto Python tracking layer; `mlflow.autolog()` instruments scikit-learn / XGBoost / LightGBM with one line.
- Built-in **Model Registry** with named versions and Staging / Production / Archived stages — we surface that registry in our own UI but the source of truth is MLflow.
- Open source, no vendor lock.

**Memory note**: bumped to `requests 512 Mi / limits 1.5 Gi` (`infrastructure/helm/mlops/values.yaml` mlflow section) — gunicorn 4 workers + psycopg2 + boto3 OOMs at the old 512 Mi limit within ~60 s.

### Pipeline orchestration: **Kubeflow Pipelines 2.4.1 + Argo Workflows 3.4**

**What it is**: KFP compiles a Python DSL into Argo Workflows; Argo runs each step as a pod.

**Why this layer exists**:
- We need each user-submitted training to run in **its own isolated pod** with resource limits, on cluster compute.
- KFP gives us a way to express "download code from MinIO → install requirements → run script → autolog to MLflow" as a tiny DAG.
- Argo handles pod scheduling, retries, log capture, and artifact passing between steps.

**Patches we shipped**:
- `workflow-controller --executor-image` overridden to `quay.io/argoproj/argoexec:v3.4.17` (the bundled `…-license-compliance` tag was 404 on GCR).
- `kubeflow/minio` image swapped to `minio/minio:RELEASE.2019-08-14T20-37-41Z` (same 404 reason).
- Documented in `infrastructure/azure/RUNBOOK.md` PART 4.

### Model serving: **KServe 0.13.1 in RawDeployment mode + sklearnserver**

**What it is**: KServe is a Kubernetes operator that turns a `kind: InferenceService` CRD into a Deployment + Service + Ingress, with framework-specific model servers (sklearn, xgboost, pytorch, tensorflow).

**Why we use RawDeployment instead of Serverless**:
- KServe's default mode (Serverless) needs Knative Serving's ingress (Istio or Kourier). We have neither — Knative Serving is installed, but for the CRDs it expects, not the ingress.
- In Serverless mode, every InferenceService stays stuck on `IngressNotConfigured` forever.
- **RawDeployment** mode produces a plain `Deployment + Service + Ingress`, works with the NGINX Ingress we already have.
- We set the cluster default in `kserve-config` ConfigMap *and* tag each manifest with `serving.kserve.io/deploymentMode: RawDeployment` (`backend/app/services/deployment_service.py`).

**How we invoke predictions**: the backend POSTs through the Kubernetes API server's `services/proxy` subresource, which avoids needing a publicly-routable URL for every model. Required:
1. ClusterRole grants `services/proxy` (added in `infrastructure/helm/mlops/templates/backend.yaml`).
2. `api_client.call_api(..., auth_settings=["BearerToken"])` so the K8s client actually sends the ServiceAccount token — a subtle thing the generic helper omits by default.

### Ingress: **NGINX Ingress Controller + cert-manager + Cloudflare Tunnel**

**What it is**: two layers stacked.

- **In-cluster**: NGINX Ingress Controller + cert-manager. There's an `Ingress` resource for `mlops-pfe-demo.northeurope.cloudapp.azure.com` (the Azure DNS name on the LoadBalancer's Public IP). This works fine if you can reach that IP.
- **Public**: a `cloudflared` Deployment (2 replicas, `infrastructure/k8s/cloudflared/named-tunnel.yaml`) opens a long-lived **outbound** QUIC tunnel to Cloudflare. Cloudflare publishes our chosen hostname (`mlops.firasmahjoubi.app`) and forwards inbound HTTPS traffic through the tunnel to the in-cluster `frontend` Service.

**Why both**:
- The cert-manager + NGINX path is the standard K8s recipe, and works for any K8s cluster with inbound 80/443 open.
- INSOMEA's subscription blocks inbound 80/443 on AKS Public IPs and we can't edit that NSG.
- Cloudflare Tunnel only needs *outbound* TCP/UDP from the pod — that's always allowed — so it sidesteps the inbound block entirely. Free TLS, real cert, no NSG changes.
- Both stay deployed; if INSOMEA ever opens the NSG, the legacy URL also starts working with zero migration.

### Container registry: **Azure Container Registry (`acrmlopspfedemo`)**

GitHub Actions builds the backend & frontend images on every push to `main`, tags them as `<image>:<git-sha>` and `<image>:latest`, and pushes to ACR. AKS pulls from ACR via the `acr-pull-secret` (created during cluster setup).

**Why ACR over Docker Hub**: ACR is in the same region as AKS → faster pulls, and the auth integrates with Azure RBAC if needed later.

### CI/CD: **GitHub Actions + admin kubeconfig**

A single workflow at `.github/workflows/deploy.yml` does: checkout → buildx → ACR login → build/push backend → build/push frontend → write `~/.kube/config` from the `KUBE_CONFIG` repo secret → `helm upgrade --install --set image.tag=$SHA --wait --timeout 8m` → print pod status.

**Why kubeconfig and not a service principal**: creating an Azure SP requires `Microsoft.Authorization/roleAssignments/write`, which needs Owner or User Access Administrator scope. Our INSOMEA subscription only grants Contributor on the resource group. The admin kubeconfig path uses certificate auth against the AKS API directly — works fine with Contributor.

---

## Part 4 — Component deep-dive

### 4.1 Backend layout

```
backend/
├── app/
│   ├── main.py                  ← FastAPI app, CORS, router include, /health
│   ├── config.py                ← Pydantic Settings (all env vars + defaults)
│   ├── database.py              ← async engine, async_sessionmaker, Base, get_db
│   ├── models/                  ← SQLAlchemy ORM
│   │   ├── user.py              ← User (email unique, hashed_password, full_name)
│   │   ├── project.py           ← Project (name, user_id FK, mlflow_experiment_id)
│   │   ├── pipeline_run.py      ← PipelineRun (kfp_run_id, status enum, parameters JSON)
│   │   ├── ml_model.py          ← MLModel (mlflow_model_name + version, stage enum)
│   │   └── deployment.py        ← Deployment (inference_service_name, endpoint_url, status enum)
│   ├── api/
│   │   ├── deps.py              ← get_current_user (JWT → User), get_db
│   │   └── v1/
│   │       ├── router.py        ← mounts all sub-routers under /api/v1
│   │       ├── auth.py          ← /signup /login /refresh /me
│   │       ├── projects.py      ← list/create/update/delete + /stats
│   │       ├── experiments.py   ← MLflow runs aggregated across projects
│   │       ├── pipelines.py     ← trigger (sklearn) + trigger-custom (.zip)
│   │       ├── models.py        ← model registry + version promote/delete
│   │       ├── deployments.py   ← KServe IS create/list/predict/metrics
│   │       ├── cluster.py       ← node CPU/mem aggregates via metrics-server
│   │       ├── activity.py      ← synthesized event feed
│   │       ├── uploads.py       ← code/data file upload to MinIO
│   │       └── admin.py         ← /purge-all (nuclear)
│   ├── services/
│   │   ├── mlflow_service.py    ← async httpx → MLflow REST
│   │   ├── pipeline_service.py  ← kfp Client, pipeline DSL templates
│   │   ├── deployment_service.py← K8s CustomObjectsApi for KServe, predict via /proxy
│   │   ├── k8s_client.py        ← ensure_k8s_loaded (in-cluster vs file fallback)
│   │   └── minio_client.py      ← boto3 / minio SDK wrapper
│   └── utils/
│       └── security.py          ← bcrypt + JWT (HS256, access + refresh)
├── Dockerfile                   ← dev: uvicorn --reload
├── Dockerfile.prod              ← prod: gunicorn -k uvicorn.workers.UvicornWorker -w 2 --forwarded-allow-ips '*'
├── .dockerignore                ← keeps backend/kubeconfig (local dev) out of the prod image
└── requirements.txt             ← FastAPI 0.115, SQLAlchemy 2.0, kfp 2.11, kubernetes 30, mlflow 2.18 client, boto3, minio
```

### 4.2 Frontend layout

```
frontend/src/app/
├── app.config.ts                ← provideRouter(routes), provideHttpClient(withInterceptors([authInterceptor]))
├── app.routes.ts                ← /login, /signup, then DashboardLayout(authGuard) → child routes
├── core/
│   ├── auth/
│   │   ├── auth.service.ts      ← POST /signup /login /logout, currentUser$ BehaviorSubject
│   │   ├── token.service.ts     ← localStorage access_token / refresh_token
│   │   ├── auth.guard.ts        ← CanActivate: isLoggedIn() else redirect /login
│   │   └── auth.interceptor.ts  ← attach Authorization: Bearer + redirect to /login on 401
│   └── services/
│       ├── project.service.ts
│       ├── experiment.service.ts
│       ├── pipeline.service.ts
│       ├── model.service.ts
│       ├── deployment.service.ts
│       ├── upload.service.ts
│       ├── activity.service.ts
│       ├── cluster.service.ts
│       ├── admin.service.ts
│       ├── theme.service.ts     ← dark/light toggle, persists to localStorage
│       └── mobile-nav.service.ts← single signal isOpen() shared by sidebar+topbar (drawer state)
├── shared/
│   ├── layouts/
│   │   ├── dashboard-layout/    ← sidebar + topbar + <router-outlet>, responsive ml-[232px]
│   │   └── auth-layout/         ← branded 2-pane shell with mesh-gradient + glass card slot
│   ├── components/
│   │   ├── sidebar/             ← Dashboard / Projects / Experiments / Pipelines / Models / Deployments
│   │   └── topbar/              ← hamburger (mobile) + breadcrumbs + search + theme + user
│   └── ui/
│       ├── icon/                ← single SVG component with switch over IconName union
│       ├── logo/, btn/, status/, kbd/, sparkline/, bars/, card/, confirm-dialog/, framework-chip/
└── pages/
    ├── auth/login, auth/signup
    ├── dashboard/               ← KPI tiles + Running now + Cluster utilisation + Activity
    ├── projects/project-list, projects/project-detail
    ├── experiments/             ← MLflow runs across projects
    ├── pipelines/               ← KFP run list + live status
    ├── models/                  ← registry browser
    ├── deployments/             ← KServe IS list + predict tester
    ├── runs/run-compare         ← side-by-side metrics
    └── data/, monitoring/, artifacts/, features/   ← stubs for future
```

### 4.3 Helm chart

`infrastructure/helm/mlops/` is a single chart that templates **6 K8s objects** + helpers:

| Template | Creates |
|---|---|
| `backend.yaml` | `ServiceAccount` + `ClusterRole backend-mlops` + `ClusterRoleBinding` + `Service` + `Deployment` |
| `frontend.yaml` | `Service` + `Deployment` |
| `mlflow.yaml` | `Service` + `Deployment` (Recreate strategy because of the single PVC) |
| `minio.yaml` | `Service` + `PVC` + `Deployment` + Helm post-install `Job` for bucket init |
| `postgres.yaml` | Headless `Service` + `StatefulSet` (volumeClaimTemplate) |
| `ingress.yaml` | `Ingress` (TLS via cert-manager) |
| `_helpers.tpl` | label helpers, image construction |

`values.yaml` is the one place to change replica count, image tag, resource limits, PVC sizes, ingress host, secret names.

### 4.4 Cluster add-ons (installed once, outside the chart)

These live in the cluster but aren't templated by Helm — they're installed via `kubectl apply` as documented in `infrastructure/azure/RUNBOOK.md` PART 4:

1. **NGINX Ingress Controller** (with the `mlops-pfe-demo` DNS label annotation, so Azure auto-assigns the cluster a public hostname).
2. **cert-manager** + a Let's Encrypt `ClusterIssuer`.
3. **KServe** + **Knative Serving** (CRDs only; we run KServe in RawDeployment mode so we don't need Knative's ingress).
4. **Kubeflow Pipelines 2.4.1** (with the `argoexec` and `minio` image patches above).
5. **`mlops` namespace** + `kserve-sa` ServiceAccount + `minio-s3-creds` Secret (`infrastructure/k8s/kserve/mlops-namespace.yaml`).
6. **`mlops-secrets` Secret** (created by hand once, holds `DATABASE_URL`, `JWT_SECRET_KEY`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `POSTGRES_PASSWORD`).
7. **`acr-pull-secret`** (`docker-registry` type, holds the ACR admin password so the kubelet can pull our private images).
8. **`cloudflared-token` Secret** (the Cloudflare tunnel install token).
9. **Cloudflare Tunnel** (`infrastructure/k8s/cloudflared/named-tunnel.yaml`).

---

## Part 5 — End-to-end data flow

The user journey, step by step, with the systems involved at each step:

### Sign up

```
Browser → POST /api/v1/auth/signup → backend
backend:
  - bcrypt.hash(password)
  - INSERT INTO users (email, hashed_password, …) RETURNING id
  - JWT(sub=user_id, type=access, exp=now+30m)
  - JWT(sub=user_id, type=refresh, exp=now+7d)
  ← 200 { access_token, refresh_token, user }
Browser:
  - localStorage.setItem('access_token', …)
  - router.navigate(['/dashboard'])
```

### Create a project

```
POST /api/v1/projects/  with { name, description }
backend:
  - INSERT INTO projects … RETURNING id
  - mlflow_service.create_experiment(f'{user.email}/{name}')
    → POST {mlflow}/api/2.0/mlflow/experiments/create
    ← experiment_id (e.g. "1")
  - UPDATE projects SET mlflow_experiment_id = '1'
  ← project JSON
```

### Upload code + dataset

```
POST /api/v1/projects/{id}/upload  (multipart)
backend:
  - minio_client.put_object('user-code', f'{project_id}/<short>/<filename>', stream)
  ← { code_minio_path: '<project_id>/<short>/code.zip' }
```

### Trigger a custom-code pipeline

```
POST /api/v1/pipelines/trigger-custom  { code_minio_path, dataset_minio_path, entry_script }
backend.pipeline_service.trigger_custom_code_pipeline():
  - kfp.compiler.Compiler().compile(custom_code_pipeline_fn, '/tmp/pipeline.yaml')
  - client = kfp.Client(host=KFP_HOST)
  - client.create_experiment(name=project.name, namespace='kubeflow')
  - client.run_pipeline(experiment_id=…, params={
      code_minio_path, dataset_minio_path, entry_script,
      mlflow_tracking_uri='http://mlflow.mlops.svc.cluster.local:5000',
      mlflow_experiment_id=project.mlflow_experiment_id,
      minio_endpoint='minio.mlops.svc.cluster.local:9000',
      minio_access_key=…, minio_secret_key=…,
    })
  ← INSERT INTO pipeline_runs (project_id, kfp_run_id, status='PENDING')

KFP → Argo Workflows → workflow-controller (kubeflow ns)
  → spawns a system-dag-driver pod (Init: argoexec image)
  → then a system-container-impl pod
       - pulls python:3.11-slim base
       - inside the pod:
           1. pip install kfp boto3 mlflow
           2. boto3.client('s3', endpoint_url=…minio…).download_file('user-code', code_minio_path, '/workspace/code.zip')
           3. unzip into /workspace/
           4. boto3 download dataset → /workspace/<dataset>.csv
           5. autodetect entry_script (train.py / main.py / first .py)
           6. write a small _runner.py that calls mlflow.set_tracking_uri + mlflow.autolog + runpy.run_path
           7. python _runner.py train.py
              → during training, autolog hits the MLflow tracking server:
                  POST {mlflow}/api/2.0/mlflow/runs/create
                  POST {mlflow}/api/2.0/mlflow/runs/log-metric (×N)
                  POST {mlflow}/api/2.0/mlflow/runs/log-parameter (×N)
                  PUT  s3://mlflow-artifacts/<exp_id>/<run_id>/artifacts/model/…
                  POST {mlflow}/api/2.0/mlflow/registered-models/create
                  POST {mlflow}/api/2.0/mlflow/model-versions/create
```

### Promote a model version to Production

```
POST /api/v1/models/{model_name}/versions/{version}/promote  { stage: 'Production' }
backend:
  - mlflow_service.transition_model_stage(name, version, 'Production')
    → POST {mlflow}/api/2.0/mlflow/model-versions/transition-stage
  - UPSERT ml_models row with new stage
  ← updated model JSON
```

### Deploy the model

```
POST /api/v1/deployments  { model_id, replicas: 1 }
backend.deployment_service.create_inference_service():
  - manifest = {
      apiVersion: 'serving.kserve.io/v1beta1',
      kind: 'InferenceService',
      metadata: { name: '<sanitised>', namespace: 'mlops',
                  annotations: { 'serving.kserve.io/deploymentMode': 'RawDeployment' } },
      spec: { predictor: { serviceAccountName: 'kserve-sa',
                           sklearn: { storageUri: 's3://mlflow-artifacts/…',
                                      resources: { requests/limits } } } }
    }
  - CustomObjectsApi.create_namespaced_custom_object(group=serving.kserve.io, version=v1beta1,
                                                    namespace=mlops, plural=inferenceservices, body=manifest)
KServe controller (RawDeployment mode):
  → creates Deployment <name>-predictor (image kserve/sklearnserver:v0.13.1, args --model_name=<name> --model_dir=/mnt/models --http_port=8080)
  → creates Service  <name>-predictor (ClusterIP :80 → :8080)
  → predictor pod runs storage-initializer init-container that uses the SA's S3 creds
    to download s3://mlflow-artifacts/<exp>/<run>/artifacts/model/ → /mnt/models
  → sklearn-server loads MLmodel + model.pkl, opens HTTP on :8080
  → KServe reports Ready=True on the InferenceService
backend:
  - polls .status.conditions until Ready
  - INSERT INTO deployments (project_id, model_id, inference_service_name, status='READY', endpoint_url=…)
  ← deployment JSON
```

### Send a prediction

```
POST /api/v1/deployments/{id}/predict  { instances: [[…30 numbers…]] }
backend.deployment_service.predict():
  path = '/api/v1/namespaces/mlops/services/http:<name>-predictor:80/proxy/v1/models/<name>:predict'
  api_client.call_api(path, 'POST', body={instances}, auth_settings=['BearerToken'])
    → reaches K8s API server with SA token
    → K8s server authorises: resources=services/proxy, verb=create, namespace=mlops  (granted in ClusterRole)
    → proxies to <name>-predictor:80/v1/models/<name>:predict
    → sklearn-server: model.predict(instances) → { "predictions": [1] }
backend ← { predictions: [1] }
```

### Watch live metrics

The dashboard polls:

- `GET /api/v1/cluster/metrics` → backend uses `core_v1.list_node()` and metrics-server (`metrics.k8s.io/v1beta1/nodes`) to compute total cluster CPU / memory usage.
- `GET /api/v1/deployments/{id}/metrics` → backend reads `metrics.k8s.io/v1beta1/namespaces/mlops/pods/<predictor-pod>` and the pod's resource limits to compute CPU/mem percentages.

(Both RBAC permissions live in `backend-mlops` ClusterRole.)

---

## Part 6 — Deployment & operations

### One-time provisioning (`infrastructure/azure/RUNBOOK.md`)

1. Create resource group + Azure Container Registry (`acrmlopspfedemo`).
2. Create AKS cluster `aks-mlops-pfe`, `Standard_B4s_v2`, 1 node.
3. Enable ACR admin user; create `acr-pull-secret` in the cluster.
4. Install cluster add-ons (NGINX Ingress, cert-manager, KServe + Knative CRDs, Kubeflow Pipelines).
5. Apply image patches (workflow-controller `--executor-image`, kubeflow's minio).
6. Switch the cluster's KServe `defaultDeploymentMode` to `RawDeployment` and restart `kserve-controller-manager`.
7. Apply `mlops-namespace.yaml` (namespace + `kserve-sa` + `minio-s3-creds`).
8. Create `mlops-secrets` (DATABASE_URL, JWT_SECRET_KEY, MinIO + Postgres creds).
9. Generate the AKS admin kubeconfig, base64-encode it, paste into the `KUBE_CONFIG` GitHub repo secret.
10. Add `ACR_USERNAME` and `ACR_PASSWORD` GitHub repo secrets.
11. Create the Cloudflare account + add the domain + create the named tunnel + paste the install token into the cluster `cloudflared-token` Secret.
12. Apply `infrastructure/k8s/cloudflared/named-tunnel.yaml`.
13. In Cloudflare Zero Trust dashboard, add the public hostname `mlops.firasmahjoubi.app → http://frontend.mlops.svc.cluster.local:80`.

After this, `git push origin main` ships the app.

### Continuous deployment (`infrastructure/azure/DEPLOY_GUIDE.md` + `.github/workflows/deploy.yml`)

Every push to `main` runs the workflow in ~6 minutes:
1. Checkout.
2. Set up Docker Buildx.
3. ACR docker login.
4. Build & push backend image (registry layer cache).
5. Build & push frontend image (registry layer cache).
6. Restore `~/.kube/config` from the `KUBE_CONFIG` secret.
7. Install Helm v3.16.
8. `helm upgrade --install mlops ./infrastructure/helm/mlops --set image.tag=<sha> --wait --timeout 8m`.
9. Print pods + image tags + Helm history.

Rollback: `helm rollback mlops <revision> -n mlops`.

### Local development (`infrastructure/docker-compose/docker-compose.yml`)

Six services come up with `docker compose up -d`:
- `postgres:16-alpine`
- `minio:RELEASE.2024-06-13T22-53-53Z`
- `minio-init` (one-shot, creates buckets)
- `mlflow` (custom build in `infrastructure/docker-compose/mlflow/`)
- `backend` (built from `backend/Dockerfile`, mounts `~/.kube` read-only)
- `frontend` (built from `frontend/Dockerfile`, `ng serve --poll`)

For pipelines locally, you also need `kubectl port-forward -n kubeflow svc/ml-pipeline 8080:8888` so the backend can reach the KFP API.

---

## Part 7 — Intentionally NOT included (and what to add later)

| Missing | Why we didn't add it | When you'd want it |
|---|---|---|
| Multi-tenancy / orgs | Single-user PFE demo | If multiple teams share the platform |
| Email / "Forgot password" flow | Needs SMTP + reset-token table | Real-world rollout |
| Social auth (Google / GitHub) | Misleads users — no backend support | Real-world rollout |
| Audit logging | Activity feed is computed live from existing tables | Compliance / SOC2 |
| Rate limiting | No public-facing untrusted callers yet | Public API access |
| Image vulnerability scanning | Could add `docker/scout` step in CI | Hardened prod |
| Pytest in CI | No tests written yet | Anything beyond demo |
| Staging environment | Single env to keep it learnable | Multi-stage releases |
| OIDC-based Azure auth | Needs `Microsoft.Authorization/roleAssignments/write` we don't have | If subscription perms ever upgrade |
| WebSockets / SSE | All dashboards poll | Live log streaming |
| Background workers (Celery, etc.) | Pipeline orchestration is KFP's job | Generic async tasks |
| Database migrations on boot | Prod uses Alembic CLI; dev uses `RUN_CREATE_ALL=1` | After schema changes proliferate |
| Light-mode UI variant | Explicitly out of scope | Aesthetics |
| Mobile bottom tab bar | Drawer pattern picked instead | Native-feel mobile |
| GPU metrics | Cluster has no GPU pool | If you add a GPU nodepool |

---

## Part 8 — How to extend it

A few common "what next?" tasks and where to add the code:

- **New API endpoint** → add a function to the right file in `backend/app/api/v1/`, optionally a service in `backend/app/services/`. The router auto-includes it because the file already mounts a sub-router in `router.py`.
- **New page** → add a directory in `frontend/src/app/pages/`, a route in `app.routes.ts` (under the `DashboardLayout` parent for authenticated pages), and a sidebar entry in `sidebar.component.ts` `nav` array.
- **New environment variable** → add it to `backend/app/config.py` Settings, surface a default for local dev, and add it to the backend Deployment template at `infrastructure/helm/mlops/templates/backend.yaml`.
- **New cluster permission** → add a rule to the `backend-mlops` ClusterRole in `infrastructure/helm/mlops/templates/backend.yaml`. RBAC re-applies on the next `helm upgrade` with no pod restart.
- **New model framework** → KServe natively supports pytorch / tensorflow / xgboost. Change `sklearn:` in the InferenceService manifest builder at `backend/app/services/deployment_service.py` to the right framework block.

---

## Part 9 — Glossary

| Term | What it means here |
|---|---|
| **MLflow autolog** | Calling `mlflow.autolog()` makes scikit-learn / XGBoost / LightGBM automatically log every metric, parameter and artifact to MLflow without manual `mlflow.log_metric()` calls. |
| **KServe InferenceService (`isvc`)** | A K8s custom resource that says "run model X with framework Y at endpoint Z, with N replicas". KServe controller turns it into Deployment + Service. |
| **KServe RawDeployment mode** | Skips Knative Serving entirely — produces a plain K8s Deployment+Service+Ingress. We use this. |
| **KServe Serverless mode (default)** | Uses Knative Serving + scale-to-zero. Needs Istio or Kourier ingress. We don't use this. |
| **Kubeflow Pipelines (KFP)** | The Python SDK + orchestrator that compiles `@dsl.component` functions into Argo Workflows. |
| **Argo Workflows** | The lower-level CRD that actually schedules pods for each pipeline step. KFP compiles down to Argo. |
| **MinIO** | An S3-API-compatible object store. Used here both by us (for code/datasets/MLflow artifacts) and by KFP internally (in the kubeflow namespace). |
| **Cloudflare Tunnel** | A pod that dials *out* to Cloudflare; Cloudflare then exposes our service to the internet without any inbound port being open. |
| **Helm chart** | A package of K8s manifests templated with values. `helm upgrade --install` applies the rendered manifests; `helm rollback` reverts to a prior revision. |
| **PFE** | "Projet de Fin d'Études" — final-year project at a French/Tunisian engineering school. |
