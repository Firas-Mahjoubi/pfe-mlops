"""Pipeline service: compiles and submits Kubeflow Pipelines, tracks status."""

import logging
import os
import tempfile
from datetime import datetime, timezone

import kfp
from kfp import dsl
from kfp.compiler import Compiler
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.pipeline_run import PipelineRun, PipelineStatus
from app.models.project import Project

logger = logging.getLogger(__name__)


# ── Module-level KFP component ────────────────────────────────────────────────
# Must be at module level so KFP's inspect.getsource() can serialize it cleanly.
@dsl.component(
    base_image=os.environ.get("PIPELINE_RUNNER_IMAGE", "python:3.11-slim"),
    packages_to_install=[] if os.environ.get("PIPELINE_RUNNER_IMAGE") else [
        "boto3==1.35.81",
        "mlflow==2.11.0",
    ],
)
def run_custom_code(
    code_minio_path: str,
    dataset_minio_path: str,
    entry_script: str,
    minio_endpoint: str,
    minio_access_key: str,
    minio_secret_key: str,
    mlflow_tracking_uri: str,
    mlflow_experiment_id: str,
    pipeline_run_db_id: str = "",
) -> str:
    import os, re, subprocess, zipfile, boto3

    os.environ["MLFLOW_TRACKING_URI"] = mlflow_tracking_uri
    os.environ["MLFLOW_EXPERIMENT_ID"] = mlflow_experiment_id
    os.environ["AWS_ACCESS_KEY_ID"] = minio_access_key
    os.environ["AWS_SECRET_ACCESS_KEY"] = minio_secret_key
    os.environ["MLFLOW_S3_ENDPOINT_URL"] = f"http://{minio_endpoint}"

    s3 = boto3.client(
        "s3",
        endpoint_url=f"http://{minio_endpoint}",
        aws_access_key_id=minio_access_key,
        aws_secret_access_key=minio_secret_key,
    )

    workdir = "/workspace"
    os.makedirs(workdir, exist_ok=True)

    # 1. Download code
    code_filename = code_minio_path.split("/")[-1]
    local_code = f"{workdir}/{code_filename}"
    print(f"[platform] Downloading: {code_minio_path}")
    s3.download_file("user-code", code_minio_path, local_code)

    # 2. Extract zip
    if code_filename.lower().endswith(".zip"):
        print(f"[platform] Extracting {code_filename}...")
        with zipfile.ZipFile(local_code, "r") as z:
            z.extractall(workdir)
        os.remove(local_code)

    # 3. Download separate dataset (optional)
    if dataset_minio_path:
        ds_filename = dataset_minio_path.split("/")[-1]
        local_ds = f"{workdir}/{ds_filename}"
        print(f"[platform] Downloading dataset: {ds_filename}")
        s3.download_file("user-code", dataset_minio_path, local_ds)
        os.environ["DATASET_PATH"] = local_ds
        print(f"[platform] DATASET_PATH={local_ds}")

    # 4. Auto-detect entry script
    def find_files(ext):
        found = []
        for root, _, files in os.walk(workdir):
            for fname in files:
                if fname.lower().endswith(ext) and not fname.startswith("_"):
                    found.append(os.path.relpath(os.path.join(root, fname), workdir))
        return found

    if not entry_script:
        for candidate in ["train.py", "main.py", "run.py", "model.py"]:
            if os.path.exists(f"{workdir}/{candidate}"):
                entry_script = candidate
                break
    if not entry_script:
        notebooks = find_files(".ipynb")
        if notebooks:
            entry_script = notebooks[0]
            print(f"[platform] Auto-detected notebook: {entry_script}")
    if not entry_script:
        py_files = find_files(".py")
        if py_files:
            entry_script = py_files[0]
            print(f"[platform] Auto-detected script: {entry_script}")
    if not entry_script:
        raise RuntimeError(f"No Python/notebook file found in: {os.listdir(workdir)}")

    print(f"[platform] Entry point: {entry_script}")

    # 5. Convert notebook to .py
    if entry_script.lower().endswith(".ipynb"):
        print("[platform] Installing nbconvert for notebook conversion...")
        subprocess.run(
            ["pip", "install", "nbconvert==7.16.4", "ipython==8.26.0", "--quiet"],
            capture_output=True, text=True,
        )
        nb_path = f"{workdir}/{entry_script}"
        print("[platform] Converting notebook to script...")
        subprocess.run(
            ["jupyter", "nbconvert", "--to", "script", nb_path],
            capture_output=True, text=True,
        )
        converted = entry_script.rsplit(".", 1)[0] + ".py"
        converted_path = f"{workdir}/{converted}"
        if os.path.exists(converted_path):
            with open(converted_path) as fh:
                lines = fh.readlines()

            # Strip line magics (`%foo`), shell escapes (`!cmd`), and
            # `get_ipython()` calls -- all of which are syntax errors
            # outside Jupyter. Cell magics (`%%foo`) affect the WHOLE
            # cell, so drop everything until the next nbconvert cell
            # delimiter (a `# In[` marker, written by nbconvert above
            # every code cell).
            clean: list[str] = []
            skip_cell = False
            for ln in lines:
                if skip_cell:
                    if ln.lstrip().startswith("# In["):
                        skip_cell = False
                        clean.append(ln)
                    # else: still inside the cell-magic cell, drop the line
                    continue
                if re.match(r"^\s*%%", ln):
                    # Entering a cell-magic block; drop the rest of the cell
                    skip_cell = True
                    continue
                if re.match(r"^\s*(%|!|get_ipython)", ln):
                    continue
                clean.append(ln)
            with open(converted_path, "w") as fh:
                fh.writelines(clean)
        entry_script = converted
        print(f"[platform] Converted to: {entry_script}")

    # 6. Install requirements.txt (check script dir first, then workdir root)
    script_abs = os.path.join(workdir, entry_script)
    script_dir = os.path.dirname(script_abs)
    req_file = os.path.join(script_dir, "requirements.txt")
    if not os.path.exists(req_file):
        req_file = f"{workdir}/requirements.txt"
    if os.path.exists(req_file):
        print("[platform] Installing requirements.txt...")
        r = subprocess.run(
            ["pip", "install", "-r", req_file],
            capture_output=False, text=True,
        )
        if r.returncode != 0:
            print(f"[platform] WARNING: some requirements failed to install")

    # 7. Write MLflow autolog runner into the script's own directory
    runner_src = (
        "import os, sys, runpy, time\n"
        # Non-interactive matplotlib backend -- must be set before any other import
        "import matplotlib\n"
        "matplotlib.use('Agg')\n"
        "import matplotlib.pyplot as _plt\n"
        "_plt.show = lambda *a, **kw: None\n"
        "import mlflow\n"
        # Backward-compat patch: sklearn removed Imputer in 0.22; map it to SimpleImputer
        "try:\n"
        "    import sklearn.preprocessing as _sp\n"
        "    from sklearn.impute import SimpleImputer as _Si\n"
        "    if not hasattr(_sp, 'Imputer'):\n"
        "        _sp.Imputer = _Si\n"
        "    del _sp, _Si\n"
        "except Exception:\n"
        "    pass\n"
        # argparse soft-fallback: scripts often call ArgumentParser().parse_args()
        # without passing argv; the platform runs them with no flags. If parsing
        # fails because of missing args, retry with [] so any default= kicks in.
        "import argparse as _ap\n"
        "_orig_parse = _ap.ArgumentParser.parse_args\n"
        "def _safe_parse_args(self, args=None, namespace=None):\n"
        "    try:\n"
        "        return _orig_parse(self, args, namespace)\n"
        "    except SystemExit:\n"
        "        print('[platform] argparse: missing args, falling back to defaults')\n"
        "        return _orig_parse(self, [], namespace)\n"
        "_ap.ArgumentParser.parse_args = _safe_parse_args\n"
        "mlflow.set_tracking_uri(os.environ['MLFLOW_TRACKING_URI'])\n"
        "_exp_id = os.environ.get('MLFLOW_EXPERIMENT_ID')\n"
        "try:\n"
        "    mlflow.set_experiment(experiment_id=_exp_id)\n"
        "except Exception:\n"
        "    pass\n"
        "mlflow.autolog(log_models=True, log_datasets=False, silent=False)\n"
        "_started_ms = int(time.time() * 1000)\n"
        "print('[platform] MLflow autolog enabled - running', sys.argv[1])\n"
        "runpy.run_path(sys.argv[1], run_name='__main__')\n"
        # No-run detector: after the user script finishes, check whether
        # autolog actually recorded anything for this execution. If not,
        # the user's code probably didn't call .fit() -- warn loudly in
        # the logs so the pipeline doesn't look successful for no reason.
        "try:\n"
        "    from mlflow.tracking import MlflowClient as _MC\n"
        "    _recent = _MC().search_runs(\n"
        "        experiment_ids=[_exp_id] if _exp_id else [],\n"
        "        max_results=1,\n"
        "        order_by=['attributes.start_time DESC'],\n"
        "    )\n"
        "    if not _recent or (_recent[0].info.start_time or 0) < _started_ms:\n"
        "        print('[platform] WARNING: your code finished but no MLflow '\n"
        "              'run was logged for this execution. Did you forget to '\n"
        "              'call .fit() or mlflow.log_model()?')\n"
        "except Exception as _e:\n"
        "    print('[platform] (could not verify MLflow run creation:', _e, ')')\n"
    )
    runner_path = os.path.join(script_dir, "_runner.py")
    with open(runner_path, "w") as fh:
        fh.write(runner_src)

    # 8. Execute with auto-install retry for missing modules
    if not os.path.exists(script_abs):
        raise RuntimeError(f"Entry script not found: {script_abs}")

    script_basename = os.path.basename(entry_script)
    result = None
    max_retries = 15
    installed = set()

    for attempt in range(max_retries):
        print(f"[platform] Executing {entry_script} (attempt {attempt + 1})...")
        result = subprocess.run(
            ["python", "_runner.py", script_basename],
            cwd=script_dir,
            capture_output=True,
            text=True,
        )

        if result.returncode == 0:
            break

        # Check for a missing module and auto-install it
        missing = None
        for line in result.stderr.splitlines():
            if "ModuleNotFoundError: No module named" in line:
                # Extract top-level package name
                part = line.split("No module named")[-1].strip().strip("'\"")
                missing = part.split(".")[0]
                break

        if missing and missing not in installed:
            print(f"[platform] Auto-installing missing package: {missing}")
            inst = subprocess.run(
                ["pip", "install", missing],
                capture_output=True, text=True,
            )
            if inst.returncode == 0:
                installed.add(missing)
                print(f"[platform] Installed {missing} - retrying...")
                continue
            else:
                print(f"[platform] Failed to install {missing}: {inst.stderr[-300:]}")
                break
        else:
            # Not a missing-module error, no point retrying
            break

    print("=== STDOUT ===")
    print(result.stdout)
    if result.stderr:
        print("=== STDERR ===")
        print(result.stderr)
    if result.returncode != 0:
        # Persist the user-script error to MinIO so the UI can show "Why?"
        # WITHOUT scraping ~50 KB of Argo / KFP pod logs (which also get
        # GC'd after a few hours). Keyed by kfp run id so the backend can
        # fetch it directly. Tail-truncated to keep it under ~20 KB.
        error_blob = (
            f"=== exit code: {result.returncode} ===\n"
            f"=== stdout (last 5000 chars) ===\n{result.stdout[-5000:]}\n"
            f"=== stderr (last 10000 chars) ===\n{result.stderr[-10000:]}\n"
        )
        # Threaded through from the submission flow so the backend can
        # fetch by our DB id directly -- no KFP run id ↔ DB id translation.
        run_key = pipeline_run_db_id or os.environ.get("KFP_POD_NAME", "unknown")
        try:
            s3.put_object(
                Bucket="user-code",
                Key=f"_errors/{run_key}.txt",
                Body=error_blob.encode(),
                ContentType="text/plain; charset=utf-8",
            )
            print(f"[platform] error blob saved: user-code/_errors/{run_key}.txt")
        except Exception as _e:  # noqa: BLE001
            print(f"[platform] could not save error blob: {_e}")
        raise RuntimeError(f"Script exited {result.returncode}:\n{result.stderr[-3000:]}")

    out = result.stdout.strip()
    return out[-1000:] if out else "Completed successfully"


