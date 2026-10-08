import test from 'node:test';
import assert from 'node:assert/strict';

import {
  METAMODULE_CATALOG_SYMBOL,
  validateMetaModuleCatalog,
  loadMetaModuleCatalog,
  createDwhAdapter,
} from '../webengine.js';

function sampleCatalog() {
  return {
    families: [
      {
        id: 'Universal/Business',
        label: 'Business Universals',
        kind: 'Universal family',
        status: 'CANONICAL_CONFIRMED',
        member_count: 2,
        members: ['Identity', 'Project'],
      },
    ],
    groups: [
      {
        id: 'Strategy',
        label: 'Strategy',
        kind: 'grouping abstraction',
        status: 'DISPLAY_NAME_ONLY',
        member_count: 1,
        event_status: 'NOT_EVENT_OWNER',
        members: ['SWOT'],
      },
    ],
    members: [],
    gaps: [
      {
        id: 'EXAMPLE_GAP',
        severity: 'review',
        status: 'UNRESOLVED',
        known: 'known',
        unknown: 'unknown',
        rule: 'do not guess',
      },
    ],
  };
}

test('validates a MetaModule catalog projection', () => {
  assert.equal(validateMetaModuleCatalog(sampleCatalog()).families.length, 1);
});

test('rejects grouping abstractions that claim Event ownership', () => {
  const catalog = sampleCatalog();
  catalog.groups[0].event_status = 'EVENTS_PROVEN';
  assert.throws(() => validateMetaModuleCatalog(catalog), /NOT_EVENT_OWNER/);
});

test('rejects family count mismatch', () => {
  const catalog = sampleCatalog();
  catalog.families[0].member_count = 3;
  assert.throws(() => validateMetaModuleCatalog(catalog), /member_count/);
});

test('loads catalog only through the DWH adapter and freezes runtime data', async () => {
  const calls = [];
  const adapter = createDwhAdapter({
    project: async (symbol, context) => {
      calls.push({ symbol, context });
      return { symbol, data: sampleCatalog(), revision: 'r1' };
    },
  });

  const result = await loadMetaModuleCatalog(adapter, { surface: 'mmdemo' });

  assert.equal(METAMODULE_CATALOG_SYMBOL, '#METAMODULE:CATALOG');
  assert.deepEqual(calls, [
    { symbol: '#METAMODULE:CATALOG', context: { surface: 'mmdemo' } },
  ]);
  assert.equal(result.revision, 'r1');
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.data));
  assert.ok(Object.isFrozen(result.data.families));
});

test('fails closed when the DWH catalog cannot be resolved', async () => {
  const adapter = createDwhAdapter({
    project: async () => {
      throw new Error('DWH unavailable');
    },
  });

  await assert.rejects(
    () => loadMetaModuleCatalog(adapter),
    /DWH unavailable/,
  );
});
