"""Static pre-flight analyzer for user-uploaded training code.

Walks a `.py` or `.ipynb` file (or a directory tree from an extracted zip)
with `ast` and surfaces warnings for patterns that won't break the runner
but will silently produce a useless run -- no model, no MLflow log, or a
hard crash mid-script.

Pure-Python, no network, no subprocesses. Safe to call from a request
handler. All warnings are advisory: nothing here is fatal, the user can
always click Run anyway.

The detectors target the specific failure modes the encadreur flagged
after the first restitution -- see [[plan-toasty-petting-hare]].
"""

from __future__ import annotations

import ast
import os
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable


@dataclass
class CodeWarning:
    code: str
    message: str
    severity: str = "warn"            # "warn" | "info"
    line_no: int | None = None
    snippet: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


# ── File discovery (mirrors the runner's auto-detect priority) ────────────

_ENTRY_PRIORITY = ("train.py", "main.py", "run.py", "model.py")


def _resolve_entry(root: Path, hint: str = "") -> Path | None:
    """Pick the entry file in a directory the same way the runner does."""
    if hint:
        candidate = root / hint
        if candidate.exists():
            return candidate

    for name in _ENTRY_PRIORITY:
        candidate = root / name
        if candidate.exists():
            return candidate

    # First .py — mirrors the runner, which prefers scripts over notebooks
    # since upload-time conversion ships a .py beside every notebook.
    for p in sorted(root.rglob("*.py")):
        if not p.name.startswith("_"):
            return p

    # First .ipynb
    for p in sorted(root.rglob("*.ipynb")):
        if not p.name.startswith("_"):
            return p

    return None


# ── Notebook handling ─────────────────────────────────────────────────────


def _notebook_to_source(nb_path: Path) -> tuple[str, list[tuple[int, int]], list[CodeWarning]]:
    """Convert a notebook into the Python source the platform will actually run.

    Delegates to `notebook_converter` -- the same converter that produces the
    uploaded `.py` -- so the analyzer's AST detectors see exactly the code
    that executes on the cluster, and its conversion notes (pip installs
    preserved, magics translated, cells commented out) surface as warnings.

    Returns (source, cell_line_offsets, warnings); offsets kept for signature
    compatibility.
    """
    from app.services import notebook_converter

    try:
        data = nb_path.read_bytes()
    except Exception:
        return "", [], [CodeWarning(
            code="notebook_unreadable",
            message=f"Could not read {nb_path.name}.",
        )]

    result = notebook_converter.convert_notebook_bytes(data, nb_path.name)
    warnings = [
        CodeWarning(
            code=w.code,
            message=w.message,
            severity=w.severity,
            line_no=w.line_no,
            snippet=w.snippet,
        )
        for w in result.warnings
    ]
    if not result.ok:
        return "", [], warnings
    return result.script, [], warnings


# ── AST detectors ─────────────────────────────────────────────────────────


_HARDCODED_PATH_PATTERNS = [
    re.compile(r"^[A-Za-z]:[\\/]"),                        # C:\... or C:/...
    re.compile(r"^/home/[^/]+/"),
    re.compile(r"^/Users/[^/]+/"),
    re.compile(r"^~[/\\]"),
    re.compile(r"[\\/](Desktop|Downloads|Documents)[\\/]", re.IGNORECASE),
]

# String literals shorter than this are almost certainly not paths
# (avoids flagging `"/"` or `"C:"` alone).
_MIN_PATH_LEN = 6


def _looks_like_hardcoded_path(value: str) -> bool:
    if not isinstance(value, str) or len(value) < _MIN_PATH_LEN:
        return False
    return any(p.search(value) for p in _HARDCODED_PATH_PATTERNS)


def _is_attr_call(node: ast.AST, attr_name: str) -> bool:
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == attr_name
    )


def _is_name_call(node: ast.AST, names: Iterable[str]) -> bool:
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in set(names)
    )


