const DWH_SYMBOL_PATTERN = /^#[A-Za-z][A-Za-z0-9_:-]*$/;

function assertDwhSymbol(symbol) {
  if (typeof symbol !== 'string' || !DWH_SYMBOL_PATTERN.test(symbol)) {
    throw new Error('DWH symbol must match #[A-Za-z][A-Za-z0-9_:-]*');
  }
}

function normalizeDwhProjectionEnvelope(value, expectedSymbol = null) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('DWH projection must be an object');
  }

  const { symbol, data } = value;
  assertDwhSymbol(symbol);

  if (expectedSymbol != null && symbol !== expectedSymbol) {
    throw new Error(`DWH projection symbol mismatch: expected ${expectedSymbol}, got ${symbol}`);
  }

  if (!Object.prototype.hasOwnProperty.call(value, 'data')) {
    throw new Error('DWH projection must contain data');
  }

  const envelope = { symbol, data };
  if (value.revision != null) envelope.revision = value.revision;
  if (value.generated_at != null) envelope.generated_at = value.generated_at;

  return Object.freeze(envelope);
}

function createDwhAdapter({ project }) {
  if (typeof project !== 'function') {
    throw new TypeError('DWH adapter requires a project(symbol, context) function');
  }

  return Object.freeze({
    async project(symbol, context = Object.freeze({})) {
      assertDwhSymbol(symbol);
      const value = await project(symbol, context);
      return normalizeDwhProjectionEnvelope(value, symbol);
    },
  });
}

async function projectDwhSymbol(adapter, symbol, context = Object.freeze({})) {
  if (!adapter || typeof adapter.project !== 'function') {
    throw new TypeError('expected a DWH adapter created by createDwhAdapter');
  }

  assertDwhSymbol(symbol);
  return adapter.project(symbol, context);
}

export {
  DWH_SYMBOL_PATTERN,
  assertDwhSymbol,
  normalizeDwhProjectionEnvelope,
  createDwhAdapter,
  projectDwhSymbol,
};
