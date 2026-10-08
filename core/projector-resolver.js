import { parseProjectorId, projectorIdToDwhSymbol } from './projector-id.js';
import { projectDwhSymbol } from './dwh.js';

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const CONTEXT_STATE = new WeakMap();

function isPlainObject(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateDeclarativeValue(value, {
  depth = 0,
  maxDepth = 64,
  seen = new WeakSet(),
  path = '$',
} = {}) {
  if (depth > maxDepth) throw new Error(`projector projection exceeds maximum structure depth at ${path}`);

  if (value == null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`projector projection contains a non-finite number at ${path}`);
    return true;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error(`projector projection must not contain cycles at ${path}`);
    seen.add(value);
    value.forEach((item, index) => validateDeclarativeValue(item, {
      depth: depth + 1, maxDepth, seen, path: `${path}[${index}]`,
    }));
    seen.delete(value);
    return true;
  }

  if (!isPlainObject(value)) throw new TypeError(`projector projection contains a non-declarative value at ${path}`);
  if (seen.has(value)) throw new Error(`projector projection must not contain cycles at ${path}`);

  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`forbidden projector projection key at ${path}.${key}`);
    validateDeclarativeValue(child, { depth: depth + 1, maxDepth, seen, path: `${path}.${key}` });
  }
  seen.delete(value);
  return true;
}

function validateProjectorProjection(value, { maxDepth = 64 } = {}) {
  if (!isPlainObject(value)) throw new TypeError('projector DWH data must be an object');
  const keys = new Set(Object.keys(value));
  for (const required of ['renderer', 'projection']) {
    if (!keys.has(required)) throw new Error(`projector DWH data missing required field: ${required}`);
  }
  for (const key of keys) {
    if (key !== 'renderer' && key !== 'projection') throw new Error(`unknown projector DWH data field: ${key}`);
  }
  if (typeof value.renderer !== 'string' || !value.renderer.startsWith('/')) {
    throw new Error('projector renderer binding must be a logical root-relative path');
  }
  if (!isPlainObject(value.projection)) throw new TypeError('projector projection must be an object');
  validateDeclarativeValue(value.projection, { maxDepth });
  return true;
}

function deepFreezeDeclarative(value) {
  if (Array.isArray(value)) {
    value.forEach(deepFreezeDeclarative);
    return Object.freeze(value);
  }
  if (isPlainObject(value)) {
    Object.values(value).forEach(deepFreezeDeclarative);
    return Object.freeze(value);
  }
  return value;
}

function createProjectorResolutionContext({ maxDepth = 32 } = {}) {
  if (!Number.isInteger(maxDepth) || maxDepth < 1) {
    throw new TypeError('projector resolution maxDepth must be a positive integer');
  }
  const context = Object.freeze({ maxDepth });
  CONTEXT_STATE.set(context, { stack: [] });
  return context;
}

function enterProjectorResolution(context, id) {
  const state = CONTEXT_STATE.get(context);
  if (!state) throw new TypeError('invalid projector resolution context');
  if (state.stack.includes(id)) throw new Error(`projector resolution cycle: ${[...state.stack, id].join(' -> ')}`);
  if (state.stack.length >= context.maxDepth) {
    throw new Error(`projector resolution exceeds maxDepth=${context.maxDepth}: ${[...state.stack, id].join(' -> ')}`);
  }
  state.stack.push(id);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    const current = state.stack.pop();
    if (current !== id) {
      state.stack.length = 0;
      throw new Error('projector resolution context stack corruption');
    }
  };
}

async function resolveProjector(id, {
  dwh,
  dwhContext = Object.freeze({}),
  context = createProjectorResolutionContext(),
  maxStructureDepth = 64,
} = {}) {
  const canonicalId = parseProjectorId(id).id;
  const symbol = projectorIdToDwhSymbol(canonicalId);
  const leave = enterProjectorResolution(context, canonicalId);

  try {
    const envelope = await projectDwhSymbol(dwh, symbol, dwhContext);
    validateProjectorProjection(envelope.data, { maxDepth: maxStructureDepth });

    return Object.freeze({
      id: canonicalId,
      symbol,
      renderer: envelope.data.renderer,
      projection: deepFreezeDeclarative(envelope.data.projection),
      revision: envelope.revision ?? null,
    });
  } finally {
    leave();
  }
}

export {
  validateDeclarativeValue,
  validateProjectorProjection,
  deepFreezeDeclarative,
  createProjectorResolutionContext,
  resolveProjector,
};
