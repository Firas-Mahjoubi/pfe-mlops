"""
Breast Cancer Classifier — custom pipeline example.

Runs both locally (python train.py) and inside the platform's custom pipeline:
- Locally: reads ./breast_cancer.csv from the script's own directory.
- In pipeline: the platform sets DATASET_PATH when a dataset file is uploaded
  alongside the code (or dropped in the same zip). We honor it if set.

CSV format (matches sklearn's load_breast_cancer() export):
  Line 1: "569,30,malignant,benign"          <- skipped (metadata)
  Lines 2..570: 30 feature columns + 1 target column (0 = malignant, 1 = benign)

Why a sklearn Pipeline? The Scaler is bundled with the classifier so that
KServe applies the same scaling at inference time that was used during training.
Without this, predictions collapse to one class.
"""
import os
from pathlib import Path

import mlflow
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

try:
    from xgboost import XGBClassifier
    _HAS_XGB = True
except ImportError:
    _HAS_XGB = False
    print("[train] xgboost not installed — skipping XGBoost model")


# ---------------------------------------------------------------------------
# 1. Locate the dataset
# ---------------------------------------------------------------------------
DATASET_PATH = os.environ.get("DATASET_PATH")
if not DATASET_PATH:
    # Fallback to the CSV sitting next to this script (for `python train.py`)
    DATASET_PATH = str(Path(__file__).parent / "breast_cancer.csv")

print(f"[train] Loading dataset from: {DATASET_PATH}")
# Skip the first row (metadata header "569,30,malignant,benign") — real data
# starts at row 2 with 30 features + 1 target.
df = pd.read_csv(DATASET_PATH, skiprows=1, header=None)
print(f"[train] Shape: {df.shape}")

X = df.iloc[:, :-1].values   # 30 feature columns
y = df.iloc[:, -1].values    # target (0 = malignant, 1 = benign)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# ---------------------------------------------------------------------------
# 2. Candidate models (each wrapped in a Pipeline with StandardScaler)
# ---------------------------------------------------------------------------
models = {
    "LogisticRegression": Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=2000, random_state=42)),
    ]),
    "RandomForest": Pipeline([
        ("scaler", StandardScaler()),
        ("clf", RandomForestClassifier(n_estimators=200, random_state=42)),
    ]),
    "GradientBoosting": Pipeline([
        ("scaler", StandardScaler()),
        ("clf", GradientBoostingClassifier(n_estimators=150, random_state=42)),
    ]),
}

if _HAS_XGB:
    models["XGBoost"] = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", XGBClassifier(
            n_estimators=200,
            max_depth=4,
            learning_rate=0.05,
            subsample=0.8,
            eval_metric="logloss",
            random_state=42,
        )),
    ])

# ---------------------------------------------------------------------------
# 3. Train, evaluate, log to MLflow — pick the best
# ---------------------------------------------------------------------------
best_acc = 0.0
best_name = ""
best_run_id = ""

for name, model in models.items():
    with mlflow.start_run(run_name=f"bc-{name}") as run:
        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        proba = model.predict_proba(X_test)[:, 1]

        acc = accuracy_score(y_test, preds)
        f1 = f1_score(y_test, preds)
        auc = roc_auc_score(y_test, proba)

        mlflow.log_metric("accuracy", acc)
        mlflow.log_metric("f1_score", f1)
        mlflow.log_metric("roc_auc", auc)
        mlflow.sklearn.log_model(model, "model")

        print(f"[train] {name:18s}  acc={acc:.4f}  f1={f1:.4f}  auc={auc:.4f}")

        if acc > best_acc:
            best_acc = acc
            best_name = name
            best_run_id = run.info.run_id

print(f"\n[train] Best model: {best_name} (accuracy={best_acc:.4f})")

# ---------------------------------------------------------------------------
# 4. Register the best model so it shows up in the Models tab
# ---------------------------------------------------------------------------
registered = mlflow.register_model(
    f"runs:/{best_run_id}/model",
    "breast-cancer-classifier",
)
print(f"[train] Registered: breast-cancer-classifier v{registered.version} (run {best_run_id[:8]})")
