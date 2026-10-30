# Ponte do discador

Serviço pequeno que roda na VPS, ao lado do Asterisk. Ele **só faz conexões de dentro para fora**:
pergunta ao Alexandria se há ligação pedida, liga pela ARI do Asterisk (que fica fechada para a internet),
junta o cliente com o corretor, grava a conversa e avisa o Alexandria quando termina.

Precisa de **Node 22 ou mais novo**. Não tem dependências.

## Instalar (na VPS onde o `instalar.sh` do discador-teste já rodou)

```
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
mkdir -p /opt/discador-ponte
cp ponte.mjs /opt/discador-ponte/
cp .env.example /etc/discador-ponte.env && chmod 600 /etc/discador-ponte.env
nano /etc/discador-ponte.env          # preencha ALEXANDRIA_URL, DISCADOR_PONTE_TOKEN, ARI_SENHA, TRONCO
chown asterisk:asterisk /etc/discador-ponte.env
cp discador-ponte.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now discador-ponte
journalctl -u discador-ponte -f       # acompanhar ao vivo
```

## No Alexandria (variáveis de ambiente do servidor)

| Variável | Para quê |
|---|---|
| `DISCADOR_PONTE_TOKEN` | Senha longa (24+ letras) igual à da ponte |
| `DISCADOR_SIP_HOST` | Domínio da VPS (o mesmo do certificado), ex.: `voz.mizunoimob.com.br` |
| `DISCADOR_TURN_USER` / `DISCADOR_TURN_PASS` | Usuário e senha do TURN (estão no DADOS-DO-TESTE.txt) |

Depois aplique a migration `supabase/migrations/20261030120000_discador.sql`.

## Como o fluxo funciona (modo preview)

1. Corretor abre **Discador**, clica *Ligar o telefone* (libera microfone) e fica *Pronto*.
2. Clica *Ligar* num lead. O Alexandria confere as regras (horário, tentativas, "não ligar mais", estado) e grava o pedido.
3. A ponte pega o pedido (até 1,5 s) e liga para o cliente pelo tronco.
4. Quando o cliente atende, o Asterisk chama o telefone do navegador do corretor, que atende sozinho. Aí os dois são ligados e a conversa é gravada.
5. Ao desligar, o corretor marca o resultado e o Alexandria registra no histórico do lead.

## Limites conhecidos

- **Caixa postal conta como "atendeu"** (a operadora também cobra). O corretor marca *Caixa postal* no resultado. Detecção automática fica para depois.
- **Gravações ficam na VPS** (`/var/spool/asterisk/recording/rec-<id>.wav`). Falta um passo para enviá-las ao Alexandria e tocar na ficha do lead.
- O cliente ouve música de espera por 1 a 3 segundos enquanto o telefone do corretor atende. No modo progressivo isso precisa de ajuste fino.
- Só o modo **preview** está pronto. Progressivo e preditivo vêm depois.
