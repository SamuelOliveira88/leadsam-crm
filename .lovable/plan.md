
# Plano — Migração para modelo Grupos/Corretores/Perfis

## 1. Migração de banco (drop + create em uma migração)

Remover schema antigo e criar o novo em um único migration:

- **DROP**: tabelas `leads`, `consultores`, `compromissos`, `rodizio_estado`, `user_roles`; enums `app_role`, `compromisso_tipo`, `lead_estagio`; funções `has_role`, `is_admin_email`, `current_consultor_id`, `escolher_proximo_consultor`, `enforce_consultores_limit`, `handle_new_user`, `set_updated_at`.
- **CREATE** (conforme script fornecido):
  - Extensões: `pgcrypto`, `pg_cron`.
  - Tabelas: `grupos`, `corretores`, `perfis`, `leads` (novo formato: nome/telefone/email/grupo_id/corretor_id/status distribuido|represado), `horarios_atendimento`, `fila_notificacoes`, `campanhas_anuncios`.
  - GRANTs para `authenticated` + `service_role` em todas as tabelas públicas.
  - Função `get_my_profile()` (security definer, evita recursão RLS).
  - Trigger `handle_new_user` **modificado**: se `email = samuelrodrigodeoliveira@gmail.com` → role `master`; senão `gerente`.
  - Função `dentro_do_horario(grupo_id)`.
  - RPCs `distribuir_lead_round_robin` e `distribuir_lead_direcionado`.
  - Função `liberar_leads_represados` + cron a cada 15 min.
  - Trigger `notificar_corretor_novo_lead` → insere em `fila_notificacoes`.
  - View `dashboard_corretores` (security_invoker).
  - RLS + policies por escopo (master vê tudo; gerente vê apenas próprio `grupo_id`).
- **Backfill**: inserir perfil master para o usuário atual (`samuelrodrigodeoliveira@gmail.com`) via `INSERT ... SELECT id ... FROM auth.users WHERE email = ...`.

## 2. Server functions (`src/lib/*.functions.ts`)

Substituir arquivos existentes (`consultores.functions.ts`, `leads.functions.ts`, `compromissos.functions.ts`, `metricas.functions.ts`, `ai.functions.ts` continua) por:

- `perfil.functions.ts`: `getMeuPerfil()` (role + grupo_id + nome).
- `grupos.functions.ts`: listar/criar/editar/excluir (master only via RLS).
- `corretores.functions.ts`: listar/criar/editar/excluir/toggle ativo. Campo `canal_notificacao`. Gerente com grupo travado, master escolhe grupo.
- `leads.functions.ts`: listar (filtro por status/corretor/grupo), criar manual, importar em lote (recebe array + modo `todos`|`especificos` + lista de corretor_ids) — chama RPC apropriada por lead.
- `horarios.functions.ts`: listar/upsert (7 dias × grupo).
- `dashboard.functions.ts`: ler view `dashboard_corretores` + contagens por status.
- Todas com `requireSupabaseAuth`; RLS faz o escopo por grupo.

## 3. Rotas / UI (`src/routes/_authenticated/*`)

Remover: `funil.tsx`, `agenda.tsx`, `assistente.tsx`, `configuracoes.tsx`, `consultores.tsx`. Manter/refazer:

- `dashboard.tsx`: cards de métricas (total distribuídos, represados, corretores ativos) + tabela consumindo view `dashboard_corretores`.
- `corretores.tsx` (menu "Corretores"): CRUD com campos nome, telefone, grupo (dropdown master / travado gerente), canal_notificacao, toggle ativo.
- `grupos.tsx` (menu "Grupos", master only): CRUD simples.
- `leads.tsx`: grid com badges (verde `distribuido`, laranja `represado`), filtros por grupo/status/corretor, botão "Novo lead" e "Importar planilha".
- `importar.tsx`: upload CSV/XLSX (usar `papaparse` para CSV — leve; XLSX via `xlsx` se necessário), mapeamento de colunas (Nome/Telefone/Email), seletor de grupo, radio "Todos do grupo" vs "Corretores específicos" + multi-select de ativos do grupo. Loop chamando a RPC via server fn.
- `horarios.tsx` (menu "Horários"): 7 linhas (Dom→Sáb), toggle ativo + inputs hora_inicio/hora_fim.
- `configuracoes.tsx` (opcional, simples): dados do perfil + logout.
- `AppShell.tsx`: menu adaptado por role (master vê Grupos; gerente não).
- Rota `/` continua redirecionando para `/dashboard` autenticado ou `/auth`.

## 4. Auth

- `auth.tsx`: manter login e-mail/senha + Google. Signup bloqueado continua desabilitado (só master cria contas via convite manual — pode ser tratado depois).
- Gerente recém-criado sem `grupo_id`: telas devem exibir aviso "Aguardando vínculo a um grupo pelo administrador".

## 5. Limpeza

- Remover `criarConsultorComConta` e `admin.createUser` flow antigo.
- Atualizar `types.ts` (regenerado automaticamente após a migração).
- Remover imports quebrados após deletar rotas.

## 6. Ordem de execução

1. Rodar migração SQL (drop + create + seed do master).
2. Aguardar regeneração de `types.ts`.
3. Escrever server functions novas + deletar antigas.
4. Reescrever rotas + AppShell.
5. `bun add papaparse xlsx` para importação.
6. Verificar build; publicar.

## Observações técnicas

- A view `dashboard_corretores` já tem `security_invoker=true`, respeita RLS do usuário.
- RPCs `distribuir_lead_*` são `security definer` — server functions só as chamam; RLS na inserção é feito pela RPC.
- `fila_notificacoes` fica só como registro por enquanto (envio real de WhatsApp fica para etapa futura — mencionar ao usuário).
- Assistente IA e Agenda do app antigo serão removidos; se quiser preservar, avisar antes.

