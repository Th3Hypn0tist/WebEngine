import {
  parseProjectorId,
  resolveDefaultRendererUrl,
} from './projector-id.js';

const BOUNDARY_STATE = new WeakMap();
const RENDERER_SUFFIX = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.js$/;
const MOUNT_STATES = new Set(['ready', 'empty']);

const TRANSITIONS = Object.freeze({
  new: new Set(['loading']),
  loading: new Set(['ready', 'empty', 'denied', 'error', 'destroy']),
  ready: new Set(['destroy']),
  empty: new Set(['destroy']),
  denied: new Set(['destroy']),
  error: new Set(['destroy']),
  destroy: new Set(['loading']),
});

function assertBoundary(boundary) {
  if (
    boundary == null ||
    typeof boundary !== 'object' ||
    boundary.dataset == null ||
    typeof boundary.dataset !== 'object' ||
    typeof boundary.replaceChildren !== 'function'
  ) {
    throw new TypeError(
      'renderer boundary must provide dataset and replaceChildren()',
    );
  }
}

function getBoundaryState(boundary) {
  assertBoundary(boundary);

  let state = BOUNDARY_STATE.get(boundary);
  if (!state) {
    state = {
      nextGeneration: 0,
      current: null,
      publishedState: null,
    };
    BOUNDARY_STATE.set(boundary, state);
  }

  if (boundary.classList && typeof boundary.classList.add === 'function') {
    boundary.classList.add('we-projector');
  }

  return state;
}

function transitionBoundary(boundary, state, next) {
  const current = state.publishedState ?? 'new';
  const allowed = TRANSITIONS[current];

  if (!allowed || !allowed.has(next)) {
    throw new Error(`invalid renderer boundary transition: ${current} -> ${next}`);
  }

  boundary.dataset.state = next;
  state.publishedState = next;
}

function validateRendererModuleUrl(url, projectorId) {
  if (typeof url !== 'string' || !url || url !== url.trim()) {
    throw new TypeError('renderer URL must be a non-empty trimmed string');
  }
  if (url.includes('?') || url.includes('#') || url.includes('\\')) {
    throw new Error('renderer URL must not contain query, fragment or backslash');
  }

  const parsed = parseProjectorId(projectorId);
  const prefix = `/app/${parsed.pathDomain}/renderers/`;

  if (!url.startsWith(prefix)) {
    throw new Error(
      `renderer URL must remain inside the projector domain renderer root: ${prefix}`,
    );
  }

  const suffix = url.slice(prefix.length);
  if (!RENDERER_SUFFIX.test(suffix)) {
    throw new Error('renderer URL must identify a .js module inside the renderer root');
  }

  return url;
}

function resolveRendererModuleUrl(projectorId, {
  override = null,
} = {}) {
  parseProjectorId(projectorId);

  if (override == null) {
    return resolveDefaultRendererUrl(projectorId);
  }

  return validateRendererModuleUrl(override, projectorId);
}

async function loadRendererModule(url, {
  projectorId,
  importModule = specifier => import(specifier),
} = {}) {
  validateRendererModuleUrl(url, projectorId);

  if (typeof importModule !== 'function') {
    throw new TypeError('renderer module loader must be a function');
  }

  const module = await importModule(url);

  if (
    module == null ||
    (typeof module !== 'object' && typeof module !== 'function') ||
    typeof module.mount !== 'function'
  ) {
    throw new Error('renderer module must export mount(target, projection, context)');
  }

  return Object.freeze({
    url,
    mount: module.mount,
  });
}

function normalizeMountResult(value) {
  if (value == null) {
    return Object.freeze({
      state: 'ready',
      destroy: null,
    });
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('renderer mount result must be an object, void or null');
  }

  for (const key of Object.keys(value)) {
    if (key !== 'state' && key !== 'destroy') {
      throw new Error(`unknown renderer mount result field: ${key}`);
    }
  }

  const state = value.state ?? 'ready';
  if (!MOUNT_STATES.has(state)) {
    throw new Error('renderer mount state must be ready or empty');
  }

  if (value.destroy != null && typeof value.destroy !== 'function') {
    throw new TypeError('renderer mount destroy must be a function when present');
  }

  return Object.freeze({
    state,
    destroy: value.destroy ?? null,
  });
}

function defaultCreateMountTarget(boundary) {
  const document = boundary.ownerDocument ?? globalThis.document;

  if (!document || typeof document.createElement !== 'function') {
    throw new TypeError(
      'renderer boundary requires ownerDocument.createElement() or a custom createMountTarget',
    );
  }

  const target = document.createElement('div');
  if (target.classList && typeof target.classList.add === 'function') {
    target.classList.add('we-projector-body');
  }
  return target;
}

function defaultCommitMountTarget(boundary, target) {
  boundary.replaceChildren(target);
}

function reportError(onError, error, details) {
  if (typeof onError !== 'function') return;

  try {
    onError(error, Object.freeze({ ...details }));
  } catch {
    // Diagnostics must never alter lifecycle correctness.
  }
}

async function requestGenerationDestroy(generation, onError) {
  generation.destroyRequested = true;

  if (!generation.mountSettled || generation.cleanupCalled) {
    return;
  }

  generation.cleanupCalled = true;

  if (typeof generation.destroy !== 'function') {
    return;
  }

  try {
    await generation.destroy();
  } catch (error) {
    reportError(onError, error, {
      phase: 'destroy',
      generation: generation.id,
      projectorId: generation.projectorId,
    });
  }
}

function isCurrent(state, generation) {
  return state.current === generation && generation.active;
}

