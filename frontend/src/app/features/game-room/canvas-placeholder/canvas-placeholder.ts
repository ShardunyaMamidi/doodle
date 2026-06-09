import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-canvas-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="canvas-ph">
      <span>🎨 Canvas — coming in Sprint 3</span>
    </div>
  `,
  styles: [
    `
      .canvas-ph {
        aspect-ratio: 4 / 3;
        width: 100%;
        max-width: 40rem;
        margin: 0 auto;
        display: grid;
        place-items: center;
        border: 2px dashed #bbb;
        border-radius: 0.5rem;
        background: #fafafa;
        color: #999;
      }
    `,
  ],
})
export class CanvasPlaceholder {}
