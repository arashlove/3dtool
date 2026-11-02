'use client';

import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Radio from '@mui/material/Radio';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { DEFAULT_PRESET_ID, MODEL_PRESETS, resolveModel, type ModelSelection } from '@/ai/model-config';
import { useAiStore } from '@/state/ai-store';
import { HfTokenFields } from '../common/HfTokenFields';

function StrengthBars({ value }: { value: number }) {
  return (
    <Stack direction="row" spacing={0.4} aria-label={`Strength ${value} of 3`} sx={{ alignItems: 'flex-end' }}>
      {[1, 2, 3].map((i) => (
        <Box key={i} sx={{ width: 5, height: 4 + i * 3, borderRadius: 0.5, bgcolor: i <= value ? 'primary.main' : 'action.disabledBackground' }} />
      ))}
    </Stack>
  );
}

type Props = { open: boolean; onClose: () => void };

/** Inner form is mounted only while open, so it starts from the stored settings each time. */
export function ModelSettingsDialog({ open, onClose }: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      {open && <ModelSettingsForm onClose={onClose} />}
    </Dialog>
  );
}

function ModelSettingsForm({ onClose }: { onClose: () => void }) {
  const store = useAiStore();
  const [choice, setChoice] = useState<string>(store.selection.kind === 'preset' ? store.selection.presetId : 'custom');
  const [customId, setCustomId] = useState(store.selection.kind === 'custom' ? store.selection.modelId : '');
  const [token, setToken] = useState(store.token ?? '');
  const [remember, setRemember] = useState(store.rememberToken);
  const [review, setReview] = useState(store.reviewBeforeApply);

  const selection: ModelSelection =
    choice === 'custom'
      ? { kind: 'custom', modelId: customId }
      : { kind: 'preset', presetId: MODEL_PRESETS.find((p) => p.id === choice)?.id ?? DEFAULT_PRESET_ID };
  const resolved = resolveModel(selection);
  const invalid = 'error' in resolved ? resolved.error : null;
  const save = () => {
    if (invalid) return;
    store.setSelection(selection);
    store.setToken(token, remember);
    store.setReviewBeforeApply(review);
    onClose();
  };

  return (
    <>
      <DialogTitle>AI model settings</DialogTitle>
      <DialogContent dividers>
        <HfTokenFields token={token} onTokenChange={setToken} remember={remember} onRememberChange={setRemember} />

        <Divider sx={{ my: 2.5 }} />

        <Typography variant="subtitle2" gutterBottom>
          Model strength
        </Typography>
        <Stack spacing={1} role="radiogroup" aria-label="Model strength">
          {MODEL_PRESETS.map((p) => (
            <Box
              key={p.id}
              onClick={() => setChoice(p.id)}
              sx={{
                display: 'flex',
                gap: 1.5,
                p: 1.25,
                border: 1,
                borderRadius: 1,
                cursor: 'pointer',
                borderColor: choice === p.id ? 'primary.main' : 'divider',
                bgcolor: choice === p.id ? 'action.hover' : 'transparent',
              }}
            >
              <Radio checked={choice === p.id} value={p.id} size="small" sx={{ p: 0.5, alignSelf: 'flex-start' }} slotProps={{ input: { 'aria-label': p.label } }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography sx={{ fontWeight: 650 }}>{p.label}</Typography>
                  <StrengthBars value={p.strength} />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {p.description}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-all' }}>
                  {p.modelId} · {p.license} ·{' '}
                  <Link href={p.modelCardUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                    model card <OpenInNewIcon sx={{ fontSize: 11, verticalAlign: 'middle' }} />
                  </Link>
                </Typography>
              </Box>
            </Box>
          ))}

          <Box
            onClick={() => setChoice('custom')}
            sx={{
              p: 1.25,
              border: 1,
              borderRadius: 1,
              cursor: 'pointer',
              borderColor: choice === 'custom' ? 'primary.main' : 'divider',
              bgcolor: choice === 'custom' ? 'action.hover' : 'transparent',
            }}
          >
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Radio checked={choice === 'custom'} value="custom" size="small" sx={{ p: 0.5 }} slotProps={{ input: { 'aria-label': 'Custom model' } }} />
              <Typography sx={{ fontWeight: 650 }}>Custom model</Typography>
            </Stack>
            {choice === 'custom' && (
              <Stack spacing={1.5} sx={{ mt: 1.5, pl: 5 }}>
                <TextField
                  label="Model id"
                  placeholder="owner/model-name or owner/model-name:provider"
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value)}
                  error={Boolean(invalid)}
                  helperText={
                    invalid ?? 'Any chat model served by Hugging Face Inference Providers. Add ":fastest" or ":cheapest" to steer routing.'
                  }
                  fullWidth
                  slotProps={{ htmlInput: { maxLength: 240, spellCheck: false } }}
                />
                <Typography variant="caption" color="text.secondary">
                  Custom models are not tested with this app. Their output still goes through the same validator, so a weaker
                  model fails safely rather than changing the scene incorrectly. Browse available models at{' '}
                  <Link href="https://huggingface.co/models?inference_provider=all&pipeline_tag=text-generation" target="_blank" rel="noopener noreferrer">
                    huggingface.co/models
                  </Link>
                  .
                </Typography>
              </Stack>
            )}
          </Box>
        </Stack>

        <Divider sx={{ my: 2.5 }} />

        <FormControlLabel
          control={<Switch checked={review} onChange={(e) => setReview(e.target.checked)} />}
          label={
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Review plans before applying
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Show the model&apos;s JSON plan for inspection and editing before it changes the scene.
              </Typography>
            </Box>
          }
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={Boolean(invalid)}>
          Save
        </Button>
      </DialogActions>
    </>
  );
}
