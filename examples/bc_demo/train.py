"""
Breast Cancer Classifier — live-demo model (self-contained, deterministic).

- Dataset: scikit-learn's built-in Breast Cancer Wisconsin set (no file to upload).
- Model: RandomForest — a TREE model, so it is scale-invariant. No StandardScaler
  is needed, which means nothing is lost when the platform serves the raw pickle:
  the deployed model predicts correctly on raw 30-feature inputs and returns crisp
  class labels (0 = malignant, 1 = benign) rather than a probability.
- Logs a plain sklearn estimator -> model/model.pkl -> KServe sklearn runtime.
- random_state=42 everywhere so the platform run reproduces these exact results.
"""
import mlflow
import pandas as pd
from sklearn.datasets import load_breast_cancer
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score

cancer = load_breast_cancer()
X = pd.DataFrame(cancer.data, columns=cancer.feature_names)
y = cancer.target  # 0 = malignant, 1 = benign

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

clf = RandomForestClassifier(n_estimators=200, random_state=42)

with mlflow.start_run(run_name="breast-cancer-rf") as run:
    clf.fit(X_train, y_train)
    preds = clf.predict(X_test)
    proba = clf.predict_proba(X_test)[:, 1]

    acc = accuracy_score(y_test, preds)
    f1 = f1_score(y_test, preds)
    auc = roc_auc_score(y_test, proba)
    mlflow.log_metric("accuracy", acc)
    mlflow.log_metric("f1_score", f1)
    mlflow.log_metric("roc_auc", auc)
    mlflow.sklearn.log_model(clf, "model")

    print(f"[bc-demo] RandomForest  accuracy={acc:.4f}  f1={f1:.4f}  roc_auc={auc:.4f}")
    print(f"[bc-demo] run_id={run.info.run_id}")
