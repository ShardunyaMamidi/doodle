import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  OnDestroy,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { Subscription } from 'rxjs';

import { environment } from '../../environments/environment';
import { RealtimeService } from '../core/realtime/realtime.service';
import { selectGamePhase, selectIsDrawer } from '../store/game/game.selectors';
import { CanvasEngine } from './canvas-engine';

/**
 * Thin Angular wrapper around {@link CanvasEngine}. The engine and the high-volume
 * draw subscriptions run OUTSIDE Angular's zone so strokes never trigger change
 * detection; only the toolbar (drawer-only) is part of the CD tree.
 *
 * Draw traffic deliberately bypasses NgRx — the component talks to RealtimeService
 * directly. The store only supplies *which mode* the canvas is in.
 */
@Component({
  selector: 'app-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="canvas-wrap">
      <canvas #cv class="board"></canvas>

      @if (isDrawer()) {
        <div class="toolbar">
          <div class="swatches">
            @for (c of palette; track c) {
              <button
                type="button"
                class="swatch"
                [class.active]="c === color()"
                [style.background]="c"
                [attr.aria-label]="'Colour ' + c"
                (click)="pickColor(c)"
              ></button>
            }
          </div>
          <label class="width">
            Brush
            <input
              type="range"
              [min]="minWidth"
              [max]="maxWidth"
              [value]="width()"
              (input)="setWidth($any($event.target).valueAsNumber)"
            />
          </label>
          <button type="button" class="act" (click)="undo()">Undo</button>
          <button type="button" class="act" (click)="clear()">Clear</button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .canvas-wrap { width: 100%; max-width: 40rem; margin: 0 auto; display: flex; flex-direction: column; gap: 0.5rem; }
      .board {
        width: 100%;
        aspect-ratio: 4 / 3;
        border: 1px solid #ddd;
        border-radius: 0.5rem;
        background: #fff;
        touch-action: none; /* stop scroll/zoom hijacking strokes on mobile */
        cursor: crosshair;
      }
      .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
      .swatches { display: flex; gap: 0.25rem; }
      .swatch { width: 1.5rem; height: 1.5rem; border-radius: 50%; border: 2px solid #ccc; cursor: pointer; padding: 0; }
      .swatch.active { border-color: #333; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #333; }
      .width { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: #555; }
      .act { padding: 0.3rem 0.7rem; border: 1px solid #ccc; border-radius: 0.4rem; background: #f7f7f7; cursor: pointer; }
      .act:hover { background: #eee; }
    `,
  ],
})
export class CanvasComponent implements AfterViewInit, OnDestroy {
  private readonly store = inject(Store);
  private readonly realtime = inject(RealtimeService);
  private readonly route = inject(ActivatedRoute);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  private readonly cv = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');

  private engine?: CanvasEngine;
  private resizeObserver?: ResizeObserver;
  private readonly hot = new Subscription(); // off-zone draw subscriptions

  readonly palette = environment.canvas.palette;
  readonly minWidth = environment.canvas.minWidth;
  readonly maxWidth = environment.canvas.maxWidth;
  readonly isDrawer = signal(false);
  readonly color = signal(environment.canvas.defaultColor);
  readonly width = signal(environment.canvas.defaultWidth);

  ngAfterViewInit(): void {
    const canvas = this.cv().nativeElement;
    const roomId = this.route.snapshot.paramMap.get('id') ?? '';

    // Engine + draw I/O live outside Angular — strokes must not trigger CD.
    this.zone.runOutsideAngular(() => {
      const engine = new CanvasEngine(canvas, { throttleMs: environment.canvas.throttleMs });
      this.engine = engine;
      engine.setBrush(this.color(), this.width());

      this.hot.add(engine.ops$.subscribe((op) => this.realtime.sendDraw(roomId, op)));
      this.hot.add(this.realtime.draw$(roomId).subscribe((op) => engine.applyOp(op)));
      this.hot.add(
        this.realtime.canvasSnapshot$(roomId).subscribe((snap) => engine.applySnapshot(snap.events)),
      );

      const ro = new ResizeObserver(() => engine.resize());
      ro.observe(canvas);
      this.resizeObserver = ro;
    });

    // Store-driven (in zone): mode toggle, toolbar visibility, new-turn reset.
    this.store
      .select(selectIsDrawer)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((d) => {
        this.isDrawer.set(d);
        this.engine?.setMode(d ? 'draw' : 'view');
      });

    this.store
      .select(selectGamePhase)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((phase) => {
        if (phase === 'WORD_SELECTION') this.engine?.reset(); // fresh canvas for the next turn
      });
  }

  ngOnDestroy(): void {
    this.hot.unsubscribe();
    this.resizeObserver?.disconnect();
    this.engine?.destroy();
  }

  pickColor(c: string): void {
    this.color.set(c);
    this.engine?.setBrush(c, this.width());
  }

  setWidth(w: number): void {
    if (Number.isNaN(w)) return;
    this.width.set(w);
    this.engine?.setBrush(this.color(), w);
  }

  undo(): void {
    this.engine?.undo();
  }

  clear(): void {
    this.engine?.clear();
  }
}
