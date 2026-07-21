<#
  redeploy-v2.ps1 - rebuild the whole MLOps platform on the V2 Azure subscription.

  WHY: the old subscription ([Sponsorship] [AG C] Intern Subscription) was disabled.
  INSOMEA provided V2, where you are OWNER on resource group RG-FirasMahjoubi
  (North Europe). The old ACR name `acrmlopspfedemo` is globally taken, so V2 uses a
  new registry `acrmlopspfedemov2`. Everything else (RG, AKS name, region, the public
  URL mlops.firasmahjoubi.app on the same Cloudflare tunnel) is unchanged.

  This script is IDEMPOTENT - safe to re-run; each step is skipped if already done.

  RUN IT (local PowerShell, from the repo root d:\pfe):
      az login                       # sign in; V2 is in the same tenant
      ./infrastructure/azure/redeploy-v2.ps1

  It does NOT touch: your GitHub repo secrets or the Cloudflare token - those are
  manual steps printed at the end (see REDEPLOY_V2.md).

  Prereqs: Azure CLI, kubectl, helm on PATH. No Docker Desktop needed - images are
  built server-side with `az acr build`.
#>

# We check exit codes explicitly rather than letting native-command stderr (e.g.
# az's harmless "not found" during idempotency checks) abort the run.
$ErrorActionPreference = 'Continue'

# Force UTF-8 for the Python-based Azure CLI so streaming build logs (which can
# contain non-ASCII chars) don't crash it with a cp1252 charmap error on Windows.
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# ── Constants (V2) ───────────────────────────────────────────────────────────
$SUBSCRIPTION = '6850d94e-3234-463d-aa51-615d3c486939'   # [Sponsorship] [AG C] Intern Subscription V2
$RG           = 'RG-FirasMahjoubi'
$LOCATION     = 'northeurope'
$ACR          = 'acrmlopspfedemov2'
$ACR_LOGIN    = "$ACR.azurecr.io"
$AKS          = 'aks-mlops-pfe'
# V2 enforces an Azure Policy allow-list of VM SKUs (no B/D/E general-purpose),
# AND the DCasv6 confidential family has 0 vCPU quota. Standard_EC4as_v5
# (4 vCPU / 32 GB, AMD confidential, memory-optimized) is both allowed by the
# policy and has full quota (ECASv5 family: 0/65) — comfortably runs the stack.
$NODE_SIZE    = 'Standard_EC4as_v5'
$NS           = 'mlops'
$IMAGE_TAG    = 'v1'

# Optional: install NGINX ingress + cert-manager (the Cloudflare tunnel is the real
# ingress, so these are OFF by default - saves a ~$3/mo LoadBalancer IP).
$INSTALL_NGINX = $false

# Repo root = two levels up from this script (infrastructure/azure/..)
$REPO = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Write-Host "Repo root: $REPO" -ForegroundColor DarkGray

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Die($msg)  { Write-Host "`nFAILED: $msg" -ForegroundColor Red; exit 1 }
# Throw if the last native command failed (used after critical steps only).
function MustSucceed($what) { if ($LASTEXITCODE -ne 0) { Die "$what (exit $LASTEXITCODE)" } }

# ── 1. Target the V2 subscription ────────────────────────────────────────────
Step "Selecting subscription V2"
az account set --subscription $SUBSCRIPTION
MustSucceed "az account set"
az account show --query "{name:name,id:id}" -o table

# ── 2. Container Registry ────────────────────────────────────────────────────
Step "Ensuring ACR $ACR"
az acr show -n $ACR -g $RG -o none 2>$null
if ($LASTEXITCODE -ne 0) {
    az acr create -n $ACR -g $RG --sku Basic --admin-enabled true --location $LOCATION -o none
    MustSucceed "az acr create"
    Write-Host "ACR created." -ForegroundColor Green
} else { Write-Host "ACR already exists." -ForegroundColor Green }

