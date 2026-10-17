import * as THREE from 'three';
import { addPart, createContext, num, roundedBox, type Builder } from './common';

export const buildBox: Builder = (spec) => {
  const ctx = createContext(spec);
  const w = num(spec, 'width');
  const h = num(spec, 'height');
  const d = num(spec, 'depth');
  const bevel = num(spec, 'bevelRadius');
  const geometry = bevel > 0 ? roundedBox(w, h, d, bevel, 3) : new THREE.BoxGeometry(w, h, d);
  addPart(ctx, geometry, 'main', 'box', [0, h / 2, 0]);
  return ctx.group;
};

export const buildSphere: Builder = (spec) => {
  const ctx = createContext(spec);
  const r = num(spec, 'radius');
  const seg = Math.round(num(spec, 'segments'));
  addPart(ctx, new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.75))), 'main', 'sphere', [0, r, 0]);
  return ctx.group;
};

export const buildCylinder: Builder = (spec) => {
  const ctx = createContext(spec);
  const h = num(spec, 'height');
  const geometry = new THREE.CylinderGeometry(
    num(spec, 'radiusTop'),
    num(spec, 'radiusBottom'),
    h,
    Math.round(num(spec, 'segments')),
  );
  addPart(ctx, geometry, 'main', 'cylinder', [0, h / 2, 0]);
  return ctx.group;
};

export const buildCone: Builder = (spec) => {
  const ctx = createContext(spec);
  const h = num(spec, 'height');
  addPart(ctx, new THREE.ConeGeometry(num(spec, 'radius'), h, Math.round(num(spec, 'segments'))), 'main', 'cone', [0, h / 2, 0]);
  return ctx.group;
};

/** The torus lies flat (ring in the XZ plane) and rests on the floor. */
export const buildTorus: Builder = (spec) => {
  const ctx = createContext(spec);
  const tube = num(spec, 'tubeRadius');
  addPart(ctx, new THREE.TorusGeometry(num(spec, 'radius'), tube, 24, 64), 'main', 'torus', [0, tube, 0], [-Math.PI / 2, 0, 0]);
  return ctx.group;
};
