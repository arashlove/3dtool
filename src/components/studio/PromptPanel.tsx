'use client';

import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ReplayIcon from '@mui/icons-material/Replay';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { modelKey } from '@/ai/model-config';
import { requiresConfirmation } from '@/core/commands/dispatcher';
import { parsePlanText } from '@/core/commands/parser';
import { LIMITS } from '@/core/schema/constants';
import { KIND_DEFS, OBJECT_KINDS } from '@/core/schema/kinds';
import type { ScenePlan } from '@/core/schema/plan';
import { useAiStore, type PromptHistoryEntry } from '@/state/ai-store';
import { useSceneStore } from '@/state/scene-store';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ModelSettingsDialog } from './ModelSettingsDialog';
import { ModelStatusCard } from './ModelStatusCard';
import { useAiPlanner } from './useAiPlanner';

const SAMPLE_PROMPTS = [
  'Create a modern oak desk with four matte black metal legs, 160 cm wide.',
  'Add a blue chair to the right of the desk with a 15 cm gap.',
  'Make the selected object 20 cm wider.',
  'Add a tall white bookshelf with 6 boards.',
  'Create a floor lamp with a cream shade.',
];

const SUPPORTED_TEXT = `Supported: ${OBJECT_KINDS.map((k) => KIND_DEFS[k].label.toLowerCase()).join(', ')}.`;
const DOWNLOAD_ACK_KEY = '3dtool:download-ack';

type Outcome = { severity: 'success' | 'info' | 'warning' | 'error'; text: string; detail?: string; retry?: boolean };
type PendingPlan = { plan: ScenePlan; aliases: Record<string, string>; prompt: string; elapsedMs: number };

function downloadAcknowledged(key: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(DOWNLOAD_ACK_KEY) ?? '[]') as string[]).includes(key);
  } catch {
    return false;
  }
}

function acknowledgeDownload(key: string) {
  try {
    const list = JSON.parse(localStorage.getItem(DOWNLOAD_ACK_KEY) ?? '[]') as string[];
    localStorage.setItem(DOWNLOAD_ACK_KEY, JSON.stringify([...new Set([...list, key])].slice(-10)));
  } catch {
    /* storage unavailable: ask again next time */
  }
}

function describeOps(plan: ScenePlan): string[] {
  return plan.operations.map((op) => {
    switch (op.op) {
      case 'create':
        return `Create ${op.kind}${op.name ? ` “${op.name}”` : ''}`;
      case 'set_params':
        return `Change ${Object.keys(op.changes).join(', ')} of ${op.target}`;
      case 'set_material':
        return `Change ${op.part} material of ${op.target}`;
      case 'set_transform':
        return `Move/rotate/scale ${op.target}`;
      case 'place_relative':
        return `Place ${op.target} ${op.relation.replace(/_/g, ' ')} ${op.anchor}`;
      case 'duplicate':
        return `Duplicate ${op.target}`;
      case 'delete':
        return `Delete ${op.target}`;
    }
  });
}

function GenerationStatus() {
  const generation = useAiStore((s) => s.generation);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = generation ? Math.max(0, Math.round((now - generation.startedAt) / 1000)) : 0;
  let detail = 'Reading your prompt and the scene…';
  if (generation && generation.tokens > 0) detail = `Writing the plan: ${generation.tokens} tokens`;
  if (generation?.attempt === 2) detail = `First reply was invalid, retrying once. ${detail}`;
  return (
    <Box sx={{ mt: 1 }} aria-live="polite">
      <LinearProgress />
      <Typography variant="caption" color="text.secondary">
        {detail} · {seconds}s on your CPU
      </Typography>
    </Box>
  );
}