function createGeneration(state, projectorId) {
  return {
    id: ++state.nextGeneration,
    projectorId,
    active: true,
    mountSettled: false,
    destroyRequested: false,
    cleanupCalled: false,
    destroy: null,
  };
}

async function supersedeCurrent(boundary, state, onError) {
  const previous = state.current;
  if (!previous) {
    return;
  }

  previous.active = false;

  if (state.publishedState !== 'destroy') {
    transitionBoundary(boundary, state, 'destroy');
  }

  state.current = null;
  boundary.replaceChildren();
  await requestGenerationDestroy(previous, onError);
}

function staleResult(generation, rendererUrl) {
  return Object.freeze({
    generation: generation.id,
    projectorId: generation.projectorId,
    rendererUrl,
    state: 'destroy',
    stale: true,
  });
}

async function mountResolvedProjector(
  boundary,
  resolvedProjector,
  context = Object.freeze({}),
  {
    rendererUrl = null,
    importModule = specifier => import(specifier),
    createMountTarget = defaultCreateMountTarget,
    commitMountTarget = defaultCommitMountTarget,
    onError = null,
  } = {},
) {
  const state = getBoundaryState(boundary);

  if (
    resolvedProjector == null ||
    typeof resolvedProjector !== 'object' ||
    typeof resolvedProjector.id !== 'string' ||
    !Object.hasOwn(resolvedProjector, 'projection')
  ) {
    throw new TypeError(
      'mountResolvedProjector requires a resolved projector with id and projection',
    );
  }

  const projectorId = parseProjectorId(resolvedProjector.id).id;
  const moduleUrl = resolveRendererModuleUrl(projectorId, {
    override: rendererUrl,
  });

  const generation = createGeneration(state, projectorId);

  await supersedeCurrent(boundary, state, onError);

  state.current = generation;
  transitionBoundary(boundary, state, 'loading');

  let stagingTarget;

  try {
    if (typeof createMountTarget !== 'function') {
      throw new TypeError('createMountTarget must be a function');
    }
    if (typeof commitMountTarget !== 'function') {
      throw new TypeError('commitMountTarget must be a function');
    }

    stagingTarget = createMountTarget(boundary, generation.id);

    if (stagingTarget == null || typeof stagingTarget !== 'object') {
      throw new TypeError('createMountTarget must return a mount target object');
    }

    const renderer = await loadRendererModule(moduleUrl, {
      projectorId,
      importModule,
    });

    if (!isCurrent(state, generation)) {
      return staleResult(generation, moduleUrl);
    }

    const rendererContext = Object.freeze({
      ...(context ?? {}),
      projectorId,
      generation: generation.id,
    });

    const rawResult = await renderer.mount(
      stagingTarget,
      resolvedProjector.projection,
      rendererContext,
    );

    const mountResult = normalizeMountResult(rawResult);
    generation.mountSettled = true;
    generation.destroy = mountResult.destroy;

    if (!isCurrent(state, generation)) {
      await requestGenerationDestroy(generation, onError);
      return staleResult(generation, moduleUrl);
    }

    commitMountTarget(boundary, stagingTarget, generation.id);
    transitionBoundary(boundary, state, mountResult.state);

    return Object.freeze({
      generation: generation.id,
      projectorId,
      rendererUrl: moduleUrl,
      state: mountResult.state,
      stale: false,
    });
  } catch (error) {
    generation.mountSettled = true;

    if (!isCurrent(state, generation)) {
      await requestGenerationDestroy(generation, onError);
      reportError(onError, error, {
        phase: 'stale-mount',
        generation: generation.id,
        projectorId,
        rendererUrl: moduleUrl,
      });
      return staleResult(generation, moduleUrl);
    }

    boundary.replaceChildren();
    transitionBoundary(boundary, state, 'error');

    reportError(onError, error, {
      phase: 'mount',
      generation: generation.id,
      projectorId,
      rendererUrl: moduleUrl,
    });

    throw error;
  }
}

async function denyRendererBoundary(
  boundary,
  {
    projectorId = null,
    onError = null,
  } = {},
) {
  const state = getBoundaryState(boundary);

  if (projectorId != null) {
    parseProjectorId(projectorId);
  }

  await supersedeCurrent(boundary, state, onError);

  const generation = createGeneration(state, projectorId);
  generation.mountSettled = true;

  state.current = generation;
  transitionBoundary(boundary, state, 'loading');
  transitionBoundary(boundary, state, 'denied');

  return Object.freeze({
    generation: generation.id,
    projectorId,
    state: 'denied',
  });
}

async function destroyRendererBoundary(
  boundary,
  {
    onError = null,
  } = {},
) {
  const state = getBoundaryState(boundary);
  const current = state.current;

  if (!current) {
    if (state.publishedState == null) {
      return Object.freeze({ generation: null, state: null });
    }

    if (state.publishedState !== 'destroy') {
      transitionBoundary(boundary, state, 'destroy');
    }

    boundary.replaceChildren();
    return Object.freeze({ generation: null, state: 'destroy' });
  }

  current.active = false;

  if (state.publishedState !== 'destroy') {
    transitionBoundary(boundary, state, 'destroy');
  }

  state.current = null;
  boundary.replaceChildren();
  await requestGenerationDestroy(current, onError);

  return Object.freeze({
    generation: current.id,
    projectorId: current.projectorId,
    state: 'destroy',
  });
}

export {
  validateRendererModuleUrl,
  resolveRendererModuleUrl,
  loadRendererModule,
  normalizeMountResult,
  mountResolvedProjector,
  denyRendererBoundary,
  destroyRendererBoundary,
};
