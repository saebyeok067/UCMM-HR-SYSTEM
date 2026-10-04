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
    .select(
      "id, full_name, email, role, branch, employee_id, status"
    )
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    profile,
  };
}

function calculateLeaveDays(
  startDate: string,
  endDate: string
) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  const diff =
    end.getTime() - start.getTime();

  return (
    Math.floor(diff / (1000 * 60 * 60 * 24)) + 1
  );
}

/* ============================================================
   GET /api/leave-requests

   HR Admin / HR Staff:
   - Can see all leave requests

   Manager:
   - Can see leave requests from own branch

   Employee:
   - Can see own leave requests
============================================================ */

export async function GET(request: NextRequest) {
  try {
    if (
      !supabaseUrl ||
      !supabasePublicKey ||
      !serviceRoleKey
    ) {
      return NextResponse.json(
        {
          error:
            "Supabase environment variables are missing.",
        },
        { status: 500 }
      );
    }

    const { user, profile } =
      await getCurrentUserAndProfile();

    if (!user || !profile) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const admin = adminClient();

    const { searchParams } =
      new URL(request.url);

    const status =
      searchParams.get("status");

    const employeeId =
      searchParams.get("employee_id");

    let query = admin
      .from("leave_requests")
      .select(
        `
        *,
        employees (
          id,
          employee_no,
          first_name,
          middle_name,
          last_name,
          branch,
          department,
          position,
          employment_status
        )
        `
      )
      .order("created_at", {
        ascending: false,
      });

    if (status) {
      query = query.eq("status", status);
    }

    if (employeeId) {
      query = query.eq(
        "employee_id",
        employeeId
      );
    }

    /*
     * Manager:
     * Leave requests from employees
     * in the same branch only.
     */
    if (profile.role === "manager") {
      const { data: employees } =
        await admin
          .from("employees")
          .select("id")
          .eq("branch", profile.branch)
          .neq(
            "employment_status",
            "Archived"
          );

      const employeeIds =
        employees?.map((e) => e.id) ?? [];

      if (employeeIds.length === 0) {
        return NextResponse.json({
          success: true,
          leave_requests: [],
        });
      }

      query = query.in(
        "employee_id",
        employeeIds
      );
    }

    /*
     * Regular employee:
     * Own leave requests only.
     */
    if (
      ![
        "hr_admin",
        "hr_staff",
        "manager",
      ].includes(profile.role)
    ) {
      const { data: employee } =
        await admin
          .from("employees")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

      if (!employee) {
        return NextResponse.json({
          success: true,
          leave_requests: [],
        });
      }

      query = query.eq(
        "employee_id",
        employee.id
      );
    }

    const { data, error } =
      await query;

    if (error) {
      console.error(
        "GET leave requests error:",
        error
      );

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      leave_requests: data ?? [],
    });
  } catch (error: any) {
    console.error(
      "GET /api/leave-requests failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unable to load leave requests.",
      },
      { status: 500 }
    );
  }
}

/* ============================================================
   POST /api/leave-requests

   Create a new leave request
============================================================ */

