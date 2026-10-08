import {
  INSTANCE_ROOT_PATH,
  resolveInstancePath,
  stripInstanceRoot,
} from './instance-root.js';

import {
  resolveSiteNodeByPath,
} from './site-tree.js';

import {
  projectGlobalNavigation,
  projectLocalNavigation,
  projectBreadcrumbs,
  resolveCurrentSection,
  projectActiveNavigationState,
} from './site-tree-projections.js';

import {
  mountResolvedProjector,
  destroyRendererBoundary,
} from './renderer.js';

import {
  projectDwhSymbol,
} from './dwh.js';

import {
  resolveProjector,
} from './projector-resolver.js';

const COMPOSITION_STATE = new WeakMap();
const WEB_SYMBOL = '#WEB';

function assertDocument(document) {
  if (!document || typeof document.createElement !== 'function') {
    throw new TypeError('WebEngine composition requires a DOM-compatible document');
  }
  return document;
}

function addClass(node, className) {
  if (node.classList && typeof node.classList.add === 'function') {
    node.classList.add(className);
  } else {
    node.className = [node.className, className].filter(Boolean).join(' ');
  }
  return node;
}

function createElement(document, tag, className = null) {
  const node = document.createElement(tag);
  if (className) addClass(node, className);
  return node;
}

function detachedNode(node) {
  if (!node) return null;

  const value = {
    id: node.id,
    label: node.label,
  };

  if (node.path != null) {
    value.path = node.path;
  }

  return Object.freeze(value);
}

function createPageContext(
  siteTree,
  currentPath,
  {
    instanceRoot = INSTANCE_ROOT_PATH,
  } = {},
) {
  if (typeof currentPath !== 'string' || !currentPath) {
    throw new TypeError('page currentPath must be a non-empty string');
  }

  const logicalPath = stripInstanceRoot(currentPath, { instanceRoot });
  if (logicalPath == null) {
    throw new Error('page currentPath is outside the current WebEngine instance root');
  }

  const current = resolveSiteNodeByPath(siteTree, logicalPath);

  return Object.freeze({
    currentPath: logicalPath,
    currentNode: detachedNode(current),
    currentSection: resolveCurrentSection(siteTree, logicalPath),
    globalNavigation: projectGlobalNavigation(siteTree),
    localNavigation: projectLocalNavigation(siteTree, logicalPath),
    breadcrumbs: projectBreadcrumbs(siteTree, logicalPath),
    activeNavigation: projectActiveNavigationState(siteTree, logicalPath),
  });
}


