# Requirements Document

## Introduction

Flappy Kiro is a browser-based retro arcade game in the style of Flappy Bird. The player controls a white ghost character that must fly through an endless series of green pipes. Gravity continuously pulls the ghost downward, and player input (click, tap, or spacebar) makes the ghost flap upward. The player scores a point for each pair of pipes successfully passed. Colliding with a pipe, the ground, or the ceiling ends the game, after which the player can restart. The game features a sky-blue background with drifting clouds and a bordered game canvas, and uses the provided ghost sprite and sound effects.

## Glossary

- **Game**: The complete Flappy Kiro browser application, including rendering, input handling, physics, and scoring.
- **Ghost**: The player-controlled character sprite (rendered from `assets/ghosty.png`) subject to gravity and flap input.
- **Pipe_Pair**: A single obstacle consisting of a top pipe and a bottom pipe separated by a vertical gap through which the Ghost must pass.
- **Canvas**: The bordered rectangular play area in which the Game is rendered.
- **Ceiling**: The top boundary of the Canvas play area.
- **Ground**: The bottom boundary of the Canvas play area.
- **Flap**: A single upward impulse applied to the Ghost's vertical velocity in response to player input.
- **Score**: The running count of Pipe_Pairs the Ghost has successfully passed in the current game session.
- **Game_State**: The current mode of the Game, one of: Ready, Playing, or Game_Over.
- **Jump_Sound**: The audio effect (`assets/jump.wav`) played when the Ghost flaps.
- **Game_Over_Sound**: The audio effect (`assets/game_over.wav`) played when a collision ends the game.

## Requirements

### Requirement 1: Game Rendering and Visuals

**User Story:** As a player, I want a clearly presented retro game scene, so that I can see the Ghost, obstacles, and play area at a glance.

#### Acceptance Criteria

1. THE Game SHALL render the Canvas as a rectangular play area between 288 and 512 pixels wide and between 480 and 768 pixels tall, bounded on all four sides by a solid border between 1 and 4 pixels thick.
2. THE Game SHALL render the Canvas background in a solid sky-blue fill covering 100% of the play area, behind all other visual elements.
3. WHILE the Game_State is Ready, Playing, or Game_Over, THE Game SHALL render the Ghost using the sprite `assets/ghosty.png` at its current position within the Canvas bounds.
4. IF the sprite `assets/ghosty.png` fails to load, THEN THE Game SHALL render the Ghost as a solid-colored placeholder shape of equal dimensions at the Ghost position and continue rendering without halting.
5. THE Game SHALL render each Pipe_Pair as a green top pipe descending from the Ceiling and a green bottom pipe rising from the Ground, separated by a vertical gap between 100 and 200 pixels tall through which the Ghost can pass.
6. THE Game SHALL render drifting white clouds in a background layer positioned behind the Pipe_Pairs and the Ghost, such that clouds are never drawn over the Pipe_Pairs or the Ghost.
7. WHILE the Game_State is Playing, THE Game SHALL display the current Score as a non-negative integer on the Canvas, updating within 100 milliseconds of any Score change.

### Requirement 2: Gravity and Ghost Physics

**User Story:** As a player, I want the Ghost to fall under gravity, so that the game presents a continuous flying challenge.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, THE Game SHALL increase the Ghost's downward velocity each frame by a fixed gravity acceleration within the range of 0.1 to 1.0 Canvas pixels per frame per frame.
2. WHILE the Game_State is Playing, THE Game SHALL cap the Ghost's downward velocity at a maximum terminal velocity within the range of 5 to 20 Canvas pixels per frame.
3. WHILE the Game_State is Playing, THE Game SHALL update the Ghost's vertical position each frame by adding the Ghost's current vertical velocity, measured in Canvas pixels per frame, to the Ghost's current vertical position.
4. WHILE the Game_State is Ready, THE Game SHALL hold the Ghost at a fixed starting vertical position located at the vertical center of the Canvas, with zero vertical velocity.
5. IF the Ghost's vertical position reaches the Ceiling during the Playing state, THEN THE Game SHALL clamp the Ghost's vertical position to the Ceiling boundary and set the Ghost's vertical velocity to zero.

### Requirement 3: Flap Input

**User Story:** As a player, I want to flap the Ghost upward with a click, tap, or spacebar, so that I can control the Ghost's altitude.

#### Acceptance Criteria

