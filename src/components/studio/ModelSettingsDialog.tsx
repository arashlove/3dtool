'use client';

import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import {
  DEFAULT_PRESET_ID,
  MODEL_DTYPES,
  MODEL_PRESETS,
  resolveModel,
  type ModelDtype,
  type ModelSelection,
} from '@/ai/model-config';
import { useAiStore } from '@/state/ai-store';

function StrengthBars({ value }: { value: number }) {
  return (
    <Stack direction="row" spacing={0.4} aria-label={`Strength ${value} of 4`} sx={{ alignItems: 'flex-end' }}>
      {[1, 2, 3, 4].map((i) => (
        <Box key={i} sx={{ width: 5, height: 4 + i * 3, borderRadius: 0.5, bgcolor: i <= value ? 'primary.main' : 'action.disabledBackground' }} />
      ))}
    </Stack>
  );
}

const formatSize = (mb: number) => (mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`);

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
  const [customDtype, setCustomDtype] = useState<ModelDtype>(store.selection.kind === 'custom' ? store.selection.dtype : 'q8');
  const [token, setToken] = useState(store.token ?? '');
  const [remember, setRemember] = useState(store.rememberToken);
  const [review, setReview] = useState(store.reviewBeforeApply);

  const selection: ModelSelection =
    choice === 'custom'
      ? { kind: 'custom', modelId: customId, dtype: customDtype }
      : { kind: 'preset', presetId: (MODEL_PRESETS.find((p) => p.id === choice)?.id ?? DEFAULT_PRESET_ID) };
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
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The model runs on this device&apos;s CPU (WebAssembly) inside your browser. Larger models follow instructions more
          reliably but download more data, use more memory, and respond more slowly. Model files are cached by your browser
          after the first download.
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
                  <Typography variant="caption" color="text.secondary">
                    ~{formatSize(p.approxDownloadMB)} download
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {p.description}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-all' }}>
                  {p.modelId} · {p.dtype} · {p.license} ·{' '}
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
              <Typography sx={{ fontWeight: 650 }}>Custom Hugging Face model</Typography>
            </Stack>
            {choice === 'custom' && (
              <Stack spacing={1.5} sx={{ mt: 1.5, pl: 5 }}>
                <TextField
                  label="Model id"
                  placeholder="owner/model-name"
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value)}
                  error={Boolean(invalid)}
                  helperText={invalid ?? 'Must be a Transformers.js-compatible repo with ONNX weights for text generation.'}
                  fullWidth
                  slotProps={{ htmlInput: { maxLength: 193, spellCheck: false } }}
                />
                <TextField select label="Quantization (dtype)" value={customDtype} onChange={(e) => setCustomDtype(e.target.value as ModelDtype)} sx={{ maxWidth: 220 }}>
                  {MODEL_DTYPES.map((d) => (
                    <MenuItem key={d} value={d}>
                      {d}
                    </MenuItem>
                  ))}
                </TextField>
                <Typography variant="caption" color="text.secondary">
                  Custom models are not tested with this app. Their output still goes through the same validator, so a
                  weaker model fails safely rather than changing the scene incorrectly.
                </Typography>
              </Stack>
            )}
          </Box>
        </Stack>

        <Divider sx={{ my: 2.5 }} />

        <Typography variant="subtitle2" gutterBottom>
          Hugging Face access token (optional)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Not needed for any built-in preset: they are public. A token only unlocks gated or private repositories you have
          access to (for a custom model) and may raise download rate limits. It does not make a model stronger.
        </Typography>
        <TextField
          label="hf_… token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          fullWidth
          autoComplete="off"
          slotProps={{ htmlInput: { maxLength: 200, spellCheck: false } }}
        />
        <FormControlLabel
          control={<Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)} size="small" />}
          label={<Typography variant="body2">Remember on this device (otherwise kept for this tab session only)</Typography>}
        />
        <Alert severity="info" sx={{ mt: 1 }}>
          The token stays in this browser and is sent only to huggingface.co when downloading model files. It is never sent
          to the 3DTool server. Use a fine-grained, read-only token.
        </Alert>

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
