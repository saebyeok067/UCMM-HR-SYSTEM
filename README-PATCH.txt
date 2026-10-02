UNDERCHARGERS HR SYSTEM — ADD USER PATCH

Replace these files in the ROOT project:

public/hr.html
app/api/me/route.ts
app/api/admin/users/route.ts
app/users/page.tsx
middleware.ts

What this adds:
- + Add User button on Dashboard, Quick Actions, and Employees page for HR Admin.
- System Users page creates REAL Supabase Authentication accounts.
- User role/profile is read server-side using the service-role key.
- Admin authorization for creating users is checked server-side.

Required Vercel environment variables:
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

The logged-in account profile in public.profiles must have:
role = hr_admin
status = Active
