import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, LayoutDashboard, Users, UserCog, Upload, Clock, Layers, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { meuPerfil } from "@/lib/perfis.functions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { User } from "@supabase/supabase-js";

const BASE_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/importar", label: "Importar", icon: Upload },
  { to: "/corretores", label: "Corretores", icon: UserCog },
  { to: "/horarios", label: "Horários", icon: Clock },
] as const;

export function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fetchPerfil = useServerFn(meuPerfil);
  const { data: perfil } = useQuery({ queryKey: ["meuPerfil"], queryFn: () => fetchPerfil() });
  const isMaster = perfil?.role === "master";

  async function handleLogout() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  const nav = [...BASE_NAV];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2 px-6 py-5">
          <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-soft">
            <Building2 className="size-5" />
          </div>
          <div>
            <div className="text-base font-bold tracking-tight">ImobLead</div>
            <div className="text-[11px] text-muted-foreground">Gestão de Corretores</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {nav.map((n) => {
            const Icon = n.icon;
            const active = pathname === n.to || pathname.startsWith(n.to + "/");
            return (
              <Link key={n.to} to={n.to} className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}>
                <Icon className="size-4" /> {n.label}
              </Link>
            );
          })}
          {isMaster && (
            <>
              <div className="mt-4 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Master</div>
              <Link to="/grupos" className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                pathname.startsWith("/grupos") ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60",
              )}>
                <Layers className="size-4" /> Grupos
              </Link>
            </>
          )}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 truncate rounded-md bg-sidebar-accent/50 px-3 py-2 text-xs">
            <div className="font-medium">{perfil?.nome ?? user.user_metadata?.full_name ?? "Usuário"}</div>
            <div className="truncate text-muted-foreground">{user.email}</div>
            <div className="mt-0.5 text-[10px] uppercase text-primary">{perfil?.role ?? "..."}</div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleLogout}>
            <LogOut className="mr-2 size-4" /> Sair
          </Button>
        </div>
      </aside>

      <main className="pb-20 md:ml-64 md:pb-0">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {nav.map((n) => {
            const Icon = n.icon;
            const active = pathname === n.to || pathname.startsWith(n.to + "/");
            return (
              <Link key={n.to} to={n.to} className={cn(
                "flex flex-col items-center gap-1 py-2 text-[10px] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}>
                <Icon className="size-5" />
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
