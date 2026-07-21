import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, LayoutDashboard, Users, UserCog, Upload, Clock, Layers, LogOut, Bell, Grid3x3, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { meuPerfil } from "@/lib/perfis.functions";
import { listarNotificacoes } from "@/lib/notificacoes.functions";
import { getConfigAcesso } from "@/lib/config-acesso.functions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { User } from "@supabase/supabase-js";

const BASE_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/importar", label: "Importar", icon: Upload },
  { to: "/corretores", label: "Corretores", icon: UserCog },
  { to: "/espelho", label: "Espelho", icon: Grid3x3 },
  { to: "/horarios", label: "Horários", icon: Clock },
] as const;

function minutosAgoraSP(): number {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

function toMinutos(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fetchPerfil = useServerFn(meuPerfil);
  const fetchNotif = useServerFn(listarNotificacoes);
  const fetchConfig = useServerFn(getConfigAcesso);
  const { data: perfil } = useQuery({ queryKey: ["meuPerfil"], queryFn: () => fetchPerfil() });
  const { data: notifs } = useQuery({
    queryKey: ["notificacoes"],
    queryFn: () => fetchNotif(),
    refetchInterval: 30000,
    enabled: !!perfil,
  });
  const { data: config } = useQuery({
    queryKey: ["config_acesso"],
    queryFn: () => fetchConfig(),
    refetchInterval: 60000,
    enabled: !!perfil,
  });
  const isMaster = perfil?.role === "master";
  const isGerenteOuMaster = perfil?.role === "master" || perfil?.role === "gerente";
  const naoLidas = (notifs ?? []).filter((n) => !n.lida).length;

  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  function permitido(): boolean {
    if (!config) return true;
    if (!config.restringir_horario) return true;
    if (config.liberado_ate && new Date(config.liberado_ate).getTime() > Date.now()) return true;
    const agora = minutosAgoraSP();
    const ini = toMinutos(String(config.hora_inicio).slice(0, 5));
    const fim = toMinutos(String(config.hora_fim).slice(0, 5));
    return agora >= ini && agora <= fim;
    void tick;
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  if (perfil && !isMaster && !permitido()) {
    const ini = String(config?.hora_inicio ?? "08:00:00").slice(0, 5);
    const fim = String(config?.hora_fim ?? "09:30:00").slice(0, 5);
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6">
        <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-soft">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Clock className="size-6" />
          </div>
          <h1 className="mb-2 text-xl font-bold">Fora do horário de acesso</h1>
          <p className="text-sm text-muted-foreground">
            O acesso para {perfil.role === "gerente" ? "gerentes" : "corretores"} está disponível
            <br /><strong>das {ini} às {fim}</strong> (horário de Brasília).
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Peça ao master ou gerente para liberar acesso imediato, se necessário.</p>
          <Button className="mt-6 w-full" onClick={handleLogout}>Sair</Button>
        </div>
      </div>
    );
  }

  const nav = [...BASE_NAV, { to: "/notificacoes" as const, label: "Alertas", icon: Bell }];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2 px-6 py-5">
          <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-soft">
            <Building2 className="size-5" />
          </div>
          <div>
            <div className="text-base font-bold tracking-tight">Alexandria Leds</div>
            <div className="text-[11px] text-muted-foreground">Gestão de Corretores</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {nav.map((n) => {
            const Icon = n.icon;
            const active = pathname === n.to || pathname.startsWith(n.to + "/");
            const showBadge = n.to === "/notificacoes" && naoLidas > 0;
            return (
              <Link key={n.to} to={n.to} className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}>
                <Icon className="size-4" />
                <span className="flex-1">{n.label}</span>
                {showBadge && (
                  <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {naoLidas > 9 ? "9+" : naoLidas}
                  </span>
                )}
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
        <div className="grid grid-cols-7">
          {nav.map((n) => {
            const Icon = n.icon;
            const active = pathname === n.to || pathname.startsWith(n.to + "/");
            const showBadge = n.to === "/notificacoes" && naoLidas > 0;
            return (
              <Link key={n.to} to={n.to} className={cn(
                "relative flex flex-col items-center gap-1 py-2 text-[10px] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}>
                <Icon className="size-5" />
                {n.label}
                {showBadge && (
                  <span className="absolute right-3 top-1 grid size-4 place-items-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                    {naoLidas > 9 ? "9+" : naoLidas}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
