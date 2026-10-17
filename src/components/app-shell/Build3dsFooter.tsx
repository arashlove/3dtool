import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

/** Early-access form on the BUILD3ds site, tagged so visits from 3DTool show up in analytics. */
export const BUILD3DS_URL =
  'https://www.build3ds.com/?utm_source=3dtool&utm_medium=app&utm_campaign=early_access&utm_content=footer#access';

/**
 * Slim footer on every page that points people who need more than procedural shapes to BUILD3ds:
 * accurate, true-to-scale 3D from real photos, editable by prompt and viewable in AR.
 */
export function Build3dsFooter() {
  return (
    <Box
      component="footer"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 0.75,
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        flexShrink: 0,
      }}
    >
      <AutoAwesomeIcon fontSize="small" color="primary" sx={{ display: { xs: 'none', sm: 'block' } }} />
      <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
        <Box component="strong" sx={{ fontWeight: 650, display: { xs: 'none', sm: 'inline' } }}>
          Need true-to-scale 3D of real products?
        </Box>
        <Box component="strong" sx={{ fontWeight: 650, display: { xs: 'inline', sm: 'none' } }}>
          Need accurate 3D?
        </Box>{' '}
        <Box component="span" sx={{ color: 'text.secondary', display: { xs: 'none', lg: 'inline' } }}>
          BUILD3ds makes accurate 3D from a few photos, editable by asking and viewable in your room.
        </Box>
      </Typography>
      <Button
        variant="contained"
        size="small"
        href={BUILD3DS_URL}
        target="_blank"
        rel="noopener"
        endIcon={<OpenInNewIcon fontSize="inherit" />}
        sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
      >
        Get early access
      </Button>
    </Box>
  );
}