def _get_kfp_client() -> kfp.Client:
    return kfp.Client(host=settings.KFP_HOST)


def _build_training_pipeline(
    dataset_name: str,
    model_type: str,
    n_estimators: int,
    max_depth: int,
    test_size: float,
    accuracy_threshold: float,
    mlflow_tracking_uri: str,
    mlflow_experiment_id: str,
    model_name: str,
    minio_endpoint: str,
    minio_access_key: str,
    minio_secret_key: str,
):
    """Build an inline KFP pipeline for sklearn training."""

    _runner_image = os.environ.get("PIPELINE_RUNNER_IMAGE", "python:3.11-slim")
    _extra_pkgs = [] if os.environ.get("PIPELINE_RUNNER_IMAGE") else ["scikit-learn==1.5.2", "pandas==2.2.3"]

    @dsl.component(base_image=_runner_image, packages_to_install=_extra_pkgs)
    def load_data(dataset_name: str, dataset_output: dsl.Output[dsl.Dataset]):
        import pandas as pd
        from sklearn import datasets

        loaders = {
            "iris": datasets.load_iris,
            "wine": datasets.load_wine,
            "breast_cancer": datasets.load_breast_cancer,
            "digits": datasets.load_digits,
        }
        data = loaders[dataset_name]()
        df = pd.DataFrame(data.data, columns=data.feature_names)
        df["target"] = data.target
        df.to_csv(dataset_output.path, index=False)

    @dsl.component(base_image=_runner_image, packages_to_install=_extra_pkgs)
    def preprocess(
        raw_data: dsl.Input[dsl.Dataset],
        train_data: dsl.Output[dsl.Dataset],
        test_data: dsl.Output[dsl.Dataset],
        test_size: float = 0.2,
    ):
        import pandas as pd
        from sklearn.model_selection import train_test_split

        df = pd.read_csv(raw_data.path)
        X, y = df.drop("target", axis=1), df["target"]
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42, stratify=y
        )
        # No scaling here — the train step builds a full sklearn Pipeline
        # (StandardScaler + classifier) so that the saved model handles
        # raw feature inputs correctly at inference time.
        train_df = X_train.copy()
        train_df["target"] = y_train.values
        train_df.to_csv(train_data.path, index=False)
        test_df = X_test.copy()
        test_df["target"] = y_test.values
        test_df.to_csv(test_data.path, index=False)

    _train_pkgs = [] if os.environ.get("PIPELINE_RUNNER_IMAGE") else [
        "scikit-learn==1.5.2", "mlflow==2.11.0", "boto3==1.35.81", "pandas==2.2.3", "joblib==1.4.2",
    ]

    @dsl.component(base_image=_runner_image, packages_to_install=_train_pkgs)
    def train(
        train_data: dsl.Input[dsl.Dataset],
        test_data: dsl.Input[dsl.Dataset],
        model_output: dsl.Output[dsl.Model],
        mlflow_tracking_uri: str,
        mlflow_experiment_id: str,
        minio_endpoint: str,
        minio_access_key: str,
        minio_secret_key: str,
        model_type: str = "RandomForestClassifier",
        n_estimators: int = 100,
        max_depth: int = 10,
    ) -> str:
        import os, joblib, pandas as pd, mlflow
        from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
        from sklearn.linear_model import LogisticRegression
        from sklearn.svm import SVC
        from sklearn.preprocessing import StandardScaler
        from sklearn.pipeline import Pipeline
        from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score

        os.environ["MLFLOW_S3_ENDPOINT_URL"] = f"http://{minio_endpoint}"
        os.environ["AWS_ACCESS_KEY_ID"] = minio_access_key
        os.environ["AWS_SECRET_ACCESS_KEY"] = minio_secret_key
        mlflow.set_tracking_uri(mlflow_tracking_uri)
        mlflow.set_experiment(experiment_id=mlflow_experiment_id)

        train_df = pd.read_csv(train_data.path)
        test_df = pd.read_csv(test_data.path)
        X_train, y_train = train_df.drop("target", axis=1), train_df["target"]
        X_test, y_test = test_df.drop("target", axis=1), test_df["target"]

        clfs = {
            "RandomForestClassifier": RandomForestClassifier(n_estimators=n_estimators, max_depth=max_depth, random_state=42),
            "GradientBoostingClassifier": GradientBoostingClassifier(n_estimators=n_estimators, max_depth=max_depth, random_state=42),
            "LogisticRegression": LogisticRegression(max_iter=1000, random_state=42),
            "SVC": SVC(random_state=42),
        }
        # Wrap scaler + classifier in a Pipeline so the saved model accepts
        # raw (unscaled) inputs at inference time — KServe sends raw features.
        model = Pipeline([
            ("scaler", StandardScaler()),
            ("clf", clfs[model_type]),
        ])

        with mlflow.start_run() as run:
            mlflow.log_params({"model_type": model_type, "n_estimators": n_estimators, "max_depth": max_depth})
            model.fit(X_train, y_train)
            preds = model.predict(X_test)
            metrics = {
                "accuracy": accuracy_score(y_test, preds),
                "f1_score": f1_score(y_test, preds, average="weighted"),
                "precision": precision_score(y_test, preds, average="weighted"),
                "recall": recall_score(y_test, preds, average="weighted"),
            }
            mlflow.log_metrics(metrics)
            mlflow.sklearn.log_model(model, "model")
            joblib.dump(model, model_output.path)
            return run.info.run_id

    _reg_pkgs = [] if os.environ.get("PIPELINE_RUNNER_IMAGE") else ["mlflow==2.11.0", "boto3==1.35.81"]

    @dsl.component(base_image=_runner_image, packages_to_install=_reg_pkgs)
    def register(
        mlflow_tracking_uri: str,
        mlflow_run_id: str,
        model_name: str,
        minio_endpoint: str,
        minio_access_key: str,
        minio_secret_key: str,
        accuracy_threshold: float = 0.7,
    ) -> str:
        import os, mlflow
        from mlflow.tracking import MlflowClient

        os.environ["MLFLOW_S3_ENDPOINT_URL"] = f"http://{minio_endpoint}"
        os.environ["AWS_ACCESS_KEY_ID"] = minio_access_key
        os.environ["AWS_SECRET_ACCESS_KEY"] = minio_secret_key
        mlflow.set_tracking_uri(mlflow_tracking_uri)

        client = MlflowClient()
        run = client.get_run(mlflow_run_id)
        acc = float(run.data.metrics.get("accuracy", 0))
        if acc >= accuracy_threshold:
            result = mlflow.register_model(f"runs:/{mlflow_run_id}/model", model_name)
            return f"registered:v{result.version}"
        return "not_registered"

    @dsl.pipeline(name="sklearn-training-pipeline")
    def pipeline():
        load_task = load_data(dataset_name=dataset_name)
        prep_task = preprocess(raw_data=load_task.outputs["dataset_output"], test_size=test_size)
        train_task = train(
            train_data=prep_task.outputs["train_data"],
            test_data=prep_task.outputs["test_data"],
            mlflow_tracking_uri=mlflow_tracking_uri,
            mlflow_experiment_id=mlflow_experiment_id,
            minio_endpoint=minio_endpoint,
            minio_access_key=minio_access_key,
            minio_secret_key=minio_secret_key,
            model_type=model_type,
            n_estimators=n_estimators,
            max_depth=max_depth,
        )
        register(
            mlflow_tracking_uri=mlflow_tracking_uri,
            mlflow_run_id=train_task.outputs["Output"],
            model_name=model_name,
            minio_endpoint=minio_endpoint,
            minio_access_key=minio_access_key,
            minio_secret_key=minio_secret_key,
            accuracy_threshold=accuracy_threshold,
        )

    return pipeline


