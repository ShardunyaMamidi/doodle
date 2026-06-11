import { CanvasEngine } from './canvas-engine';
import { DrawOp } from '../models/draw-op';

function mockCtx() {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
  } as unknown as CanvasRenderingContext2D;
}

/** Canvas is 200×100 in CSS pixels, so clientX 50 → 0.25, clientY 50 → 0.5. */
function makeEngine(throttleMs = 50) {
  const ctx = mockCtx();
  const canvas = document.createElement('canvas');
  canvas.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON() {} }) as DOMRect;
  const engine = new CanvasEngine(canvas, { throttleMs });
  return { engine, canvas, ctx };
}

function pointer(canvas: HTMLCanvasElement, type: string, x: number, y: number) {
  canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, pressure: 0.5 }));
}

function strokeOp(id: string, points: number[][], color = '#000', lineWidth = 2): DrawOp {
  return { type: 'stroke', strokeId: id, color, lineWidth, points };
}

describe('CanvasEngine — capture & emit (drawer)', () => {
  it('normalizes captured points to 0..1 and emits one stroke op per throttle window', () => {
    vi.useFakeTimers();
    const { engine, canvas } = makeEngine(50);
    engine.setMode('draw');

    const ops: DrawOp[] = [];
    engine.ops$.subscribe((o) => ops.push(o));

    pointer(canvas, 'pointerdown', 50, 50);
    pointer(canvas, 'pointermove', 100, 50);
    pointer(canvas, 'pointerup', 100, 50);

    vi.advanceTimersByTime(60);

    expect(ops).toHaveLength(1);
    const op = ops[0];
    expect(op.type).toBe('stroke');
    if (op.type !== 'stroke') throw new Error('expected stroke');
    expect(op.color).toBe('#2C2620'); // engine default brush
    expect(op.lineWidth).toBe(4);
    expect(op.points).toEqual([
      [0.25, 0.5, 0.5],
      [0.5, 0.5, 0.5],
    ]);
    expect(typeof op.strokeId).toBe('string');
    expect(op.strokeId.length).toBeGreaterThan(0);

    vi.useRealTimers();
  });

  it('splits a continuing stroke across windows but keeps one strokeId', () => {
    vi.useFakeTimers();
    const { engine, canvas } = makeEngine(50);
    engine.setMode('draw');

    const ops: DrawOp[] = [];
    engine.ops$.subscribe((o) => ops.push(o));

    pointer(canvas, 'pointerdown', 0, 0);
    pointer(canvas, 'pointermove', 50, 0);
    vi.advanceTimersByTime(60);
    pointer(canvas, 'pointermove', 100, 0);
    vi.advanceTimersByTime(60);

    expect(ops).toHaveLength(2);
    if (ops[0].type !== 'stroke' || ops[1].type !== 'stroke') throw new Error('expected strokes');
    expect(ops[0].points).toHaveLength(2);
    expect(ops[1].points).toHaveLength(1);
    expect(ops[0].strokeId).toBe(ops[1].strokeId);

    vi.useRealTimers();
  });

  it('does not capture or emit while in view mode', () => {
    vi.useFakeTimers();
    const { engine, canvas } = makeEngine(50);
    engine.setMode('view');

    const ops: DrawOp[] = [];
    engine.ops$.subscribe((o) => ops.push(o));

    pointer(canvas, 'pointerdown', 50, 50);
    pointer(canvas, 'pointermove', 100, 50);
    vi.advanceTimersByTime(60);

    expect(ops).toHaveLength(0);
    expect(engine.model).toHaveLength(0);

    vi.useRealTimers();
  });
});

describe('CanvasEngine — render incoming ops (viewer)', () => {
  it('groups stroke ops by strokeId into the model', () => {
    const { engine } = makeEngine();
    engine.setMode('view');

    engine.applyOp(strokeOp('a', [[0, 0, 0.5]]));
    engine.applyOp(strokeOp('a', [[0.5, 0.5, 0.5]]));
    expect(engine.model).toHaveLength(1);
    expect(engine.model[0].points).toHaveLength(2);

    engine.applyOp(strokeOp('b', [[0.1, 0.1, 0.5]]));
    expect(engine.model).toHaveLength(2);
  });

  it('undo drops the last stroke and triggers a full redraw', () => {
    const { engine, ctx } = makeEngine();
    engine.setMode('view');
    engine.applyOp(strokeOp('a', [[0, 0, 0.5]]));
    engine.applyOp(strokeOp('b', [[0.5, 0.5, 0.5]]));
    (ctx.clearRect as ReturnType<typeof vi.fn>).mockClear();

    engine.applyOp({ type: 'undo' });

    expect(engine.model).toHaveLength(1);
    expect(engine.model[0].id).toBe('a');
    expect(ctx.clearRect).toHaveBeenCalled(); // redrawAll wipes first
  });

  it('clear empties the model and wipes the canvas', () => {
    const { engine, ctx } = makeEngine();
    engine.setMode('view');
    engine.applyOp(strokeOp('a', [[0, 0, 0.5]]));
    (ctx.clearRect as ReturnType<typeof vi.fn>).mockClear();

    engine.applyOp({ type: 'clear' });

    expect(engine.model).toHaveLength(0);
    expect(ctx.clearRect).toHaveBeenCalled();
  });

  it('ignores incoming ops while in draw mode (no fan-out echo)', () => {
    const { engine } = makeEngine();
    engine.setMode('draw');
    engine.applyOp(strokeOp('a', [[0, 0, 0.5]]));
    expect(engine.model).toHaveLength(0);
  });
});

describe('CanvasEngine — clear/undo emit on ops$ (drawer)', () => {
  it('emits clear and undo ops', () => {
    const { engine } = makeEngine();
    engine.setMode('draw');
    const ops: DrawOp[] = [];
    engine.ops$.subscribe((o) => ops.push(o));

    engine.clear();
    engine.undo();

    expect(ops).toEqual([{ type: 'clear' }, { type: 'undo' }]);
  });
});

describe('CanvasEngine — snapshot replay', () => {
  it('rebuilds the same model as the equivalent live op sequence', () => {
    const seq: DrawOp[] = [
      strokeOp('a', [[0, 0, 0.5], [0.2, 0.2, 0.5]]),
      strokeOp('b', [[0.5, 0.5, 0.5]]),
      strokeOp('a', [[0.4, 0.4, 0.5]]),
    ];

    const live = makeEngine().engine;
    live.setMode('view');
    seq.forEach((op) => live.applyOp(op));

    const replayed = makeEngine().engine;
    replayed.setMode('view');
    replayed.applySnapshot(seq);

    expect(replayed.model.map((s) => ({ id: s.id, n: s.points.length }))).toEqual(
      live.model.map((s) => ({ id: s.id, n: s.points.length })),
    );
    // stroke 'a' accumulated 3 points across two ops
    expect(replayed.model.find((s) => s.id === 'a')!.points).toHaveLength(3);
  });

  it('reset() before replay clears any prior model', () => {
    const { engine } = makeEngine();
    engine.setMode('view');
    engine.applyOp(strokeOp('old', [[0, 0, 0.5]]));

    engine.applySnapshot([strokeOp('new', [[0.5, 0.5, 0.5]])]);

    expect(engine.model).toHaveLength(1);
    expect(engine.model[0].id).toBe('new');
  });
});
