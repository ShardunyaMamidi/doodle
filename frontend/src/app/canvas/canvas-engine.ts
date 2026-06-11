import { Observable, Subject, from, merge } from 'rxjs';
import { bufferTime, concatMap, filter } from 'rxjs/operators';

import { DrawOp, NormPoint, Stroke } from '../models/draw-op';
import { Pt, drawLatestSegment, renderStroke } from './smoothing';

export type CanvasMode = 'draw' | 'view';

const DEFAULT_THROTTLE_MS = 50;
const DEFAULT_COLOR = '#2C2620';
const DEFAULT_WIDTH = 4;

/** A captured point tagged with the stroke it belongs to (for batched emission). */
interface CapturedPoint {
  point: NormPoint;
  strokeId: string;
  color: string;
  width: number;
}

/**
 * Framework-agnostic drawing core. Owns capture, render, and serialization for one
 * `<canvas>`. Knows nothing about STOMP, NgRx, or Angular — the component wires it up.
 *
 * In `'draw'` mode it captures pointer input, renders locally, and emits {@link DrawOp}s
 * on {@link ops$}. In `'view'` mode it renders incoming ops via {@link applyOp}. Both
 * paths funnel through the same smoothing primitive, so drawer and guessers match.
 */
export class CanvasEngine {
  /** Drawer output — the component forwards these to RealtimeService.sendDraw. */
  readonly ops$: Observable<DrawOp>;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly captured$ = new Subject<CapturedPoint>();
  private readonly discreteOps$ = new Subject<DrawOp>(); // clear / undo

  private strokes: Stroke[] = [];
  private current?: Stroke;
  private mode: CanvasMode = 'view';
  private color = DEFAULT_COLOR;
  private width = DEFAULT_WIDTH;

  private cssWidth = 0;
  private cssHeight = 0;

  private readonly handlers: Array<[string, EventListener]> = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    opts?: { throttleMs?: number },
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CanvasEngine: 2D context unavailable');
    this.ctx = ctx;

    const throttleMs = opts?.throttleMs ?? DEFAULT_THROTTLE_MS;

    // Throttled batches of captured points → one stroke op per stroke per window,
    // each carrying only the new points. Merged with discrete clear/undo ops.
    const batched$ = this.captured$.pipe(
      bufferTime(throttleMs),
      filter((batch) => batch.length > 0),
      concatMap((batch) => from(this.batchToOps(batch))),
    );
    this.ops$ = merge(batched$, this.discreteOps$);

