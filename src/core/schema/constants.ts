export const LIMITS = {
  maxObjects: 40,
  maxOpsPerPlan: 12,
  maxNameLength: 100,
  maxPromptLength: 1000,
  maxMessageLength: 400,
  positionMin: -20,
  positionMax: 20,
  rotationMaxRad: Math.PI * 4,
  rotationMaxDeg: 720,
  scaleMin: 0.05,
  scaleMax: 10,
  maxGap: 5,
  maxTriangles: 150_000,
  maxImportBytes: 2_000_000,
  maxModelOutputChars: 8_000,
  historyLimit: 50,
  maxContextObjects: 20,
} as const;

export const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
