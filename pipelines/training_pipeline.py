"""Built-in sklearn training pipeline for the MLOps platform."""

from kfp import dsl

from components.data_loader import load_data
from components.preprocessor import preprocess_data
from components.trainer import train_model
from components.evaluator import evaluate_and_register


@dsl.pipeline(
    name="sklearn-training-pipeline",
    description="End-to-end sklearn model training: load data, preprocess, train, evaluate, register",
)
def training_pipeline(
    dataset_name: str = "iris",
    model_type: str = "RandomForestClassifier",
    n_estimators: int = 100,
    max_depth: int = 10,
    test_size: float = 0.2,
    accuracy_threshold: float = 0.7,
    mlflow_tracking_uri: str = "http://mlflow.default.svc.cluster.local:5000",
    mlflow_experiment_id: str = "1",
    model_name: str = "sklearn-model",
    minio_endpoint: str = "minio.default.svc.cluster.local:9000",
    minio_access_key: str = "minioadmin",
    minio_secret_key: str = "minioadmin123",
):
    load_task = load_data(
        dataset_name=dataset_name,
        test_size=test_size,
    )

    preprocess_task = preprocess_data(
        raw_data=load_task.outputs["dataset_output"],
        test_size=test_size,
    )

    train_task = train_model(
        train_data=preprocess_task.outputs["train_data"],
        test_data=preprocess_task.outputs["test_data"],
        mlflow_tracking_uri=mlflow_tracking_uri,
        mlflow_experiment_id=mlflow_experiment_id,
        minio_endpoint=minio_endpoint,
        minio_access_key=minio_access_key,
        minio_secret_key=minio_secret_key,
        model_type=model_type,
        n_estimators=n_estimators,
        max_depth=max_depth,
    )

    evaluate_and_register(
        test_data=preprocess_task.outputs["test_data"],
        model_input=train_task.outputs["model_output"],
        mlflow_tracking_uri=mlflow_tracking_uri,
        mlflow_experiment_id=mlflow_experiment_id,
        mlflow_run_id=train_task.output,
        model_name=model_name,
        minio_endpoint=minio_endpoint,
        minio_access_key=minio_access_key,
        minio_secret_key=minio_secret_key,
        accuracy_threshold=accuracy_threshold,
    )


if __name__ == "__main__":
    from kfp.compiler import Compiler

    Compiler().compile(training_pipeline, "training_pipeline.yaml")
    print("Pipeline compiled to training_pipeline.yaml")