async def trigger_training_pipeline(
    project: Project,
    db: AsyncSession,
    dataset_name: str = "iris",
    model_type: str = "RandomForestClassifier",
    n_estimators: int = 100,
    max_depth: int = 10,
    test_size: float = 0.2,
    accuracy_threshold: float = 0.7,
) -> PipelineRun:
    """Compile and submit a training pipeline to KFP."""
    experiment_id = project.mlflow_experiment_id or "0"

    # Determine MLflow/MinIO endpoints reachable from inside the K8s cluster
    # Docker Compose services are on the host network, accessible via host.docker.internal from kind
    mlflow_uri = os.environ.get(
        "KFP_MLFLOW_URI", "http://host.docker.internal:5000"
    )
    minio_ep = os.environ.get(
        "KFP_MINIO_ENDPOINT", "host.docker.internal:9000"
    )

    pipeline_fn = _build_training_pipeline(
        dataset_name=dataset_name,
        model_type=model_type,
        n_estimators=n_estimators,
        max_depth=max_depth,
        test_size=test_size,
        accuracy_threshold=accuracy_threshold,
        mlflow_tracking_uri=mlflow_uri,
        mlflow_experiment_id=experiment_id,
        model_name=f"{project.name.lower().replace(' ', '-')}-model",
        minio_endpoint=minio_ep,
        minio_access_key=settings.MINIO_ACCESS_KEY,
        minio_secret_key=settings.MINIO_SECRET_KEY,
    )

    # Compile pipeline to YAML
    with tempfile.NamedTemporaryFile(suffix=".yaml", delete=False) as f:
        Compiler().compile(pipeline_fn, f.name)
        pipeline_yaml = f.name

    # Submit to KFP
    client = _get_kfp_client()

    # Create or get experiment in KFP
    try:
        kfp_experiment = client.create_experiment(
            name=project.name, namespace=settings.KFP_NAMESPACE
        )
    except Exception:
        kfp_experiment = client.get_experiment(
            experiment_name=project.name, namespace=settings.KFP_NAMESPACE
        )

    run_response = client.create_run_from_pipeline_package(
        pipeline_file=pipeline_yaml,
        experiment_name=project.name,
        run_name=f"{project.name}-{model_type}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}",
        namespace=settings.KFP_NAMESPACE,
    )

    # Save to DB
    pipeline_run = PipelineRun(
        project_id=project.id,
        kfp_run_id=run_response.run_id,
        status=PipelineStatus.RUNNING,
        pipeline_type="training",
        parameters={
            "dataset_name": dataset_name,
            "model_type": model_type,
            "n_estimators": n_estimators,
            "max_depth": max_depth,
            "test_size": test_size,
            "accuracy_threshold": accuracy_threshold,
        },
    )
    db.add(pipeline_run)
    await db.commit()
    await db.refresh(pipeline_run)

    # Clean up temp file
    os.unlink(pipeline_yaml)

    return pipeline_run


