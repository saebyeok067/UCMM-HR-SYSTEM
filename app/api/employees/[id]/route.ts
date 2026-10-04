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
          } catch {
            // Ignore when cookies cannot be written.
          }
        },
      },
    }
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      user: null,
      profile: null,
    };
  }

  const admin = adminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, email, role, branch, employee_id, status")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    profile,
  };
}

async function getEmployeeId(context: any) {
  const params = await Promise.resolve(context.params);
  return String(params?.id ?? "").trim();
}

/* ============================================================
   GET
   View one employee
============================================================ */

export async function GET(
  request: NextRequest,
  context: any
) {
  try {
    if (!supabaseUrl || !supabasePublicKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Supabase environment variables are missing." },
        { status: 500 }
      );
    }

    const id = await getEmployeeId(context);

    if (!id) {
      return NextResponse.json(
        { error: "Employee ID is required." },
        { status: 400 }
      );
    }

    const { user, profile } = await getCurrentUserAndProfile();

    if (!user || !profile) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const admin = adminClient();

    const { data: employee, error } = await admin
      .from("employees")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found." },
        { status: 404 }
      );
    }

    if (
      profile.role === "manager" &&
      employee.branch !== profile.branch
    ) {
      return NextResponse.json(
        { error: "Access denied." },
        { status: 403 }
      );
    }

    if (
      !["hr_admin", "hr_staff", "manager"].includes(profile.role) &&
      employee.user_id !== user.id
    ) {
      return NextResponse.json(
        { error: "Access denied." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      employee,
    });
  } catch (error: any) {
    console.error("GET /api/employees/[id] failed:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unexpected error while loading employee.",
      },
      { status: 500 }
    );
  }
}

/* ============================================================
   PATCH
   Edit employee
============================================================ */

export async function PATCH(
  request: NextRequest,
  context: any
) {
  try {
    if (!supabaseUrl || !supabasePublicKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Supabase environment variables are missing." },
        { status: 500 }
      );
    }

    const id = await getEmployeeId(context);

    if (!id) {
      return NextResponse.json(
        { error: "Employee ID is required." },
        { status: 400 }
      );
    }

    const { user, profile } = await getCurrentUserAndProfile();

    if (!user || !profile) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    if (!["hr_admin", "hr_staff"].includes(profile.role)) {
      return NextResponse.json(
        {
          error:
            "Only HR Admin or HR Staff can edit employees.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const allowedEmploymentTypes = [
      "Regular",
      "Probationary",
      "Contractual",
      "Part-Time",
      "Intern",
      "Other",
    ];

    const allowedEmploymentStatuses = [
      "Active",
      "On Leave",
      "Resigned",
      "Terminated",
      "Inactive",
      "Archived",
    ];

    const allowedFields = [
      "employee_no",
      "user_id",
      "first_name",
      "middle_name",
      "last_name",
      "email",
      "phone",
      "branch",
      "department",
      "position",
      "employment_type",
      "employment_status",
      "hire_date",
      "daily_rate",
      "monthly_salary",
      "resignation_date",
      "rehire_eligible",
      "notes",
    ];

    const updateData: Record<string, any> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (updateData.first_name !== undefined) {
      updateData.first_name = String(
        updateData.first_name
      ).trim();
    }

    if (updateData.middle_name !== undefined) {
      const value = String(updateData.middle_name ?? "").trim();
      updateData.middle_name = value || null;
    }

    if (updateData.last_name !== undefined) {
      updateData.last_name = String(
        updateData.last_name
      ).trim();
    }

    if (updateData.email !== undefined) {
      const email = String(updateData.email ?? "")
        .trim()
        .toLowerCase();

      updateData.email = email || null;
    }

    if (updateData.phone !== undefined) {
      const value = String(updateData.phone ?? "").trim();
      updateData.phone = value || null;
    }

    if (updateData.branch !== undefined) {
      updateData.branch = String(updateData.branch).trim();
    }

    if (updateData.department !== undefined) {
      const value = String(updateData.department ?? "").trim();
      updateData.department = value || null;
    }

    if (updateData.position !== undefined) {
      const value = String(updateData.position ?? "").trim();
      updateData.position = value || null;
    }

    if (
      updateData.employment_type !== undefined &&
      !allowedEmploymentTypes.includes(updateData.employment_type)
    ) {
      return NextResponse.json(
        { error: "Invalid employment type." },
        { status: 400 }
      );
    }

    if (
      updateData.employment_status !== undefined &&
      !allowedEmploymentStatuses.includes(
        updateData.employment_status
      )
    ) {
      return NextResponse.json(
        { error: "Invalid employment status." },
        { status: 400 }
      );
    }

    if (updateData.daily_rate !== undefined) {
      updateData.daily_rate = Number(updateData.daily_rate);

      if (
        Number.isNaN(updateData.daily_rate) ||
        updateData.daily_rate < 0
      ) {
        return NextResponse.json(
          { error: "Daily rate cannot be negative." },
          { status: 400 }
        );
      }
    }

    if (updateData.monthly_salary !== undefined) {
      updateData.monthly_salary = Number(
        updateData.monthly_salary
      );

      if (
        Number.isNaN(updateData.monthly_salary) ||
        updateData.monthly_salary < 0
      ) {
        return NextResponse.json(
          {
            error: "Monthly salary cannot be negative.",
          },
          { status: 400 }
        );
      }
    }

    const admin = adminClient();

    const { data: oldEmployee, error: oldError } = await admin
      .from("employees")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (oldError) {
      return NextResponse.json(
        { error: oldError.message },
        { status: 500 }
      );
    }

    if (!oldEmployee) {
      return NextResponse.json(
        { error: "Employee not found." },
        { status: 404 }
      );
    }

    if (updateData.email) {
      const { data: duplicateEmail } = await admin
        .from("employees")
        .select("id")
        .eq("email", updateData.email)
        .neq("id", id)
        .maybeSingle();

      if (duplicateEmail) {
        return NextResponse.json(
          {
            error:
              "Another employee is already using this email.",
          },
          { status: 409 }
        );
      }
    }

    if (updateData.employee_no) {
      const { data: duplicateEmployeeNo } = await admin
        .from("employees")
        .select("id")
        .eq("employee_no", updateData.employee_no)
        .neq("id", id)
        .maybeSingle();

      if (duplicateEmployeeNo) {
        return NextResponse.json(
          {
            error:
              "Another employee already uses this employee number.",
          },
          { status: 409 }
        );
      }
    }

    const { data: employee, error } = await admin
      .from("employees")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("PATCH employee error:", error);

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "UPDATE",
      module: "Employees",
      record_table: "employees",
      record_id: id,
      description: `Updated employee ${employee.employee_no}`,
      old_data: oldEmployee,
      new_data: employee,
    });

    return NextResponse.json({
      success: true,
      message: "Employee updated successfully.",
      employee,
    });
  } catch (error: any) {
    console.error("PATCH /api/employees/[id] failed:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unexpected error while updating employee.",
      },
      { status: 500 }
    );
  }
}

