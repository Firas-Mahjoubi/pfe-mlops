"""
California Housing Price Regressor
- Dataset: sklearn built-in (no file needed)
- Models: RandomForest, GradientBoosting regressors
- MLflow autolog captures: RMSE, R2, params, model artifact
"""
import mlflow
import numpy as np
import pandas as pd
from sklearn.datasets import fetch_california_housing
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_squared_error, r2_score

housing = fetch_california_housing()
X = pd.DataFrame(housing.data, columns=housing.feature_names)
y = housing.target

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

models = {
    "RandomForestRegressor": Pipeline([
        ("scaler", StandardScaler()),
        ("clf", RandomForestRegressor(n_estimators=100, random_state=42)),
    ]),
    "GradientBoostingRegressor": Pipeline([
        ("scaler", StandardScaler()),
        ("clf", GradientBoostingRegressor(n_estimators=100, random_state=42)),
    ]),
}

best_r2 = -float("inf")
best_run_id = ""
best_name = ""

for name, model in models.items():
    with mlflow.start_run(run_name=f"housing-{name}") as run:
        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        rmse = np.sqrt(mean_squared_error(y_test, preds))
        r2 = r2_score(y_test, preds)
        mlflow.log_metric("rmse", rmse)
        mlflow.log_metric("r2_score", r2)
        mlflow.sklearn.log_model(model, "model")
        print(f"{name}: RMSE={rmse:.4f}  R2={r2:.4f}")
        if r2 > best_r2:
            best_r2 = r2
            best_name = name
            best_run_id = run.info.run_id

print(f"\nBest model: {best_name} (R2={best_r2:.4f})")

registered = mlflow.register_model(f"runs:/{best_run_id}/model", "housing-regressor")
print(f"Registered: housing-regressor v{registered.version} (run {best_run_id[:8]})")
