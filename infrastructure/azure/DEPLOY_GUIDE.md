# Deploy Guide — GitHub Actions → AKS

> This is the **automated** path: `git push origin main` → production.
> For first-time **manual provisioning** (creating ACR / AKS / cluster
> add-ons), follow [RUNBOOK.md](RUNBOOK.md) instead. That one is run once.
> This guide is what you live with afterwards.

---

## Mental model — what runs where

```
┌────────────────┐   git push    ┌──────────────────┐
│ Your laptop    │ ────────────▶ │  GitHub          │
└────────────────┘               └────────┬─────────┘
                                          │ trigger
                                          ▼
                                ┌──────────────────────────┐
                                │ GitHub Actions runner    │
                                │ (.github/workflows/      │
                                │   deploy.yml)            │
                                └────┬─────────────┬───────┘
                                     │             │
                                     │             │
                  docker push ◀──────┘             └─────▶ helm upgrade
                        │                                       │
                        ▼                                       ▼
              ┌─────────────────┐                    ┌─────────────────┐
              │ Azure ACR       │                    │ Azure AKS       │
              │ (image storage) │ ◀── pods pull ──── │ (your platform) │
              └─────────────────┘                    └─────────────────┘
```

There are **three trust boundaries** with their own credentials. Each
credential has the minimum scope it needs:

| Credential | Where stored | What it can do | Cannot do |
|---|---|---|---|
| `KUBE_CONFIG` (admin kubeconfig, base64-encoded) | GitHub repo secret | `kubectl` + `helm` against `aks-mlops-pfe` | Touch Azure resources (only the cluster) |
| `ACR_USERNAME` + `ACR_PASSWORD` | GitHub repo secret | Push images to `acrmlopspfedemo` | Anything else |
| `acr-pull-secret` (Kubernetes Secret in `mlops` namespace) | inside AKS | AKS pulls images from ACR | Push images, touch other namespaces |

> **Why kubeconfig instead of an Azure service principal?**
> Service principals require role assignments (`Microsoft.Authorization/roleAssignments/write`), which need Owner or User Access Administrator scope. The INSOMEA subscription gives you Contributor only, so `az ad sp create-for-rbac` fails. The kubeconfig path bypasses Azure entirely — it talks directly to the cluster's K8s API using certificate auth and works fine with Contributor.

GitHub Actions never sees the cluster pull credential. AKS never sees the GitHub credential. Each does one job.

---

## One-time setup (Parts B + C of the plan)

Done once. After this, every code change deploys with a `git push`.

### Step 1 — Provision AKS + ACR + cluster add-ons

Follow [RUNBOOK.md](RUNBOOK.md) **PART 1** end-to-end to recreate:
- Container Registry `acrmlopspfedemo`
- AKS cluster `aks-mlops-pfe` (Standard_B4ms, 1 node)
- NGINX Ingress with DNS label `mlops-pfe-demo`
- cert-manager + Let's Encrypt ClusterIssuer
- KServe + Knative serving
- Kubeflow Pipelines (with the image patches noted in PART 4 of the runbook)
- The `mlops` namespace + `kserve-sa` ServiceAccount + `minio-s3-creds` Secret

**Stop at PART 5.** The runbook's PART 5 is `helm install` by hand — we want GitHub Actions doing that now instead.

### Step 2 — Enable ACR admin user

The ACR admin user is the simplest authentication path that works with your
scoped Contributor role. Both GitHub Actions (to push) and AKS (to pull) use
it.

**Portal:** `acrmlopspfedemo` → **Settings → Access keys** → toggle **Admin
user** to **Enabled**. The Username and `password` fields populate; you'll
copy them in Step 4.

### Step 3 — Create the AKS-side pull secret

Open Azure Cloud Shell once (the `>_` icon at the top of the portal):

```bash
ACR_USER=$(az acr credential show -n acrmlopspfedemo --query username -o tsv)
ACR_PASS=$(az acr credential show -n acrmlopspfedemo --query "passwords[0].value" -o tsv)

# Ensure the namespace exists
kubectl create namespace mlops --dry-run=client -o yaml | kubectl apply -f -

# The Helm chart's values.yaml references this exact name: imagePullSecret: acr-pull-secret
kubectl create secret docker-registry acr-pull-secret \
  --docker-server=acrmlopspfedemo.azurecr.io \
  --docker-username="$ACR_USER" \
  --docker-password="$ACR_PASS" \
  -n mlops \
  --dry-run=client -o yaml | kubectl apply -f -
```

The `--dry-run=client -o yaml | kubectl apply -f -` trick makes both lines
idempotent — safe to re-run any time.

### Step 4 — Capture the AKS admin kubeconfig

GitHub Actions uses this to talk to the cluster. Certificate-based auth, no
Azure AD tokens involved.

In PowerShell (on a machine that already has `az login` working):

```powershell
# Pull the admin credentials into a tempfile
az aks get-credentials -g RG-FirasMahjoubi -n aks-mlops-pfe --admin --file kc-admin

# Base64-encode it (one line) for the GitHub secret
[Convert]::ToBase64String([IO.File]::ReadAllBytes("kc-admin"))

# Print the result above ↑ — copy the whole single-line base64 string
# Then delete the local copy
Remove-Item kc-admin
```

