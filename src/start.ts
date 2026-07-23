import { createStart, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);

    // Server functions and JSON API routes expect JSON errors.
    // Returning HTML here breaks client-side error handling (e.g. empty {} toast).
    const request = getRequest();
    const headers = request?.headers;
    const accept = headers?.get("accept") ?? "";
    const contentType = headers?.get("content-type") ?? "";
    const isJsonRequest =
      accept.includes("application/json") ||
      contentType.includes("application/json");

    if (isJsonRequest) {
      throw error;
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
