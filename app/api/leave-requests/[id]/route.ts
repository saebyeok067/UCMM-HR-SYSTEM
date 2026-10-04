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

/* ============================================================
   GET /api/leave-requests/[id]
   View one leave request
============================================================ */

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } = await params;

    const { user, profile } =
      await getCurrentUserAndProfile();

    if (!user || !profile) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const admin = adminClient();

    const { data, error } = await admin
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
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          error:
            "Leave request not found.",
        },
        { status: 404 }
      );
    }

    /*
     * Manager:
     * cannot view another branch.
     */
    if (
      profile.role === "manager" &&
      data.employees?.branch !==
        profile.branch
    ) {
      return NextResponse.json(
        { error: "Forbidden." },
        { status: 403 }
      );
    }

    /*
     * Regular employee:
     * own request only.
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

      if (
        !employee ||
        employee.id !==
          data.employee_id
      ) {
        return NextResponse.json(
          { error: "Forbidden." },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      leave_request: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unable to load leave request.",
      },
      { status: 500 }
    );
  }
}

/* ============================================================
   PATCH /api/leave-requests/[id]

   Approve or Reject Leave
============================================================ */

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } = await params;

    const { user, profile } =
      await getCurrentUserAndProfile();

    if (!user || !profile) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    /*
     * Only HR can approve / reject.
     */
    if (
      ![
        "hr_admin",
        "hr_staff",
      ].includes(profile.role)
    ) {
      return NextResponse.json(
        {
          error:
            "Only HR Admin or HR Staff can review leave requests.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const status = String(
      body.status ?? ""
    ).trim();

    const reviewNote =
      body.review_note &&
      String(body.review_note).trim()
        ? String(
            body.review_note
          ).trim()
        : null;

    if (
      ![
        "Approved",
        "Rejected",
      ].includes(status)
    ) {
      return NextResponse.json(
        {
          error:
            "Status must be Approved or Rejected.",
        },
        { status: 400 }
      );
    }

    const admin = adminClient();

    /*
     * Existing request
     */
    const {
      data: existing,
      error: existingError,
    } = await admin
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
          branch
        )
        `
      )
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        {
          error:
            existingError.message,
        },
        { status: 500 }
      );
    }

    if (!existing) {
      return NextResponse.json(
        {
          error:
            "Leave request not found.",
        },
        { status: 404 }
      );
    }

    if (
      existing.status !== "Pending"
    ) {
      return NextResponse.json(
        {
          error:
            `This leave request is already ${existing.status}.`,
        },
        { status: 409 }
      );
    }

    /*
     * Update leave request
     */
    const {
      data: updated,
      error,
    } = await admin
      .from("leave_requests")
      .update({
        status,
        reviewed_by: user.id,
        reviewed_at:
          new Date().toISOString(),
        review_note: reviewNote,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    const employeeName = [
      existing.employees?.first_name,
      existing.employees?.middle_name,
      existing.employees?.last_name,
    ]
      .filter(Boolean)
      .join(" ");

    /*
     * Audit log
     */
    await admin
      .from("audit_logs")
      .insert({
        actor_id: user.id,
        action:
          status === "Approved"
            ? "APPROVE"
            : "REJECT",

        module:
          "Leave Requests",

        record_table:
          "leave_requests",

        record_id: id,

        description:
          `${status} leave request for ${employeeName}`,

        old_data: existing,

        new_data: updated,
      });

    return NextResponse.json({
      success: true,
      message:
        `Leave request ${status.toLowerCase()} successfully.`,
      leave_request: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unable to review leave request.",
      },
      { status: 500 }
    );
  }
}
