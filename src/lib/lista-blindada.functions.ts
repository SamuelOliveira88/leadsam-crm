import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listaEstaBlindada } from "@/lib/telefone-oculto";

export const lerListaBlindada = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({ blindada: await listaEstaBlindada(context.supabase) }));

export const definirListaBlindada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ blindada: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("definir_lista_blindada", { p_blindada: data.blindada });
    if (error) throw new Error(error.message);
    return { blindada: data.blindada };
  });