function validateWebPageProjection(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('#WEB projection must be an object');
  }

  const keys = new Set(Object.keys(value));
  for (const required of ['page', 'children', 'placements']) {
    if (!keys.has(required)) {
      throw new Error(`#WEB projection missing required field: ${required}`);
    }
  }
  for (const key of keys) {
    if (!['page', 'children', 'placements'].includes(key)) {
      throw new Error(`unknown #WEB projection field: ${key}`);
    }
  }

  const page = value.page;
  if (page == null || typeof page !== 'object' || Array.isArray(page)) {
    throw new TypeError('#WEB page must be an object');
  }

  const pageKeys = new Set(Object.keys(page));
  for (const required of ['id', 'title', 'menuitem', 'description']) {
    if (!pageKeys.has(required)) {
      throw new Error(`#WEB page missing required field: ${required}`);
    }
  }
  for (const key of pageKeys) {
    if (!['id', 'title', 'menuitem', 'description'].includes(key)) {
      throw new Error(`unknown #WEB page field: ${key}`);
    }
  }

  if (typeof page.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(page.id)) {
    throw new Error('#WEB page id is invalid');
  }
  for (const field of ['title', 'menuitem', 'description']) {
    if (typeof page[field] !== 'string') {
      throw new TypeError(`#WEB page ${field} must be a string`);
    }
  }
  if (!page.title || page.title !== page.title.trim()) {
    throw new Error('#WEB page title must be non-empty and trimmed');
  }
  if (!page.menuitem || page.menuitem !== page.menuitem.trim()) {
    throw new Error('#WEB page menuitem must be non-empty and trimmed');
  }

  if (!Array.isArray(value.children) || !Array.isArray(value.placements)) {
    throw new TypeError('#WEB children and placements must be arrays');
  }

  let previousOrder = -1;
  const placementIds = new Set();

  for (const placement of value.placements) {
    if (placement == null || typeof placement !== 'object' || Array.isArray(placement)) {
      throw new TypeError('#WEB placement must be an object');
    }

    const placementKeys = new Set(Object.keys(placement));
    for (const required of ['id', 'kind', 'order', 'ref', 'title']) {
      if (!placementKeys.has(required)) {
        throw new Error(`#WEB placement missing required field: ${required}`);
      }
    }
    for (const key of placementKeys) {
      if (!['id', 'kind', 'order', 'ref', 'title'].includes(key)) {
        throw new Error(`unknown #WEB placement field: ${key}`);
      }
    }

    if (typeof placement.id !== 'string' || !placement.id) {
      throw new Error('#WEB placement id must be non-empty');
    }
    if (placementIds.has(placement.id)) {
      throw new Error(`duplicate #WEB placement id: ${placement.id}`);
    }
    placementIds.add(placement.id);

    if (placement.kind !== 'projector') {
      throw new Error(`unsupported #WEB placement kind: ${placement.kind}`);
    }
    if (!Number.isInteger(placement.order) || placement.order < 0) {
      throw new Error('#WEB placement order must be a non-negative integer');
    }
    if (placement.order <= previousOrder) {
      throw new Error('#WEB placements must be strictly ordered');
    }
    previousOrder = placement.order;

    if (typeof placement.ref !== 'string' || !placement.ref) {
      throw new Error('#WEB placement ref must be non-empty');
    }
    if (placement.title != null && (
      typeof placement.title !== 'string' ||
      !placement.title.trim() ||
      placement.title !== placement.title.trim()
    )) {
      throw new Error('#WEB placement title must be null or a trimmed non-empty string');
    }
  }

  return true;
}

function freezeWebPageProjection(value) {
  validateWebPageProjection(value);

  const page = Object.freeze({ ...value.page });
  const children = Object.freeze(value.children.map(child => Object.freeze({ ...child })));
  const placements = Object.freeze(value.placements.map(placement => Object.freeze({ ...placement })));

  return Object.freeze({
    page,
    children,
    placements,
  });
}

async function loadWebPage({
  dwh,
  path,
  context = Object.freeze({}),
} = {}) {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new TypeError('#WEB path must be an absolute logical public path');
  }

  const envelope = await projectDwhSymbol(
    dwh,
    WEB_SYMBOL,
    Object.freeze({
      ...(context ?? {}),
      path,
    }),
  );

  return Object.freeze({
    symbol: envelope.symbol,
    data: freezeWebPageProjection(envelope.data),
    revision: envelope.revision ?? null,
    generated_at: envelope.generated_at ?? null,
  });
}