def _build_custom_code_pipeline(
    code_minio_path: str,
    dataset_minio_path: str,
    entry_script: str,
    mlflow_tracking_uri: str,
    mlflow_experiment_id: str,
    minio_endpoint: str,
    minio_access_key: str,
    minio_secret_key: str,
    pipeline_run_db_id: str = "",
):
    """Build a KFP pipeline that downloads and runs any user-uploaded code."""

    @dsl.pipeline(name="custom-code-pipeline")
    def pipeline():
        task = run_custom_code(
            code_minio_path=code_minio_path,
            dataset_minio_path=dataset_minio_path,
            entry_script=entry_script,
            minio_endpoint=minio_endpoint,
            minio_access_key=minio_access_key,
            minio_secret_key=minio_secret_key,
            mlflow_tracking_uri=mlflow_tracking_uri,
            mlflow_experiment_id=mlflow_experiment_id,
            pipeline_run_db_id=pipeline_run_db_id,
        )
        # Every user-triggered "Run code" click must actually train. KFP's
        # per-step caching would otherwise return a cached result when the user
        # re-submits with identical inputs (same zip, csv, experiment_id) —
        # silently skipping the training container and registering no new model.
        task.set_caching_options(enable_caching=False)

    return pipeline


async def trigger_custom_code_pipeline(
    project: Project,
    db: AsyncSession,
    code_minio_path: str,
    dataset_minio_path: str = "",
    entry_script: str = "",
) -> PipelineRun:
    """Compile and submit a custom-code pipeline to KFP."""
    experiment_id = project.mlflow_experiment_id or "0"

    mlflow_uri = os.environ.get("KFP_MLFLOW_URI", "http://host.docker.internal:5000")
    minio_ep = os.environ.get("KFP_MINIO_ENDPOINT", "host.docker.internal:9000")
    code_name = code_minio_path.split("/")[-1]

    # Create the DB row FIRST (without kfp_run_id) so we have a stable id we
    # can thread into the pipeline as a parameter. The runner uses this id as
    # the MinIO key for its error blob, which lets GET /pipelines/{id}/error
    # fetch by our own id with no KFP-id translation.
    pipeline_run = PipelineRun(
        project_id=project.id,
        kfp_run_id=None,
        status=PipelineStatus.PENDING,
        pipeline_type="custom",
        parameters={
            "code_file": code_name,
            "dataset_file": dataset_minio_path.split("/")[-1] if dataset_minio_path else "",
            "entry_script": entry_script,
        },
    )
    db.add(pipeline_run)
    await db.commit()
    await db.refresh(pipeline_run)

    pipeline_fn = _build_custom_code_pipeline(
        code_minio_path=code_minio_path,
        dataset_minio_path=dataset_minio_path,
        entry_script=entry_script,
        mlflow_tracking_uri=mlflow_uri,
        mlflow_experiment_id=experiment_id,
        minio_endpoint=minio_ep,
        minio_access_key=settings.MINIO_ACCESS_KEY,
        minio_secret_key=settings.MINIO_SECRET_KEY,
        pipeline_run_db_id=pipeline_run.id,
    )

    with tempfile.NamedTemporaryFile(suffix=".yaml", delete=False) as f:
        Compiler().compile(pipeline_fn, f.name)
        pipeline_yaml = f.name

    client = _get_kfp_client()

    try:
        client.create_experiment(name=project.name, namespace=settings.KFP_NAMESPACE)
    except Exception:
        client.get_experiment(experiment_name=project.name, namespace=settings.KFP_NAMESPACE)

    run_response = client.create_run_from_pipeline_package(
        pipeline_file=pipeline_yaml,
        experiment_name=project.name,
        run_name=f"{project.name}-custom-{code_name}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}",
        namespace=settings.KFP_NAMESPACE,
        # Belt + braces: also override at submission so this run never reuses a
        # cached result even if the pipeline YAML is regenerated without the
        # task-level setting for some reason.
        enable_caching=False,
    )

    pipeline_run.kfp_run_id = run_response.run_id
    pipeline_run.status = PipelineStatus.RUNNING
    await db.commit()
    await db.refresh(pipeline_run)

    os.unlink(pipeline_yaml)
    return pipeline_run


