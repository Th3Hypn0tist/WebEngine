import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseProjectorId,
  resolveProjectorDefinitionUrls,
  resolveDefaultRendererUrl,
} from '../webengine.js';

test('resolves base projector', () => {
  assert.deepEqual(
    resolveProjectorDefinitionUrls('LMTS:ranking'),
    ['/app/lmts/projectors/ranking.json'],
  );
  assert.equal(
    resolveDefaultRendererUrl('LMTS:ranking'),
    '/app/lmts/renderers/ranking.js',
  );
});

test('resolves nested declarative variants', () => {
  assert.deepEqual(
    resolveProjectorDefinitionUrls('LMTS:ranking:top3'),
    [
      '/app/lmts/projectors/ranking.json',
      '/app/lmts/projectors/ranking/top3.json',
    ],
  );
});

test('keeps canonical id while deriving lowercase paths', () => {
  const parsed = parseProjectorId('AIGMos:Overview');
  assert.equal(parsed.domain, 'AIGMos');
  assert.equal(parsed.pathDomain, 'aigmos');
  assert.equal(parsed.pathProjector, 'overview');
});

test('rejects malformed ids', () => {
  assert.throws(() => parseProjectorId('ranking'));
  assert.throws(() => parseProjectorId('LMTS:ranking:'));
  assert.throws(() => parseProjectorId('LMTS:rank ing'));
});


test('projects projector and renderer paths through a relocatable instance root', () => {
  assert.deepEqual(
    resolveProjectorDefinitionUrls('LMTS:ranking:top3', {
      instanceRoot: '/test/',
    }),
    [
      '/test/app/lmts/projectors/ranking.json',
      '/test/app/lmts/projectors/ranking/top3.json',
    ],
  );

  assert.equal(
    resolveDefaultRendererUrl('LMTS:ranking', {
      instanceRoot: '/test/',
    }),
    '/test/app/lmts/renderers/ranking.js',
  );
});
