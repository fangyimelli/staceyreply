# PR Notes

## Summary
This patch updates project instructions, docs, checklist generation, and UI copy to align with the fixed `data/` raw CSV -> preprocessing -> pair selection -> automatic load flow.

## What changed
- Rewrote root requirements and README sections around the fixed `data/` dataset pipeline
- Updated acceptance checklist generators to describe FRD/FGD auto-scan, ±2 day event windows, structured replay datasets, and pair-only UI wording
- Cleaned app-facing copy so it only describes the fixed `data/` preprocessing and pair-selection flow
- Updated change-log / PR notes language to stay aligned with the fixed replay dataset flow

## Verification checklist
- `npm run checklist`
- `npm run build`
- Open app and confirm replay UI copy references fixed `data/` pair selection flow only
- Confirm generated docs/checklists stay aligned with the fixed `data/` → preprocess → pair selection → auto-load flow
