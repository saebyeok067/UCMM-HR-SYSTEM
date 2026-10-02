import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Read the profile on the server with the secret key so the UI always gets
  // the authoritative role/status even if browser RLS policies are restrictive.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let profile = null;
  if (serviceKey) {
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await admin
      .from("profiles")
      .select("id,full_name,email,role,branch,employee_id,status")
      .eq("id", user.id)
      .maybeSingle();
    profile = data;
  } else {
    const { data } = await supabase
      .from("profiles")
      .select("id,full_name,email,role,branch,employee_id,status")
      .eq("id", user.id)
      .maybeSingle();
    profile = data;
  }

  return NextResponse.json({ user: { id: user.id, email: user.email }, profile });
}
