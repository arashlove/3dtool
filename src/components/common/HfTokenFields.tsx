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
  onTokenChange: (value: string) => void;
  remember: boolean;
  onRememberChange: (value: boolean) => void;
};

export const tokenLooksWrong = (token: string) => token.trim() !== '' && !token.trim().startsWith('hf_');

/** One token for the whole app: Shape Studio and the Future Lab share it through the AI store. */
export function HfTokenFields({ token, onTokenChange, remember, onRememberChange }: Props) {
  const wrong = tokenLooksWrong(token);
  return (
    <>
      <Typography variant="subtitle2" gutterBottom>
        Hugging Face access token
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        AI features run on GPUs through{' '}
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
        error={wrong}
        helperText={wrong ? 'Hugging Face tokens start with "hf_".' : ' '}
        fullWidth
        autoComplete="off"
        slotProps={{ htmlInput: { maxLength: 200, spellCheck: false } }}
      />
      <FormControlLabel
        control={<Checkbox checked={remember} onChange={(e) => onRememberChange(e.target.checked)} size="small" />}
        label={<Typography variant="body2">Remember on this device (otherwise kept for this tab session only)</Typography>}
      />
      <Alert severity="info" sx={{ mt: 1 }}>
        The token is kept only in this browser. Shape Studio sends it straight to router.huggingface.co. The Future Lab
        sends it with each AI request to this app&apos;s server, which passes it to Hugging Face for that request only and
        never stores or logs it.
      </Alert>
    </>
  );
}
