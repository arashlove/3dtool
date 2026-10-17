'use client';

import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { AR_LIMITS } from '@/ar/limits';
import type { ShareResponse } from '@/ar/server';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Builds the whole scene as one GLB, in metres. */
  makeGlb: () => Promise<ArrayBuffer>;
};

type State = { phase: 'working'; step: string } | { phase: 'ready'; share: ShareResponse } | { phase: 'error'; message: string };

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Exports the scene, uploads it as a short-lived share link, and shows a QR code to open it on a phone. */
export function ViewInArDialog(props: Props) {
  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="xs" fullWidth>
      {props.open && <ShareContent {...props} />}
    </Dialog>
  );
}

function ShareContent({ onClose, title, makeGlb }: Props) {
  const [state, setState] = useState<State>({ phase: 'working', step: 'Exporting the scene…' });
  const [copied, setCopied] = useState(false);
  // The scene is exported once per opening, even if the parent re-renders with new callbacks.
  const job = useRef({ makeGlb, title });

  useEffect(() => {
    const controller = new AbortController();
    const { makeGlb: buildGlb, title: sceneTitle } = job.current;
    (async () => {
      const glb = await buildGlb();
      if (controller.signal.aborted) return;
      if (glb.byteLength > AR_LIMITS.maxModelBytes) {
        throw new Error(`The scene is ${mb(glb.byteLength)}; AR links allow up to ${mb(AR_LIMITS.maxModelBytes)}. Hide or remove some objects.`);
      }
      setState({ phase: 'working', step: `Uploading ${mb(glb.byteLength)}…` });
      const res = await fetch(`/api/ar?title=${encodeURIComponent(sceneTitle.slice(0, AR_LIMITS.maxTitleLength))}`, {
        method: 'POST',
        headers: { 'Content-Type': 'model/gltf-binary' },
        body: glb,
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => null)) as (ShareResponse & { error?: string }) | null;
      if (!res.ok || !body?.url) throw new Error(body?.error ?? `Could not create the AR link (HTTP ${res.status}).`);
      setState({ phase: 'ready', share: body });
    })().catch((e: unknown) => {
      if (!controller.signal.aborted) setState({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
    });
    return () => controller.abort();
  }, []);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      /* clipboard blocked: the link is still visible to copy by hand */
    }
  };

  return (
    <>
      <DialogTitle>View in AR</DialogTitle>
      <DialogContent dividers>
        {state.phase === 'working' && (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 3, justifyContent: 'center' }}>
            <CircularProgress size={20} />
            <Typography variant="body2">{state.step}</Typography>
          </Stack>
        )}
        {state.phase === 'error' && <Alert severity="error">{state.message}</Alert>}
        {state.phase === 'ready' && (
          <Stack spacing={1.5} sx={{ alignItems: 'center' }}>
            <Typography variant="body2" sx={{ textAlign: 'center' }}>
              Scan with your phone&apos;s camera, then tap <strong>View in your room</strong>. The whole scene appears on the
              floor at its real size.
            </Typography>
            <Box
              component="img"
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(state.share.qrSvg)}`}
              alt={`QR code for ${state.share.url}`}
              sx={{ width: 220, height: 220, bgcolor: '#fff', p: 1, borderRadius: 1, border: 1, borderColor: 'divider' }}
            />
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', maxWidth: '100%' }}>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {state.share.url}
              </Typography>
              <Tooltip title={copied ? 'Copied' : 'Copy link'}>
                <IconButton size="small" aria-label="Copy link" onClick={() => void copy(state.share.url)}>
                  <ContentCopyIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
              {mb(state.share.bytes)} · link works until{' '}
              {new Date(state.share.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Android: Chrome
              with ARCore. iPhone: Safari (Quick Look).
            </Typography>
            {!state.share.secure && (
              <Alert severity="warning" sx={{ width: '100%' }}>
                This link uses plain HTTP, so Android phones show the 3D view but block the AR camera, and the phone must be
                on the same Wi-Fi. Use the deployed (HTTPS) app for AR.
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {state.phase === 'ready' && (
          <Button startIcon={<OpenInNewIcon />} href={`/ar/${state.share.id}`} target="_blank" rel="noopener">
            Open here
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </>
  );
}
