'use client';

import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Alert from '@mui/material/Alert';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

const TOKEN_SETTINGS_URL = 'https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained';

type Props = {
  token: string;
  onTokenChange: (token: string) => void;
  remember: boolean;
  onRememberChange: (remember: boolean) => void;
};

/** The visitor's own Hugging Face token. Shape Studio and the Future Lab share it (see ai-store). */
export function HfTokenFields({ token, onTokenChange, remember, onRememberChange }: Props) {
  const tokenLooksWrong = token.trim() !== '' && !token.trim().startsWith('hf_');
  return (
    <>
      <Typography variant="subtitle2" gutterBottom>
        Hugging Face access token
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Prompts run on GPUs through{' '}
        <Link href="https://huggingface.co/docs/inference-providers" target="_blank" rel="noopener noreferrer">
          Hugging Face Inference Providers
        </Link>
        , billed to your own account (PRO accounts include monthly credits). Create a fine-grained token with the
        &quot;Make calls to Inference Providers&quot; permission:{' '}
        <Link href={TOKEN_SETTINGS_URL} target="_blank" rel="noopener noreferrer">
          create token <OpenInNewIcon sx={{ fontSize: 11, verticalAlign: 'middle' }} />
        </Link>
      </Typography>
      <TextField
        label="hf_… token"
        type="password"
        value={token}
        onChange={(e) => onTokenChange(e.target.value)}
        error={tokenLooksWrong}
        helperText={tokenLooksWrong ? 'Hugging Face tokens start with "hf_".' : ' '}
        fullWidth
        autoComplete="off"
        slotProps={{ htmlInput: { maxLength: 200, spellCheck: false } }}
      />
      <FormControlLabel
        control={<Checkbox checked={remember} onChange={(e) => onRememberChange(e.target.checked)} size="small" />}
        label={<Typography variant="body2">Remember on this device (otherwise kept for this tab session only)</Typography>}
      />
      <Alert severity="info" sx={{ mt: 1 }}>
        The token stays in this browser. Shape Studio sends it only to router.huggingface.co. The Future Lab sends it with each
        AI request to the 3DTool server, which passes it to Hugging Face for that request and does not store it. Your prompt and
        a short summary of the scene are sent to Hugging Face and the inference provider it selects.
      </Alert>
    </>
  );
}
