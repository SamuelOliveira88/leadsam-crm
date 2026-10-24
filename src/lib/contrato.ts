export type DadosContrato = {
  // contratada (Alexandria) — preenche uma vez, fica salvo neste navegador
  a_nome: string; a_doc: string; a_endereco: string; a_email: string; a_rep: string; a_suporte: string; a_foro: string;
  // contratante (imobiliária)
  i_nome: string; i_cnpj: string; i_creci: string; i_endereco: string; i_email: string; i_whats: string; i_rep: string; i_cpf: string;
  plano: "alexandria" | "alexandria_ia";
  cidade: string;
};

export const DADOS_VAZIOS: DadosContrato = {
  a_nome: "", a_doc: "", a_endereco: "", a_email: "", a_rep: "", a_suporte: "", a_foro: "",
  i_nome: "", i_cnpj: "", i_creci: "", i_endereco: "", i_email: "", i_whats: "", i_rep: "", i_cpf: "",
  plano: "alexandria", cidade: "",
};

export const PLANOS_CONTRATO = {
  alexandria: { nome: "Alexandria Leads", valor: "R$ 299,00" },
  alexandria_ia: { nome: "Alexandria + Mi.IA", valor: "R$ 499,00" },
} as const;

const f = (v: string) => (v.trim() ? v.trim() : "__________________");

