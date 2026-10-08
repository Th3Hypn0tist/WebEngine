import {
  INSTANCE_ROOT_PATH,
  resolveInstancePath,
} from './instance-root.js';

const CONTENT_TYPES = Object.freeze([
  'text',
  'image',
  'svg',
  'video',
  'embed',
  'file',
]);

const CONTENT_TYPE_SET = new Set(CONTENT_TYPES);
const RECORD_KEYS = new Set(['id', 'domain', 'type', 'provider', 'content']);
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function assertRecordObject(record) {
  if (record == null || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('content record must be an object');
  }
}

function assertSegment(value, name) {
  if (typeof value !== 'string' || !SEGMENT.test(value)) {
    throw new Error(`content ${name} must match [A-Za-z0-9][A-Za-z0-9_-]*`);
  }
}

function assertContentString(value) {
  if (typeof value !== 'string') {
    throw new TypeError('content payload must be a string');
  }
}

function validateContentRecord(record) {
  assertRecordObject(record);

  for (const key of Object.keys(record)) {
    if (!RECORD_KEYS.has(key)) {
      throw new Error(`unknown content record field: ${key}`);
    }
  }

  assertSegment(record.id, 'id');
  assertSegment(record.domain, 'domain');
  assertSegment(record.provider, 'provider');

  if (!CONTENT_TYPE_SET.has(record.type)) {
    throw new Error(`unsupported content type: ${record.type}`);
  }

  assertContentString(record.content);
  return true;
}

function freezeContentRecord(record) {
  validateContentRecord(record);
  return Object.freeze({
    id: record.id,
    domain: record.domain,
    type: record.type,
    provider: record.provider,
    content: record.content,
  });
}

function assertProviderRelativeResource(resource) {
  if (typeof resource !== 'string' || !resource || resource !== resource.trim()) {
    throw new Error('provider resource must be a non-empty trimmed string');
  }

  if (
    resource.startsWith('/') ||
    resource.startsWith('\\') ||
    resource.includes('\\') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(resource)
  ) {
    throw new Error('provider resource must be relative to its provider namespace');
  }

  const pathOnly = resource.split(/[?#]/, 1)[0];
  const segments = pathOnly.split('/');

  if (segments.some(segment => segment === '..' || segment === '.')) {
    throw new Error('provider resource must not contain parent or current-directory traversal');
  }

  return resource;
}

function assertResolvedUrl(value, label = 'resolved content URL') {
  if (typeof value !== 'string' || !value || value !== value.trim()) {
    throw new TypeError(`${label} must be a non-empty trimmed string`);
  }

  if (/[\u0000-\u001F\u007F]/.test(value)) {
    throw new Error(`${label} must not contain control characters`);
  }

  if (value.startsWith('/') && !value.startsWith('//')) {
    return value;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be root-relative or use http(s)`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`${label} must be root-relative or use http(s)`);
  }

  return value;
}

function createContentProviderRegistry() {
  const resolvers = new Map();

  return Object.freeze({
    register(provider, resolver) {
      assertSegment(provider, 'provider');
      if (typeof resolver !== 'function') {
        throw new TypeError('content provider resolver must be a function');
      }
      if (resolvers.has(provider)) {
        throw new Error(`content provider already registered: ${provider}`);
      }
      resolvers.set(provider, resolver);
      return this;
    },

    has(provider) {
      assertSegment(provider, 'provider');
      return resolvers.has(provider);
    },

    async resolve(record, context = Object.freeze({})) {
      const canonical = freezeContentRecord(record);
      const resolver = resolvers.get(canonical.provider);

      if (!resolver) {
        throw new Error(`unknown content provider: ${canonical.provider}`);
      }

      const source = await resolver(canonical, context);
      return normalizeResolvedContent(canonical, source);
    },
  });
}

function normalizeResolvedContent(record, source) {
  switch (record.type) {
    case 'text': {
      if (typeof source !== 'string') {
        throw new TypeError('text provider must resolve to a string');
      }
      return Object.freeze({
        id: record.id,
        domain: record.domain,
        type: 'text',
        text: source,
      });
    }

    case 'image':
    case 'svg':
    case 'video':
    case 'file': {
      const url = assertResolvedUrl(
        source,
        `${record.type} provider URL`,
      );
      return Object.freeze({
        id: record.id,
        domain: record.domain,
        type: record.type,
        url,
      });
    }

    case 'embed': {
      if (source == null || typeof source !== 'object' || Array.isArray(source)) {
        throw new TypeError('embed provider must resolve to a structured descriptor');
      }
      const url = assertResolvedUrl(source.url, 'embed provider URL');
      if ('html' in source || 'iframe' in source) {
        throw new Error('embed provider must not return authoritative HTML or iframe payloads');
      }

      const descriptor = {
        id: record.id,
        domain: record.domain,
        type: 'embed',
        provider: record.provider,
        resource: record.content,
        url,
      };

      if (source.title != null) {
        if (typeof source.title !== 'string') {
          throw new TypeError('embed provider title must be a string when present');
        }
        descriptor.title = source.title;
      }

      return Object.freeze(descriptor);
    }

    default:
      throw new Error(`unsupported content type: ${record.type}`);
  }
}

function createInlineTextProvider() {
  return record => {
    if (record.type !== 'text') {
      throw new Error('inline text provider accepts only type=text');
    }
    return record.content;
  };
}

function createAssetProvider(
  baseUrl,
  {
    instanceRoot = INSTANCE_ROOT_PATH,
  } = {},
) {
  if (typeof baseUrl !== 'string' || !baseUrl || baseUrl !== baseUrl.trim()) {
    throw new TypeError('asset provider baseUrl must be a non-empty trimmed string');
  }

  const physicalBase = baseUrl.startsWith('/')
    ? resolveInstancePath(baseUrl, { instanceRoot })
    : baseUrl;

  const normalizedBase = physicalBase.endsWith('/')
    ? physicalBase
    : `${physicalBase}/`;

  return record => {
    if (!['image', 'svg', 'video', 'file'].includes(record.type)) {
      throw new Error('asset provider accepts only image, svg, video or file content');
    }

    const resource = assertProviderRelativeResource(record.content);
    return `${normalizedBase}${resource}`;
  };
}

function createEmbedProvider(resolveResource) {
  if (typeof resolveResource !== 'function') {
    throw new TypeError('embed provider requires a resource resolver function');
  }

  return async (record, context) => {
    if (record.type !== 'embed') {
      throw new Error('embed provider accepts only type=embed');
    }

    const resource = assertProviderRelativeResource(record.content);
    const descriptor = await resolveResource(resource, context);

    if (typeof descriptor === 'string') {
      return { url: descriptor };
    }

    return descriptor;
  };
}

async function resolveContent(record, registry, context = Object.freeze({})) {
  if (!registry || typeof registry.resolve !== 'function') {
    throw new TypeError('resolveContent requires a Content provider registry');
  }
  return registry.resolve(record, context);
}

export {
  CONTENT_TYPES,
  validateContentRecord,
  freezeContentRecord,
  assertProviderRelativeResource,
  assertResolvedUrl,
  createContentProviderRegistry,
  createInlineTextProvider,
  createAssetProvider,
  createEmbedProvider,
  resolveContent,
};
