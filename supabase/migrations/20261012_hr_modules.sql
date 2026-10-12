-- Run in Supabase SQL Editor after reviewing against your existing database.
-- No existing HR tables are dropped or modified.
create table if not exists public.hr_applicants(
 id uuid primary key default gen_random_uuid(),name text not null,email text,phone text,position text,branch text,stage text not null default 'Applied' check(stage in ('Applied','Screening','Shortlisted','Interview','Offered','Hired','Rejected')),interview_date date,notes text,rating integer check(rating between 1 and 5),created_at timestamptz not null default now());
create table if not exists public.hr_compliance(
 id uuid primary key default gen_random_uuid(),employee_id text not null,agency text not null check(agency in ('SSS','PhilHealth','Pag-IBIG','BIR','Other')),reference_no text,period text,employee_amount numeric(12,2) default 0,employer_amount numeric(12,2) default 0,due_date date,remitted_at date,status text not null default 'Pending',notes text,created_at timestamptz not null default now());
create table if not exists public.hr_employee_files(
 id uuid primary key default gen_random_uuid(),employee_id text not null,folder text not null default 'Onboarding Files' check(folder in ('Onboarding Files','Compliance & Other Forms','NOV / NTE','Payslips','Other')),title text not null,kind text,notes text,status text default 'Active',storage_path text,created_at timestamptz not null default now());
create table if not exists public.hr_incidents(
 id uuid primary key default gen_random_uuid(),employee_id text not null,title text not null,occurred_on date,category text,severity text default 'Normal',status text not null default 'Open',description text,action_taken text,case_number text,branch text,created_at timestamptz not null default now());
-- Tables may be read/written only by backend service role; authenticated clients cannot access directly.
alter table public.hr_applicants enable row level security;
alter table public.hr_compliance enable row level security;
alter table public.hr_employee_files enable row level security;
alter table public.hr_incidents enable row level security;
-- Deliberately no broad authenticated policies. Backend validates profile roles before service-role access.
