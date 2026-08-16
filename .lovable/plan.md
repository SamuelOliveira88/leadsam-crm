# Editar lead + Esqueci minha senha

## 1) Editar lead

**Onde encaixa**
- `src/lib/leads.functions.ts`: nova server function `atualizarLead` (POST, com `requireSupabaseAuth`), validando `id`, `nome`, `telefone`, `email`, `origem`, `observacoes`. O update roda pelo `context.supabase` (cliente do usuário logado), então o RLS/escopo por empresa, grupo e corretor que já auditamos hoje continua valendo sem código extra de permissão.
- `src/routes/_authenticated/leads.tsx`: dentro do `LeadDrawer` (linha ~143), botão "Editar" que abre um modal/estado de edição com os campos acima; ao salvar, chama `atualizarLead` e invalida a query da lista.
- Nada de novo em banco: a policy de UPDATE em `leads` já existe. Se o usuário não puder editar aquele lead, o update retorna 0 linhas — a UI mostrará "sem permissão" em vez de fingir sucesso.

**Campos editáveis propostos**: nome, telefone, e-mail, origem, observações.
**Fora do modal de edição** (continuam nos fluxos atuais): corretor (transferir), status/etapa (Kanban), grupo, visibilidade.

## 2) Esqueci minha senha

**Onde encaixa**
- `src/routes/auth.tsx`: link "Esqueci minha senha" abaixo do formulário; abre um campo/modal de e-mail e chama `supabase.auth.resetPasswordForEmail(email, { redirectTo: \`${window.location.origin}/set-password\` })`. Mensagem sempre genérica ("se o e-mail existir, enviamos o link") para não revelar quais e-mails têm conta.
- `src/routes/set-password.tsx`: **já** trata `type=recovery` (verifyOtp) e o formato antigo por hash. Ou seja, a tela de definir nova senha já existe e não precisa ser criada — só ajustar textos para o caso de recuperação e redirecionar para `/dashboard` após salvar.

## Decisões que preciso confirmar

1. **Campos do editar lead**: confirmo a lista acima (nome, telefone, e-mail, origem, observações)? Quer permitir editar também o grupo?
2. **Quem pode editar**: mantenho exatamente o que o RLS permite hoje (corretor edita o próprio lead; gerente/master dentro do escopo), ou quer restringir edição a gerente/master apenas?
3. **Reset de senha aberto a todos**: qualquer e-mail cadastrado poderá pedir reset. Como o app é comercial e sem cadastro público, isso é seguro — mas confirme se quer manter para todos os papéis (incl. corretores).
4. **Auditoria**: quer que a edição registre um log (quem alterou o quê e quando)? Isso adiciona uma tabela nova; sem isso, a edição é silenciosa.

## Riscos

- Trocar o telefone de um lead pode afetar a deduplicação do webhook (leads chegam por telefone). Edição manual não recria o lead, mas um lead futuro com o telefone antigo pode entrar como novo.
- Nenhuma mudança de RLS ou de notificação: editar dado do lead não dispara WhatsApp nem sino.
