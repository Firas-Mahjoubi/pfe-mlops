"""
Breast Cancer Classifier - XGBoost
- Dataset: sklearn built-in (no file needed)
- Model: XGBoost with hyperparameter logging
- MLflow autolog captures: logloss per round, accuracy, model artifact
"""
import mlflow
import pandas as pd
from xgboost import XGBClassifier
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, roc_auc_score

cancer = load_breast_cancer()
X = pd.DataFrame(cancer.data, columns=cancer.feature_names)
y = cancer.target

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

model = Pipeline([
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

with mlflow.start_run(run_name="breast-cancer-xgboost") as run:
    model.fit(X_train, y_train)
    preds = model.predict(X_test)
    proba = model.predict_proba(X_test)[:, 1]

    acc = accuracy_score(y_test, preds)
    auc = roc_auc_score(y_test, proba)
    mlflow.log_metric("accuracy", acc)
    mlflow.log_metric("roc_auc", auc)
    mlflow.sklearn.log_model(model, "model")
    print(f"Accuracy: {acc:.4f}  ROC-AUC: {auc:.4f}")

registered = mlflow.register_model(f"runs:/{run.info.run_id}/model", "breast-cancer-xgboost")
print(f"Registered: breast-cancer-xgboost v{registered.version}")
