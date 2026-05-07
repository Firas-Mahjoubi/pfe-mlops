# Production Deployment Runbook — Azure

Step-by-step guide to deploy the MLOps platform on Microsoft Azure.

**Estimated total time:** ~4 hours of active work, spread over 2 days.
**Estimated monthly cost:** ~$68 USD (AKS node $60 + ACR $5 + Public IP $3, Postgres+MinIO run free in-cluster).

---

## Prerequisites Checklist

Before you start, you need:

- [x] An Azure subscription where you have Contributor rights → ✅ **already done** — INSOMEA gave you Contributor on resource group **`RG-FirasMahjoubi`** in **North Europe**
- [ ] A web browser
- [ ] About 4 GB of free RAM on your laptop (for local Docker build steps)
- [ ] Docker Desktop running

> **⚠️ Region note:** the existing RG is in **North Europe** (not North Europe). All resources we create will go in North Europe to keep things in the same region (lower latency, no cross-region charges).

---

## PART 0 — Subscription access ✅ DONE

INSOMEA has given you Contributor rights on resource group **`RG-FirasMahjoubi`** in the `[Sponsorship] [AG C] Intern Subscription` (subscription ID `d7cb835f-ab42-4634-b9e2-6e2eb6279da5`).

Verified by `az network public-ip create` succeeding inside the RG.

---

## PART 1 — Provision Azure resources (Portal, ~30 min)

All steps in the **Azure Portal**, no CLI yet.

### 1.1 — Resource Group ✅ ALREADY EXISTS

Use the existing **`RG-FirasMahjoubi`** in **North Europe**. Don't create a new one.

---

### 1.2 — Create the Container Registry (ACR)

1. Search bar → **"Container registries"** → **"+ Create"**
2. Fill:
   - Subscription: *(yours)*
   - Resource group: **`RG-FirasMahjoubi`**
   - Registry name: **`acrmlopspfedemo`** *(must be globally unique — add digits if taken)*
   - Location: **North Europe**
   - Pricing plan: **Basic** *(~$5/mo)*
3. **"Review + create"** → **"Create"**
4. Wait ~1 min until deployment succeeds
5. Go to the new ACR → **"Settings"** → **"Access keys"** → toggle **"Admin user"** to **Enabled**
6. Note down: **Login server** (e.g. `acrmlopspfedemo.azurecr.io`), **Username**, **password**

**✅ Checkpoint 1.2:** ACR exists, admin enabled. You have the login server name.

---

### 1.3 — Create the AKS cluster

1. Search bar → **"Kubernetes services"** → **"+ Create"** → **"Create a Kubernetes cluster"**
2. **Basics tab:**
   - Subscription: *(yours)*
   - Resource group: **`RG-FirasMahjoubi`**
   - Cluster preset: **"Dev/Test"**
   - Cluster name: **`aks-mlops-pfe`**
   - Region: **North Europe**
   - AKS pricing tier: **Free**
   - Kubernetes version: leave default
3. **Node pools tab:**
   - Click on the existing `agentpool` → **"Update"**
   - Node size: change to **`Standard_B4ms`** (4 vCPU, 16 GB) — search "B4ms" and pick it
   - Scale method: **Manual**
   - Node count: **1**
   - Save
4. **Networking tab:** leave defaults (kubenet, Azure-managed network)
5. **Integrations tab:**
   - Container registry: select **`acrmlopspfedemo`**
   - Container monitoring: **Enabled** (free tier)
6. **"Review + create"** → wait for validation → **"Create"**
7. **Wait 5-10 minutes** for the cluster to provision

**✅ Checkpoint 1.3:** AKS cluster `aks-mlops-pfe` exists, status "Succeeded".

---

### 1.4 + 1.5 — Postgres ❌ SKIPPED — runs in-cluster instead

To save ~$17/mo, Postgres runs as a Pod inside AKS with a PersistentVolumeClaim. Same applies to MinIO — both are stateful in-cluster services. The Helm chart provisions both automatically when you `helm install`.

