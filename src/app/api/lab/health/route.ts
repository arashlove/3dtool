import { connection } from 'next/server';
import { health } from '@/lab/server/hf';

export async function GET() {
  await connection();
  return Response.json(health());
}