async function composeWebPage({
  document = globalThis.document,
  dwh,
  siteTree,
  currentPath,
  instanceRoot = INSTANCE_ROOT_PATH,
  dwhContext = Object.freeze({}),
  rendererContext = Object.freeze({}),
  rendererOptions = Object.freeze({}),
} = {}) {
  const pageContext = createPageContext(siteTree, currentPath, { instanceRoot });
  if (!pageContext.currentNode) {
    throw new Error('cannot compose #WEB page for unknown SiteTree path');
  }

  const pageProjection = await loadWebPage({
    dwh,
    path: pageContext.currentPath,
    context: dwhContext,
  });

  if (pageProjection.data.page.id !== pageContext.currentNode.id) {
    throw new Error(
      `#WEB/#SITE page identity mismatch: ${pageProjection.data.page.id} != ${pageContext.currentNode.id}`,
    );
  }

  const composition = createWebEngineShell({
    document,
    siteTree,
    currentPath,
    title: pageProjection.data.page.title,
    instanceRoot,
  });

  const placements = [];

  for (const placement of pageProjection.data.placements) {
    const projector = await resolveProjector(placement.ref, {
      dwh,
      dwhContext: Object.freeze({
        ...(dwhContext ?? {}),
        page: pageContext.currentPath,
        placement: placement.id,
      }),
    });

    const composed = await composeProjector(
      composition,
      projector,
      Object.freeze({
        ...(rendererContext ?? {}),
        page: pageProjection.data.page,
        placement,
      }),
      {
        title: placement.title,
        instanceRoot,
        ...(rendererOptions ?? {}),
      },
    );

    placements.push(Object.freeze({
      placement,
      projector,
      result: composed,
    }));
  }

  return Object.freeze({
    composition,
    pageProjection,
    placements: Object.freeze(placements),
  });
}


function createNavigationElement(document, items, {
  currentId = null,
  label,
  instanceRoot = INSTANCE_ROOT_PATH,
} = {}) {
  const nav = createElement(document, 'nav', 'we-nav');

  if (label && typeof nav.setAttribute === 'function') {
    nav.setAttribute('aria-label', label);
  }

  for (const item of items) {
    const node = item.path != null
      ? createElement(document, 'a', 'we-nav-item')
      : createElement(document, 'span', 'we-nav-item');

    node.textContent = item.label;

    if (item.path != null) {
      if ('href' in node) {
        node.href = resolveInstancePath(item.path, { instanceRoot });
      } else if (typeof node.setAttribute === 'function') {
        node.setAttribute(
          'href',
          resolveInstancePath(item.path, { instanceRoot }),
        );
      }
    }

    if (
      currentId != null &&
      item.id === currentId &&
      typeof node.setAttribute === 'function'
    ) {
      node.setAttribute('aria-current', 'page');
    }

    nav.append(node);
  }

  return nav;
}

function createWebEngineShell({
  document = globalThis.document,
  siteTree,
  currentPath,
  title = null,
  instanceRoot = INSTANCE_ROOT_PATH,
} = {}) {
  const dom = assertDocument(document);
  const pageContext = createPageContext(
    siteTree,
    currentPath,
    { instanceRoot },
  );

  if (title != null && (typeof title !== 'string' || title !== title.trim())) {
    throw new TypeError('page title must be a trimmed string or null');
  }

  const root = createElement(dom, 'div', 'we-shell');
  const header = createElement(dom, 'header', 'we-header');
  const main = createElement(dom, 'main', 'we-main');
  const page = createElement(dom, 'div', 'we-page');

  const globalNavigation = createNavigationElement(
    dom,
    pageContext.globalNavigation,
    {
      currentId: pageContext.currentNode?.id ?? null,
      label: 'Global',
      instanceRoot,
    },
  );

  header.append(globalNavigation);

  let titleNode = null;
  if (title) {
    titleNode = createElement(dom, 'h1');
    titleNode.textContent = title;
    page.append(titleNode);
  }

  const breadcrumbs = createNavigationElement(
    dom,
    pageContext.breadcrumbs,
    {
      currentId: pageContext.currentNode?.id ?? null,
      label: 'Breadcrumb',
      instanceRoot,
    },
  );

  if (pageContext.breadcrumbs.length > 0) {
    page.append(breadcrumbs);
  }

  const localNavigation = createNavigationElement(
    dom,
    pageContext.localNavigation,
    {
      currentId: pageContext.currentNode?.id ?? null,
      label: 'Local',
      instanceRoot,
    },
  );

  if (pageContext.localNavigation.length > 0) {
    page.append(localNavigation);
  }

  main.append(page);
  root.append(header, main);

  const composition = Object.freeze({
    root,
    header,
    main,
    page,
    titleNode,
    globalNavigation,
    localNavigation,
    breadcrumbs,
    pageContext,
  });

  COMPOSITION_STATE.set(composition, {
    slots: new Set(),
    destroyed: false,
  });

  return composition;
}

