"""Unit tests for the upload-time notebook → script converter.

Covers the exact failure modes of the old in-pod regex approach: string
corruption, deleted pip installs, dropped %%time bodies, `x = !cmd`
NameErrors, and late/opaque failures on corrupt input.

Imports the module directly (stdlib + nbformat + IPython only), so the tests
run without the app's DB/settings stack.
"""

import ast
import io
import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.notebook_converter import (  # noqa: E402
    convert_notebook_bytes,
    convert_notebooks_in_zip,
)


def nb_bytes(*cells: tuple[str, str]) -> bytes:
    """Build a minimal v4 notebook. cells = (cell_type, source)."""
    return json.dumps({
        "nbformat": 4,
        "nbformat_minor": 5,
        "metadata": {},
        "cells": [
            {
                "cell_type": ctype,
                "source": src,
                "metadata": {},
                **({"outputs": [], "execution_count": None} if ctype == "code" else {}),
            }
            for ctype, src in cells
        ],
    }).encode("utf-8")


def convert(*cells: tuple[str, str]):
    return convert_notebook_bytes(nb_bytes(*cells), "test.ipynb")


def warning_codes(result) -> set[str]:
    return {w.code for w in result.warnings}


# ── string safety (the bug that corrupted code before) ─────────────────────


def test_magic_lookalikes_inside_strings_survive():
    src = (
        'doc = """\n'
        "%matplotlib inline\n"
        "!pip install fake\n"
        "get_ipython().run_line_magic('x', 'y')\n"
        '"""\n'
        "value = 100 % 7\n"
    )
    result = convert(("code", src))
    assert result.ok
    # the pure-Python cell must be emitted byte-for-byte
    assert src.rstrip("\n") in result.script
    assert result.pip_packages == []


def test_continuation_line_starting_with_percent_survives():
    src = "x = (10\n     % 3)\n"
    result = convert(("code", src))
    assert result.ok
    assert "% 3)" in result.script


# ── dependency preservation ────────────────────────────────────────────────


def test_pip_install_becomes_subprocess_and_packages_collected():
    result = convert(("code", "!pip install xgboost lightgbm==4.3.0\nimport xgboost"))
    assert result.ok
    assert "subprocess.check_call([sys.executable, '-m', 'pip', 'install'" in result.script
    assert "xgboost" in result.pip_packages
    assert "lightgbm==4.3.0" in result.pip_packages
    assert "import os, subprocess, sys" in result.script


def test_percent_pip_magic_also_converted():
    result = convert(("code", "%pip install scikit-learn"))
    assert result.ok
    assert "scikit-learn" in result.pip_packages


# ── cell magics ────────────────────────────────────────────────────────────


def test_time_cell_magic_body_is_kept():
    result = convert(("code", "%%time\nmodel.fit(X, y)\nscore = model.score(X, y)"))
    assert result.ok
    assert "model.fit(X, y)" in result.script
    assert "score = model.score(X, y)" in result.script
    assert "cell_magic_body_kept" in warning_codes(result)


def test_bash_cell_becomes_subprocess():
    result = convert(("code", "%%bash\necho hello\nls -la"))
    assert result.ok
    assert "subprocess.run" in result.script
    assert "echo hello" in result.script


def test_writefile_cell_becomes_real_write():
    result = convert(("code", "%%writefile config.yaml\nlr: 0.1\nepochs: 10"))
    assert result.ok
    assert "open('config.yaml', 'w'" in result.script
    assert "lr: 0.1" in result.script


def test_html_cell_is_commented_out():
    result = convert(("code", "%%html\n<b>hello</b>"))
    assert result.ok
    assert "<b>hello</b>" not in [
        ln for ln in result.script.splitlines() if not ln.lstrip().startswith("#")
    ]
    assert "cell_magic_commented" in warning_codes(result)


# ── shell escapes ──────────────────────────────────────────────────────────


def test_assignment_shell_escape_captures_output():
    result = convert(("code", "files = !ls -la\nprint(files)"))
    assert result.ok
    assert "files = subprocess.run" in result.script
    assert ".stdout.splitlines()" in result.script


def test_wget_becomes_subprocess():
    result = convert(("code", "!wget https://example.com/data.csv"))
    assert result.ok
    assert "subprocess.run('wget https://example.com/data.csv'" in result.script


# ── line magics ────────────────────────────────────────────────────────────


def test_matplotlib_inline_commented_and_code_kept():
    result = convert(("code", "%matplotlib inline\nimport pandas as pd\npd.DataFrame()"))
    assert result.ok
    assert "import pandas as pd" in result.script
    active = [ln for ln in result.script.splitlines() if not ln.lstrip().startswith("#")]
    assert not any("%matplotlib" in ln for ln in active)


