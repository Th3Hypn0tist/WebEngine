const DWH_SYMBOL_PATTERN = /^#[A-Z][A-Z0-9_:-]*$/;

function assertDwhSymbol(symbol) {
  if (typeof symbol !== 'string' || !DWH_SYMBOL_PATTERN.test(symbol)) {
    throw new Error('DWH symbol must match #[A-Z][A-Z0-9_:-]*');
  }
}

function createDwhAdapter({ project }) {
  if (typeof project !== 'function') {
    throw new TypeError('DWH adapter requires a project(symbol, context) function');
  }

  return Object.freeze({
    async project(symbol, context = Object.freeze({})) {
      assertDwhSymbol(symbol);
      return project(symbol, context);
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
  createDwhAdapter,
  projectDwhSymbol,
};
