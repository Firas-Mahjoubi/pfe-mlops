from kfp import dsl
from kfp.dsl import Output, Dataset


@dsl.component(
    base_image="python:3.11-slim",
    packages_to_install=["scikit-learn==1.5.2", "pandas==2.2.3"],
)
def load_data(
    dataset_name: str,
    dataset_output: Output[Dataset],
    test_size: float = 0.2,
):
    """Load a built-in sklearn dataset and save as CSV."""
    import pandas as pd
    from sklearn import datasets

    loaders = {
        "iris": datasets.load_iris,
        "wine": datasets.load_wine,
        "breast_cancer": datasets.load_breast_cancer,
        "digits": datasets.load_digits,
    }

    loader = loaders.get(dataset_name)
    if loader is None:
        raise ValueError(f"Unknown dataset: {dataset_name}. Choose from: {list(loaders.keys())}")

    data = loader()
    df = pd.DataFrame(data.data, columns=data.feature_names)
    df["target"] = data.target

    df.to_csv(dataset_output.path, index=False)
    print(f"Loaded {dataset_name}: {df.shape[0]} samples, {df.shape[1]} columns")
