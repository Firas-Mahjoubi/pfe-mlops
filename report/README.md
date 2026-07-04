# PFE Report — LaTeX source

End-of-studies project report for the MLOps platform. English, engineering
cycle, Scrum (4 sprints).

## Compile locally — MiKTeX + VS Code (recommended)

The free Overleaf plan caps compile time and this report exceeds it, so build
locally. One-time setup:

1. **Install MiKTeX** (the LaTeX engine). In an **elevated** PowerShell:
   ```powershell
   winget install --id MiKTeX.MiKTeX -e
   ```
   Then enable automatic package installation (so `pgfplots`, `pgfgantt`,
   `glossaries`, `biber`, … pull on first use):
   ```powershell
   initexmf --set-config-value "[MPM]AutoInstall=1"
   ```
   (Or open *MiKTeX Console → Settings → "Always install missing packages".*)
   Open a **fresh** terminal and confirm:
   ```powershell
   pdflatex --version
   biber --version
   ```
   If `biber` is missing: `mpm --install=biber`.

2. **Install the VS Code extension** `James-Yu.latex-workshop`
   (Extensions panel → search "LaTeX Workshop").

3. **Open the `report/` folder in VS Code.** The committed
   `.vscode/settings.json` and `.latexmkrc` make LaTeX Workshop:
   - build on **save**,
   - output to `build/`,
   - preview `build/main.pdf` in a side tab (SyncTeX: ctrl/cmd-click to jump
     between source and PDF).

   First build is slow (MiKTeX downloads packages); later builds are fast.
   To build manually: open `main.tex`, then *LaTeX Workshop: Build LaTeX project*
   (or the ▶ button), or press the green build action.

## Compile locally — command line

**Use the build script (recommended on Windows / MiKTeX):**
```powershell
cd report
./build.ps1
```
Output: `build/main.pdf`. The script chains `pdflatex → biber → pdflatex → pdflatex`
using MiKTeX's native executables.

> **Why not `latexmk`?** MiKTeX's `latexmk` is a *Perl* script and MiKTeX does not
> bundle Perl, so `latexmk` fails with *"could not find the script engine 'perl'"*.
> `build.ps1` (and the VS Code recipe below) avoid latexmk entirely. If you prefer
> the `latexmk` workflow, install Perl once — `winget install --id
> StrawberryPerl.StrawberryPerl -e` — then `latexmk -pdf -outdir=build main.tex`
> works.

> **VS Code build-on-save:** open the **`report/` folder itself** in VS Code (not
> the repository root) so the committed `report/.vscode/settings.json` — which
> already uses the Perl-free `pdflatex + biber` recipe — is applied.

## Compile with Docker (zero install)

You already have Docker; this needs no TeX on Windows:
```powershell
docker run --rm -v "${PWD}:/work" -w /work texlive/texlive `
  latexmk -pdf -outdir=build main.tex
```
Slower per run and no live preview — use as a fallback.

## Compile on Overleaf (alternative)

Upload the `report/` contents (so `main.tex` is at the zip root) or link a Git
project. Settings: **Compiler = pdfLaTeX**, **Main document = main.tex**, biber is
default. Recompile twice. (Free-tier compile-time limit is why local is
preferred.)

## File layout

```
main.tex                 preamble + document assembly (swap class here for school template)
references.bib           bibliography (add entries, cite with \cite{key})
glossary.tex             acronyms (use \gls{key} in text)
frontmatter/             cover, dedication, acknowledgments (+ optional cover_official.pdf / validation_form.pdf)
chapters/                00 intro · 01–07 body · 08 conclusion
diagrams/                PlantUML sources (.puml) — render to PDF into images/
images/                  all figures (PDF for diagrams, PNG for screenshots)
```

## Rendering the diagrams

The `diagrams/*.puml` files are UML sources. Render each to PDF and drop it in
`images/` with the filename the chapters expect (see `images/.gitkeep`):

- **Easiest:** paste a `.puml` file into <https://www.plantuml.com/plantuml> and
  download the PDF.
- **CLI:** `plantuml -tpdf diagrams/seq_login.puml` then move the PDF to `images/`.
- **VS Code:** the *PlantUML* extension previews + exports.

For the **architecture** figure, prefer redrawing in [draw.io](https://draw.io)
for a polished result (the `.puml` is a faithful starting point).

The chapters currently show **framed placeholders** where figures go; they
compile fine without the images. Replace each placeholder with the
`\includegraphics` line already commented just above it.

## Official ESPRIT cover page + validation form

The report uses the school's official **page de garde** when you provide it, and
falls back to the hand-built LaTeX cover (`frontmatter/coverpage.tex`) otherwise —
so the build never breaks. To use the official cover:

1. Fill the ESPRIT cover template with these values (kept consistent with the report
   body): **Year** 2025–2026 · **Specialty** Software Engineering · **Title**
   "Design and Implementation of an End-to-End MLOps Platform…" · **By** Firas
   Mahjoubi · **Academic supervisor** Mr. Ben Mardes Achref · **Corporate
   Internship Supervisor** Mr. Amine Gonji · **Company logo** INSOMEA
   (`logo/insomea.png`).
2. Export it and drop it in as **`frontmatter/cover_official.pdf`**.
3. Fill/sign/scan the supervisor validation form and drop it in as
   **`frontmatter/validation_form.pdf`** — `main.tex` inserts it right after the
   cover, as the faculty requires.

`main.tex` includes both automatically via `\includepdf` (guarded by
`\IfFileExists`, so missing files just fall back). No `.tex` edits needed.

## What still needs YOUR input

- **Official cover + validation form** PDFs (see the section above).
- **Jury names** on the LaTeX fallback cover — `frontmatter/coverpage.tex`,
  President and Reviewer lines (only relevant if the official cover isn't used).

## Notes

- Uses only Overleaf-bundled packages (no `minted`, no shell-escape).
- `report` document class with a hand-rolled preamble so it builds with zero
  external files. To use the school's official `.cls`, replace the
  `\documentclass` line in `main.tex` and the cover in `frontmatter/coverpage.tex`;
  everything else stays.
