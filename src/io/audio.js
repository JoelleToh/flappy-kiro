// Audio manager (I/O layer — side-effecting, browser-only).
//
// Wraps the two sound effects (jump + game over) behind a tiny class whose
// `play` methods are guaranteed never to throw into the game loop. This matches
// the design "Audio Manager" and "Audio Load / Playback Failure" sections:
//
//   - load():        preload assets/jump.wav and assets/game_over.wav. Each sound
//                    tracks a per-sound `loaded` flag that flips to true only on a
//                    successful `canplaythrough`. A load error (missing file,
//                    decode failure, unreachable asset) leaves the flag false and
//                    never throws.
//   - playJump():    R3.5 — plays the jump sound, but only if it loaded. Every
//                    play() is wrapped in try/catch and the returned promise's
//                    rejection is swallowed, so a blocked/failed play is a silent
//                    no-op.
//   - playGameOver(): R6.5 — same guarded play for the game-over sound. "Exactly
//                    once per transition" is guaranteed structurally by the game
//                    controller, which calls this only on the single
//                    Playing -> Game_Over transition; this manager just plays
//                    whatever it is told, safely.
//
// This module references the browser global `Audio` constructor and therefore
// only runs in a browser, not under Node. It is verified by static/syntax review
// (node --check), not by importing it in a Node test. Audio failure degrades the
// game to silent play; it never blocks or crashes the loop.

// Default asset paths, relative to the served page (index.html at the project
// root). Kept local to the I/O layer since they are browser/asset concerns, not
// tunable gameplay config.
const DEFAULT_SOURCES = {
  jump: "assets/jump.wav",
  gameOver: "assets/game_over.wav",
};

export class AudioManager {
  /**
   * @param {{ jump?: string, gameOver?: string }} [sources] Optional override of
   *   the asset URLs (useful for tests or alternate asset locations). Any omitted
   *   key falls back to the default path.
   */
  constructor(sources = {}) {
    this._sources = { ...DEFAULT_SOURCES, ...sources };

    // Per-sound record: the Audio element (or null if construction failed) and a
    // `loaded` flag that is only true once the asset is safely playable.
    this._jump = { audio: null, loaded: false };
    this._gameOver = { audio: null, loaded: false };
  }

  /**
   * Preload both sounds. Tolerates any failure: a sound that cannot be
   * constructed or that errors while loading simply keeps `loaded === false`,
   * and this method never throws. Safe to call more than once.
   */
  load() {
    this._jump = this._loadSound(this._sources.jump);
    this._gameOver = this._loadSound(this._sources.gameOver);
  }

  /**
   * Play the jump sound (R3.5). No-op if the sound never loaded. Any error from
   * `play()` — including a rejected autoplay promise — is swallowed so this is
   * always a silent no-op on failure.
   */
  playJump() {
    this._safePlay(this._jump);
  }

  /**
   * Play the game-over sound (R6.5). Same guarded, silent-on-failure play as
   * `playJump`. The controller guarantees this is invoked exactly once per
   * Playing -> Game_Over transition.
   */
  playGameOver() {
    this._safePlay(this._gameOver);
  }

  /**
   * Construct an Audio element for `src` and wire load/error handlers that flip
   * the per-sound `loaded` flag. Never throws: if the `Audio` constructor is
   * unavailable or throws, this returns an unloaded record.
   *
   * @param {string} src Asset URL to preload.
   * @returns {{ audio: HTMLAudioElement | null, loaded: boolean }}
   */
  _loadSound(src) {
    const record = { audio: null, loaded: false };

    try {
      // `Audio` is a browser global; referenced here only, never under Node.
      const audio = new Audio(src);
      record.audio = audio;

      // `canplaythrough` means the asset is buffered enough to play start to
      // finish — only then do we consider it safely loaded.
      audio.addEventListener("canplaythrough", () => {
        record.loaded = true;
      });

      // Any load/decode error leaves `loaded` false; the sound stays a no-op.
      audio.addEventListener("error", () => {
        record.loaded = false;
      });

      // Hint the browser to begin fetching the asset.
      try {
        audio.load();
      } catch {
        // Some environments may not implement load(); ignore — the element may
        // still become playable, and worst case the sound stays silent.
      }
    } catch {
      // `Audio` unavailable or threw: degrade gracefully to a silent, unloaded
      // sound. Never propagate the error.
    }

    return record;
  }

  /**
   * Play a sound record if (and only if) it loaded, swallowing every failure.
   *
   * @param {{ audio: HTMLAudioElement | null, loaded: boolean }} record
   */
  _safePlay(record) {
    if (!record || !record.loaded || !record.audio) return;

    try {
      // Rewind so rapid repeats (e.g. fast flapping) always play from the start.
      record.audio.currentTime = 0;

      const result = record.audio.play();

      // `play()` returns a promise in modern browsers; a blocked autoplay or
      // interrupted playback rejects it. Swallow the rejection so it never
      // surfaces as an unhandled rejection or crashes the loop.
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
    } catch {
      // Synchronous play() failure (older browsers / odd states): silent no-op.
    }
  }
}

export default AudioManager;
