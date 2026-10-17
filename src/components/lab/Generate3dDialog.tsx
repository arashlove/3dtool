'use client';

import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { useLabAiEnabled } from '@/lab/ai-token';
import { ACCEPTED_IMAGE_TYPES, loadReferenceImage } from '@/lab/reference-image';
import { useLabStore, type Generate3dOptions } from '@/lab/store';
import { generateConceptImage } from '@/lab/textures';

const QUALITIES: Array<{ id: Generate3dOptions['quality']; label: string; hint: string }> = [
  { id: 'fast', label: 'Fast', hint: '512 voxels, 100k faces' },
  { id: 'standard', label: 'Standard', hint: '1024 voxels, 200k faces' },
  { id: 'high', label: 'High', hint: '1536 voxels, 300k faces; slowest' },
];

function Progress() {
  const status = useLabStore((s) => s.generating3d);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!status) return null;
  const seconds = Math.max(0, Math.round((now - status.startedAt) / 1000));
  const queue = status.position !== undefined && status.position > 0 ? ` · position ${status.position} in queue` : '';
  return (
    <Box aria-live="polite">
      <LinearProgress variant={status.progress !== undefined ? 'determinate' : 'indeterminate'} value={status.progress !== undefined ? status.progress * 100 : undefined} />
      <Typography variant="body2" sx={{ mt: 0.75 }}>
        {status.stage}
        {status.detail ? ` — ${status.detail}` : ''}
        {queue}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {seconds}s elapsed. A model usually takes 1–3 minutes, longer when the Space is busy.
      </Typography>
    </Box>
  );
}

export function Generate3dDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const health = useLabStore((s) => s.health);
  const running = useLabStore((s) => Boolean(s.generating3d));
  const hasModel = useLabStore((s) => s.modelName !== null);
  const [source, setSource] = useState<'text' | 'image'>('text');
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<{ url: string; name: string } | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState<Generate3dOptions['quality']>('standard');
  const [mode, setMode] = useState<Generate3dOptions['mode']>('add');
  const [height, setHeight] = useState(0.5);
  const fileInput = useRef<HTMLInputElement>(null);
  const aiEnabled = useLabAiEnabled();

  const makeConcept = async () => {
    setError(null);
    setImageBusy(true);
    try {
      const text = prompt.trim();
      setImage({ url: await generateConceptImage(text), name: text.slice(0, 40) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image generation failed.');
    } finally {
      setImageBusy(false);
    }
  };

  const generate = async () => {
    if (!image) return;
    setError(null);
    const ok = await useLabStore.getState().generate3d({
      image: image.url,
      name: image.name || 'Generated model',
      quality,
      mode: hasModel ? mode : 'replace',
      height: Number.isFinite(height) && height > 0 ? height : 1,
    });
    if (ok) onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle>Text to 3D</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Uses{' '}
          <Link href={`https://huggingface.co/spaces/${health?.models.three_d ?? 'microsoft/TRELLIS.2'}`} target="_blank" rel="noopener noreferrer">
            {health?.models.three_d ?? 'microsoft/TRELLIS.2'}
          </Link>
          , the strongest open image-to-3D model that runs on Hugging Face without deploying anything. A text prompt first
          becomes a concept image ({health?.models.image ?? 'text-to-image'}); TRELLIS.2 turns the image into a textured GLB.
        </Typography>
        {!aiEnabled && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Text to 3D needs your Hugging Face token. Add it with the token button in the top bar.
          </Alert>
        )}

        <ToggleButtonGroup size="small" exclusive value={source} onChange={(_, v) => v && setSource(v)} sx={{ mb: 1.5 }} disabled={running}>
          <ToggleButton value="text">Describe it</ToggleButton>
          <ToggleButton value="image">Use an image</ToggleButton>
        </ToggleButtonGroup>

        {source === 'text' ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', mb: 1.5 }}>
            <TextField
              size="small"
              fullWidth
              label="What should it be?"
              placeholder="a mid-century walnut armchair with green velvet cushions"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={running}
              slotProps={{ htmlInput: { maxLength: 300 } }}
            />
            <Button
              variant="outlined"
              startIcon={imageBusy ? <CircularProgress size={14} /> : <AutoAwesomeIcon />}
              onClick={() => void makeConcept()}
              disabled={!aiEnabled || !prompt.trim() || imageBusy || running}
              sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {image && source === 'text' ? 'Redo image' : 'Concept image'}
            </Button>
          </Stack>
        ) : (
          <Box sx={{ mb: 1.5 }}>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setError(null);
                try {
                  setImage({ url: await loadReferenceImage(file), name: file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) });
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Could not read the image.');
                }
              }}
            />
            <Button variant="outlined" startIcon={<AddPhotoAlternateOutlinedIcon />} onClick={() => fileInput.current?.click()} disabled={running}>
              Choose image
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              One object, fully in frame. The background is removed automatically.
            </Typography>
          </Box>
        )}

        {image && (
          <Box sx={{ mb: 2, textAlign: 'center', bgcolor: 'action.hover', borderRadius: 1, p: 1 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
            <img src={image.url} alt={`Concept image: ${image.name}`} style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 4 }} />
          </Box>
        )}

        <Typography variant="subtitle2" gutterBottom>
          Quality
        </Typography>
        <RadioGroup row value={quality} onChange={(e) => setQuality(e.target.value as Generate3dOptions['quality'])} sx={{ mb: 1 }}>
          {QUALITIES.map((q) => (
            <FormControlLabel
              key={q.id}
              value={q.id}
              disabled={running}
              control={<Radio size="small" />}
              label={
                <Box>
                  <Typography variant="body2">{q.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {q.hint}
                  </Typography>
                </Box>
              }
            />
          ))}
        </RadioGroup>

        {hasModel && (
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1, flexWrap: 'wrap' }} useFlexGap>
            <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value as Generate3dOptions['mode'])}>
              <FormControlLabel value="add" control={<Radio size="small" />} label={<Typography variant="body2">Add to scene</Typography>} disabled={running} />
              <FormControlLabel value="replace" control={<Radio size="small" />} label={<Typography variant="body2">Replace scene</Typography>} disabled={running} />
            </RadioGroup>
            {mode === 'add' && (
              <TextField
                size="small"
                type="number"
                label="Height (m)"
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                disabled={running}
                helperText="mug ≈ 0.1, chair ≈ 0.9"
                slotProps={{ htmlInput: { min: 0.02, max: 20, step: 0.05 } }}
                sx={{ width: 140 }}
              />
            )}
          </Stack>
        )}

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: running || error ? 1.5 : 0 }}>
          Runs on the public Space with your HF token, so GPU time counts against your account&apos;s ZeroGPU quota (free accounts
          get a few minutes a day; PRO gets more). The concept image uses Inference Provider credits. Uploaded images are sent to
          Hugging Face.
        </Typography>
        {running && <Progress />}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        {running ? (
          <Button color="inherit" onClick={() => useLabStore.getState().cancel3d()}>
            Cancel generation
          </Button>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )}
        <Button variant="contained" onClick={() => void generate()} disabled={!aiEnabled || !image || running || imageBusy}>
          {running ? 'Generating…' : 'Generate 3D model'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