async def get_pipeline_run_logs(run_id: str, db: AsyncSession) -> dict | None:
    """Fetch real-time pod logs for a pipeline run from Kubernetes."""
    result = await db.execute(select(PipelineRun).where(PipelineRun.id == run_id))
    pipeline_run = result.scalar_one_or_none()
    if not pipeline_run:
        return None

    logs: list[str] = []

    if not pipeline_run.kfp_run_id:
        return {
            "run_id": run_id,
            "status": pipeline_run.status.value,
            "logs": ["[platform] No KFP run ID found."],
        }

    try:
        from app.services.k8s_client import ensure_k8s_loaded
        from kubernetes import client as k8s_client

        ensure_k8s_loaded()
        cfg = k8s_client.Configuration.get_default_copy()
        api_client = k8s_client.ApiClient(configuration=cfg)
        v1 = k8s_client.CoreV1Api(api_client=api_client)
        custom_api = k8s_client.CustomObjectsApi(api_client=api_client)

        kfp_run_id = pipeline_run.kfp_run_id

        # ── Find Argo workflow via pipeline/runid label ───────────────────────
        workflows = custom_api.list_namespaced_custom_object(
            group="argoproj.io",
            version="v1alpha1",
            namespace="kubeflow",
            plural="workflows",
            label_selector=f"pipeline/runid={kfp_run_id}",
        )
        wf_items = workflows.get("items", [])

        if not wf_items:
            logs.append(f"[platform] Run {kfp_run_id[:8]} — waiting for workflow to start...")
            return {
                "run_id": run_id,
                "kfp_run_id": kfp_run_id,
                "status": pipeline_run.status.value,
                "logs": logs,
            }

        wf = wf_items[0]
        workflow_name = wf["metadata"]["name"]
        wf_phase = wf.get("status", {}).get("phase", "Unknown")
        wf_progress = wf.get("status", {}).get("progress", "")

        logs.append(f"[platform] Workflow: {workflow_name}  |  phase: {wf_phase}  |  progress: {wf_progress}")
        logs.append("")

        # ── Fetch ALL pods for this run ───────────────────────────────────────
        all_pods = v1.list_namespaced_pod(
            namespace="kubeflow",
            label_selector=f"pipeline/runid={kfp_run_id}",
        )

        # Sort by creation time so logs appear in execution order
        sorted_pods = sorted(
            all_pods.items,
            key=lambda p: p.metadata.creation_timestamp or "",
        )

        def _add_pod_logs(pod):
            pod_name = pod.metadata.name
            phase = pod.status.phase or "Pending"
            phase_icon = {"Running": "⟳", "Succeeded": "✓", "Failed": "✗", "Pending": "◌"}.get(phase, "•")

            # Derive a human-readable step name from the pod name
            parts = pod_name.split("-")
            step = "-".join(parts[:-2]) if len(parts) > 3 else pod_name
            logs.append(f"┌── {phase_icon} {step}  [{phase}]")

            # Try every container in the pod (main, wait, init-containers…)
            containers = [c.name for c in (pod.spec.containers or [])]
            init_containers = [c.name for c in (pod.spec.init_containers or [])]
            all_containers = init_containers + containers

            got_any = False
            for container in all_containers:
                try:
                    log_text = v1.read_namespaced_pod_log(
                        name=pod_name,
                        namespace="kubeflow",
                        container=container,
                        tail_lines=None,   # ALL lines — no truncation
                    )
                    if log_text and log_text.strip():
                        if len(all_containers) > 1:
                            logs.append(f"│  ── container: {container} ──")
                        for line in log_text.splitlines():
                            logs.append(f"│  {line}")
                        got_any = True
                except Exception:
                    pass

            if not got_any:
                logs.append(f"│  [waiting for container to start...]")

            logs.append(f"└──")

        for pod in sorted_pods:
            _add_pod_logs(pod)
            logs.append("")

    except Exception as e:
        logger.warning(f"Error fetching pipeline logs: {e}")
        logs.append(f"[platform] Error fetching logs: {str(e)}")

    return {
        "run_id": run_id,
        "kfp_run_id": pipeline_run.kfp_run_id,
        "status": pipeline_run.status.value,
        "logs": logs,
        "user_script_logs": _filter_user_script_logs(logs),
    }


