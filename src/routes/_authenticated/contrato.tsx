import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RequireAdmin } from "@/components/RequireAdmin";
import { meuPerfil } from "@/lib/perfis.functions";
import { DADOS_VAZIOS, montarContrato, PLANOS_CONTRATO, type DadosContrato } from "@/lib/contrato";

export const Route = createFileRoute("/_authenticated/contrato")({
  head: () => ({ meta: [{ title: "Contrato — Alexandria Leds" }] }),
  component: () => <RequireAdmin><Contrato /></RequireAdmin>,
});

const CHAVE = "alexandria-contrato-v1";
const CAMPOS_ALEXANDRIA = new Set(["a_nome", "a_doc", "a_endereco", "a_email", "a_rep", "a_suporte", "a_foro", "cidade"]);

function Contrato() {
  const perfilFn = useServerFn(meuPerfil);
  const { data: perfil } = useQuery({ queryKey: ["meuPerfil"], queryFn: () => perfilFn() });
  const empresaId = perfil?.empresa_id ?? null;
  const { data: empresa } = useQuery({
    enabled: !!empresaId,
    queryKey: ["empresa-nome", empresaId],
    queryFn: async () => {
      const { data } = await supabase.from("empresas").select("nome").eq("id", empresaId as string).maybeSingle();
      return data as { nome: string } | null;
    },
  });
  const { data: plano } = useQuery({
    queryKey: ["meu-plano"],
    queryFn: async () => { const { data } = await (supabase as any).rpc("meu_plano"); return data as { plano: string } | null; },
  });

  const [d, setD] = useState<DadosContrato>(DADOS_VAZIOS);
  // carrega o que já foi salvo neste navegador (dados da Alexandria ficam para os próximos contratos)
  useEffect(() => {
    try {
      const s = localStorage.getItem(CHAVE);
      if (s) setD((x) => ({ ...x, ...JSON.parse(s) }));
    } catch { /* sem armazenamento: segue em branco */ }
  }, []);
  useEffect(() => {
    if (empresa?.nome) setD((x) => (x.i_nome ? x : { ...x, i_nome: empresa.nome }));
  }, [empresa?.nome]);
  useEffect(() => {
    if (plano?.plano === "alexandria_ia") setD((x) => ({ ...x, plano: "alexandria_ia" }));
  }, [plano?.plano]);
  useEffect(() => {
    try {
      const salvar: Record<string, string> = {};
      for (const k of CAMPOS_ALEXANDRIA) salvar[k] = (d as any)[k];
      localStorage.setItem(CHAVE, JSON.stringify(salvar));
    } catch { /* ignora */ }
  }, [d]);

  const set = (k: keyof DadosContrato) => (e: React.ChangeEvent<HTMLInputElement>) => setD((x) => ({ ...x, [k]: e.target.value }));
  const campo = (k: keyof DadosContrato, rotulo: string) => (
    <label className="space-y-1 text-xs font-medium">{rotulo}<Input value={d[k] as string} onChange={set(k)} /></label>
  );
  const c = montarContrato(d);

  return (
    <div className="space-y-4">
      <style>{`@media print { body * { visibility: hidden !important; } #contrato, #contrato * { visibility: visible !important; } #contrato { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; border: 0 !important; box-shadow: none !important; } }`}</style>
      <div className="print:hidden">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><FileText className="size-6" /> Contrato</h1>
        <p className="text-sm text-muted-foreground">Preencha os dados e o contrato se monta sozinho ao lado. Depois é só imprimir ou salvar em PDF. Os dados da Alexandria ficam guardados neste navegador.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4 print:hidden">
          <Card className="space-y-3 p-4">
            <div className="font-semibold">Plano</div>
            <div className="flex gap-2">
              {(["alexandria", "alexandria_ia"] as const).map((p) => (
                <Button key={p} type="button" size="sm" variant={d.plano === p ? "default" : "outline"} onClick={() => setD((x) => ({ ...x, plano: p }))}>
                  {PLANOS_CONTRATO[p].nome} · {PLANOS_CONTRATO[p].valor.replace(",00", "")}
                </Button>
              ))}
            </div>
          </Card>
          <Card className="space-y-3 p-4">
            <div className="font-semibold">Imobiliária (contratante)</div>
            {campo("i_nome", "Razão social")}
            {campo("i_cnpj", "CNPJ")}
            {campo("i_creci", "CRECI")}
            {campo("i_endereco", "Endereço")}
            {campo("i_email", "E-mail")}
            {campo("i_whats", "WhatsApp")}
            {campo("i_rep", "Nome do responsável")}
            {campo("i_cpf", "CPF do responsável")}
          </Card>
          <Card className="space-y-3 p-4">
            <div className="font-semibold">Alexandria (contratada)</div>
            {campo("a_nome", "Nome ou razão social")}
            {campo("a_doc", "CPF ou CNPJ")}
            {campo("a_endereco", "Endereço")}
            {campo("a_email", "E-mail")}
            {campo("a_rep", "Representante")}
            {campo("a_suporte", "Contato de suporte (WhatsApp/e-mail)")}
            {campo("a_foro", "Cidade/UF do foro")}
            {campo("cidade", "Cidade da assinatura")}
          </Card>
          <Button className="w-full" onClick={() => window.print()}><Printer className="mr-2 size-4" /> Imprimir / salvar em PDF</Button>
        </div>

        <Card id="contrato" className="space-y-3 p-8 text-sm leading-relaxed">
          <h2 className="text-center text-base font-bold">{c.titulo}</h2>
          {c.blocos.map((b, i) =>
            b.t === "h" ? <h3 key={i} className="pt-2 font-bold">{b.x}</h3>
            : b.t === "sig" ? (() => { const [rot, nome, doc] = b.x.split("|"); return (
                <div key={i} className="pt-8" style={{ breakInside: "avoid" }}>
                  <div className="border-t border-foreground/60 pt-1 text-xs"><b>{rot}</b>{nome ? ` — ${nome}` : ""}{doc ? ` — ${doc}` : rot.startsWith("Testemunha") ? " — CPF: ____________" : ""}</div>
                </div>); })()
            : <p key={i} className="text-justify">{b.x}</p>,
          )}
        </Card>
      </div>
    </div>
  );
}
