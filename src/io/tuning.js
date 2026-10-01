// Dev-only live tuning panel (I/O layer).
//
// A toggleable, in-browser debug GUI built with lil-gui. It exposes range-clamped
// sliders for the key tunables so a developer can playtest values live without a
// page reload. It reads initial values FROM the live `config` object and writes
// every change BACK into that same object, so the running game picks up new values
// on the next frame (design "Configuration and Tuning" > "Live tuning panel").
//
// Design constraints honored here:
//   - Range-clamped sliders. Each slider min/max matches the valid range the
//     requirements enforce (design "tuning table"), so tuning can never push a
//     value out of spec: gravity (R2.1), terminalVelocity (R2.2),
//     flapImpulse (R3), pipe speedPxPerSec (R4.1), spacing (R4.2),
//     gapHeight (R1.5/R4.5), pipe width.
//   - Hidden by default; toggled with the backtick (`) key. It is purely a dev
//     aid and has no effect on gameplay logic when closed.
//   - Lives in the I/O layer, not the pure logic layer. The pure modules keep
//     receiving `config` as an injected parameter, so correctness properties and
//     their tests are unaffected by the panel's presence or absence.
//
// Graceful degradation (design "Tuning Panel Load Failure"): lil-gui is loaded
// at runtime from a CDN via a DYNAMIC import() inside a try/catch. If the import
// or any panel construction step fails (CDN unreachable, offline, non-browser
// environment), the function resolves to "no panel" and NEVER throws into the
// game loop. A dynamic import also keeps `node --check` passing offline, since a
// static import of a CDN URL cannot be resolved by the checker.
//
// Requirements touched: 1.1, 1.5, 2.1, 2.2, 4.1, 4.2, 4.5.

// CDN ES module URL for lil-gui. Pinned to the 0.19 line (design "Dev tuning")
// and served as a native ES module via jsDelivr's "+esm" endpoint.
const LIL_GUI_CDN = "https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm";

// Slider min/max bounds, straight from the design's tuning table. Keeping them
// here (rather than hard-coded inline) documents the spec requirement each bound
// enforces and makes the clamping easy to audit against requirements.
const BOUNDS = {
  gravity: { min: 0.1, max: 1.0, step: 0.01 }, // R2.1
  terminalVelocity: { min: 5, max: 20, step: 0.5 }, // R2.2
  flapImpulse: { min: 1, max: 20, step: 0.5 }, // R3 (upward impulse magnitude)
  speedPxPerSec: { min: 100, max: 300, step: 1 }, // R4.1
  spacing: { min: 200, max: 400, step: 1 }, // R4.2
  gapHeight: { min: 100, max: 200, step: 1 }, // R1.5 / R4.5
  width: { min: 10, max: 120, step: 1 }, // pipe width
};

/**
 * Build the dev tuning panel and wire it to the live `config` object.
 *
 * This is intentionally resilient: every failure mode (missing config, no
 * browser DOM, failed CDN import, lil-gui API change) resolves to "no panel"
 * instead of throwing. Callers may still wrap the call in their own try/catch,
 * but they do not have to — this function never rejects.
 *
 * @param {object} config - The live config object (mutated in place as sliders move).
 * @returns {Promise<{ gui: object, destroy: () => void } | null>}
 *          A handle when the panel was created, or `null` when it degraded to no panel.
 */
export async function createTuningPanel(config) {
  try {
    // A browser environment with a DOM is required to attach the panel and to
    // listen for the toggle key. In Node (tests, `node --check`) we no-op.
    if (
      typeof config !== "object" ||
      config === null ||
      typeof document === "undefined" ||
      typeof window === "undefined"
    ) {
      return null;
    }

    // Dynamic import so an unreachable CDN (offline) fails here, inside the
    // try/catch, rather than at module load — and so `node --check` can verify
    // this file without resolving the remote URL.
    const mod = await import(/* @vite-ignore */ LIL_GUI_CDN);
    const GUI = mod?.GUI ?? mod?.default;
    if (typeof GUI !== "function") {
      return null;
    }

    const gui = new GUI({ title: "Flappy Kiro — Tuning (dev)" });

    // Defensive accessors: if a config section is missing, fall back to an empty
    // object so adding a slider cannot throw. Sliders bound to a missing field
    // simply have nothing meaningful to drive, but construction still succeeds.
    const physics = config.physics ?? (config.physics = {});
    const pipes = config.pipes ?? (config.pipes = {});

    const physicsFolder = gui.addFolder("Physics");
    physicsFolder
      .add(physics, "gravity", BOUNDS.gravity.min, BOUNDS.gravity.max, BOUNDS.gravity.step)
      .name("gravity");
    physicsFolder
      .add(
        physics,
        "terminalVelocity",
        BOUNDS.terminalVelocity.min,
        BOUNDS.terminalVelocity.max,
        BOUNDS.terminalVelocity.step,
      )
      .name("terminal velocity");
    physicsFolder
      .add(physics, "flapImpulse", BOUNDS.flapImpulse.min, BOUNDS.flapImpulse.max, BOUNDS.flapImpulse.step)
      .name("flap impulse");

    const pipesFolder = gui.addFolder("Pipes");
    pipesFolder
      .add(pipes, "speedPxPerSec", BOUNDS.speedPxPerSec.min, BOUNDS.speedPxPerSec.max, BOUNDS.speedPxPerSec.step)
      .name("speed (px/s)");
    pipesFolder
      .add(pipes, "spacing", BOUNDS.spacing.min, BOUNDS.spacing.max, BOUNDS.spacing.step)
      .name("spacing");
    pipesFolder
      .add(pipes, "gapHeight", BOUNDS.gapHeight.min, BOUNDS.gapHeight.max, BOUNDS.gapHeight.step)
      .name("gap height");
    pipesFolder
      .add(pipes, "width", BOUNDS.width.min, BOUNDS.width.max, BOUNDS.width.step)
      .name("width");

    // Hidden by default — the panel is a dev aid and must not affect the default
    // play experience. lil-gui exposes `hide()`/`show()`; guard the calls so an
    // API shape change can't throw.
    let visible = false;
    const setVisible = (next) => {
      visible = next;
      try {
        if (visible) gui.show?.();
        else gui.hide?.();
      } catch {
        /* ignore: visibility is cosmetic, never fatal */
      }
    };
    setVisible(false);

    // Toggle with the backtick (`) key. Use the physical "Backquote" code so the
    // toggle is layout-independent, and also accept the "`" key value.
    const onKeyDown = (ev) => {
      if (ev.code === "Backquote" || ev.key === "`") {
        ev.preventDefault?.();
        setVisible(!visible);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    const destroy = () => {
      try {
        window.removeEventListener("keydown", onKeyDown);
      } catch {
        /* ignore */
      }
      try {
        gui.destroy?.();
      } catch {
        /* ignore */
      }
    };

    return { gui, destroy };
  } catch (err) {
    // Any failure (CDN unreachable, offline, non-browser, lil-gui API change)
    // degrades to "no panel". We never rethrow — the game loop must keep running.
    try {
      console.warn("Flappy Kiro: tuning panel unavailable (continuing without it).", err);
    } catch {
      /* ignore: console may be absent */
    }
    return null;
  }
}

export default createTuningPanel;