export function PromptPanel() {
  const { resolved, isLoaded, loadModel, generate, cancel } = useAiPlanner();
  const status = useAiStore((s) => s.status);
  const aiError = useAiStore((s) => s.error);
  const history = useAiStore((s) => s.history);
  const reviewBeforeApply = useAiStore((s) => s.reviewBeforeApply);
  const runPlan = useSceneStore((s) => s.runPlan);

  const [prompt, setPrompt] = useState('');
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [rawOutputs, setRawOutputs] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [downloadPrompt, setDownloadPrompt] = useState<string | null | undefined>(undefined);
  const [confirmPlan, setConfirmPlan] = useState<PendingPlan | null>(null);
  const [reviewPlan, setReviewPlan] = useState<(PendingPlan & { text: string; error: string | null }) | null>(null);

  const busy = status === 'loading' || status === 'generating';
  const modelLabel = 'error' in resolved ? 'invalid model' : `${resolved.modelId} (${resolved.dtype})`;
  const addHistory = (entry: Omit<PromptHistoryEntry, 'id' | 'at' | 'model'>) =>
    useAiStore.getState().addHistory({ ...entry, model: modelLabel });

  const apply = (pending: PendingPlan) => {
    const r = runPlan(pending.plan, pending.aliases);
    if (r.ok) {
      setOutcome({ severity: 'success', text: r.summary || 'Applied.', detail: pending.plan.message || undefined });
      addHistory({ prompt: pending.prompt, outcome: 'applied', message: r.summary, elapsedMs: pending.elapsedMs });
    } else {
      setOutcome({ severity: 'error', text: `Could not apply the plan: ${r.error}`, retry: true });
      addHistory({ prompt: pending.prompt, outcome: 'error', message: r.error, elapsedMs: pending.elapsedMs });
    }
  };

  const runGeneration = async (text: string) => {
    setLastPrompt(text);
    setOutcome(null);
    setRawOutputs([]);
    const res = await generate(text);
    setRawOutputs(res.rawOutputs);
    if (!res.ok) {
      const cancelled = 'cancelled' in res;
      setOutcome({ severity: cancelled ? 'info' : 'error', text: res.error, retry: !cancelled });
      addHistory({ prompt: text, outcome: cancelled ? 'cancelled' : 'error', message: res.error, elapsedMs: res.elapsedMs });
      return;
    }
    const { plan } = res;
    if (plan.status === 'unsupported') {
      const message = plan.message || 'That request is outside what this studio can build.';
      setOutcome({ severity: 'warning', text: message, detail: SUPPORTED_TEXT });
      addHistory({ prompt: text, outcome: 'unsupported', message, elapsedMs: res.elapsedMs });
      return;
    }
    if (plan.status === 'clarify') {
      const message = plan.message || 'Which object do you mean? Select it first.';
      setOutcome({ severity: 'info', text: message });
      addHistory({ prompt: text, outcome: 'clarify', message, elapsedMs: res.elapsedMs });
      return;
    }
    const pending: PendingPlan = { plan, aliases: res.aliases, prompt: text, elapsedMs: res.elapsedMs };
    if (reviewBeforeApply) setReviewPlan({ ...pending, text: JSON.stringify(plan, null, 2), error: null });
    else if (requiresConfirmation(plan)) setConfirmPlan(pending);
    else apply(pending);
  };

  const submit = async (textInput: string) => {
    const text = textInput.trim();
    if (!text || busy) return;
    if (text.length > LIMITS.maxPromptLength) {
      setOutcome({ severity: 'error', text: `Prompts are limited to ${LIMITS.maxPromptLength} characters.` });
      return;
    }
    if (!isLoaded) {
      if ('error' in resolved) {
        setOutcome({ severity: 'error', text: resolved.error });
        return;
      }
      if (!downloadAcknowledged(modelKey(resolved))) {
        setDownloadPrompt(text);
        return;
      }
      if (!(await loadModel())) return;
    }
    await runGeneration(text);
  };

  const startLoad = async (pendingPrompt: string | null) => {
    if ('error' in resolved) return;
    acknowledgeDownload(modelKey(resolved));
    setDownloadPrompt(undefined);
    const ok = await loadModel();
    if (ok && pendingPrompt) await runGeneration(pendingPrompt);
  };

  const requestLoad = () => {
    if ('error' in resolved) return;
    if (downloadAcknowledged(modelKey(resolved))) void startLoad(null);
    else setDownloadPrompt(null);
  };

  return (
    <Stack spacing={1.5} sx={{ p: 2 }}>
      <ModelStatusCard resolved={resolved} isLoaded={isLoaded} onLoad={requestLoad} onOpenSettings={() => setSettingsOpen(true)} />
      {status === 'error' && aiError && (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={requestLoad}>Retry</Button>}>
          {aiError} Manual editing still works.
        </Alert>
      )}

      <Box>
        <Typography variant="subtitle2" component="label" htmlFor="prompt-input" sx={{ display: 'block', mb: 0.75 }}>
          Describe what to build or change
        </Typography>
        <TextField
          id="prompt-input"
          multiline
          minRows={3}
          maxRows={8}
          fullWidth
          placeholder="e.g. Create a walnut table 1.8 m wide and put a lamp on top"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void submit(prompt);
            }
          }}
          disabled={busy}
          slotProps={{ htmlInput: { maxLength: LIMITS.maxPromptLength } }}
          helperText={`${prompt.length}/${LIMITS.maxPromptLength} · Ctrl+Enter to generate`}
        />
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          {status === 'generating' ? (
            <Button variant="outlined" color="inherit" startIcon={<StopCircleOutlinedIcon />} onClick={cancel} fullWidth>
              Cancel
            </Button>
          ) : (
            <Button
              variant="contained"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => void submit(prompt)}
              disabled={busy || !prompt.trim()}
              fullWidth
            >
              {isLoaded ? 'Generate' : 'Load model & generate'}
            </Button>
          )}
        </Stack>
        {status === 'generating' && <GenerationStatus />}
      </Box>

      {outcome && (
        <Alert
          severity={outcome.severity}
          action={
            outcome.retry && lastPrompt ? (
              <Button color="inherit" size="small" startIcon={<ReplayIcon />} onClick={() => void submit(lastPrompt)} disabled={busy}>
                Retry
              </Button>
            ) : undefined
          }
        >
          {outcome.text}
          {outcome.detail && (
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.85 }}>
              {outcome.detail}
            </Typography>
          )}
        </Alert>
      )}

      {rawOutputs.length > 0 && (
        <Accordion disableGutters variant="outlined" sx={{ '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="caption">Raw model output (untrusted, {rawOutputs.length} attempt{rawOutputs.length > 1 ? 's' : ''})</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {rawOutputs.map((raw, i) => (
              <Box
                key={i}
                component="pre"
                sx={{ m: 0, mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto' }}
              >
                {raw || '(empty)'}
              </Box>
            ))}
          </AccordionDetails>
        </Accordion>
      )}

      {reviewPlan && (
        <Box sx={{ border: 1, borderColor: 'primary.main', borderRadius: 1, p: 1.5 }}>
          <Typography variant="subtitle2" gutterBottom>
            Review planned changes
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5, mb: 1 }}>
            {describeOps(reviewPlan.plan).map((line, i) => (
              <Typography key={i} component="li" variant="body2">
                {line}
              </Typography>
            ))}
          </Box>
          <TextField
            multiline
            minRows={4}
            maxRows={14}
            fullWidth
            value={reviewPlan.text}
            onChange={(e) => setReviewPlan({ ...reviewPlan, text: e.target.value, error: null })}
            error={Boolean(reviewPlan.error)}
            helperText={reviewPlan.error ?? 'You may edit the JSON. It is validated again before applying.'}
            slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: 'ui-monospace, monospace', fontSize: 12 } } }}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button
              variant="contained"
              size="small"
              onClick={() => {
                const parsed = parsePlanText(reviewPlan.text);
                if (!parsed.ok) return setReviewPlan({ ...reviewPlan, error: parsed.error });
                if (parsed.plan.status !== 'ok') return setReviewPlan({ ...reviewPlan, error: 'Only "ok" plans can be applied.' });
                const pending = { ...reviewPlan, plan: parsed.plan };
                setReviewPlan(null);
                if (requiresConfirmation(parsed.plan)) setConfirmPlan(pending);
                else apply(pending);
              }}
            >
              Apply
            </Button>
            <Button
              size="small"
              onClick={() => {
                addHistory({ prompt: reviewPlan.prompt, outcome: 'declined', message: 'Plan discarded', elapsedMs: reviewPlan.elapsedMs });
                setReviewPlan(null);
              }}
            >
              Discard
            </Button>
          </Stack>
        </Box>
      )}

      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
          Example prompts
        </Typography>
        <Stack direction="row" useFlexGap spacing={0.75} sx={{ flexWrap: 'wrap' }}>
          {SAMPLE_PROMPTS.map((p) => (
            <Chip key={p} label={p} size="small" variant="outlined" onClick={() => setPrompt(p)} sx={{ maxWidth: '100%', height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }} />
          ))}
        </Stack>
      </Box>

      {history.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary">
            History
          </Typography>
          <List dense disablePadding>
            {history.slice(0, 10).map((h) => (
              <ListItem key={h.id} disableGutters sx={{ alignItems: 'flex-start' }}>
                <ListItemText
                  primary={h.prompt}
                  secondary={`${h.outcome}${h.elapsedMs ? ` · ${(h.elapsedMs / 1000).toFixed(1)} s` : ''} · ${h.message}`}
                  slotProps={{ primary: { variant: 'body2', sx: { wordBreak: 'break-word' } }, secondary: { variant: 'caption', sx: { wordBreak: 'break-word' } } }}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      <Typography variant="caption" color="text.secondary">
        Prompts are interpreted on this device by a small open model; model files are downloaded from Hugging Face. The AI
        only proposes a restricted JSON plan — the app validates it and builds every object from procedural Three.js
        geometry. It works best for furniture and basic shapes, not realistic organic objects.
      </Typography>

      <ModelSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <ConfirmDialog
        open={downloadPrompt !== undefined}
        title="Download the AI model?"
        confirmLabel="Download and load"
        onCancel={() => setDownloadPrompt(undefined)}
        onConfirm={() => void startLoad(downloadPrompt ?? null)}
      >
        {'error' in resolved ? null : (
          <>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>{resolved.modelId}</strong> ({resolved.dtype})
              {resolved.approxDownloadMB ? ` is about ${resolved.approxDownloadMB} MB` : ' has an unknown size'} and is
              downloaded once from Hugging Face, then cached by your browser.
            </Typography>
            <Typography variant="body2">
              It runs on your CPU and can use more memory than its download size. Your prompts stay on this device. You can
              pick a lighter or stronger model under “Model &amp; strength”.
            </Typography>
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(confirmPlan)}
        title="Apply changes that delete objects?"
        confirmLabel="Apply"
        destructive
        onCancel={() => {
          if (confirmPlan) addHistory({ prompt: confirmPlan.prompt, outcome: 'declined', message: 'Deletion not confirmed', elapsedMs: confirmPlan.elapsedMs });
          setConfirmPlan(null);
          setOutcome({ severity: 'info', text: 'No changes applied.' });
        }}
        onConfirm={() => {
          const pending = confirmPlan;
          setConfirmPlan(null);
          if (pending) apply(pending);
        }}
      >
        {confirmPlan && (
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {describeOps(confirmPlan.plan).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </Box>
        )}
      </ConfirmDialog>
    </Stack>
  );
}
