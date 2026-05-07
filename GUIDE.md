# MLOps Platform — Full System Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Components](#components)
4. [Port Map](#port-map)
5. [End-to-End Flow](#end-to-end-flow)
6. [Starting the System](#starting-the-system)
7. [Using the Platform](#using-the-platform)
8. [API Reference](#api-reference)
9. [Database Schema](#database-schema)
10. [Infrastructure Details](#infrastructure-details)
11. [Troubleshooting](#troubleshooting)

---

## Overview

This platform automates the full ML lifecycle locally:

```
Upload training code
       ↓
Trigger Kubeflow Pipeline (trains model in Kubernetes)
       ↓
MLflow tracks experiments, metrics, artifacts
       ↓
Promote model to Production in MLflow Registry
       ↓
Deploy to KServe → live REST inference endpoint
       ↓
Test predictions from the UI
```

Everything runs locally: no cloud account needed.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Your Browser                         │
│                    http://localhost:4200                     │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP
┌─────────────────────────▼───────────────────────────────────┐
│              Angular 19 Frontend (ng serve)                 │
│   Pages: Auth · Dashboard · Projects · Experiments          │
│          Pipelines · Models · Deployments · Compare         │
└─────────────────────────┬───────────────────────────────────┘
                          │ REST API (HTTP/JSON)
┌─────────────────────────▼───────────────────────────────────┐
│         FastAPI Backend   (Docker · port 8000)              │
│   /api/v1/auth  /projects  /uploads  /experiments           │
│   /pipelines    /models    /deployments                     │
└──┬──────────┬────────────┬──────────────┬───────────────────┘
   │          │            │              │
   ▼          ▼            ▼              ▼
PostgreSQL  MinIO       MLflow        Kubernetes API
(port 5432) (port 9000) (port 5000)   (kind cluster)
            S3 storage  Experiment       │
            user code   tracking      ┌──┴──────────────────┐
            ML models   model registry│  Kubeflow Pipelines  │
                                      │  KServe InferService │
                                      └─────────────────────┘
```

### Two runtime environments

| What | Where | Why |
|------|-------|-----|
| Backend, PostgreSQL, MinIO, MLflow | **Docker Compose** | Fast startup, easy networking |
| Pipeline execution, Model serving | **kind Kubernetes cluster** | Realistic K8s environment |

---

## Components

### Frontend — Angular 19 + Tailwind CSS
- Runs natively on your machine with `ng serve` (port 4200)
- Dark theme (slate-900 background, indigo-500 accent)
- Communicates with the backend at `http://localhost:8000`

### Backend — FastAPI (Python)
- Docker container, port 8000
- JWT authentication (access + refresh tokens)
- Async SQLAlchemy with PostgreSQL
- Calls MLflow REST API, MinIO S3 API, Kubeflow Pipelines SDK, kubernetes Python client
- Auto-reload with uvicorn (`--reload` flag)

### PostgreSQL 16
- Docker container, port 5432
- Stores: users, projects, pipeline_runs, ml_models, deployments
- **Does NOT store** experiment metrics (MLflow owns that)

### MinIO
- Docker container, ports 9000 (S3 API) + 9001 (web console)
- Buckets:
  - `mlflow-artifacts` — MLflow stores model files, metrics here
  - `user-code` — uploaded Python/zip training scripts
  - `models` — reserved for future use
- Web console: http://localhost:9001 (minioadmin / minioadmin123)

### MLflow 2.11.0
- Docker container, port 5000
- Tracks experiment runs (metrics, parameters, artifacts)
- Hosts the Model Registry (version + stage management)
- Stores artifacts in MinIO via S3 protocol
- UI: http://localhost:5000

### Kubeflow Pipelines 2.3.0
- Runs inside the `kind` Kubernetes cluster (`kubeflow` namespace)
- Orchestrates multi-step training pipelines
- Each pipeline step runs as a separate Kubernetes Pod
- Access UI: `kubectl port-forward -n kubeflow svc/ml-pipeline-ui 8080:80`
  then open http://localhost:8080

### KServe 0.14.1
- Runs inside the `kind` cluster (`kserve` namespace)
- RawDeployment mode — creates plain K8s Deployments + Services (no Istio/Knative)
- Serves models via the `kserve-sklearnserver` ClusterServingRuntime
- Downloads model artifacts from MinIO at startup (storage-initializer init container)
- Predictions proxied through the Kubernetes API (no NodePort per deployment needed)

### kind Kubernetes Cluster
- Single-node cluster named `mlops-control-plane`
- API exposed on host port 56525 (`https://127.0.0.1:56525`)
- Backend reaches it via `host.docker.internal:56525`
- kubeconfig stored at `backend/kubeconfig`

---

## Port Map

| Service | Port | URL |
|---------|------|-----|
| Frontend (Angular) | 4200 | http://localhost:4200 |
| Backend (FastAPI) | 8000 | http://localhost:8000 |
| Backend API docs | 8000 | http://localhost:8000/docs |
| MLflow UI | 5000 | http://localhost:5000 |
| MinIO S3 API | 9000 | http://localhost:9000 |
| MinIO Console | 9001 | http://localhost:9001 |
| PostgreSQL | 5432 | localhost:5432 |
| KFP Dashboard | 8080 | http://localhost:8080 (port-forward only) |
| kind API | 56525 | https://127.0.0.1:56525 |

---

## End-to-End Flow

### Step 1 — Sign Up / Log In
- Create an account at http://localhost:4200
- JWT access token stored in localStorage
- All API calls include `Authorization: Bearer <token>`

### Step 2 — Create a Project
- Projects are the top-level container
- Creating a project automatically creates an **MLflow experiment** with the same name
- The `mlflow_experiment_id` is stored in PostgreSQL

### Step 3 — Upload Training Code
- Drag-and-drop `.py`, `.zip`, `.ipynb` files on the Code tab
- Files are uploaded to MinIO bucket `user-code` at path `<project_id>/<filename>`

### Step 4 — Trigger a Training Pipeline
- Go to the Pipelines tab → fill in parameters (dataset, model type, etc.)
- Backend calls the **Kubeflow Pipelines REST API** to start a run
- KFP creates pods for each pipeline step:

```
load_data → preprocess_data → train_model → evaluate_and_register
```

Each step is a Python function decorated with `@dsl.component`, running in a `python:3.11-slim` container with scikit-learn + MLflow installed.

- The `train_model` step:
  - Trains a sklearn model (RandomForest, GradientBoosting, etc.)
  - Logs metrics (accuracy, f1, precision, recall) to MLflow
  - Saves `model.pkl` as an MLflow artifact in MinIO

- The `evaluate_and_register` step:
  - Registers the model in the **MLflow Model Registry** if accuracy > threshold
  - Model name convention: `<project-name>-model` (e.g. `test-pipeline-project-model`)

### Step 5 — View Experiments
- Experiments tab shows all MLflow runs for the project
- Click a run to see all parameters and metrics in a side drawer
- Select 2+ runs → Compare → side-by-side chart + metric table
- Best values highlighted in green (higher = better; loss/rmse/mae = lower is better)

### Step 6 — Promote a Model
- Models tab shows all registered versions from MLflow Registry
- Each version has a stage: `None` → `Staging` → `Production` → `Archived`
- Click **Production** to promote — backend calls MLflow's transition-stage API
- Only one version can be Production at a time (others auto-archived)

### Step 7 — Deploy to KServe
- On the Models tab, click **Deploy** next to any version
- Backend:
  1. Looks up the model's `artifact_uri` (e.g. `s3://mlflow-artifacts/3/<run-id>/artifacts/model`)
  2. Creates a KServe `InferenceService` custom resource in the `mlops` namespace
  3. KServe's storage-initializer init container downloads `model.pkl` from MinIO
  4. `kserve-sklearnserver` serves the model on port 8080
- Deployment status auto-polls every 5 seconds: `CREATING` → `READY`

The InferenceService spec looks like:
```yaml
apiVersion: serving.kserve.io/v1beta1
kind: InferenceService
metadata:
  name: test-pipeline-project-v1
  namespace: mlops
spec:
  predictor:
    serviceAccountName: kserve-sa   # has MinIO credentials
    minReplicas: 1
    sklearn:
      storageUri: s3://mlflow-artifacts/3/<run-id>/artifacts/model
```

### Step 8 — Test Predictions
- Deployments tab → click a READY deployment → inline test panel appears
- Enter instances as a JSON 2D array, e.g. `[[5.1, 3.5, 1.4, 0.2]]`
- Backend proxies the request through the Kubernetes API:
  ```
  POST /api/v1/namespaces/mlops/services/http:test-pipeline-project-v1-predictor:80
       /proxy/v1/models/test-pipeline-project-v1:predict
  ```
- Response: `{"predictions": [0]}`

---

## Starting the System

### Prerequisites
- Docker Desktop with Kubernetes enabled (or kind cluster running)
- Node.js 18+ installed on your machine

### Start everything

```bash
# 1. Start backend services (PostgreSQL, MinIO, MLflow, Backend)
cd d:/pfe/infrastructure/docker-compose
docker compose up -d

# 2. Start frontend natively (fast)
cd d:/pfe/frontend
npx ng serve --host 0.0.0.0

# 3. (Optional) Watch KFP pipeline logs
kubectl port-forward -n kubeflow svc/ml-pipeline-ui 8080:80
```

### Stop everything

```bash
# Stop Docker services
cd d:/pfe/infrastructure/docker-compose
docker compose down

# Frontend: Ctrl+C in the terminal running ng serve
```

### Check status

```bash
# Docker services
docker compose ps

# Kubernetes cluster
kubectl get nodes
kubectl -n kubeflow get pods
kubectl -n mlops get inferenceservice
kubectl -n kserve get pods
```

---

## API Reference

All endpoints require `Authorization: Bearer <token>` except auth endpoints.
Base URL: `http://localhost:8000/api/v1`
Interactive docs: http://localhost:8000/docs

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/signup` | Register new user |
| POST | `/auth/login` | Login → access + refresh tokens |
| POST | `/auth/refresh` | Refresh access token |
| GET | `/auth/me` | Get current user info |

### Projects
| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects/` | List user's projects |
| POST | `/projects/` | Create project (+ MLflow experiment) |
| GET | `/projects/{id}` | Get project details |
| PUT | `/projects/{id}` | Update project |
| DELETE | `/projects/{id}` | Delete project |

### Uploads
| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects/{id}/upload` | Upload file to MinIO |
| GET | `/projects/{id}/files` | List uploaded files |

### Experiments (MLflow)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/experiments/project/{id}` | List MLflow runs for project |
| GET | `/experiments/compare?run_ids=a,b` | Compare multiple runs |

### Pipelines
| Method | Path | Description |
|--------|------|-------------|
| POST | `/pipelines/trigger` | Trigger KFP training pipeline |
| GET | `/pipelines/project/{id}` | List pipeline runs |
| GET | `/pipelines/{run_id}` | Get run status |
| GET | `/pipelines/{run_id}/logs` | Get run logs |

### Models (MLflow Registry)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/models/project/{id}` | List model versions (syncs to DB) |
| GET | `/models/{name}/versions` | List versions by model name |
| POST | `/models/{name}/versions/{v}/promote` | Transition stage |

### Deployments (KServe)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/deployments/` | Deploy model to KServe |
| GET | `/deployments/project/{id}` | List project deployments |
| GET | `/deployments/{id}` | Get deployment + sync status |
| DELETE | `/deployments/{id}` | Delete InferenceService |
| POST | `/deployments/{id}/predict` | Send prediction request |

---

## Database Schema

```
users
├── id (UUID)
├── email
├── hashed_password
├── full_name
├── is_active
└── created_at

projects
├── id (UUID)
├── name
├── description
├── user_id → users.id
├── mlflow_experiment_id   ← links to MLflow
└── created_at

pipeline_runs
├── id (UUID)
├── project_id → projects.id
├── kfp_run_id             ← links to Kubeflow
├── status (PENDING/RUNNING/SUCCEEDED/FAILED)
├── pipeline_type
├── parameters (JSON)
├── code_path
└── started_at

ml_models
├── id (UUID)
├── project_id → projects.id
├── name
├── mlflow_model_name      ← links to MLflow Registry
├── mlflow_model_version
├── stage (None/Staging/Production/Archived)
├── metrics (JSON)
├── artifact_uri           ← S3 path to model files
└── created_at

deployments
├── id (UUID)
├── project_id → projects.id
├── model_id → ml_models.id
├── inference_service_name ← links to KServe
├── endpoint_url
├── status (CREATING/READY/FAILED/DELETED)
├── replicas
├── created_at
└── updated_at
```

---

## Infrastructure Details

### MinIO credentials
- Access key: `minioadmin`
- Secret key: `minioadmin123`
- Used by: MLflow (artifact storage), KServe (model download), backend (file uploads)

### KServe MinIO access
KServe's storage-initializer reads S3 credentials from a Kubernetes Secret:
```yaml
# infrastructure/k8s/kserve/mlops-namespace.yaml
Secret: minio-s3-creds (namespace: mlops)
  AWS_ACCESS_KEY_ID: minioadmin
  AWS_SECRET_ACCESS_KEY: minioadmin123
  annotations:
    serving.kserve.io/s3-endpoint: host.docker.internal:9000
    serving.kserve.io/s3-usehttps: "0"
```
The ServiceAccount `kserve-sa` references this secret and is set on every InferenceService.

### Backend → Kubernetes connectivity
The backend container reaches the kind cluster via:
- `host.docker.internal:56525` (kind's API port forwarded to host)
- kubeconfig at `/app/kubeconfig` (bind-mounted from `backend/kubeconfig`)
- `insecure-skip-tls-verify: true` (kind cert SAN doesn't include `host.docker.internal`)

### MLflow artifact path pattern
```
s3://mlflow-artifacts/<experiment_id>/<run_id>/artifacts/model/
├── MLmodel          ← model metadata (flavor, python version, etc.)
├── model.pkl        ← serialized sklearn model
├── conda.yaml
├── requirements.txt
└── python_env.yaml
```

---

## Troubleshooting

### Backend not responding
```bash
docker compose logs backend --tail 30
docker compose restart backend
```

### Pipeline stuck in PENDING
```bash
kubectl -n kubeflow get pods
# If pods are not starting, check resources:
kubectl describe node mlops-control-plane
```

### KServe pod stuck in Init
```bash
kubectl -n mlops describe pod <pod-name>
# Usually means storage-initializer can't reach MinIO
# Verify: host.docker.internal resolves inside the cluster
kubectl -n mlops get secret minio-s3-creds -o yaml
```

### MLflow returns empty results
```bash
# Check MLflow is running
curl http://localhost:5000/health
# Check MinIO bucket exists
# http://localhost:9001 → Buckets → mlflow-artifacts
```

### Prediction returns connection reset
```bash
# Use 127.0.0.1 instead of localhost (IPv6 issue on Windows)
curl -X POST http://127.0.0.1:8000/api/v1/deployments/<id>/predict \
  -H "Content-Type: application/json" \
  -d '{"instances":[[5.1,3.5,1.4,0.2]]}'
```

### DBeaver can't connect to PostgreSQL
```bash
# Reset password
docker exec docker-compose-postgres-1 \
  psql -U mlops -d mlops_platform -c "ALTER USER mlops WITH PASSWORD 'mlops123';"
# Use: host=localhost port=5432 db=mlops_platform user=mlops password=mlops123
```

### kind cluster not running
```bash
kind get clusters          # should show: mlops
kind create cluster --name mlops   # recreate if missing
# Then re-apply KServe manifests:
kubectl apply -f infrastructure/k8s/kserve/mlops-namespace.yaml
```

### Frontend slow (running in Docker)
Run it natively instead:
```bash
docker compose stop frontend
cd d:/pfe/frontend
npx ng serve --host 0.0.0.0
```
