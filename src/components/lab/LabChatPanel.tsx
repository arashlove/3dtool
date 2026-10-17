'use client';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SendIcon from '@mui/icons-material/Send';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import type { ChatEntry } from '@/lab/store';
import { useLabStore } from '@/lab/store';
import type { EditStep, Operation, PartInfo } from '@/lab/types';

const EXAMPLES = [
  'Make the legs 30% longer and brushed gold',
  'Turn the top into white marble',
  'Put a red dragon logo on the front',
  'Wrap a green serpent around the lamp shade',
  'Twist the shelf 30 degrees',
  'Make the top half of the selected part glow blue',
];

function describeOp(op: Operation): string {
  switch (op.type) {
    case 'color':
      return `color ${op.color}${op.keep_texture ? ' (tint)' : ''}`;
    case 'material':
      return `material ${[
        op.metalness !== undefined && `metal ${op.metalness}`,
        op.roughness !== undefined && `rough ${op.roughness}`,
        op.opacity !== undefined && `opacity ${op.opacity}`,
        op.emissive && `glow ${op.emissive}`,
      ]
        .filter(Boolean)
        .join(', ')}`;
    case 'texture':
      return `texture “${op.texture_prompt}” ×${op.tiling}`;
    case 'decal':
      return `${op.direction === 'around' ? 'wrap' : `decal (${op.direction})`} “${op.decal_prompt}”`;
    case 'scale':
      return `scale ×${op.factor}`;
    case 'stretch':
      return `stretch ×[${op.factors?.join(', ')}]`;
    case 'translate':
      return `move [${op.offset?.join(', ')}]`;
    case 'rotate':
    case 'twist':
    case 'bend':
      return `${op.type} ${op.degrees}° about ${op.axis}`;
    case 'taper':
      return `taper ${op.factor} along ${op.axis}`;
    case 'inflate':
      return `${(op.factor ?? 0) < 0 ? 'thin' : 'inflate'} ${op.factor}`;
    default:
      return op.type;
  }
}

function StepLine({ step, parts }: { step: EditStep; parts: Map<string, PartInfo> }) {
  const names = step.targets.map((id) => parts.get(id)?.label ?? id);
  return (
    <Box component="li" sx={{ mb: 0.5 }}>
      <Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
        {names.slice(0, 4).join(', ')}
        {names.length > 4 ? ` +${names.length - 4}` : ''}
      </Typography>
      {step.region && (
        <Typography variant="caption" color="text.secondary">
          {' '}
          ({step.region.axis} {Math.round(step.region.start * 100)}–{Math.round(step.region.end * 100)}%)
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary">
        {step.operations.map(describeOp).join(' · ')}
      </Typography>
    </Box>
  );
}

function AssistantCard({ entry }: { entry: ChatEntry }) {
  const parts = useLabStore((s) => s.parts);
  const busy = useLabStore((s) => s.busy);
  const applyChat = useLabStore((s) => s.applyChat);
  const discardChat = useLabStore((s) => s.discardChat);
  const setPreview = useLabStore((s) => s.setPreview);
  const byId = new Map(parts.map((p) => [p.id, p]));
  const plan = entry.plan;

  if (entry.status === 'pending') {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 1 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary">
          Planning…
        </Typography>
      </Stack>
    );
  }
  if (entry.status === 'error') return <Alert severity="error">{entry.text}</Alert>;

  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.25, borderColor: entry.status === 'ready' ? 'warning.main' : 'divider' }}
      onMouseEnter={() => plan && entry.status === 'ready' && setPreview([...new Set(plan.steps.flatMap((s) => s.targets))])}
    >
      <Typography variant="body2" sx={{ mb: 0.75 }}>
        {entry.text}
      </Typography>
      {plan && (
        <>
          <Stack direction="row" spacing={0.5} sx={{ mb: 0.75, flexWrap: 'wrap' }} useFlexGap>
            <Chip size="small" label={plan.source === 'heuristic' ? 'offline planner' : plan.source.toUpperCase()} />
            {plan.model && <Chip size="small" variant="outlined" label={plan.model} sx={{ maxWidth: '100%' }} />}
          </Stack>
          {plan.steps.length > 0 ? (
            <Box component="ul" sx={{ m: 0, pl: 2.25 }}>
              {plan.steps.map((s, i) => (
                <StepLine key={i} step={s} parts={byId} />
              ))}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No edit steps. Try naming the part, selecting it first, or turning Vision on.
            </Typography>
          )}
          {plan.warnings.length > 0 && (
            <Alert severity="warning" sx={{ mt: 1, py: 0 }}>
              {plan.warnings.map((w, i) => (
                <Typography key={i} variant="caption" sx={{ display: 'block' }}>
                  {w}
                </Typography>
              ))}
            </Alert>
          )}
        </>
      )}
      {entry.snapshot && (
        <Accordion disableGutters variant="outlined" sx={{ mt: 1, '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="caption">What the AI saw</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 1 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local snapshot data URL */}
            <img src={entry.snapshot} alt="Four-view snapshot with numbered part markers" style={{ width: '100%', borderRadius: 4, display: 'block' }} />
          </AccordionDetails>
        </Accordion>
      )}
      {plan && plan.steps.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
          {entry.status === 'applied' ? (
            <Chip size="small" color="success" label="Applied" />
          ) : entry.status === 'discarded' ? (
            <Chip size="small" label="Discarded" />
          ) : (
            <>
              <Button size="small" variant="contained" onClick={() => void applyChat(entry.id)} disabled={Boolean(busy) || entry.status === 'applying'}>
                {entry.status === 'applying' ? 'Applying…' : 'Apply'}
              </Button>
              <Button size="small" onClick={() => discardChat(entry.id)} disabled={entry.status === 'applying'}>
                Discard
              </Button>
            </>
          )}
        </Stack>
      )}
    </Paper>
  );
}

