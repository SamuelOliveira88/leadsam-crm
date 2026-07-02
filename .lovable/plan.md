
# ImobLead — CRM com IA para corretores

Vou construir o app completo em TanStack Start + Lovable Cloud (Supabase gerenciado) + Lovable AI Gateway. Interface em português, visual limpo e profissional (tema claro com acento em azul-petróleo e detalhes em âmbar — nada de roxo genérico).

## Stack e decisões

- **Frontend**: TanStack Start, Tailwind v4, shadcn/ui, react-query, dnd-kit para o Kanban.
- **Backend**: Lovable Cloud (Supabase) — auth email/senha + Google, Postgres com RLS, migrações.
- **IA**: Lovable AI Gateway (`google/gemini-3-flash-preview`) via `createServerFn` (sugestões, mensagens WhatsApp) e via server route `/api/chat` (chat com streaming).
- **PWA**: manifest + ícones (sem service worker — só "adicionar à tela inicial").

## Design system

- Tema claro, tipografia Inter, tokens semânticos em `src/styles.css` (primary azul-petróleo `oklch(0.45 0.09 220)`, accent âmbar, sucesso verde, danger vermelho).
- Layout com sidebar fixa (desktop) e bottom nav (mobile), variantes de Button/Card definidas no design system — nada de classes cor hardcoded em componentes.

## Banco de dados (migração única)

Tabelas em `public`:
- `consultores` (id, nome, numero_whatsapp, ativo bool, ordem_rodizio int, created_at)
- `leads` (id, nome, telefone, origem, estagio enum[novo,em_contato,proposta,fechado,perdido], interesse, valor_estimado numeric, consultor_id fk, created_at, updated_at)
- `compromissos` (id, lead_id fk, tipo enum[visita,ligacao,reuniao], titulo, data_hora timestamptz, notas)
- `rodizio_estado` (id singleton, ultimo_indice int)
- `user_roles` + enum `app_role` (`admin`, `user`) + função `has_role()` SECURITY DEFINER
- Função `is_admin_email()` SECURITY DEFINER conferindo `auth.jwt() ->> 'email' = 'samuelrodrigodeoliveira@gmail.com'`
- Função `escolher_proximo_consultor()` PL/pgSQL, atômica com `FOR UPDATE` sobre `rodizio_estado`, ciclando entre consultores ativos ordenados por `ordem_rodizio`
- Trigger em `consultores` que bloqueia insert quando já há 10 registros
- GRANTs explícitos + RLS por tabela; políticas restringindo consultores/leads ao admin (leitura/escrita), permitindo consultores lerem seus próprios leads

## Rotas

Públicas:
- `/auth` — login e-mail/senha + Google (broker Lovable)
- `/api/public/webhook/facebook` — aceita payload nativo do Facebook Lead Ads ou `{name,phone,interest}`; cria lead vinculado ao consultor indicado por `?broker=`
- `/api/public/n8n-lead` — valida `{numero, resposta}`, aplica rodízio, cria lead origem "WhatsApp Bot", devolve `{consultor_nome, consultor_numero}`
- `/api/chat` — streaming IA (chat do assistente)

Protegidas (`_authenticated/`):
- `/` — Dashboard (métricas + sugestão IA + leads recentes)
- `/leads` — lista com filtro por estágio, cards com editar/excluir/gerar msg WhatsApp
- `/funil` — Kanban drag-and-drop com atualização otimista
- `/agenda` — agrupada Hoje/Amanhã/Esta semana, 3 tipos
- `/assistente` — chat streaming markdown + prompts sugeridos
- `/consultores` — só admin; CRUD, toggle ativo, logout; não-admin vê "Acesso negado"
- `/configuracoes` — URL do webhook Facebook por consultor, tutorial Zapier/Make, doc do endpoint n8n

## Server functions

`src/lib/`:
- `leads.functions.ts` — CRUD, mover estágio, listar por filtro
- `consultores.functions.ts` — CRUD (guarda admin), toggle ativo, reordenar
- `ai.functions.ts` — `sugestaoDashboard()`, `gerarMensagemWhatsApp(leadId)` via Gateway
- `compromissos.functions.ts` — CRUD agenda
- `metricas.functions.ts` — totais para dashboard
- Helper `ai-gateway.server.ts` conforme knowledge

## PWA

- `public/manifest.webmanifest` com nome "ImobLead", ícones 192/512, `display: standalone`, tema.
- Ícones gerados via imagegen.
- Tags no `__root.tsx` head. Sem service worker.

## Segurança

- RLS em todas as tabelas, GRANTs explícitos, endpoints públicos validam payload com Zod, `supabaseAdmin` carregado dentro do handler apenas nos webhooks.
- Chave da IA só no servidor.

## Entregáveis por etapa

1. Habilitar Lovable Cloud, criar migração completa, GRANTs e RLS.
2. Design system + shell (sidebar/bottom nav) + auth.
3. Consultores + rodízio + endpoints públicos (Facebook + n8n).
4. Leads + Funil Kanban + Agenda.
5. Dashboard + Assistente IA (chat streaming) + sugestão IA + geração de mensagem WhatsApp.
6. Configurações + PWA + ícones.

Confirma que posso seguir com esse escopo e stack?
