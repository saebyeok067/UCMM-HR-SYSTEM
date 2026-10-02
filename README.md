# Underchargers HR System — Complete GitHub + Vercel Folder

This folder is ready to upload to a GitHub repository and deploy with Vercel.

## Included
- Underchargers HR System: `public/hr.html`
- Supabase email/password login: `/login`
- Protected HR system: `/hr.html`
- Current-user name/role/branch shown inside the HR system
- Log Out
- HR Admin-only System Users page: `/users`
- Create user accounts
- Change user role, branch, and Active/Inactive status
- Roles: `hr_admin`, `hr_staff`, `manager`, `employee`
- Supabase SQL setup file
- Next.js + Vercel configuration

## Important data note
Authentication/user accounts are stored in Supabase. The HR records inside the current `public/hr.html` prototype are still stored in browser `localStorage`, so Employees/Attendance/Payroll/etc. are not yet shared across different computers. Those modules can be migrated to Supabase later.

## 1) Upload to GitHub
Upload the CONTENTS of this folder to the repository root. Do not upload the ZIP itself as the project source.

Your repository root should contain:

```
app/
lib/
public/
supabase/
.env.example
middleware.ts
next-env.d.ts
next.config.mjs
package.json
tsconfig.json
vercel.json
```

## 2) Create Supabase project
In Supabase, open SQL Editor and run the entire file:

`supabase/setup.sql`

## 3) Create the first HR Admin
Because `/users` is HR-Admin-only, create the first account manually:

1. Supabase -> Authentication -> Users -> Add user.
2. Create an email/password account.
3. Supabase -> Table Editor -> `profiles`.
4. Find the same user and set:
   - `role` = `hr_admin`
   - `status` = `Active`
   - branch as needed.

After that, log in to the website and use `/users` to create the rest of the accounts.

## 4) Vercel environment variables
In Vercel -> Project -> Settings -> Environment Variables, add:

```
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Use the keys from your Supabase project's API settings. Never expose the service-role key in browser/client code.

## 5) Deploy
If Vercel is connected to GitHub, pushing/committing the files triggers a deployment automatically.

## Routes
- `/` -> `/login`
- `/login` -> login page
- `/hr.html` -> protected HR system
- `/users` -> HR Admin-only user management
- `/api/health` -> health check

## Local test
Create `.env.local` from `.env.example`, fill in the keys, then:

```
npm install
npm run dev
```

Open `http://localhost:3000`.

## Add User vs Add Employee
- **Add User** opens `/users` and creates a real Supabase Authentication login account through the protected server API.
- **Add Employee** creates/edits the employee HR record used by the current prototype UI.
- Only a profile with `role = 'hr_admin'` and `status = 'Active'` can create or manage login users.