/** Contrato em blocos: título, parágrafos e assinaturas. */
export function montarContrato(d: DadosContrato, hoje = new Date()): { titulo: string; blocos: { t: "h" | "p" | "sig"; x: string }[] } {
  const p = PLANOS_CONTRATO[d.plano];
  const ia = d.plano === "alexandria_ia";
  const data = hoje.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  const B: { t: "h" | "p" | "sig"; x: string }[] = [];
  const h = (x: string) => B.push({ t: "h", x });
  const t = (x: string) => B.push({ t: "p", x });

  h("DAS PARTES");
  t(`CONTRATADA: ${f(d.a_nome)}, inscrita no CPF/CNPJ nº ${f(d.a_doc)}, com endereço em ${f(d.a_endereco)}, e-mail ${f(d.a_email)}, representada por ${f(d.a_rep)}, doravante chamada ALEXANDRIA.`);
  t(`CONTRATANTE: ${f(d.i_nome)}, inscrita no CNPJ nº ${f(d.i_cnpj)}, CRECI nº ${f(d.i_creci)}, com sede em ${f(d.i_endereco)}, e-mail ${f(d.i_email)}, WhatsApp ${f(d.i_whats)}, representada por ${f(d.i_rep)}, CPF nº ${f(d.i_cpf)}, doravante chamada IMOBILIÁRIA.`);
  t("As partes concordam com as cláusulas abaixo.");

  h("CLÁUSULA 1 — OBJETO");
  t("1.1. A ALEXANDRIA concede à IMOBILIÁRIA o direito de usar, pela internet, o sistema Alexandria Leads (alexandrialeads.app), que distribui e organiza leads, conversas por WhatsApp, funil de vendas, agenda, espelho de vendas, propostas e importação de contatos.");
  t("1.2. O serviço é prestado como software online (SaaS). O sistema continua sendo da ALEXANDRIA; a IMOBILIÁRIA recebe apenas o direito de uso, pessoal, não exclusivo e intransferível, durante a vigência deste contrato.");

  h("CLÁUSULA 2 — PLANO");
  t(`2.1. A IMOBILIÁRIA contrata o plano ${p.nome}, por ${p.valor} por mês, com até 10 (dez) corretores incluídos.`);
  t(ia
    ? "2.2. O plano inclui: rodízio de leads com horário de atendimento; conversas pelo WhatsApp da imobiliária; funil, planilha, agenda, espelho de vendas e propostas; importação de leads e integração com portais; e a Mi.IA atendendo o lead antes do corretor, no horário escolhido pela IMOBILIÁRIA."
    : "2.2. O plano inclui: rodízio de leads com horário de atendimento; conversas pelo WhatsApp da imobiliária; funil, planilha, agenda, espelho de vendas e propostas; importação de leads e integração com portais.");
  t("2.3. Para mais de 10 corretores, as partes combinam condições e valor por escrito antes da inclusão.");
  t("2.4. A IMOBILIÁRIA tem 7 (sete) dias de teste grátis, com todos os recursos liberados, inclusive a Mi.IA. Se não assinar ao final do teste, o acesso é encerrado, sem multa.");
  t("2.5. A IMOBILIÁRIA pode trocar de plano a qualquer momento pela tela Meu plano. O novo valor vale a partir da próxima cobrança.");

  h("CLÁUSULA 3 — MI.IA");
  if (ia) {
    t("3.1. A Mi.IA é uma assistente virtual de inteligência artificial que conversa com o cliente pelo WhatsApp antes de um corretor assumir, dentro do horário definido pela IMOBILIÁRIA.");
    t("3.2. A IMOBILIÁRIA ensina a Mi.IA respondendo às perguntas da tela Minha Mi.IA e é responsável por essas informações serem verdadeiras e atualizadas, pois a Mi.IA se baseia nelas.");
    t("3.3. Por ser inteligência artificial, a Mi.IA pode errar. A ALEXANDRIA não garante que todas as respostas estejam corretas e não responde por promessas, valores, descontos, prazos ou aprovação de crédito que a IMOBILIÁRIA tenha deixado de limitar na tela Minha Mi.IA. A IMOBILIÁRIA deve testar a Mi.IA antes de ligá-la e acompanhar as conversas.");
    t("3.4. A Mi.IA passa o cliente a um corretor quando a regra de passagem é atingida, quando o cliente pede uma pessoa, após 6 (seis) respostas dela, ou se houver falha. A IMOBILIÁRIA pode desligar a Mi.IA a qualquer momento.");
    t("3.5. A Mi.IA usa serviços de inteligência artificial de terceiros; o conteúdo das conversas é enviado a eles apenas para gerar as respostas.");
  } else {
    t("3.1. A Mi.IA (assistente virtual de inteligência artificial) não faz parte do plano contratado, e só fica disponível durante o teste grátis ou após a troca para o plano Alexandria + Mi.IA, por R$ 499,00 por mês.");
  }

  h("CLÁUSULA 4 — WHATSAPP");
  t("4.1. A IMOBILIÁRIA conecta o próprio número de WhatsApp ao sistema lendo um QR code, e pode desconectar quando quiser.");
  t("4.2. O WhatsApp é um serviço de terceiros, com regras próprias, e a conexão não é feita pela API oficial. A ALEXANDRIA não controla essas regras e não garante que o número não seja limitado ou bloqueado pelo WhatsApp. A IMOBILIÁRIA deve usar o serviço só para conversar com clientes que têm interesse, sem spam ou mensagens em massa não solicitadas.");
  t("4.3. O sistema não inclui discador nem ligações telefônicas.");

  h("CLÁUSULA 5 — PREÇO E PAGAMENTO");
  t("5.1. Os valores são os da Cláusula 2, mensais, por imobiliária. Não há taxa de adesão nem fidelidade.");
  t("5.2. O pagamento é feito por Pix, boleto ou cartão, por meio da plataforma Asaas, pelo link gerado na tela Meu plano. A cobrança é recorrente, mensal.");
  t("5.3. O plano é liberado automaticamente quando o Asaas confirma o pagamento. Boleto pode levar até 1 (um) dia útil para compensar. Cada mensalidade paga vale por 31 (trinta e um) dias de uso.");
  t("5.4. Se o pagamento não for confirmado até o fim do período pago, o acesso pode ser suspenso até a regularização. Os dados da IMOBILIÁRIA continuam guardados por 30 (trinta) dias após a suspensão.");
  t("5.5. A ALEXANDRIA pode reajustar os valores com aviso prévio de 30 (trinta) dias. A IMOBILIÁRIA que não concordar pode cancelar sem multa antes de o novo valor valer.");

  h("CLÁUSULA 6 — VIGÊNCIA E CANCELAMENTO");
  t("6.1. O contrato vale por prazo indeterminado, a partir da assinatura ou do primeiro acesso ao teste grátis, o que ocorrer primeiro.");
  t("6.2. A IMOBILIÁRIA pode cancelar a qualquer momento, avisando por escrito (e-mail ou WhatsApp) ou deixando de pagar a próxima mensalidade, sem multa. O uso continua até o fim do período já pago e não há devolução proporcional.");
  t("6.3. A ALEXANDRIA pode encerrar o contrato com aviso de 15 (quinze) dias, ou imediatamente em caso de uso ilegal, fraude ou violação grave deste contrato.");
  t("6.4. Após o encerramento, a IMOBILIÁRIA pode pedir uma cópia dos seus dados em até 30 (trinta) dias. Passado esse prazo, os dados podem ser apagados.");

  h("CLÁUSULA 7 — OBRIGAÇÕES DAS PARTES");
  t("7.1. A ALEXANDRIA se compromete a: manter o sistema disponível e funcionando; dar suporte conforme a Cláusula 11; proteger os dados conforme a Cláusula 9; e avisar com antecedência sobre mudanças importantes.");
  t("7.2. A IMOBILIÁRIA se compromete a: pagar em dia; manter dados de acesso em sigilo e responder pelo que for feito com eles; cadastrar apenas corretores da sua equipe; usar o sistema de forma legal; e ter autorização dos clientes para contatá-los, incluindo os contatos que importar.");
  t("7.3. É proibido revender, copiar, fazer engenharia reversa do sistema, usar para enviar spam ou conteúdo ilegal, ou compartilhar a conta de um corretor com outra pessoa.");

  h("CLÁUSULA 8 — LIMITES DE RESPONSABILIDADE");
  t("8.1. A ALEXANDRIA não garante um número de vendas, visitas ou leads, nem o resultado comercial do uso do sistema. O sistema é uma ferramenta de apoio; a venda é responsabilidade da IMOBILIÁRIA.");
  t("8.2. A ALEXANDRIA não responde por: falhas de serviços de terceiros (WhatsApp, Asaas, internet, provedores de inteligência artificial, hospedagem); bloqueio de números pelo WhatsApp; informações erradas fornecidas pela IMOBILIÁRIA; ou uso indevido da conta por seus usuários.");
  t("8.3. Em qualquer caso, a responsabilidade total da ALEXANDRIA fica limitada ao valor pago pela IMOBILIÁRIA nos 3 (três) meses anteriores ao fato, salvo nos casos em que a lei não permita esse limite.");

  h("CLÁUSULA 9 — DADOS PESSOAIS (LGPD)");
  t("9.1. Os dados dos clientes e leads (nome, telefone, e-mail, conversas) pertencem à IMOBILIÁRIA. Em relação a eles, a IMOBILIÁRIA é a controladora e a ALEXANDRIA é a operadora, tratando os dados só para prestar o serviço, conforme a Lei nº 13.709/2018 (LGPD).");
  t("9.2. A ALEXANDRIA usa medidas de segurança adequadas, separa os dados de cada imobiliária (uma não enxerga a outra) e avisa a IMOBILIÁRIA se houver incidente de segurança que afete esses dados.");
  t("9.3. A IMOBILIÁRIA garante que tem base legal para tratar os dados que cadastra ou importa e para contatar essas pessoas, e atende os pedidos dos titulares (acesso, correção, exclusão). A ALEXANDRIA ajuda, no que for necessário, nesses pedidos.");
  t("9.4. A ALEXANDRIA pode usar serviços de terceiros para operar o sistema (hospedagem, banco de dados, pagamento, inteligência artificial, envio de mensagens). Esses serviços recebem apenas os dados necessários.");
  t("9.5. A ALEXANDRIA não vende nem usa os dados da IMOBILIÁRIA para outras finalidades.");

  h("CLÁUSULA 10 — CONFIDENCIALIDADE");
  t("10.1. Cada parte mantém em sigilo as informações confidenciais da outra a que tiver acesso, como listas de clientes, estratégias, valores e dados técnicos, e só as usa para cumprir este contrato.");
  t("10.2. O sigilo continua por 2 (dois) anos após o fim do contrato, exceto para informação que já seja pública ou que a lei obrigue a revelar.");

  h("CLÁUSULA 11 — SUPORTE E DISPONIBILIDADE");
  t(`11.1. O suporte é prestado por WhatsApp e e-mail, em dias úteis, em horário comercial, em ${f(d.a_suporte)}.`);
  t("11.2. A ALEXANDRIA busca manter o sistema no ar o máximo possível, mas pode haver paradas para manutenção ou por falhas de terceiros. Não há garantia de funcionamento ininterrupto.");

  h("CLÁUSULA 12 — PROPRIEDADE INTELECTUAL");
  t("12.1. O sistema, a marca Alexandria, a Mi.IA, os textos e o código são da ALEXANDRIA ou de quem a licenciou. Este contrato não transfere nenhum desses direitos à IMOBILIÁRIA.");
  t("12.2. O conteúdo que a IMOBILIÁRIA cadastra (leads, textos, respostas ensinadas à Mi.IA, imóveis) continua sendo dela.");

  h("CLÁUSULA 13 — ALTERAÇÕES");
  t("13.1. A ALEXANDRIA pode melhorar e mudar o sistema. Mudanças que reduzam de forma importante o que o plano contratado oferece serão avisadas com 30 (trinta) dias de antecedência, e a IMOBILIÁRIA pode cancelar sem multa.");
  t("13.2. Mudanças neste contrato só valem se feitas por escrito, inclusive por e-mail ou WhatsApp, e aceitas pelas duas partes.");

  h("CLÁUSULA 14 — FORO");
  t(`14.1. As partes escolhem o foro da comarca de ${f(d.a_foro)} para resolver qualquer questão deste contrato, com renúncia a qualquer outro.`);
  t("14.2. Antes de ir à Justiça, as partes tentam resolver a questão conversando, em até 15 (quinze) dias.");

  h("CLÁUSULA 15 — ASSINATURA");
  t("15.1. As partes aceitam que este contrato seja assinado por meio eletrônico ou digital, com a mesma validade de uma assinatura em papel.");
  t("E, por estarem de acordo, assinam abaixo.");
  t(`${d.cidade.trim() || "__________________"}, ${data}.`);
  B.push({ t: "sig", x: `CONTRATADA (ALEXANDRIA)|${d.a_rep.trim() || d.a_nome.trim()}|${d.a_doc.trim()}` });
  B.push({ t: "sig", x: `CONTRATANTE (IMOBILIÁRIA)|${d.i_rep.trim() || d.i_nome.trim()}|${d.i_cpf.trim()}` });
  B.push({ t: "sig", x: "Testemunha 1||" });
  B.push({ t: "sig", x: "Testemunha 2||" });

  return { titulo: "CONTRATO DE PRESTAÇÃO DE SERVIÇOS — ALEXANDRIA LEADS", blocos: B };
}
