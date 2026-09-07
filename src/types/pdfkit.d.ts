/** API PDFKit utilisée par les états comptables ; le moteur émet un flux Node. */
declare module "pdfkit" {
  import { Readable } from "node:stream";
  type OptionsTexte = { width?: number; height?: number; align?: "left" | "right" | "center"; lineGap?: number; lineBreak?: boolean; paragraphGap?: number };
  export default class PDFDocument extends Readable {
    constructor(options?: { autoFirstPage?: boolean; size?: string; layout?: string; margin?: number; compress?: boolean; bufferPages?: boolean; info?: Record<string, string> });
    y: number;
    page: { width: number; height: number };
    addPage(options?: { size?: string; layout?: string; margin?: number }): this;
    font(name: string): this;
    fontSize(size: number): this;
    fillColor(color: string): this;
    strokeColor(color: string): this;
    lineWidth(width: number): this;
    text(text: string, x: number, y: number, options?: OptionsTexte): this;
    heightOfString(text: string, options?: OptionsTexte): number;
    rect(x: number, y: number, width: number, height: number): this;
    fill(color?: string): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    stroke(): this;
    end(): void;
  }
}
