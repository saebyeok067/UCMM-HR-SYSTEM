import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublicKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
            cookiesToSet.forEach(
              ({ name, value, options }) => {
                cookieStore.set(name, value, options);
              }
            );
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

  const { data: profile, error: profileError } =
    await admin
      .from("profiles")
      .select("id, role, status")
      .eq("id", user.id)
      .single();

  if (profileError || !profile) return null;

  return {
    user,
    profile,
    admin,
  };
}

/* ========================================
   PATCH - EDIT BENEFIT PLAN
======================================== */

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const auth =
      await getCurrentUserAndProfile();

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
    const { id } = await context.params;

    const body = await request.json();

    const {
      data: oldPlan,
      error: oldPlanError,
    } = await admin
      .from("benefit_plans")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (oldPlanError) throw oldPlanError;

    if (!oldPlan) {
      return NextResponse.json(
        {
          success: false,
          error: "Benefit plan not found",
        },
        { status: 404 }
      );
    }

    const name =
      body.name !== undefined
        ? String(body.name).trim()
        : oldPlan.name;

    const deductionPerCutoff =
      body.deduction_per_cutoff !== undefined
        ? Number(body.deduction_per_cutoff)
        : Number(oldPlan.deduction_per_cutoff);

    const active =
      body.active !== undefined
        ? Boolean(body.active)
        : Boolean(oldPlan.active);

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

    const {
      data: duplicate,
      error: duplicateError,
    } = await admin
      .from("benefit_plans")
      .select("id")
      .ilike("name", name)
      .neq("id", id)
      .limit(1);

    if (duplicateError) throw duplicateError;

    if (duplicate && duplicate.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A benefit plan with this name already exists",
        },
        { status: 409 }
      );
    }

    const {
      data: updatedPlan,
      error: updateError,
    } = await admin
      .from("benefit_plans")
      .update({
        name,
        deduction_per_cutoff:
          deductionPerCutoff,
        active,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    await admin
      .from("audit_logs")
      .insert({
        actor_id: user.id,
        action: "UPDATE",
        module: "Employee Benefits",
        record_table: "benefit_plans",
        record_id: id,
        description: `Updated benefit plan ${name}`,
        old_data: oldPlan,
        new_data: updatedPlan,
      });

    return NextResponse.json({
      success: true,
      plan: updatedPlan,
    });
  } catch (error: any) {
    console.error(
      "Benefit Plan PATCH error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Unable to update benefit plan",
      },
      { status: 500 }
    );
  }
}

/* ========================================
   DELETE - DELETE BENEFIT PLAN
======================================== */

export async function DELETE(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const auth =
      await getCurrentUserAndProfile();

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
    const { id } = await context.params;

    const {
      data: oldPlan,
      error: oldPlanError,
    } = await admin
      .from("benefit_plans")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (oldPlanError) throw oldPlanError;

    if (!oldPlan) {
      return NextResponse.json(
        {
          success: false,
          error: "Benefit plan not found",
        },
        { status: 404 }
      );
    }

    const { error: deleteError } =
      await admin
        .from("benefit_plans")
        .delete()
        .eq("id", id);

    if (deleteError) throw deleteError;

    await admin
      .from("audit_logs")
      .insert({
        actor_id: user.id,
        action: "DELETE",
        module: "Employee Benefits",
        record_table: "benefit_plans",
        record_id: id,
        description: `Deleted benefit plan ${oldPlan.name}`,
        old_data: oldPlan,
        new_data: null,
      });

    return NextResponse.json({
      success: true,
      message: "Benefit plan deleted",
    });
  } catch (error: any) {
    console.error(
      "Benefit Plan DELETE error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Unable to delete benefit plan",
      },
      { status: 500 }
    );
  }
}