def test_cd_becomes_os_chdir():
    result = convert(("code", "%cd /content/drive"))
    assert result.ok
    assert "os.chdir('/content/drive')" in result.script


def test_time_line_magic_keeps_statement():
    result = convert(("code", "%time model.fit(X, y)"))
    assert result.ok
    assert "model.fit(X, y)" in result.script


# ── markdown / structure ───────────────────────────────────────────────────


def test_markdown_titles_preserved_as_comments():
    result = convert(
        ("markdown", "## Data loading\nSome notes about the dataset."),
        ("code", "x = 1"),
    )
    assert result.ok
    assert "# ## Data loading" in result.script
    assert "# Some notes about the dataset." in result.script
    assert "(markdown)" in result.script


# ── robustness ─────────────────────────────────────────────────────────────


def test_corrupt_json_returns_not_ok():
    result = convert_notebook_bytes(b"{ not json !!", "bad.ipynb")
    assert not result.ok
    assert "notebook_unreadable" in warning_codes(result)


def test_empty_notebook_warns():
    result = convert(("markdown", "just text"))
    assert result.ok
    assert "empty_notebook" in warning_codes(result)


def test_syntax_error_cell_skipped_but_rest_survives():
    result = convert(("code", "def broken(:\n    pass"), ("code", "x = 42"))
    assert result.ok
    assert "cell_syntax_error" in warning_codes(result)
    assert "x = 42" in result.script


def test_top_level_await_commented_with_warning():
    result = convert(("code", "await fetch_data()"))
    assert result.ok
    assert "top_level_await" in warning_codes(result)


def test_nbformat_v3_notebook_converts():
    v3 = json.dumps({
        "nbformat": 3,
        "nbformat_minor": 0,
        "metadata": {},
        "worksheets": [{
            "cells": [{
                "cell_type": "code",
                "input": "print('hello v3')",
                "language": "python",
                "outputs": [],
                "metadata": {},
            }],
            "metadata": {},
        }],
    }).encode()
    result = convert_notebook_bytes(v3, "old.ipynb")
    assert result.ok
    assert "print('hello v3')" in result.script


def test_every_converted_script_parses():
    gnarly = convert(
        ("markdown", "# Title"),
        ("code", "!pip install torch\n%matplotlib inline"),
        ("code", "%%time\nimport torch\nmodel = torch.nn.Linear(2, 1)"),
        ("code", "files = !ls\nfor f in files:\n    print(f)"),
        ("code", 's = """\n%%bash\n!not a command\n"""'),
    )
    assert gnarly.ok
    ast.parse(gnarly.script)  # must never raise


def test_nested_magic_gets_runtime_shim():
    result = convert(("code", "if True:\n    !echo nested"))
    assert result.ok
    assert "def get_ipython()" in result.script
    assert "nested_magics_shimmed" in warning_codes(result)
    ast.parse(result.script)


# ── zip handling ───────────────────────────────────────────────────────────


def test_zip_gets_converted_script_added():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("train.ipynb", nb_bytes(("code", "print('from zip')")).decode())
        z.writestr("data/info.txt", "hello")
    new_bytes, conversions = convert_notebooks_in_zip(buf.getvalue())

    assert len(conversions) == 1
    assert conversions[0]["ok"]
    assert conversions[0]["script"] == "train.py"
    with zipfile.ZipFile(io.BytesIO(new_bytes)) as z:
        names = z.namelist()
        assert "train.py" in names
        assert "train.ipynb" in names      # original preserved
        assert "data/info.txt" in names    # other members untouched
        assert "print('from zip')" in z.read("train.py").decode()


def test_zip_name_collision_uses_converted_suffix():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("train.ipynb", nb_bytes(("code", "x = 1")).decode())
        z.writestr("train.py", "print('existing')")
    new_bytes, conversions = convert_notebooks_in_zip(buf.getvalue())
    assert conversions[0]["script"] == "train_converted.py"
    with zipfile.ZipFile(io.BytesIO(new_bytes)) as z:
        assert z.read("train.py").decode() == "print('existing')"


def test_bad_zip_returned_untouched():
    data = b"definitely not a zip"
    new_bytes, conversions = convert_notebooks_in_zip(data)
    assert new_bytes == data
    assert conversions == []


def test_checkpoint_notebooks_ignored():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(".ipynb_checkpoints/train-checkpoint.ipynb",
                   nb_bytes(("code", "x = 1")).decode())
    _, conversions = convert_notebooks_in_zip(buf.getvalue())
    assert conversions == []
