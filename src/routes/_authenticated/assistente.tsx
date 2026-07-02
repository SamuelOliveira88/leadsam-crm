import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Bot, Send, Loader2, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";

export const Route = createFileRoute("/_authenticated/assistente")({
  head: () => ({ meta: [{ title: "Assistente IA — ImobLead" }] }),
  component: AssistentePage,
});

const PROMPTS = [
  "Como abordar um lead que sumiu depois da primeira visita?",
  "Escreva um roteiro curto para ligação de qualificação.",
  "Dicas para negociar comissão sem perder o cliente.",
  "Como responder ao lead que acha o imóvel caro?",
];

function AssistentePage() {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  function submit(text: string) {
    if (!text.trim() || isLoading) return;
    void sendMessage({ text });
    setInput("");
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col gap-4 md:h-[calc(100vh-8rem)]">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><Bot className="size-5" /></div>
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Assistente IA</h1>
          <p className="text-xs text-muted-foreground">Consultor especialista em vendas imobiliárias no Brasil.</p>
        </div>
      </div>

      <Card ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6">
        {messages.length === 0 && (
          <div className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">Comece com uma pergunta ou use uma sugestão:</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PROMPTS.map((p) => (
                <button key={p} onClick={() => submit(p)}
                  className="flex items-start gap-2 rounded-lg border border-border bg-card p-3 text-left text-sm transition hover:border-primary hover:bg-primary-soft">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-4">
          {messages.map((m) => {
            const text = m.parts.map((p) => p.type === "text" ? p.text : "").join("");
            const isUser = m.role === "user";
            return (
              <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {isUser ? <p className="whitespace-pre-wrap">{text}</p> : (
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1">
                      <ReactMarkdown>{text || "…"}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {status === "submitted" && (
            <div className="flex justify-start"><div className="rounded-2xl bg-muted px-4 py-3"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div></div>
          )}
        </div>
      </Card>

      <form onSubmit={(e) => { e.preventDefault(); submit(input); }} className="flex gap-2">
        <Textarea
          value={input} onChange={(e) => setInput(e.target.value)} rows={1}
          placeholder="Pergunte ao seu consultor IA…"
          className="min-h-[48px] resize-none"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(input); } }}
        />
        <Button type="submit" disabled={isLoading || !input.trim()} className="h-auto px-4">
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
    </div>
  );
}
