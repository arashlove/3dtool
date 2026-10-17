'use client';

import { Grid, OrbitControls, TransformControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { applyTransform, sceneMaster } from '@/core/geometry/ThreeSceneMaster';
import { LIMITS } from '@/core/schema/constants';
import type { SceneObject } from '@/core/schema/scene';
import { selectSelectedObject, useSceneStore } from '@/state/scene-store';
import { notify } from '@/state/ui-store';
import { SceneObjectView } from './SceneObjectView';

const DEFAULT_CAMERA: [number, number, number] = [5, 4, 6];
const DEFAULT_TARGET: [number, number, number] = [0, 0.5, 0];
const RAD2DEG = 180 / Math.PI;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const noRaycast = () => null;

type OrbitControlsLike = { target: THREE.Vector3; update: () => void };

/** Time of the last gizmo release; the click that ends a drag must not clear the selection. */
let lastGizmoRelease = 0;

function SelectionBox({ object }: { object: THREE.Object3D }) {
  const helper = useMemo(() => {
    const h = new THREE.BoxHelper(object, '#3D5AFE');
    h.raycast = noRaycast;
    h.userData.editorHelper = true;
    return h;
  }, [object]);
  useEffect(() => () => {
    helper.geometry.dispose();
    (helper.material as THREE.Material).dispose();
  }, [helper]);
  useFrame(() => helper.update());
  return <primitive object={helper} />;
}

function CameraRig() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsLike | null;
  const focusRequest = useSceneStore((s) => s.focusRequest);
  const resetViewRequest = useSceneStore((s) => s.resetViewRequest);

  useEffect(() => {
    if (!controls || focusRequest === 0) return;
    const obj = selectSelectedObject(useSceneStore.getState());
    if (!obj) return;
    const b = sceneMaster.getBounds(obj);
    const center = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    const size = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    const direction = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(center).addScaledVector(direction, size * 2.2 + 0.8);
    controls.target.copy(center);
    controls.update();
  }, [focusRequest, camera, controls]);

  useEffect(() => {
    if (!controls || resetViewRequest === 0) return;
    camera.position.set(...DEFAULT_CAMERA);
    controls.target.set(...DEFAULT_TARGET);
    controls.update();
  }, [resetViewRequest, camera, controls]);

  return null;
}

function Gizmo({ object, spec }: { object: THREE.Group; spec: SceneObject }) {
  const mode = useSceneStore((s) => s.transformMode);
  const settings = useSceneStore((s) => s.doc.settings);
  const runOperations = useSceneStore((s) => s.runOperations);

  const commit = () => {
    lastGizmoRelease = performance.now();
    const p = object.position;
    const r = object.rotation;
    const s = object.scale;
    const current = [...p.toArray(), r.x, r.y, r.z, ...s.toArray()];
    const stored = [...spec.transform.position, ...spec.transform.rotation, ...spec.transform.scale];
    if (current.every((v, i) => Math.abs(v - stored[i]) < 1e-5)) return;
    const result = runOperations([
      {
        op: 'set_transform',
        target: spec.id,
        position: [
          r4(clamp(p.x, LIMITS.positionMin, LIMITS.positionMax)),
          r4(clamp(p.y, LIMITS.positionMin, LIMITS.positionMax)),
          r4(clamp(p.z, LIMITS.positionMin, LIMITS.positionMax)),
        ],
        rotationDeg: [r4(r.x * RAD2DEG), r4(r.y * RAD2DEG), r4(r.z * RAD2DEG)],
        scale: [
          r4(clamp(s.x, LIMITS.scaleMin, LIMITS.scaleMax)),
          r4(clamp(s.y, LIMITS.scaleMin, LIMITS.scaleMax)),
          r4(clamp(s.z, LIMITS.scaleMin, LIMITS.scaleMax)),
        ],
      },
    ]);
    if (!result.ok) {
      applyTransform(object, spec.transform);
      notify(result.error, 'error');
    }
  };

  return (
    <TransformControls
      object={object}
      mode={mode}
      size={0.8}
      translationSnap={settings.snapEnabled ? settings.snapStep : null}
      rotationSnap={settings.snapEnabled ? THREE.MathUtils.degToRad(15) : null}
      scaleSnap={settings.snapEnabled ? 0.1 : null}
      onMouseUp={commit}
    />
  );
}

export default function SceneCanvas() {
  const objects = useSceneStore((s) => s.doc.objects);
  const settings = useSceneStore((s) => s.doc.settings);
  const selected = useSceneStore(selectSelectedObject);
  const select = useSceneStore((s) => s.select);
  const [groups, setGroups] = useState<Record<string, THREE.Group>>({});

  const register = useCallback((id: string, group: THREE.Group | null) => {
    setGroups((current) => {
      if (group) return current[id] === group ? current : { ...current, [id]: group };
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const handleSelect = useCallback((id: string, part: string | null) => select(id, part), [select]);
  const selectedGroup = selected ? groups[selected.id] : undefined;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: DEFAULT_CAMERA, fov: 45, near: 0.05, far: 200 }}
      gl={{ antialias: true }}
      onPointerMissed={(event) => {
        if (event.type !== 'click' || performance.now() - lastGizmoRelease < 300) return;
        select(null);
      }}
      style={{ touchAction: 'none' }}
      aria-label="3D scene view"
    >
      <color attach="background" args={['#EDEFF2']} />
      <hemisphereLight args={['#FFFFFF', '#B8C0CA', 0.85]} />
      <ambientLight intensity={0.2} />
      <directionalLight
        position={[5, 9, 4]}
        intensity={1.7}
        castShadow={settings.shadowsEnabled}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={0.5}
        shadow-camera-far={40}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-6, 4, -5]} intensity={0.35} />

      <mesh rotation-x={-Math.PI / 2} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#E4E7EB" roughness={0.95} />
      </mesh>
      {settings.gridVisible && (
        <Grid
          infiniteGrid
          position={[0, 0.001, 0]}
          cellSize={0.1}
          cellThickness={0.6}
          cellColor="#C3C9D1"
          sectionSize={1}
          sectionThickness={1}
          sectionColor="#9AA4B1"
          fadeDistance={45}
          fadeStrength={1.5}
          raycast={noRaycast}
        />
      )}

      <group name="objects-root">
        {objects.map((o) => (
          <SceneObjectView key={o.id} spec={o} onSelect={handleSelect} onRegister={register} />
        ))}
      </group>

      {selected && selectedGroup && selected.visible && <SelectionBox object={selectedGroup} />}
      {selected && selectedGroup && selected.visible && !selected.locked && <Gizmo object={selectedGroup} spec={selected} />}

      <OrbitControls makeDefault enableDamping target={DEFAULT_TARGET} maxPolarAngle={Math.PI / 2 - 0.02} minDistance={0.3} maxDistance={60} />
      <CameraRig />
    </Canvas>
  );
}