def _filter_user_script_logs(lines: list[str]) -> list[str]:
    """Project the full pod-log dump down to just what the user wrote / saw.

    Drops the ~500 lines of Argo executor + KFP driver + pod-spec JSON that
    dominate every step and bury the real error. Keeps:

    - the top-level workflow phase line
    - every `[platform] ...` line (the runner's own status messages)
    - the `=== STDOUT ===` / `=== STDERR ===` markers and everything after
      them within the same pod (where the user-script error actually is)

    Pods that contain none of the above (driver/dag scheduling pods) are
    dropped entirely so the result is small enough to scan at a glance.
    """
    out: list[str] = []
    pod_header: str | None = None
    pod_buffer: list[str] = []
    in_output_block = False
    pod_has_content = False

    for line in lines:
        if line.startswith("[platform] Workflow:"):
            out.append(line)
            continue
        if line.startswith("┌── "):
            pod_header = line
            pod_buffer = []
            in_output_block = False
            pod_has_content = False
            continue
        if line.startswith("└──"):
            if pod_has_content and pod_header is not None:
                out.append(pod_header)
                out.extend(pod_buffer)
                out.append(line)
                out.append("")
            pod_header = None
            pod_buffer = []
            in_output_block = False
            pod_has_content = False
            continue
        if pod_header is None:
            continue

        body = line[3:] if line.startswith("│  ") else line.lstrip("│ ")

        if body.startswith("=== STDOUT ===") or body.startswith("=== STDERR ==="):
            pod_buffer.append(line)
            pod_has_content = True
            in_output_block = True
            continue
        if body.startswith("[platform]"):
            pod_buffer.append(line)
            pod_has_content = True
            continue
        if in_output_block:
            pod_buffer.append(line)

    return out


