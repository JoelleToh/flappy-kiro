// Renderer (I/O layer — side-effecting Canvas 2D drawing).
//
// The renderer is the single place that turns an immutable GameState snapshot
// into pixels on the canvas. It owns no game state of its own beyond the sprite
// load flag; every frame it is handed the authoritative state by the controller
// and draws it. Keeping all drawing here (and nothing else) preserves the strict
// logic/I-O separation from the design document.
//
// Draw order (strict back-to-front — design "Renderer" section, R1.6 + R1.2):
//   1. Sky-blue background fill, 100% of the play area        (R1.2)
//   2. Clouds — behind pipes and ghost                        (R1.6)
//   3. Pipe pairs — green top + bottom rectangles             (R1.5)
//   4. Ghost sprite, or an equal-size placeholder on failure  (R1.3, R1.4)
//   5. HUD: score; plus game-over message + restart control
//      when in Game_Over                                      (R1.7, R5.4, R6.8, R7.1)
//   6. Canvas border, 1-4px solid                             (R1.1)
//
// Data shapes consumed (from design "Data Models"):
//   state   : { mode, ghost, pipes, clouds, score, gameOverSoundPlayed }
//   ghost   : { x, y, vy, width, height }
//   pipe    : { x, width, gapTop, gapBottom, scored }
//   cloud   : { x, y, speed, scale }
//
// Sprite handling (design "Error Handling > Sprite Load Failure", R1.4):
//   assets/ghosty.png is loaded via an Image with onload/onerror. `spriteLoaded`
//   starts false and flips true only on a successful load; the renderer never
//   waits on it, so a slow or failed load never halts the frame — it just draws
//   a solid placeholder rectangle of identical dimensions instead.

import { config as defaultConfig } from "../constants.js";

// Visual constants kept local to the renderer. These are pure presentation
// choices (colors, fonts, sprite path) and deliberately not part of the shared
// gameplay `config`, which only holds tunable game-logic values.
const COLORS = {
  sky: "#4ec0ca", // retro sky-blue background (R1.2)
  cloud: "#ffffff", // white drifting clouds (R1.6)
  pipe: "#5cb85c", // green pipes (R1.5)
  pipeOutline: "#3a7d3a",
  ghostPlaceholder: "#f5f5f5", // near-white placeholder when sprite missing (R1.4)
  ghostOutline: "#cccccc",
  border: "#2c3e50", // solid canvas border (R1.1)
  hudText: "#ffffff",
  hudShadow: "rgba(0, 0, 0, 0.45)",
  overlay: "rgba(0, 0, 0, 0.45)",
  restartFill: "#ffffff",
  restartText: "#2c3e50",
};

const CLOUD_BASE_WIDTH = 64; // matches logic/clouds.js reference width
const CLOUD_BASE_HEIGHT = 36;
const SPRITE_PATH = "assets/ghosty.png";

/**
 * Create a renderer bound to a canvas 2D context.
 *
 * The sprite begins loading immediately on construction but never blocks
 * rendering: `render(state)` can be called before the image resolves and will
 * simply draw the placeholder until `spriteLoaded` becomes true (R1.4).
 *
 * @param {CanvasRenderingContext2D} ctx The 2D drawing context to render into.
 * @param {object} [config] Centralized gameplay config; defaults to constants.js.
 * @param {object} [options] Optional injectables (used by tests).
 * @param {() => any} [options.createImage] Factory returning an Image-like object
 *   with `src`, `onload`, `onerror`. Defaults to `new Image()` in the browser.
 * @returns {Renderer}
 */
export function createRenderer(ctx, config = defaultConfig, options = {}) {
  return new Renderer(ctx, config, options);
}

export class Renderer {
  constructor(ctx, config = defaultConfig, options = {}) {
    this.ctx = ctx;
    this.config = config;

    // Sprite state. Defaults to false and only flips true on a successful load
    // (R1.4). Until then — and forever, if the load fails — the ghost is drawn
    // as a placeholder.
    this.spriteLoaded = false;
    this.sprite = null;

    this._loadSprite(options.createImage);
  }

