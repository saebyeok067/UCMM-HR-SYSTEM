# New HR modules (2026-10-12)

## Setup
1. Back up your Supabase database. Review and run `supabase/migrations/20261012_hr_modules.sql` in Supabase SQL Editor.
2. Ensure Vercel already has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY`. **Never** put the service key in `public/` or browser JS.
3. Deploy the repository **root** to Vercel and sign in with a profile role `hr_admin` or `hr_staff` (`manager` may file/view branch incidents).
4. Open each new module and create a disposable test record. Confirm refresh persistence, branch/role restrictions, and audit records.

## Important
- New records go to Supabase; the four modules do not use localStorage.
- Existing APIs and legacy UI are retained. Existing employee 201-like local documents are **not migrated** automatically; `hr_employee_files` is new metadata only.
- File contents, CVs, signed forms, private storage, signed download previews, applicant-to-employee automation, and statutory rate calculations **are not implemented**. Do not upload sensitive documents until a private storage flow with authorization is built.
- Hiring stages are editable manually; `Hired` does not create an employee account automatically.
- Employee references reflect existing UI employee IDs; verify compatibility with current Supabase employee IDs before production use.
- `audit_logs` insert requires an existing compatible audit_logs schema and may fail independently; API reports `auditRecorded:false`.
- Role checks apply on the server, not just UI; RLS prevents direct user access to new tables, while the server uses the service role after profile validation.
- This is an initial integrated CRUD release, not a finished production-grade HR compliance/document repository.
