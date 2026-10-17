import { create } from 'zustand';
import { applyOperations, applyPlan, type DispatchResult } from '@/core/commands/dispatcher';
import { LIMITS } from '@/core/schema/constants';
import type { SceneOperation, ScenePlan } from '@/core/schema/plan';
import { NameSchema, createEmptyDocument, type SceneDocument, type SceneSettings } from '@/core/schema/scene';
import { shareUnchanged } from './structural-sharing';

export type TransformMode = 'translate' | 'rotate' | 'scale';

type SceneState = {
  doc: SceneDocument;
  selectedId: string | null;
  selectedPart: string | null;
  past: SceneDocument[];
  future: SceneDocument[];
  transformMode: TransformMode;
  /** Incremented to ask the canvas to frame the selection / reset the camera. */
  focusRequest: number;
  resetViewRequest: number;
  dirty: boolean;
  hydrated: boolean;

  select: (id: string | null, part?: string | null) => void;
  setTransformMode: (mode: TransformMode) => void;
  requestFocus: () => void;
  requestResetView: () => void;

  /** Applies operations through the validated dispatcher as one undo step. */
  runOperations: (ops: SceneOperation[]) => DispatchResult;
  /** Applies an AI plan through the validated dispatcher as one undo step. */
  runPlan: (plan: ScenePlan, aliases: Record<string, string>) => DispatchResult;

  rename: (id: string, name: string) => string | null;
  setVisible: (id: string, visible: boolean) => void;
  setLocked: (id: string, locked: boolean) => void;
  setTitle: (title: string) => string | null;
  updateSettings: (patch: Partial<SceneSettings>) => void;
  replaceDocument: (doc: SceneDocument, options?: { undoable?: boolean; markClean?: boolean }) => void;
  clearScene: () => void;
  markSaved: () => void;
  setHydrated: () => void;

  undo: () => void;
  redo: () => void;
};

function pushHistory(past: SceneDocument[], doc: SceneDocument): SceneDocument[] {
  const next = [...past, doc];
  return next.length > LIMITS.historyLimit ? next.slice(next.length - LIMITS.historyLimit) : next;
}

function validSelection(doc: SceneDocument, id: string | null): string | null {
  return id && doc.objects.some((o) => o.id === id) ? id : null;
}

export const useSceneStore = create<SceneState>((set, get) => {
  const commit = (nextDoc: SceneDocument, selectId?: string | null) => {
    const state = get();
    const doc = shareUnchanged(state.doc, nextDoc);
    set({
      past: pushHistory(state.past, state.doc),
      future: [],
      doc,
      dirty: true,
      selectedId: selectId === undefined ? validSelection(doc, state.selectedId) : validSelection(doc, selectId),
      selectedPart: selectId === undefined || selectId === state.selectedId ? state.selectedPart : null,
    });
  };

  const updateObject = (id: string, patch: (o: SceneDocument['objects'][number]) => void) => {
    const doc = structuredClone(get().doc);
    const obj = doc.objects.find((o) => o.id === id);
    if (!obj) return;
    patch(obj);
    commit(doc);
  };

  return {
    doc: createEmptyDocument(),
    selectedId: null,
    selectedPart: null,
    past: [],
    future: [],
    transformMode: 'translate',
    focusRequest: 0,
    resetViewRequest: 0,
    dirty: false,
    hydrated: false,

    select: (id, part = null) => set({ selectedId: validSelection(get().doc, id), selectedPart: id ? part : null }),
    setTransformMode: (mode) => set({ transformMode: mode }),
    requestFocus: () => set((s) => ({ focusRequest: s.focusRequest + 1 })),
    requestResetView: () => set((s) => ({ resetViewRequest: s.resetViewRequest + 1 })),

    runOperations: (ops) => {
      const result = applyOperations(get().doc, ops, { selectedId: get().selectedId });
      if (result.ok) commit(result.doc, result.selectId);
      return result;
    },

    runPlan: (plan, aliases) => {
      const result = applyPlan(get().doc, plan, { selectedId: get().selectedId, aliases });
      if (result.ok) commit(result.doc, result.selectId);
      return result;
    },

    rename: (id, name) => {
      const parsed = NameSchema.safeParse(name);
      if (!parsed.success) return `Name must be 1–${LIMITS.maxNameLength} characters.`;
      updateObject(id, (o) => {
        o.name = parsed.data;
      });
      return null;
    },
    setVisible: (id, visible) =>
      updateObject(id, (o) => {
        o.visible = visible;
      }),
    setLocked: (id, locked) =>
      updateObject(id, (o) => {
        o.locked = locked;
      }),
    setTitle: (title) => {
      const parsed = NameSchema.safeParse(title);
      if (!parsed.success) return `Title must be 1–${LIMITS.maxNameLength} characters.`;
      commit({ ...structuredClone(get().doc), title: parsed.data });
      return null;
    },
    updateSettings: (patch) => {
      const doc = structuredClone(get().doc);
      doc.settings = { ...doc.settings, ...patch };
      set({ doc, dirty: true });
    },
    replaceDocument: (doc, options = {}) => {
      const state = get();
      set({
        doc,
        past: options.undoable ? pushHistory(state.past, state.doc) : [],
        future: [],
        selectedId: null,
        selectedPart: null,
        dirty: !options.markClean,
      });
    },
    clearScene: () => {
      const doc = structuredClone(get().doc);
      doc.objects = doc.objects.filter((o) => o.locked);
      commit(doc, null);
    },
    markSaved: () => set({ dirty: false }),
    setHydrated: () => set({ hydrated: true }),

    undo: () => {
      const { past, future, doc, selectedId } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      set({
        past: past.slice(0, -1),
        future: [doc, ...future].slice(0, LIMITS.historyLimit),
        doc: previous,
        dirty: true,
        selectedId: validSelection(previous, selectedId),
      });
    },
    redo: () => {
      const { past, future, doc, selectedId } = get();
      if (future.length === 0) return;
      const next = future[0];
      set({
        past: pushHistory(past, doc),
        future: future.slice(1),
        doc: next,
        dirty: true,
        selectedId: validSelection(next, selectedId),
      });
    },
  };
});

export function selectSelectedObject(state: SceneState) {
  return state.selectedId ? (state.doc.objects.find((o) => o.id === state.selectedId) ?? null) : null;
}
