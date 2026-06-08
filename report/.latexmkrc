# latexmk configuration for the PFE report.
# Used by `latexmk` directly and by VS Code LaTeX Workshop.
#
#   latexmk            -> build build/main.pdf (pdflatex + biber, reruns as needed)
#   latexmk -c         -> clean aux files
#   latexmk -pvc       -> watch mode (rebuild on save)

$pdf_mode    = 1;     # produce PDF via pdflatex
$bibtex_use  = 2;     # run biber/bibtex automatically when needed
$out_dir     = 'build';

# pdflatex with non-stop mode, SyncTeX (for editor click-through), and
# file:line:error messages that editors can parse.
$pdflatex = 'pdflatex -interaction=nonstopmode -synctex=1 -file-line-error %O %S';

# biblatex uses biber as its backend.
$biber = 'biber %O %S';

# Files latexmk should also remove on `-c` / `-C`.
$clean_ext = 'synctex.gz acn acr alg glo gls glg ist bbl bcf run.xml nav snm';
