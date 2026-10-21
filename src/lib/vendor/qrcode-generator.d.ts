// Tipos mínimos do qrcode-generator (MIT, Kazuhiko Arase).
interface QRCodeInstance {
  addData(data: string, mode?: "Numeric" | "Alphanumeric" | "Byte" | "Kanji"): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
  createSvgTag(cellSize?: number, margin?: number): string;
  createDataURL(cellSize?: number, margin?: number): string;
}
declare const qrcode: (typeNumber: number, errorCorrectionLevel: "L" | "M" | "Q" | "H") => QRCodeInstance;
export default qrcode;
