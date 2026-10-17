import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

/** BUILD3ds website, tagged so visits from 3DTool show up in analytics. */
export const BUILD3DS_URL = 'https://www.build3ds.com/?utm_source=3dtool&utm_medium=app&utm_campaign=premium&utm_content=footer';

/** The BUILD3ds mark (the site's cube icon) and wordmark, with the "3" in the brand blue. */
function Build3dsLogo() {
  return (
    <Box
      component="a"
      href={BUILD3DS_URL}
      target="_blank"
      rel="noopener"
      aria-label="BUILD3ds website"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, color: 'text.primary', textDecoration: 'none', flexShrink: 0 }}
    >
      <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#131313" />
        <path d="M32 14 48 23v18l-16 9-16-9V23z" fill="none" stroke="#f2efe9" strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M16 23l16 9 16-9M32 32v18" fill="none" stroke="#f2efe9" strokeWidth="3.5" strokeLinejoin="round" />
      </svg>
      <Box component="span" sx={{ fontWeight: 650, fontSize: 16, letterSpacing: '-0.03em' }}>
        BUILD
        <Box component="span" sx={{ color: '#2448e0' }}>
          3
        </Box>
        ds
      </Box>
    </Box>
  );
}

/** Slim footer on every page: "For premium features, visit BUILD3ds" with the logo and a button to the site. */
export function Build3dsFooter() {
  return (
    <Box
      component="footer"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 1.25,
        px: 2,
        py: 0.75,
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        flexShrink: 0,
      }}
    >
      <Typography variant="body2" color="text.secondary" noWrap>
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
          For premium features, visit
        </Box>
        <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
          Premium features:
        </Box>
      </Typography>
      <Build3dsLogo />
      <Button
        variant="contained"
        size="small"
        href={BUILD3DS_URL}
        target="_blank"
        rel="noopener"
        endIcon={<OpenInNewIcon fontSize="inherit" />}
        sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
      >
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
          Visit website
        </Box>
        <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
          Visit
        </Box>
      </Button>
    </Box>
  );
}
