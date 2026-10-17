import * as THREE from 'three';
import { KIND_DEFS, OBJECT_KINDS, type ObjectKind } from '../schema/kinds';
import type { SceneDocument, SceneObject, TransformSpec } from '../schema/scene';
import { buildDoorSingle, buildWindowSingle } from './builders/architecture/openings';
import { buildRoomCeiling, buildRoomFloor, buildRoomWall } from './builders/architecture/structure';
import type { Builder } from './builders/common';
import { buildRugRectangular } from './builders/decor/rugs';
import { buildMirrorRectangular, buildPictureFramed } from './builders/decor/wall-decor';
import { buildTelevisionFlat } from './builders/electronics/displays';
import { buildChair, buildLamp, buildShelf, buildSofa, buildTable } from './builders/furniture';
import { buildBedPlatform } from './builders/furniture/beds';
import { buildDiningChair, buildSofaTwoSeater } from './builders/furniture/seating';
import { buildBookshelfOpen, buildCabinet, buildFloatingShelf, buildNightstand } from './builders/furniture/storage';
import { buildCoffeeTable, buildDesk, buildDiningTable } from './builders/furniture/tables';
import { buildLampTable } from './builders/lighting/lamps';
import { buildPlantPot } from './builders/plants/pots';
import { buildBox, buildCone, buildCylinder, buildSphere, buildTorus } from './builders/primitives';
import { buildRoom } from './builders/room';

/** Explicit kind → builder registry. The Record type forces a builder for every registered kind. */
const builders: Record<ObjectKind, Builder> = {
  box: buildBox,
  sphere: buildSphere,
  cylinder: buildCylinder,
  cone: buildCone,
  torus: buildTorus,
  table: buildTable,
  chair: buildChair,
  shelf: buildShelf,
  lamp: buildLamp,
  sofa: buildSofa,
  room: buildRoom,
  room_floor: buildRoomFloor,
  room_wall: buildRoomWall,
  room_ceiling: buildRoomCeiling,
  door_single: buildDoorSingle,
  window_single: buildWindowSingle,
  dining_table_rectangular: buildDiningTable,
  dining_chair_basic: buildDiningChair,
  coffee_table_rectangular: buildCoffeeTable,
  desk_basic: buildDesk,
  sofa_two_seater: buildSofaTwoSeater,
  bed_platform: buildBedPlatform,
  nightstand_basic: buildNightstand,
  bookshelf_open: buildBookshelfOpen,
  cabinet_basic: buildCabinet,
  floating_shelf: buildFloatingShelf,
  lamp_table: buildLampTable,
  picture_framed: buildPictureFramed,
  mirror_rectangular: buildMirrorRectangular,
  rug_rectangular: buildRugRectangular,
  plant_pot: buildPlantPot,
  television_flat: buildTelevisionFlat,
};

export type Bounds = { min: [number, number, number]; max: [number, number, number] };

/**
 * Trusted procedural geometry system. Turns validated SceneObject specs into Three.js groups.
 * Model output never reaches this class directly; only dispatcher-validated documents do.
 */
export class ThreeSceneMaster {
  private triangleCache = new Map<string, number>();

  /** Builds the object's geometry in local space (bottom-centre pivot), without its transform. */
  buildLocal(spec: SceneObject): THREE.Group {
    const group = builders[spec.kind](spec);
    group.userData.objectId = spec.id;
    return group;
  }

  /** Builds the object with its transform applied. */
  build(spec: SceneObject): THREE.Group {
    const group = this.buildLocal(spec);
    applyTransform(group, spec.transform);
    group.visible = spec.visible;
    return group;
  }

  rebuild(spec: SceneObject, previous?: THREE.Object3D): THREE.Group {
    if (previous) disposeObject(previous);
    return this.build(spec);
  }

  /** World-space axis-aligned bounds of the object with its transform applied. */
  getBounds(spec: SceneObject): Bounds {
    const group = this.build(spec);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    disposeObject(group);
    return { min: box.min.toArray() as Bounds['min'], max: box.max.toArray() as Bounds['max'] };
  }

  countTriangles(spec: SceneObject): number {
    const key = `${spec.kind}:${JSON.stringify(spec.params)}`;
    const cached = this.triangleCache.get(key);
    if (cached !== undefined) return cached;
    const group = this.buildLocal(spec);
    const count = countGroupTriangles(group);
    disposeObject(group);
    if (this.triangleCache.size > 500) this.triangleCache.clear();
    this.triangleCache.set(key, count);
    return count;
  }

  countSceneTriangles(doc: SceneDocument): number {
    return doc.objects.reduce((sum, o) => sum + this.countTriangles(o), 0);
  }

  /** Builds an export-only scene from the document: geometry and materials only, no editor helpers. */
  buildExportScene(doc: SceneDocument): THREE.Scene {
    const scene = new THREE.Scene();
    scene.name = doc.title;
    for (const obj of doc.objects) {
      if (!obj.visible) continue;
      scene.add(this.build(obj));
    }
    return scene;
  }

  listSupportedKinds(): ObjectKind[] {
    return [...OBJECT_KINDS];
  }

  listEditableParts(kind: ObjectKind): string[] {
    return KIND_DEFS[kind].parts.map((p) => p.key);
  }
}

export function applyTransform(object: THREE.Object3D, t: TransformSpec) {
  object.position.set(...t.position);
  object.rotation.set(t.rotation[0], t.rotation[1], t.rotation[2], 'XYZ');
  object.scale.set(...t.scale);
}

export function countGroupTriangles(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    total += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
  });
  return Math.round(total);
}

/** Frees GPU resources (geometries and materials) of an object tree. */
export function disposeObject(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}

export const sceneMaster = new ThreeSceneMaster();
