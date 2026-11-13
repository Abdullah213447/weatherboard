/**
 * Dev-only review page: every token, primitive and state, in both themes.
 * Open it at /?preview=ui while running `npm run dev`. main.tsx loads this
 * module only when import.meta.env.DEV is true, so it is absent from
 * production builds.
 */
import { useState, type ReactNode } from 'react';
import { DashboardGrid } from '@/app/DashboardGrid';
import { Panel } from '@/app/Panel';
import { CONDITION_KINDS, type Condition } from '@/domain/weather';
import { ThemeControl } from '@/features/prefs/ThemeControl';
import { FirstRunEmptyState } from '@/features/weather/FirstRunEmptyState';
import { skyScope } from '@/features/weather/skyTint';
import { contrastRatio } from '@/lib/contrast';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { IconButton } from '@/ui/IconButton';
import { InlineAlert } from '@/ui/InlineAlert';
import { LiveRegion } from '@/ui/LiveRegion';
import { Skeleton } from '@/ui/Skeleton';
import { WeatherIcon } from '@/ui/WeatherIcon';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-subtle text-xs font-medium tracking-wide uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** Prints the live contrast ratio between two tokens, read from the enclosing theme scope. */
function Ratio({ fg, bg }: { fg: string; bg: string }) {
  return (
    <span
      className="text-xs"
      ref={(element) => {
        if (!element) return;
        const style = getComputedStyle(element);
        const ratio = contrastRatio(
          style.getPropertyValue(`--wb-${fg}`),
          style.getPropertyValue(`--wb-${bg}`),
        );
        element.textContent = `${ratio.toFixed(1)}:1`;
      }}
    />
  );
}

const surfaces = ['canvas', 'surface', 'raised', 'hover'] as const;
const textTokens = ['ink', 'muted', 'subtle', 'accent'] as const;

const skyConditions: Condition[] = CONDITION_KINDS.flatMap((kind) => [
  { kind, isDay: true },
  { kind, isDay: false },
]);

