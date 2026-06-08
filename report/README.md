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

```powershell
cd report
latexmk -pdf -outdir=build main.tex   # pdflatex + biber, reruns as needed
```
Output: `build/main.pdf`. Clean aux files with `latexmk -c`.

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
frontmatter/             cover, dedication, acknowledgments
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

## What still needs YOUR input (search the `.tex` files for `>>> USER` and `<<...>>`)

- **INSOMEA** real presentation text + org chart (Chapter 1).
- **Sprint dates** on the Gantt chart (Chapter 3) and **story points** in the
  backlog tables if they differ from the estimates.
- **Burndown** y-values per sprint (Chapters 4–7) — replace with your real data.
- **Screenshots** of the UI for each sprint's "User Interface" section.
- **Cover page** details (school name, diploma, supervisors, jury, year).
- Decide whether an **English abstract + French résumé** are required and whether
  **appendices** are wanted (both easy to add).

## Notes

- Uses only Overleaf-bundled packages (no `minted`, no shell-escape).
- `report` document class with a hand-rolled preamble so it builds with zero
  external files. To use the school's official `.cls`, replace the
  `\documentclass` line in `main.tex` and the cover in `frontmatter/coverpage.tex`;
  everything else stays.
