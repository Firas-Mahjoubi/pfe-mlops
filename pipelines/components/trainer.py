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
def train_model(
    train_data: Input[Dataset],
    test_data: Input[Dataset],
    model_output: Output[Model],
    metrics_output: Output[Metrics],
    mlflow_tracking_uri: str,
    mlflow_experiment_id: str,
    minio_endpoint: str,
    minio_access_key: str,
    minio_secret_key: str,
    model_type: str = "RandomForestClassifier",
    n_estimators: int = 100,
    max_depth: int = 10,
    random_state: int = 42,
) -> str:
    """Train a sklearn model and log to MLflow. Returns the MLflow run_id."""
    import os
    import json
    import joblib
    import pandas as pd
    import mlflow
    from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.svm import SVC
    from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score

    os.environ["MLFLOW_S3_ENDPOINT_URL"] = f"http://{minio_endpoint}"
    os.environ["AWS_ACCESS_KEY_ID"] = minio_access_key
    os.environ["AWS_SECRET_ACCESS_KEY"] = minio_secret_key

    mlflow.set_tracking_uri(mlflow_tracking_uri)
    mlflow.set_experiment(experiment_id=mlflow_experiment_id)

    train_df = pd.read_csv(train_data.path)
    test_df = pd.read_csv(test_data.path)

    X_train = train_df.drop("target", axis=1)
    y_train = train_df["target"]
    X_test = test_df.drop("target", axis=1)
    y_test = test_df["target"]

    models = {
        "RandomForestClassifier": RandomForestClassifier(
            n_estimators=n_estimators, max_depth=max_depth, random_state=random_state
        ),
        "GradientBoostingClassifier": GradientBoostingClassifier(
            n_estimators=n_estimators, max_depth=max_depth, random_state=random_state
        ),
        "LogisticRegression": LogisticRegression(max_iter=1000, random_state=random_state),
        "SVC": SVC(random_state=random_state),
    }

    model_cls = models.get(model_type)
    if model_cls is None:
        raise ValueError(f"Unknown model_type: {model_type}. Choose from: {list(models.keys())}")

    with mlflow.start_run() as run:
        mlflow.log_param("model_type", model_type)
        mlflow.log_param("n_estimators", n_estimators)
        mlflow.log_param("max_depth", max_depth)
        mlflow.log_param("train_samples", len(X_train))
        mlflow.log_param("test_samples", len(X_test))

        model_cls.fit(X_train, y_train)

        y_pred = model_cls.predict(X_test)
        acc = accuracy_score(y_test, y_pred)
        f1 = f1_score(y_test, y_pred, average="weighted")
        precision = precision_score(y_test, y_pred, average="weighted")
        recall = recall_score(y_test, y_pred, average="weighted")

        mlflow.log_metric("accuracy", acc)
        mlflow.log_metric("f1_score", f1)
        mlflow.log_metric("precision", precision)
        mlflow.log_metric("recall", recall)

        mlflow.sklearn.log_model(model_cls, "model")

        joblib.dump(model_cls, model_output.path)

        metrics_output.log_metric("accuracy", acc)
        metrics_output.log_metric("f1_score", f1)
        metrics_output.log_metric("precision", precision)
        metrics_output.log_metric("recall", recall)

        print(f"Model: {model_type}")
        print(f"Accuracy: {acc:.4f}, F1: {f1:.4f}, Precision: {precision:.4f}, Recall: {recall:.4f}")
        print(f"MLflow Run ID: {run.info.run_id}")

        return run.info.run_id
