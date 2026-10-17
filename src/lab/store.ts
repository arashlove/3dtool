'use client';

import type * as THREE from 'three';
import { create } from 'zustand';
import { disposeObject } from '@/core/geometry/ThreeSceneMaster';
import type { SceneDocument } from '@/core/schema/scene';
import { applySteps } from './engine/apply';
import { exportGlb } from './engine/export';
import { boundsOf, collectParts, describeAll } from './engine/parts';
import { applyFaceLabels } from './engine/split';
import { Transaction, type HistoryEntry } from './engine/transaction';
import { loadFromStudio, loadGlbBuffer, loadGlbFile, placeBeside, type LoadedModel } from './loader';
import { captureMarkedViews } from './snapshot';
import { segmentByTexture as runTextureSegmentation } from './texseg';
import { loadTexture } from './textures';
import type { EditPlan, EditStep, HealthInfo, PartInfo, PlanRequest, Vec3 } from './types';

/**
 * Future Lab state. The three.js scene itself lives outside React state (mutable objects); the store
 * keeps derived part metadata and bumps `version` after every change so views re-render.
 */

export type ChatEntry = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  plan?: EditPlan;
  snapshot?: string | null;
  status?: 'pending' | 'ready' | 'applying' | 'applied' | 'discarded' | 'error';
};

export type Generate3dStatus = {
  stage: string;
  detail?: string;
  position?: number;
  eta?: number;
  progress?: number;
  startedAt: number;
};

export type Generate3dOptions = {
  image: string;
  name: string;
  quality: 'fast' | 'standard' | 'high';
  mode: 'add' | 'replace';
  /** Height in scene units when adding to the scene. */
  height: number;
};

export type Toast = { id: number; message: string; severity: 'success' | 'info' | 'warning' | 'error' };

type Viewport = { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera };

type LabState = {
  version: number;
  modelName: string | null;
  source: 'studio' | 'file' | null;
  stats: LoadedModel['stats'] | null;
  parts: PartInfo[];
  markers: Record<string, number>;
  selected: string[];
  preview: string[];
  past: HistoryEntry[];
  future: HistoryEntry[];
  chat: ChatEntry[];
  health: HealthInfo | null;
  healthError: string | null;
  vision: boolean;
  autoApply: boolean;
  splitComponents: boolean;
  textureSegments: number | null;
  busy: string | null;
  toast: Toast | null;
  focusRequest: number;
  generating3d: Generate3dStatus | null;

  checkHealth: () => Promise<void>;
  importStudio: (doc: SceneDocument | null) => void;
  /** `add` places the file beside the selection (or the scene); `replace` starts over with it. */
  importFile: (file: File, mode?: 'add' | 'replace') => Promise<void>;
  refresh: () => void;
  /** Parts-list click: one part. */
  select: (id: string, additive?: boolean) => void;
  /** Viewport click: the whole object first, then the clicked part on a second click. */
  pick: (id: string, additive?: boolean) => void;
  selectGroup: (groupId: string, additive?: boolean) => void;
  transformMode: 'translate' | 'rotate' | 'scale';
  setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  /** Gizmo drag start/end: the move between them becomes one undo step. */
  beginTransform: () => void;
  endTransform: () => void;
  setSelected: (ids: string[]) => void;
  setPreview: (ids: string[]) => void;
  setVisible: (id: string, visible: boolean) => void;
  renameParts: (labels: Record<string, string>, historyLabel?: string) => void;
  runEdit: (steps: EditStep[], label: string) => Promise<boolean>;
  sendPrompt: (prompt: string) => Promise<void>;
  applyChat: (id: string) => Promise<void>;
  discardChat: (id: string) => void;
  autoLabel: () => Promise<void>;
  segmentByTexture: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  downloadGlb: () => Promise<void>;
  set: (patch: Partial<Pick<LabState, 'vision' | 'autoApply' | 'splitComponents' | 'textureSegments'>>) => void;
  notify: (message: string, severity?: Toast['severity']) => void;
  dismissToast: () => void;
  requestFocus: () => void;
  generate3d: (options: Generate3dOptions) => Promise<boolean>;
  cancel3d: () => void;
};

let root: THREE.Group | null = null;
let viewport: Viewport | null = null;
let toastCounter = 0;
let generateController: AbortController | null = null;
let pendingMove: Transaction | null = null;