    this.sizeToElement();
    this.attachPointerHandlers();
  }

  // ---- Public control ----

  setMode(mode: CanvasMode): void {
    this.mode = mode;
    if (mode === 'view') this.current = undefined; // can't be mid-capture as a viewer
  }

  setBrush(color: string, width: number): void {
    this.color = color;
    this.width = width;
  }

  /** Render one incoming op. No-op while drawing (the drawer authors its own canvas). */
  applyOp(op: DrawOp): void {
    if (this.mode === 'draw') return;
    this.renderOp(op);
  }

  /** Late-join / reconnect replay — identical render path to live events. */
  applySnapshot(ops: DrawOp[]): void {
    this.reset();
    for (const op of ops) this.renderOp(op);
  }

  /** Drawer: wipe model + canvas and tell everyone. */
  clear(): void {
    this.strokes = [];
    this.current = undefined;
    this.wipe();
    this.discreteOps$.next({ type: 'clear' });
  }

  /** Drawer: drop the last stroke, redraw the rest, and tell everyone. */
  undo(): void {
    this.strokes.pop();
    this.redrawAll();
    this.discreteOps$.next({ type: 'undo' });
  }

  /** Recompute the backing store + transform and repaint from the model. */
  resize(): void {
    this.sizeToElement();
    this.redrawAll();
  }

  /** New turn: clear model + canvas without emitting anything. */
  reset(): void {
    this.strokes = [];
    this.current = undefined;
    this.wipe();
  }

  destroy(): void {
    for (const [type, handler] of this.handlers) {
      this.canvas.removeEventListener(type, handler);
    }
    this.handlers.length = 0;
    this.captured$.complete();
    this.discreteOps$.complete();
  }

  /** Read-only view of the current model (for tests / debugging). */
  get model(): readonly Stroke[] {
    return this.strokes;
  }

  // ---- Capture (drawer) ----

  private attachPointerHandlers(): void {
    this.on('pointerdown', (e) => this.onPointerDown(e as PointerEvent));
    this.on('pointermove', (e) => this.onPointerMove(e as PointerEvent));
    this.on('pointerup', () => this.onPointerUp());
    this.on('pointercancel', () => this.onPointerUp());
    this.on('pointerleave', () => this.onPointerUp());
  }

  private on(type: string, handler: EventListener): void {
    this.canvas.addEventListener(type, handler);
    this.handlers.push([type, handler]);
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.mode !== 'draw') return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.current = { id: crypto.randomUUID(), color: this.color, width: this.width, points: [] };
    this.strokes.push(this.current);
    this.appendCapturedPoint(this.captureNorm(e));
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.mode !== 'draw' || !this.current) return;
    this.appendCapturedPoint(this.captureNorm(e));
  }

  private onPointerUp(): void {
    if (!this.current) return;
    // Paint the final cap so the stroke's tail is drawn (the "one-point lag" flush).
    renderStroke(this.ctx, this.current.points.map((p) => this.denorm(p)), this.current.color, this.current.width);
    this.current = undefined;
  }

  /** Push a normalized point onto the current stroke, draw it, and queue it for emit. */
  private appendCapturedPoint(np: NormPoint): void {
    const s = this.current!;
    s.points.push(np);
    drawLatestSegment(this.ctx, s.points.map((p) => this.denorm(p)), s.color, s.width);
    this.captured$.next({ point: np, strokeId: s.id, color: s.color, width: s.width });
  }

  // ---- Render (shared path) ----

  private renderOp(op: DrawOp): void {
    switch (op.type) {
      case 'stroke': {
        const s = this.getOrCreateStroke(op);
        for (const raw of op.points) {
          s.points.push({ x: raw[0], y: raw[1], p: raw[2] });
          drawLatestSegment(this.ctx, s.points.map((p) => this.denorm(p)), s.color, s.width);
        }
        break;
      }
      case 'clear':
        this.strokes = [];
        this.wipe();
        break;
      case 'undo':
        this.strokes.pop();
        this.redrawAll();
        break;
    }
  }

  private getOrCreateStroke(op: Extract<DrawOp, { type: 'stroke' }>): Stroke {
    let s = this.strokes.find((st) => st.id === op.strokeId);
    if (!s) {
      s = { id: op.strokeId, color: op.color, width: op.lineWidth, points: [] };
      this.strokes.push(s);
    }
    return s;
  }

  private redrawAll(): void {
    this.wipe();
    for (const s of this.strokes) {
      renderStroke(this.ctx, s.points.map((p) => this.denorm(p)), s.color, s.width);
    }
  }

  private wipe(): void {
    this.ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
  }

  // ---- Normalize / denormalize at the edges ----

  private captureNorm(e: PointerEvent): NormPoint {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
      p: e.pressure || 0.5,
    };
  }

  private denorm(p: NormPoint): Pt {
    return { x: p.x * this.cssWidth, y: p.y * this.cssHeight };
  }

  /** Size the backing store to css × DPR and scale the context once. */
  private sizeToElement(): void {
    const r = this.canvas.getBoundingClientRect();
    this.cssWidth = r.width || this.canvas.width || 0;
    this.cssHeight = r.height || this.canvas.height || 0;
    const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1;
    this.canvas.width = Math.round(this.cssWidth * dpr);
    this.canvas.height = Math.round(this.cssHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---- Throttle/batch serialization ----

  private batchToOps(batch: CapturedPoint[]): DrawOp[] {
    const ops: DrawOp[] = [];
    let group: CapturedPoint[] = [];
    const flush = () => {
      if (group.length === 0) return;
      ops.push({
        type: 'stroke',
        strokeId: group[0].strokeId,
        color: group[0].color,
        lineWidth: group[0].width,
        points: group.map((c) => [c.point.x, c.point.y, c.point.p]),
      });
      group = [];
    };
    for (const c of batch) {
      if (group.length && group[0].strokeId !== c.strokeId) flush();
      group.push(c);
    }
    flush();
    return ops;
  }
}
