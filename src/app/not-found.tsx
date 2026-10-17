import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
export default function NotFound() {
  return (
    <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 3, textAlign: 'center' }}>
      <div>
        <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 650 }}>
          Page not found
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          This page does not exist. The studio is where the 3D tools live.
        </Typography>
        <Button href="/studio" variant="contained">
          Open Shape Studio
        </Button>
      </div>
    </Box>
  );
}
