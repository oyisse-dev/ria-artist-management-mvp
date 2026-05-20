# Milestone 3 — Release Readiness

## Scope Completed

This PR now includes Milestone 1 + 2 + 3 streams:

- Checklist redesign UX (detailed/table/board, right panel, mobile sheet)
- Priority, filters, search, inline quick actions, DnD board moves
- Team workload indicators, finance linkage, audit live feed
- Analytics dashboard widgets (donut, milestones, trend, interactive status jumps)
- Data model alignment foundations (`checklist_items`, `checklist_submissions`, compatibility views)
- Digest/reminder flow (`checklist-digest` edge function + UI trigger)
- Bulk upload smart matching with manual override + apply
- Save-flow hardening and backward-compat fallback for optional columns

---

## QA Matrix (manual)

### Roles

| Role | Expected |
|---|---|
| admin | full access: create/edit/archive/review/approve/reject |
| manager | create/edit/archive/submit/review screens (no admin-only destructive ops) |
| finance | read-focused checklist visibility and finance/audit access |

### Core Flows

1. Login UX
- Sign in success redirects to dashboard
- Invalid credentials show visible error

2. Checklist editing
- Edit existing task saves
- `+ Task` opens draft modal first
- Cancel draft => no task created
- Save draft => task created in selected category

3. Multi-view consistency
- Detailed/Table/Board show same item counts under same filter/search
- Pending/approved/rejected counts consistent

4. Approvals
- Submit modal creates pending approval
- Review modal allows approve/reject with reason

5. Bulk upload matching
- Multiple files upload
- Suggested matching appears
- Manual remap per file works
- Apply matches attaches files to mapped items

6. Digests
- Pending/assigned digest buttons invoke edge function
- Success/failure status appears in UI
- Reminder log row written

7. Cross-module visibility
- Team tab workload bars and counts visible
- Finance linkage block visible for matched items
- Audit live feed shows submission/review events

---

## Known Non-Blocking Risks

1. Frontend bundle size warning (>500kb chunks) remains.
2. Finance linkage currently heuristic keyword match (not strict relational mapping).
3. Digest flow logs and triggers are functional foundation; external email provider integration still optional depending on deployment setup.

---

## Rollback Plan

If issues appear after merge:

1. Re-deploy previous Vercel production deployment.
2. Revert PR merge commit in GitHub (`git revert <merge_commit>`).
3. Keep DB migration in place (non-destructive, additive).
4. Disable digest UI trigger quickly by feature gate (or remove from checklist header in hotfix).

---

## Post-Release Monitoring (first 24h)

- Login success/error rates
- Checklist save failures (modal alerts)
- Approval transition errors (pending -> approved/rejected)
- Digest invocation errors
- Bulk match apply errors
- Frontend console errors on Project Detail page

---

## Merge Gate

Merge only when:

- CI checks pass
- Role matrix spot-check passes (admin + manager at minimum)
- One smoke pass on production deployment URL completes
