import React, { memo, useState, useEffect, useRef } from 'react';

// Maps the Tailwind bg class (from FINGER_COLORS) → CSS colour triple used for blocks
const FINGER_COLOR_HEX: Record<string, { bg: string; border: string; text: string }> = {
  'bg-rose-500':    { bg: '#3f0a14', border: '#f43f5e', text: '#fda4af' },
  'bg-orange-500':  { bg: '#3c1007', border: '#f97316', text: '#fdba74' },
  'bg-yellow-500':  { bg: '#3a1c07', border: '#eab308', text: '#fde047' },
  'bg-emerald-500': { bg: '#032711', border: '#10b981', text: '#6ee7b7' },
  'bg-slate-400':   { bg: '#1e293b', border: '#94a3b8', text: '#cbd5e1' },
  'bg-cyan-500':    { bg: '#062c3a', border: '#06b6d4', text: '#67e8f9' },
  'bg-blue-500':    { bg: '#172554', border: '#3b82f6', text: '#93c5fd' },
  'bg-indigo-500':  { bg: '#1e1b4b', border: '#6366f1', text: '#a5b4fc' },
  'bg-violet-500':  { bg: '#2e1065', border: '#8b5cf6', text: '#c4b5fd' },
};

const DEFAULT_COLORS = { bg: '#1e293b', border: '#64748b', text: '#cbd5e1' };

// Layout constants (px)
const CHAR_WIDTH = 72;   // width of one character slot (including gap)
const BLOCK_W    = 56;   // visible obstacle block width
const BLOCK_H    = 50;   // obstacle block height
const GROUND_H   = 44;   // ground strip height
const SCENE_H    = 200;  // total scene height
const TIPPSY_CX  = 170;  // Tippsy's centre X (fixed in the viewport)
// The active obstacle sits tight against Tippsy's right edge (centre + 28 half-width + 6 gap - 8 slot-margin = 204)
const ACTIVE_X   = TIPPSY_CX + 34; // = 204

export interface PlatformRunnerProps {
  content: string;
  inputIndex: number;
  errorShake: boolean;
  fingerMap: Map<string, { finger: string; color: string }>;
  stageId: number;
  subLevelId: number;
  onObstacleHit?: () => void;
}

