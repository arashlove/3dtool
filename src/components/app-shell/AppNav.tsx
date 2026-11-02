'use client';

import ViewInArRoundedIcon from '@mui/icons-material/ViewInArRounded';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';

const NAV = [
  { href: '/studio', label: 'Shape Studio' },
  { href: '/future', label: 'Future Lab' },
];

function SectionTabs({ current }: { current: string | false }) {
  return (
    <Tabs value={current} aria-label="Sections" sx={{ minHeight: 52, '& .MuiTab-root': { minHeight: 52 } }}>
      {NAV.map((n) => (
        <Tab key={n.href} value={n.href} label={n.label} component={Link} href={n.href} />
      ))}
    </Tabs>
  );
}

function CurrentSectionTabs() {
  const pathname = usePathname();
  return <SectionTabs current={NAV.find((n) => pathname?.startsWith(n.href))?.href ?? false} />;
}

export function AppNav() {
  return (
    <AppBar position="static" color="inherit" sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Toolbar variant="dense" sx={{ gap: 2, minHeight: 52 }}>
        <Box
          component={Link}
          href="/studio"
          sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.primary', textDecoration: 'none' }}
        >
          <ViewInArRoundedIcon color="primary" />
          <Typography variant="h6" component="span" sx={{ fontSize: 18 }}>
            3DTool
          </Typography>
        </Box>
        {/* On dynamic routes such as /ar/[id] the pathname is request data, so it must sit inside Suspense. */}
        <Suspense fallback={<SectionTabs current={false} />}>
          <CurrentSectionTabs />
        </Suspense>
      </Toolbar>
    </AppBar>
  );
}