# ── 3. AKS cluster (attach-acr works because you're Owner on V2) ──────────────
Step "Ensuring AKS $AKS (first create takes ~5-10 min)"
az aks show -n $AKS -g $RG -o none 2>$null
if ($LASTEXITCODE -ne 0) {
    az aks create -g $RG -n $AKS `
        --node-count 1 --node-vm-size $NODE_SIZE `
        --tier free --generate-ssh-keys `
        --attach-acr $ACR --location $LOCATION -o none
    MustSucceed "az aks create"
    Write-Host "AKS created." -ForegroundColor Green
} else {
    Write-Host "AKS already exists; ensuring ACR is attached." -ForegroundColor Green
    az aks update -g $RG -n $AKS --attach-acr $ACR -o none 2>$null
}

Step "Fetching cluster credentials"
az aks get-credentials -g $RG -n $AKS --overwrite-existing
MustSucceed "az aks get-credentials"
kubectl get nodes
MustSucceed "kubectl get nodes (cluster reachable?)"

# ── 4. Cluster add-ons ───────────────────────────────────────────────────────
# cert-manager is a HARD dependency of KServe: kserve.yaml declares a Certificate
# + Issuer (cert-manager.io/v1) for its admission webhook's serving cert. Install
# it (and wait until Ready) BEFORE applying KServe, regardless of NGINX.
Step "Installing cert-manager (required by KServe webhooks)"
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.16.1/cert-manager.yaml
MustSucceed "apply cert-manager"
kubectl wait --for=condition=Available deployment --all -n cert-manager --timeout=300s

# NGINX ingress is the only truly-optional add-on (the Cloudflare tunnel is the
# real ingress and predictions proxy through the K8s API). Off by default.
if ($INSTALL_NGINX) {
    Step "Installing NGINX ingress (optional public-IP path)"
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx 2>$null
    helm repo update | Out-Null
    helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx `
        --namespace ingress-nginx --create-namespace `
        --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-dns-label-name"=mlops-pfe-demo
}

Step "Installing Knative Serving"
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.16.0/serving-crds.yaml
MustSucceed "apply knative serving-crds"
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.16.0/serving-core.yaml

Step "Installing KServe 0.13.1 (controller + CRDs)"
kubectl apply -f https://github.com/kserve/kserve/releases/download/v0.13.1/kserve.yaml
MustSucceed "apply kserve.yaml"

Step "Applying KServe fixes, then waiting for its webhook to be ready"
# Fix the broken rbac-proxy sidecar image so the controller pod can reach Ready
# (its Service backs the admission webhook - no Ready pod = no webhook endpoints).
kubectl set image deployment/kserve-controller-manager -n kserve `
    kube-rbac-proxy=quay.io/brancz/kube-rbac-proxy:v0.18.0 2>$null
# Default InferenceServices to RawDeployment (no Istio/Kourier installed).
kubectl patch cm inferenceservice-config -n kserve --type=merge `
    -p '{"data":{"deploy":"{\"defaultDeploymentMode\":\"RawDeployment\"}"}}' 2>$null
# Make every KServe validating webhook non-blocking so applies (e.g. the cluster
# resources below) never fail while the webhook endpoint is briefly unavailable.
foreach ($w in @('clusterservingruntime','inferencegraph','inferenceservice','servingruntime','trainedmodel')) {
    kubectl patch validatingwebhookconfigurations "$w.serving.kserve.io" `
        --type='json' -p='[{"op":"replace","path":"/webhooks/0/failurePolicy","value":"Ignore"}]' 2>$null
}
# Wait until the controller (and thus the webhook endpoints) is actually up.
kubectl rollout status deployment/kserve-controller-manager -n kserve --timeout=240s 2>$null

Step "Installing KServe cluster resources (serving runtimes)"
kubectl apply -f https://github.com/kserve/kserve/releases/download/v0.13.1/kserve-cluster-resources.yaml
MustSucceed "apply kserve-cluster-resources"