const PlatformRunner: React.FC<PlatformRunnerProps> = memo(({
  content,
  inputIndex,
  errorShake,
  fingerMap,
  stageId,
  subLevelId,
  onObstacleHit,
}) => {
  // Set of obstacle indices currently mid-explosion animation
  const [exploding, setExploding] = useState<Set<number>>(new Set());

  // Streak: consecutive correct keystrokes without a mistake
  const [streak, setStreak] = useState(0);
  const prevIndexRef = useRef(inputIndex);
  const prevErrorShakeRef = useRef(false);

  useEffect(() => {
    if (inputIndex > prevIndexRef.current) {
      setStreak(s => s + (inputIndex - prevIndexRef.current));
    }
    prevIndexRef.current = inputIndex;
  }, [inputIndex]);

  useEffect(() => {
    if (errorShake && !prevErrorShakeRef.current) {
      setStreak(0);
    }
    prevErrorShakeRef.current = errorShake;
  }, [errorShake]);

  // 0 = normal, 1 = warming up (3+), 2 = turbo (7+), 3 = hyper (12+)
  const streakLevel = streak >= 12 ? 3 : streak >= 7 ? 2 : streak >= 3 ? 1 : 0;
  const limbSpeed = streakLevel === 3 ? '0.18s' : streakLevel === 2 ? '0.24s' : streakLevel === 1 ? '0.30s' : '0.38s';
  const eyeColor  = streakLevel === 3 ? '#ff9500' : streakLevel === 2 ? '#facc15' : '#00ffcc';
  const reactorColor = streakLevel >= 2 ? '#facc15' : '#10b981';

  useEffect(() => {
    if (inputIndex === 0) return;
    const idx = inputIndex - 1;
    setExploding(prev => new Set([...prev, idx]));
    const timer = setTimeout(() => {
      setExploding(prev => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [inputIndex]);

  // ── Autonomous scroll (RAF-driven) ──────────────────────────────────────
  // Stages 11+ use time-attack (no pause); earlier stages stop the tape when
  // the active obstacle reaches Tippsy — no time pressure for beginners.
  const isTimeAttack = stageId >= 11;
  // Speed ramps linearly from min (sublevel 1) to max (sublevel 10) within each stage tier.
  // Every time you enter a new stage (back to sublevel 1) the tape resets to the slow end.
  const t = (Math.max(1, Math.min(10, subLevelId)) - 1) / 9; // 0 → 1 across sublevels
  const [speedMin, speedMax] =
    stageId >= 11 ? [58, 105] :
    stageId >= 5  ? [40,  76] :
                    [28,  55];
  const scrollSpeed = Math.round(speedMin + t * (speedMax - speedMin)); // px/s

  const inputIndexRef    = useRef(inputIndex);
  const contentRef       = useRef(content);
  const onObstacleHitRef = useRef(onObstacleHit);
  const worldOffsetRef   = useRef(0);
  const lastTimeRef      = useRef<number | null>(null);
  const hitCalledRef     = useRef(false);
  const rafRef           = useRef<number>(0);
  const [displayTranslate, setDisplayTranslate] = useState(ACTIVE_X + CHAR_WIDTH);

  useEffect(() => { inputIndexRef.current = inputIndex; }, [inputIndex]);
  useEffect(() => { onObstacleHitRef.current = onObstacleHit; }, [onObstacleHit]);

  // Reset when a new level loads
  useEffect(() => {
    contentRef.current = content;
    worldOffsetRef.current = 0;
    lastTimeRef.current = null;
    hitCalledRef.current = false;
    setDisplayTranslate(ACTIVE_X + CHAR_WIDTH);
  }, [content]);

  // Main scroll loop — runs once per stage; dynamic values read via refs
  useEffect(() => {
    const tick = (ts: number) => {
      if (hitCalledRef.current) return;
      const dt = lastTimeRef.current === null ? 0 : Math.min((ts - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = ts;

      const idx  = inputIndexRef.current;

      // How many px ahead has the user typed beyond the current scroll position?
      // nominalOffset = worldOffset that would place the active obstacle exactly at ACTIVE_X
      const nominalOffset = (idx + 1) * CHAR_WIDTH;
      const typedAheadPx  = nominalOffset - worldOffsetRef.current;
      // Boost: proportional catch-up — 1.5× for every CHAR_WIDTH of lead, capped at 4× base speed
      const boost = typedAheadPx > 0
        ? Math.min((typedAheadPx / CHAR_WIDTH) * scrollSpeed * 1.5, scrollSpeed * 3)
        : 0;
      let   next = worldOffsetRef.current + dt * (scrollSpeed + boost);

      if (!isTimeAttack) {
        // Cap: tape pauses when the active obstacle reaches Tippsy
        next = Math.min(next, nominalOffset);
      } else {
        // Time-attack: obstacle crosses Tippsy's body → game over
        const obstacleScreenX = ACTIVE_X + (idx + 1) * CHAR_WIDTH - next;
        if (obstacleScreenX < TIPPSY_CX - 20 && idx < contentRef.current.length) {
          hitCalledRef.current = true;
          onObstacleHitRef.current?.();
          return;
        }
      }

      worldOffsetRef.current = next;
      setDisplayTranslate(ACTIVE_X + CHAR_WIDTH - next);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isTimeAttack, scrollSpeed]); // stageId-derived; stable per game session

  // Only render a window of obstacles for performance
  const startIdx = Math.max(0, inputIndex - 4);
  const endIdx   = Math.min(content.length - 1, inputIndex + 15);

  // Colour for the downward pointer arrow — matches the active obstacle
  const activeChar      = content[inputIndex];
  const activeFingerInfo = activeChar ? fingerMap.get(activeChar.toLowerCase()) : undefined;
  const activeColors    = (activeFingerInfo && FINGER_COLOR_HEX[activeFingerInfo.color]) ?? DEFAULT_COLORS;

  return (
    <div
      className="w-full relative overflow-hidden rounded-2xl mb-6 select-none"
      style={{
        height: SCENE_H,
        background: 'linear-gradient(to bottom, #060c1a 0%, #0c1836 55%, #102040 100%)',
      }}
    >
      <style>{`
        @keyframes pr-explode {
          0%   { transform: scale(1)   translateY(0);    opacity: 1;   }
          50%  { transform: scale(1.4) translateY(-10px); opacity: 0.7; }
          100% { transform: scale(0)   translateY(-18px); opacity: 0;   }
        }
        @keyframes pr-bob {
          0%, 100% { transform: translateY(0);   }
          50%      { transform: translateY(-4px); }
        }
        @keyframes pr-stumble {
          0%   { transform: rotate(0deg)   translateX(0);   }
          20%  { transform: rotate(-14deg) translateX(-7px); }
          55%  { transform: rotate(9deg)   translateX(5px);  }
          80%  { transform: rotate(-3deg)  translateX(-2px); }
          100% { transform: rotate(0deg)   translateX(0);   }
        }
        @keyframes pr-leg-l { 0%, 100% { transform: rotate(-20deg); } 50% { transform: rotate(20deg);  } }
        @keyframes pr-leg-r { 0%, 100% { transform: rotate(20deg);  } 50% { transform: rotate(-20deg); } }
        @keyframes pr-arm-l { 0%, 100% { transform: rotate(18deg);  } 50% { transform: rotate(-18deg); } }
        @keyframes pr-arm-r { 0%, 100% { transform: rotate(-18deg); } 50% { transform: rotate(18deg);  } }
        @keyframes pr-arrow-bounce {
          0%, 100% { transform: translateY(0);   }
          50%      { transform: translateY(3px); }
        }
        @keyframes pr-speedline {
          0%   { transform: translateX(0px);   opacity: 0.8; }
          100% { transform: translateX(-22px); opacity: 0;   }
        }
        @keyframes pr-streak-pop {
          0%   { transform: scale(0.6); opacity: 0; }
          60%  { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1);   opacity: 1; }
        }
      `}</style>

      {/* Decorative stars */}
      {[8, 22, 38, 55, 72, 85, 92].map((xPct, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${xPct}%`,
            top: `${8 + (i % 4) * 7}%`,
            width: i % 3 === 0 ? 2 : 1.5,
            height: i % 3 === 0 ? 2 : 1.5,
            borderRadius: '50%',
            background: 'white',
            opacity: 0.35 + (i % 3) * 0.15,
          }}
        />
      ))}

      {/* ── Scrolling obstacle world ─────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: GROUND_H,
          left: 0,
          transform: `translateX(${displayTranslate}px)`,
          willChange: 'transform',
          display: 'flex',
          alignItems: 'flex-end',
          pointerEvents: 'none',
          // Offset for windowed rendering: the flex row starts at startIdx, not 0,
          // so pad left to keep each block at its true index * CHAR_WIDTH position.
          paddingLeft: startIdx * CHAR_WIDTH,
        }}
      >
        {Array.from({ length: endIdx - startIdx + 1 }, (_, rel) => {
          const i    = startIdx + rel;
          const char = content[i];
          if (!char) return null;

          const isActive  = i === inputIndex;
          const isTyped   = i < inputIndex;
          const isBooming = exploding.has(i);

          // Typed-and-done → invisible gap (keeps correct slot spacing)
          if (isTyped && !isBooming) {
            return <div key={i} style={{ width: CHAR_WIDTH, flexShrink: 0 }} />;
          }

          const fi     = fingerMap.get(char.toLowerCase());
          const colors = (fi && FINGER_COLOR_HEX[fi.color]) ?? DEFAULT_COLORS;

          return (
            <div
              key={i}
              style={{
                width: CHAR_WIDTH,
                flexShrink: 0,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-end',
              }}
            >
              <div
                style={{
                  width: BLOCK_W,
                  height: BLOCK_H,
                  background: colors.bg,
                  border: `2px solid ${isActive && !isBooming ? colors.border : colors.border + '77'}`,
                  borderBottom: `4px solid ${colors.border}`,
                  borderRadius: '8px 8px 4px 4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: '"Courier New", monospace',
                  fontSize: isActive ? 22 : 17,
                  fontWeight: 'bold',
                  color: isActive ? colors.text : colors.text + 'aa',
                  boxShadow: isActive && !isBooming
                    ? `0 0 18px ${colors.border}55, 0 0 6px ${colors.border}33`
                    : undefined,
                  transform: isActive && !isBooming ? 'scale(1.12)' : 'scale(1)',
                  transformOrigin: 'bottom center',
                  transition: 'transform 0.1s ease, box-shadow 0.1s ease',
                  animation: isBooming ? 'pr-explode 0.35s ease-out forwards' : undefined,
                  outline: isActive && !isBooming ? `2px solid ${colors.border}44` : undefined,
                  outlineOffset: 4,
                }}
              >
                {char === ' ' ? '·' : char === '\n' ? '↵' : char}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Ground strip ─────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: GROUND_H,
          background: '#1e293b',
          borderTop: '3px solid #15803d',
        }}
      />

      {/* Grass tufts */}
      {[4, 12, 21, 30, 39, 48, 57, 66, 75, 84, 92].map((xPct, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            bottom: GROUND_H - 1,
            left: `${xPct}%`,
            width: 5,
            height: 7,
            background: '#16a34a',
            borderRadius: '50% 50% 0 0',
            opacity: 0.65,
          }}
        />
      ))}

      {/* ── Downward pointer above the active obstacle ───────────────────── */}
      {inputIndex < content.length && (
        <div
          style={{
            position: 'absolute',
            bottom: GROUND_H + BLOCK_H + 10,
            // Arrow follows the obstacle as it scrolls in
            left: displayTranslate + inputIndex * CHAR_WIDTH + (CHAR_WIDTH - BLOCK_W) / 2,
            width: 16,
            fontSize: 13,
            color: activeColors.border,
            textAlign: 'center',
            animation: 'pr-arrow-bounce 0.5s ease-in-out infinite',
            opacity: 0.85,
            pointerEvents: 'none',
          }}
        >
          ▼
        </div>
      )}

      {/* ── Streak badge ─────────────────────────────────────────────────── */}
      {streak >= 3 && (
        <div
          key={streak}
          style={{
            position: 'absolute',
            bottom: GROUND_H + 80,
            left: TIPPSY_CX - 22,
            background: streakLevel === 3 ? '#ff950022' : streakLevel === 2 ? '#facc1522' : '#ffffff18',
            border: `1.5px solid ${streakLevel === 3 ? '#ff9500' : streakLevel === 2 ? '#facc15' : '#94a3b8'}`,
            borderRadius: 10,
            padding: '2px 8px',
            fontSize: 11,
            fontWeight: 700,
            color: streakLevel === 3 ? '#ff9500' : streakLevel === 2 ? '#facc15' : '#cbd5e1',
            letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
            animation: 'pr-streak-pop 0.2s ease-out both',
            pointerEvents: 'none',
          }}
        >
          {streakLevel === 3 ? '🔥' : streakLevel === 2 ? '⚡' : '✨'} ×{streak}
        </div>
      )}

      {/* ── Speed lines (streak ≥ 5) ─────────────────────────────────────── */}
      {streakLevel >= 2 && !errorShake && (
        <div style={{ position: 'absolute', left: TIPPSY_CX - 58, bottom: GROUND_H + 22, pointerEvents: 'none' }}>
          {([{ y: 0, w: 26, delay: '0s' }, { y: 10, w: 18, delay: '0.08s' }, { y: 20, w: 22, delay: '0.16s' }]).map((l, i) => (
            <div key={i} style={{
              position: 'absolute',
              top: l.y,
              right: 0,
              width: l.w,
              height: 2,
              borderRadius: 1,
              background: streakLevel === 3 ? '#ff9500' : '#facc15',
              opacity: 0.7,
              animation: `pr-speedline 0.28s linear infinite`,
              animationDelay: l.delay,
            }} />
          ))}
        </div>
      )}

      {/* ── Tippsy runner ────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          left: TIPPSY_CX - 28,
          bottom: GROUND_H - 3,
          width: 56,
          pointerEvents: 'none',
        }}
      >
        <svg
          width="56"
          height="74"
          viewBox="0 0 56 74"
          style={{
            animation: errorShake
              ? 'pr-stumble 0.32s ease-in-out'
              : 'pr-bob 0.55s ease-in-out infinite',
          }}
        >
          {/* Left arm */}
          <rect
            x="1" y="22" width="11" height="5" rx="2.5" fill="#cbd5e1"
            style={{
              transformBox: 'fill-box',
              transformOrigin: 'right center',
              animation: errorShake ? 'none' : `pr-arm-l ${limbSpeed} ease-in-out infinite alternate`,
            }}
          />
          {/* Right arm */}
          <rect
            x="44" y="22" width="11" height="5" rx="2.5" fill="#cbd5e1"
            style={{
              transformBox: 'fill-box',
              transformOrigin: 'left center',
              animation: errorShake ? 'none' : `pr-arm-r ${limbSpeed} ease-in-out infinite alternate`,
            }}
          />
          {/* Body */}
          <rect x="13" y="18" width="30" height="30" rx="6" fill="#f1f5f9" stroke="#64748b" strokeWidth="1.5" />
          {/* Chest panel */}
          <rect x="19" y="26" width="18" height="14" rx="3" fill="#334155" />
          {/* Arc reactor */}
          <circle cx="28" cy="33" r="5.5" fill={reactorColor} opacity="0.85" />
          <circle cx="28" cy="33" r="2.5" fill="#ecfdf5" />
          {/* Head */}
          <rect x="15" y="2" width="26" height="18" rx="6" fill="#f1f5f9" stroke="#64748b" strokeWidth="1.5" />
          {/* Visor */}
          <rect x="17" y="5" width="22" height="12" rx="3" fill="#0f172a" />
          {/* Eyes */}
          <circle cx="22" cy="11" r="3" fill={eyeColor} opacity="0.9" />
          <circle cx="34" cy="11" r="3" fill={eyeColor} opacity="0.9" />
          {/* Antenna */}
          <line x1="36" y1="2" x2="43" y2="-5" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
          <circle cx="43" cy="-5" r="2" fill="#10b981" />
          {/* Left leg */}
          <rect
            x="16" y="47" width="11" height="24" rx="5" fill="#cbd5e1" stroke="#64748b" strokeWidth="1.5"
            style={{
              transformBox: 'fill-box',
              transformOrigin: 'center top',
              animation: errorShake ? 'none' : `pr-leg-l ${limbSpeed} ease-in-out infinite alternate`,
            }}
          />
          {/* Right leg */}
          <rect
            x="29" y="47" width="11" height="24" rx="5" fill="#cbd5e1" stroke="#64748b" strokeWidth="1.5"
            style={{
              transformBox: 'fill-box',
              transformOrigin: 'center top',
              animation: errorShake ? 'none' : `pr-leg-r ${limbSpeed} ease-in-out infinite alternate`,
            }}
          />
          {/* Thruster glow (decorative) */}
          <ellipse cx="28" cy="72" rx="9" ry="2.5" fill="#34d399" opacity="0.25" />
        </svg>
      </div>
    </div>
  );
});

PlatformRunner.displayName = 'PlatformRunner';
export default PlatformRunner;
