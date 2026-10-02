import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const allowedRoles = ["hr_admin", "hr_staff", "manager", "employee"];
const allowedStatuses = ["Active", "Inactive"];

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "hr_admin") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const admin = adminClient();
  const { data, error } = await admin.from("profiles").select("id,full_name,email,role,branch,employee_id,status,created_at").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ users: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const body = await request.json();
  const { email, password, full_name, role = "employee", branch = "", employee_id = "" } = body;
  if (!email || !password || !full_name) return NextResponse.json({ error: "Name, email and password are required." }, { status: 400 });
  if (!allowedRoles.includes(role)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  if (String(password).length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { error: profileError } = await admin.from("profiles").upsert({
    id: data.user.id,
    full_name,
    email,
    role,
    branch,
    employee_id,
    status: "Active",
  });
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const body = await request.json();
  const { id, role, status, branch } = body;
  if (!id) return NextResponse.json({ error: "User id is required." }, { status: 400 });
  if (role && !allowedRoles.includes(role)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  if (status && !allowedStatuses.includes(status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  const update: Record<string,string> = {};
  if (role) update.role = role;
  if (status) update.status = status;
  if (typeof branch === "string") update.branch = branch;
  const admin = adminClient();
  const { error } = await admin.from("profiles").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
