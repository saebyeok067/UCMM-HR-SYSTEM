# Underchargers HR System — Supabase Users + Vercel

This version adds real Supabase email/password authentication to the existing Underchargers HR prototype.

## What is included
- Existing HR system in `public/hr.html`
- Supabase login page `/login`
- Protected `/hr.html`
- Logout
- User profile shown in the HR header
- HR Admin-only `/users` page
- Create user accounts
- Change user role, branch and Active/Inactive status
- Roles: `hr_admin`, `hr_staff`, `manager`, `employee`

## Important current limitation
User accounts are stored in Supabase, but the HR records inside `public/hr.html` are still stored in browser `localStorage`. This means HR data is not yet shared across different computers/users. A later database migration can move Employees, Attendance, Payroll, Benefits, etc. into Supabase tables.

## 1. Supabase setup
Create a Supabase project. Open **SQL Editor** and run:

`supabase/setup.sql`

Then open **Authentication > Users** and manually create your first HR Admin account.

After creating the first account, open **Table Editor > profiles** and change that user's `role` to:

`hr_admin`

## 2. Environment variables
Copy `.env.example` to `.env.local` for local development.

Fill these values from Supabase Project Settings / API:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Never expose the service role key in browser code.

## 3. Local test
```
npm install
npm run dev
```
Open `http://localhost:3000`.

## 4. GitHub + Vercel
Upload the contents of this folder to the root of your GitHub repository.

In Vercel, add the same three Environment Variables under:

**Project > Settings > Environment Variables**

Then redeploy.

## Routes
- `/` -> redirects to `/hr.html`
- `/login` -> user login
- `/hr.html` -> protected HR system
- `/users` -> HR Admin user management
- `/api/health` -> health check

## First HR Admin
Because the `/users` page is admin-only, create the first account manually in Supabase Authentication. Then update its `profiles.role` to `hr_admin` in Table Editor.

## Login is now the entry point
The root URL redirects to `/login`. After a successful Supabase login, users are sent to `/hr.html`.

Inside the HR system header:
- the current authenticated user's name/role is shown,
- HR Admins can open **Users**,
- **Log Out** ends the Supabase session.