function requireComposition(composition) {
  const state = COMPOSITION_STATE.get(composition);
  if (!state) {
    throw new TypeError('expected a WebEngine composition');
  }
  if (state.destroyed) {
    throw new Error('WebEngine composition has been destroyed');
  }
  return state;
}

function assertResolvedProjector(projector) {
  if (
    projector == null ||
    typeof projector !== 'object' ||
    typeof projector.id !== 'string' ||
    !Object.hasOwn(projector, 'projection')
  ) {
    throw new TypeError('projector slot requires a resolved projector');
  }
}

function createProjectorSlot(
  composition,
  resolvedProjector,
  {
    title = null,
  } = {},
) {
  const state = requireComposition(composition);
  assertResolvedProjector(resolvedProjector);

  if (title != null && (typeof title !== 'string' || title !== title.trim())) {
    throw new TypeError('projector title must be a trimmed string or null');
  }

  const document = composition.root.ownerDocument ?? globalThis.document;
  const section = createElement(document, 'section', 'we-section');

  let header = null;
  if (title) {
    header = createElement(document, 'h2', 'we-projector-header');
    header.textContent = title;
    section.append(header);
  }

  const boundary = createElement(document, 'div', 'we-projector');
  section.append(boundary);
  composition.page.append(section);

  const slot = Object.freeze({
    projectorId: resolvedProjector.id,
    section,
    header,
    boundary,
  });

  state.slots.add(slot);
  return slot;
}

async function mountProjectorSlot(
  slot,
  resolvedProjector,
  context = Object.freeze({}),
  options = {},
) {
  if (
    slot == null ||
    typeof slot !== 'object' ||
    typeof slot.projectorId !== 'string' ||
    slot.boundary == null
  ) {
    throw new TypeError('mountProjectorSlot requires a projector slot');
  }

  assertResolvedProjector(resolvedProjector);

  if (slot.projectorId !== resolvedProjector.id) {
    throw new Error(
      `projector slot id mismatch: ${slot.projectorId} != ${resolvedProjector.id}`,
    );
  }

  return mountResolvedProjector(
    slot.boundary,
    resolvedProjector,
    context,
    options,
  );
}

async function composeProjector(
  composition,
  resolvedProjector,
  context = Object.freeze({}),
  {
    title = null,
    ...rendererOptions
  } = {},
) {
  const slot = createProjectorSlot(
    composition,
    resolvedProjector,
    { title },
  );

  try {
    const result = await mountProjectorSlot(
      slot,
      resolvedProjector,
      context,
      rendererOptions,
    );

    return Object.freeze({
      slot,
      result,
    });
  } catch (error) {
    return Object.freeze({
      slot,
      error,
    });
  }
}

async function destroyWebEngineComposition(
  composition,
  {
    onError = null,
  } = {},
) {
  const state = requireComposition(composition);
  const results = [];

  for (const slot of state.slots) {
    results.push(
      await destroyRendererBoundary(slot.boundary, { onError }),
    );
  }

  state.slots.clear();
  state.destroyed = true;

  if (typeof composition.root.replaceChildren === 'function') {
    composition.root.replaceChildren();
  }

  return Object.freeze(results);
}

export {
  WEB_SYMBOL,
  validateWebPageProjection,
  freezeWebPageProjection,
  loadWebPage,
  composeWebPage,
  createPageContext,
  createNavigationElement,
  createWebEngineShell,
  createProjectorSlot,
  mountProjectorSlot,
  composeProjector,
  destroyWebEngineComposition,
};
