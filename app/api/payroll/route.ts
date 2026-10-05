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

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/* ============================================================
   GET /api/payroll
   Load payroll records
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

    if (
      ![
        "hr_admin",
        "hr_staff",
      ].includes(profile.role)
    ) {
      return NextResponse.json(
        {
          error:
            "Only HR Admin or HR Staff can access payroll.",
        },
        { status: 403 }
      );
    }

    const admin = adminClient();

    const { searchParams } =
      new URL(request.url);

    const periodStart =
      searchParams.get("period_start");

    const periodEnd =
      searchParams.get("period_end");

    const status =
      searchParams.get("status");

    let query = admin
      .from("payroll")
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
          daily_rate,
          employment_status
        ),
        payroll_items (
          id,
          item_type,
          category,
          description,
          amount,
          reference_id,
          created_at
        )
        `
      )
      .order("period_start", {
        ascending: false,
      })
      .order("created_at", {
        ascending: false,
      });

    if (periodStart) {
      query = query.eq(
        "period_start",
        periodStart
      );
    }

    if (periodEnd) {
      query = query.eq(
        "period_end",
        periodEnd
      );
    }

    if (status) {
      query = query.eq(
        "status",
        status
      );
    }

    const { data, error } =
      await query;

    if (error) {
      console.error(
        "GET payroll error:",
        error
      );

      return NextResponse.json(
        {
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      payroll: data ?? [],
    });
  } catch (error: any) {
    console.error(
      "GET /api/payroll failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unable to load payroll.",
      },
      { status: 500 }
    );
  }
}

/* ============================================================
   POST /api/payroll

   Generate payroll from:
   - Employees
   - Attendance
   - Late deductions

   Benefits / Loans / Commissions:
   = 0 for now
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
        {
          error: "Unauthorized.",
        },
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
            "Only HR Admin or HR Staff can generate payroll.",
        },
        { status: 403 }
      );
    }

    const body =
      await request.json();

    const periodStart = String(
      body.period_start ?? ""
    ).trim();

    const periodEnd = String(
      body.period_end ?? ""
    ).trim();

    const requestedEmployeeId =
      body.employee_id
        ? String(
            body.employee_id
          ).trim()
        : "";

    if (!periodStart || !periodEnd) {
      return NextResponse.json(
        {
          error:
            "Payroll period start and end are required.",
        },
        { status: 400 }
      );
    }

    if (periodEnd < periodStart) {
      return NextResponse.json(
        {
          error:
            "Period end cannot be earlier than period start.",
        },
        { status: 400 }
      );
    }

    const admin = adminClient();

    /*
     * Get employees
     */
    let employeeQuery = admin
      .from("employees")
      .select(
        `
        id,
        employee_no,
        first_name,
        middle_name,
        last_name,
        branch,
        department,
        position,
        daily_rate,
        monthly_salary,
        employment_status,
        archived_at
        `
      )
      .is("archived_at", null);

    if (requestedEmployeeId) {
      employeeQuery =
        employeeQuery.eq(
          "id",
          requestedEmployeeId
        );
    }

    const {
      data: employees,
      error: employeeError,
    } = await employeeQuery;

    if (employeeError) {
      return NextResponse.json(
        {
          error:
            employeeError.message,
        },
        { status: 500 }
      );
    }

    if (
      !employees ||
      employees.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No active employees found.",
        },
        { status: 404 }
      );
    }

    const generatedPayroll: any[] = [];
    const skippedPayroll: any[] = [];

    for (const employee of employees) {
      /*
       * Existing payroll for same
       * employee + period.
       */
      const {
        data: existingPayroll,
      } = await admin
        .from("payroll")
        .select("*")
        .eq(
          "employee_id",
          employee.id
        )
        .eq(
          "period_start",
          periodStart
        )
        .eq(
          "period_end",
          periodEnd
        )
        .maybeSingle();

      /*
       * Paid payroll cannot be
       * regenerated.
       */
      if (
        existingPayroll?.status ===
        "Paid"
      ) {
        skippedPayroll.push({
          employee_id:
            employee.id,
          employee_no:
            employee.employee_no,
          reason:
            "Payroll is already Paid.",
        });

        continue;
      }

      /*
       * Attendance for payroll period
       */
      const {
        data: attendance,
        error: attendanceError,
      } = await admin
        .from("attendance")
        .select(
          `
          id,
          work_date,
          time_in,
          time_out,
          late_minutes,
          late_deduction,
          overtime_minutes
          `
        )
        .eq(
          "employee_id",
          employee.id
        )
        .gte(
          "work_date",
          periodStart
        )
        .lte(
          "work_date",
          periodEnd
        );

      if (attendanceError) {
        return NextResponse.json(
          {
            error:
              attendanceError.message,
          },
          { status: 500 }
        );
      }

      /*
       * A payable day currently means
       * attendance with actual time-in.
       */
      const payableAttendance =
        (attendance ?? []).filter(
          (record) =>
            record.time_in !== null &&
            record.time_in !== ""
        );

      const daysWorked =
        payableAttendance.length;

      const dailyRate =
        Number(
          employee.daily_rate ?? 0
        );

      const basePay =
        roundMoney(
          daysWorked * dailyRate
        );

      /*
       * Sum actual late deductions
       * recorded by Attendance module.
       */
      const lateDeductions =
        roundMoney(
          (attendance ?? []).reduce(
            (total, record) =>
              total +
              Number(
                record.late_deduction ??
                  0
              ),
            0
          )
        );

      /*
       * These will be connected
       * in the next stages.
       */
      const commissionTotal = 0;
      const benefitDeductions = 0;
      const loanDeductions = 0;
      const otherDeductions = 0;

      const grossPay =
        roundMoney(
          basePay +
            commissionTotal
        );

      const totalDeductions =
        roundMoney(
          benefitDeductions +
            loanDeductions +
            lateDeductions +
            otherDeductions
        );

      const netPay =
        roundMoney(
          Math.max(
            0,
            grossPay -
              totalDeductions
          )
        );

      const now =
        new Date().toISOString();

      const payrollPayload = {
        employee_id:
          employee.id,

        period_start:
          periodStart,

        period_end:
          periodEnd,

        days_worked:
          daysWorked,

        daily_rate:
          dailyRate,

        gross_pay:
          grossPay,

        commission_total:
          commissionTotal,

        benefit_deductions:
          benefitDeductions,

        loan_deductions:
          loanDeductions,

        late_deductions:
          lateDeductions,

        other_deductions:
          otherDeductions,

        total_deductions:
          totalDeductions,

        net_pay:
          netPay,

        status:
          existingPayroll?.status ||
          "Generated",

        generated_by:
          user.id,

        generated_at:
          now,

        paid_at:
          existingPayroll?.paid_at ??
          null,

        notes:
          existingPayroll?.notes ??
          null,

        updated_at:
          now,
      };

      let payrollRecord;

      /*
       * Update existing unpaid payroll
       * or create a new one.
       */
      if (existingPayroll) {
        const {
          data,
          error,
        } = await admin
          .from("payroll")
          .update(
            payrollPayload
          )
          .eq(
            "id",
            existingPayroll.id
          )
          .select()
          .single();

        if (error) {
          return NextResponse.json(
            {
              error:
                error.message,
            },
            { status: 500 }
          );
        }

        payrollRecord = data;
      } else {
        const {
          data,
          error,
        } = await admin
          .from("payroll")
          .insert(
            payrollPayload
          )
          .select()
          .single();

        if (error) {
          return NextResponse.json(
            {
              error:
                error.message,
            },
            { status: 500 }
          );
        }

        payrollRecord = data;
      }

      /*
       * Rebuild payroll item lines.
       */
      await admin
        .from("payroll_items")
        .delete()
        .eq(
          "payroll_id",
          payrollRecord.id
        );

      const payrollItems: any[] = [];

      payrollItems.push({
        payroll_id:
          payrollRecord.id,

        item_type:
          "Earning",

        category:
          "Basic Pay",

        description:
          `${daysWorked} day(s) × ₱${dailyRate.toFixed(
            2
          )}`,

        amount:
          basePay,

        reference_id:
          null,
      });

      if (lateDeductions > 0) {
        payrollItems.push({
          payroll_id:
            payrollRecord.id,

          item_type:
            "Deduction",

          category:
            "Late",

          description:
            "Attendance late deductions",

          amount:
            lateDeductions,

          reference_id:
            null,
        });
      }

      const {
        error: itemError,
      } = await admin
        .from("payroll_items")
        .insert(payrollItems);

      if (itemError) {
        return NextResponse.json(
          {
            error:
              itemError.message,
          },
          { status: 500 }
        );
      }

      /*
       * Employee display name
       */
      const employeeName = [
        employee.first_name,
        employee.middle_name,
        employee.last_name,
      ]
        .filter(Boolean)
        .join(" ");

      /*
       * Audit Log
       */
      await admin
        .from("audit_logs")
        .insert({
          actor_id:
            user.id,

          action:
            existingPayroll
              ? "UPDATE"
              : "CREATE",

          module:
            "Payroll",

          record_table:
            "payroll",

          record_id:
            payrollRecord.id,

          description:
            `Generated payroll for ${employeeName}: ${periodStart} to ${periodEnd}`,

          old_data:
            existingPayroll ??
            null,

          new_data:
            payrollRecord,
        });

      generatedPayroll.push({
        ...payrollRecord,

        employee: {
          employee_no:
            employee.employee_no,

          full_name:
            employeeName,

          branch:
            employee.branch,
        },
      });
    }

    return NextResponse.json({
      success: true,

      message:
        "Payroll generated successfully.",

      generated_count:
        generatedPayroll.length,

      skipped_count:
        skippedPayroll.length,

      payroll:
        generatedPayroll,

      skipped:
        skippedPayroll,
    });
  } catch (error: any) {
    console.error(
      "POST /api/payroll failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unable to generate payroll.",
      },
      { status: 500 }
    );
  }
}
