import mlflow
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

mlflow.autolog()

print("Loading dataset...")
np.random.seed(42)
X = np.random.randn(300, 8)   # 8 features
y = np.random.randint(0, 2, 300)

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

print(f"Training on {len(X_train)} samples, {X_train.shape[1]} features...")
model = RandomForestClassifier(n_estimators=50, random_state=42)
model.fit(X_train, y_train)
print("Model trained.")

# Intentional error: test set has wrong number of features
X_bad = np.random.randn(60, 4)   # 4 features — model expects 8
print("Running evaluation...")
preds = model.predict(X_bad)

acc = accuracy_score(y_test, preds)
mlflow.log_metric("accuracy", acc)
print(f"Accuracy: {acc:.4f}")
