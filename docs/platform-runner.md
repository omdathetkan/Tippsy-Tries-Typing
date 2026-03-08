# Platform Runner Mode

An optional gamified display mode for the typing game, selectable in Settings.  
The classic scrolling tape is preserved as the default — this is a drop-in replacement for the `TypingTape` component inside `TypingGame`.

---

## Files changed / added

| File | Change |
|------|--------|
| `types.ts` | Added `GameDisplayMode = 'classic' \| 'platform'` |
| `contexts/SettingsContext.tsx` | Added `displayMode` / `setDisplayMode`, persisted to `localStorage` key `tippsy_display_mode` |
| `i18n.ts` | Added `settings.displayMode`, `displayModeHint`, `displayModeClassic`, `displayModeClassicDesc`, `displayModePlatform`, `displayModePlatformDesc` — all three languages (EN / DE / NL) |
| `pages/Settings.tsx` | Added "Display Style" section (between keyboard layout and sound) |
| `components/PlatformRunner.tsx` | **New component** — the entire platform game scene |
| `components/TypingGame.tsx` | Conditionally renders `PlatformRunner` or `TypingTape` based on `displayMode`; passes `stageId`, `subLevelId`, `onObstacleHit` |

---

## How it works

### Core mechanic — time-driven scroll

The world scrolls at a **constant base speed** via `requestAnimationFrame`, completely independent of typing.  
A character being displayed is called an **obstacle**. Typing the correct character **destroys** the obstacle (explosion animation) before it reaches Tippsy.

```
worldOffset  grows at  scrollSpeed px/s  (+ catch-up boost if user is ahead)
displayTranslate = ACTIVE_X + CHAR_WIDTH - worldOffset
```

Tippsy stands fixed at `TIPPSY_CX = 170 px`. The world moves left past her; she never moves horizontally.

The **active obstacle** (the character to type next) sits at `ACTIVE_X = 204 px` when `worldOffset` equals `inputIndex × CHAR_WIDTH`.  
Typing ahead of the scroll creates a gap to the right; typing slowly lets the obstacle arrive right as you type it.

### Catch-up boost

When the user has typed ahead, the scroll accelerates proportionally so the next obstacle stays visible:

```
typedAheadPx = (inputIndex + 1) × CHAR_WIDTH − worldOffset
boost        = clamp(typedAheadPx / CHAR_WIDTH × baseSpeed × 1.5,  0,  baseSpeed × 3)
effectiveSpeed = baseSpeed + boost
```

- 1 character ahead → roughly 2.5× base speed
- 2+ characters ahead → 4× base speed (cap)

### Stop mode vs Time-attack mode

| Mode | Stages | Behaviour when obstacle reaches Tippsy |
|------|--------|-----------------------------------------|
| **Stop** | 1–10 | Tape pauses; no time pressure. Suitable for beginners learning finger positions. |
| **Time-attack** | 11–15 | Obstacle continues past Tippsy. When it crosses `TIPPSY_CX − 20 px`, `onObstacleHit()` fires → `onRetry()` is called in `TypingGame`, ending the level like a mistake. |

### Speed ramp across sublevels

Speed increases linearly from sublevel 1 to sublevel 10 **within each stage tier**.  
Entering a new stage resets back to the slow end of the new tier.

| Stage tier | Sublevel 1 | Sublevel 10 |
|------------|-----------|------------|
| Stages 1–4 | 28 px/s | 55 px/s |
| Stages 5–10 | 40 px/s | 76 px/s |
| Stages 11–15 | 58 px/s | 105 px/s |

Formula: `scrollSpeed = speedMin + ((subLevelId − 1) / 9) × (speedMax − speedMin)`

### Approximate character arrival time at slow vs fast end

At 28 px/s with `CHAR_WIDTH = 72`: ~2.6 s/char (very forgiving for first-time learners)  
At 105 px/s: ~0.7 s/char (requires ~85 WPM to stay ahead comfortably)

---

## Streak system

Consecutive correct keystrokes increment a streak counter. Any mistake resets it to 0.

| Streak | Level | Badge | Speed lines | Tippsy eyes / reactor |
|--------|-------|-------|-------------|----------------------|
| 0–2 | 0 — normal | hidden | off | cyan `#00ffcc` / green `#10b981` |
| 3–6 | 1 — warm | ✨ ×N | off | cyan / green |
| 7–11 | 2 — turbo | ⚡ ×N | 3 yellow lines | gold `#facc15` eyes + reactor |
| 12+ | 3 — hyper | 🔥 ×N | 3 orange lines | orange `#ff9500` eyes + gold reactor |

Limb animation speed:
- Normal: 380 ms/cycle
- Warm: 300 ms/cycle
- Turbo: 240 ms/cycle
- Hyper: 180 ms/cycle

Speed lines are `pr-speedline` CSS keyframe divs (3 horizontal bars, 280 ms loop) positioned left of Tippsy. They disappear immediately when a mistake triggers the stumble animation.

---

## Layout constants (all in `PlatformRunner.tsx`)

```ts
CHAR_WIDTH = 72   // one character slot width (including gap)
BLOCK_W    = 56   // visible obstacle block width
BLOCK_H    = 50   // obstacle block height
GROUND_H   = 44   // ground strip height
SCENE_H    = 200  // total scene height
TIPPSY_CX  = 170  // Tippsy's fixed horizontal centre
ACTIVE_X   = 204  // x position where the active obstacle sits when in sync
```

---

## Props

```ts
interface PlatformRunnerProps {
  content: string;                              // full level text
  inputIndex: number;                           // how many chars typed so far
  errorShake: boolean;                          // true during a wrong-key shake
  fingerMap: Map<string, { finger: string; color: string }>;  // from TypingGame
  stageId: number;                              // 1–15; controls mode + speed tier
  subLevelId: number;                           // 1–10; controls speed within tier
  onObstacleHit?: () => void;                   // called when time-attack fails
}
```

---

## CSS animations defined inline (`<style>` tag inside component)

| Keyframe | Purpose |
|----------|---------|
| `pr-explode` | Block destroyed — scale up then shrink to nothing |
| `pr-bob` | Tippsy idle hover when not shaking |
| `pr-stumble` | Tippsy rotation + lateral bounce on wrong key |
| `pr-leg-l/r` | Alternating leg swing |
| `pr-arm-l/r` | Alternating arm swing |
| `pr-arrow-bounce` | Downward ▼ pointer gentle pulse |
| `pr-speedline` | Horizontal streak line shooting left |
| `pr-streak-pop` | Streak badge scale-in on update |

---

## Future extension ideas

- **Word-block mode for stages 11–15**: one large block per word instead of per character; whole word must be typed to destroy it.
- **Boss on sublevel 10**: boss health bar driven by correct keystrokes.
- **Coins / collectibles**: spawn in the cleared gap as the user types ahead.
- **Different obstacle shapes per finger**: low rocks (index), tall pillars (pinky), etc.
