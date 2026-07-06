# Soutenance presentation — animated Reveal.js deck

Fully offline: everything (reveal.js + images) is inside this folder. You can
zip and carry it on a USB stick.

## Present

1. Open `index.html` in **Chrome** (double-click).
2. Press **F11** for fullscreen.
3. Navigate: **→ / Space** next animation step, **←** back, **Esc** slide overview.
4. Press **S** to open the **speaker notes** window (your rehearsal script is on
   every slide — put it on the laptop screen, slides on the projector).
5. Press **B** to black the screen during the live demo, **F** to re-fullscreen.

## Export a PDF (for submission / backup)

1. Open `index.html?print-pdf` in Chrome (add `?print-pdf` to the URL).
2. `Ctrl+P` → Destination **Save as PDF** → Layout **Landscape** →
   Margins **None** → enable **Background graphics** → Save.

## Edit

- **Swap a screenshot**: replace the file in `assets/` (same name) — e.g. after
  redeploying, retake `screen_experiments.png` or add a Monitoring-tab capture.
- **Change text**: edit `index.html` — each slide is one `<section>` block with
  a comment header (`<!-- 14 ─ SPRINT 1 -->` …).
- **Animation steps**: elements with `class="fragment"` appear one keypress at
  a time; remove the class to show them immediately.

## PowerPoint version

`MLOps_Soutenance.pptx` — the same 25 slides (same design, images and speaker
notes) as a native PowerPoint file.

- **Regenerate** (e.g. after swapping a screenshot in `assets/`):
  `python make_pptx.py`
- **Animations**: python-pptx cannot script PowerPoint animations, so the .pptx
  is static. To animate like the HTML deck: select the shapes on a slide →
  **Animations → Fade** → in the Animation Pane order them top-to-bottom
  (cards, table rows, flow nodes are separate shapes, so this takes seconds
  per slide). The HTML deck (`index.html`) remains the fully-animated version.
- **Speaker notes** are already included on every slide (View → Notes).

## Slide map

| # | Slide | # | Slide |
|---|---|---|---|
| 1 | Title | 14 | Sprint 1 — Foundation |
| 2 | Agenda | 15 | Sprint 2 — Training pipeline (animated) |
| 3 | Host company (INSOMEA) | 16 | Notebook → script conversion |
| 4 | Project context | 17 | Experiments intelligence |
| 5 | Problem & objectives | 18 | Sprint 3 — Deploy flow (animated) |
| 6 | State of the art | 19 | Prediction & public API |
| 7 | Solution — lifecycle ring (animated) | 20 | Sprint 4 — Observability & admin |
| 8 | BO & DSO | 21 | Case study — churn |
| 9 | Methodology — 4 sprints | 22 | LIVE DEMO |
| 10 | Global use case diagram | 23 | Conclusion |
| 11 | Technology choices | 24 | Perspectives |
| 12 | Logical architecture (animated) | 25 | Thank you |
| 13 | Deployment architecture | | |