function Specimens() {
  return (
    <div className="flex flex-col gap-10">
      <Section title="Type scale">
        <p className="text-display">24°</p>
        <p className="text-xl font-semibold">xl · Section heading 1,234</p>
        <p className="text-lg font-semibold">lg · Dialog title 1,234</p>
        <p className="text-base">base · Body text and inputs 1,234</p>
        <p className="text-muted text-sm">sm · Secondary text and labels 1,234</p>
        <p className="text-subtle text-xs">xs · Captions and attribution 1,234</p>
      </Section>

      <Section title="Surfaces and text (ratio against each surface)">
        <div className="grid grid-cols-2 gap-2">
          {surfaces.map((surface) => (
            <div
              key={surface}
              className="border-line flex flex-col gap-1 rounded-md border p-3"
              style={{ backgroundColor: `var(--wb-${surface})` }}
            >
              <span className="text-xs font-medium">{surface}</span>
              {textTokens.map((token) => (
                <span
                  key={token}
                  className="flex justify-between gap-2 text-sm"
                  style={{ color: `var(--wb-${token})` }}
                >
                  {token} <Ratio fg={token} bg={surface} />
                </span>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Sky tints (current-conditions card only; night cards are always dark; ratio is muted text on the tint)">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {skyConditions.map((condition) => {
            const key = `sky-${condition.kind}-${condition.isDay ? 'day' : 'night'}`;
            const scope = skyScope(condition);
            return (
              <div
                key={key}
                data-theme={scope.theme}
                className="border-line text-ink flex flex-col rounded-md border p-3"
                style={{ backgroundColor: scope.background }}
              >
                <span className="text-xl font-medium">24°</span>
                <span className="text-muted text-xs">
                  {condition.kind} · {condition.isDay ? 'day' : 'night'}
                </span>
                <span className="text-muted">
                  <Ratio fg="muted" bg={key} />
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Weather icons (every condition, day then night)">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {skyConditions.map((condition) => (
            <div
              key={`${condition.kind}-${String(condition.isDay)}`}
              className="border-line bg-surface flex flex-col items-center gap-1 rounded-md border p-2"
            >
              <WeatherIcon condition={condition} size={48} />
              <span className="text-muted text-center text-xs">
                {condition.kind}
                <br />
                {condition.isDay ? 'day' : 'night'}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Button">
        {(['primary', 'secondary', 'ghost', 'danger'] as const).map((variant) => (
          <div key={variant} className="flex flex-wrap items-center gap-2">
            <Button variant={variant}>{variant}</Button>
            <Button variant={variant} disabled>
              Disabled
            </Button>
            <Button variant={variant} loading>
              Saving
            </Button>
            <Button variant={variant} size="sm">
              Small
            </Button>
          </div>
        ))}
      </Section>

      <Section title="IconButton">
        <div className="flex flex-wrap items-center gap-2">
          <IconButton label="Add to favourites" icon="star" />
          <IconButton label="Set a reminder" icon="bell" variant="secondary" />
          <IconButton label="Close" icon="close" disabled />
        </div>
      </Section>

      <Section title="Skeleton (loading)">
        <div
          className="border-line bg-surface flex flex-col gap-3 rounded-lg border p-4"
          aria-busy="true"
        >
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-16 w-40" />
          <div className="flex gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      </Section>

      <Section title="InlineAlert">
        <InlineAlert tone="info" title="Showing saved weather for Karachi">
          You are offline. This was last updated at 09:12.
        </InlineAlert>
        <InlineAlert tone="success" title="Reminder set for 07:30">
          You will get a notification each morning, even with the app closed.
        </InlineAlert>
        <InlineAlert tone="warning" title="You already have 5 favourites">
          Remove one to save another city.
        </InlineAlert>
        <InlineAlert
          tone="danger"
          title="Could not load the forecast"
          action={{ label: 'Try again', onClick: () => undefined }}
        >
          The weather service did not respond in time. Check your connection and try again.
        </InlineAlert>
      </Section>

      <Section title="First-run empty state (enabled, then disabled)">
        <div className="border-line bg-surface rounded-lg border px-4">
          <FirstRunEmptyState onSelect={() => undefined} />
        </div>
        <div className="border-line bg-surface rounded-lg border px-4">
          <FirstRunEmptyState />
        </div>
      </Section>
    </div>
  );
}

function DialogDemo() {
  const [open, setOpen] = useState<'none' | 'destructive' | 'neutral'>('none');
  const [announcement, setAnnouncement] = useState('');
  const close = (next: boolean) => {
    if (!next) setOpen('none');
  };

  return (
    <Section title="ConfirmDialog and live region (uses the page theme)">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            setOpen('destructive');
          }}
        >
          Open destructive confirm
        </Button>
        <Button
          onClick={() => {
            setOpen('neutral');
          }}
        >
          Open neutral confirm
        </Button>
        <span className="text-muted text-sm">Announced: {announcement || 'nothing yet'}</span>
      </div>
      <LiveRegion message={announcement} />
      <ConfirmDialog
        open={open === 'destructive'}
        onOpenChange={close}
        title="Remove Karachi from favourites?"
        description="It will disappear from your quick-access list. You can add it again at any time."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          setAnnouncement('Karachi removed from favourites');
        }}
      />
      <ConfirmDialog
        open={open === 'neutral'}
        onOpenChange={close}
        title="Turn on the daily reminder?"
        description="Your browser will ask for permission to show notifications."
        confirmLabel="Continue"
        onConfirm={() => {
          setAnnouncement('Reminder flow started');
        }}
      />
    </Section>
  );
}

export function UiPreview() {
  return (
    <div className="bg-canvas text-ink min-h-dvh">
      <header className="border-line bg-surface flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 md:px-6">
        <div>
          <h1 className="text-base font-semibold">UI preview</h1>
          <p className="text-muted text-sm">
            Development only.{' '}
            <a href="/" className="underline underline-offset-2">
              Back to the app
            </a>
          </p>
        </div>
        <ThemeControl />
      </header>

      <div className="grid xl:grid-cols-2">
        {(['light', 'dark'] as const).map((theme) => (
          <div key={theme} data-theme={theme} className="bg-canvas text-ink p-4 md:p-6">
            <h2 className="mb-6 text-xl font-semibold capitalize">{theme}</h2>
            <Specimens />
          </div>
        ))}
      </div>

      <div className="border-line flex flex-col gap-10 border-t p-4 md:p-6">
        <DialogDemo />
        <Section title="Dashboard grid, loading state (resize to 375 / 768 / 1280)">
          <DashboardGrid
            quick={
              <Panel title="Favourites">
                <Skeleton className="h-6 w-full" />
              </Panel>
            }
            primary={{
              current: (
                <Panel title="Current conditions">
                  <Skeleton className="h-24 w-44" />
                  <Skeleton className="mt-4 h-4 w-56" />
                </Panel>
              ),
              forecast: (
                <Panel title="5-day forecast">
                  <div className="flex flex-col gap-3">
                    {[0, 1, 2, 3, 4].map((day) => (
                      <Skeleton key={day} className="h-6 w-full" />
                    ))}
                  </div>
                </Panel>
              ),
            }}
            secondary={
              <>
                <Panel title="Daily reminder">
                  <Skeleton className="h-6 w-full" />
                </Panel>
              </>
            }
          />
        </Section>
      </div>
    </div>
  );
}