  /**
   * Kick off loading of assets/ghosty.png. On success, flip `spriteLoaded`; on
   * error, leave it false so the placeholder is used. Guarded so that a missing
   * Image constructor (e.g. in a non-browser test) degrades gracefully.
   * @param {(() => any) | undefined} createImage
   * @private
   */
  _loadSprite(createImage) {
    try {
      const makeImage =
        createImage ||
        (typeof Image !== "undefined" ? () => new Image() : null);
      if (!makeImage) return; // no Image available; stay in placeholder mode

      const img = makeImage();
      img.onload = () => {
        this.spriteLoaded = true;
      };
      img.onerror = () => {
        this.spriteLoaded = false;
      };
      img.src = SPRITE_PATH;
      this.sprite = img;
    } catch {
      // Any failure constructing/loading the image leaves placeholder mode on.
      this.spriteLoaded = false;
    }
  }

  /**
   * Draw one full frame from the given GameState, strictly back-to-front.
   *
   * @param {{
   *   mode: "Ready"|"Playing"|"Game_Over",
   *   ghost: { x:number, y:number, vy:number, width:number, height:number },
   *   pipes: Array<{x:number,width:number,gapTop:number,gapBottom:number,scored:boolean}>,
   *   clouds: Array<{x:number,y:number,speed:number,scale:number}>,
   *   score: number,
   * }} state The authoritative game state to render.
   */
  render(state) {
    const { ctx } = this;
    const { width, height } = this.config.canvas;

    // 1. Background — solid sky-blue over 100% of the play area (R1.2), drawn
    //    first so every other layer sits on top of it.
    this._drawBackground(width, height);

    // 2. Clouds — background layer, strictly before pipes and ghost so clouds
    //    are never drawn over them (R1.6).
    this._drawClouds(state.clouds);

    // 3. Pipes — green top + bottom rectangles bounding the gap (R1.5).
    this._drawPipes(state.pipes);

    // 4. Ghost — sprite if loaded, else an equal-size placeholder (R1.3, R1.4).
    this._drawGhost(state.ghost);

    // 5. HUD — score always; game-over message + restart control in Game_Over
    //    (R1.7, R5.4, R6.8, R7.1).
    this._drawHud(state);

    // 6. Border — final solid stroke framing the play area (R1.1).
    this._drawBorder(width, height);
  }

  /**
   * Hit-test bounds of the restart control, so the input manager can route a
   * pointer click inside it to a restart intent (R7.1). The control is only
   * shown/active in Game_Over; this returns its fixed on-canvas rectangle.
   * @returns {{ x:number, y:number, width:number, height:number }}
   */
  getRestartControlBounds() {
    return this._restartControlBounds();
  }

  // --- Layer helpers -------------------------------------------------------

  /** @private */
  _drawBackground(width, height) {
    const { ctx } = this;
    ctx.fillStyle = COLORS.sky;
    ctx.fillRect(0, 0, width, height);
  }

  /** @private */
  _drawClouds(clouds) {
    if (!Array.isArray(clouds)) return;
    const { ctx } = this;
    ctx.fillStyle = COLORS.cloud;
    for (const cloud of clouds) {
      const scale = typeof cloud.scale === "number" ? cloud.scale : 1;
      const w = CLOUD_BASE_WIDTH * scale;
      const h = CLOUD_BASE_HEIGHT * scale;
      // A soft puff: an ellipse when available, otherwise a plain rounded blob
      // approximated with a rectangle. Clouds are decorative, so exact shape is
      // not asserted — only that they are drawn (and before pipes/ghost).
      if (typeof ctx.ellipse === "function") {
        ctx.beginPath();
        ctx.ellipse(cloud.x + w / 2, cloud.y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(cloud.x, cloud.y, w, h);
      }
    }
  }

  /** @private */
  _drawPipes(pipes) {
    if (!Array.isArray(pipes)) return;
    const { ctx } = this;
    const ceilingY = this.config.ceiling.y;
    const groundY = this.config.ground.y;

    for (const pipe of pipes) {
      const topHeight = pipe.gapTop - ceilingY;
      const bottomHeight = groundY - pipe.gapBottom;

      ctx.fillStyle = COLORS.pipe;
      // Top pipe: descends from the ceiling to the gap top.
      if (topHeight > 0) {
        ctx.fillRect(pipe.x, ceilingY, pipe.width, topHeight);
      }
      // Bottom pipe: rises from the gap bottom to the ground.
      if (bottomHeight > 0) {
        ctx.fillRect(pipe.x, pipe.gapBottom, pipe.width, bottomHeight);
      }

      // Thin outline for a touch of retro depth.
      ctx.strokeStyle = COLORS.pipeOutline;
      ctx.lineWidth = 2;
      if (topHeight > 0) {
        ctx.strokeRect(pipe.x, ceilingY, pipe.width, topHeight);
      }
      if (bottomHeight > 0) {
        ctx.strokeRect(pipe.x, pipe.gapBottom, pipe.width, bottomHeight);
      }
    }
  }

  /** @private */
  _drawGhost(ghost) {
    if (!ghost) return;
    const { ctx } = this;
    const { x, y, width, height } = ghost;

    if (this.spriteLoaded && this.sprite) {
      // Draw the loaded sprite at the ghost's bounding box (R1.3).
      ctx.drawImage(this.sprite, x, y, width, height);
    } else {
      // Equal-size placeholder of identical dimensions so gameplay geometry is
      // unchanged whether or not the sprite loaded (R1.4).
      ctx.fillStyle = COLORS.ghostPlaceholder;
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = COLORS.ghostOutline;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);
    }
  }

