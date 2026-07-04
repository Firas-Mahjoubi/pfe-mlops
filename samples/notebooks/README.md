# Test notebooks

Self-contained `.ipynb` files for testing the platform end to end:
**upload → auto-convert to `.py` → run on the cluster → MLflow autolog → model in
the Experiments tab.**

Every notebook uses a **scikit-learn built-in dataset** (no external file, no
network, CPU-only) and ends by calling `.fit()`, so `mlflow.autolog` captures the
parameters, metrics, and model automatically. Just upload one in a project's
**Code** tab and click **Run**.

| Notebook | What it tests | On upload you should see | Result |
|---|---|---|---|
| `01_iris_clean.ipynb` | The happy path — no magics at all. | Converted to `01_iris_clean.py`, no warnings. | RandomForest on iris, ~0.90 accuracy. |
| `02_breast_cancer_colab.ipynb` | A Colab-style export: `!pip install xgboost`, `%matplotlib inline`, a plot, and `%%time` around training. | "Auto-converted" chip listing **xgboost** as a detected install; warnings: `pip_install_converted`, `cell_magic_body_kept`, `line_magics_removed`. | XGBoost on breast-cancer; the `%%time` body still trains. |
| `03_wine_magics_stress.ipynb` | The hard cases: a magic **inside a string** (must survive untouched), `x = !ls`, `%cd`, `%%writefile`, and a magic nested in an `if` block. | Warnings: `writefile_converted`, `nested_magics_shimmed`, etc. | LogisticRegression on wine, ~0.97 accuracy — proves the tricky notebook still trains. |
| `04_digits_svc.ipynb` | A second clean model, so you have multiple runs to rank and **compare**. | Converted to `04_digits_svc.py`, no warnings. | SVC on digits, ~0.98 accuracy. |

## Suggested flow for a demo
1. Upload **01** first — confirms convert → run → autolog works.
2. Upload **02** — shows the platform handling a realistic messy Colab notebook
   (pip install preserved, magics translated, `%%time` body kept).
3. Upload **04** — gives a second model so the **Experiments** leaderboard and the
   **Compare** page have something to rank.
4. Upload **03** if you want to prove the converter's robustness (magics in
   strings, shell capture, `%%writefile`, nested magics) while still training.

> These are generated to exercise `backend/app/services/notebook_converter.py`;
> the converter unit tests in `backend/tests/test_notebook_converter.py` cover the
> same constructs.
