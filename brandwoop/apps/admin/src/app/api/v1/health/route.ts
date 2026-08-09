/**
 * Liveness probe for the load balancer (scope section 16).
 * Cheap by contract: it must not touch the database or any provider.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    {
      data: {
        status: "healthy",
        release: process.env.RELEASE_VERSION ?? "0.0.0-dev",
        region: process.env.VERCEL_REGION ?? "local",
      },
      error: null,
    },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