  /** @private */
  _drawHud(state) {
    const { ctx } = this;
    const { width } = this.config.canvas;
    const score = Number.isFinite(state.score) ? Math.max(0, Math.floor(state.score)) : 0;

    // Score — always displayed as a non-negative integer (R1.7, R5.4). Shown in
    // every mode; in Game_Over this is the retained final score (R6.9).
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "bold 32px monospace";
    this._drawTextWithShadow(String(score), width / 2, 24);

    if (state.mode === "Game_Over") {
      this._drawGameOver(state, score);
    }
  }

  /** @private */
  _drawGameOver(state, score) {
    const { ctx } = this;
    const { width, height } = this.config.canvas;

    // Dim overlay so the message and control read clearly over the frozen scene.
    ctx.fillStyle = COLORS.overlay;
    ctx.fillRect(0, 0, width, height);

    // Game-over message indicating the game has ended (R6.8).
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 36px monospace";
    this._drawTextWithShadow("Game Over", width / 2, height / 2 - 60);

    // Final score accumulated during Playing, retained here (R6.9, R5.5).
    ctx.font = "bold 24px monospace";
    this._drawTextWithShadow(`Score: ${score}`, width / 2, height / 2 - 20);

    // Restart control — a tappable/clickable button within the canvas (R7.1).
    const btn = this._restartControlBounds();
    ctx.fillStyle = COLORS.restartFill;
    ctx.fillRect(btn.x, btn.y, btn.width, btn.height);
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(btn.x, btn.y, btn.width, btn.height);

    ctx.fillStyle = COLORS.restartText;
    ctx.font = "bold 20px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Restart", btn.x + btn.width / 2, btn.y + btn.height / 2);
  }

  /**
   * Fixed on-canvas rectangle for the restart button. Centered horizontally and
   * placed below the game-over message. Shared by the drawing code and the
   * input-manager hit test (via getRestartControlBounds).
   * @private
   */
  _restartControlBounds() {
    const { width, height } = this.config.canvas;
    const btnWidth = 160;
    const btnHeight = 48;
    return {
      x: Math.round((width - btnWidth) / 2),
      y: Math.round(height / 2 + 20),
      width: btnWidth,
      height: btnHeight,
    };
  }

  /** @private */
  _drawTextWithShadow(text, x, y) {
    const { ctx } = this;
    const fill = ctx.fillStyle;
    ctx.fillStyle = COLORS.hudShadow;
    ctx.fillText(text, x + 2, y + 2);
    ctx.fillStyle = COLORS.hudText;
    ctx.fillText(text, x, y);
    ctx.fillStyle = fill;
  }

  /** @private */
  _drawBorder(width, height) {
    const { ctx } = this;
    const border = this.config.canvas.border; // 1-4px per R1.1
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = border;
    // Inset by half the border width so the full stroke stays inside the canvas.
    const half = border / 2;
    ctx.strokeRect(half, half, width - border, height - border);
  }
}

export default createRenderer;
