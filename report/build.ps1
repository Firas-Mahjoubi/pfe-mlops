<#
  Perl-free build for the PFE report.

  MiKTeX's `latexmk` is a Perl script and MiKTeX ships no Perl, so `latexmk`
  fails with "could not find the script engine 'perl'". This script avoids
  latexmk entirely: it chains the native MiKTeX executables, which need no Perl:

      pdflatex  ->  biber  ->  pdflatex  ->  pdflatex

  Usage (from a PowerShell session in report/):
      ./build.ps1
  Or from anywhere:
      powershell -ExecutionPolicy Bypass -File D:\pfe\report\build.ps1

  Output: build/main.pdf
#>
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$miktexBin = "$env:LOCALAPPDATA\Programs\MiKTeX\miktex\bin\x64"
function Resolve-Tool($name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $fallback = Join-Path $miktexBin "$name.exe"
  if (Test-Path $fallback) { return $fallback }
  throw "Could not find '$name'. Install MiKTeX and ensure it is on PATH."
}

$pdflatex = Resolve-Tool 'pdflatex'
$biber    = Resolve-Tool 'biber'
$latexArgs = @('-interaction=nonstopmode','-halt-on-error','-file-line-error',
               '-synctex=1','-output-directory=build','main.tex')

New-Item -ItemType Directory -Force -Path 'build' | Out-Null

function Invoke-Step($label, $exe, $arglist) {
  Write-Host "==> $label" -ForegroundColor Cyan
  & $exe @arglist
  if ($LASTEXITCODE -ne 0) { throw "$label failed (exit $LASTEXITCODE). See build/main.log." }
}

Invoke-Step 'pdflatex (pass 1/3)' $pdflatex $latexArgs
Invoke-Step 'biber'               $biber    @('--input-directory=build','--output-directory=build','main')
Invoke-Step 'pdflatex (pass 2/3)' $pdflatex $latexArgs
Invoke-Step 'pdflatex (pass 3/3)' $pdflatex $latexArgs

Write-Host ''
Write-Host 'Success -> build/main.pdf' -ForegroundColor Green
