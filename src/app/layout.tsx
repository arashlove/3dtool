import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import type { Metadata, Viewport } from 'next';
import { AppNav } from '@/components/app-shell/AppNav';
import { AppTheme } from '@/components/app-shell/AppTheme';
import { Build3dsFooter } from '@/components/app-shell/Build3dsFooter';
import './globals.css';

export const metadata: Metadata = {
  title: '3DTool — Shape Studio',
  description:
    'Open-source studio that turns natural language into validated, editable procedural Three.js objects using a Hugging Face model running in your browser.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>
        <AppRouterCacheProvider>
          <AppTheme>
            <div className="app-root">
              <AppNav />
              <main className="app-main">{children}</main>
              <Build3dsFooter />
            </div>
          </AppTheme>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
