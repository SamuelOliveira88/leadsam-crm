import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const metricasDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: leads, error } = await context.supabase
      .from("leads")
      .select("id, estagio, valor_estimado");
    if (error) throw new Error(error.message);
    const arr = leads ?? [];
    const total = arr.length;
    const emProposta = arr.filter((l) => l.estagio === "proposta").length;
    const fechados = arr.filter((l) => l.estagio === "fechado").length;
    const vgv = arr
      .filter((l) => l.estagio === "fechado" || l.estagio === "proposta")
      .reduce((acc, l) => acc + Number(l.valor_estimado ?? 0), 0);
    return { total, emProposta, fechados, vgv };
  });
