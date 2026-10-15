export type Coordenadas = { latitude: number; longitude: number };

export type PosicaoGeo = Coordenadas & {
  /** Margem de erro do GPS, em metros. */
  precisaoMetros: number;
  /** Momento da captura, em ISO 8601. */
  capturadaEm: string;
};

export type AlvoGeo = Coordenadas & { raioMetros: number };

const RAIO_TERRA_METROS = 6_371_000;

const rad = (graus: number) => (graus * Math.PI) / 180;

/** Distância em metros entre dois pontos (fórmula de Haversine). */
export function distanciaMetros(a: Coordenadas, b: Coordenadas): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_METROS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Verifica se a posição está dentro do raio do alvo.
 * Considera a margem de erro do GPS a favor do usuário: se a distância menos a
 * imprecisão cabe no raio, aceita. Evita recusar quem está no local mas com GPS ruim.
 */
export function dentroDoRaio(pos: PosicaoGeo, alvo: AlvoGeo): { dentro: boolean; distanciaMetros: number } {
  const distancia = distanciaMetros(pos, alvo);
  const folga = Math.min(pos.precisaoMetros, alvo.raioMetros);
  return { dentro: distancia - folga <= alvo.raioMetros, distanciaMetros: distancia };
}

export function formatarDistancia(metros: number): string {
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toFixed(1).replace(".", ",")} km`;
}