Step "Installing Kubeflow Pipelines 2.4.1"
$PIPE = '2.4.1'
kubectl apply -k "github.com/kubeflow/pipelines/manifests/kustomize/cluster-scoped-resources?ref=$PIPE"
MustSucceed "apply kubeflow cluster-scoped-resources"
kubectl wait --for condition=established --timeout=60s crd/applications.app.k8s.io
kubectl apply -k "github.com/kubeflow/pipelines/manifests/kustomize/env/platform-agnostic?ref=$PIPE"
MustSucceed "apply kubeflow platform-agnostic"

Step "Applying Kubeflow image fixes (minio + workflow-controller executor)"
kubectl set image deployment/minio -n kubeflow minio=minio/minio:RELEASE.2019-08-14T20-37-41Z 2>$null
kubectl rollout status deployment/minio -n kubeflow --timeout=180s 2>$null
kubectl rollout restart deployment/ml-pipeline -n kubeflow 2>$null
kubectl patch deploy workflow-controller -n kubeflow --type=json -p `
    '[{"op":"replace","path":"/spec/template/spec/containers/0/args","value":["--configmap","workflow-controller-configmap","--executor-image","quay.io/argoproj/argoexec:v3.4.17","--namespaced"]}]' 2>$null
kubectl rollout status deploy/workflow-controller -n kubeflow --timeout=180s 2>$null

# ── 5. mlops namespace + kserve-sa + minio-s3-creds ──────────────────────────
Step "Creating mlops namespace, kserve-sa, minio-s3-creds"
kubectl apply -f "$REPO/infrastructure/k8s/kserve/mlops-namespace.yaml"
MustSucceed "apply mlops-namespace.yaml"

# ── 6. Platform secrets ──────────────────────────────────────────────────────
Step "Creating mlops-secrets (fresh random creds) + acr-pull-secret"
# Alphanumeric only - URL-reserved chars would break DATABASE_URL parsing.
$PG_PASSWORD = -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
$JWT_SECRET  = -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
$DB_URL = "postgresql+asyncpg://mlops:$PG_PASSWORD@postgres.mlops.svc.cluster.local:5432/mlops_platform"

kubectl create secret generic mlops-secrets -n $NS `
    --from-literal=POSTGRES_PASSWORD="$PG_PASSWORD" `
    --from-literal=DATABASE_URL="$DB_URL" `
    --from-literal=JWT_SECRET_KEY="$JWT_SECRET" `
    --from-literal=MINIO_ACCESS_KEY="minioadmin" `
    --from-literal=MINIO_SECRET_KEY="minioadmin123" `
    --dry-run=client -o yaml | kubectl apply -f -
MustSucceed "create mlops-secrets"

$ACR_USER = az acr credential show -n $ACR --query username -o tsv
$ACR_PASS = az acr credential show -n $ACR --query "passwords[0].value" -o tsv
MustSucceed "az acr credential show"
kubectl create secret docker-registry acr-pull-secret -n $NS `
    --docker-server="$ACR_LOGIN" `
    --docker-username="$ACR_USER" `
    --docker-password="$ACR_PASS" `
    --dry-run=client -o yaml | kubectl apply -f -
MustSucceed "create acr-pull-secret"

# ── 7. Build images server-side (no Docker Desktop) ──────────────────────────
# Redirect az acr build output to a file: the streamed build log contains
# non-ASCII chars that crash colorama when written to a cp1252 Windows console
# (UnicodeEncodeError). Writing to a file makes stdout non-tty, so colorama
# skips the win32 conversion and the build streams cleanly.
Step "Building backend image in ACR (log -> acr-build-backend.log)"
$bLog = Join-Path $env:TEMP 'acr-build-backend.log'
az acr build -r $ACR -t "backend:$IMAGE_TAG" -t "backend:latest" -f "$REPO/backend/Dockerfile.prod" "$REPO/backend" *> $bLog
if ($LASTEXITCODE -ne 0) { Write-Host (Get-Content $bLog -Tail 25 -ErrorAction SilentlyContinue); Die "az acr build backend (see $bLog)" }
Write-Host "backend image built." -ForegroundColor Green

Step "Building frontend image in ACR (log -> acr-build-frontend.log)"
$fLog = Join-Path $env:TEMP 'acr-build-frontend.log'
az acr build -r $ACR -t "frontend:$IMAGE_TAG" -t "frontend:latest" -f "$REPO/frontend/Dockerfile.prod" "$REPO/frontend" *> $fLog
if ($LASTEXITCODE -ne 0) { Write-Host (Get-Content $fLog -Tail 25 -ErrorAction SilentlyContinue); Die "az acr build frontend (see $fLog)" }
Write-Host "frontend image built." -ForegroundColor Green

# ── 8. Deploy the platform ───────────────────────────────────────────────────
Step "helm upgrade --install mlops"
helm upgrade --install mlops "$REPO/infrastructure/helm/mlops" -n $NS `
    --set image.registry=$ACR_LOGIN `
    --set image.tag=$IMAGE_TAG `
    --wait --timeout 10m
