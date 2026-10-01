// Input manager — I/O layer (side-effecting: binds DOM events).
//
// Converts raw keyboard / mouse / touch events into two high-level intents:
//   - flap    : spacebar, mouse click/mousedown on the canvas, or touch tap
//   - restart : pointer activation of the restart control while in Game_Over
//
// All three input kinds route to the SAME flap callback, so the upstream game
// controller applies an identical impulse magnitude regardless of source (R3.4).
// Restart is a distinct intent raised only when a pointer activates the restart
// control while the game is in Game_Over (R7.1); the controller decides whether
// to honor it per the current state.
//
// The edge-trigger logic (leading-edge detection for the held spacebar, R3.7) is
// extracted as a PURE, DOM-free helper (`edgeTrigger`) so it can be property-tested
// in isolation (design Property 6).

/**
 * Pure leading-edge detector for a held key.
 *
 * Given the previous held state and the current held state, report the new held
 * state and whether this transition should FIRE an action. An action fires only
 * on the rising edge: the key was not held and is now held. While the key stays
 * held, no further fire occurs; it only becomes available again after the key is
 * released (nowHeld === false) and pressed again.
 *
 * This models R3.7: "WHILE the player holds the spacebar down, THE Game SHALL
 * apply at most one Flap per key press until the key is released."
 *
 * No DOM, no mutation — importable and testable under plain Node.
 *
 * @param {boolean} prevHeld previous held state (true if the key was down)
 * @param {boolean} nowHeld  current held state (true if the key is down now)
 * @returns {{held: boolean, fired: boolean}} new held state and whether to fire
 */
export function edgeTrigger(prevHeld, nowHeld) {
  const held = Boolean(nowHeld);
  const fired = held && !prevHeld; // rising edge only
  return { held, fired };
}

/**
 * Hit-test a point against an axis-aligned rectangular control.
 *
 * Pure helper used to decide whether a pointer activation landed on the restart
 * control (R7.1). A null/undefined rect means "no control present", returning
 * false. The test is inclusive on the top-left and exclusive on the bottom-right
 * edges, which is the usual convention for pixel rectangles.
 *
 * @param {number} px pointer x (canvas-relative px)
 * @param {number} py pointer y (canvas-relative px)
 * @param {{x:number,y:number,width:number,height:number}|null|undefined} rect
 * @returns {boolean} true if the point lies within the rect
 */
export function pointInRect(px, py, rect) {
  if (!rect) return false;
  return (
    px >= rect.x &&
    px < rect.x + rect.width &&
    py >= rect.y &&
    py < rect.y + rect.height
  );
}

/**
 * Bind keyboard, mouse, and touch input on the given canvas and route events to
 * flap / restart intents via injected callbacks.
 *
 * The game wires in the callbacks (per design): `onFlap` is called for every
 * flap-producing input; `onRestart` is called when a pointer activates the
 * restart control while the game reports Game_Over.
 *
 * The manager does not know the game state directly. Instead it queries two
 * injected accessors each time it needs them:
 *   - `isGameOver()` returns whether the game is currently in Game_Over.
 *   - `getRestartRect()` returns the current restart-control rectangle (in
 *     canvas-relative coordinates) or null when no control is shown.
 * This keeps the input layer decoupled from the controller's internals.
 *
 * @param {object} deps
 * @param {EventTarget & {getBoundingClientRect?: Function}} deps.canvas the canvas element
 * @param {() => void} deps.onFlap called when a flap intent occurs
 * @param {() => void} [deps.onRestart] called when a restart intent occurs
 * @param {() => boolean} [deps.isGameOver] returns true while in Game_Over
 * @param {() => ({x:number,y:number,width:number,height:number}|null)} [deps.getRestartRect]
 *        returns the restart-control rect (canvas-relative) or null
 * @param {EventTarget} [deps.keyTarget] where to listen for keyboard events
 *        (defaults to the canvas's owner document, else the canvas itself)
 * @returns {{dispose: () => void}} handle with a `dispose()` to unbind all listeners
 */
