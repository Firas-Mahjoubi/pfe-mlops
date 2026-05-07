"""
Wine Quality Classifier
- Dataset: sklearn built-in (no file needed)
- Models: RandomForest, GradientBoosting, LogisticRegression compared
- MLflow autolog captures: all metrics, params, model artifact
"""
import mlflow
import pandas as pd
from sklearn.datasets import load_wine
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, f1_score

wine = load_wine()
X = pd.DataFrame(wine.data, columns=wine.feature_names)
y = wine.target

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

models = {
    "RandomForest": Pipeline([
        ("scaler", StandardScaler()),
        ("clf", RandomForestClassifier(n_estimators=100, random_state=42)),
    ]),
    "GradientBoosting": Pipeline([
        ("scaler", StandardScaler()),
        ("clf", GradientBoostingClassifier(n_estimators=100, random_state=42)),
    ]),
    "LogisticRegression": Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=1000, random_state=42)),
    ]),
}

best_acc = 0
best_name = ""
best_run_id = ""

for name, model in models.items():
    with mlflow.start_run(run_name=f"wine-{name}") as run:
        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        acc = accuracy_score(y_test, preds)
        f1 = f1_score(y_test, preds, average="weighted")
        mlflow.log_metric("accuracy", acc)
        mlflow.log_metric("f1_score", f1)
        mlflow.sklearn.log_model(model, "model")
        print(f"{name}: accuracy={acc:.4f}  f1={f1:.4f}")
        if acc > best_acc:
            best_acc = acc
            best_name = name
            best_run_id = run.info.run_id

print(f"\nBest model: {best_name} ({best_acc:.4f})")

model_uri = f"runs:/{best_run_id}/model"
registered = mlflow.register_model(model_uri, "wine-classifier")
print(f"Registered: wine-classifier v{registered.version} (run {best_run_id[:8]})")
