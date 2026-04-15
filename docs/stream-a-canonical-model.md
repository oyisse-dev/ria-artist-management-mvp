# Stream A — Canonical Model Decision (A1)

## Decision
For Phase 2 closeout, **canonical runtime model remains legacy-first**:

- Primary runtime tables:
  - `project_checklists`
  - `checklist_completions`

- Transitional/alignment tables (kept active but secondary):
  - `checklist_items`
  - `checklist_submissions`

## Why this decision now
1. Current UI and role flows are already stable on legacy tables.
2. We avoid introducing new regressions while completing Stream A/B/C.
3. We can continue parity backfill and migrate to new canonical in a controlled Phase 2.5 cutover.

## Rules during Stream A
- Any new feature must read/write **legacy-first**.
- New-model writes are allowed only via explicit sync/backfill jobs.
- Avoid mixed ambiguous reads in the same operation path.

## Exit criteria for A1
- Canonical decision documented (this file)
- Function/query paths updated to legacy-first where needed
- Parity verification script available and repeatable

## Next cutover trigger (future)
Only switch canonical to `checklist_items/checklist_submissions` when:
- parity checks are consistently green,
- all CRUD + approval + digest paths pass role QA,
- one full release cycle runs with zero data drift.
