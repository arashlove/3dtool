import type { Metadata } from 'next';
import { StudioPage } from '@/components/studio/StudioPage';

export const metadata: Metadata = { title: 'Shape Studio — 3DTool' };

export default function Studio() {
  return <StudioPage />;
}
