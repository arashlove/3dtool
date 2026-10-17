import * as THREE from 'three';
import type { PartMesh } from './parts';

/**
 * Geometry and materials that existed before an edit are never mutated. A transaction clones them
 * on first write and records the old references, so undo/redo just swaps references.
 */

type MeshState = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  visible: boolean;
  label: string;
};

export type HistoryEntry = {
  label: string;
  undo: () => void;
  redo: () => void;
};

const stateOf = (mesh: PartMesh): MeshState => ({
  geometry: mesh.geometry,
  material: mesh.material,
  visible: mesh.visible,
  label: mesh.userData.label as string,
});

function applyState(mesh: PartMesh, s: MeshState) {
  mesh.geometry = s.geometry;
  mesh.material = s.material;
  mesh.visible = s.visible;
  mesh.userData.label = s.label;
}

export class Transaction {
  private before = new Map<PartMesh, MeshState>();
  private clonedGeometry = new Set<PartMesh>();
  private clonedMaterial = new Set<PartMesh>();
  private added: Array<{ mesh: PartMesh; parent: THREE.Object3D }> = [];
  private done = false;

  private touch(mesh: PartMesh) {
    if (!this.before.has(mesh) && !this.added.some((a) => a.mesh === mesh)) this.before.set(mesh, stateOf(mesh));
  }

  /** Writable geometry for this mesh (cloned once per transaction). */
  geometry(mesh: PartMesh): THREE.BufferGeometry {
    this.touch(mesh);
    if (!this.clonedGeometry.has(mesh) && !this.added.some((a) => a.mesh === mesh)) {
      mesh.geometry = mesh.geometry.clone();
      this.clonedGeometry.add(mesh);
    }
    return mesh.geometry;
  }

  setGeometry(mesh: PartMesh, geometry: THREE.BufferGeometry) {
    this.touch(mesh);
    mesh.geometry = geometry;
    this.clonedGeometry.add(mesh);
  }

  /** Writable materials for this mesh (cloned once per transaction). */
  materials(mesh: PartMesh): THREE.Material[] {
    this.touch(mesh);
    if (!this.clonedMaterial.has(mesh) && !this.added.some((a) => a.mesh === mesh)) {
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
      this.clonedMaterial.add(mesh);
    }
    return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  }

  setVisible(mesh: PartMesh, visible: boolean) {
    this.touch(mesh);
    mesh.visible = visible;
  }

  setLabel(mesh: PartMesh, label: string) {
    this.touch(mesh);
    mesh.userData.label = label;
  }

  add(mesh: PartMesh, parent: THREE.Object3D) {
    parent.add(mesh);
    this.added.push({ mesh, parent });
  }

  get changed(): boolean {
    return this.before.size > 0 || this.added.length > 0;
  }

  commit(label: string): HistoryEntry {
    this.done = true;
    const before = new Map(this.before);
    const after = new Map([...before.keys()].map((m) => [m, stateOf(m)] as const));
    const added = [...this.added];
    return {
      label,
      undo: () => {
        for (const [mesh, s] of before) applyState(mesh, s);
        for (const { mesh } of added) mesh.removeFromParent();
      },
      redo: () => {
        for (const [mesh, s] of after) applyState(mesh, s);
        for (const { mesh, parent } of added) parent.add(mesh);
      },
    };
  }

  /** Restores everything touched so far (an edit threw halfway through). */
  rollback() {
    if (this.done) return;
    this.done = true;
    for (const [mesh, s] of this.before) {
      if (mesh.geometry !== s.geometry && this.clonedGeometry.has(mesh)) mesh.geometry.dispose();
      applyState(mesh, s);
    }
    for (const { mesh } of this.added) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
  }
}
