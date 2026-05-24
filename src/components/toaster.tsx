'use client';

import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from 'next-themes';

export function Toaster() {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === 'dark' ? 'dark' : 'light';
  return (
    <SonnerToaster
      position="top-right"
      theme={theme}
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'group toast-shadow',
        },
      }}
    />
  );
}
