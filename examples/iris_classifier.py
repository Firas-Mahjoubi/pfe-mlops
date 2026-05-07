"""
Iris Flower Classifier
- Dataset: sklearn built-in (no file needed)
- Model: Random Forest
- MLflow autolog captures: accuracy, f1, params, model artifact
"""
import mlflow
import pandas as pd
from sklearn.datasets import load_iris
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

# Load data
iris = load_iris()
X = pd.DataFrame(iris.data, columns=iris.feature_names)
y = iris.target

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# Train (MLflow autolog captures everything automatically)
with mlflow.start_run(run_name="iris-random-forest") as run:
    clf = RandomForestClassifier(n_estimators=100, max_depth=5, random_state=42)
    clf.fit(X_train, y_train)

    preds = clf.predict(X_test)
    print(classification_report(y_test, preds, target_names=iris.target_names))

    score = clf.score(X_test, y_test)
    mlflow.log_metric("accuracy", score)
    mlflow.sklearn.log_model(clf, "model")
    print(f"Accuracy: {score:.4f}")

registered = mlflow.register_model(f"runs:/{run.info.run_id}/model", "iris-classifier")
print(f"Registered: iris-classifier v{registered.version}")
