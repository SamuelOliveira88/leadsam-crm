import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/set-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Definir senha — ImobLead" },
      { name: "description", content: "Ative sua conta ImobLead definindo uma nova senha." },
    ],
  }),
  component: SetPasswordPage,
});

function SetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"validando" | "pronto" | "invalido">("validando");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      // Formato novo: ?token_hash=...&type=invite (ou recovery)
      const url = new URL(window.location.href);
      const token_hash = url.searchParams.get("token_hash");
      const type = (url.searchParams.get("type") ?? "invite") as
        | "invite" | "recovery" | "signup" | "magiclink" | "email_change";

      if (token_hash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash, type });
        if (error) { setStatus("invalido"); return; }
        setStatus("pronto");
        return;
      }

      // Formato antigo: #access_token=...&refresh_token=... no hash
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) { setStatus("invalido"); return; }
        setStatus("pronto");
        return;
      }

      // Já autenticado? Também permite trocar a senha.
      const { data } = await supabase.auth.getUser();
      setStatus(data.user ? "pronto" : "invalido");
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { toast.error("A senha deve ter ao menos 6 caracteres."); return; }
    if (password !== confirm) { toast.error("As senhas não conferem."); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Senha definida! Bem-vindo(a).");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 p-6">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="size-4" />
          </div>
          <span className="text-lg font-bold">ImobLead</span>
        </div>

        {status === "validando" && (
          <p className="text-sm text-muted-foreground">Validando seu convite…</p>
        )}

        {status === "invalido" && (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Link inválido ou expirado</h2>
            <p className="text-sm text-muted-foreground">
              Peça ao administrador para reenviar seu convite.
            </p>
            <Button variant="outline" onClick={() => navigate({ to: "/auth" })}>Ir para login</Button>
          </div>
        )}

        {status === "pronto" && (
          <>
            <h2 className="text-2xl font-bold">Defina sua senha</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Escolha uma senha para acessar sua conta.
            </p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="pwd">Nova senha</Label>
                <Input id="pwd" type="password" required minLength={6}
                  value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="pwd2">Confirmar senha</Label>
                <Input id="pwd2" type="password" required minLength={6}
                  value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Salvando…" : "Salvar e entrar"}
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
