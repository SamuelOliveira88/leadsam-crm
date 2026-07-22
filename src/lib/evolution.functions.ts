import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const enviarWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ numero: z.string().min(6), mensagem: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { sendWhatsAppText } = await import("./evolution.server");
    const r = await sendWhatsAppText(data.numero, data.mensagem);
    if (!r.ok) throw new Error(r.error || "Falha ao enviar");
    return { ok: true };
  });

export const notificarCorretorDoLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ lead_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: lead, error } = await context.supabase
      .from("leads")
      .select("id, nome, telefone, email, corretor_id, corretores(nome, telefone)")
      .eq("id", data.lead_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) throw new Error("Lead não encontrado");
    const corretorTel = (lead as any).corretores?.telefone;
    if (!corretorTel) throw new Error("Corretor sem telefone cadastrado");

    const { sendWhatsAppText, mensagemNovoLead } = await import("./evolution.server");
    const r = await sendWhatsAppText(corretorTel, mensagemNovoLead(lead as any));
    if (!r.ok) throw new Error(r.error || "Falha ao enviar");
    return { ok: true };
  });
