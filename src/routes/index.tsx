import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota raiz: apenas redireciona para /dashboard ou /auth
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
