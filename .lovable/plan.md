# Plano — Acesso total só para Samuel, Toni vira "master restrito"

## Situação real hoje (verificado no banco)

- `super_admin = true`: **Samuel** e **Toni**. `Lavile` é `master` sem super_admin.
- **Toni não tem grupo**: `perfis.grupo_id = NULL` e `perfis.corretor_id = NULL`.
- Existe um cadastro de corretor "toni" no grupo **Notificações**, mas ele está ligado a **outro** usuário de login (`user_id` diferente do perfil dele). Ou seja, hoje o login do Toni não está vinculado a nenhum corretor nem grupo.
- Padrão das policies: `pode_dar_suporte() OR (empresa_id = get_minha_empresa_id() AND (role = 'master' OR grupo_id = meu grupo))`.

Isso significa que o Toni tem **dois** caminhos de acesso total: `super_admin` (via `pode_dar_suporte()`) e `role = 'master'`. Fechar só um não resolve.

## Como diferenciar você dele mantendo `role = 'master'`

Nova coluna em `perfis`: **`acesso_total boolean not null default false`**.

- Samuel: `acesso_total = true`, `super_admin = true`.
- Toni: `acesso_total = false`, **`super_admin = false`** (precisa cair, senão `pode_dar_suporte()` continua liberando tudo), `role` continua `'master'`.
- Lavile e demais: `acesso_total = false`.

Nova função `public.tem_acesso_total()` (`security definer`, stable) = `super_admin OR acesso_total`. As policies passam a usar **`tem_acesso_total()`** no lugar de `pode_dar_suporte()`, e trocam a checagem `role = 'master'` por `tem_acesso_total() OR (role = 'master' AND acesso_total)`.

Resultado prático: quem for `master` sem `acesso_total` passa a ser tratado como **gerente do próprio grupo**, sem mudar o rótulo do cargo na tela.

## Ponto crítico: Toni ficaria sem enxergar nada

Como ele não tem `grupo_id`, "escopo de grupo" = escopo vazio. Antes de aplicar, é preciso decidir o grupo dele. Sugestão: `perfis.grupo_id = Notificações` (`2cf1e84a-…`) e vincular o login dele ao corretor "toni" desse grupo (`corretor_id = 80306ef9-…`, corrigindo o `user_id` do registro). Sem isso ele loga e vê telas vazias.

## Tabelas e policies afetadas

| Tabela | Policies |
|---|---|
| leads | `leads_read_escopo`, `leads_write_master_gerente`, `leads_update_corretor` |
| corretores | `corretores_read_escopo`, `corretores_write_escopo` |
| propostas | policies de leitura/escrita + função `posso_acessar_proposta()` |
| fila_notificacoes | todas as policies de leitura/escrita/delete |
| notificacoes | policies de leitura (já são por `destinatario_id`; só remover o bypass de suporte) |
| campanhas_anuncios | `campanhas_read_escopo`, `campanhas_write_master` |
| lead_notas | policies de escopo |
| grupos, empreendimentos, unidades, horarios_atendimento, config_acesso, empresas, perfis | trocar `pode_dar_suporte()` / `role='master'` pelo novo critério |
| funções | `posso_operar_grupo()` passa a exigir `tem_acesso_total()` no lugar de `pode_dar_suporte()`; `pode_dar_suporte()` fica só para role `suporte` |

## O que NÃO quebra

- **Rodízio, distribuição, represamento, reatribuição, descarte**: as RPCs são `SECURITY DEFINER` e o webhook usa chave de serviço — ignoram RLS. Continua igual.
- **Notificações de WhatsApp** para Samuel e Toni no grupo Notificações: vêm do cadastro em `corretores` + fila processada pelo cron com chave de serviço. Não dependem de `role` nem de `super_admin`. Continuam chegando.
- **Login do Toni**: inalterado. `role` continua `'master'`.
- **Telas que checam `role === 'master'`** (menu admin, `RequireAdmin`, botões): continuam liberadas para ele na interface — o bloqueio passa a ser de **dados**, no banco.

## O que muda / riscos

1. **Toni deixa de ver a empresa inteira**: lista de corretores, leads de outros grupos, propostas, campanhas, métricas do dashboard e espelho passam a mostrar só o grupo dele.
2. **Ele continua vendo botões de admin** (Corretores, Horários, Importar) mas com dados limitados; ações fora do escopo dele vão falhar com erro de permissão. Se quiser, ajusto a interface depois para esconder o que ele não pode usar.
3. **`/empresas` e gestão multi-empresa**: só você. Ele perde.
4. **Convites/cadastro de corretores**: ele só poderá criar/editar corretores do grupo dele.
5. **Configuração de acesso e horários**: hoje é `role='master'`; ele perde a edição global, ficando limitado ao grupo.
6. **Se ele ficar sem grupo**, tudo aparece vazio (ver ponto crítico acima).
7. Reverter é simples: `acesso_total = true` no perfil dele devolve tudo.

## Ordem de execução (depois da sua aprovação)

1. Migração: coluna `acesso_total`, função `tem_acesso_total()`, backfill (Samuel `true`, demais `false`, Toni `super_admin = false`).
2. Definir grupo/corretor do Toni.
3. Reescrever as policies das tabelas listadas.
4. Teste de RLS real com o token do Toni e o seu, mostrando lado a lado o que cada um enxerga.
5. Publicar só depois da sua conferência.

## Decisões que preciso de você

- Confirmar o grupo do Toni (**Notificações** ou outro).
- Confirmar que o `Lavile` (`equipelavile@hotmail.com`, master sem super_admin) também deve virar restrito — pelo plano acima, sim.
