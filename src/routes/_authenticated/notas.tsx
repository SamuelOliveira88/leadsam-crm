import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/notas")({
  head: () => ({
    meta: [
      { title: "Notas pessoais | Alexandria Leds" },
      { name: "description", content: "Bloco de notas privado do usuário: anotações visíveis apenas para quem as criou." },
      { property: "og:title", content: "Notas pessoais | Alexandria Leds" },
      { property: "og:description", content: "Anotações privadas, visíveis apenas para você." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotasPage,
});

type Nota = { id: string; titulo: string; conteudo: string | null; created_at: string };

function NotasPage() {
  const qc = useQueryClient();
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");

  const { data: notas, isLoading } = useQuery({
    queryKey: ["notas-pessoais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notas_pessoais")
        .select("id, titulo, conteudo, created_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Nota[];
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("notas_pessoais").insert({ titulo: titulo.trim(), conteudo: conteudo.trim() || null });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Nota salva.");
      setTitulo("");
      setConteudo("");
      qc.invalidateQueries({ queryKey: ["notas-pessoais"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar nota"),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notas_pessoais").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Nota excluída.");
      qc.invalidateQueries({ queryKey: ["notas-pessoais"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao excluir"),
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Lock className="size-5 text-muted-foreground" /> Notas pessoais
        </h1>
        <p className="text-sm text-muted-foreground">
          Estas notas são privadas: ninguém mais — nem master, gerente ou suporte — consegue lê-las.
        </p>
      </header>

      <Card className="space-y-3 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="nota-titulo">Título</Label>
          <Input id="nota-titulo" value={titulo} maxLength={160} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Follow-up cliente X" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nota-conteudo">Conteúdo</Label>
          <Textarea id="nota-conteudo" value={conteudo} rows={4} onChange={(e) => setConteudo(e.target.value)} placeholder="Escreva sua anotação…" />
        </div>
        <div className="flex justify-end">
          <Button disabled={titulo.trim().length < 2 || criar.isPending} onClick={() => criar.mutate()}>
            <Plus className="mr-2 size-4" /> {criar.isPending ? "Salvando…" : "Salvar nota"}
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !notas?.length ? (
        <p className="text-sm text-muted-foreground">Nenhuma nota ainda.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {notas.map((n) => (
            <Card key={n.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-medium">{n.titulo}</h2>
                <Button size="icon" variant="ghost" onClick={() => excluir.mutate(n.id)} aria-label="Excluir nota">
                  <Trash2 className="size-4" />
                </Button>
              </div>
              {n.conteudo && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{n.conteudo}</p>}
              <p className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString("pt-BR")}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
