# MLOps Platform
# KFP API (required for pipeline triggering)
kubectl port-forward -n kubeflow svc/ml-pipeline 8080:8888 &

# KFP UI (optional, to watch pipeline runs)
kubectl port-forward -n kubeflow svc/ml-pipeline-ui 8081:80 &
