// Ligar pelo celular do próprio corretor: abre o discador do aparelho com o número do lead.
// Sem servidor e sem custo extra: a ligação sai pelo chip do corretor.
// O telefone vem do servidor já filtrado: lead blindado chega sem telefone e o botão não aparece.

/** Converte um telefone brasileiro em link `tel:` internacional. Retorna null se não for um número válido. */
export function linkTel(telefone: string | null | undefined): string | null {
  let d = (telefone ?? "").replace(/\D/g, "");
  if (!d) return null;
  d = d.replace(/^0+/, "");
  if (d.startsWith("55") && d.length >= 12) return `tel:+${d}`;
  if (d.length === 10 || d.length === 11) return `tel:+55${d}`;
  return null;
}

// Registro das ligações: cada ligação feita pelo Alexandria vira uma nota no lead (aparece no histórico
// e reinicia o prazo de contato). O áudio NÃO é gravado: a ligação sai pelo discador do próprio celular.
export const NOTA_LIGACAO_INICIADA = "📞 Ligação iniciada pelo Alexandria (celular do corretor)";

export const RESULTADOS_LIGACAO = ["Atendeu", "Não atendeu", "Caixa postal", "Número errado", "Pediu para ligar depois"] as const;

export function notaResultadoLigacao(resultado: string): string {
  return `📞 Resultado da ligação: ${resultado}`;
}
