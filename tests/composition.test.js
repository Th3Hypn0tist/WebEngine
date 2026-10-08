import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSiteTreeIndex,
  createPageContext,
  createWebEngineShell,
  createProjectorSlot,
  mountProjectorSlot,
  composeProjector,
  destroyWebEngineComposition,
} from '../webengine.js';

function createDocument() {
  const document = {
    createElement(tagName) {
      const classes = new Set();
      const attributes = new Map();
      const listeners = new Map();

      return {
        tagName: tagName.toUpperCase(),
        ownerDocument: document,
        children: [],
        dataset: {},
        className: '',
        textContent: '',
        href: '',
        classList: {
          add(value) { classes.add(value); },
          contains(value) { return classes.has(value); },
        },
        append(...nodes) {
          this.children.push(...nodes);
        },
        replaceChildren(...nodes) {
          this.children = nodes;
        },
        setAttribute(name, value) {
          attributes.set(name, String(value));
        },
        getAttribute(name) {
          return attributes.get(name) ?? null;
        },
        addEventListener(type, handler) {
          listeners.set(type, handler);
        },
        removeEventListener(type, handler) {
          if (listeners.get(type) === handler) listeners.delete(type);
        },
      };
    },
  };

  return document;
}

function tree() {
  return createSiteTreeIndex({
    id: 'aigm',
    label: 'AIGM',
    children: [
      {
        id: 'aigmos',
        label: 'AIGMos',
        path: '/aigmos/',
        children: [
          {
            id: 'expose',
            label: 'Expose',
            path: '/aigmos/expose/',
          },
        ],
      },
      {
        id: 'lmts',
        label: 'LMTS',
        path: '/lmts/',
        children: [
          {
            id: 'ranking',
            label: 'Ranking',
            path: '/lmts/ranking/',
          },
        ],
      },
    ],
  });
}

function resolved(
  id = 'LMTS:ranking',
  projection = { title: 'Ranking' },
) {
  return Object.freeze({
    id,
    projection: Object.freeze({ ...projection }),
  });
}

test('creates immutable page context from SiteTree projections', () => {
  const context = createPageContext(tree(), '/aigmos/expose/');

  assert.equal(context.currentNode.id, 'expose');
  assert.equal(context.currentSection.id, 'aigmos');
  assert.deepEqual(
    context.breadcrumbs.map(item => item.id),
    ['aigm', 'aigmos', 'expose'],
  );
  assert.deepEqual(context.activeNavigation, {
    currentId: 'expose',
    ancestorIds: ['aigm', 'aigmos'],
  });
  assert.ok(Object.isFrozen(context));
  assert.ok(Object.isFrozen(context.currentNode));
});

test('shell emits only canonical WebEngine structural presentation classes', () => {
  const document = createDocument();
  const shell = createWebEngineShell({
    document,
    siteTree: tree(),
    currentPath: '/lmts/',
    title: 'LMTS',
  });

  assert.ok(shell.root.classList.contains('we-shell'));
  assert.ok(shell.header.classList.contains('we-header'));
  assert.ok(shell.main.classList.contains('we-main'));
  assert.ok(shell.page.classList.contains('we-page'));
  assert.ok(shell.globalNavigation.classList.contains('we-nav'));

  const lmtsLink = shell.globalNavigation.children[1];
  assert.ok(lmtsLink.classList.contains('we-nav-item'));
  assert.equal(lmtsLink.href, '/lmts/');
  assert.equal(lmtsLink.getAttribute('aria-current'), 'page');

  const nested = createWebEngineShell({
    document,
    siteTree: tree(),
    currentPath: '/aigmos/expose/',
  });
  assert.equal(nested.breadcrumbs.children[0].tagName, 'SPAN');
  assert.equal(nested.breadcrumbs.children[0].href, '');
  assert.equal(nested.breadcrumbs.children.at(-1).getAttribute('aria-current'), 'page');
});

test('projector slot keeps heading outside renderer-owned live boundary', () => {
  const document = createDocument();
  const shell = createWebEngineShell({
    document,
    siteTree: tree(),
    currentPath: '/lmts/',
  });

  const slot = createProjectorSlot(shell, resolved(), {
    title: 'Ranking',
  });

  assert.ok(slot.section.classList.contains('we-section'));
  assert.ok(slot.header.classList.contains('we-projector-header'));
  assert.ok(slot.boundary.classList.contains('we-projector'));
  assert.equal(slot.section.children[0], slot.header);
  assert.equal(slot.section.children[1], slot.boundary);
});

test('mountProjectorSlot delegates lifecycle to renderer runtime', async () => {
  const document = createDocument();
  const shell = createWebEngineShell({
    document,
    siteTree: tree(),
    currentPath: '/lmts/',
  });
  const projector = resolved();
  const slot = createProjectorSlot(shell, projector);

  const result = await mountProjectorSlot(
    slot,
    projector,
    {},
    {
      importModule: async () => ({
        mount(target, projection) {
          target.textContent = projection.title;
        },
      }),
    },
  );

  assert.equal(result.state, 'ready');
  assert.equal(slot.boundary.dataset.state, 'ready');
  assert.equal(slot.boundary.children[0].textContent, 'Ranking');
});

test('projector slot refuses a different resolved projector identity', async () => {
  const document = createDocument();
  const shell = createWebEngineShell({
    document,
    siteTree: tree(),
    currentPath: '/lmts/',
  });
  const slot = createProjectorSlot(shell, resolved());

  await assert.rejects(
    mountProjectorSlot(
      slot,
      resolved('LMTS:systems'),
      {},
      {
        importModule: async () => ({ mount() {} }),
      },
    ),
    /projector slot id mismatch/,
  );
});

test('composeProjector isolates one projector failure into its own slot result', async () => {
  const document = createDocument();
  const shell = createWebEngineShell({
    document,
    siteTree: tree(),
    currentPath: '/lmts/',
  });

  const composed = await composeProjector(
    shell,
    resolved(),
    {},
    {
      importModule: async () => ({
        mount() {
          throw new Error('projector failed');
        },
      }),
    },
  );

  assert.equal(composed.slot.boundary.dataset.state, 'error');
  assert.equal(composed.error.message, 'projector failed');
});

test('destroyWebEngineComposition tears down all registered projector slots', async () => {
  const document = createDocument();
  const shell = createWebEngineShell({
    document,
    siteTree: tree(),
    currentPath: '/lmts/',
  });

  let destroys = 0;

  for (const id of ['LMTS:ranking', 'LMTS:systems']) {
    const projector = resolved(id);
    const slot = createProjectorSlot(shell, projector);

    await mountProjectorSlot(
      slot,
      projector,
      {},
      {
        importModule: async () => ({
          mount() {
            return {
              destroy() {
                destroys += 1;
              },
            };
          },
        }),
      },
    );
  }

  const results = await destroyWebEngineComposition(shell);

  assert.equal(results.length, 2);
  assert.equal(destroys, 2);
  assert.deepEqual(shell.root.children, []);
  assert.throws(
    () => createProjectorSlot(shell, resolved()),
    /has been destroyed/,
  );
});
