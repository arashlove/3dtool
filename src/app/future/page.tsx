import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Future Lab — 3DTool' };

export default function FutureLabPage() {
  return (
    <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 3 }}>
      <Paper variant="outlined" sx={{ p: { xs: 4, sm: 6 }, maxWidth: 520, textAlign: 'center' }}>
        <ScienceOutlinedIcon color="primary" sx={{ fontSize: 48, mb: 2 }} />
        <Typography variant="h5" component="h1" gutterBottom sx={{ fontWeight: 650 }}>
          Coming soon — Module 2
        </Typography>
        <Typography color="text.secondary">Another 3D workflow is planned for this space.</Typography>
      </Paper>
    </Box>
  );
}
