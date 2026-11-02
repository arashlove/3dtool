'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useLabStore } from '@/lab/store';
import { useAiStore } from '@/state/ai-store';
import { HfTokenFields } from '../common/HfTokenFields';

export function LabTokenDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      {open && <LabTokenForm onClose={onClose} />}
    </Dialog>
  );
}

function LabTokenForm({ onClose }: { onClose: () => void }) {
  const stored = useAiStore();
  const health = useLabStore((s) => s.health);
  const [token, setToken] = useState(stored.token ?? '');
  const [remember, setRemember] = useState(stored.rememberToken);

  return (
    <>
      <DialogTitle>Hugging Face token</DialogTitle>
      <DialogContent dividers>
        <HfTokenFields token={token} onTokenChange={setToken} remember={remember} onRememberChange={setRemember} />
        {health && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>
              Models used by the Future Lab
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'text.secondary', fontSize: 14 }}>
              <li>Edit planner: {health.models.llm}</li>
              <li>Vision: {health.models.vlm}</li>
              <li>Images: {health.models.image}</li>
              <li>Text to 3D: {health.models.three_d}</li>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => {
            stored.setToken(token, remember);
            onClose();
          }}
        >
          Save
        </Button>
      </DialogActions>
    </>
  );
}
