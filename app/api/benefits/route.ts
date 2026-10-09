import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
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
    supabasePublicKey,
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
    .select("id, role, status")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) return null;

  return { user, profile, admin };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getCurrentUserAndProfile();

    if (!auth) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { admin } = auth;

    const employeeId =
      request.nextUrl.searchParams.get("employee_id");

    let query = admin
      .from("benefit_deductions")
      .select("*")
      .order("created_at", { ascending: true });

    if (employeeId) {
      query = query.eq("employee_id", employeeId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      benefits: data ?? [],
    });
  } catch (error: any) {
    console.error("Benefits GET error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load benefits",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getCurrentUserAndProfile();

    if (!auth) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { user, admin } = auth;

    const body = await request.json();

    const employeeId = body.employee_id;

    if (!employeeId) {
      return NextResponse.json(
        {
          success: false,
          error: "employee_id is required",
        },
        { status: 400 }
      );
    }

    const deductions = [
      {
        benefit_type: "SSS",
        amount: Number(body.sss || 0),
      },
      {
        benefit_type: "PhilHealth",
        amount: Number(body.philhealth || 0),
      },
      {
        benefit_type: "Pag-IBIG",
        amount: Number(body.pagibig || 0),
      },
      {
        benefit_type: "Other",
        amount: Number(body.other || 0),
      },
    ];

    if (deductions.some((item) => item.amount < 0)) {
      return NextResponse.json(
        {
          success: false,
          error: "Deduction amounts cannot be negative",
        },
        { status: 400 }
      );
    }

    const { error: deleteError } = await admin
      .from("benefit_deductions")
      .delete()
      .eq("employee_id", employeeId);

    if (deleteError) throw deleteError;

    const rows = deductions
      .filter((item) => item.amount > 0)
      .map((item) => ({
        employee_id: employeeId,
        benefit_type: item.benefit_type,
        employee_amount: item.amount,
        employer_amount: 0,
        deduction_per_cutoff: item.amount,
        active: true,
      }));

    let inserted: any[] = [];

    if (rows.length > 0) {
      const { data, error } = await admin
        .from("benefit_deductions")
        .insert(rows)
        .select();

      if (error) throw error;

      inserted = data ?? [];
    }

    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "UPDATE",
      module: "Employee Benefits",
      record_table: "benefit_deductions",
      record_id: employeeId,
      description: "Updated employee benefit deductions",
      new_data: {
        employee_id: employeeId,
        sss: Number(body.sss || 0),
        philhealth: Number(body.philhealth || 0),
        pagibig: Number(body.pagibig || 0),
        other: Number(body.other || 0),
      },
    });

    return NextResponse.json({
      success: true,
      benefits: inserted,
    });
  } catch (error: any) {
    console.error("Benefits POST error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to save benefits",
      },
      { status: 500 }
    );
  }
}
