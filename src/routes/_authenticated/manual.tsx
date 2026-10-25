import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PERGUNTAS_MIA } from "@/lib/mia-empresa";

import { tr, rich } from "@/i18n";
export const Route = createFileRoute("/_authenticated/manual")({
  head: () => ({ meta: [{ title: tr("Manual — Alexandria Leds") }] }),
  component: Manual,
});

function Secao({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="space-y-2 p-5 scroll-mt-4">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <div className="space-y-2 text-sm text-muted-foreground [&_b]:text-foreground [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc">{children}</div>
    </Card>
  );
}

function Manual() {
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><BookOpen className="size-6" /> {tr("Manual do Alexandria")}</h1>
        <p className="text-sm text-muted-foreground">{tr("O básico para usar o Alexandria no dia a dia, do primeiro acesso à Mi.IA.")}</p>
      </div>

      <Card className="p-4 text-sm">
        <div className="mb-1 font-semibold">{tr("Neste manual")}</div>
        <ol className="grid list-decimal gap-0.5 pl-5 text-muted-foreground sm:grid-cols-2">
          <li><a className="underline" href="#comecar">{tr("Primeiros passos")}</a></li>
          <li><a className="underline" href="#leads">{tr("Como o lead chega ao corretor")}</a></li>
          <li><a className="underline" href="#whatsapp">{tr("WhatsApp da imobiliária")}</a></li>
          <li><a className="underline" href="#planos">{tr("Planos e pagamento")}</a></li>
          <li><a className="underline" href="#mia">{tr("Minha Mi.IA (as 8 perguntas)")}</a></li>
          <li><a className="underline" href="#mia-atende">{tr("Como a Mi.IA atende")}</a></li>
          <li><a className="underline" href="#duvidas">{tr("Dúvidas comuns")}</a></li>
        </ol>
      </Card>

      <Secao id="comecar" titulo={tr("1. Primeiros passos")}>
        <ol>
          <li>{rich("O <b>master</b> cadastra os <b>corretores</b> e o horário de atendimento da equipe.")}</li>
          <li>{rich("Conecte o WhatsApp da imobiliária na tela <b>WhatsApp</b>.")}</li>
          <li>{tr("Leads novos entram sozinhos (webhook, portais por e-mail, planilha ou mensagem no WhatsApp) e vão para os corretores em rodízio.")}</li>
          <li>{rich("Cada corretor responde pelo Alexandria, em <b>Conversas</b>, e acompanha o lead no funil.")}</li>
        </ol>
        <p>{rich("Os <b>7 dias de teste</b> liberam tudo, inclusive a Mi.IA.")}</p>
      </Secao>

      <Secao id="leads" titulo={tr("2. Como o lead chega ao corretor")}>
        <ul>
          <li>{rich("Rodízio entre os corretores que estão <b>online</b> e dentro do horário.")}</li>
          <li>{rich("Se ninguém está online, o lead fica <b>represado</b> e master e gerente recebem um aviso.")}</li>
          <li>{tr("Cliente que volta a escrever continua com o mesmo corretor.")}</li>
          <li>{tr("O corretor vê só os leads dele. Master e gerente veem os da equipe.")}</li>
        </ul>
      </Secao>

      <Secao id="whatsapp" titulo={tr("3. WhatsApp da imobiliária")}>
        <p>{rich("Em <b>WhatsApp</b> (menu Master), clique em <b>Conectar WhatsApp</b> e leia o QR code: no celular da imobiliária, abra <b>Aparelhos conectados</b> e depois <b>Conectar um aparelho</b>.")}</p>
        <p>{tr("Depois de conectado, as mensagens dos clientes chegam à equipe e os corretores respondem por texto ou áudio. A Mi.IA liga e desliga nessa mesma tela.")}</p>
      </Secao>

      <Secao id="planos" titulo={tr("4. Planos e pagamento")}>
        <ul>
          <li>{rich("<b>Alexandria Leads — R$ 299 por mês</b> por imobiliária, até 10 corretores, com rodízio, conversas, funil, agenda, espelho, propostas e importação.")}</li>
          <li>{rich("<b>Alexandria + Mi.IA — R$ 499 por mês</b>, também até 10 corretores: tudo do plano acima e a Mi.IA atendendo o lead antes do corretor.")}</li>
        </ul>
        <p>{rich("Para assinar, o master abre <b>Meu plano</b> e clica em <b>Assinar</b>. O pagamento é por Pix, boleto ou cartão, pelo Asaas, sem fidelidade. O plano é liberado sozinho quando o pagamento é confirmado (boleto pode levar até 1 dia útil) e cada mensalidade paga vale por mais 31 dias.")}</p>
        <p>{tr("O limite é de 10 corretores ativos. Corretor inativo não conta. Para ter mais ativos, o master contrata corretores extras em Meu plano: R$ 30 por mês cada no Alexandria Leads e R$ 50 por mês cada no Alexandria + Mi.IA.")}</p>
      </Secao>

      <Secao id="mia" titulo={tr("5. Minha Mi.IA (as 8 perguntas)")}>
        <p>{rich("Em <b>Minha Mi.IA</b> (menu Master) você ensina a Mi.IA a falar pela sua imobiliária. Quanto mais específico, melhor. Escreva só o que é verdade: ela repete o que você escrever.")}</p>
        <ol>
          {PERGUNTAS_MIA.map((p) => (
            <li key={p.id}><b>{tr(p.titulo).replace(/^\d+\. /, "")}</b>: {tr(p.ajuda)} <i>{tr("Ex.: {exemplo}", { exemplo: tr(p.exemplo) })}</i></li>
          ))}
        </ol>
        <p>{rich("<b>Horário:</b> escolha os dias e as horas em que a Mi.IA atende (horário de Brasília). Fora dele, o lead vai direto para os corretores.")}</p>
        <p>{rich("<b>Teste:</b> na mesma tela, converse com a Mi.IA como se fosse um cliente. Ajuste as respostas até ficar como você quer e só então ligue.")}</p>
      </Secao>

      <Secao id="mia-atende" titulo={tr("6. Como a Mi.IA atende")}>
        <ol>
          <li>{tr("Um cliente novo escreve para o WhatsApp da imobiliária.")}</li>
          <li>{tr("Se a Mi.IA está ligada e dentro do horário, ela responde primeiro, com mensagens curtas, e faz as perguntas de qualificação, uma por vez.")}</li>
          <li>{tr("Quando a conversa bate a regra de passagem (por exemplo, pedido de visita ou de valores), ou o cliente pede uma pessoa, ela avisa que um corretor vai continuar e o lead segue o rodízio.")}</li>
          <li>{tr("O corretor recebe a conversa inteira, com tudo o que a Mi.IA já conversou.")}</li>
        </ol>
        <p>{tr("Para ninguém ficar sem resposta, o lead também vai para o corretor se a Mi.IA falhar, se passar de 6 respostas dela ou se o cliente ficar 20 minutos sem responder.")}</p>
        <p>{rich("A Mi.IA <b>nunca inventa</b> preço, desconto, prazo ou aprovação de crédito: se não souber, ela diz que o corretor confirma.")}</p>
      </Secao>

      <Secao id="duvidas" titulo={tr("7. Dúvidas comuns")}>
        <p>{rich("<b>Não aparece Minha Mi.IA para ligar.</b> Ela faz parte do plano Alexandria + Mi.IA ou dos 7 dias de teste. Veja em <l>Meu plano</l>.", { l: (c) => <Link to="/meu-plano" className="underline">{c}</Link> })}</p>
        <p>{rich("<b>Paguei e o plano não mudou.</b> Pix e cartão aparecem em poucos minutos; boleto leva até 1 dia útil. Se passar disso, fale com a equipe.")}</p>
        <p>{rich("<b>A Mi.IA respondeu algo errado.</b> Corrija a resposta correspondente em Minha Mi.IA e teste de novo. Use a pergunta 8 (Limites) para proibir o que ela não deve prometer.")}</p>
        <p>{rich("<b>Quero que a Mi.IA atenda só à noite.</b> Em Minha Mi.IA, desmarque \"o dia todo\" e escolha as horas (pode virar a noite, por exemplo das 18:00 às 08:00).")}</p>
        <p>{rich("<b>Discador / ligações pelo sistema.</b> Ainda não existe.")}</p>
      </Secao>
    </div>
  );
}