/* ============================================================
   DELETE
   Archive employee

   Important:
   Hindi permanently dini-delete ang employee.
   Ginagawang Archived lang para preserved ang HR history.
============================================================ */

export async function DELETE(
  request: NextRequest,
  context: any
) {
  try {
    if (!supabaseUrl || !supabasePublicKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Supabase environment variables are missing." },
        { status: 500 }
      );
    }

    const id = await getEmployeeId(context);

    if (!id) {
      return NextResponse.json(
        { error: "Employee ID is required." },
        { status: 400 }
      );
    }

    const { user, profile } = await getCurrentUserAndProfile();

    if (!user || !profile) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    if (profile.role !== "hr_admin") {
      return NextResponse.json(
        {
          error:
            "Only HR Administrator can archive an employee.",
        },
        { status: 403 }
      );
    }

    const admin = adminClient();

    const { data: oldEmployee, error: oldError } = await admin
      .from("employees")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (oldError) {
      return NextResponse.json(
        { error: oldError.message },
        { status: 500 }
      );
    }

    if (!oldEmployee) {
      return NextResponse.json(
        { error: "Employee not found." },
        { status: 404 }
      );
    }

    if (oldEmployee.employment_status === "Archived") {
      return NextResponse.json({
        success: true,
        message: "Employee is already archived.",
        employee: oldEmployee,
      });
    }

    const { data: employee, error } = await admin
      .from("employees")
      .update({
        employment_status: "Archived",
        archived_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Archive employee error:", error);

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "ARCHIVE",
      module: "Employees",
      record_table: "employees",
      record_id: id,
      description: `Archived employee ${employee.employee_no}`,
      old_data: oldEmployee,
      new_data: employee,
    });

    return NextResponse.json({
      success: true,
      message: "Employee archived successfully.",
      employee,
    });
  } catch (error: any) {
    console.error("DELETE /api/employees/[id] failed:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unexpected error while archiving employee.",
      },
      { status: 500 }
    );
  }
}
