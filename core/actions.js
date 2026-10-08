import { projectDwhSymbol } from './dwh.js';

const ACTION_RECORD_KEYS = new Set(['id', 'label', 'action']);
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const ACTION_REF = /^([A-Za-z0-9][A-Za-z0-9_-]*):([A-Za-z0-9][A-Za-z0-9_-]*)$/;

function assertActionSegment(value, name) {
  if (typeof value !== 'string' || !SEGMENT.test(value)) {
    throw new Error(`action ${name} must match [A-Za-z0-9][A-Za-z0-9_-]*`);
  }
}

function parseActionRef(action) {
  if (typeof action !== 'string') {
    throw new TypeError('action reference must be a string');
  }

  const match = ACTION_REF.exec(action);
  if (!match) {
    throw new Error('action reference must use DOMAIN:ACTION');
  }

  return Object.freeze({
    action,
    domain: match[1],
    name: match[2],
  });
}

function validateActionRecord(record) {
  if (record == null || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('action record must be an object');
  }

  for (const key of Object.keys(record)) {
    if (!ACTION_RECORD_KEYS.has(key)) {
      throw new Error(`unknown action record field: ${key}`);
    }
  }

  assertActionSegment(record.id, 'id');

  if (
    typeof record.label !== 'string' ||
    !record.label.trim() ||
    record.label !== record.label.trim()
  ) {
    throw new Error('action label must be a non-empty trimmed string');
  }

  parseActionRef(record.action);
  return true;
}

function freezeActionRecord(record) {
  validateActionRecord(record);
  return Object.freeze({
    id: record.id,
    label: record.label,
    action: record.action,
  });
}

function createActionRegistry() {
  const records = new Map();

  return Object.freeze({
    register(record) {
      const canonical = freezeActionRecord(record);
      if (records.has(canonical.id)) {
        throw new Error(`action already registered: ${canonical.id}`);
      }
      records.set(canonical.id, canonical);
      return this;
    },

    has(id) {
      assertActionSegment(id, 'id');
      return records.has(id);
    },

    get(id) {
      assertActionSegment(id, 'id');
      return records.get(id) ?? null;
    },
  });
}

function actionIdToDwhSymbol(domain, id) {
  assertActionSegment(domain, 'domain');
  assertActionSegment(id, 'id');
  return `#ACTION:${domain}:${id}`;
}

async function loadActionDeclaration({
  dwh,
  domain,
  id,
  context = Object.freeze({}),
} = {}) {
  const symbol = actionIdToDwhSymbol(domain, id);
  const projection = await projectDwhSymbol(dwh, symbol, context);
  const canonical = freezeActionRecord(projection.data);
  const ref = parseActionRef(canonical.action);

  if (canonical.id !== id || ref.domain !== domain) {
    throw new Error(`Action projection identity mismatch for ${symbol}`);
  }

  return canonical;
}

async function executeAction(record, executor, {
  context = Object.freeze({}),
  event = null,
} = {}) {
  const canonical = freezeActionRecord(record);

  if (typeof executor !== 'function') {
    throw new TypeError('action executor must be a function');
  }

  return executor(
    canonical.action,
    Object.freeze({
      id: canonical.id,
      label: canonical.label,
      context,
      event,
    }),
  );
}

function bindActionControl(
  control,
  record,
  executor,
  {
    context = Object.freeze({}),
    event = 'click',
    setLabel = true,
    onError = null,
  } = {},
) {
  const canonical = freezeActionRecord(record);

  if (
    control == null ||
    typeof control !== 'object' ||
    typeof control.addEventListener !== 'function' ||
    typeof control.removeEventListener !== 'function'
  ) {
    throw new TypeError('action control must support addEventListener/removeEventListener');
  }

  if (typeof executor !== 'function') {
    throw new TypeError('action executor must be a function');
  }

  if (typeof event !== 'string' || !event) {
    throw new TypeError('action event must be a non-empty string');
  }

  if (setLabel && 'textContent' in control) {
    control.textContent = canonical.label;
  }

  let active = true;

  const handler = async domEvent => {
    if (!active) return;

    try {
      await executeAction(canonical, executor, {
        context,
        event: domEvent,
      });
    } catch (error) {
      if (typeof onError === 'function') {
        try {
          onError(error, Object.freeze({
            actionId: canonical.id,
            action: canonical.action,
          }));
        } catch {
          // Diagnostics must not alter binding lifecycle.
        }
        return;
      }

      queueMicrotask(() => {
        throw error;
      });
    }
  };

  control.addEventListener(event, handler);

  return Object.freeze({
    record: canonical,
    destroy() {
      if (!active) return;
      active = false;
      control.removeEventListener(event, handler);
    },
  });
}

export {
  parseActionRef,
  validateActionRecord,
  freezeActionRecord,
  createActionRegistry,
  actionIdToDwhSymbol,
  loadActionDeclaration,
  executeAction,
  bindActionControl,
};
