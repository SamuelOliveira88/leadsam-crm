import { montarContrato, type DadosContrato } from "@/lib/contrato";

export function ContratoTexto({ dados }: { dados: DadosContrato }) {
  const c = montarContrato(dados);
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <h2 className="text-center text-base font-bold">{c.titulo}</h2>
      {c.blocos.map((b, i) =>
        b.t === "h" ? <h3 key={i} className="pt-2 font-bold">{b.x}</h3>
        : b.t === "sig" ? (() => { const [rot, nome, doc] = b.x.split("|"); return (
            <div key={i} className="pt-8" style={{ breakInside: "avoid" }}>
              <div className="border-t border-foreground/60 pt-1 text-xs"><b>{rot}</b>{nome ? ` — ${nome}` : ""}{doc ? ` — ${doc}` : ""}</div>
            </div>); })()
        : <p key={i} className="text-justify">{b.x}</p>,
      )}
    </div>
  );
}
