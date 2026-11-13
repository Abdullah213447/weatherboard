import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import '@/styles/index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root is missing from index.html.');
}

async function resolveView(): Promise<ReactNode> {
  // The UI preview is a development tool. `import.meta.env.DEV` is replaced
  // with `false` in production builds, so this branch and the module it
  // imports are removed from the bundle entirely.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'ui') {
    const { UiPreview } = await import('@/dev/UiPreview');
    return <UiPreview />;
  }
  return <App />;
}

const root = createRoot(container);
void resolveView().then((view) => {
  root.render(<StrictMode>{view}</StrictMode>);
});
