import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { registrarLoginCorretor } from "@/lib/notificacoes.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — Alexandria Leds" },
      { name: "description", content: "Acesse sua conta Alexandria Leds para gerenciar leads e vendas." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handleGoogle() {
    setLoading(true);
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (res.error) { toast.error("Erro no login com Google"); setLoading(false); return; }
    if (res.redirected) return;
    navigate({ to: "/dashboard", replace: true });
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      registrarLoginCorretor().catch(() => {});
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na autenticação");
    } finally { setLoading(false); }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="relative hidden bg-gradient-to-br from-primary via-primary/90 to-primary/70 p-10 text-primary-foreground md:flex md:flex-col md:justify-between">
        <div className="flex items-center gap-2">
          <div className="grid size-10 place-items-center rounded-xl bg-white/15 backdrop-blur"><Building2 className="size-5" /></div>
          <span className="text-lg font-bold tracking-tight">Alexandria Leds</span>
        </div>
        <div className="space-y-4">
          <h1 className="text-4xl font-bold leading-tight">Feche mais vendas com um CRM que pensa por você.</h1>
          <p className="max-w-md text-primary-foreground/80">Distribuição automática de leads, mensagens de WhatsApp geradas por IA, funil visual e agenda inteligente — tudo em um só lugar.</p>
        </div>
        <div className="text-xs text-primary-foreground/70">© {new Date().getFullYear()} Alexandria Leds</div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12">
        <Card className="w-full max-w-md p-8 shadow-soft">
          <div className="mb-6 flex items-center gap-2 md:hidden">
            <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Building2 className="size-4" /></div>
            <span className="text-lg font-bold">Alexandria Leds</span>
          </div>
          <h2 className="text-2xl font-bold">Entrar</h2>
          <p className="mt-1 text-sm text-muted-foreground">Bem-vindo de volta.</p>

          <Button type="button" variant="outline" className="mt-6 w-full" disabled={loading} onClick={handleGoogle}>
            <svg width="16" height="16" viewBox="0 0 48 48" className="mr-2"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.3 29.4 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 5.1 29.4 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c11 0 20-8 20-21 0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 5.1 29.4 3 24 3 16.3 3 9.7 7.4 6.3 14.7z"/><path fill="#4CAF50" d="M24 45c5.3 0 10.1-2 13.7-5.3l-6.3-5.2C29.4 36 26.9 37 24 37c-5.4 0-9.9-2.7-11.9-6.7l-6.5 5C9 41.5 15.9 45 24 45z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.4-2.4 4.5-4.6 5.9l6.3 5.2C41.4 36.7 44 31 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>
            Continuar com Google
          </Button>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> OU <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmail} className="space-y-4">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
            </div>
            <div>
              <Label htmlFor="pwd">Senha</Label>
              <Input id="pwd" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Aguarde…" : "Entrar"}
            </Button>
          </form>

          <div className="mt-5 rounded-md bg-muted/40 p-3 text-center text-xs text-muted-foreground">
            O acesso ao Alexandria Leds é <strong>somente por convite</strong>.
            Se você é de uma nova imobiliária, fale com o administrador para receber seu login.
          </div>

        </Card>
      </div>
    </div>
  );
}
