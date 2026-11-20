# Authority cutover (Phase 7)

Flag: `user_authority_classes_v1` (default **OFF**). Cutover assigns Class / module grants / Super Admin **without** rewriting shared `Role` rows.

## Sequence (one pilot tenant)

**UI:** Settings → Configuration → **More features** → **User authority classes** / **Authority cutover (pilot)**  
(`AuthorityCutoverPanel`). Help article: *Authority cutover: Class 1–4 for one pilot company*.

1. Dry-run (`POST /api/v1/settings/authority-cutover/dry-run` or **1. Dry-run** in UI) — proposals only; earliest admin suggested as Super Admin, other admins → Class 1, managers → Class 2, others → Class 3/4 from permissions. Unresolved users block apply.
2. Human reviews the proposal list; resolve any `UNRESOLVED` users (assign a role) and re-run dry-run.
3. Apply (`POST .../apply` or **2. Apply**) with optional `confirm_user_ids`. Idempotent. Does **not** turn the flag on. Admin / Super Admin only.
4. Confirm activation preflight (tick **User authority classes** + Save) — Super Admin only; requires Class 1–4 actors per module.
5. If rolling back metadata only: **Restore** in UI, `POST .../restore`, or  
   `docker compose exec backend python scripts/authority_cutover_restore.py --tenant-id <id>`.  
   Turning the flag **off** restores legacy Role-based access immediately; restore clears class/module/super fields from the immutable snapshot (admin / Super Admin only — Class 1 alone is denied).

## Safety

- Original `role_id`, prior class, prior module grants, and prior Super Admin flag are stored once per user in `authority_cutover_snapshots` (RLS).
- Apply never changes `users.role_id`.
- Tests: `tests/test_authority_cutover.py`.