export async function POST(
  request: NextRequest
) {
  try {
    if (
      !supabaseUrl ||
      !supabasePublicKey ||
      !serviceRoleKey
    ) {
      return NextResponse.json(
        {
          error:
            "Supabase environment variables are missing.",
        },
        { status: 500 }
      );
    }

    const { user, profile } =
      await getCurrentUserAndProfile();

    if (!user || !profile) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await request.json();

    let employeeId = String(
      body.employee_id ?? ""
    ).trim();

    const leaveType = String(
      body.leave_type ?? ""
    ).trim();

    const startDate = String(
      body.start_date ?? ""
    ).trim();

    const endDate = String(
      body.end_date ?? ""
    ).trim();

    const reason = String(
      body.reason ?? ""
    ).trim();

    const allowedLeaveTypes = [
      "Vacation Leave",
      "Sick Leave",
      "Emergency Leave",
      "Unpaid Leave",
      "Other",
    ];

    if (!leaveType) {
      return NextResponse.json(
        {
          error:
            "Leave type is required.",
        },
        { status: 400 }
      );
    }

    if (
      !allowedLeaveTypes.includes(
        leaveType
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid leave type.",
        },
        { status: 400 }
      );
    }

    if (!startDate || !endDate) {
      return NextResponse.json(
        {
          error:
            "Start date and end date are required.",
        },
        { status: 400 }
      );
    }

    if (endDate < startDate) {
      return NextResponse.json(
        {
          error:
            "End date cannot be earlier than start date.",
        },
        { status: 400 }
      );
    }

    const admin = adminClient();

    /*
     * Regular employee:
     * Force request to own employee record.
     */
    if (
      ![
        "hr_admin",
        "hr_staff",
        "manager",
      ].includes(profile.role)
    ) {
      const { data: ownEmployee } =
        await admin
          .from("employees")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

      if (!ownEmployee) {
        return NextResponse.json(
          {
            error:
              "Your login account is not linked to an employee record.",
          },
          { status: 403 }
        );
      }

      employeeId = ownEmployee.id;
    }

    if (!employeeId) {
      return NextResponse.json(
        {
          error:
            "Employee is required.",
        },
        { status: 400 }
      );
    }

    /*
     * Verify employee.
     */
    const {
      data: employee,
      error: employeeError,
    } = await admin
      .from("employees")
      .select(
        `
        id,
        employee_no,
        first_name,
        middle_name,
        last_name,
        branch,
        employment_status
        `
      )
      .eq("id", employeeId)
      .maybeSingle();

    if (employeeError) {
      return NextResponse.json(
        {
          error: employeeError.message,
        },
        { status: 500 }
      );
    }

    if (!employee) {
      return NextResponse.json(
        {
          error:
            "Employee not found.",
        },
        { status: 404 }
      );
    }

    if (
      employee.employment_status ===
      "Archived"
    ) {
      return NextResponse.json(
        {
          error:
            "Leave cannot be filed for an archived employee.",
        },
        { status: 400 }
      );
    }

    /*
     * Manager cannot file leave for
     * employees from another branch.
     */
    if (
      profile.role === "manager" &&
      employee.branch !== profile.branch
    ) {
      return NextResponse.json(
        {
          error:
            "You cannot file leave for an employee from another branch.",
        },
        { status: 403 }
      );
    }

    /*
     * Prevent overlapping Pending /
     * Approved leave requests.
     */
    const {
      data: overlappingLeaves,
      error: overlapError,
    } = await admin
      .from("leave_requests")
      .select(
        "id, start_date, end_date, status"
      )
      .eq(
        "employee_id",
        employeeId
      )
      .in("status", [
        "Pending",
        "Approved",
      ])
      .lte(
        "start_date",
        endDate
      )
      .gte(
        "end_date",
        startDate
      );

    if (overlapError) {
      return NextResponse.json(
        {
          error:
            overlapError.message,
        },
        { status: 500 }
      );
    }

    if (
      overlappingLeaves &&
      overlappingLeaves.length > 0
    ) {
      return NextResponse.json(
        {
          error:
            "This employee already has a pending or approved leave request that overlaps these dates.",
        },
        { status: 409 }
      );
    }

    const days =
      calculateLeaveDays(
        startDate,
        endDate
      );

    if (days <= 0) {
      return NextResponse.json(
        {
          error:
            "Invalid leave duration.",
        },
        { status: 400 }
      );
    }

    /*
     * Create leave request.
     */
    const {
      data: leaveRequest,
      error,
    } = await admin
      .from("leave_requests")
      .insert({
        employee_id: employeeId,
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        days,
        reason: reason || null,
        status: "Pending",
      })
      .select()
      .single();

    if (error) {
      console.error(
        "Create leave request error:",
        error
      );

      return NextResponse.json(
        {
          error: error.message,
        },
        { status: 500 }
      );
    }

    const fullName = [
      employee.first_name,
      employee.middle_name,
      employee.last_name,
    ]
      .filter(Boolean)
      .join(" ");

    /*
     * Audit log.
     */
    await admin
      .from("audit_logs")
      .insert({
        actor_id: user.id,
        action: "CREATE",
        module: "Leave",
        record_table:
          "leave_requests",
        record_id:
          leaveRequest.id,
        description:
          `Submitted ${leaveType} request for ${fullName} from ${startDate} to ${endDate}`,
        old_data: null,
        new_data: leaveRequest,
      });

    return NextResponse.json(
      {
        success: true,
        message:
          "Leave request submitted successfully.",
        leave_request:
          leaveRequest,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error(
      "POST /api/leave-requests failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unable to submit leave request.",
      },
      { status: 500 }
    );
  }
}
