'use client';

import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: 'light',
    primary: { main: '#3D5AFE' },
    secondary: { main: '#00897B' },
    background: { default: '#F4F5F7', paper: '#FFFFFF' },
    divider: 'rgba(15, 23, 42, 0.09)',
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
    h6: { fontWeight: 650, letterSpacing: '-0.01em' },
    subtitle2: { fontWeight: 650 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { defaultProps: { elevation: 0 } },
    MuiTooltip: { defaultProps: { arrow: true } },
    MuiTextField: { defaultProps: { size: 'small' } },
  },
});
