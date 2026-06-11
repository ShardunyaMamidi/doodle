import { drawSegment, renderStroke } from './smoothing';

function mockCtx() {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
  } as unknown as CanvasRenderingContext2D;
}

describe('drawSegment', () => {
  it('draws a quadratic curve when a control point is given', () => {
    const ctx = mockCtx();
    drawSegment(ctx, { x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 }, '#abc', 3);

    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(ctx.quadraticCurveTo).toHaveBeenCalledWith(5, 5, 10, 10);
    expect(ctx.lineTo).not.toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.strokeStyle).toBe('#abc');
    expect(ctx.lineWidth).toBe(3);
  });

  it('draws a straight line when the control point is null (a cap)', () => {
    const ctx = mockCtx();
    drawSegment(ctx, { x: 0, y: 0 }, null, { x: 10, y: 0 }, '#000', 1);

    expect(ctx.lineTo).toHaveBeenCalledWith(10, 0);
    expect(ctx.quadraticCurveTo).not.toHaveBeenCalled();
  });
});

describe('renderStroke', () => {
  it('renders a single point as a dot', () => {
    const ctx = mockCtx();
    renderStroke(ctx, [{ x: 4, y: 4 }], '#000', 8);

    expect(ctx.arc).toHaveBeenCalledWith(4, 4, 4, 0, Math.PI * 2);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
  });

  it('renders start cap + interior curves + end cap', () => {
    const ctx = mockCtx();
    // 4 points → 1 start cap (lineTo) + 2 interior (quadratic) + 1 end cap (lineTo)
    renderStroke(
      ctx,
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 30, y: 0 },
      ],
      '#000',
      2,
    );

    expect(ctx.quadraticCurveTo).toHaveBeenCalledTimes(2);
    expect(ctx.lineTo).toHaveBeenCalledTimes(2); // two caps
    expect(ctx.stroke).toHaveBeenCalledTimes(4);
  });

  it('does nothing for an empty stroke', () => {
    const ctx = mockCtx();
    renderStroke(ctx, [], '#000', 2);
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});