**Trade-off:** no automatic backups (we'll `pg_dump` to MinIO before defense). Acceptable for demo scale.

You don't need to do anything here. Skip to PART 1.6.

---

### 1.6 — Public IP ❌ SKIPPED — provisioned automatically by NGINX

You don't have permission on the AKS node resource group (`MC_*`) because Azure creates it at subscription scope. Instead, NGINX Ingress will request a Public IP from AKS automatically when we install it (PART 4.1), using a special annotation that also assigns the DNS label `mlops-pfe-demo`.

**Result:** same final URL `https://mlops-pfe-demo.northeurope.cloudapp.azure.com`, no portal step needed, **and you save $3/month** (the IP is bundled with the LoadBalancer cost).

You don't need to do anything here. Skip to PART 2.

---

## PART 2 — Connect to the cluster (Cloud Shell, ~5 min)

Open the **Cloud Shell** in the Azure portal:
- Click the **`>_`** terminal icon at the top of the portal
- Choose **Bash** if it asks
- Wait ~30 seconds for the shell to provision

In the Cloud Shell, run:

```bash
# Set defaults
az account set --subscription "<your-subscription-id>"

# Connect to your AKS cluster
az aks get-credentials -g RG-FirasMahjoubi -n aks-mlops-pfe --overwrite-existing

# Verify
kubectl get nodes
```

You should see your single node, status `Ready`.

```bash
# Verify ACR attachment
kubectl create deployment hello --image=mcr.microsoft.com/dotnet/samples:aspnetapp --dry-run=client -o yaml | head -5
```

**✅ Checkpoint 2:** `kubectl get nodes` shows your AKS node as Ready.

---

## PART 3 — Build & push Docker images (Local laptop, ~15 min)

This part requires Docker Desktop on your laptop.

### 3.1 — Log in to ACR from your laptop

Open a fresh PowerShell on your laptop:

```powershell
# Install Azure CLI if not already done
winget install -e --id Microsoft.AzureCLI

# Login (browser opens)
az login
az account set --subscription "<your-subscription-id>"

# Login Docker to ACR
az acr login --name acrmlopspfedemo
```

### 3.2 — Build & push the backend image

```powershell
cd d:\pfe\backend

docker build -f Dockerfile.prod -t acrmlopspfedemo.azurecr.io/backend:v1 .
docker push acrmlopspfedemo.azurecr.io/backend:v1
```

### 3.3 — Build & push the frontend image

```powershell
cd d:\pfe\frontend

docker build -f Dockerfile.prod -t acrmlopspfedemo.azurecr.io/frontend:v1 .
docker push acrmlopspfedemo.azurecr.io/frontend:v1
```

**✅ Checkpoint 3:** In the Azure portal → ACR → "Repositories" you should see `backend:v1` and `frontend:v1`.

---

## PART 4 — Install cluster dependencies (Cloud Shell, ~20 min)

In the Azure Cloud Shell:

### 4.1 — Install NGINX Ingress Controller

We use the annotation `service.beta.kubernetes.io/azure-dns-label-name` to tell AKS to provision a Public IP **and** attach the DNS label `mlops-pfe-demo` to it. AKS handles all the permissions automatically (its managed identity has the right permissions on the MC_* node resource group, even though you don't).

```bash
# Add the helm repo
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

# Install NGINX Ingress — AKS auto-provisions the Public IP + DNS label
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-dns-label-name"=mlops-pfe-demo

# Wait for the ingress controller to get an external IP (~30 sec)
kubectl get svc -n ingress-nginx -w   # Ctrl+C when EXTERNAL-IP shows an IP

# Verify the FQDN resolves
nslookup mlops-pfe-demo.northeurope.cloudapp.azure.com
```

If the DNS label `mlops-pfe-demo` is already taken in North Europe, change it to something unique like `mlops-pfe-firas` and use that everywhere else in the runbook.

### 4.2 — Install cert-manager (for HTTPS)

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.16.1/cert-manager.yaml

# Wait for cert-manager pods to be Ready
kubectl wait --for=condition=Available deployment --all -n cert-manager --timeout=300s

# Create Let's Encrypt cluster issuer
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: firas.mahjoubi@esprit.tn
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
EOF
```

### 4.3 — Install KServe

```bash
# Install Knative Serving (KServe dependency)
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.16.0/serving-crds.yaml
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.16.0/serving-core.yaml

# Install KServe
kubectl apply -f https://github.com/kserve/kserve/releases/download/v0.13.1/kserve.yaml
kubectl apply -f https://github.com/kserve/kserve/releases/download/v0.13.1/kserve-cluster-resources.yaml

# Fix the broken kube-rbac-proxy image (gcr.io/kubebuilder/kube-rbac-proxy was moved)
kubectl set image deployment/kserve-controller-manager -n kserve \
  kube-rbac-proxy=quay.io/brancz/kube-rbac-proxy:v0.18.0
```

### 4.4 — Install Kubeflow Pipelines

```bash
# Use 2.4.1 — the 2.3.0 manifest references gcr.io images that no longer exist
export PIPELINE_VERSION=2.4.1
kubectl apply -k "github.com/kubeflow/pipelines/manifests/kustomize/cluster-scoped-resources?ref=$PIPELINE_VERSION"
kubectl wait --for condition=established --timeout=60s crd/applications.app.k8s.io
kubectl apply -k "github.com/kubeflow/pipelines/manifests/kustomize/env/platform-agnostic?ref=$PIPELINE_VERSION"

# Fix the bundled MinIO image (gcr.io/ml-pipeline/minio:...license-compliance was removed).
# The same release exists on Docker Hub at minio/minio.
kubectl set image deployment/minio -n kubeflow minio=minio/minio:RELEASE.2019-08-14T20-37-41Z

# After minio is up, restart ml-pipeline so it reconnects
kubectl rollout status deployment/minio -n kubeflow --timeout=120s
kubectl rollout restart deployment/ml-pipeline -n kubeflow
```

### 4.5 — Apply the mlops namespace + KServe SA

```bash
cd ~
git clone https://github.com/<your-github>/pfe.git    # or upload via Cloud Shell
kubectl apply -f pfe/infrastructure/k8s/kserve/mlops-namespace.yaml
```

**✅ Checkpoint 4:** All four pieces installed. `kubectl get pods --all-namespaces` should show ingress-nginx, cert-manager, kserve, kubeflow, knative-serving namespaces with Running pods.

---

## PART 5 — Deploy the MLOps platform (Cloud Shell, ~15 min)

The Helm chart will be at `infrastructure/helm/mlops/` once I build it. For now, the manual route:

### 5.1 — Create the secret with credentials

```bash
JWT_SECRET=$(openssl rand -base64 32)
PG_PASSWORD=$(openssl rand -base64 24)

kubectl create namespace mlops --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic mlops-secrets -n mlops \
  --from-literal=POSTGRES_PASSWORD="$PG_PASSWORD" \
  --from-literal=DATABASE_URL="postgresql+asyncpg://mlops:${PG_PASSWORD}@postgres.mlops.svc.cluster.local:5432/mlops_platform" \
  --from-literal=JWT_SECRET_KEY="$JWT_SECRET" \
  --from-literal=MINIO_ACCESS_KEY="minioadmin" \
  --from-literal=MINIO_SECRET_KEY="minioadmin123"

# Save the generated values somewhere safe — you'll need them for connecting to Postgres later
echo "PG_PASSWORD: $PG_PASSWORD"
echo "JWT_SECRET: $JWT_SECRET"
```

### 5.2 — Deploy the Helm chart

```bash
cd pfe/infrastructure/helm/mlops

helm install mlops . -n mlops \
  --set image.registry=acrmlopspfedemo.azurecr.io \
  --set image.tag=v1 \
  --set ingress.host=mlops-pfe-demo.northeurope.cloudapp.azure.com
```

### 5.3 — Wait for everything to be ready

```bash
kubectl get pods -n mlops -w   # Ctrl+C when all are Running
```

**✅ Checkpoint 5:** All pods Running. `kubectl get ingress -n mlops` shows your hostname.

---

## PART 6 — Verify the deployment

1. Open **`https://mlops-pfe-demo.northeurope.cloudapp.azure.com`** in your browser
2. (May see a cert warning during the first 1-2 minutes while Let's Encrypt issues the certificate — refresh)
3. Sign up with a fresh account
4. Create a project → upload `examples/breast_cancer_custom/train.zip`
5. Trigger training pipeline
6. Wait for FINISHED → see run in Experiments
7. Promote model → Production
8. Click Deploy → choose 1 replica → Deploy
9. Wait ~2 minutes → endpoint URL appears
10. Test prediction → should return JSON response

**✅ Checkpoint 6 (THE BIG ONE):** All 10 steps work. You're in production.

---

## Common problems & fixes

| Problem | Fix |
|---|---|
| `403 ImagePullBackOff` on backend/frontend pods | AKS isn't authenticated to ACR. Run: `az aks update -g RG-FirasMahjoubi -n aks-mlops-pfe --attach-acr acrmlopspfedemo` |
| Ingress IP stuck at `<pending>` | The static IP must be in the AKS *node resource group* (the `MC_*` one), not `RG-FirasMahjoubi`. Re-create. |
| Postgres connection refused | Add the AKS outbound IP to Postgres firewall rules in the portal |
| Let's Encrypt cert keeps failing | Use `letsencrypt-staging` issuer first to test; switch to `letsencrypt-prod` once HTTP-01 challenge succeeds |
| KServe webhook timeout | Patch failurePolicy: `kubectl patch validatingwebhookconfigurations inferenceservice.serving.kserve.io --type='json' -p='[{"op":"replace","path":"/webhooks/0/failurePolicy","value":"Ignore"}]'` |
| Pod stuck `Pending` (Insufficient memory) | You picked a node too small. Resize the node pool to `Standard_B8ms` from the AKS portal |

---

## When you're done with the demo

To stop paying immediately:

```bash
# Just delete the resource group — kills everything
az group delete -g RG-FirasMahjoubi --yes --no-wait
```

(Don't delete it before defense day!)
