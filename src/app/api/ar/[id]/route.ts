import { arHandlers } from '@/ar/handlers';

/** Serves a shared scene GLB to the phone (model-viewer, Scene Viewer or Quick Look). */
export async function GET(_request: Request, ctx: RouteContext<'/api/ar/[id]'>) {
  const { id } = await ctx.params;
  return arHandlers().download(id, 'GET');
}

export async function HEAD(_request: Request, ctx: RouteContext<'/api/ar/[id]'>) {
  const { id } = await ctx.params;
  return arHandlers().download(id, 'HEAD');
}
