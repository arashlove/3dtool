import type { Metadata } from 'next';
import { FutureLabPage } from '@/components/lab/FutureLabPage';

export const metadata: Metadata = { title: 'Future Lab — 3DTool' };

export default function FutureLab() {
  return <FutureLabPage />;
}
