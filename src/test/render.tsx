import { QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createQueryClient } from '@/app/queryClient';

/** Renders with the providers the app has, and a fresh query cache per test. */
export function renderWithProviders(ui: ReactNode): RenderResult {
  return render(<QueryClientProvider client={createQueryClient()}>{ui}</QueryClientProvider>);
}