def _detect_python(source: str, *, filename: str = "<source>") -> list[CodeWarning]:
    """Run all detectors on a single Python source string."""
    warnings: list[CodeWarning] = []
    try:
        tree = ast.parse(source, filename=filename)
    except SyntaxError as exc:
        return [CodeWarning(
            code="syntax_error",
            message=f"Cannot parse code: {exc.msg} (line {exc.lineno}).",
            line_no=exc.lineno,
            severity="warn",
        )]

    has_fit_call = False
    has_log_model = False
    uses_argparse_import = False
    uses_argparse_call = False
    argparse_line: int | None = None
    sys_exit_at_top: list[int] = []
    colab_line: int | None = None
    colab_submodules: set[str] = set()

    # Top-level statements -- needed to distinguish "sys.exit() at module
    # level" (will abort training) from "sys.exit() inside a never-called
    # function" (probably fine).
    top_level_nodes = set(id(n) for n in tree.body)

    for node in ast.walk(tree):
        # --- .fit(...) somewhere ---
        if _is_attr_call(node, "fit"):
            has_fit_call = True

        # --- mlflow.<flavor>.log_model(...) or mlflow.log_model(...) ---
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr in ("log_model", "save_model"):
                has_log_model = True

        # --- import argparse / from argparse import ... ---
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "argparse":
                    uses_argparse_import = True
                    argparse_line = argparse_line or node.lineno
                # `import google.colab` / `import google.colab.files`
                if alias.name == "google.colab" or alias.name.startswith("google.colab."):
                    colab_line = colab_line or node.lineno
                    colab_submodules.add(alias.name.removeprefix("google.colab.") or "(root)")
        if isinstance(node, ast.ImportFrom):
            if node.module == "argparse":
                uses_argparse_import = True
                argparse_line = argparse_line or node.lineno
            # `from google.colab import files` / `from google.colab.drive import ...`
            if node.module and (node.module == "google.colab" or node.module.startswith("google.colab.")):
                colab_line = colab_line or node.lineno
                for alias in node.names:
                    colab_submodules.add(alias.name)

        # --- ArgumentParser(...) call ---
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Attribute) and func.attr == "ArgumentParser":
                uses_argparse_call = True
                argparse_line = argparse_line or node.lineno
            if isinstance(func, ast.Name) and func.id == "ArgumentParser":
                uses_argparse_call = True
                argparse_line = argparse_line or node.lineno

        # --- Hardcoded path string literals ---
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            if _looks_like_hardcoded_path(node.value):
                warnings.append(CodeWarning(
                    code="hardcoded_path",
                    message=(
                        f"Hardcoded local path `{node.value}` won't exist on the "
                        f"training pod. Read from `os.environ['DATASET_PATH']` "
                        f"instead (the platform sets it to the uploaded dataset)."
                    ),
                    line_no=getattr(node, "lineno", None),
                    snippet=node.value[:80],
                ))

        # --- Top-level sys.exit() / exit() / quit() ---
        if id(node) in top_level_nodes and isinstance(node, ast.Expr):
            call = node.value
            if isinstance(call, ast.Call):
                if (
                    isinstance(call.func, ast.Attribute)
                    and call.func.attr == "exit"
                    and isinstance(call.func.value, ast.Name)
                    and call.func.value.id == "sys"
                ) or _is_name_call(call, ("exit", "quit")):
                    sys_exit_at_top.append(call.lineno)

    if sys_exit_at_top:
        warnings.append(CodeWarning(
            code="sys_exit",
            message=(
                "Top-level `sys.exit()` / `exit()` will abort the script "
                "before training finishes."
            ),
            line_no=sys_exit_at_top[0],
        ))

    if uses_argparse_import or uses_argparse_call:
        warnings.append(CodeWarning(
            code="argparse_used",
            message=(
                "Your code uses `argparse`. The platform runs the script "
                "with no CLI flags, so make sure every argument has a "
                "`default=...` (the runner will fall back to defaults on "
                "missing args, but required flags without defaults still "
                "fail)."
            ),
            line_no=argparse_line,
        ))

    if not has_fit_call and not has_log_model:
        warnings.append(CodeWarning(
            code="no_model_fit",
            message=(
                "No `.fit(...)` or `mlflow.*.log_model(...)` call found. "
                "The run will finish but won't produce a model -- nothing "
                "to register or deploy."
            ),
        ))

    if colab_line is not None:
        used = ", ".join(sorted(colab_submodules)) or "?"
        warnings.append(CodeWarning(
            code="colab_imports",
            severity="info",
            message=(
                f"Notebook uses `google.colab` ({used}). The platform "
                "auto-stubs `files.upload()` (returns your uploaded "
                "dataset), `files.download()` / `drive.mount()` (no-ops), "
                "and `userdata.get()` (reads env vars). Code relying on "
                "Colab-specific behaviour beyond these may not run."
            ),
            line_no=colab_line,
        ))

    return warnings


# ── Public entry point ────────────────────────────────────────────────────


def analyze(path: str | os.PathLike, *, entry_hint: str = "") -> dict:
    """Analyze a .py / .ipynb / directory and return warnings.

    Returns: ``{"entry_script": <relative path or "">, "warnings": [...]}``.
    Never raises -- a fully unreadable file produces a single warning
    instead of an exception.
    """
    p = Path(path)

    if p.is_dir():
        entry = _resolve_entry(p, entry_hint)
        if entry is None:
            return {
                "entry_script": "",
                "warnings": [CodeWarning(
                    code="no_entry_found",
                    message=(
                        "No .py or .ipynb file found in the upload. "
                        "Make sure the zip contains your training script."
                    ),
                ).to_dict()],
            }
        rel = str(entry.relative_to(p)).replace("\\", "/")
        warnings = _analyze_file(entry)
        return {"entry_script": rel, "warnings": [w.to_dict() for w in warnings]}

    if p.is_file():
        warnings = _analyze_file(p)
        return {"entry_script": p.name, "warnings": [w.to_dict() for w in warnings]}

    return {
        "entry_script": "",
        "warnings": [CodeWarning(
            code="not_found",
            message=f"Path not found: {p}",
        ).to_dict()],
    }


def _analyze_file(p: Path) -> list[CodeWarning]:
    suffix = p.suffix.lower()

    if suffix == ".ipynb":
        source, _offsets, magic_warnings = _notebook_to_source(p)
        if not source:
            return magic_warnings or [CodeWarning(
                code="empty_notebook",
                message="Notebook contains no executable code cells.",
            )]
        return magic_warnings + _detect_python(source, filename=p.name)

    if suffix == ".py":
        try:
            source = p.read_text(encoding="utf-8")
        except Exception as exc:
            return [CodeWarning(
                code="unreadable",
                message=f"Could not read {p.name}: {exc}",
            )]
        return _detect_python(source, filename=p.name)

    # Anything else (.zip handed in directly, .txt, etc.) -- skip silently.
    return []
