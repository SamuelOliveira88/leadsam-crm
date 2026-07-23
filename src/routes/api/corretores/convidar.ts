import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const ConviteSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  telefone: z.string().optional().nullable(),
  grupo_id: z.string().uuid().nullable().optional(),
  canal_notificacao: z.enum(["whatsapp", "email", "ambos", "nenhum"]).default("whatsapp"),
  recebe_via_web: z.boolean().default(true),
  recebe_via_whatsapp: z.boolean().default(true),
  redirect_to: z.string().url(),
  role: z.enum(["corretor", "gerente"]).default("corretor"),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (supabaseKey.startsWith("sb_") && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function getFriendlyInviteError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("already") || normalized.includes("registered") || normalized.includes("exists")) {
    return "Este e-mail já tem acesso cadastrado. Use outro e-mail ou peça para a pessoa recuperar a senha.";
  }
  if (normalized.includes("rate") || normalized.includes("email")) {
    return "O envio de e-mails está temporariamente limitado. Aguarde alguns minutos e tente novamente.";
  }
  return message || "Não foi possível enviar o convite.";
}

export const Route = createFileRoute("/api/corretores/convidar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return json({ message: "Sessão expirada. Entre novamente e tente enviar o convite." }, 401);
        }

        const token = authHeader.replace("Bearer ", "").trim();
        if (!token || token.split(".").length !== 3) {
          return json({ message: "Sessão inválida. Entre novamente e tente enviar o convite." }, 401);
        }

        const parsed = ConviteSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return json({ message: "Preencha nome, e-mail e grupo corretamente antes de enviar o convite." }, 400);
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!supabaseUrl || !publishableKey) {
          return json({ message: "Backend indisponível no momento. Tente novamente em instantes." }, 503);
        }

        const supabaseUser = createClient<Database>(supabaseUrl, publishableKey, {
          global: {
            fetch: createSupabaseFetch(publishableKey),
            headers: { Authorization: `Bearer ${token}` },
          },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        const { data: userData, error: userError } = await supabaseUser.auth.getUser(token);
        if (userError || !userData.user) {
          return json({ message: "Sessão expirada. Entre novamente e tente enviar o convite." }, 401);
        }

        const { data: perfil, error: perfilError } = await supabaseUser
          .from("perfis")
          .select("role, empresa_id, super_admin")
          .eq("id", userData.user.id)
          .maybeSingle();

        if (perfilError) return json({ message: perfilError.message }, 500);
        if (perfil?.role !== "master" && !perfil?.super_admin) {
          return json({ message: "Apenas o administrador pode convidar corretores." }, 403);
        }

        const data = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let empresaId = perfil.empresa_id ?? null;
        if (data.grupo_id) {
          const { data: grupo, error: grupoError } = await supabaseAdmin
            .from("grupos")
            .select("empresa_id")
            .eq("id", data.grupo_id)
            .maybeSingle();
          if (grupoError) return json({ message: grupoError.message }, 500);
          if (!grupo) return json({ message: "Grupo selecionado não foi encontrado." }, 400);
          if (empresaId && grupo.empresa_id !== empresaId && !perfil.super_admin) {
            return json({ message: "Você só pode convidar corretores para grupos da sua empresa." }, 403);
          }
          empresaId = empresaId ?? grupo.empresa_id;
        }

        if (!empresaId) {
          return json({ message: "Sua empresa não foi identificada. Atualize a página e tente novamente." }, 400);
        }

        const { data: corretor, error: corretorError } = await supabaseAdmin
          .from("corretores")
          .insert({
            nome: data.nome,
            telefone: data.telefone ?? null,
            grupo_id: data.grupo_id ?? null,
            empresa_id: empresaId,
            ativo: true,
            canal_notificacao: data.canal_notificacao,
            recebe_via_web: data.recebe_via_web,
            recebe_via_whatsapp: data.recebe_via_whatsapp,
          })
          .select()
          .single();

        if (corretorError) return json({ message: corretorError.message }, 500);

        const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
          redirectTo: data.redirect_to,
          data: {
            invited_by_admin: true,
            nome: data.nome,
            role: "corretor",
            grupo_id: data.grupo_id ?? null,
            corretor_id: corretor.id,
            empresa_id: empresaId,
          },
        });

        if (inviteError) {
          await supabaseAdmin.from("corretores").delete().eq("id", corretor.id);
          return json({ message: getFriendlyInviteError(inviteError.message) }, 400);
        }

        return json({ ok: true, corretor });
      },
    },
  },
});