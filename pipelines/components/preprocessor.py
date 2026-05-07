from kfp import dsl
from kfp.dsl import Input, Output, Dataset


@dsl.component(
    base_image="python:3.11-slim",
    packages_to_install=["scikit-learn==1.5.2", "pandas==2.2.3"],
)
def preprocess_data(
    raw_data: Input[Dataset],
    train_data: Output[Dataset],
    test_data: Output[Dataset],
    test_size: float = 0.2,
    random_state: int = 42,
):
    """Split data into train/test and apply standard scaling."""
    import pandas as pd
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import StandardScaler

    df = pd.read_csv(raw_data.path)
    X = df.drop("target", axis=1)
    y = df["target"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state, stratify=y
    )

    scaler = StandardScaler()
    X_train_scaled = pd.DataFrame(scaler.fit_transform(X_train), columns=X.columns)
    X_test_scaled = pd.DataFrame(scaler.transform(X_test), columns=X.columns)

    train_df = X_train_scaled.copy()
    train_df["target"] = y_train.values
    train_df.to_csv(train_data.path, index=False)

    test_df = X_test_scaled.copy()
    test_df["target"] = y_test.values
    test_df.to_csv(test_data.path, index=False)

    print(f"Train: {train_df.shape[0]} samples, Test: {test_df.shape[0]} samples")
