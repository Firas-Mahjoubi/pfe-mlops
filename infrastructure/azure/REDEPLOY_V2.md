# Redeploy to the V2 subscription

The old subscription was disabled. This is how the platform is rebuilt on
**`[Sponsorship] [AG C] Intern Subscription V2`** (`6850d94e-3234-463d-aa51-615d3c486939`).
On V2 you are **Owner** of `RG-FirasMahjoubi` (North Europe), so the old Contributor-only
workarounds in `RUNBOOK.md` no longer apply — `--attach-acr` and everything else just works.

## What changes vs. the old deployment
| | Old | V2 |
|---|---|---|
| Subscription | `d7cb835f-…` (disabled) | `6850d94e-…` (Owner) |
| Resource group / region | RG-FirasMahjoubi / northeurope | **same** (already exists in V2) |
| ACR | `acrmlopspfedemo` | **`acrmlopspfedemov2`** (old name is globally taken) |
| AKS | aks-mlops-pfe | same name, new cluster (`Standard_B4s_v2`, 1 node) |
| Public URL | mlops.firasmahjoubi.app | **same** (same Cloudflare tunnel) |
| Data (DB/artifacts) | in old cluster PVCs | **not migrated** — starts empty |

The only committed code change is the registry name, already applied in
`.github/workflows/deploy.yml` and `infrastructure/helm/mlops/values.yaml`
(`acrmlopspfedemo` → `acrmlopspfedemov2`).

## Step 1 — Provision + first deploy (one script)
From the repo root, in local PowerShell:
```powershell
az login                                   # V2 is in the same tenant
./infrastructure/azure/redeploy-v2.ps1     # ~15-20 min (AKS create is the slow part)
```
The script is idempotent. It creates the ACR + AKS, installs the cluster add-ons
(KServe 0.13.1 + Knative 1.16 with the RawDeployment / rbac-proxy / webhook fixes;
Kubeflow Pipelines 2.4.1 with the MinIO + workflow-controller fixes), applies the
`mlops` namespace + `kserve-sa` + `minio-s3-creds`, creates `mlops-secrets` and
`acr-pull-secret`, builds the backend + frontend images **in ACR** (no Docker Desktop),
`helm install`s the platform, and prints the three GitHub-secret values at the end.

> metrics-server ships with AKS, so the dashboard/Monitoring CPU-RAM panels work with no
> extra install. NGINX ingress + cert-manager are **off by default** (the Cloudflare tunnel
> is the real ingress and predictions proxy through the K8s API); set `$INSTALL_NGINX = $true`
> in the script only if you want the Azure `cloudapp.azure.com` URL too.

## Step 2 — Bring the public URL back (same tunnel)
The Cloudflare tunnel lives on your Cloudflare account, not Azure — reuse it. In Cloudflare
Zero Trust → Networks → Tunnels → `mlops-pfe`, the tunnel target is already
`frontend.mlops.svc.cluster.local:80`, identical in the new cluster, so **no dashboard or DNS
changes are needed** — only recreate the token secret and re-apply the manifest:
```powershell
kubectl create secret generic cloudflared-token -n mlops --from-literal=token='<YOUR TUNNEL TOKEN>'
kubectl apply -f infrastructure/k8s/cloudflared/named-tunnel.yaml
```
`https://mlops.firasmahjoubi.app` is back online within a minute.
(If you no longer have the token: Cloudflare dashboard → the `mlops-pfe` tunnel → Configure →
refresh/copy the install token.)

## Step 3 — Restore CI/CD (so `git push` deploys again)
1. GitHub → repo → Settings → Secrets and variables → Actions → update:
   - `ACR_USERNAME` = `acrmlopspfedemov2`
   - `ACR_PASSWORD` = the ACR password the script printed
   - `KUBE_CONFIG`  = the base64 admin kubeconfig the script printed (one unbroken line)
2. Commit + push the edited `deploy.yml` + `values.yaml`. From then on every push builds into
   `acrmlopspfedemov2` and `helm upgrade`s the cluster, exactly as before.

## Verify
```powershell
kubectl get pods -n mlops                      # all Running
az acr repository list -n acrmlopspfedemov2     # backend, frontend
curl.exe -sI https://mlops.firasmahjoubi.app/   # HTTP/2 200
```
Then the end-to-end smoke test: sign up → new project → upload + train → deploy a model →
predict.

## Notes
- **Fresh data:** users/projects/models from the old cluster are not carried over (old sub is
  disabled; its PVCs are gone). You start with an empty platform.
- **Cost:** ~$69/mo (AKS B4s_v2 node ~$60 + ACR Basic ~$5 + egress). Delete everything with
  `az group delete -g RG-FirasMahjoubi --subscription 6850d94e-3234-463d-aa51-615d3c486939 --yes`
  when the demo is over (not before defense day).
