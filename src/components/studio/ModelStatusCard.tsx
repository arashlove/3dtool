'use client';

import CloudOutlinedIcon from '@mui/icons-material/CloudOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ResolvedModel } from '@/ai/model-config';
import { useAiStore } from '@/state/ai-store';

type Props = {
  resolved: ResolvedModel | { error: string };
  hasToken: boolean;
  onOpenSettings: () => void;
};

export function ModelStatusCard({ resolved, hasToken, onOpenSettings }: Props) {
  const status = useAiStore((s) => s.status);
  const invalid = 'error' in resolved;

  let stateLabel = 'Token needed';
  let stateColor: 'success' | 'warning' | 'info' = 'warning';
  if (status === 'generating') {
    stateLabel = 'Thinking…';
    stateColor = 'info';
  } else if (invalid) {
    stateLabel = 'Invalid model';
  } else if (hasToken) {
    stateLabel = 'Ready';
    stateColor = 'success';
  }

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
        <CloudOutlinedIcon fontSize="small" color="primary" />
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          AI model · {invalid ? 'Invalid' : resolved.label}
        </Typography>
        <Chip size="small" label={stateLabel} color={stateColor} />
      </Stack>
      {!invalid && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-all' }}>
          {resolved.modelId} · Hugging Face Inference Providers (GPU)
        </Typography>
      )}
      {!hasToken && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Add your own Hugging Face token to generate. Usage is billed to your Hugging Face account.
        </Typography>
      )}
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button size="small" variant={hasToken ? 'text' : 'outlined'} startIcon={<TuneIcon />} onClick={onOpenSettings} disabled={status === 'generating'}>
          {hasToken ? 'Model & strength' : 'Add token & pick model'}
        </Button>
      </Stack>
    </Paper>
  );
}
