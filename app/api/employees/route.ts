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

async function authenticatedClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabasePublicKey, {
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
          // Safe to ignore when cookies cannot be written.
        }
      },
    },
  });
}

async function getCurrentUserAndProfile() {
  const supabase = await authenticatedClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
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

async function generateEmployeeNumber() {
  const admin = adminClient();

  const { data } = await admin
    .from("employees")
    .select("employee_no")
    .like("employee_no", "UC-%");

  let highest = 0;

  for (const row of data ?? []) {
    const match = String(row.employee_no || "").match(/^UC-(\d+)$/i);

    if (match) {
      const number = Number(match[1]);

      if (number > highest) {
        highest = number;
      }
    }
  }

  return `UC-${String(highest + 1).padStart(4, "0")}`;
}

/**
 * GET /api/employees
 *
 * HR Admin / HR Staff:
 *   - Can see all employees.
 *
 * Manager:
 *   - Can only see employees from the manager's branch.
 */
export async function GET() {
  try {
    if (!supabaseUrl || !supabasePublicKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Supabase environment variables are missing." },
        { status: 500 }
      );
    }

    const { user, profile } = await getCurrentUserAndProfile();

    if (!user || !profile) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const allowedRoles = ["hr_admin", "hr_staff", "manager"];

    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: "You do not have permission to view employees." },
        { status: 403 }
      );
    }

    const admin = adminClient();

    let query = admin
      .from("employees")
      .select(`
        id,
        user_id,
        employee_no,
        first_name,
        middle_name,
        last_name,
        email,
        phone,
        branch,
        department,
        position,
        employment_type,
        employment_status,
        hire_date,
        daily_rate,
        monthly_salary,
        resignation_date,
        archived_at,
        rehire_eligible,
        notes,
        created_at,
        updated_at
      `)
      .order("created_at", { ascending: false });

    if (profile.role === "manager") {
      query = query.eq("branch", profile.branch);
    }

    const { data, error } = await query;

    if (error) {
      console.error("GET employees error:", error);

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      employees: data ?? [],
    });
  } catch (error: any) {
    console.error("GET /api/employees failed:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unexpected error while loading employees.",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/employees
 *
 * Creates an employee HR record.
 *
 * Only:
 *   - hr_admin
 *   - hr_staff
 */
export async function POST(request: NextRequest) {
  try {
    if (!supabaseUrl || !supabasePublicKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Supabase environment variables are missing." },
        { status: 500 }
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
        { error: "Only HR Admin or HR Staff can add employees." },
        { status: 403 }
      );
    }

    const body = await request.json();

    const firstName = String(body.first_name ?? "").trim();
    const middleName = String(body.middle_name ?? "").trim();
    const lastName = String(body.last_name ?? "").trim();

    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();

    const phone = String(body.phone ?? "").trim();
    const branch = String(body.branch ?? "").trim();
    const department = String(body.department ?? "").trim();
    const position = String(body.position ?? "").trim();

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

    let employmentType =
      String(
        body.employment_type ??
          body.employee_status ??
          "Regular"
      ).trim();

    if (!allowedEmploymentTypes.includes(employmentType)) {
      employmentType = "Regular";
    }

    let employmentStatus =
      String(body.employment_status ?? body.status ?? "Active").trim();

    if (!allowedEmploymentStatuses.includes(employmentStatus)) {
      employmentStatus = "Active";
    }

    const dailyRate = Number(body.daily_rate ?? 0);
    const monthlySalary = Number(body.monthly_salary ?? 0);

    const hireDate =
      body.hire_date && String(body.hire_date).trim()
        ? String(body.hire_date)
        : null;

    const notes =
      body.notes && String(body.notes).trim()
        ? String(body.notes).trim()
        : null;

    const rehireEligible =
      typeof body.rehire_eligible === "boolean"
        ? body.rehire_eligible
        : true;

    if (!firstName) {
      return NextResponse.json(
        { error: "First name is required." },
        { status: 400 }
      );
    }

    if (!lastName) {
      return NextResponse.json(
        { error: "Last name is required." },
        { status: 400 }
      );
    }

    if (!branch) {
      return NextResponse.json(
        { error: "Branch is required." },
        { status: 400 }
      );
    }

    if (dailyRate < 0 || monthlySalary < 0) {
      return NextResponse.json(
        { error: "Salary/rate cannot be negative." },
        { status: 400 }
      );
    }

    const admin = adminClient();

    let employeeNo = String(body.employee_no ?? "").trim();

    if (!employeeNo) {
      employeeNo = await generateEmployeeNumber();
    }

    /*
     * Optional linking to an existing Supabase login account.
     *
     * If user_id is supplied from the UI later,
     * the employee record can be connected to profiles/auth.users.
     */
    const userId =
      body.user_id && String(body.user_id).trim()
        ? String(body.user_id).trim()
        : null;

    if (email) {
      const { data: existingEmail } = await admin
        .from("employees")
        .select("id, employee_no")
        .eq("email", email)
        .maybeSingle();

      if (existingEmail) {
        return NextResponse.json(
          {
            error: `An employee using ${email} already exists.`,
          },
          { status: 409 }
        );
      }
    }

    const { data: existingEmployeeNo } = await admin
      .from("employees")
      .select("id")
      .eq("employee_no", employeeNo)
      .maybeSingle();

    if (existingEmployeeNo) {
      return NextResponse.json(
        {
          error: `Employee ID ${employeeNo} already exists.`,
        },
        { status: 409 }
      );
    }

    const { data: employee, error: insertError } = await admin
      .from("employees")
      .insert({
        user_id: userId,
        employee_no: employeeNo,

        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,

        email: email || null,
        phone: phone || null,

        branch,
        department: department || null,
        position: position || null,

        employment_type: employmentType,
        employment_status: employmentStatus,

        hire_date: hireDate,

        daily_rate: dailyRate,
        monthly_salary: monthlySalary,

        rehire_eligible: rehireEligible,
        notes,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Create employee error:", insertError);

      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    /*
     * Audit trail.
     */
    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "CREATE",
      module: "Employees",
      record_table: "employees",
      record_id: employee.id,
      description: `Added employee ${firstName} ${lastName} (${employeeNo})`,
      new_data: employee,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Employee added successfully.",
        employee,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/employees failed:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unexpected error while adding employee.",
      },
      { status: 500 }
    );
  }
}
