import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Upload, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import * as XLSX from "xlsx";
import { importarLeads, importarLeadsPlanilha } from "@/lib/leads.functions";
import { listarGrupos } from "@/lib/grupos.functions";
import { listarCorretores } from "@/lib/corretores.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

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

// ============ IMPORTAÇÃO ROBUSTA DE PLANILHA (Leadfy / Excel / CSV completo) ============
type LeadPlanilhaRow = {
  nome: string;
  telefone?: string | null;
  email?: string | null;
  corretor_nome?: string | null;
  fonte?: string | null;
  canal?: string | null;
  cidade?: string | null;
  etapa_funil?: string | null;
  motivo_perda?: string | null;
  observacoes?: string | null;
  ultima_atividade?: string | null;
  data_atividade?: string | null;
  valor_negociacao?: number | null;
  codigo_imovel?: string | null;
  campanha?: string | null;
  criado_em?: string | null;
};

function normalizarChave(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizarTelefone(v: unknown): string | null {
  if (!v) return null;
  const digitos = String(v).replace(/\D/g, "");
  if (!digitos) return null;
  // Se não tem código do país (DDD + número = 10 ou 11 dígitos), adiciona 55
  if (digitos.length <= 11) return `55${digitos}`;
  return digitos;
}

// Datas no formato "DD/MM/AA HH:mm" ou "DD/MM/AA HH:mm:ss" (padrão Leadfy)
function parseDataBR(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v).trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, dd, mm, yy, hh, mi, ss] = m;
  const ano = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  const d = new Date(ano, Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss ?? "0"));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseValor(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3},)/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

function pick(row: Record<string, any>, ...chaves: string[]): any {
  const norm: Record<string, any> = {};
  for (const k of Object.keys(row)) norm[normalizarChave(k)] = row[k];
  for (const chave of chaves) {
    const v = norm[normalizarChave(chave)];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

function mapearLinhaPlanilha(row: Record<string, any>): LeadPlanilhaRow | null {
  const nome = pick(row, "Cliente", "Nome", "Name");
  if (!nome) return null;
  const observacoesPartes = [pick(row, "Observações"), pick(row, "Obs. atividade"), pick(row, "Mensagem")].filter(Boolean);
  const campanhaPartes = [pick(row, "Campanha Link"), pick(row, "Campanha Id")].filter(Boolean);
  return {
    nome: String(nome),
    telefone: normalizarTelefone(pick(row, "Telefone", "Phone")),
    email: pick(row, "Email", "E-mail", "Emai", "Emais") || null,
    corretor_nome: pick(row, "Corretor", "Atribuir A Corrotor") || null,
    fonte: pick(row, "Fonte") || null,
    canal: pick(row, "Canal") || null,
    cidade: pick(row, "Cidade") || null,
    etapa_funil: pick(row, "Status") || null,
    motivo_perda: pick(row, "Motivos de perda") || null,
    observacoes: observacoesPartes.length ? observacoesPartes.join(" | ") : null,
    ultima_atividade: pick(row, "Atividade") || null,
    data_atividade: parseDataBR(pick(row, "Data atividade")),
    valor_negociacao: parseValor(pick(row, "Preço")),
    codigo_imovel: pick(row, "Código") || null,
    campanha: campanhaPartes.length ? campanhaPartes.join(" / ") : null,
    criado_em: parseDataBR(pick(row, "Criado em")),
  };
}

function PlanilhaImportSection({ grupoId }: { grupoId: string }) {
  const importFn = useServerFn(importarLeadsPlanilha);
  const fileRef = useRef<HTMLInputElement>(null);
  const [linhas, setLinhas] = useState<LeadPlanilhaRow[]>([]);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [progresso, setProgresso] = useState<{ atual: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<{ sucesso: number; erros: number; semCorretor: number } | null>(null);

  async function handleFile(file: File) {
    setResultado(null);
    setNomeArquivo(file.name);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: null });
    const mapeadas = rows.map(mapearLinhaPlanilha).filter((r): r is LeadPlanilhaRow => r !== null);
    setLinhas(mapeadas);
  }

  async function handleImportar() {
    if (!grupoId || linhas.length === 0) return;
    const TAMANHO_LOTE = 300;
    let sucesso = 0, erros = 0, semCorretor = 0;
    setProgresso({ atual: 0, total: linhas.length });
    for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
      const lote = linhas.slice(i, i + TAMANHO_LOTE);
      try {
        const r = await importFn({ data: { grupo_id: grupoId, leads: lote } });
        sucesso += r.sucesso; erros += r.erros; semCorretor += r.semCorretor;
      } catch {
        erros += lote.length;
      }
      setProgresso({ atual: Math.min(i + TAMANHO_LOTE, linhas.length), total: linhas.length });
    }
    setResultado({ sucesso, erros, semCorretor });
    setProgresso(null);
    toast.success(`Importação concluída: ${sucesso} lead(s) importado(s).`);
  }

  const comCorretor = linhas.filter((l) => l.corretor_nome).length;

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h2 className="font-semibold">Importar planilha completa (Leadfy / Excel)</h2>
        <p className="text-xs text-muted-foreground">
          Sobe o arquivo .xlsx ou .csv exportado do Leadfy. Reconhece automaticamente cliente, telefone, email,
          corretor, fonte, canal, cidade, status, motivo de perda, observações, data e valor.
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
        <FileSpreadsheet className="mr-2 size-4" /> Escolher arquivo
      </Button>

      {nomeArquivo && (
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-4 text-emerald-600" /> {nomeArquivo}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {linhas.length} lead(s) detectado(s) — {comCorretor} serão atribuídos ao corretor original (por nome),{" "}
            {linhas.length - comCorretor} entrarão como represados (corretor não encontrado no grupo selecionado).
          </div>
        </div>
      )}

      <Button onClick={handleImportar} disabled={!grupoId || linhas.length === 0 || !!progresso}>
        <Upload className="mr-2 size-4" />
        {progresso ? `Importando… ${progresso.atual}/${progresso.total}` : "Importar planilha"}
      </Button>

      {!grupoId && <div className="text-xs text-amber-600">Selecione um grupo acima antes de importar.</div>}

      {resultado && (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm">
          {resultado.sucesso} lead(s) importado(s), {resultado.erros} erro(s), {resultado.semCorretor} sem corretor casado.
        </div>
      )}
    </Card>
  );
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

      <PlanilhaImportSection grupoId={grupoId} />
    </div>
  );
}
