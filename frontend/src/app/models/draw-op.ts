/**
 * Drawing wire format and in-memory model.
 *
 * Coordinates are normalized to 0..1 on capture and denormalized on paint, so the
 * drawer and every guesser render pixel-identical strokes regardless of canvas
 * size or device-pixel-ratio (contract dep #3 — backend stays coordinate-agnostic).
 *
 * Every `stroke` op carries a `strokeId` so a stroke streamed across several
 * throttled batches can be reassembled by the receiver (contract dep #1). `undo`
 * on the backend must remove all events sharing the last `strokeId` (contract dep #2).
 */

/** A captured point, all components in 0..1. `p` is pen pressure. */
export interface NormPoint {
  x: number;
  y: number;
  p: number;
}

/** A full stroke in the in-memory model (normalized points). */
export interface Stroke {
  id: string;
  color: string;
  width: number;
  points: NormPoint[];
}

/**
 * Wire format for the draw channel (mirrors DrawMessageIn / DrawEventOut).
 * `points` is an array of `[x, y, p]` triples, all normalized to 0..1.
 */
export type DrawOp =
  | { type: 'stroke'; strokeId: string; color: string; lineWidth: number; points: number[][] }
  | { type: 'clear' }
  | { type: 'undo' };

/**
 * Full canvas history replayed privately to a late joiner / reconnecting player.
 * Backend `DrawEvent`s carry an extra `timestamp` we ignore — each event is
 * structurally a {@link DrawOp}.
 */
export interface CanvasSnapshot {
  events: DrawOp[];
}
