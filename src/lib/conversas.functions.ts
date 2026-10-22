import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  listarConversasCore,
  mensagensDoLeadCore,
  enviarMensagemCore,
  type ConversaResumo,
  type MensagemConversa,
} from "@/lib/conversas.core";

export type { ConversaResumo, MensagemConversa };

// Tudo roda com o cliente do próprio usuário: quem decide o que cada um vê é o banco (RLS).
// A lógica fica em conversas.core.ts para a extensão (API) usar exatamente a mesma regra.

export const listarConversas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConversaResumo[]> =>
    listarConversasCore(context.supabase as any, context.userId));

export const mensagensDoLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ lead_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<MensagemConversa[]> =>
    mensagensDoLeadCore(context.supabase as any, data.lead_id));

export const enviarMensagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ lead_id: z.string().uuid(), texto: z.string().trim().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => enviarMensagemCore(context.supabase as any, data.lead_id, data.texto));
