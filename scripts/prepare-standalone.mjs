// Standalone output omits static assets; copy them next to server.js so `npm start` serves a complete app.
import { cpSync, existsSync } from 'node:fs';

const standalone = '.next/standalone';
if (!existsSync(standalone)) {
  console.error('No standalone build found. Run `npm run build` first.');
  process.exit(1);
}
cpSync('.next/static', `${standalone}/.next/static`, { recursive: true });
if (existsSync('public')) cpSync('public', `${standalone}/public`, { recursive: true });
console.log('Copied static assets into .next/standalone');
