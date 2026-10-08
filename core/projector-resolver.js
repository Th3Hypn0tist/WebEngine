import {
  parseProjectorId,
  resolveProjectorDefinitionUrls,
} from './projector-id.js';

const DERIVABLE_TOP_LEVEL_FIELDS = new Set(['id', 'domain', 'entry']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const CONTEXT_STATE = new WeakMap();

function isPlainObject(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateDeclarativeValue(value, {
  depth = 0,
  maxDepth = 64,
  seen = new WeakSet(),
  path = '$',
} = {}) {
  if (depth > maxDepth) {
    throw new Error(`projector definition exceeds maximum structure depth at ${path}`);
  }

  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`projector definition contains a non-finite number at ${path}`);
    }
    return true;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new Error(`projector definition must not contain cycles at ${path}`);
    }
    seen.add(value);
    value.forEach((item, index) => validateDeclarativeValue(item, {
      depth: depth + 1,
      maxDepth,
      seen,
      path: `${path}[${index}]`,
    }));
    seen.delete(value);
    return true;
  }

  if (!isPlainObject(value)) {
    throw new TypeError(`projector definition contains a non-declarative value at ${path}`);
  }

  if (seen.has(value)) {
    throw new Error(`projector definition must not contain cycles at ${path}`);
  }
  seen.add(value);

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`forbidden projector definition key at ${path}.${key}`);
    }
    validateDeclarativeValue(child, {
      depth: depth + 1,
      maxDepth,
      seen,
      path: `${path}.${key}`,
    });
  }

  seen.delete(value);
  return true;
}

function validateProjectorDefinition(definition, {
  maxDepth = 64,
} = {}) {
  if (!isPlainObject(definition)) {
    throw new TypeError('projector definition must be a JSON object');
  }

  for (const field of DERIVABLE_TOP_LEVEL_FIELDS) {
    if (Object.hasOwn(definition, field)) {
      throw new Error(`projector definition must not store derivable top-level field: ${field}`);
    }
  }

  validateDeclarativeValue(definition, { maxDepth });
  return true;
}

function parseProjectorDefinition(source, options = {}) {
  if (typeof source !== 'string') {
    throw new TypeError('projector definition source must be a JSON string');
  }

  const definition = JSON.parse(source);
  validateProjectorDefinition(definition, options);
  return definition;
}

function deepCloneDeclarative(value) {
  if (Array.isArray(value)) {
    return value.map(deepCloneDeclarative);
  }

  if (isPlainObject(value)) {
    const clone = {};
    for (const [key, child] of Object.entries(value)) {
      clone[key] = deepCloneDeclarative(child);
    }
    return clone;
  }

  return value;
}

function mergeProjectorDelta(parent, delta) {
  validateProjectorDefinition(parent);
  validateProjectorDefinition(delta);

  function mergeValue(base, next) {
    if (isPlainObject(base) && isPlainObject(next)) {
      const merged = {};

      for (const [key, value] of Object.entries(base)) {
        merged[key] = deepCloneDeclarative(value);
      }

      for (const [key, value] of Object.entries(next)) {
        merged[key] = Object.hasOwn(base, key)
          ? mergeValue(base[key], value)
          : deepCloneDeclarative(value);
      }

      return merged;
    }

    return deepCloneDeclarative(next);
  }

  return mergeValue(parent, delta);
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

async function loadProjectorDefinition(url, {
  fetch: fetchImpl = globalThis.fetch,
  maxStructureDepth = 64,
} = {}) {
  if (typeof url !== 'string' || !url.startsWith('/')) {
    throw new TypeError('projector definition URL must be a root-relative path');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('projector loader requires a fetch implementation');
  }

  const response = await fetchImpl(url);

  if (!response || typeof response.text !== 'function') {
    throw new TypeError('projector fetch must return a Response-like object');
  }
  if (response.ok === false) {
    const status = Number.isInteger(response.status) ? ` HTTP ${response.status}` : '';
    throw new Error(`failed to load projector definition ${url}:${status}`.replace(/:$/, ''));
  }

  try {
    return parseProjectorDefinition(await response.text(), {
      maxDepth: maxStructureDepth,
    });
  } catch (error) {
    throw new Error(
      `invalid projector definition ${url}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function createProjectorResolutionContext({
  maxDepth = 32,
} = {}) {
  if (!Number.isInteger(maxDepth) || maxDepth < 1) {
    throw new TypeError('projector resolution maxDepth must be a positive integer');
  }

  const context = Object.freeze({ maxDepth });
  CONTEXT_STATE.set(context, { stack: [] });
  return context;
}

function enterProjectorResolution(context, id) {
  const state = CONTEXT_STATE.get(context);
  if (!state) {
    throw new TypeError('invalid projector resolution context');
  }

  if (state.stack.includes(id)) {
    throw new Error(
      `projector resolution cycle: ${[...state.stack, id].join(' -> ')}`,
    );
  }

  if (state.stack.length >= context.maxDepth) {
    throw new Error(
      `projector resolution exceeds maxDepth=${context.maxDepth}: ${[...state.stack, id].join(' -> ')}`,
    );
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
  fetch: fetchImpl = globalThis.fetch,
  context = createProjectorResolutionContext(),
  maxStructureDepth = 64,
  instanceRoot,
} = {}) {
  const parsed = parseProjectorId(id);
  const canonicalId = parsed.id;
  const leave = enterProjectorResolution(context, canonicalId);

  try {
    const definitionUrls = resolveProjectorDefinitionUrls(
      canonicalId,
      instanceRoot == null ? {} : { instanceRoot },
    );
    let projection = {};

    for (const url of definitionUrls) {
      const definition = await loadProjectorDefinition(url, {
        fetch: fetchImpl,
        maxStructureDepth,
      });
      projection = mergeProjectorDelta(projection, definition);
    }

    validateProjectorDefinition(projection, {
      maxDepth: maxStructureDepth,
    });

    return Object.freeze({
      id: canonicalId,
      definitionUrls: Object.freeze([...definitionUrls]),
      projection: deepFreezeDeclarative(projection),
    });
  } finally {
    leave();
  }
}

export {
  validateProjectorDefinition,
  parseProjectorDefinition,
  mergeProjectorDelta,
  deepFreezeDeclarative,
  loadProjectorDefinition,
  createProjectorResolutionContext,
  resolveProjector,
};