const sameSet = (a: string[], b: string[]) => a.length === b.length && b.every((x) => a.includes(x));
const HISTORY_LIMIT = 50;

export const getLabRoot = () => root;
export function registerViewport(v: Viewport | null) {
  viewport = v;
}

const uid = () => crypto.randomUUID();

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `Request failed (${response.status}).`;
}

function errorText(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  return /failed to fetch|networkerror|load failed/i.test(message) ? 'Cannot reach the 3DTool server. Is `npm run dev` running?' : message;
}

export const useLabStore = create<LabState>((set, get) => {
  const pushEntry = (entry: HistoryEntry) => {
    set((s) => ({ past: [...s.past, entry].slice(-HISTORY_LIMIT), future: [] }));
  };

  const updateChat = (id: string, patch: Partial<ChatEntry>) =>
    set((s) => ({ chat: s.chat.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  const setRoot = (loaded: LoadedModel, source: 'studio' | 'file') => {
    if (root) disposeObject(root);
    root = loaded.root;
    set({
      modelName: loaded.name,
      source,
      stats: loaded.stats,
      past: [],
      future: [],
      selected: [],
      preview: [],
      markers: {},
    });
    get().refresh();
    get().requestFocus();
  };

  /** Adds a loaded model beside the selection (or the whole scene) as one undo step. */
  const addBeside = (loaded: LoadedModel, height: number | null, label: string) => {
    if (!root) return;
    const existing = [...collectParts(root).values()];
    const selected = new Set(get().selected);
    const anchor = existing.filter((m) => selected.has(m.userData.partId as string));
    const parts = placeBeside(loaded, existing, boundsOf(anchor.length ? anchor : existing), height);
    disposeObject(loaded.root);
    const tx = new Transaction();
    for (const part of parts) tx.add(part, root);
    pushEntry(tx.commit(label));
    get().refresh();
    set({ selected: parts.map((p) => p.userData.partId as string), transformMode: 'translate' });
    get().requestFocus();
  };

  const editContext = () => ({
    loadTexture: async (prompt: string, kind: 'seamless' | 'decal' | 'wrap', aspect: number) => {
      const result = await loadTexture(prompt, kind, aspect);
      if (result.source === 'procedural') get().notify(`No HF_TOKEN: used a procedural ${kind} image for “${prompt}”.`, 'info');
      return result.texture;
    },
    viewport: viewport ? { renderer: viewport.renderer, camera: viewport.camera } : undefined,
  });

  return {
    version: 0,
    modelName: null,
    source: null,
    stats: null,
    parts: [],
    markers: {},
    selected: [],
    preview: [],
    past: [],
    future: [],
    chat: [],
    health: null,
    healthError: null,
    vision: true,
    autoApply: false,
    splitComponents: false,
    textureSegments: null,
    busy: null,
    toast: null,
    focusRequest: 0,
    generating3d: null,

    checkHealth: async () => {
      try {
        const response = await fetch('/api/lab/health', { cache: 'no-store' });
        if (!response.ok) throw new Error(await readError(response));
        set({ health: (await response.json()) as HealthInfo, healthError: null });
      } catch (e) {
        set({ health: null, healthError: errorText(e) });
      }
    },

    importStudio: (doc) => {
      if (!doc || doc.objects.length === 0) {
        get().notify('The Shape Studio scene is empty. Add objects there first, or open a .glb file.', 'warning');
        return;
      }
      try {
        const loaded = loadFromStudio(doc, get().splitComponents);
        setRoot(loaded, 'studio');
        get().notify(`Loaded “${loaded.name}” from Shape Studio: ${loaded.stats.parts} parts.`, 'success');
      } catch (e) {
        get().notify(`Could not load the Studio scene: ${errorText(e)}`, 'error');
      }
    },

    importFile: async (file, mode = 'add') => {
      set({ busy: 'Loading model…' });
      try {
        const loaded = await loadGlbFile(file, get().splitComponents);
        const summary = `${loaded.stats.parts} part${loaded.stats.parts === 1 ? '' : 's'}, ${loaded.stats.triangles.toLocaleString()} triangles`;
        if (mode === 'replace' || !root) {
          setRoot(loaded, 'file');
          get().notify(`Loaded ${file.name}: ${summary}.`, 'success');
        } else {
          const beside = get().selected.length ? 'the selection' : 'the scene';
          addBeside(loaded, null, `Add ${loaded.name}`);
          get().notify(`Added ${file.name} beside ${beside} (${summary}). Drag the gizmo to move it.`, 'success');
        }
      } catch (e) {
        get().notify(`Could not load ${file.name}: ${errorText(e)}`, 'error');
      } finally {
        set({ busy: null });
      }
    },

    refresh: () => {
      if (!root) {
        set((s) => ({ parts: [], version: s.version + 1 }));
        return;
      }
      const markers = get().markers;
      const parts = describeAll(root).map((p) => ({ ...p, marker: markers[p.id] ?? null }));
      const ids = new Set(parts.map((p) => p.id));
      set((s) => ({
        parts,
        selected: s.selected.filter((id) => ids.has(id)),
        preview: s.preview.filter((id) => ids.has(id)),
        version: s.version + 1,
      }));
    },

    select: (id, additive = false) =>
      set((s) => {
        if (!additive) return { selected: s.selected.length === 1 && s.selected[0] === id ? [] : [id] };
        return { selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id] };
      }),
    pick: (id, additive = false) => {
      const { parts, selected } = get();
      const groupId = parts.find((p) => p.id === id)?.group_id;
      const group = groupId ? parts.filter((p) => p.group_id === groupId && p.visible).map((p) => p.id) : [id];
      if (additive) {
        const all = group.every((g) => selected.includes(g));
        set({ selected: all ? selected.filter((x) => !group.includes(x)) : [...new Set([...selected, ...group])] });
      } else if (sameSet(selected, group) && group.length > 1) {
        set({ selected: [id] }); // second click on a selected object drills into the part
      } else {
        set({ selected: sameSet(selected, [id]) && group.length === 1 ? [] : group });
      }
    },
    selectGroup: (groupId, additive = false) => {
      const { parts, selected } = get();
      const group = parts.filter((p) => p.group_id === groupId).map((p) => p.id);
      set({ selected: additive ? [...new Set([...selected, ...group])] : group });
    },
    transformMode: 'translate',
    setTransformMode: (mode) => set({ transformMode: mode }),
    beginTransform: () => {
      if (!root) return;
      const parts = collectParts(root);
      pendingMove = new Transaction();
      for (const id of get().selected) {
        const m = parts.get(id);
        if (m) pendingMove.track(m);
      }
    },
    endTransform: () => {
      const tx = pendingMove;
      pendingMove = null;
      if (!tx || !tx.moved) return;
      const verb = { translate: 'Move', rotate: 'Rotate', scale: 'Scale' }[get().transformMode];
      const n = get().selected.length;
      pushEntry(tx.commit(`${verb} ${n} part${n === 1 ? '' : 's'}`));
      get().refresh();
    },
    setSelected: (ids) => set({ selected: ids }),
    setPreview: (ids) => set({ preview: ids }),

    setVisible: (id, visible) => {
      const mesh = root && collectParts(root).get(id);
      if (!mesh) return;
      const tx = new Transaction();
      tx.setVisible(mesh, visible);
      pushEntry(tx.commit(visible ? `Show ${mesh.userData.label}` : `Hide ${mesh.userData.label}`));
      get().refresh();
    },

    renameParts: (labels, historyLabel = 'Rename parts') => {
      if (!root) return;
      const parts = collectParts(root);
      const tx = new Transaction();
      for (const [id, label] of Object.entries(labels)) {
        const mesh = parts.get(id);
        const clean = label.trim().slice(0, 80);
        if (mesh && clean && clean !== mesh.userData.label) tx.setLabel(mesh, clean);
      }
      if (!tx.changed) return;
      pushEntry(tx.commit(historyLabel));
      get().refresh();
    },

    runEdit: async (steps, label) => {
      if (!root) return false;
      if (get().busy) {
        get().notify('Another task is still running.', 'warning');
        return false;
      }
      set({ busy: `${label}…` });
      try {
        const result = await applySteps(root, steps, editContext(), label);
        if (result.entry) pushEntry(result.entry);
        get().refresh();
        if (result.created.length) set({ selected: result.created });
        if (result.warnings.length) get().notify(result.warnings.join(' '), 'warning');
        else if (!result.entry) get().notify('Nothing changed.', 'info');
        return Boolean(result.entry);
      } catch (e) {
        get().notify(`Edit failed, nothing was changed: ${errorText(e)}`, 'error');
        return false;
      } finally {
        set({ busy: null });
      }
    },

    sendPrompt: async (prompt) => {
      const text = prompt.trim();
      if (!text || !root) return;
      const { vision, health, selected } = get();
      const userId = uid();
      const replyId = uid();
      set((s) => ({
        chat: [...s.chat, { id: userId, role: 'user', text }, { id: replyId, role: 'assistant', text: 'Planning…', status: 'pending' }],
      }));

      let snapshot: { image: string; markers: Record<string, number> } | null = null;
      if (vision && health?.ai_enabled && viewport) {
        try {
          snapshot = captureMarkedViews(viewport.renderer, viewport.scene, root);
          set({ markers: snapshot.markers });
          get().refresh();
        } catch (e) {
          get().notify(`Could not capture the snapshot (${errorText(e)}); planning without it.`, 'warning');
        }
      }

      const parts = get().parts;
      const box = boundsOf(collectParts(root).values());
      const size = box.isEmpty() ? [1, 1, 1] : box.getSize(box.min.clone()).toArray();
      const center = box.isEmpty() ? [0, 0, 0] : box.getCenter(box.min.clone()).toArray();
      const body: PlanRequest = {
        prompt: text,
        parts,
        selected_ids: selected,
        model_size: size as Vec3,
        model_center: center as Vec3,
        image: snapshot?.image ?? null,
      };
      try {
        const response = await fetch('/api/lab/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!response.ok) throw new Error(await readError(response));
        const plan = (await response.json()) as EditPlan;
        updateChat(replyId, { text: plan.summary, plan, snapshot: snapshot?.image ?? null, status: plan.steps.length ? 'ready' : 'discarded' });
        set({ preview: [...new Set(plan.steps.flatMap((s) => s.targets))] });
        if (plan.steps.length && get().autoApply) await get().applyChat(replyId);
      } catch (e) {
        updateChat(replyId, { text: errorText(e), status: 'error', snapshot: snapshot?.image ?? null });
      }
    },

    applyChat: async (id) => {
      const entry = get().chat.find((c) => c.id === id);
      if (!entry?.plan || entry.status === 'applied' || entry.status === 'applying') return;
      updateChat(id, { status: 'applying' });
      const ok = await get().runEdit(entry.plan.steps, entry.plan.summary.slice(0, 60) || 'AI edit');
      updateChat(id, { status: ok ? 'applied' : 'ready' });
      if (ok) set({ preview: [] });
    },

    discardChat: (id) => {
      updateChat(id, { status: 'discarded' });
      set({ preview: [] });
    },

    autoLabel: async () => {
      if (!root || !viewport) return;
      if (!get().health?.ai_enabled) {
        get().notify('AI names need HF_TOKEN in .env.local.', 'warning');
        return;
      }
      set({ busy: 'Naming parts…' });
      try {
        const snapshot = captureMarkedViews(viewport.renderer, viewport.scene, root);
        set({ markers: snapshot.markers });
        get().refresh();
        const response = await fetch('/api/lab/label-parts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parts: get().parts.filter((p) => p.visible && !p.decal_of), image: snapshot.image }),
        });
        if (!response.ok) throw new Error(await readError(response));
        const { labels } = (await response.json()) as { labels: Record<string, string> };
        const count = Object.keys(labels).length;
        set({ busy: null });
        get().renameParts(labels, 'AI part names');
        get().notify(count ? `Named ${count} part${count === 1 ? '' : 's'}.` : 'The model did not name any parts.', count ? 'success' : 'info');
      } catch (e) {
        get().notify(`AI naming failed: ${errorText(e)}`, 'error');
      } finally {
        set({ busy: null });
      }
    },

    segmentByTexture: async () => {
      if (!root) return;
      const { selected, parts, textureSegments } = get();
      const isDecal = (id: string) => Boolean(parts.find((p) => p.id === id)?.decal_of);
      const targets = (selected.length ? selected : parts.filter((p) => p.visible).map((p) => p.id)).filter((id) => !isDecal(id));
      if (targets.length === 0) {
        get().notify('Nothing to segment.', 'warning');
        return;
      }
      set({ busy: 'Segmenting by texture…' });
      // Let the busy indicator paint before the CPU-heavy work starts.
      await new Promise((r) => setTimeout(r, 30));
      try {
        const result = runTextureSegmentation(root, targets, textureSegments);
        const names = result.segments.map((s) => s.name);
        const applied = applyFaceLabels(
          root,
          result.face_labels,
          (label, original, split) => (split ? `${names[label]} · ${original.userData.label as string}` : (original.userData.label as string)),
          `Segment by texture (${result.num_segments})`,
        );
        if (applied.entry) pushEntry(applied.entry);
        get().refresh();
        const fewer = textureSegments && result.num_segments < textureSegments ? ` (only ${result.num_segments} distinct colors found)` : '';
        const skipped = applied.skipped.length ? ` Skipped ${applied.skipped.length} part(s).` : '';
        get().notify(
          `Found ${result.num_segments} color region${result.num_segments === 1 ? '' : 's'}: ${names.join(', ')} → ${applied.created} new part${applied.created === 1 ? '' : 's'}${fewer}.${skipped}`,
          'success',
        );
      } catch (e) {
        get().notify(`Texture segmentation failed: ${errorText(e)}`, 'error');
      } finally {
        set({ busy: null });
      }
    },

    undo: () => {
      const { past, future } = get();
      const entry = past[past.length - 1];
      if (!entry || get().busy) return;
      entry.undo();
      set({ past: past.slice(0, -1), future: [entry, ...future] });
      get().refresh();
      get().notify(`Undid: ${entry.label}`, 'info');
    },
    redo: () => {
      const { past, future } = get();
      const entry = future[0];
      if (!entry || get().busy) return;
      entry.redo();
      set({ past: [...past, entry], future: future.slice(1) });
      get().refresh();
      get().notify(`Redid: ${entry.label}`, 'info');
    },

    downloadGlb: async () => {
      if (!root) return;
      set({ busy: 'Exporting…' });
      try {
        const data = await exportGlb(root, 'label');
        const url = URL.createObjectURL(new Blob([data], { type: 'model/gltf-binary' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(get().modelName ?? 'model').replace(/[^\w.-]+/g, '_')}-edited.glb`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (e) {
        get().notify(`Export failed: ${errorText(e)}`, 'error');
      } finally {
        set({ busy: null });
      }
    },

    set: (patch) => set(patch),
    notify: (message, severity = 'info') => set({ toast: { id: ++toastCounter, message, severity } }),
    dismissToast: () => set({ toast: null }),
    requestFocus: () => set((s) => ({ focusRequest: s.focusRequest + 1 })),

    generate3d: async ({ image, name, quality, mode, height }) => {
      if (get().generating3d) return false;
      const controller = new AbortController();
      generateController = controller;
      const startedAt = Date.now();
      set({ generating3d: { stage: 'Sending image', startedAt } });
      try {
        const response = await fetch('/api/lab/generate-3d', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image, quality, seed: Math.floor(Math.random() * 2_147_483_647) }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(await readError(response));
        // NDJSON: progress lines, then one done or error line.
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        let glb: ArrayBuffer | null = null;
        let model = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          let newline: number;
          while ((newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line) continue;
            const msg = JSON.parse(line) as { type: string; error?: string; glb?: string; model?: string } & Partial<Generate3dStatus>;
            if (msg.type === 'progress') set({ generating3d: { stage: msg.stage ?? 'Working', detail: msg.detail, position: msg.position, eta: msg.eta, progress: msg.progress, startedAt } });
            else if (msg.type === 'error') throw new Error(msg.error ?? '3D generation failed.');
            else if (msg.type === 'done' && msg.glb) {
              const bytes = Uint8Array.from(atob(msg.glb), (c) => c.charCodeAt(0));
              glb = bytes.buffer;
              model = msg.model ?? '';
            }
          }
        }
        if (!glb) throw new Error('The server ended without a model.');
        set({ generating3d: { stage: 'Loading model', startedAt } });
        const loaded = await loadGlbBuffer(glb, name, get().splitComponents);
        if (mode === 'replace' || !root) {
          setRoot(loaded, 'file');
        } else {
          addBeside(loaded, height, `Add ${name}`);
        }
        get().notify(`Generated “${name}” with ${model} (${Math.round((Date.now() - startedAt) / 1000)} s).`, 'success');
        return true;
      } catch (e) {
        if (controller.signal.aborted) get().notify('3D generation cancelled.', 'info');
        else get().notify(`3D generation failed: ${errorText(e)}`, 'error');
        return false;
      } finally {
        generateController = null;
        set({ generating3d: null });
      }
    },
    cancel3d: () => generateController?.abort(),
  };
});
