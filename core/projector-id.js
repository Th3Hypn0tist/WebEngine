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

  return Object.freeze({
    id,
    domain,
    projector,
    variants: Object.freeze([...variants]),
    pathDomain: domain.toLowerCase(),
  });
}

function projectorIdToDwhSymbol(id) {
  return `#PROJECTOR:${parseProjectorId(id).id}`;
}

export {
  parseProjectorId,
  projectorIdToDwhSymbol,
};
