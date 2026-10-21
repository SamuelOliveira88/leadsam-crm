import qrcode from "@/lib/vendor/qrcode-generator";

// Endereço que vai dentro do QR. O QR é impresso, então o endereço precisa ser o definitivo.
// Defina VITE_SITE_URL no Vercel quando o domínio próprio estiver no ar; sem ela, usa o endereço atual.
export function enderecoDoPonto(codigo: string): string {
  const base =
    (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/ponto/${codigo}`;
}

/** QR em SVG (escala sem perder qualidade; bom para imprimir). */
export function qrSvg(texto: string): string {
  const qr = qrcode(0, "M");
  qr.addData(texto);
  qr.make();
  return qr.createSvgTag(8, 4);
}

/** Baixa o QR como PNG grande, com o nome do ponto embaixo. */
export async function baixarQrPng(texto: string, nomeArquivo: string, titulo: string): Promise<void> {
  const svg = qrSvg(texto);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((ok, erro) => {
      img.onload = () => ok();
      img.onerror = () => erro(new Error("Não consegui montar a imagem do QR."));
      img.src = url;
    });
    const lado = 1024;
    const faixa = 96;
    const canvas = document.createElement("canvas");
    canvas.width = lado;
    canvas.height = lado + faixa;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não consegui gerar a imagem.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, lado, lado);
    ctx.fillStyle = "#111111";
    ctx.font = "bold 44px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(titulo.slice(0, 40), lado / 2, lado + 62);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${nomeArquivo}.png`;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
