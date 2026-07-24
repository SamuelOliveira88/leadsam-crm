// Endpoint interno protegido por WEBHOOK_LEAD_TOKEN para reenviar links
// de definição de senha (recovery) para todos os perfis (corretor/gerente)
// de um grupo. Usado apenas por administradores via curl.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/admin/reenviar-convites")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-admin-token") || "";
        const expected = process.env.WEBHOOK_LEAD_TOKEN || "";
        if (!token || token !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const body = await request.json().catch(() => ({} as any));
        const grupo_id: string | undefined = body.grupo_id;
        const empresa_id: string | undefined = body.empresa_id;
        const redirect_to: string = body.redirect_to || "https://alexandria-leds.lovable.app/set-password";
        const apenas_pendentes: boolean = !!body.apenas_pendentes;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let query = supabaseAdmin
          .from("perfis")
          .select("id, nome, role, grupo_id, empresa_id")
          .in("role", ["corretor", "gerente"]);
        if (grupo_id) query = query.eq("grupo_id", grupo_id);
        if (empresa_id) query = query.eq("empresa_id", empresa_id);

        const { data: perfis, error } = await query;
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }

        const enviados: Array<{ email: string; nome: string | null }> = [];
        const falhas: Array<{ nome?: string | null; motivo: string }> = [];

        for (const p of perfis ?? []) {
          const { data: u, error: uErr } = await supabaseAdmin.auth.admin.getUserById(p.id);
          if (uErr || !u?.user?.email) { falhas.push({ nome: p.nome, motivo: uErr?.message || "sem email" }); continue; }
          if (apenas_pendentes && u.user.last_sign_in_at) continue;
          const { error: rErr } = await supabaseAdmin.auth.admin.generateLink({
            type: "recovery",
            email: u.user.email,
            options: { redirectTo: redirect_to },
          });
          if (rErr) falhas.push({ nome: p.nome, motivo: rErr.message });
          else enviados.push({ email: u.user.email, nome: p.nome });
        }

        return new Response(JSON.stringify({ ok: true, enviados, falhas }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
