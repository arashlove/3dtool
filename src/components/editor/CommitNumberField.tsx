'use client';

import TextField from '@mui/material/TextField';
import { useState, type KeyboardEvent } from 'react';

type Props = {
  label: string;
  value: number;
  /** Return an error message to reject the value, or null on success. */
  onCommit: (value: number) => string | null;
  step?: number;
  disabled?: boolean;
  unit?: string;
  decimals?: number;
};

const format = (v: number, decimals: number) => String(Math.round(v * 10 ** decimals) / 10 ** decimals);

/** Number input that commits once on blur/Enter, so typing does not flood history or rebuild geometry. */
export function CommitNumberField({ label, value, onCommit, step = 0.01, disabled, unit, decimals = 3 }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = draft ?? format(value, decimals);

  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setError('Enter a number');
      return;
    }
    if (Math.abs(parsed - value) < 1e-9) {
      setDraft(null);
      setError(null);
      return;
    }
    const problem = onCommit(parsed);
    setError(problem);
    if (!problem) setDraft(null);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') {
      setDraft(null);
      setError(null);
    }
  };

  return (
    <TextField
      label={unit ? `${label} (${unit})` : label}
      value={shown}
      type="number"
      disabled={disabled}
      error={Boolean(error)}
      helperText={error ?? undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      slotProps={{ htmlInput: { step, inputMode: 'decimal' }, formHelperText: { sx: { mx: 0 } } }}
      fullWidth
    />
  );
}
