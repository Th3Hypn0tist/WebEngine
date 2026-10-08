import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateProjectorDefinition,
  parseProjectorDefinition,
  mergeProjectorDelta,
  loadProjectorDefinition,
  createProjectorResolutionContext,
  resolveProjector,
} from '../webengine.js';

function response(value, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    text: async () => typeof value === 'string' ? value : JSON.stringify(value),
  };
}

test('accepts declarative JSON object projector definitions', () => {
  const definition = {
    title: 'Ranking',
    source: { service: 'lmts', operation: 'ranking' },
    columns: ['model', 'score'],
    limit: 10,
    visible: true,
    empty: null,
  };

  assert.equal(validateProjectorDefinition(definition), true);
  assert.deepEqual(
    parseProjectorDefinition(JSON.stringify(definition)),
    definition,
  );
});

test('rejects derivable top-level projector identity fields', () => {
  for (const field of ['id', 'domain', 'entry']) {
    assert.throws(
      () => validateProjectorDefinition({ [field]: 'duplicate-truth' }),
      /must not store derivable top-level field/,
    );
  }
});

test('rejects executable, cyclic and prototype-sensitive projector values', () => {
  assert.throws(
    () => validateProjectorDefinition({ execute() {} }),
    /non-declarative value/,
  );

  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(
    () => validateProjectorDefinition(cyclic),
    /must not contain cycles/,
  );

  const polluted = JSON.parse('{"__proto__":{"admin":true}}');
  assert.throws(
    () => validateProjectorDefinition(polluted),
    /forbidden projector definition key/,
  );
});

test('enforces projector structure depth', () => {
  const deep = { a: { b: { c: true } } };
  assert.throws(
    () => validateProjectorDefinition(deep, { maxDepth: 2 }),
    /maximum structure depth/,
  );
});

test('merges object deltas recursively while arrays scalars and null replace', () => {
  const base = {
    source: {
      service: 'lmts',
      operation: 'ranking',
      params: {
        limit: 10,
        sort: 'score',
      },
    },
    columns: ['model', 'score'],
    title: 'Ranking',
    optional: { enabled: true },
  };

  const delta = {
    source: {
      params: {
        limit: 3,
      },
    },
    columns: ['model'],
    title: null,
    optional: false,
  };

  assert.deepEqual(
    mergeProjectorDelta(base, delta),
    {
      source: {
        service: 'lmts',
        operation: 'ranking',
        params: {
          limit: 3,
          sort: 'score',
        },
      },
      columns: ['model'],
      title: null,
      optional: false,
    },
  );

  assert.deepEqual(base.columns, ['model', 'score']);
  assert.deepEqual(delta.columns, ['model']);
});

test('variant resolution loads base then nested deltas in deterministic order', async () => {
  const calls = [];
  const definitions = new Map([
    ['/app/lmts/projectors/ranking.json', {
      source: { operation: 'ranking', params: { limit: 10, scope: 'all' } },
      columns: ['model', 'score'],
    }],
    ['/app/lmts/projectors/ranking/top3.json', {
      source: { params: { limit: 3 } },
    }],
    ['/app/lmts/projectors/ranking/top3/compact.json', {
      columns: ['model'],
      compact: true,
    }],
  ]);

  const result = await resolveProjector('LMTS:ranking:top3:compact', {
    fetch: async url => {
      calls.push(url);
      return response(definitions.get(url));
    },
  });

  assert.deepEqual(calls, [
    '/app/lmts/projectors/ranking.json',
    '/app/lmts/projectors/ranking/top3.json',
    '/app/lmts/projectors/ranking/top3/compact.json',
  ]);

  assert.deepEqual(result.projection, {
    source: {
      operation: 'ranking',
      params: {
        limit: 3,
        scope: 'all',
      },
    },
    columns: ['model'],
    compact: true,
  });

  assert.equal(result.id, 'LMTS:ranking:top3:compact');
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.definitionUrls));
  assert.ok(Object.isFrozen(result.projection));
  assert.ok(Object.isFrozen(result.projection.source));
});

test('fails closed when any projector definition in the chain cannot load', async () => {
  await assert.rejects(
    resolveProjector('LMTS:ranking:top3', {
      fetch: async url => url.endsWith('ranking.json')
        ? response({ title: 'Ranking' })
        : response('', { ok: false, status: 404 }),
    }),
    /HTTP 404/,
  );
});

test('reports invalid JSON with the failing definition URL', async () => {
  await assert.rejects(
    loadProjectorDefinition('/app/lmts/projectors/ranking.json', {
      fetch: async () => response('{'),
    }),
    /invalid projector definition \/app\/lmts\/projectors\/ranking\.json/,
  );
});

test('resolution context rejects direct recursive projector cycles', async () => {
  const context = createProjectorResolutionContext();

  const fetch = async () => {
    await resolveProjector('LMTS:ranking', { fetch, context });
    return response({});
  };

  await assert.rejects(
    resolveProjector('LMTS:ranking', { fetch, context }),
    /projector resolution cycle: LMTS:ranking -> LMTS:ranking/,
  );
});

test('resolution context rejects recursive chains beyond maxDepth', async () => {
  const context = createProjectorResolutionContext({ maxDepth: 2 });

  const fetchA = async () => {
    await resolveProjector('LMTS:b', { fetch: fetchB, context });
    return response({});
  };

  const fetchB = async () => {
    await resolveProjector('LMTS:c', {
      fetch: async () => response({}),
      context,
    });
    return response({});
  };

  await assert.rejects(
    resolveProjector('LMTS:a', { fetch: fetchA, context }),
    /exceeds maxDepth=2: LMTS:a -> LMTS:b -> LMTS:c/,
  );
});

test('resolution context is reusable after failed nested resolution unwinds', async () => {
  const context = createProjectorResolutionContext();

  await assert.rejects(
    resolveProjector('LMTS:ranking', {
      context,
      fetch: async () => response('', { ok: false, status: 500 }),
    }),
    /HTTP 500/,
  );

  const resolved = await resolveProjector('LMTS:ranking', {
    context,
    fetch: async () => response({ title: 'Ranking' }),
  });

  assert.equal(resolved.projection.title, 'Ranking');
});


test('projector resolver loads definition chain from the active instance root', async () => {
  const calls = [];

  await resolveProjector('LMTS:ranking:top3', {
    instanceRoot: '/test/',
    fetch: async url => {
      calls.push(url);
      return response({});
    },
  });

  assert.deepEqual(calls, [
    '/test/app/lmts/projectors/ranking.json',
    '/test/app/lmts/projectors/ranking/top3.json',
  ]);
});
