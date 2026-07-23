import { createServerFn } from "@tanstack/react-start";

export const testThrow = createServerFn({ method: "POST" })
  .handler(async () => {
    throw new Error("Erro intencional do server function");
  });
