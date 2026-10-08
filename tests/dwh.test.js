import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertDwhSymbol,
  normalizeDwhProjectionEnvelope,
  createDwhAdapter,
  projectDwhSymbol,
} from '../webengine.js';

test('accepts canonical DWH symbols', () => {
  assert.equal(assertDwhSymbol('#SITE'), undefined);
  assert.equal(assertDwhSymbol('#CONTENT:HOME'), undefined);
});

test('rejects invalid DWH symbols', () => {
  for (const value of ['SITE', '#site', '#', '', null]) {
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
