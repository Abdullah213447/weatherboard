/**
 * Placeholder shell. It exists so the first deploy proves the pipeline
 * (build, CI, hosting) before any feature work lands.
 */
export function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-3 px-6 py-16">
      <p className="text-text-muted text-sm font-medium tracking-wide uppercase">Scaffold</p>
      <h1 className="text-4xl font-semibold tracking-tight">WeatherBoard</h1>
      <p className="text-text-muted">
        The build pipeline is working. Search, forecast and offline support are on the way.
      </p>
    </main>
  );
}