export function createInputManager({
  canvas,
  onFlap,
  onRestart,
  isGameOver,
  getRestartRect,
  keyTarget,
} = {}) {
  if (!canvas) {
    throw new Error("createInputManager requires a canvas");
  }
  const flap = typeof onFlap === "function" ? onFlap : () => {};
  const restart = typeof onRestart === "function" ? onRestart : () => {};
  const gameOver = typeof isGameOver === "function" ? isGameOver : () => false;
  const restartRect =
    typeof getRestartRect === "function" ? getRestartRect : () => null;

  // Resolve where keyboard events are observed. Keyboard focus usually sits on
  // the document rather than the canvas, so default to the owning document.
  const kbTarget =
    keyTarget ||
    (canvas.ownerDocument ? canvas.ownerDocument : canvas);

  // Leading-edge state for the spacebar (R3.7). Persisted across keydown repeats.
  let spaceHeld = false;

  // --- Pointer / touch routing ---------------------------------------------
  // A pointer activation either restarts (Game_Over + inside the restart
  // control) or flaps (everywhere else). Returns true if a restart was raised.
  function routePointer(clientX, clientY) {
    if (gameOver()) {
      const rect = restartRect();
      if (rect) {
        // Translate client coordinates into canvas-relative space.
        const bounds =
          typeof canvas.getBoundingClientRect === "function"
            ? canvas.getBoundingClientRect()
            : { left: 0, top: 0 };
        const px = clientX - bounds.left;
        const py = clientY - bounds.top;
        if (pointInRect(px, py, rect)) {
          restart();
          return true;
        }
      }
      // In Game_Over but outside the restart control: no flap (R3.8 — the
      // controller ignores flap in Game_Over anyway, so we simply route a flap
      // intent and let the controller decide). Keep behavior consistent with
      // keyboard: route the flap intent.
    }
    flap();
    return false;
  }

  // --- Handlers -------------------------------------------------------------
  function handleKeyDown(e) {
    if (e.code !== "Space" && e.key !== " " && e.keyCode !== 32) return;
    // Prevent the page from scrolling on space.
    if (typeof e.preventDefault === "function") e.preventDefault();
    const { held, fired } = edgeTrigger(spaceHeld, true);
    spaceHeld = held;
    if (fired) flap();
  }

  function handleKeyUp(e) {
    if (e.code !== "Space" && e.key !== " " && e.keyCode !== 32) return;
    const { held } = edgeTrigger(spaceHeld, false);
    spaceHeld = held; // released -> false, re-arming the next press
  }

  function handleMouseDown(e) {
    routePointer(e.clientX, e.clientY);
  }

  function handleTouchStart(e) {
    // Suppress the synthetic mouse events a tap would otherwise generate so a
    // single tap does not produce a double flap (design: Invalid/Edge Inputs).
    if (typeof e.preventDefault === "function") e.preventDefault();
    const touch =
      e.touches && e.touches.length ? e.touches[0] : e.changedTouches && e.changedTouches[0];
    const clientX = touch ? touch.clientX : 0;
    const clientY = touch ? touch.clientY : 0;
    routePointer(clientX, clientY);
  }

  // --- Bind -----------------------------------------------------------------
  kbTarget.addEventListener("keydown", handleKeyDown);
  kbTarget.addEventListener("keyup", handleKeyUp);
  // Use mousedown (not click) for a snappy flap; touchstart is non-passive so
  // preventDefault takes effect.
  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("touchstart", handleTouchStart, { passive: false });

  function dispose() {
    kbTarget.removeEventListener("keydown", handleKeyDown);
    kbTarget.removeEventListener("keyup", handleKeyUp);
    canvas.removeEventListener("mousedown", handleMouseDown);
    canvas.removeEventListener("touchstart", handleTouchStart);
  }

  return { dispose };
}

export default createInputManager;