(On macOS/Linux: `base64 -w0 kc-admin` after the same `az aks get-credentials`.)

### Step 5 — Add three GitHub repo secrets

On GitHub: your repo → **Settings → Secrets and variables → Actions → New repository secret**. Add three:

| Name | Value |
|---|---|
| `KUBE_CONFIG` | The base64 string from Step 4 (one long line, no whitespace) |
| `ACR_USERNAME` | The Username field from ACR → Access keys (it's `acrmlopspfedemo`) |
| `ACR_PASSWORD` | The password1 field from ACR → Access keys |

Confirm: **Settings → Secrets → Actions** lists all three. The values are now
write-only — even you can't read them back.

### Step 6 — Confirm the workflow file is on `main`

The workflow lives at [.github/workflows/deploy.yml](../../.github/workflows/deploy.yml). It should already be in the repo. Verify:

```powershell
git ls-files .github/workflows/deploy.yml
```

If it shows the file, you're done with one-time setup. If not, commit + push.

---

## The daily loop (Part E)

```
1. edit code
2. git commit -m "..."
3. git push
4. open GitHub → Actions tab → watch
5. ~5-8 minutes later, refresh the live URL
```

That's it. No `kubectl apply`, no `helm install`, no SSH, no remembering
which Docker tag to use.

### What the runner does (≈ 6 minutes)

| Step | ~Time | What you see in the Actions log |
|---|---|---|
| Checkout | 5 s | `Switched to a new branch '...'` |
| ACR docker login | 5 s | `Login Succeeded` |
| Build & push backend | 1-3 min | layer pushes; cached after first run |
| Build & push frontend | 1-3 min | Angular build then nginx layer |
| Azure login | 5 s | `Login successful` |
| Set AKS context | 5 s | `Merged "aks-mlops-pfe" as current context` |
| Setup Helm | 10 s | Downloads helm 3.16 |
| Helm upgrade | 1-3 min | `Release "mlops" has been upgraded.` |
| Post-deploy status | 5 s | List of pods + their currently-running image tags |

If the timeline goes over 10 min, something's caching badly — paste the log
output and we'll dig.

---

## Verification after each deploy

```bash
# In Cloud Shell, after the GH run goes green:

# 1. The pods are running the NEW image (sha matches your latest commit)
kubectl get pods -n mlops -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[0].image}{"\n"}{end}'

# 2. Helm has a new release revision
helm history mlops -n mlops

# 3. The public URL responds
curl -sI https://mlops-pfe-demo.northeurope.cloudapp.azure.com/ | head -3
```

---

## Rollback (when a deploy breaks the world)

You don't have to revert a commit and wait for another build. Helm keeps
every successful deploy as a revision; you can flip back in seconds:

```bash
# See the history
helm history mlops -n mlops
# Roll back to a specific revision number (5 in this example)
helm rollback mlops 5 -n mlops --wait
```

Once you're back online, debug at leisure on a branch, push the fix to
`main`, and let the workflow ship it.

---

## Troubleshooting

| Symptom | Most likely cause | Fix |
|---|---|---|
| Workflow fails at "ACR docker login" with 401 | `ACR_PASSWORD` is wrong or expired | Regenerate from portal: ACR → Access keys → "Regenerate password1", update the secret |
| Workflow fails at "Set up kubectl" with `error: You must be logged in to the server` | Cluster was recreated → kubeconfig stale | Re-run Step 4 to regenerate the kubeconfig and update the `KUBE_CONFIG` secret |
| Workflow fails at "Set up kubectl" with `base64: invalid input` | The `KUBE_CONFIG` secret got line-wrapped during paste | Re-run Step 4 making sure the output is a single unbroken line; replace the secret |
| `helm upgrade` succeeds but pods stay `ImagePullBackOff` | `acr-pull-secret` missing or wrong | Re-run Step 3 of one-time setup; `kubectl describe pod <name> -n mlops` shows the registry error |
| `helm upgrade` fails with `--wait timeout` | Pods crashing on a real bug | `kubectl logs -n mlops <pod>` to find the error; fix and push; or `helm rollback` for safety |
| Workflow is queued forever | GH Actions usage limits or the runner type is restricted | Check repo Settings → Actions → Runners; free tier has 2000 min/month |

---

## Cost notes

GitHub Actions on a public repo: free. On a private repo: 2000 min/month
free, then $0.008/min. Each deploy uses ~6 min → ~333 deploys/month free.

Azure costs after this guide is followed:

| Resource | ~$/mo |
|---|---|
| AKS Free control plane + 1× Standard_B4ms node | 60 |
| ACR Basic + image storage | 5 |
| LoadBalancer Public IP (auto-provisioned by NGINX ingress) | 3 |
| Egress (very low for demo traffic) | 1 |
| **Total** | **~$69** |

---

## Out of scope (defer until after PFE)

- Multi-environment (staging + prod): would need 2 namespaces + tag-based promotion
- Test job before deploy: when you add pytest, drop in a `test:` job and add `needs: test` on `deploy`
- PR previews: ephemeral namespace per PR, teardown on close
- OIDC-based auth (passwordless Azure login): needs `Microsoft.Authorization/roleAssignments/write` which your Contributor scope doesn't grant