async def get_pipeline_run_status(run_id: str, db: AsyncSession) -> dict:
    """Get status of a pipeline run from KFP and update DB."""
    result = await db.execute(
        select(PipelineRun).where(PipelineRun.id == run_id)
    )
    pipeline_run = result.scalar_one_or_none()
    if not pipeline_run:
        return None

    if pipeline_run.kfp_run_id and pipeline_run.status in (
        PipelineStatus.PENDING,
        PipelineStatus.RUNNING,
    ):
        try:
            client = _get_kfp_client()
            kfp_run = client.get_run(pipeline_run.kfp_run_id)
            state = kfp_run.state

            status_map = {
                "SUCCEEDED": PipelineStatus.SUCCEEDED,
                "FAILED": PipelineStatus.FAILED,
                "RUNNING": PipelineStatus.RUNNING,
                "PENDING": PipelineStatus.PENDING,
            }
            new_status = status_map.get(state, PipelineStatus.RUNNING)

            if new_status != pipeline_run.status:
                pipeline_run.status = new_status
                if new_status in (PipelineStatus.SUCCEEDED, PipelineStatus.FAILED):
                    pipeline_run.finished_at = datetime.now(timezone.utc)
                await db.commit()
                await db.refresh(pipeline_run)
        except Exception as e:
            logger.warning(f"Failed to fetch KFP run status: {e}")

    return {
        "id": pipeline_run.id,
        "project_id": pipeline_run.project_id,
        "kfp_run_id": pipeline_run.kfp_run_id,
        "status": pipeline_run.status.value,
        "pipeline_type": pipeline_run.pipeline_type,
        "parameters": pipeline_run.parameters,
        "started_at": pipeline_run.started_at.isoformat() if pipeline_run.started_at else None,
        "finished_at": pipeline_run.finished_at.isoformat() if pipeline_run.finished_at else None,
    }


