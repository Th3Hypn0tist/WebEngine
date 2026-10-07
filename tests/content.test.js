import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTENT_TYPES,
  validateContentRecord,
  freezeContentRecord,
  assertProviderRelativeResource,
  createContentProviderRegistry,
  createInlineTextProvider,
  createAssetProvider,
  createEmbedProvider,
  resolveContent,
} from '../webengine.js';

const record = overrides => ({
  id: 'hero',
  domain: 'site',
  type: 'text',
  provider: 'inline',
  content: 'Hello',
  ...overrides,
});

test('defines the canonical Content type vocabulary', () => {
  assert.deepEqual(
    CONTENT_TYPES,
    ['text', 'image', 'svg', 'video', 'embed', 'file'],
  );
  assert.ok(Object.isFrozen(CONTENT_TYPES));
});

test('validates and freezes the canonical five-field Content record', () => {
  const source = record();
  assert.equal(validateContentRecord(source), true);

  const canonical = freezeContentRecord(source);
  source.content = 'MUTATED';

  assert.deepEqual(canonical, {
    id: 'hero',
    domain: 'site',
    type: 'text',
    provider: 'inline',
    content: 'Hello',
  });
  assert.ok(Object.isFrozen(canonical));
});

test('rejects unknown fields and unsupported types', () => {
  assert.throws(
    () => validateContentRecord({ ...record(), label: 'not content' }),
    /unknown content record field/,
  );
  assert.throws(
    () => validateContentRecord(record({ type: 'button' })),
    /unsupported content type/,
  );
});

test('rejects invalid identity and provider segments', () => {
  assert.throws(() => validateContentRecord(record({ id: 'hero title' })));
  assert.throws(() => validateContentRecord(record({ domain: '' })));
  assert.throws(() => validateContentRecord(record({ provider: 'brand/assets' })));
});

test('rejects absolute and traversal provider resources', () => {
  for (const value of [
    '/logo.svg',
    '../logo.svg',
    'icons/../logo.svg',
    './logo.svg',
    'https://example.com/logo.svg',
    'C:\\logo.svg',
    'icons\\logo.svg',
  ]) {
    assert.throws(() => assertProviderRelativeResource(value));
  }

  assert.equal(assertProviderRelativeResource('icons/logo.svg'), 'icons/logo.svg');
});

test('resolves inline text through provider registry', async () => {
  const registry = createContentProviderRegistry()
    .register('inline', createInlineTextProvider());

  assert.deepEqual(
    await resolveContent(record(), registry),
    {
      id: 'hero',
      domain: 'site',
      type: 'text',
      text: 'Hello',
    },
  );
});

test('resolves typed asset descriptors from provider-relative resources', async () => {
  const registry = createContentProviderRegistry()
    .register('brand', createAssetProvider('/assets/brand'));

  assert.deepEqual(
    await resolveContent(
      record({
        id: 'logo',
        type: 'svg',
        provider: 'brand',
        content: 'logo.svg',
      }),
      registry,
    ),
    {
      id: 'logo',
      domain: 'site',
      type: 'svg',
      url: '/assets/brand/logo.svg',
    },
  );
});

test('asset providers cannot be used to smuggle unsupported presentation types', async () => {
  const registry = createContentProviderRegistry()
    .register('brand', createAssetProvider('/assets/brand'));

  await assert.rejects(
    resolveContent(
      record({ type: 'text', provider: 'brand', content: 'message.txt' }),
      registry,
    ),
    /asset provider accepts only/,
  );
});

test('resolves embed resources to structured descriptors without HTML authority', async () => {
  const registry = createContentProviderRegistry()
    .register(
      'youtube',
      createEmbedProvider(resource => ({
        url: `https://www.youtube-nocookie.com/embed/${resource}`,
        title: 'Video',
      })),
    );

  assert.deepEqual(
    await resolveContent(
      record({
        id: 'intro',
        type: 'embed',
        provider: 'youtube',
        content: 'abc123',
      }),
      registry,
    ),
    {
      id: 'intro',
      domain: 'site',
      type: 'embed',
      provider: 'youtube',
      resource: 'abc123',
      url: 'https://www.youtube-nocookie.com/embed/abc123',
      title: 'Video',
    },
  );
});

test('rejects embed HTML and iframe payloads', async () => {
  const htmlRegistry = createContentProviderRegistry()
    .register(
      'unsafe',
      createEmbedProvider(() => ({
        url: 'https://example.com/embed',
        html: '<iframe></iframe>',
      })),
    );

  await assert.rejects(
    resolveContent(
      record({ type: 'embed', provider: 'unsafe', content: 'resource' }),
      htmlRegistry,
    ),
    /must not return authoritative HTML/,
  );
});

test('rejects unknown and duplicate providers', async () => {
  const registry = createContentProviderRegistry()
    .register('inline', createInlineTextProvider());

  assert.throws(
    () => registry.register('inline', createInlineTextProvider()),
    /already registered/,
  );

  await assert.rejects(
    resolveContent(record({ provider: 'missing' }), registry),
    /unknown content provider/,
  );
});

test('provider resolver receives frozen canonical record and caller context', async () => {
  const context = Object.freeze({ locale: 'fi' });
  let receivedRecord;
  let receivedContext;

  const registry = createContentProviderRegistry()
    .register('probe', async (canonical, ctx) => {
      receivedRecord = canonical;
      receivedContext = ctx;
      return canonical.content;
    });

  await resolveContent(record({ provider: 'probe' }), registry, context);

  assert.ok(Object.isFrozen(receivedRecord));
  assert.equal(receivedRecord.content, 'Hello');
  assert.equal(receivedContext, context);
});
