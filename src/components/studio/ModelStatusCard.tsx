'use client';

import MemoryOutlinedIcon from '@mui/icons-material/MemoryOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ResolvedModel } from '@/ai/model-config';
import { useAiStore } from '@/state/ai-store';

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(0)} MB`;

type Props = {
  resolved: ResolvedModel | { error: string };
  isLoaded: boolean;
  onLoad: () => void;
  onOpenSettings: () => void;
};

export function ModelStatusCard({ resolved, isLoaded, onLoad, onOpenSettings }: Props) {
  const status = useAiStore((s) => s.status);
  const progress = useAiStore((s) => s.progress);
  const lastLoadMs = useAiStore((s) => s.lastLoadMs);
  const threads = useAiStore((s) => s.threads);
  const hasToken = useAiStore((s) => Boolean(s.token));
  const invalid = 'error' in resolved;
  const loading = status === 'loading';

  let stateLabel = 'Not loaded';
  let stateColor: 'default' | 'success' | 'warning' | 'info' = 'default';
  if (loading) {
    stateLabel = 'Loading…';
    stateColor = 'info';
  } else if (status === 'generating') {
    stateLabel = 'Thinking…';
    stateColor = 'info';
  } else if (isLoaded) {
    stateLabel = 'Ready';
    stateColor = 'success';
  }

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
        <MemoryOutlinedIcon fontSize="small" color="primary" />
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          AI model · {invalid ? 'Invalid' : resolved.label}
        </Typography>
        <Chip size="small" label={stateLabel} color={stateColor} variant={stateColor === 'default' ? 'outlined' : 'filled'} />
      </Stack>
      {!invalid && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-all' }}>
          {resolved.modelId} · {resolved.dtype} · CPU / WebAssembly{hasToken ? ' · token set' : ''}
        </Typography>
      )}
      {loading && (
        <Box sx={{ mt: 1 }}>
          <LinearProgress
            variant={progress?.percent != null ? 'determinate' : 'indeterminate'}
            value={progress?.percent ?? undefined}
          />
          <Typography variant="caption" color="text.secondary">
            {progress && progress.totalBytes > 0
              ? `Downloading model files: ${mb(progress.loadedBytes)} of ${mb(progress.totalBytes)}`
              : 'Preparing model (cached files load faster)…'}
          </Typography>
        </Box>
      )}
      {isLoaded && lastLoadMs !== null && lastLoadMs > 0 && !loading && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          Loaded in {(lastLoadMs / 1000).toFixed(1)} s
          {threads !== null && ` · ${threads} CPU thread${threads === 1 ? '' : 's'}`}
        </Typography>
      )}
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        {!isLoaded && (
          <Button size="small" variant="outlined" onClick={onLoad} disabled={loading || invalid || status === 'generating'}>
            Load model
          </Button>
        )}
        <Button size="small" startIcon={<TuneIcon />} onClick={onOpenSettings} disabled={loading}>
          Model &amp; strength
        </Button>
      </Stack>
    </Paper>
  );
}
