import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/cadastro-empresa")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Cadastro por convite — Alexandria Leds" },
      { name: "description", content: "O Alexandria Leds é comercial: novas imobiliárias entram somente por convite." },
    ],
  }),
  component: CadastroFechado,
});

function CadastroFechado() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md space-y-4 p-6 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
          <Building2 className="size-6" />
        </div>
        <h1 className="text-xl font-bold">Cadastro por convite</h1>
        <p className="text-sm text-muted-foreground">
          O Alexandria Leds é um sistema comercial. Novas imobiliárias só entram por convite
          da nossa equipe. Fale com o administrador para receber seu acesso.
        </p>
        <div className="pt-2">
          <Link to="/auth">
            <Button variant="outline" className="w-full">Já tenho conta — entrar</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
