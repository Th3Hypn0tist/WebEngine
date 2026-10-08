import { projectDwhSymbol } from './dwh.js';

const METAMODULE_CATALOG_SYMBOL = '#METAMODULE:CATALOG';

const IDENTITY_STATUSES = Object.freeze(new Set([
  'CANONICAL_CONFIRMED',
  'CANONICAL_VERIFY_LATEST',
  'DISPLAY_NAME_ONLY',
  'UNRESOLVED',
  'UNRESOLVED_CURRENT_ID_AXIS',
]));

const STRUCTURE_STATUSES = Object.freeze(new Set([
  'STRUCTURE_PROVEN',
  'STRUCTURE_PARTIAL',
  'STRUCTURE_UNRESOLVED',
]));

const EVENT_STATUSES = Object.freeze(new Set([
  'EVENTS_PROVEN',
  'EVENT_REVIEW_REQUIRED',
  'EVENT_CONFLICT',
  'NOT_EVENT_OWNER',
]));

function assertPlainObject(value, label) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  return value;
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }
  return value;
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function validateFamily(family) {
  assertPlainObject(family, 'MetaModule catalog family');
  assertString(family.id, 'family.id');
  assertString(family.label, 'family.label');
  assertString(family.kind, 'family.kind');
  assertString(family.status, 'family.status');
  assertArray(family.members, 'family.members');
  if (family.member_count != null && family.member_count !== family.members.length) {
    throw new Error(`family ${family.id} member_count does not match members length`);
  }
  return family;
}

function validateGroup(group) {
  assertPlainObject(group, 'MetaModule catalog group');
  assertString(group.id, 'group.id');
  assertString(group.label, 'group.label');
  assertString(group.kind, 'group.kind');
  assertString(group.status, 'group.status');
  if (!Number.isInteger(group.member_count) || group.member_count < 0) {
    throw new TypeError('group.member_count must be a non-negative integer');
  }
  if (group.event_status !== 'NOT_EVENT_OWNER') {
    throw new Error(`group ${group.id} must use NOT_EVENT_OWNER`);
  }
  if (group.members == null || typeof group.members !== 'object') {
    throw new TypeError('group.members must be an array or object');
  }
  return group;
}

function validateGap(gap) {
  assertPlainObject(gap, 'MetaModule catalog gap');
  assertString(gap.id, 'gap.id');
  assertString(gap.severity, 'gap.severity');
  assertString(gap.status, 'gap.status');
  assertString(gap.known, 'gap.known');
  assertString(gap.unknown, 'gap.unknown');
  assertString(gap.rule, 'gap.rule');
  return gap;
}

function validateMetaModuleCatalog(data) {
  assertPlainObject(data, 'MetaModule catalog');

  const families = assertArray(data.families, 'catalog.families');
  const groups = assertArray(data.groups, 'catalog.groups');
  const gaps = assertArray(data.gaps, 'catalog.gaps');

  for (const family of families) validateFamily(family);
  for (const group of groups) validateGroup(group);
  for (const gap of gaps) validateGap(gap);

  if (data.members != null) assertArray(data.members, 'catalog.members');
  if (data.known_actual_composition_examples != null) {
    assertArray(data.known_actual_composition_examples, 'catalog.known_actual_composition_examples');
  }

  return data;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value == null || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

async function loadMetaModuleCatalog(adapter, context = Object.freeze({})) {
  const envelope = await projectDwhSymbol(adapter, METAMODULE_CATALOG_SYMBOL, context);
  validateMetaModuleCatalog(envelope.data);
  return Object.freeze({
    symbol: envelope.symbol,
    data: deepFreeze(envelope.data),
    revision: envelope.revision,
    generated_at: envelope.generated_at,
  });
}

export {
  METAMODULE_CATALOG_SYMBOL,
  IDENTITY_STATUSES,
  STRUCTURE_STATUSES,
  EVENT_STATUSES,
  validateMetaModuleCatalog,
  loadMetaModuleCatalog,
};
