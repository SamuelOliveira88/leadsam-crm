import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Upload } from "lucide-react";
import { importarLeads } from "@/lib/leads.functions";
import { listarGrupos } from "@/lib/grupos.functions";
import { listarCorretores } from "@/lib/corretores.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/importar")({
  head: () => ({ meta: [{ title: "Importar leads — ImobLead" }] }),
  component: Importar,
});

type LeadRow = { nome: string; telefone?: string | null; email?: string | null };

function parseCSV(text: string): LeadRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].split(/[,;\t]/).map((h) => h.trim().toLowerCase());
  const idxNome = header.findIndex((h) => h.includes("nome") || h.includes("name"));
  const idxTel = header.findIndex((h) => h.includes("tel") || h.includes("fone") || h.includes("phone") || h.includes("whats"));
  const idxEmail = header.findIndex((h) => h.includes("email") || h.includes("e-mail"));
  const rows: LeadRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/[,;\t]/).map((c) => c.trim());
    const nome = idxNome >= 0 ? cols[idxNome] : cols[0];
    if (!nome) continue;
    rows.push({
      nome,
      telefone: idxTel >= 0 ? cols[idxTel] : cols[1] ?? null,
      email: idxEmail >= 0 ? cols[idxEmail] : null,
    });
  }
  return rows;
}

function Importar() {
  const gruposFn = useServerFn(listarGrupos);
  const corretoresFn = useServerFn(listarCorretores);
  const importFn = useServerFn(importarLeads);
  const { data: grupos } = useQuery({ queryKey: ["grupos"], queryFn: () => gruposFn() });
  const { data: corretores } = useQuery({ queryKey: ["corretores"], queryFn: () => corretoresFn() });

  const [grupoId, setGrupoId] = useState("");
  const [modo, setModo] = useState<"rodizio" | "direcionado">("rodizio");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [csvText, setCsvText] = useState("");
  const [resultado, setResultado] = useState<{ sucesso: number; erros: number } | null>(null);

  const parsed = parseCSV(csvText);
  const corretoresGrupo = (corretores ?? []).filter((c: any) => c.grupo_id === grupoId && c.ativo);

  const mut = useMutation({
    mutationFn: () => importFn({ data: {
      grupo_id: grupoId, modo,
      corretores_ids: modo === "direcionado" ? selecionados : undefined,
      leads: parsed,
    } }),
    onSuccess: (r) => setResultado(r),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importar leads</h1>
        <p className="text-sm text-muted-foreground">Cole uma planilha (CSV: nome, telefone, email)</p>
      </div>

      <Card className="space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium">Grupo</label>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
              <option value="">Selecione…</option>
              {(grupos ?? []).map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Distribuição</label>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={modo} onChange={(e) => setModo(e.target.value as any)}>
              <option value="rodizio">Rodízio (todos do grupo)</option>
              <option value="direcionado">Direcionada (escolher corretores)</option>
            </select>
          </div>
        </div>

        {modo === "direcionado" && grupoId && (
          <div className="rounded-md border p-3">
            <div className="mb-2 text-xs font-medium">Corretores selecionados</div>
            <div className="flex flex-wrap gap-2">
              {corretoresGrupo.map((c: any) => {
                const on = selecionados.includes(c.id);
                return (
                  <button key={c.id} type="button"
                    onClick={() => setSelecionados(on ? selecionados.filter((x) => x !== c.id) : [...selecionados, c.id])}
                    className={`rounded-full border px-3 py-1 text-xs ${on ? "bg-primary text-primary-foreground" : "bg-background"}`}>
                    {c.nome}
                  </button>
                );
              })}
              {corretoresGrupo.length === 0 && <div className="text-xs text-muted-foreground">Nenhum corretor ativo neste grupo.</div>}
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium">Planilha (CSV)</label>
          <Textarea rows={8} value={csvText} onChange={(e) => setCsvText(e.target.value)}
            placeholder="nome,telefone,email&#10;João Silva,5511999999999,joao@ex.com" />
          <div className="mt-1 text-xs text-muted-foreground">{parsed.length} lead(s) detectado(s)</div>
        </div>

        <Button onClick={() => mut.mutate()} disabled={!grupoId || parsed.length === 0 || mut.isPending}>
          <Upload className="mr-2 size-4" /> {mut.isPending ? "Importando…" : "Importar"}
        </Button>

        {resultado && (
          <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm">
            {resultado.sucesso} lead(s) importado(s), {resultado.erros} erro(s).
          </div>
        )}
      </Card>
    </div>
  );
}