MustSucceed "helm upgrade"

kubectl get pods -n $NS

# ── 9. Capture the admin kubeconfig for the GitHub secret ────────────────────
Step "Capturing admin kubeconfig (for KUBE_CONFIG GitHub secret)"
$tmp = New-TemporaryFile
az aks get-credentials -g $RG -n $AKS --admin --file $tmp.FullName --overwrite-existing | Out-Null
$KUBECONFIG_B64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($tmp.FullName))
Remove-Item $tmp.FullName -Force

# ── 10. What YOU still have to do (manual) ───────────────────────────────────
Write-Host "`n==================== DONE - platform deployed ====================" -ForegroundColor Green
Write-Host ""
Write-Host "NEXT (manual - I can't do these for you):" -ForegroundColor Yellow
Write-Host ""
Write-Host "1) Bring the public URL back (same Cloudflare tunnel, same token):" -ForegroundColor Yellow
Write-Host "     kubectl create secret generic cloudflared-token -n $NS --from-literal=token='<YOUR TUNNEL TOKEN>'" -ForegroundColor Yellow
Write-Host "     kubectl apply -f `"$REPO/infrastructure/k8s/cloudflared/named-tunnel.yaml`"" -ForegroundColor Yellow
Write-Host "   -> https://mlops.firasmahjoubi.app comes back online (no DNS changes)." -ForegroundColor Yellow
Write-Host ""
Write-Host "2) Update the 3 GitHub repo secrets (Settings -> Secrets and variables -> Actions):" -ForegroundColor Yellow
Write-Host "     ACR_USERNAME = $ACR_USER" -ForegroundColor Yellow
Write-Host "     ACR_PASSWORD = (printed below)" -ForegroundColor Yellow
Write-Host "     KUBE_CONFIG  = (base64 admin kubeconfig, printed below)" -ForegroundColor Yellow
Write-Host ""
Write-Host "3) Commit + push the edited deploy.yml + values.yaml so future 'git push'" -ForegroundColor Yellow
Write-Host "   deploys target acrmlopspfedemov2." -ForegroundColor Yellow
Write-Host ""
Write-Host "Saved credentials for the new DB (store in a password manager):" -ForegroundColor Yellow
Write-Host "     POSTGRES_PASSWORD = $PG_PASSWORD" -ForegroundColor Yellow
Write-Host "     JWT_SECRET_KEY    = $JWT_SECRET" -ForegroundColor Yellow
Write-Host ""
Write-Host "------- GitHub secret values (copy locally; do NOT paste into chat) -------" -ForegroundColor Yellow
Write-Host "ACR_USERNAME:" -ForegroundColor Yellow
Write-Host "$ACR_USER"
Write-Host ""
Write-Host "ACR_PASSWORD:" -ForegroundColor Yellow
Write-Host "$ACR_PASS"
Write-Host ""
Write-Host "KUBE_CONFIG (one line):" -ForegroundColor Yellow
Write-Host "$KUBECONFIG_B64"
Write-Host "--------------------------------------------------------------------------" -ForegroundColor Yellow
