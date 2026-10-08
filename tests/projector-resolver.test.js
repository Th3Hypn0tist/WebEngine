import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDwhAdapter,
  validateDeclarativeValue,
  validateProjectorProjection,
  createProjectorResolutionContext,
  resolveProjector,
} from '../webengine.js';

test('accepts declarative projector projection data', () => {
  const value = {
    renderer: '/app/lmts/renderers/ranking.js',
    projection: {
      title: 'Ranking',
      source: { service: 'lmts', operation: 'ranking' },
      columns: ['model', 'score'],
      limit: 10,
      visible: true,
      empty: null,
    },
  };

  assert.equal(validateProjectorProjection(value), true);
  assert.equal(validateDeclarativeValue(value.projection), true);
});

test('rejects missing renderer binding and unknown envelope data fields', () => {
  assert.throws(
    () => validateProjectorProjection({ projection: {} }),
    /missing required field: renderer/,
  );

  assert.throws(
    () => validateProjectorProjection({
      renderer: '/app/lmts/renderers/ranking.js',
      projection: {},
      fallback: '/app/lmts/renderers/other.js',
    }),
    /unknown projector DWH data field/,
  );
});

test('rejects executable cyclic and prototype-sensitive projection values', () => {
  assert.throws(
    () => validateProjectorProjection({
      renderer: '/app/lmts/renderers/ranking.js',
      projection: { execute() {} },
    }),
    /non-declarative value/,
  );

  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(
    () => validateProjectorProjection({
      renderer: '/app/lmts/renderers/ranking.js',
      projection: cyclic,
    }),
    /must not contain cycles/,
  );

  const polluted = JSON.parse('{"__proto__":{"admin":true}}');
  assert.throws(
    () => validateProjectorProjection({
      renderer: '/app/lmts/renderers/ranking.js',
      projection: polluted,
    }),
    /forbidden projector projection key/,
  );
});

test('resolves one effective projector projection from DWH', async () => {
  const calls = [];
  const dwh = createDwhAdapter({
    project: async (symbol, context) => {
      calls.push({ symbol, context });
      return {
        symbol,
        revision: 'rev-7',
        data: {
          renderer: '/app/lmts/renderers/ranking.js',
          projection: {
            source: { operation: 'ranking', params: { limit: 3 } },
            columns: ['model'],
            compact: true,
          },
        },
      };
    },
  });

  const result = await resolveProjector('LMTS:ranking:top3:compact', {
    dwh,
    dwhContext: { locale: 'fi' },
  });

  assert.deepEqual(calls, [{
    symbol: '#PROJECTOR:LMTS:ranking:top3:compact',
    context: { locale: 'fi' },
  }]);
  assert.equal(result.id, 'LMTS:ranking:top3:compact');
  assert.equal(result.symbol, '#PROJECTOR:LMTS:ranking:top3:compact');
  assert.equal(result.renderer, '/app/lmts/renderers/ranking.js');
  assert.equal(result.revision, 'rev-7');
  assert.deepEqual(result.projection, {
    source: { operation: 'ranking', params: { limit: 3 } },
    columns: ['model'],
    compact: true,
  });
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.projection));
  assert.ok(Object.isFrozen(result.projection.source));
});

test('does not perform browser-side base or variant merging', async () => {
  const dwh = createDwhAdapter({
    project: async symbol => ({
      symbol,
      data: {
        renderer: '/app/lmts/renderers/ranking.js',
        projection: { effective: true },
      },
    }),
  });

  const result = await resolveProjector('LMTS:ranking:top3', { dwh });
  assert.deepEqual(result.projection, { effective: true });
});

test('fails closed when DWH projector resolution fails', async () => {
  const dwh = createDwhAdapter({
    project: async () => {
      throw new Error('projector not found');
    },
  });

  await assert.rejects(
    resolveProjector('LMTS:ranking', { dwh }),
    /projector not found/,
  );
});

test('fails closed when DWH returns invalid projector data', async () => {
  const dwh = createDwhAdapter({
    project: async symbol => ({
      symbol,
      data: {
        projection: { title: 'Ranking' },
      },
    }),
  });

  await assert.rejects(
    resolveProjector('LMTS:ranking', { dwh }),
    /missing required field: renderer/,
  );
});

test('resolution context rejects recursive projector cycles', async () => {
  const context = createProjectorResolutionContext();
  let dwh;

  dwh = createDwhAdapter({
    project: async symbol => {
      await resolveProjector('LMTS:ranking', { dwh, context });
      return {
        symbol,
        data: {
          renderer: '/app/lmts/renderers/ranking.js',
          projection: {},
        },
      };
    },
  });

  await assert.rejects(
    resolveProjector('LMTS:ranking', { dwh, context }),
    /projector resolution cycle: LMTS:ranking -> LMTS:ranking/,
  );
});

test('resolution context is reusable after failed DWH resolution unwinds', async () => {
  const context = createProjectorResolutionContext();

  const failing = createDwhAdapter({
    project: async () => {
      throw new Error('DWH unavailable');
    },
  });

  await assert.rejects(
    resolveProjector('LMTS:ranking', { dwh: failing, context }),
    /DWH unavailable/,
  );

  const working = createDwhAdapter({
    project: async symbol => ({
      symbol,
      data: {
        renderer: '/app/lmts/renderers/ranking.js',
        projection: { title: 'Ranking' },
      },
    }),
  });

  const result = await resolveProjector('LMTS:ranking', {
    dwh: working,
    context,
  });

  assert.equal(result.projection.title, 'Ranking');
});
