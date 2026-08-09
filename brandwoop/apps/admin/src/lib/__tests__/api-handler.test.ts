import { AuthorizationError, anonymousContext, type AuthContext } from "@brandwoop/auth";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ApiError, createApiHandler } from "../api-handler";
import { redact } from "../logger";

const activeContext: AuthContext = {
  userId: "99999999-9999-4999-8999-999999999999",
  tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  role: "administrator",
  membershipStatus: "active",
  allocatedSiteIds: [],
  supportGrant: null,
  mfaSatisfied: true,
};

const bodySchema = z.object({ name: z.string().min(1) });

function post(body: unknown): Request {
  return new Request("https://portal.test/api/v1/example", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("createApiHandler", () => {
  it("returns the success envelope with a request id", async () => {
    const handler = createApiHandler(
      { route: "/api/v1/example", bodySchema, resolveContext: async () => activeContext },
      async ({ body }) => ({ echoed: body.name }),
    );

    const response = await handler(post({ name: "Site A" }));
    const payload = (await response.json()) as {
      data: { echoed: string };
      error: null;
      meta: { requestId: string };
    };

    expect(response.status).toBe(200);
    expect(payload.data.echoed).toBe("Site A");
    expect(payload.error).toBeNull();
    expect(payload.meta.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects an invalid body with 422 and field details", async () => {
    const handler = createApiHandler(
      { route: "/api/v1/example", bodySchema, resolveContext: async () => activeContext },
      async () => ({ ok: true }),
    );

    const response = await handler(post({ name: "" }));
    const payload = (await response.json()) as {
      error: { code: string; details: { field: string }[] };
    };

    expect(response.status).toBe(422);
    expect(payload.error.code).toBe("VALIDATION_FAILED");
    expect(payload.error.details[0]?.field).toBe("name");
  });

  it("rejects malformed JSON without reaching the handler", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const route = createApiHandler(
      { route: "/api/v1/example", bodySchema, resolveContext: async () => activeContext },
      handler,
    );

    const response = await route(post("{not json"));

    expect(response.status).toBe(422);
    expect(handler).not.toHaveBeenCalled();
  });

  it("maps an authorisation denial to 403 and leaks no detail", async () => {
    const route = createApiHandler(
      { route: "/api/v1/example", bodySchema, resolveContext: async () => activeContext },
      async () => {
        throw new AuthorizationError("tenant_mismatch", "site.manage");
      },
    );

    const response = await route(post({ name: "Site A" }));
    const payload = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("FORBIDDEN");
    expect(payload.error.message).toBe("Not permitted");
  });

  it("maps a missing session to 401", async () => {
    const route = createApiHandler(
      { route: "/api/v1/example", bodySchema, resolveContext: async () => anonymousContext() },
      async () => {
        throw new AuthorizationError("not_authenticated", "site.view");
      },
    );

    expect((await route(post({ name: "Site A" }))).status).toBe(401);
  });

  it("converts an unexpected error into an opaque 500", async () => {
    const route = createApiHandler(
      { route: "/api/v1/example", bodySchema, resolveContext: async () => activeContext },
      async () => {
        throw new Error("connection string postgres://user:secret@host/db failed");
      },
    );

    const response = await route(post({ name: "Site A" }));
    const payload = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(500);
    expect(payload.error.code).toBe("INTERNAL");
    expect(payload.error.message).toBe("An unexpected error occurred");
    expect(JSON.stringify(payload)).not.toContain("secret");
  });

  it("passes an ApiError code straight through", async () => {
    const route = createApiHandler(
      { route: "/api/v1/example", bodySchema, resolveContext: async () => activeContext },
      async () => {
        throw new ApiError("CONFLICT", "Shift already signed off");
      },
    );

    const response = await route(post({ name: "Site A" }));
    expect(response.status).toBe(409);
  });
});

describe("log redaction", () => {
  it("removes credentials and location from structured context", () => {
    const redacted = redact({
      requestId: "abc",
      token: "eyJhbGciOi",
      nested: { password: "hunter2", latitude: -33.8688, objectPath: "tenant/photo.jpg" },
      safe: "kept",
    }) as Record<string, unknown>;

    expect(redacted.requestId).toBe("abc");
    expect(redacted.token).toBe("[redacted]");
    expect(redacted.safe).toBe("kept");
    const nested = redacted.nested as Record<string, unknown>;
    expect(nested.password).toBe("[redacted]");
    expect(nested.latitude).toBe("[redacted]");
    expect(nested.objectPath).toBe("[redacted]");
  });
});