1. WHEN the player presses the spacebar, THE Game SHALL apply a fixed upward impulse to the Ghost's vertical velocity.
2. WHEN the player clicks the mouse on the Canvas, THE Game SHALL apply a fixed upward impulse to the Ghost's vertical velocity.
3. WHEN the player taps the Canvas on a touch device, THE Game SHALL apply a fixed upward impulse to the Ghost's vertical velocity.
4. THE Game SHALL apply the same upward impulse magnitude for spacebar, mouse click, and touch tap inputs.
5. WHEN a Flap occurs WHILE the Game_State is Playing, THE Game SHALL play the Jump_Sound.
6. WHILE the Game_State is Ready, WHEN the player provides flap input, THE Game SHALL transition the Game_State to Playing and apply the first Flap.
7. WHILE the player holds the spacebar down, THE Game SHALL apply at most one Flap per key press until the key is released.
8. IF the player provides flap input WHILE the Game_State is Game_Over, THEN THE Game SHALL ignore the flap input and SHALL NOT change the Ghost's vertical velocity.

### Requirement 4: Pipe Generation and Scrolling

**User Story:** As a player, I want pipes to approach endlessly, so that the game provides an ongoing stream of obstacles.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, THE Game SHALL move each Pipe_Pair from right to left at a constant horizontal speed between 100 and 300 pixels per second.
2. WHILE the Game_State is Playing, THE Game SHALL generate a new Pipe_Pair at a fixed horizontal spacing between 200 and 400 pixels from the most recently generated Pipe_Pair, continuing indefinitely while the Game_State remains Playing.
3. WHEN a Pipe_Pair moves fully past the left edge of the Canvas such that its rightmost edge is at or beyond the left boundary of the Canvas, THE Game SHALL remove that Pipe_Pair from the active obstacle set.
4. WHEN a new Pipe_Pair is generated, THE Game SHALL position the vertical gap at a randomized center height such that the top of the gap is at least 50 pixels below the Ceiling and the bottom of the gap is at least 50 pixels above the Ground.
5. WHEN a new Pipe_Pair is generated, THE Game SHALL set the vertical gap height to a fixed value between 100 and 200 pixels.

### Requirement 5: Scoring

**User Story:** As a player, I want to earn points for passing pipes, so that I can measure my performance.

#### Acceptance Criteria

1. THE Game SHALL initialize the Score to zero at the start of each game session.
2. WHEN the Ghost's horizontal position passes the right edge of a Pipe_Pair while the Game_State is Playing and no collision has occurred, THE Game SHALL increase the Score by one within the same frame.
3. THE Game SHALL count each Pipe_Pair toward the Score at most one time per game session.
4. WHILE the Game_State is Playing, THE Game SHALL display the current Score value on the Canvas and update the displayed value within the same frame in which the Score changes.
5. WHEN the Game_State transitions to Game_Over, THE Game SHALL retain and display the final Score value until a new game session is started.
6. IF the Score reaches 999,999, THEN THE Game SHALL stop increasing the Score and retain the value at 999,999 for the remainder of the game session.

### Requirement 6: Collision Detection and Game Over

**User Story:** As a player, I want the game to end when the Ghost crashes, so that there is a clear fail condition.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, IF the Ghost's bounding box intersects the bounding box of any pipe of a Pipe_Pair by at least 1 pixel, THEN THE Game SHALL transition the Game_State to Game_Over.
2. WHILE the Game_State is Playing, IF the bottom edge of the Ghost's bounding box reaches or crosses the top of the Ground, THEN THE Game SHALL transition the Game_State to Game_Over.
3. WHILE the Game_State is Playing, IF the top edge of the Ghost's bounding box reaches or crosses the Ceiling, THEN THE Game SHALL transition the Game_State to Game_Over.
4. IF the Game_State is already Game_Over, THEN THE Game SHALL ignore further collision, Ground, and Ceiling triggers and SHALL NOT transition the Game_State again.
5. WHEN the Game_State transitions to Game_Over, THE Game SHALL play the Game_Over_Sound exactly once.
6. WHEN the Game_State transitions to Game_Over, THE Game SHALL stop moving all Pipe_Pairs.
7. WHEN the Game_State transitions to Game_Over, THE Game SHALL stop the vertical movement of the Ghost.
8. WHILE the Game_State is Game_Over, THE Game SHALL display a game over message indicating the game has ended within 1 second of the transition.
9. WHILE the Game_State is Game_Over, THE Game SHALL display the final Score accumulated during the Playing state.

### Requirement 7: Restart

**User Story:** As a player, I want to restart after a crash, so that I can play again without reloading the page.

#### Acceptance Criteria

1. WHILE the Game_State is Game_Over, THE Game SHALL display a restart control within the Canvas that is activatable by pointer click or by pressing the Flap input key.
2. WHEN the player activates the restart control, THE Game SHALL reset the Score to zero, reposition the Ghost to the starting position, remove all active Pipe_Pairs, and transition the Game_State to Ready within 100 milliseconds.
3. WHILE the Game_State is Ready after a restart, THE Game SHALL display the reset Score of zero and the Ghost at the starting position, and SHALL display no Pipe_Pairs.
4. IF the player activates the restart control WHILE the Game_State is Ready or Playing, THEN THE Game SHALL ignore the activation and preserve the current Game_State, Score, Ghost position, and active Pipe_Pairs.
