'use client';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { useState } from 'react';
import { HfTokenFields } from '@/components/common/HfTokenFields';
import { useLabStore } from '@/lab/store';
import { useAiStore } from '@/state/ai-store';

/** The visitor's own Hugging Face token for the Lab's AI features; the same token Shape Studio uses. */
export function LabTokenDialog() {
  const open = useLabStore((s) => s.tokenDialog);
  const close = () => useLabStore.getState().set({ tokenDialog: false });
  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      {open && <TokenForm onClose={close} />}
    </Dialog>
  );
}

/** Mounted only while open, so it starts from the stored token each time. */
function TokenForm({ onClose }: { onClose: () => void }) {
  const store = useAiStore();
  const [token, setToken] = useState(store.token ?? '');
  const [remember, setRemember] = useState(store.rememberToken);

  const save = () => {
    store.setToken(token, remember);
    onClose();
  };

  return (
    <>
      <DialogTitle>Hugging Face token</DialogTitle>
      <DialogContent dividers>
        <HfTokenFields token={token} onTokenChange={setToken} remember={remember} onRememberChange={setRemember} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save}>
          Save
        </Button>
      </DialogActions>
    </>
  );
}
