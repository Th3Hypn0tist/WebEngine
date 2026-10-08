import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseActionRef,
  validateActionRecord,
  freezeActionRecord,
  createActionRegistry,
  actionIdToDwhSymbol,
  loadActionDeclaration,
  executeAction,
  createDwhAdapter,
  bindActionControl,
} from '../webengine.js';

function createControl() {
  const listeners = new Map();

  return {
    textContent: '',
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
    async dispatch(type, event = {}) {
      const handler = listeners.get(type);
      if (handler) await handler(event);
    },
    hasListener(type) {
      return listeners.has(type);
    },
  };
}

const refresh = () => ({
  id: 'refresh',
  label: 'Refresh',
  action: 'LMTS:refresh',
});

test('parses DOMAIN:ACTION references without executing behavior', () => {
  assert.deepEqual(
    parseActionRef('LMTS:refresh'),
    {
      action: 'LMTS:refresh',
      domain: 'LMTS',
      name: 'refresh',
    },
  );

  assert.throws(() => parseActionRef('refresh'));
  assert.throws(() => parseActionRef('LMTS:refresh:now'));
});

test('validates and freezes the canonical action record', () => {
  assert.equal(validateActionRecord(refresh()), true);
  const record = freezeActionRecord(refresh());

  assert.deepEqual(record, refresh());
  assert.ok(Object.isFrozen(record));
  assert.throws(
    () => validateActionRecord({ ...refresh(), path: '/lmts/' }),
    /unknown action record field/,
  );
});

test('action registry rejects duplicate identity', () => {
  const registry = createActionRegistry().register(refresh());

  assert.equal(registry.has('refresh'), true);
  assert.equal(registry.get('refresh').action, 'LMTS:refresh');
  assert.equal(registry.get('missing'), null);
  assert.throws(
    () => registry.register(refresh()),
    /already registered/,
  );
});

test('executeAction passes intent to an external domain executor', async () => {
  const context = Object.freeze({ machine: 'alpha' });

  const result = await executeAction(
    refresh(),
    async (action, details) => {
      assert.equal(action, 'LMTS:refresh');
      assert.equal(details.id, 'refresh');
      assert.equal(details.label, 'Refresh');
      assert.equal(details.context, context);
      return 'done';
    },
    { context },
  );

  assert.equal(result, 'done');
});

test('bindActionControl owns label and listener binding but not domain behavior', async () => {
  const control = createControl();
  const calls = [];
  const context = Object.freeze({ page: '/lmts/' });

  const binding = bindActionControl(
    control,
    refresh(),
    async (action, details) => {
      calls.push([action, details.context]);
    },
    { context },
  );

  assert.equal(control.textContent, 'Refresh');
  assert.equal(control.hasListener('click'), true);

  await control.dispatch('click', { type: 'click' });

  assert.deepEqual(calls, [['LMTS:refresh', context]]);
  assert.equal(binding.record.action, 'LMTS:refresh');

  binding.destroy();
  binding.destroy();
  assert.equal(control.hasListener('click'), false);
});

test('action binding reports executor failure without changing action authority', async () => {
  const control = createControl();
  const diagnostics = [];

  bindActionControl(
    control,
    refresh(),
    async () => {
      throw new Error('domain failed');
    },
    {
      onError(error, details) {
        diagnostics.push([error.message, details.action]);
      },
    },
  );

  await control.dispatch('click');
  assert.deepEqual(diagnostics, [['domain failed', 'LMTS:refresh']]);
});


test('maps Action identity to exact DWH symbol', () => {
  assert.equal(actionIdToDwhSymbol('LMTS', 'refresh'), '#ACTION:LMTS:refresh');
  assert.throws(() => actionIdToDwhSymbol('bad domain', 'refresh'));
});

test('loads canonical Action declaration from DWH', async () => {
  const calls = [];
  const dwh = createDwhAdapter({
    project: async (symbol, context) => {
      calls.push({ symbol, context });
      return { symbol, data: refresh() };
    },
  });

  const result = await loadActionDeclaration({
    dwh,
    domain: 'LMTS',
    id: 'refresh',
    context: { page: '/lmts/' },
  });

  assert.deepEqual(calls, [{
    symbol: '#ACTION:LMTS:refresh',
    context: { page: '/lmts/' },
  }]);
  assert.deepEqual(result, refresh());
  assert.ok(Object.isFrozen(result));
});

test('Action declaration fails closed when action reference domain mismatches symbol', async () => {
  const dwh = createDwhAdapter({
    project: async symbol => ({
      symbol,
      data: { id: 'refresh', label: 'Refresh', action: 'OTHER:refresh' },
    }),
  });

  await assert.rejects(
    () => loadActionDeclaration({ dwh, domain: 'LMTS', id: 'refresh' }),
    /identity mismatch/,
  );
});
