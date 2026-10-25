// Textos que moram em listas fixas fora das telas (valores gravados no banco, que NÃO podem mudar).
// Aqui só registramos para tradução; na tela use tr(valor).
import { mark } from "./index";

export const TEXTOS_FIXOS = [
  // Etapas do funil (src/lib/funil.ts)
  mark("Novo"), mark("Em atendimento"), mark("Visita agendada"), mark("Proposta"), mark("Vendido"), mark("Perdido"),
  // Motivos de perda sugeridos
  mark("Sem interesse"), mark("Não respondeu"), mark("Não aprovou crédito"), mark("Comprou outro imóvel"), mark("Desistiu da compra"),
  // Papéis das pessoas
  mark("master"), mark("gerente"), mark("corretor"), mark("pendente"),
];
