import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function adminClient() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function getCurrentUserAndProfile() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const admin = adminClient();

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile) return null;

  return { user, profile, admin };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getCurrentUserAndProfile();

    if (!auth) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));

    if (body.action !== "mark_paid") {
      return NextResponse.json(
        { success: false, error: "Invalid action" },
        { status: 400 }
      );
    }

    const { admin, profile } = auth;

    const { data: existingPayroll, error: payrollError } = await admin
      .from("payroll")
      .select("*")
      .eq("id", id)
      .single();

    if (payrollError || !existingPayroll) {
      return NextResponse.json(
        { success: false, error: "Payroll record not found" },
        { status: 404 }
      );
    }

    if (existingPayroll.status === "Paid") {
      return NextResponse.json({
        success: true,
        payroll: existingPayroll,
        message: "Payroll is already paid",
      });
    }

    if (existingPayroll.status === "Voided") {
      return NextResponse.json(
        { success: false, error: "Voided payroll cannot be marked as paid" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const { data: payroll, error: updateError } = await admin
      .from("payroll")
      .update({
        status: "Paid",
        paid_at: now,
        updated_at: now,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      throw updateError;
    }

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "UPDATE",
      module: "Payroll",
      record_table: "payroll",
      record_id: id,
      description: "Marked payroll as Paid",
    });

    return NextResponse.json({
      success: true,
      payroll,
    });
  } catch (error: any) {
    console.error("Mark payroll paid error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to mark payroll as paid",
      },
      { status: 500 }
    );
  }
}
