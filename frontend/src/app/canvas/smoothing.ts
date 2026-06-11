/**
 * Quadratic-midpoint smoothing — the single render primitive shared by live
 * capture, live playback, and full redraws. Reusing one path is what guarantees
 * the drawer and every guesser see identical pixels.
 *
 * All points here are in DEVICE/CSS pixels (already denormalized by the engine).
 */

export interface Pt {
  x: number;
  y: number;
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Draw one segment. With a control point the segment is a quadratic curve from
 * `from` through `ctrl` to `to`; with `ctrl === null` it is a straight line
 * (used for the start/end caps of a stroke).
 */
export function drawSegment(
  ctx: CanvasRenderingContext2D,
  from: Pt,
  ctrl: Pt | null,
  to: Pt,
  color: string,
  width: number,
): void {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.moveTo(from.x, from.y);
  if (ctrl) {
    ctx.quadraticCurveTo(ctrl.x, ctrl.y, to.x, to.y);
  } else {
    ctx.lineTo(to.x, to.y);
  }
  ctx.stroke();
}

/**
 * Render a whole stroke: a start cap, contiguous quadratic segments centered on
 * each interior point, and an end cap. The segments share endpoints (midpoints),
 * so they tile without overlap. Used by full redraws and snapshot replay.
 */
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  color: string,
  width: number,
): void {
  if (pts.length === 0) return;

  if (pts.length === 1) {
    // A lone point is a dot.
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(pts[0].x, pts[0].y, width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Start cap: first point → midpoint of the first pair.
  drawSegment(ctx, pts[0], null, mid(pts[0], pts[1]), color, width);

  // Interior: a quadratic curve centered on each point pts[i].
  for (let i = 1; i < pts.length - 1; i++) {
    drawSegment(ctx, mid(pts[i - 1], pts[i]), pts[i], mid(pts[i], pts[i + 1]), color, width);
  }

  // End cap: midpoint of the last pair → last point.
  const n = pts.length;
  drawSegment(ctx, mid(pts[n - 2], pts[n - 1]), null, pts[n - 1], color, width);
}

/**
 * Draw only the newest segment of a stroke as points stream in — the incremental
 * counterpart to {@link renderStroke}. Tiles exactly onto what previous calls drew,
 * so live capture/playback produces the same pixels {@link renderStroke} would.
 *
 * Pass the stroke's denormalized points; this draws the segment that just became
 * fully determined by the most recent point.
 */
export function drawLatestSegment(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  color: string,
  width: number,
): void {
  const n = pts.length;
  if (n < 2) return; // need at least two points to draw anything

  if (n === 2) {
    // First real ink: the start cap.
    drawSegment(ctx, pts[0], null, mid(pts[0], pts[1]), color, width);
    return;
  }

  // The interior segment centered on pts[n-2] is now determined by pts[n-1].
  drawSegment(
    ctx,
    mid(pts[n - 3], pts[n - 2]),
    pts[n - 2],
    mid(pts[n - 2], pts[n - 1]),
    color,
    width,
  );
}
