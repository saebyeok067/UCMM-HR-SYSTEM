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
  } = await supabase.auth.getUser();

  if (!user) {
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

function timeToMinutes(time?: string | null) {
  if (!time) return null;

  const parts = String(time).split(":");

  if (parts.length < 2) return null;

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

/* ============================================================
   GET /api/attendance
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

    const { searchParams } = new URL(request.url);

    const date = searchParams.get("date");
    const employeeId =
      searchParams.get("employee_id");

    let query = admin
      .from("attendance")
      .select("*")
      .order("work_date", {
        ascending: false,
      })
      .order("created_at", {
        ascending: false,
      });

    if (date) {
      query = query.eq("work_date", date);
    }

    if (employeeId) {
      query = query.eq(
        "employee_id",
        employeeId
      );
    }

    /*
     * Manager:
     * only attendance from own branch.
     */
    if (profile.role === "manager") {
      const { data: branchEmployees } =
        await admin
          .from("employees")
          .select("id")
          .eq("branch", profile.branch)
          .neq(
            "employment_status",
            "Archived"
          );

      const ids =
        branchEmployees?.map(
          (employee) => employee.id
        ) ?? [];

      if (ids.length === 0) {
        return NextResponse.json({
          success: true,
          attendance: [],
        });
      }

      query = query.in(
        "employee_id",
        ids
      );
    }

    /*
     * Employee:
     * only own attendance.
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
          attendance: [],
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
        "GET attendance error:",
        error
      );

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      attendance: data ?? [],
    });
  } catch (error: any) {
    console.error(
      "GET /api/attendance failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unable to load attendance.",
      },
      { status: 500 }
    );
  }
}

/* ============================================================
   POST /api/attendance

   Add or update attendance for one employee/date.
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

    if (
      ![
        "hr_admin",
        "hr_staff",
      ].includes(profile.role)
    ) {
      return NextResponse.json(
        {
          error:
            "Only HR Admin or HR Staff can record attendance.",
        },
        { status: 403 }
      );
    }

    const body =
      await request.json();

    const employeeId = String(
      body.employee_id ?? ""
    ).trim();

    const workDate = String(
      body.work_date ?? ""
    ).trim();

    if (!employeeId) {
      return NextResponse.json(
        {
          error:
            "Employee is required.",
        },
        { status: 400 }
      );
    }

    if (!workDate) {
      return NextResponse.json(
        {
          error:
            "Attendance date is required.",
        },
        { status: 400 }
      );
    }

    const admin = adminClient();

    /*
     * Make sure employee exists.
     */
    const {
      data: employee,
      error: employeeError,
    } = await admin
      .from("employees")
      .select(
        "id, employee_no, first_name, last_name, daily_rate, employment_status"
      )
      .eq("id", employeeId)
      .maybeSingle();

    if (employeeError) {
      return NextResponse.json(
        {
          error:
            employeeError.message,
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
            "Attendance cannot be recorded for an archived employee.",
        },
        { status: 400 }
      );
    }

    let timeIn =
      body.time_in &&
      String(body.time_in).trim()
        ? String(body.time_in).trim()
        : null;

    let timeOut =
      body.time_out &&
      String(body.time_out).trim()
        ? String(body.time_out).trim()
        : null;

    const requestedStatus = String(
      body.status ?? "Auto"
    ).trim();

    const shiftStart = String(
      body.shift_start ?? "08:00"
    );

    const shiftEnd = String(
      body.shift_end ?? "17:00"
    );

    const graceMinutes = Math.max(
      0,
      Number(
        body.grace_minutes ?? 10
      )
    );

    let status = requestedStatus;

    let lateMinutes = 0;
    let overtimeMinutes = 0;

    if (
      requestedStatus === "Absent" ||
      requestedStatus === "On Leave"
    ) {
      timeIn = null;
      timeOut = null;

      lateMinutes = 0;
      overtimeMinutes = 0;

      status = requestedStatus;
    } else {
      const inMinutes =
        timeToMinutes(timeIn);

      const startMinutes =
        timeToMinutes(shiftStart);

      if (
        inMinutes !== null &&
        startMinutes !== null
      ) {
        lateMinutes = Math.max(
          0,
          inMinutes -
            (startMinutes +
              graceMinutes)
        );
      }

      const outMinutes =
        timeToMinutes(timeOut);

      const endMinutes =
        timeToMinutes(shiftEnd);

      if (
        outMinutes !== null &&
        endMinutes !== null
      ) {
        overtimeMinutes =
          Math.max(
            0,
            outMinutes - endMinutes
          );
      }

      if (
        requestedStatus === "Auto"
      ) {
        status =
          lateMinutes > 0
            ? "Late"
            : "Present";
      }

      if (
        !["Present", "Late"].includes(
          status
        )
      ) {
        status =
          lateMinutes > 0
            ? "Late"
            : "Present";
      }
    }

    /*
     * Existing payroll rule currently used by the HR UI:
     * daily rate / 480 minutes × late minutes.
     *
     * We can adjust this later based on the company's
     * official payroll policy.
     */
    const dailyRate = Number(
      employee.daily_rate ?? 0
    );

    const lateDeduction =
      dailyRate > 0
        ? Number(
            (
              (dailyRate / 480) *
              lateMinutes
            ).toFixed(2)
          )
        : 0;

    const note =
      body.note &&
      String(body.note).trim()
        ? String(body.note).trim()
        : null;

    /*
     * Check whether this is a new attendance
     * or an update.
     */
    const {
      data: existing,
    } = await admin
      .from("attendance")
      .select("*")
      .eq(
        "employee_id",
        employeeId
      )
      .eq("work_date", workDate)
      .maybeSingle();

    const payload = {
      employee_id: employeeId,
      work_date: workDate,

      time_in: timeIn,
      time_out: timeOut,

      late_minutes: lateMinutes,
      late_deduction: lateDeduction,
      overtime_minutes:
        overtimeMinutes,

      status,
      note,

      source: "Manual",

      created_by:
        existing?.created_by ??
        user.id,
    };

    const {
      data: attendance,
      error,
    } = await admin
      .from("attendance")
      .upsert(payload, {
        onConflict:
          "employee_id,work_date",
      })
      .select()
      .single();

    if (error) {
      console.error(
        "Save attendance error:",
        error
      );

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    /*
     * Audit trail
     */
    await admin
      .from("audit_logs")
      .insert({
        actor_id: user.id,

        action: existing
          ? "UPDATE"
          : "CREATE",

        module: "Attendance",

        record_table:
          "attendance",

        record_id:
          attendance.id,

        description: `${
          existing
            ? "Updated"
            : "Recorded"
        } attendance for ${
          employee.first_name
        } ${
          employee.last_name
        } on ${workDate}`,

        old_data:
          existing ?? null,

        new_data: attendance,
      });

    return NextResponse.json(
      {
        success: true,

        message: existing
          ? "Attendance updated successfully."
          : "Attendance recorded successfully.",

        attendance,
      },
      {
        status: existing
          ? 200
          : 201,
      }
    );
  } catch (error: any) {
    console.error(
      "POST /api/attendance failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unable to save attendance.",
      },
      { status: 500 }
    );
  }
}
