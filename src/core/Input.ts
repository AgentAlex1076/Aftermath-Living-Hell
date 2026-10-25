export type Action =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'sprint'
  | 'dodge'
  | 'interact'
  | 'fire'
  | 'aim'
  | 'reload'
  | 'inventory'
  | 'build'
  | 'demolish'
  | 'debug'
  | 'help'
  | 'pause'
  | 'hotbar1'
  | 'hotbar2'
  | 'hotbar3'
  | 'hotbar4'
  | 'hotbar5'
  | 'hotbar6'
  | 'hotbar7';

const KEY_BINDINGS: Record<string, Action> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  Space: 'dodge',
  KeyE: 'interact',
  KeyR: 'reload',
  KeyI: 'inventory',
  Tab: 'inventory',
  KeyB: 'build',
  KeyX: 'demolish',
  F1: 'debug',
  Backquote: 'debug',
  KeyH: 'help',
  Escape: 'pause',
  Digit1: 'hotbar1',
  Digit2: 'hotbar2',
  Digit3: 'hotbar3',
  Digit4: 'hotbar4',
  Digit5: 'hotbar5',
  Digit6: 'hotbar6',
  Digit7: 'hotbar7',
};

const MOUSE_BINDINGS: Record<number, Action> = {
  0: 'fire',
  2: 'aim',
};

/** Actions that should still register while gameplay input is disabled (menus, pause). */
const ALWAYS_ON: ReadonlySet<Action> = new Set<Action>(['debug', 'pause', 'help', 'inventory']);

/**
 * Keyboard + mouse state. "Pressed" edges are tracked twice: once for the fixed simulation
 * step (cleared after each tick) and once per rendered frame (cleared after each frame), so
 * a quick tap is never lost or double-counted regardless of how many ticks run per frame.
 */
export class Input {
  enabled = false;

  /** Mouse position in normalized device coordinates (-1..1). */
  readonly mouseNdc = { x: 0, y: 0 };
  /** Mouse position in CSS pixels. */
  readonly mouseScreen = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  mouseInWindow = true;

  private readonly down = new Set<Action>();
  private readonly tickPressed = new Set<Action>();
  private readonly framePressed = new Set<Action>();
  private wheel = 0;

  private pointerLockWanted = false;
  private pointerLocked = false;
  private readonly mouseDelta = { x: 0, y: 0 };

  constructor(private readonly surface: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mouseleave', () => (this.mouseInWindow = false));
    document.addEventListener('mouseenter', () => (this.mouseInWindow = true));
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  get wantsPointerLock(): boolean {
    return this.pointerLockWanted;
  }

  requestPointerLock(): void {
    this.pointerLockWanted = true;
    if (this.surface && !this.pointerLocked) {
      try {
        const res = this.surface.requestPointerLock();
        if (res && 'catch' in res) {
          res.catch(() => {});
        }
      } catch {
        // Ignored if user hasn't interacted yet
      }
    }
  }

  exitPointerLock(): void {
    this.pointerLockWanted = false;
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  consumeMouseDelta(): { x: number; y: number } {
    const x = this.mouseDelta.x;
    const y = this.mouseDelta.y;
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    return { x, y };
  }

  isDown(action: Action): boolean {
    return this.allowed(action) && this.down.has(action);
  }

  /** Edge-triggered press, for the fixed simulation step. */
  wasPressed(action: Action): boolean {
    return this.allowed(action) && this.tickPressed.has(action);
  }

  /** Edge-triggered press, for per-frame consumers (UI, camera, debug). */
  wasPressedThisFrame(action: Action): boolean {
    return this.allowed(action) && this.framePressed.has(action);
  }

  axis(negative: Action, positive: Action): number {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0);
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return this.enabled ? w : 0;
  }

  endTick(): void {
    this.tickPressed.clear();
  }

  endFrame(): void {
    this.framePressed.clear();
  }

  private allowed(action: Action): boolean {
    return this.enabled || ALWAYS_ON.has(action);
  }

  private press(action: Action): void {
    if (!this.down.has(action)) {
      this.tickPressed.add(action);
      this.framePressed.add(action);
    }
    this.down.add(action);
  }

  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.surface;
    if (!this.pointerLocked && this.pointerLockWanted) {
      // User or browser released pointer lock
    }
  };

  private onPointerLockError = (): void => {
    this.pointerLocked = false;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const action = KEY_BINDINGS[e.code];
    if (!action) return;
    if (e.code === 'Space' || e.code === 'F1' || e.code.startsWith('Arrow') || e.code === 'Tab') {
      e.preventDefault();
    }
    if (e.repeat) return;
    this.press(action);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const action = KEY_BINDINGS[e.code];
    if (action) this.down.delete(action);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.pointerLocked) {
      this.mouseDelta.x += e.movementX || 0;
      this.mouseDelta.y += e.movementY || 0;
      this.mouseNdc.x = 0;
      this.mouseNdc.y = 0;
      this.mouseScreen.x = window.innerWidth / 2;
      this.mouseScreen.y = window.innerHeight / 2;
      this.mouseInWindow = true;
      return;
    }

    const rect = this.surface.getBoundingClientRect();
    this.mouseScreen.x = e.clientX;
    this.mouseScreen.y = e.clientY;
    this.mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.mouseInWindow = true;
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (this.pointerLockWanted && !this.pointerLocked && this.enabled && e.button === 0) {
      this.requestPointerLock();
    }
    const action = MOUSE_BINDINGS[e.button];
    if (action) this.press(action);
  };

  private onMouseUp = (e: MouseEvent): void => {
    const action = MOUSE_BINDINGS[e.button];
    if (action) this.down.delete(action);
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.enabled) return;
    e.preventDefault();
    this.wheel += e.deltaY;
  };

  private onBlur = (): void => {
    this.down.clear();
  };
}