async def list_pipeline_runs(project_id: str, db: AsyncSession) -> list[dict]:
    """List pipeline runs for a project, syncing KFP status for in-flight runs."""
    result = await db.execute(
        select(PipelineRun)
        .where(PipelineRun.project_id == project_id)
        .order_by(PipelineRun.started_at.desc())
    )
    runs = result.scalars().all()

    # Sync status from KFP for any run still marked PENDING/RUNNING
    status_map = {
        "SUCCEEDED": PipelineStatus.SUCCEEDED,
        "FAILED":    PipelineStatus.FAILED,
        "CANCELED":  PipelineStatus.FAILED,
        "RUNNING":   PipelineStatus.RUNNING,
        "PENDING":   PipelineStatus.PENDING,
    }
    dirty = False
    try:
        client = _get_kfp_client()
        for r in runs:
            if r.status not in (PipelineStatus.PENDING, PipelineStatus.RUNNING):
                continue
            if not r.kfp_run_id:
                continue
            try:
                kfp_run = client.get_run(r.kfp_run_id)
                new_status = status_map.get(kfp_run.state, r.status)
                if new_status != r.status:
                    r.status = new_status
                    if new_status in (PipelineStatus.SUCCEEDED, PipelineStatus.FAILED):
                        r.finished_at = datetime.now(timezone.utc)
                    dirty = True
            except Exception:
                pass
        if dirty:
            await db.commit()
    except Exception:
        pass

    return [
        {
            "id": r.id,
            "project_id": r.project_id,
            "kfp_run_id": r.kfp_run_id,
            "status": r.status.value,
            "pipeline_type": r.pipeline_type,
            "parameters": r.parameters,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
        }
        for r in runs
    ]


async def delete_pipeline_run(run_id: str, db: AsyncSession) -> bool:
    result = await db.execute(select(PipelineRun).where(PipelineRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        return False

    if run.kfp_run_id:
        try:
            client = kfp.Client(host=settings.KFP_HOST)
            try:
                client._run_api.terminate_run(run_id=run.kfp_run_id)
            except Exception:
                pass
        except Exception:
            pass

    await db.delete(run)
    await db.commit()
    return True

