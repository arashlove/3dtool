import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ArViewer } from '@/components/ar/ArViewer';

export const metadata: Metadata = { title: 'View in AR — 3DTool' };

export default function ArPage({ params }: PageProps<'/ar/[id]'>) {
  return (
    <Suspense
      fallback={
        <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <CircularProgress size={28} />
        </Box>
      }
    >
      {params.then(({ id }) => (
        <ArViewer id={id} />
      ))}
    </Suspense>
  );
}
