import { createStart, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { isRedirect } from "@tanstack/react-router";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

function isJsonRequest(request: Request | undefined): boolean {
  if (!request) return false;
  const accept = request.headers.get("accept") ?? "";
  const contentType = request.headers.get("content-type") ?? "";
  return (
    accept.includes("application/json") ||
    contentType.includes("application/json") ||
    request.headers.get("x-tsr-serverFn") === "true"
  );
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    // Preserve redirects and explicit responses thrown by handlers.
    if (
      error instanceof Response ||
      isRedirect(error) ||
      (error != null && typeof error === "object" && "statusCode" in error)
    ) {
      throw error;
    }

    console.error(error);

    const request = getRequest();

    // Server functions and JSON API routes expect JSON errors.
    // Returning HTML here breaks client-side error handling (e.g. empty {} toast).
    if (isJsonRequest(request)) {
      const message = error instanceof Error ? error.message : String(error);
      return new Response(JSON.stringify({ message, status: 500 }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
