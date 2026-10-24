import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { Bot } from "lucide-react";
import { RequireAdmin } from "@/components/RequireAdmin";
import { meuPerfil } from "@/lib/perfis.functions";
import { DIAS_SEMANA, HORARIO_PADRAO, type HorarioMia } from "@/lib/mia-empresa";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp — Alexandria Leds" }] }),
  component: () => <RequireAdmin><WhatsAppPagina /></RequireAdmin>,
});

type Conexao = { status: string; qr: string | null; numero: string | null; erro: string | null; updated_at: string };

function MiaCard() {
  const qc = useQueryClient();
  const perfilFn = useServerFn(meuPerfil);
  const { data: perfil } = useQuery({ queryKey: ["meuPerfil"], queryFn: () => perfilFn() });
  const empresaId = perfil?.empresa_id ?? null;
  const { data: plano } = useQuery({
    queryKey: ["meu-plano"],
    queryFn: async () => { const { data, error } = await (supabase as any).rpc("meu_plano"); if (error) throw new Error(error.message); return data as { mia: boolean } | null; },
  });
  const { data: cfg } = useQuery({
    enabled: !!empresaId,
    queryKey: ["mia-config", empresaId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("mia_config").select("respostas, ativa, horario").eq("empresa_id", empresaId).maybeSingle();
      if (error) throw new Error(error.message);
      return data as { respostas: Record<string, string>; ativa: boolean; horario: HorarioMia } | null;
    },
  });
  const alterna = useMutation({
    mutationFn: async (ativa: boolean) => {
      const { error } = await (supabase as any).from("mia_config").upsert({ empresa_id: empresaId, ativa }, { onConflict: "empresa_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mia-config"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const liberada = !!plano?.mia;
  const h = { ...HORARIO_PADRAO, ...(cfg?.horario ?? {}) };
  const quando = h.sempre ? "o dia todo, todos os dias" : `${h.dias.map((d) => DIAS_SEMANA[d]).join(", ")}, das ${h.inicio} às ${h.fim}`;
  const preenchida = Object.values(cfg?.respostas ?? {}).some((v) => (v ?? "").trim());
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center gap-2 text-lg font-semibold"><Bot className="size-5" /> Mi.IA atendendo seus clientes</div>
      <p className="text-sm text-muted-foreground">
        Com a Mi.IA ligada, o cliente novo que escreve para este número é atendido por ela primeiro. Quando chega a hora certa, ela passa para um corretor.
      </p>
      {!liberada ? (
        <p className="text-sm">Faz parte do plano <b>Alexandria + Mi.IA</b>. <Link to="/meu-plano" className="font-medium underline">Ver planos</Link></p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={!!cfg?.ativa} disabled={alterna.isPending || !empresaId || !preenchida}
              onChange={(e) => alterna.mutate(e.target.checked)} />
            Mi.IA ligada {cfg?.ativa ? "— atendendo " + quando : ""}
          </label>
          {!preenchida && <p className="text-xs text-muted-foreground">Antes de ligar, responda as 8 perguntas em Minha Mi.IA.</p>}
        </>
      )}
      <Link to="/minha-mia"><Button variant="outline" size="sm">Ensinar e testar a Mi.IA</Button></Link>
    </Card>
  );
}

function WhatsAppPagina() {
  const qc = useQueryClient();
  const { data: conexao, isLoading } = useQuery({
    queryKey: ["conexao-whatsapp"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("conexoes_whatsapp")
        .select("status, qr, numero, erro, updated_at")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as Conexao | null;
    },
    // Enquanto espera o QR ou a leitura, confere de 3 em 3 segundos.
    refetchInterval: (q) => {
      const s = (q.state.data as Conexao | null)?.status;
      return s === "pedido" || s === "qr" || s === "desconectar" ? 3000 : false;
    },
  });

  const conectar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("pedir_conexao_whatsapp");
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conexao-whatsapp"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const desconectar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("desconectar_whatsapp");
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Desconectando..."); qc.invalidateQueries({ queryKey: ["conexao-whatsapp"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = conexao?.status;
  const qrSrc = conexao?.qr ? (conexao.qr.startsWith("data:") ? conexao.qr : `data:image/png;base64,${conexao.qr}`) : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp da imobiliária</h1>
        <p className="text-sm text-muted-foreground">
          Conecte o número da sua imobiliária lendo um QR code. As mensagens dos seus clientes chegam só para a sua equipe.
        </p>
      </div>

      <Card className="space-y-4 p-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : s === "conectado" ? (
          <>
            <div className="text-lg font-semibold text-green-700">Conectado{conexao?.numero ? ` — ${conexao.numero}` : ""}</div>
            <p className="text-sm text-muted-foreground">Seu número já está recebendo e enviando mensagens pelo Alexandria.</p>
            <Button variant="outline" disabled={desconectar.isPending} onClick={() => desconectar.mutate()}>Desconectar</Button>
          </>
        ) : s === "qr" && qrSrc ? (
          <>
            <div className="text-lg font-semibold">Leia o QR code com o WhatsApp</div>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Abra o WhatsApp no celular da imobiliária.</li>
              <li>Toque em <b>Aparelhos conectados</b> e depois em <b>Conectar um aparelho</b>.</li>
              <li>Aponte a câmera para o código abaixo.</li>
            </ol>
            <img src={qrSrc} alt="QR code do WhatsApp" className="size-64 rounded-lg border bg-white p-2" />
            <p className="text-xs text-muted-foreground">O código troca sozinho de tempos em tempos. Esta tela atualiza sozinha.</p>
          </>
        ) : s === "pedido" || s === "desconectar" ? (
          <p className="text-sm text-muted-foreground">
            {s === "pedido" ? "Gerando o QR code... leva alguns segundos." : "Desconectando..."}
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {s === "erro" ? `Não deu certo: ${conexao?.erro ?? "erro desconhecido"}. Tente de novo.` :
               s === "desconectado" ? "WhatsApp desconectado." : "Nenhum WhatsApp conectado ainda."}
            </p>
            <Button disabled={conectar.isPending} onClick={() => conectar.mutate()}>Conectar WhatsApp</Button>
          </>
        )}
      </Card>

      <MiaCard />
    </div>
  );
}
