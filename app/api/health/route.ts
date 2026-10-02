export async function GET() {
  return Response.json({
    ok: true,
    app: "Underchargers HR System",
    deployment: "vercel"
  });
}
