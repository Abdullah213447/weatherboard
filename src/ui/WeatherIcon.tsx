import { useId, type ReactNode } from 'react';
import type { Condition, ConditionKind } from '@/domain/weather';

/**
 * The app's own weather icons: one per condition, each with a day and a
 * night form. Line drawings in the current text colour, so they sit on any
 * sky tint. Movement is slow and slight, and applied with `motion-safe:`, so
 * with reduced motion requested nothing animates at all.
 *
 * Always decorative: the condition is given in words next to the icon.
 */

const CLOUD = 'M15 35h19a8 8 0 0 0 1.3-15.9A11 11 0 0 0 14.6 21.7 6.7 6.7 0 0 0 15 35z';
const SPIN = 'motion-safe:animate-icon-spin [transform-box:fill-box] origin-center';
const FALL = 'motion-safe:animate-icon-fall';

function Sun({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <>
      <circle cx={cx} cy={cy} r={r} />
      <g className={SPIN}>
        {rays.map((angle) => (
          <path
            key={angle}
            d={`M${String(cx)} ${String(cy - r - 3)}v-${String(r * 0.5)}`}
            transform={`rotate(${String(angle)} ${String(cx)} ${String(cy)})`}
          />
        ))}
      </g>
    </>
  );
}

function Moon({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <path
      transform={`translate(${String(x)} ${String(y)}) scale(${String(scale)})`}
      d="M9 0.5A9 9 0 1 0 18.5 11 7 7 0 0 1 9 0.5z"
    />
  );
}

/** The sun or moon looking out from behind the cloud, hidden where the cloud covers it. */
function Peek({ isDay, maskId }: { isDay: boolean; maskId: string }) {
  return (
    <g mask={`url(#${maskId})`} opacity="0.75">
      {isDay ? <Sun cx={33} cy={14} r={5} /> : <Moon x={27} y={5} scale={0.85} />}
    </g>
  );
}

/**
 * Overcast: a second cloud behind the first instead of the sun or moon. At
 * night a single star shows through, so the two forms still differ.
 */
function Overcast({ isDay, maskId }: { isDay: boolean; maskId: string }) {
  return (
    <>
      <g mask={`url(#${maskId})`} opacity="0.75">
        <path d={CLOUD} transform="translate(19.5 0.5) scale(0.6)" />
      </g>
      {!isDay && (
        <g className="motion-safe:animate-icon-twinkle">
          <path d="M9 9v4M7 11h4" strokeWidth="1.5" />
        </g>
      )}
    </>
  );
}

function Cloud({ dashed = false }: { dashed?: boolean }) {
  return (
    <path
      d={CLOUD}
      className="motion-safe:animate-icon-drift"
      strokeDasharray={dashed ? '3 4' : undefined}
    />
  );
}

/** Three things falling from the cloud, each starting a little after the last. */
function Falling({ children }: { children: (x: number, index: number) => ReactNode }) {
  return (
    <>
      {[18, 25, 32].map((x, index) => (
        <g key={x} className={FALL} style={{ animationDelay: `${String(index * 0.45)}s` }}>
          {children(x, index)}
        </g>
      ))}
    </>
  );
}

const drop = (x: number, length: number) => (
  <path d={`M${String(x)} 39l-${String(length * 0.4)} ${String(length)}`} />
);
const flake = (x: number) => (
  <path
    d={`M${String(x)} 39.5v5M${String(x - 2.2)} 40.8l4.4 2.5M${String(x + 2.2)} 40.8l-4.4 2.5`}
    strokeWidth="1.5"
  />
);

function below(kind: ConditionKind): ReactNode {
  switch (kind) {
    case 'drizzle':
      return <Falling>{(x) => drop(x, 3)}</Falling>;
    case 'rain':
      return <Falling>{(x) => drop(x, 6)}</Falling>;
    case 'freezing-rain':
      return <Falling>{(x, index) => (index === 1 ? flake(x) : drop(x, 5))}</Falling>;
    case 'snow':
      return <Falling>{(x) => flake(x)}</Falling>;
    case 'thunderstorm':
      return (
        <>
          <path d="M26 37l-4 6h5l-3 5" className="motion-safe:animate-icon-flash" />
          <g className={FALL}>{drop(17, 5)}</g>
          <g className={FALL} style={{ animationDelay: '0.6s' }}>
            {drop(34, 5)}
          </g>
        </>
      );
    case 'fog':
      return (
        <g className="motion-safe:animate-icon-drift">
          <path d="M11 40h26M15 45h18" />
        </g>
      );
    default:
      return null;
  }
}

type WeatherIconProps = {
  condition: Condition;
  /** Pixel size of the square. */
  size?: number;
  className?: string;
};

export function WeatherIcon({ condition, size = 48, className }: WeatherIconProps) {
  const maskId = useId();
  const { kind, isDay } = condition;

  let drawing: ReactNode;
  if (kind === 'clear') {
    drawing = isDay ? (
      <Sun cx={24} cy={24} r={8} />
    ) : (
      <>
        <Moon x={13} y={12} scale={1.15} />
        <g className="motion-safe:animate-icon-twinkle">
          <path d="M36 10v4M34 12h4" strokeWidth="1.5" />
        </g>
      </>
    );
  } else if (kind === 'unknown') {
    drawing = <Cloud dashed />;
  } else {
    // Cloud-based icons sit higher when something falls beneath them.
    const lifted = kind !== 'partly-cloudy' && kind !== 'cloudy';
    drawing = (
      <g transform={lifted ? 'translate(0 -5)' : undefined}>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="white" />
          <path d={CLOUD} fill="black" stroke="black" strokeWidth="5" />
        </mask>
        {kind === 'cloudy' ? (
          <Overcast isDay={isDay} maskId={maskId} />
        ) : (
          <Peek isDay={isDay} maskId={maskId} />
        )}
        <Cloud />
        {below(kind)}
      </g>
    );
  }

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      data-condition={`${kind}-${isDay ? 'day' : 'night'}`}
    >
      {drawing}
    </svg>
  );
}
