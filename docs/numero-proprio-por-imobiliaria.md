# Número próprio por imobiliária (passo a passo para um cliente novo)

O banco já separa tudo por empresa. Cada imobiliária precisa só de **uma instância própria** na Evolution.

## O que já está pronto
- `instancias_whatsapp`: liga a instância da Evolution a uma empresa + grupo.
- `receber_mensagem_whatsapp(...)`: usa o nome da instância que chega para achar a empresa. Mensagem de uma instância nunca cai em outra empresa.
- Envio: a resposta do corretor sai pela instância da própria empresa/grupo.
- Rodízio, blindagem do telefone, limite de mensagens e extensão (login do Alexandria): iguais para todas as empresas.

## Passos para ligar um cliente
1. **Evolution**: criar uma instância nova (nome sem começar com `sara`, ex.: `cliente-xyz`), com o webhook apontando para o mesmo webhook do n8n do número mãe (evento `messages.upsert`).
2. **Cliente**: escanear o QR Code da instância no WhatsApp dele (Aparelhos conectados).
3. **Alexandria** (super admin, SQL editor): `select public.cadastrar_instancia_whatsapp('<empresa_id>', '<grupo_id>', 'cliente-xyz');`
   Conferir: `select * from public.listar_instancias_whatsapp();`
4. **Corretores do cliente**: convidar pelo Alexandria (tela Corretores) e instalar a extensão Mi Central (aba "Número mãe", mesmo login).
5. **Teste**: mandar uma mensagem de outro celular para o número do cliente; ela deve aparecer só na tela Conversas dele.

## Ponto a conferir no n8n (não está neste repositório)
O fluxo "Alexandria - Numero mae (entrada de mensagens)" precisa repassar o campo `instance` que vem no webhook da Evolution (e não um nome fixo). Se estiver fixo em `numero-mae`, trocar por `{{ $json.body.instance }}`.
