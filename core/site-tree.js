const SITE_TREE_URL = '/site.json';
const NODE_KEYS = new Set(['id', 'label', 'path', 'children']);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const INDEX_DATA = new WeakMap();

function assertObject(value, message) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(message);
  }
}

function assertId(id) {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new Error('site node id must match [A-Za-z0-9][A-Za-z0-9_-]*');
  }
}

function assertLabel(label) {
  if (typeof label !== 'string' || !label.trim() || label !== label.trim()) {
    throw new Error('site node label must be a non-empty trimmed string');
  }
}

function assertPath(path) {
  if (typeof path !== 'string' || !path || path !== path.trim() || !path.startsWith('/')) {
    throw new Error('site node path must be an absolute trimmed public path');
  }
  if (path.includes('?') || path.includes('#')) {
    throw new Error('site node path must not contain query or fragment components');
  }
}

function validateSiteTree(root) {
  const ids = new Set();
  const paths = new Set();
  const seenNodes = new WeakSet();

  function visit(node) {
    assertObject(node, 'site tree node must be an object');

    if (seenNodes.has(node)) {
      throw new Error('site tree must not contain cycles or reused node objects');
    }
    seenNodes.add(node);

    for (const key of Object.keys(node)) {
      if (!NODE_KEYS.has(key)) {
        throw new Error(`unknown site tree node field: ${key}`);
      }
    }

    assertId(node.id);
    assertLabel(node.label);

    if (ids.has(node.id)) {
      throw new Error(`duplicate site node id: ${node.id}`);
    }
    ids.add(node.id);

    if (node.path != null) {
      assertPath(node.path);
      if (paths.has(node.path)) {
        throw new Error(`duplicate site node path: ${node.path}`);
      }
      paths.add(node.path);
    }

    if (node.children != null && !Array.isArray(node.children)) {
      throw new TypeError('site node children must be an array when present');
    }

    for (const child of node.children ?? []) {
      visit(child);
    }
  }

  visit(root);
  return true;
}

function parseSiteTree(source) {
  if (typeof source !== 'string') {
    throw new TypeError('site tree source must be a JSON string');
  }

  const value = JSON.parse(source);
  validateSiteTree(value);
  return value;
}

function cloneNode(node) {
  const clone = {
    id: node.id,
    label: node.label,
    children: Object.freeze((node.children ?? []).map(cloneNode)),
  };

  if (node.path != null) {
    clone.path = node.path;
  }

  return Object.freeze(clone);
}

function createSiteTreeIndex(root) {
  validateSiteTree(root);

  const canonicalRoot = cloneNode(root);
  const byId = new Map();
  const byPath = new Map();

  function index(node) {
    byId.set(node.id, node);
    if (node.path != null) {
      byPath.set(node.path, node);
    }
    for (const child of node.children) {
      index(child);
    }
  }

  index(canonicalRoot);

  const siteTree = Object.freeze({
    root: canonicalRoot,
    size: byId.size,
    addressableSize: byPath.size,
  });

  INDEX_DATA.set(siteTree, { byId, byPath });
  return siteTree;
}

function requireIndex(siteTree) {
  const index = INDEX_DATA.get(siteTree);
  if (!index) {
    throw new TypeError('expected a SiteTree index created by createSiteTreeIndex');
  }
  return index;
}

function resolveSiteNodeById(siteTree, id) {
  assertId(id);
  return requireIndex(siteTree).byId.get(id) ?? null;
}

function resolveSiteNodeByPath(siteTree, path) {
  assertPath(path);
  return requireIndex(siteTree).byPath.get(path) ?? null;
}

async function loadSiteTree({
  url = SITE_TREE_URL,
  fetch: fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof url !== 'string' || !url) {
    throw new TypeError('site tree URL must be a non-empty string');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('SiteTree loader requires a fetch implementation');
  }

  const response = await fetchImpl(url);

  if (!response || typeof response.text !== 'function') {
    throw new TypeError('SiteTree fetch must return a Response-like object');
  }
  if (response.ok === false) {
    const status = Number.isInteger(response.status) ? ` HTTP ${response.status}` : '';
    throw new Error(`failed to load SiteTree from ${url}:${status}`.replace(/:$/, ''));
  }

  const source = await response.text();
  return createSiteTreeIndex(parseSiteTree(source));
}

export {
  SITE_TREE_URL,
  parseSiteTree,
  validateSiteTree,
  createSiteTreeIndex,
  resolveSiteNodeById,
  resolveSiteNodeByPath,
  loadSiteTree,
};
