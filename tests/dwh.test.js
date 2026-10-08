import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertDwhSymbol,
  normalizeDwhProjectionEnvelope,
  createDwhAdapter,
  createHttpDwhAdapter,
  projectDwhSymbol,
} from '../webengine.js';

test('accepts canonical DWH symbols', () => {
  assert.equal(assertDwhSymbol('#SITE'), undefined);
  assert.equal(assertDwhSymbol('#CONTENT:HOME'), undefined);
  assert.equal(assertDwhSymbol('#PROJECTOR:LMTS:ranking'), undefined);
});

test('rejects invalid DWH symbols', () => {
  for (const value of ['SITE', '#', '', null]) {
    assert.throws(() => assertDwhSymbol(value));
  }
});

test('normalizes a matching projection envelope', () => {
  const value = normalizeDwhProjectionEnvelope(
    { symbol: '#SITE', data: { id: 'root' }, revision: 'r1' },
    '#SITE',
  );

  assert.equal(value.symbol, '#SITE');
  assert.equal(value.revision, 'r1');
  assert.ok(Object.isFrozen(value));
});

test('rejects symbol mismatch', () => {
  assert.throws(
    () => normalizeDwhProjectionEnvelope({ symbol: '#CONTENT', data: {} }, '#SITE'),
    /symbol mismatch/,
  );
});

test('projects symbols only through the injected DWH adapter', async () => {
  const calls = [];
  const adapter = createDwhAdapter({
    project: async (symbol, context) => {
      calls.push({ symbol, context });
      return { symbol, data: { ok: true } };
    },
  });

  const result = await projectDwhSymbol(adapter, '#SITE', { domain: 'site' });
  assert.deepEqual(calls, [{ symbol: '#SITE', context: { domain: 'site' } }]);
  assert.deepEqual(result.data, { ok: true });
});


test('HTTP DWH adapter posts exact symbol and context payload', async () => {
  const calls = [];
  const adapter = createHttpDwhAdapter({
    endpoint: '/app/dwh/api/project.php',
    fetchImpl: async (endpoint, options) => {
      calls.push({ endpoint, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return { symbol: '#SITE', data: { id: 'root', label: 'Root', children: [] } };
        },
      };
    },
  });

  const result = await projectDwhSymbol(adapter, '#SITE', { surface: 'site' });

  assert.equal(result.symbol, '#SITE');
  assert.equal(calls[0].endpoint, '/app/dwh/api/project.php');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    symbol: '#SITE',
    context: { surface: 'site' },
  });
});

test('HTTP DWH adapter fails closed on non-OK response', async () => {
  const adapter = createHttpDwhAdapter({
    endpoint: '/app/dwh/api/project.php',
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      async json() {
        return { ok: false, error: 'projection_not_found' };
      },
    }),
  });

  await assert.rejects(
    () => projectDwhSymbol(adapter, '#SITE'),
    /HTTP 404 projection_not_found/,
  );
});
