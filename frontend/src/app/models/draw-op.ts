/**
 * Wire format for the draw channel (mirrors DrawMessageIn / DrawEventOut).
 *
 * NOTE (contract dep #1): the backend does NOT yet carry a `strokeId`. Streaming
 * mid-stroke reassembly in Sprint 3 will need it added. Coordinates are currently
 * raw `number[]` points; Sprint 3 normalizes to 0..1 (contract dep #3).
 */
export interface DrawOp {
  type: 'stroke' | 'clear' | 'undo';
  points?: number[][];
  color?: string;
  lineWidth?: number;
}
