import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { meuPerfil } from "@/lib/perfis.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Bloqueia o acesso quando o usuário logado é apenas "corretor". */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const perfilFn = useServerFn(meuPerfil);
  const { data: perfil, isLoading } = useQuery({ queryKey: ["meuPerfil"], queryFn: () => perfilFn() });

  if (isLoading || !perfil) return null;

  const permitido = perfil.role === "master" || perfil.role === "gerente";
  if (permitido) return <>{children}</>;

  return (
    <div className="grid min-h-[60vh] place-items-center p-6">
      <Card className="max-w-md p-8 text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="size-6" />
        </div>
        <h1 className="mb-2 text-lg font-semibold">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground">
          Esta área é exclusiva para gerentes e master. Fale com o responsável se você precisa deste acesso.
        </p>
        <Link to="/dashboard">
          <Button className="mt-6">Voltar ao Dashboard</Button>
        </Link>
      </Card>
    </div>
  );
}
