import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      // Quem escaneou um QR de ponto sem estar logado volta para o ponto depois de entrar.
      try {
        const destino = window.location.pathname;
        if (/^\/ponto\/[0-9a-f]{32}$/.test(destino)) sessionStorage.setItem("pos_login_destino", destino);
      } catch {}
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: LayoutComponent,
});

function LayoutComponent() {
  const { user } = Route.useRouteContext();
  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  );
}
