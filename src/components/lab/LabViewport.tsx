'use client';

import { Grid, OrbitControls, TransformControls } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { boundsOf, collectParts, type PartMesh } from '@/lab/engine/parts';
import { getLabRoot, registerViewport, useLabStore } from '@/lab/store';

const noRaycast = () => null;

/** Time of the last gizmo release; the click that ends a drag must not clear the selection. */
let lastGizmoRelease = 0;
type OrbitControlsLike = { target: THREE.Vector3; update: () => void };

/** Bounding box outline for a selected (blue) or AI-targeted (orange) part. */
function PartBox({ object, color }: { object: THREE.Object3D; color: string }) {
  const helper = useMemo(() => {
    const h = new THREE.BoxHelper(object, color);
    h.raycast = noRaycast;
    return h;
  }, [object, color]);
  useEffect(
    () => () => {
      helper.geometry.dispose();
      (helper.material as THREE.Material).dispose();
    },
    [helper],
  );
  useFrame(() => helper.update());
  return <primitive object={helper} />;
}

function Highlights() {
  useLabStore((s) => s.version);
  const selected = useLabStore((s) => s.selected);
  const preview = useLabStore((s) => s.preview);
  const root = getLabRoot();
  if (!root) return null;
  const parts = collectParts(root);
  const boxes: Array<[string, THREE.Object3D, string]> = [];
  for (const id of preview) {
    const m = parts.get(id);
    if (m?.visible && !selected.includes(id)) boxes.push([`p:${id}`, m, '#ff9100']);
  }
  for (const id of selected) {
    const m = parts.get(id);
    if (m?.visible) boxes.push([`s:${id}`, m, '#3d5afe']);
  }
  return (
    <>
      {boxes.map(([key, object, color]) => (
        <PartBox key={key} object={object} color={color} />
      ))}
    </>
  );
}

/**
 * Move/rotate/scale gizmo for the selection. It drives a pivot at the selection's centre and applies
 * the pivot's change to every selected part, so a whole imported model moves as one.
 */
function SelectionGizmo() {
  const version = useLabStore((s) => s.version);
  const selected = useLabStore((s) => s.selected);
  const mode = useLabStore((s) => s.transformMode);
  const busy = useLabStore((s) => s.busy);
  const pivot = useMemo(() => new THREE.Object3D(), []);
  const drag = useRef<{ pivot: THREE.Matrix4; meshes: Array<[PartMesh, THREE.Matrix4]> } | null>(null);

  const root = getLabRoot();
  const parts = root ? collectParts(root) : null;
  const meshes = parts ? selected.map((id) => parts.get(id)).filter((m): m is PartMesh => Boolean(m?.visible)) : [];
  const key = `${version}:${selected.join(',')}`;

  useEffect(() => {
    if (drag.current) return;
    const box = boundsOf(meshes);
    if (box.isEmpty()) return;
    box.getCenter(pivot.position);
    pivot.quaternion.identity();
    pivot.scale.set(1, 1, 1);
    pivot.updateMatrixWorld();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` covers selection and scene changes
  }, [key, pivot]);

  if (meshes.length === 0 || busy) return null;

  const apply = () => {
    const d = drag.current;
    if (!d) return;
    pivot.updateMatrixWorld();
    const delta = pivot.matrixWorld.clone().multiply(d.pivot.clone().invert());
    for (const [mesh, startWorld] of d.meshes) {
      const parentInverse = mesh.parent ? mesh.parent.matrixWorld.clone().invert() : new THREE.Matrix4();
      parentInverse.multiply(delta).multiply(startWorld).decompose(mesh.position, mesh.quaternion, mesh.scale);
    }
  };

  return (
    <>
      <primitive object={pivot} />
      <TransformControls
        object={pivot}
        mode={mode}
        size={0.8}
        onMouseDown={() => {
          useLabStore.getState().beginTransform();
          pivot.updateMatrixWorld();
          drag.current = {
            pivot: pivot.matrixWorld.clone(),
            meshes: meshes.map((m) => {
              m.updateWorldMatrix(true, false);
              return [m, m.matrixWorld.clone()];
            }),
          };
        }}
        onObjectChange={apply}
        onMouseUp={() => {
          lastGizmoRelease = performance.now();
          drag.current = null;
          useLabStore.getState().endTransform();
        }}
      />
    </>
  );
}

function ViewportBridge() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const getThree = useThree((s) => s.get);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsLike | null;
  const focusRequest = useLabStore((s) => s.focusRequest);

  useEffect(() => {
    registerViewport({ renderer: gl, scene, camera });
    return () => registerViewport(null);
  }, [gl, scene, camera]);

  // Frame the model (or the selection) whenever a focus is requested.
  useEffect(() => {
    const root = getLabRoot();
    if (!root || !controls) return;
    const camera = getThree().camera as THREE.PerspectiveCamera;
    const parts = collectParts(root);
    const selected = useLabStore.getState().selected.map((id) => parts.get(id)).filter((m): m is NonNullable<typeof m> => Boolean(m));
    const box = boundsOf(selected.length ? selected : parts.values());
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const direction = camera.position.clone().sub(controls.target).normalize();
    if (direction.lengthSq() < 1e-6) direction.set(1, 0.7, 1).normalize();
    camera.position.copy(center).addScaledVector(direction, size * 1.4 + 0.2);
    camera.near = Math.max(0.001, size / 500);
    camera.far = Math.max(100, size * 50);
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
  }, [focusRequest, getThree, controls]);

  return null;
}

function Model() {
  const modelName = useLabStore((s) => s.modelName);
  const stats = useLabStore((s) => s.stats);
  const pick = useLabStore((s) => s.pick);
  const root = getLabRoot();
  if (!root) return null;
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 4 || performance.now() - lastGizmoRelease < 300) return;
    event.stopPropagation();
    const id = event.object.userData.partId as string | undefined;
    if (id) pick(id, event.shiftKey || event.ctrlKey || event.metaKey);
  };
  return <primitive key={`${modelName}:${stats?.parts}`} object={root} onClick={onClick} />;
}

export default function LabViewport() {
  const setSelected = useLabStore((s) => s.setSelected);
  const hasModel = useLabStore((s) => s.modelName !== null);
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [3, 2.4, 3.6], fov: 45, near: 0.01, far: 200 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onPointerMissed={(event) => {
        if (event.type === 'click' && performance.now() - lastGizmoRelease > 300) setSelected([]);
      }}
      style={{ touchAction: 'none' }}
      aria-label="Future Lab 3D view"
    >
      <color attach="background" args={['#EDEFF2']} />
      <hemisphereLight args={['#FFFFFF', '#B8C0CA', 0.85]} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[5, 9, 4]} intensity={1.6} />
      <directionalLight position={[-6, 4, -5]} intensity={0.45} />
      <Grid
        infiniteGrid
        position={[0, 0, 0]}
        cellSize={0.1}
        cellThickness={0.6}
        cellColor="#C3C9D1"
        sectionSize={1}
        sectionThickness={1}
        sectionColor="#9AA4B1"
        fadeDistance={40}
        fadeStrength={1.5}
        raycast={noRaycast}
      />
      {hasModel && <Model />}
      <Highlights />
      <SelectionGizmo />
      <OrbitControls makeDefault enableDamping />
      <ViewportBridge />
    </Canvas>
  );
}
