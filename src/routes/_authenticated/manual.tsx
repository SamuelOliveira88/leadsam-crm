import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PERGUNTAS_MIA } from "@/lib/mia-empresa";

export const Route = createFileRoute("/_authenticated/manual")({
  head: () => ({ meta: [{ title: "Manual — Alexandria Leds" }] }),
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
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><BookOpen className="size-6" /> Manual do Alexandria</h1>
        <p className="text-sm text-muted-foreground">O básico para usar o Alexandria no dia a dia, do primeiro acesso à Mi.IA.</p>
      </div>

      <Card className="p-4 text-sm">
        <div className="mb-1 font-semibold">Neste manual</div>
        <ol className="grid list-decimal gap-0.5 pl-5 text-muted-foreground sm:grid-cols-2">
          <li><a className="underline" href="#comecar">Primeiros passos</a></li>
          <li><a className="underline" href="#leads">Como o lead chega ao corretor</a></li>
          <li><a className="underline" href="#whatsapp">WhatsApp da imobiliária</a></li>
          <li><a className="underline" href="#planos">Planos e pagamento</a></li>
          <li><a className="underline" href="#mia">Minha Mi.IA (as 8 perguntas)</a></li>
          <li><a className="underline" href="#mia-atende">Como a Mi.IA atende</a></li>
          <li><a className="underline" href="#duvidas">Dúvidas comuns</a></li>
        </ol>
      </Card>

      <Secao id="comecar" titulo="1. Primeiros passos">
        <ol>
          <li>O <b>master</b> cadastra os <b>corretores</b> e o horário de atendimento da equipe.</li>
          <li>Conecte o WhatsApp da imobiliária na tela <b>WhatsApp</b>.</li>
          <li>Leads novos entram sozinhos (webhook, portais por e-mail, planilha ou mensagem no WhatsApp) e vão para os corretores em rodízio.</li>
          <li>Cada corretor responde pelo Alexandria, em <b>Conversas</b>, e acompanha o lead no funil.</li>
        </ol>
        <p>Os <b>7 dias de teste</b> liberam tudo, inclusive a Mi.IA.</p>
      </Secao>

      <Secao id="leads" titulo="2. Como o lead chega ao corretor">
        <ul>
          <li>Rodízio entre os corretores que estão <b>online</b> e dentro do horário.</li>
          <li>Se ninguém está online, o lead fica <b>represado</b> e master e gerente recebem um aviso.</li>
          <li>Cliente que volta a escrever continua com o mesmo corretor.</li>
          <li>O corretor vê só os leads dele. Master e gerente veem os da equipe.</li>
        </ul>
      </Secao>

      <Secao id="whatsapp" titulo="3. WhatsApp da imobiliária">
        <p>Em <b>WhatsApp</b> (menu Master), clique em <b>Conectar WhatsApp</b> e leia o QR code: no celular da imobiliária, abra <b>Aparelhos conectados</b> e depois <b>Conectar um aparelho</b>.</p>
        <p>Depois de conectado, as mensagens dos clientes chegam à equipe e os corretores respondem por texto ou áudio. A Mi.IA liga e desliga nessa mesma tela.</p>
      </Secao>

      <Secao id="planos" titulo="4. Planos e pagamento">
        <ul>
          <li><b>Alexandria Leads — R$ 299 por mês</b> por imobiliária, até 10 corretores, com rodízio, conversas, funil, agenda, espelho, propostas e importação.</li>
          <li><b>Alexandria + Mi.IA — R$ 499 por mês</b>: tudo do plano acima e a Mi.IA atendendo o lead antes do corretor.</li>
        </ul>
        <p>Para assinar, o master abre <b>Meu plano</b> e clica em <b>Assinar</b>. O pagamento é por Pix, boleto ou cartão, pelo Asaas, sem fidelidade. O plano é liberado sozinho quando o pagamento é confirmado (boleto pode levar até 1 dia útil) e cada mensalidade paga vale por mais 31 dias.</p>
        <p>Corretores além de 10: fale com a equipe do Alexandria.</p>
      </Secao>

      <Secao id="mia" titulo="5. Minha Mi.IA (as 8 perguntas)">
        <p>Em <b>Minha Mi.IA</b> (menu Master) você ensina a Mi.IA a falar pela sua imobiliária. Quanto mais específico, melhor. Escreva só o que é verdade: ela repete o que você escrever.</p>
        <ol>
          {PERGUNTAS_MIA.map((p) => (
            <li key={p.id}><b>{p.titulo.replace(/^\d+\. /, "")}</b>: {p.ajuda} <i>Ex.: {p.exemplo}</i></li>
          ))}
        </ol>
        <p><b>Horário:</b> escolha os dias e as horas em que a Mi.IA atende (horário de Brasília). Fora dele, o lead vai direto para os corretores.</p>
        <p><b>Teste:</b> na mesma tela, converse com a Mi.IA como se fosse um cliente. Ajuste as respostas até ficar como você quer e só então ligue.</p>
      </Secao>

      <Secao id="mia-atende" titulo="6. Como a Mi.IA atende">
        <ol>
          <li>Um cliente novo escreve para o WhatsApp da imobiliária.</li>
          <li>Se a Mi.IA está ligada e dentro do horário, ela responde primeiro, com mensagens curtas, e faz as perguntas de qualificação, uma por vez.</li>
          <li>Quando a conversa bate a regra de passagem (por exemplo, pedido de visita ou de valores), ou o cliente pede uma pessoa, ela avisa que um corretor vai continuar e o lead segue o rodízio.</li>
          <li>O corretor recebe a conversa inteira, com tudo o que a Mi.IA já conversou.</li>
        </ol>
        <p>Para ninguém ficar sem resposta, o lead também vai para o corretor se a Mi.IA falhar, se passar de 6 respostas dela ou se o cliente ficar 20 minutos sem responder.</p>
        <p>A Mi.IA <b>nunca inventa</b> preço, desconto, prazo ou aprovação de crédito: se não souber, ela diz que o corretor confirma.</p>
      </Secao>

      <Secao id="duvidas" titulo="7. Dúvidas comuns">
        <p><b>Não aparece Minha Mi.IA para ligar.</b> Ela faz parte do plano Alexandria + Mi.IA ou dos 7 dias de teste. Veja em <Link to="/meu-plano" className="underline">Meu plano</Link>.</p>
        <p><b>Paguei e o plano não mudou.</b> Pix e cartão aparecem em poucos minutos; boleto leva até 1 dia útil. Se passar disso, fale com a equipe.</p>
        <p><b>A Mi.IA respondeu algo errado.</b> Corrija a resposta correspondente em Minha Mi.IA e teste de novo. Use a pergunta 8 (Limites) para proibir o que ela não deve prometer.</p>
        <p><b>Quero que a Mi.IA atenda só à noite.</b> Em Minha Mi.IA, desmarque "o dia todo" e escolha as horas (pode virar a noite, por exemplo das 18:00 às 08:00).</p>
        <p><b>Discador / ligações pelo sistema.</b> Ainda não existe.</p>
      </Secao>
    </div>
  );
}
