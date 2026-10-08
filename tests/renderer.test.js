import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateRendererModuleUrl,
  resolveRendererModuleUrl,
  loadRendererModule,
  normalizeMountResult,
  mountResolvedProjector,
  denyRendererBoundary,
  errorRendererBoundary,
  destroyRendererBoundary,
} from '../webengine.js';

function createElement(tagName = 'div', documentRef = null) {
  const classes = new Set();
  const element = {
    tagName,
    dataset: {},
    children: [],
    textContent: '',
    ownerDocument: documentRef,
    classList: {
      add(value) {
        classes.add(value);
      },
      contains(value) {
        return classes.has(value);
      },
    },
    replaceChildren(...children) {
      this.children = children;
    },
  };

  return element;
}

function createBoundary() {
  const documentRef = {
    createElement(tagName) {
      return createElement(tagName, documentRef);
    },
  };

  return createElement('section', documentRef);
}

function resolved(
  id = 'LMTS:ranking',
  projection = { title: 'Ranking' },
  renderer = '/app/lmts/renderers/ranking.js',
) {
  return Object.freeze({
    id,
    renderer,
    projection: Object.freeze({ ...projection }),
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test('requires an explicit same-domain DWH renderer binding', () => {
  assert.equal(
    resolveRendererModuleUrl('LMTS:ranking:top3', {
      binding: '/app/lmts/renderers/ranking.js',
    }),
    '/app/lmts/renderers/ranking.js',
  );

  assert.throws(
    () => resolveRendererModuleUrl('LMTS:ranking'),
    /renderer binding must be a non-empty/,
  );

  assert.equal(
    resolveRendererModuleUrl('LMTS:ranking', {
      binding: '/app/lmts/renderers/ranking/compact.js',
    }),
    '/app/lmts/renderers/ranking/compact.js',
  );

  for (const url of [
    '/app/iam/renderers/ranking.js',
    '/app/lmts/projectors/ranking.js',
    '/app/lmts/renderers/../services/ranking.js',
    '/app/lmts/renderers/ranking.js?x=1',
    'https://example.com/ranking.js',
  ]) {
    assert.throws(
      () => validateRendererModuleUrl(url, 'LMTS:ranking'),
    );
  }
});

test('requires an explicit named mount export from renderer modules', async () => {
  await assert.rejects(
    loadRendererModule('/app/lmts/renderers/ranking.js', {
      projectorId: 'LMTS:ranking',
      importModule: async () => ({ default() {} }),
    }),
    /must export mount/,
  );

  const renderer = await loadRendererModule(
    '/app/lmts/renderers/ranking.js',
    {
      projectorId: 'LMTS:ranking',
      importModule: async () => ({ mount() {} }),
    },
  );

  assert.equal(typeof renderer.mount, 'function');
  assert.ok(Object.isFrozen(renderer));
});

test('normalizes renderer mount results to ready or empty only', () => {
  assert.deepEqual(
    normalizeMountResult(),
    { state: 'ready', destroy: null },
  );
  assert.deepEqual(
    normalizeMountResult({ state: 'empty' }),
    { state: 'empty', destroy: null },
  );

  assert.throws(() => normalizeMountResult({ state: 'denied' }));
  assert.throws(() => normalizeMountResult({ state: 'error' }));
  assert.throws(() => normalizeMountResult({ extra: true }));
});

test('mounts into an isolated staging target and commits only the current generation', async () => {
  const boundary = createBoundary();

  const result = await mountResolvedProjector(
    boundary,
    resolved(),
    { locale: 'fi' },
    {
      importModule: async () => ({
        mount(target, projection, context) {
          target.textContent = projection.title;
          assert.equal(context.projectorId, 'LMTS:ranking');
          assert.equal(context.generation, 1);
          return { state: 'ready' };
        },
      }),
    },
  );

  assert.equal(result.state, 'ready');
  assert.equal(result.stale, false);
  assert.equal(boundary.dataset.state, 'ready');
  assert.equal(boundary.children.length, 1);
  assert.equal(boundary.children[0].textContent, 'Ranking');
  assert.ok(boundary.classList.contains('we-projector'));
  assert.ok(boundary.children[0].classList.contains('we-projector-body'));
});

test('returns empty when renderer explicitly reports empty', async () => {
  const boundary = createBoundary();

  const result = await mountResolvedProjector(
    boundary,
    resolved(),
    {},
    {
      importModule: async () => ({
        mount() {
          return { state: 'empty' };
        },
      }),
    },
  );

  assert.equal(result.state, 'empty');
  assert.equal(boundary.dataset.state, 'empty');
});

test('late async generation cannot overwrite a newer committed generation', async () => {
  const boundary = createBoundary();
  const gate = deferred();
  const mountStarted = deferred();
  let staleDestroyCount = 0;

  const first = mountResolvedProjector(
    boundary,
    resolved('LMTS:ranking', { title: 'OLD' }),
    {},
    {
      importModule: async () => ({
        async mount(target, projection) {
          mountStarted.resolve();
          await gate.promise;
          target.textContent = projection.title;
          return {
            destroy() {
              staleDestroyCount += 1;
            },
          };
        },
      }),
    },
  );

  await mountStarted.promise;

  const second = await mountResolvedProjector(
    boundary,
    resolved('LMTS:ranking', { title: 'NEW' }),
    {},
    {
      importModule: async () => ({
        mount(target, projection) {
          target.textContent = projection.title;
        },
      }),
    },
  );

  assert.equal(second.state, 'ready');
  assert.equal(boundary.children[0].textContent, 'NEW');

  gate.resolve();
  const stale = await first;

  assert.equal(stale.stale, true);
  assert.equal(stale.state, 'destroy');
  assert.equal(staleDestroyCount, 1);
  assert.equal(boundary.dataset.state, 'ready');
  assert.equal(boundary.children[0].textContent, 'NEW');
});

test('destroy handle is scoped to one mounted generation and called exactly once', async () => {
  const boundary = createBoundary();
  let destroyCount = 0;

  await mountResolvedProjector(
    boundary,
    resolved(),
    {},
    {
      importModule: async () => ({
        mount() {
          return {
            destroy() {
              destroyCount += 1;
            },
          };
        },
      }),
    },
  );

  const firstDestroy = await destroyRendererBoundary(boundary);
  const secondDestroy = await destroyRendererBoundary(boundary);

  assert.equal(firstDestroy.state, 'destroy');
  assert.equal(secondDestroy.state, 'destroy');
  assert.equal(destroyCount, 1);
  assert.equal(boundary.dataset.state, 'destroy');
  assert.deepEqual(boundary.children, []);
});

test('renderer load or mount failure is isolated to the boundary error state', async () => {
  const boundary = createBoundary();
  const diagnostics = [];

  await assert.rejects(
    mountResolvedProjector(
      boundary,
      resolved(),
      {},
      {
        importModule: async () => ({
          mount() {
            throw new Error('boom');
          },
        }),
        onError(error, details) {
          diagnostics.push([error.message, details.phase]);
        },
      },
    ),
    /boom/,
  );

  assert.equal(boundary.dataset.state, 'error');
  assert.deepEqual(boundary.children, []);
  assert.deepEqual(diagnostics, [['boom', 'mount']]);
});

test('destroy failure is contained and cannot prevent a replacement generation', async () => {
  const boundary = createBoundary();
  const diagnostics = [];

  await mountResolvedProjector(
    boundary,
    resolved('LMTS:ranking', { title: 'A' }),
    {},
    {
      importModule: async () => ({
        mount() {
          return {
            destroy() {
              throw new Error('cleanup failed');
            },
          };
        },
      }),
      onError(error, details) {
        diagnostics.push([error.message, details.phase]);
      },
    },
  );

  const replacement = await mountResolvedProjector(
    boundary,
    resolved('LMTS:ranking', { title: 'B' }),
    {},
    {
      importModule: async () => ({
        mount(target, projection) {
          target.textContent = projection.title;
        },
      }),
      onError(error, details) {
        diagnostics.push([error.message, details.phase]);
      },
    },
  );

  assert.equal(replacement.state, 'ready');
  assert.equal(boundary.children[0].textContent, 'B');
  assert.deepEqual(diagnostics, [['cleanup failed', 'destroy']]);
});

test('denied state supersedes a mounted generation without invoking another renderer', async () => {
  const boundary = createBoundary();
  let destroyCount = 0;

  await mountResolvedProjector(
    boundary,
    resolved(),
    {},
    {
      importModule: async () => ({
        mount() {
          return {
            destroy() {
              destroyCount += 1;
            },
          };
        },
      }),
    },
  );

  const denied = await denyRendererBoundary(boundary, {
    projectorId: 'LMTS:ranking',
  });

  assert.equal(denied.state, 'denied');
  assert.equal(boundary.dataset.state, 'denied');
  assert.deepEqual(boundary.children, []);
  assert.equal(destroyCount, 1);
});

test('boundary can start a new generation after denied error or destroy terminal state', async () => {
  const boundary = createBoundary();

  await denyRendererBoundary(boundary, {
    projectorId: 'LMTS:ranking',
  });

  const afterDenied = await mountResolvedProjector(
    boundary,
    resolved(),
    {},
    {
      importModule: async () => ({
        mount(target) {
          target.textContent = 'ready';
        },
      }),
    },
  );

  assert.equal(afterDenied.state, 'ready');

  await destroyRendererBoundary(boundary);

  const afterDestroy = await mountResolvedProjector(
    boundary,
    resolved(),
    {},
    {
      importModule: async () => ({
        mount(target) {
          target.textContent = 'again';
        },
      }),
    },
  );

  assert.equal(afterDestroy.state, 'ready');
  assert.equal(boundary.children[0].textContent, 'again');
});


test('errorRendererBoundary publishes orchestration error without invoking a renderer', async () => {
  const boundary = createBoundary();

  const result = await errorRendererBoundary(boundary, {
    projectorId: 'LMTS:ranking',
  });

  assert.equal(result.state, 'error');
  assert.equal(boundary.dataset.state, 'error');
  assert.deepEqual(boundary.children, []);
});

test('errorRendererBoundary supersedes and destroys an existing mounted generation', async () => {
  const boundary = createBoundary();
  let destroyCount = 0;

  await mountResolvedProjector(
    boundary,
    resolved(),
    {},
    {
      importModule: async () => ({
        mount() {
          return {
            destroy() {
              destroyCount += 1;
            },
          };
        },
      }),
    },
  );

  const result = await errorRendererBoundary(boundary, {
    projectorId: 'LMTS:ranking',
  });

  assert.equal(result.state, 'error');
  assert.equal(boundary.dataset.state, 'error');
  assert.equal(destroyCount, 1);
});


test('renderer resolution stays inside the active instance root', () => {
  assert.equal(
    resolveRendererModuleUrl('LMTS:ranking', {
      instanceRoot: '/test/',
      binding: '/app/lmts/renderers/ranking.js',
    }),
    '/test/app/lmts/renderers/ranking.js',
  );

  assert.equal(
    resolveRendererModuleUrl('LMTS:ranking', {
      instanceRoot: '/test/',
      binding: '/app/lmts/renderers/ranking/compact.js',
    }),
    '/test/app/lmts/renderers/ranking/compact.js',
  );

  assert.throws(() =>
    validateRendererModuleUrl(
      '/app/lmts/renderers/ranking.js',
      'LMTS:ranking',
      { instanceRoot: '/test/' },
    )
  );
});
