import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseProjectorId,
  projectorIdToDwhSymbol,
} from '../webengine.js';

test('parses canonical projector identity without rewriting it', () => {
  const parsed = parseProjectorId('AIGMos:Overview:Compact');

  assert.equal(parsed.id, 'AIGMos:Overview:Compact');
  assert.equal(parsed.domain, 'AIGMos');
  assert.equal(parsed.projector, 'Overview');
  assert.deepEqual(parsed.variants, ['Compact']);
  assert.equal(parsed.pathDomain, 'aigmos');
});

test('maps projector identity to a case-preserving DWH symbol', () => {
  assert.equal(
    projectorIdToDwhSymbol('LMTS:ranking:top3'),
    '#PROJECTOR:LMTS:ranking:top3',
  );
});

test('rejects malformed projector ids', () => {
  assert.throws(() => parseProjectorId('ranking'));
  assert.throws(() => parseProjectorId('LMTS:ranking:'));
  assert.throws(() => parseProjectorId('LMTS:rank ing'));
});
