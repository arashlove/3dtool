'use client';

import ViewInArOutlinedIcon from '@mui/icons-material/ViewInArOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';

/** Self-contained build (it bundles its own three.js), the version ContentAI's AR page used. */
const MODEL_VIEWER_SRC = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@4.1.0/dist/model-viewer.min.js';

let loading: Promise<void> | null = null;

function loadModelViewer(): Promise<void> {
  if (customElements.get('model-viewer')) return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = MODEL_VIEWER_SRC;
      script.onerror = () => {
        loading = null;
        reject(new Error('Could not load the 3D viewer. Check the internet connection.'));
      };
      document.head.appendChild(script);
      void customElements.whenDefined('model-viewer').then(() => resolve());
    });
  }
  return loading;
}

type ModelViewerElement = HTMLElement & { canActivateAR?: boolean };
type State = { phase: 'loading' } | { phase: 'ready'; title: string; expiresAt: number | null } | { phase: 'missing' } | { phase: 'error'; message: string };

/**
 * Shows a shared scene with Google's model-viewer. "View in your room" places the whole scene on the
 * floor at its real size: WebXR on Android Chrome, Scene Viewer as the Android fallback, and Quick
 * Look on iPhone (model-viewer converts the GLB to USDZ in the browser).
 */
export function ArViewer({ id }: { id: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [arAvailable, setArAvailable] = useState<boolean | null>(null);
  const src = `/api/ar/${encodeURIComponent(id)}`;

  useEffect(() => {
    let cancelled = false;
    let viewer: ModelViewerElement | null = null;
    (async () => {
      const head = await fetch(src, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
      if (cancelled) return;
      if (!head || head.status === 404) return setState({ phase: 'missing' });
      if (!head.ok) return setState({ phase: 'error', message: `The model could not be loaded (HTTP ${head.status}).` });
      const title = decodeURIComponent(head.headers.get('X-Model-Title') ?? '3D scene');
      const expiresAt = Number(head.headers.get('X-Expires-At')) || null;

      await loadModelViewer();
      if (cancelled || !container.current) return;
      viewer = document.createElement('model-viewer') as ModelViewerElement;
      const attributes: Record<string, string> = {
        src,
        alt: `3D view of ${title}`,
        ar: '',
        'ar-modes': 'webxr scene-viewer quick-look',
        'ar-placement': 'floor',
        'ar-scale': 'fixed',
        'camera-controls': '',
        'touch-action': 'pan-y',
        'shadow-intensity': '1',
        'environment-image': 'neutral',
      };
      for (const [name, value] of Object.entries(attributes)) viewer.setAttribute(name, value);
      Object.assign(viewer.style, { width: '100%', height: '100%', background: '#f4f4f2' });

      const button = document.createElement('button');
      button.slot = 'ar-button';
      button.textContent = 'View in your room';
      Object.assign(button.style, {
        position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)', padding: '12px 22px',
        border: 'none', borderRadius: '24px', background: '#2448e0', color: '#fff', font: '600 15px system-ui, sans-serif',
        boxShadow: '0 2px 8px rgba(0,0,0,.25)', cursor: 'pointer',
      });
      viewer.appendChild(button);
      viewer.addEventListener('load', () => setArAvailable(Boolean(viewer?.canActivateAR)));
      viewer.addEventListener('error', () => setState({ phase: 'error', message: 'The 3D model could not be displayed.' }));
      container.current.replaceChildren(viewer);
      setState({ phase: 'ready', title, expiresAt });
    })().catch((e: unknown) => {
      if (!cancelled) setState({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
    });
    return () => {
      cancelled = true;
      viewer?.remove();
    };
  }, [src]);

  if (state.phase === 'missing') {
    return (
      <Box sx={{ p: 3, maxWidth: 520, mx: 'auto' }}>
        <Alert severity="info">This AR link has expired or does not exist. Create a new one with View in AR in Shape Studio or Future Lab.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', display: 'flex', alignItems: 'center', gap: 1 }}>
        <ViewInArOutlinedIcon fontSize="small" color="primary" />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap>
            {state.phase === 'ready' ? state.title : 'View in AR'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Real size, placed on the floor
            {state.phase === 'ready' && state.expiresAt
              ? ` · link works until ${new Date(state.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : ''}
          </Typography>
        </Box>
      </Box>
      {state.phase === 'error' && (
        <Alert severity="error" sx={{ m: 2 }}>
          {state.message}
        </Alert>
      )}
      {arAvailable === false && (
        <Alert severity="info" sx={{ m: 1 }}>
          AR is not available in this browser. Open this link on a phone: Chrome on an ARCore Android phone (the page must
          use HTTPS) or Safari on an iPhone. You can still rotate and zoom the model here.
        </Alert>
      )}
      <Box sx={{ flex: 1, minHeight: 320, position: 'relative' }}>
        {/* model-viewer is mounted here directly, so this box has no React children. */}
        <Box ref={container} sx={{ position: 'absolute', inset: 0 }} />
        {state.phase === 'loading' && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={28} />
          </Box>
        )}
      </Box>
    </Box>
  );
}
