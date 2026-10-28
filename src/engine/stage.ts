export type PointerFn = (x: number, y: number, id: number, e: PointerEvent) => void;

export interface PointerHandlers {
  down?: PointerFn;
  move?: PointerFn;
  up?: PointerFn;
}

export interface StageOptions {
  /** Transparent canvas. Opaque (default) composites faster. */
  alpha?: boolean;
  /** Cap on devicePixelRatio; 2 keeps iPads crisp without wasting fill-rate. */
  maxDpr?: number;
}

/**
 * A DPR-aware full-size canvas with a requestAnimationFrame loop.
 * Coordinates passed to games are CSS pixels; the context is pre-scaled.
 */
export class Stage {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;
  dpr = 1;

  private maxDpr: number;
  private raf = 0;
  private last = 0;
  private running = false;
  private update: ((dt: number, t: number) => void) | null = null;
  private resizeCbs: Array<(w: number, h: number) => void> = [];
  private ro: ResizeObserver;
  private rect: DOMRect;
  private listeners: Array<[string, EventListener]> = [];

  constructor(private host: HTMLElement, opts: StageOptions = {}) {
    this.maxDpr = opts.maxDpr ?? 2;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stage';
    host.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d', { alpha: opts.alpha ?? false });
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
    this.rect = this.canvas.getBoundingClientRect();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private resize() {
    const r = this.host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === this.width && h === this.height && dpr === this.dpr) return;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.rect = this.canvas.getBoundingClientRect();
    for (const cb of this.resizeCbs) cb(w, h);
  }

  onResize(cb: (w: number, h: number) => void) {
    this.resizeCbs.push(cb);
  }

  /** Resets the transform to plain CSS-pixel space. */
  resetTransform() {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  start(update: (dt: number, t: number) => void) {
    this.update = update;
    this.running = true;
    this.resume();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private resume() {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    // Clamp so a dropped frame or tab switch never makes things teleport.
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.update?.(dt, now / 1000);
    this.raf = requestAnimationFrame(this.frame);
  };

  private onVisibility = () => {
    if (document.hidden) cancelAnimationFrame(this.raf);
    else if (this.running) this.resume();
  };

  /** Local CSS-pixel position of a pointer event. */
  toLocal(e: PointerEvent) {
    return { x: e.clientX - this.rect.left, y: e.clientY - this.rect.top };
  }

  /** Multi-touch pointer input. Each finger gets its own id. */
  on(h: PointerHandlers) {
    const c = this.canvas;
    const add = (type: string, fn: (e: PointerEvent) => void) => {
      c.addEventListener(type, fn as EventListener);
      this.listeners.push([type, fn as EventListener]);
    };
    add('pointerdown', (e) => {
      e.preventDefault();
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.rect = c.getBoundingClientRect();
      h.down?.(e.clientX - this.rect.left, e.clientY - this.rect.top, e.pointerId, e);
    });
    if (h.move) {
      add('pointermove', (e) => h.move!(e.clientX - this.rect.left, e.clientY - this.rect.top, e.pointerId, e));
    }
    const up = (e: PointerEvent) => h.up?.(e.clientX - this.rect.left, e.clientY - this.rect.top, e.pointerId, e);
    add('pointerup', up);
    add('pointercancel', up);
  }

  destroy() {
    this.stop();
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const [t, fn] of this.listeners) this.canvas.removeEventListener(t, fn);
    this.canvas.width = this.canvas.height = 0; // frees GPU memory promptly on iOS
    this.canvas.remove();
  }
}
