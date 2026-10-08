import {
  INSTANCE_ROOT_PATH,
  resolveInstancePath,
} from './instance-root.js';

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function parseProjectorId(id) {
  if (typeof id !== 'string' || !id.trim()) {
    throw new TypeError('projector id must be a non-empty string');
  }

  const parts = id.split(':');

  if (parts.length < 2 || parts.some(part => !SEGMENT.test(part))) {
    throw new Error('projector id must use DOMAIN:PROJECTOR[:VARIANT...]');
  }

  const [domain, projector, ...variants] = parts;

  return {
    id,
    domain,
    projector,
    variants,
    pathDomain: domain.toLowerCase(),
    pathProjector: projector.toLowerCase(),
    pathVariants: variants.map(value => value.toLowerCase()),
  };
}

function resolveProjectorDefinitionUrls(
  id,
  {
    instanceRoot = INSTANCE_ROOT_PATH,
  } = {},
) {
  const parsed = parseProjectorId(id);
  const logicalRoot = `/app/${parsed.pathDomain}/projectors/${parsed.pathProjector}`;
  const logicalUrls = [`${logicalRoot}.json`];

  parsed.pathVariants.forEach((_, index) => {
    const variantPath = parsed.pathVariants.slice(0, index + 1).join('/');
    logicalUrls.push(`${logicalRoot}/${variantPath}.json`);
  });

  return logicalUrls.map(url =>
    resolveInstancePath(url, { instanceRoot })
  );
}

function resolveDefaultRendererUrl(
  id,
  {
    instanceRoot = INSTANCE_ROOT_PATH,
  } = {},
) {
  const parsed = parseProjectorId(id);
  return resolveInstancePath(
    `/app/${parsed.pathDomain}/renderers/${parsed.pathProjector}.js`,
    { instanceRoot },
  );
}

export {
  parseProjectorId,
  resolveProjectorDefinitionUrls,
  resolveDefaultRendererUrl,
};
