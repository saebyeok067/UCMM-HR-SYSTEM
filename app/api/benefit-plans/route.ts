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

/* =========================
   GET BENEFIT PLANS
========================= */

export async function GET() {
  try {
    const auth = await getCurrentUserAndProfile();

    if (!auth) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const { admin } = auth;

    const { data, error } = await admin
      .from("benefit_plans")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      plans: data ?? [],
    });
  } catch (error: any) {
    console.error("Benefit Plans GET error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Unable to load benefit plans",
      },
      { status: 500 }
    );
  }
}

/* =========================
   CREATE BENEFIT PLAN
========================= */

export async function POST(request: NextRequest) {
  try {
    const auth = await getCurrentUserAndProfile();

    if (!auth) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const { user, admin } = auth;

    const body = await request.json();

    const name = String(body.name || "").trim();

    const deductionPerCutoff = Number(
      body.deduction_per_cutoff ?? 0
    );

    const active =
      body.active === undefined
        ? true
        : Boolean(body.active);

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error: "Benefit plan name is required",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(deductionPerCutoff) ||
      deductionPerCutoff < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Deduction per cutoff must be zero or greater",
        },
        { status: 400 }
      );
    }

    const { data: existing, error: existingError } =
      await admin
        .from("benefit_plans")
        .select("id")
        .ilike("name", name)
        .limit(1);

    if (existingError) throw existingError;

    if (existing && existing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "A benefit plan with this name already exists",
        },
        { status: 409 }
      );
    }

    const { data: plan, error } = await admin
      .from("benefit_plans")
      .insert({
        name,
        deduction_per_cutoff: deductionPerCutoff,
        active,
      })
      .select()
      .single();

    if (error) throw error;

    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "CREATE",
      module: "Employee Benefits",
      record_table: "benefit_plans",
      record_id: plan.id,
      description: `Created benefit plan ${name}`,
      new_data: plan,
    });

    return NextResponse.json(
      {
        success: true,
        plan,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Benefit Plans POST error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Unable to create benefit plan",
      },
      { status: 500 }
    );
  }
}
