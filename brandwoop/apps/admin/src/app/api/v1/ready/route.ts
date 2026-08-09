import { checkDependencies } from "@/lib/readiness";

/**
 * Readiness probe. Reports each dependency separately so an alert can name the
 * failing component instead of "the API is down".
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const checks = await checkDependencies();
  const healthy = Object.values(checks).every((state) => state === "ok");

  return Response.json(
    {
      data: { status: healthy ? "healthy" : "degraded", checks },
      error: null,
    },
    { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
