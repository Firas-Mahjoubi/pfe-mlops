# MLOps Platform

End-to-end MLOps platform on Kubernetes — projects, pipelines, MLflow tracking,
KServe deployments, all behind a single Angular UI.

**📖 For the full picture — what we use, why we use it, and how everything fits
together — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).**

## Local development

KFP API + UI need port-forwards into the in-cluster Kubeflow Pipelines service:

```bash
# KFP API (required for pipeline triggering)
kubectl port-forward -n kubeflow svc/ml-pipeline 8080:8888 &

# KFP UI (optional, to watch pipeline runs)
kubectl port-forward -n kubeflow svc/ml-pipeline-ui 8081:80 &
```

The rest of the stack runs via Docker Compose:

```powershell
cd infrastructure/docker-compose
docker compose up -d
```

Then open <http://localhost:4200>.

## Deploy to production (AKS)

This repo ships a complete deploy pipeline. Pushing to `main` automatically:

1. Builds backend + frontend Docker images
2. Pushes them to Azure Container Registry
3. `helm upgrade`s the AKS cluster to the new images

**First-time setup** (provision AKS, ACR, cluster add-ons): see
[infrastructure/azure/RUNBOOK.md](infrastructure/azure/RUNBOOK.md).

**Daily deploy workflow** (set up the service principal, GitHub secrets,
trigger deploys, rollbacks, troubleshooting): see
[infrastructure/azure/DEPLOY_GUIDE.md](infrastructure/azure/DEPLOY_GUIDE.md).

The GitHub Action lives at
[.github/workflows/deploy.yml](.github/workflows/deploy.yml).
