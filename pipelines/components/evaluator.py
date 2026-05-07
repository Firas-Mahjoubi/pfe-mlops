from kfp import dsl
from kfp.dsl import Input, Output, Dataset, Model, Metrics


@dsl.component(
    base_image="python:3.11-slim",
    packages_to_install=[
        "scikit-learn==1.5.2",
        "mlflow==2.11.0",
        "boto3==1.35.81",
        "pandas==2.2.3",
        "joblib==1.4.2",
    ],
)
def evaluate_and_register(
    test_data: Input[Dataset],
    model_input: Input[Model],
    mlflow_tracking_uri: str,
    mlflow_experiment_id: str,
    mlflow_run_id: str,
    model_name: str,
    minio_endpoint: str,
    minio_access_key: str,
    minio_secret_key: str,
    accuracy_threshold: float = 0.7,
) -> str:
    """Evaluate model and register in MLflow if above threshold. Returns registration status."""
    import os
    import joblib
    import pandas as pd
    import mlflow
    from mlflow.tracking import MlflowClient

    os.environ["MLFLOW_S3_ENDPOINT_URL"] = f"http://{minio_endpoint}"
    os.environ["AWS_ACCESS_KEY_ID"] = minio_access_key
    os.environ["AWS_SECRET_ACCESS_KEY"] = minio_secret_key

    mlflow.set_tracking_uri(mlflow_tracking_uri)
    client = MlflowClient()

    run = client.get_run(mlflow_run_id)
    accuracy = float(run.data.metrics.get("accuracy", 0))

    print(f"Run {mlflow_run_id} accuracy: {accuracy:.4f}")
    print(f"Threshold: {accuracy_threshold}")

    if accuracy >= accuracy_threshold:
        model_uri = f"runs:/{mlflow_run_id}/model"
        result = mlflow.register_model(model_uri, model_name)
        print(f"Model registered: {model_name} v{result.version}")
        return f"registered:{model_name}:v{result.version}"
    else:
        print(f"Accuracy {accuracy:.4f} below threshold {accuracy_threshold}. Model not registered.")
        return "not_registered"
