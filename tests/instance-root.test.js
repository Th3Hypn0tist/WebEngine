import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WEBENGINE_DEPLOY_MARKER,
  INSTANCE_ROOT_PATH,
  normalizeInstanceRoot,
  deriveInstanceRootPath,
  resolveInstancePath,
  stripInstanceRoot,
} from '../webengine.js';

test('derives relocatable instance root from canonical WebEngine module location', () => {
  assert.equal(WEBENGINE_DEPLOY_MARKER, '/lib/webengine/');

  assert.equal(
    deriveInstanceRootPath(
      'https://aigm.fi/test/lib/webengine/core/instance-root.js',
    ),
    '/test/',
  );

  assert.equal(
    deriveInstanceRootPath(
      'https://aigm.fi/lib/webengine/core/instance-root.js',
    ),
    '/',
  );
});

test('non-browser module URLs use production-compatible root fallback', () => {
  assert.equal(
    deriveInstanceRootPath('file:///home/aigm/WebEngine/core/instance-root.js'),
    '/',
  );
  assert.equal(INSTANCE_ROOT_PATH, '/');
});

test('normalizes instance root without embedding a test-specific name', () => {
  assert.equal(normalizeInstanceRoot('/test'), '/test/');
  assert.equal(normalizeInstanceRoot('/candidate/site'), '/candidate/site/');
  assert.equal(normalizeInstanceRoot('/'), '/');
});

test('maps canonical logical paths into the current instance root', () => {
  assert.equal(
    resolveInstancePath('/site.json', { instanceRoot: '/test/' }),
    '/test/site.json',
  );
  assert.equal(
    resolveInstancePath('/app/lmts/projectors/ranking.json', {
      instanceRoot: '/test/',
    }),
    '/test/app/lmts/projectors/ranking.json',
  );
  assert.equal(
    resolveInstancePath('/lib/webengine/webengine.js', {
      instanceRoot: '/',
    }),
    '/lib/webengine/webengine.js',
  );
});

test('strips instance root back to canonical logical SiteTree path', () => {
  assert.equal(
    stripInstanceRoot('/test/lmts/ranking/', {
      instanceRoot: '/test/',
    }),
    '/lmts/ranking/',
  );
  assert.equal(
    stripInstanceRoot('/test/', { instanceRoot: '/test/' }),
    '/',
  );
  assert.equal(
    stripInstanceRoot('/lmts/', { instanceRoot: '/' }),
    '/lmts/',
  );
  assert.equal(
    stripInstanceRoot('/other/lmts/', { instanceRoot: '/test/' }),
    null,
  );
});

test('rejects traversal and URL-like instance paths', () => {
  for (const value of [
    '../test',
    '/test/../prod/',
    '//example.com/test/',
    '/test/?x=1',
    '/test/#x',
    '/test\\bad/',
  ]) {
    assert.throws(() => normalizeInstanceRoot(value));
  }
});