export function LabChatPanel() {
  const chat = useLabStore((s) => s.chat);
  const busy = useLabStore((s) => s.busy);
  const vision = useLabStore((s) => s.vision);
  const autoApply = useLabStore((s) => s.autoApply);
  const health = useLabStore((s) => s.health);
  const hasModel = useLabStore((s) => s.modelName !== null);
  const selectedCount = useLabStore((s) => s.selected.length);
  const pending = chat.some((c) => c.status === 'pending');
  const [prompt, setPrompt] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const lastStatus = chat[chat.length - 1]?.status;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.length, lastStatus]);

  const send = () => {
    const text = prompt.trim();
    if (!text || pending || !hasModel) return;
    setPrompt('');
    void useLabStore.getState().sendPrompt(text);
  };

  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1.5 }}>
        {chat.length === 0 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Describe an edit. The AI plans which parts to change and how; you review the plan before it touches the model.
              {!health?.ai_enabled && ' Without HF_TOKEN an offline keyword planner answers instead.'}
            </Typography>
            <Stack direction="row" useFlexGap spacing={0.75} sx={{ flexWrap: 'wrap' }}>
              {EXAMPLES.map((e) => (
                <Chip
                  key={e}
                  label={e}
                  size="small"
                  variant="outlined"
                  onClick={() => setPrompt(e)}
                  sx={{ height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }}
                />
              ))}
            </Stack>
          </Box>
        )}
        <Stack spacing={1}>
          {chat.map((entry) =>
            entry.role === 'user' ? (
              <Box key={entry.id} sx={{ alignSelf: 'flex-end', maxWidth: '88%', bgcolor: 'primary.main', color: 'primary.contrastText', px: 1.25, py: 0.75, borderRadius: 2 }}>
                <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                  {entry.text}
                </Typography>
              </Box>
            ) : (
              <AssistantCard key={entry.id} entry={entry} />
            ),
          )}
        </Stack>
        <div ref={endRef} />
      </Box>
      <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end' }}>
          <TextField
            multiline
            minRows={2}
            maxRows={6}
            fullWidth
            size="small"
            placeholder={hasModel ? (selectedCount ? `Edit the ${selectedCount} selected part(s)…` : 'e.g. make the legs 30% longer and brushed gold') : 'Load a model first'}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={!hasModel}
            slotProps={{ htmlInput: { maxLength: 1000, 'aria-label': 'Edit instruction' } }}
          />
          <IconButton color="primary" onClick={send} disabled={!prompt.trim() || pending || !hasModel || Boolean(busy)} aria-label="Send">
            <SendIcon />
          </IconButton>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }} useFlexGap>
          <Tooltip title={health?.ai_enabled ? 'Attach a four-view snapshot with numbered parts so the vision model can see the model' : 'Vision needs HF_TOKEN'}>
            <FormControlLabel
              control={<Switch size="small" checked={vision && Boolean(health?.ai_enabled)} disabled={!health?.ai_enabled} onChange={(e) => useLabStore.getState().set({ vision: e.target.checked })} />}
              label={<Typography variant="caption">Vision</Typography>}
            />
          </Tooltip>
          <FormControlLabel
            control={<Switch size="small" checked={autoApply} onChange={(e) => useLabStore.getState().set({ autoApply: e.target.checked })} />}
            label={<Typography variant="caption">Auto-apply</Typography>}
          />
        </Stack>
      </Box>
    </Stack>
  );
}
