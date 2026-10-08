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

const COMPOSITION_STATE = new WeakMap();

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

function createPageContext(siteTree, currentPath) {
  if (typeof currentPath !== 'string' || !currentPath) {
    throw new TypeError('page currentPath must be a non-empty string');
  }

  const current = resolveSiteNodeByPath(siteTree, currentPath);

  return Object.freeze({
    currentPath,
    currentNode: detachedNode(current),
    currentSection: resolveCurrentSection(siteTree, currentPath),
    globalNavigation: projectGlobalNavigation(siteTree),
    localNavigation: projectLocalNavigation(siteTree, currentPath),
    breadcrumbs: projectBreadcrumbs(siteTree, currentPath),
    activeNavigation: projectActiveNavigationState(siteTree, currentPath),
  });
}

function createNavigationElement(document, items, {
  currentId = null,
  label,
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
        node.href = item.path;
      } else if (typeof node.setAttribute === 'function') {
        node.setAttribute('href', item.path);
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
} = {}) {
  const dom = assertDocument(document);
  const pageContext = createPageContext(siteTree, currentPath);

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
  createPageContext,
  createNavigationElement,
  createWebEngineShell,
  createProjectorSlot,
  mountProjectorSlot,
  composeProjector,
  destroyWebEngineComposition,
};
