import { resolveSiteNodeByPath } from './site-tree.js';

function freezeArray(values) {
  return Object.freeze(values);
}

function projectNode(node) {
  const projected = {
    id: node.id,
    label: node.label,
  };

  if (node.path != null) {
    projected.path = node.path;
  }

  return Object.freeze(projected);
}

function projectNodeTree(node) {
  const projected = {
    id: node.id,
    label: node.label,
    children: freezeArray(node.children.map(projectNodeTree)),
  };

  if (node.path != null) {
    projected.path = node.path;
  }

  return Object.freeze(projected);
}

function findLineage(node, targetId, lineage = []) {
  const next = [...lineage, node];

  if (node.id === targetId) {
    return next;
  }

  for (const child of node.children) {
    const found = findLineage(child, targetId, next);
    if (found) {
      return found;
    }
  }

  return null;
}

function resolveLineageByPath(siteTree, path) {
  const current = resolveSiteNodeByPath(siteTree, path);

  if (!current) {
    return null;
  }

  const lineage = findLineage(siteTree.root, current.id);

  if (!lineage) {
    throw new Error('SiteTree index is inconsistent with its canonical root');
  }

  return lineage;
}

function projectGlobalNavigation(siteTree) {
  return freezeArray(siteTree.root.children.map(projectNode));
}

function projectLocalNavigation(siteTree, currentPath) {
  const current = resolveSiteNodeByPath(siteTree, currentPath);

  if (!current) {
    return freezeArray([]);
  }

  return freezeArray(current.children.map(projectNode));
}

function projectBreadcrumbs(siteTree, currentPath) {
  const lineage = resolveLineageByPath(siteTree, currentPath);

  if (!lineage) {
    return freezeArray([]);
  }

  return freezeArray(lineage.map(projectNode));
}

function projectSitemap(siteTree) {
  return projectNodeTree(siteTree.root);
}

function resolveCurrentSection(siteTree, currentPath) {
  const lineage = resolveLineageByPath(siteTree, currentPath);

  if (!lineage || lineage.length < 2) {
    return null;
  }

  return projectNode(lineage[1]);
}

function projectActiveNavigationState(siteTree, currentPath) {
  const lineage = resolveLineageByPath(siteTree, currentPath);

  if (!lineage) {
    return Object.freeze({
      currentId: null,
      ancestorIds: freezeArray([]),
    });
  }

  return Object.freeze({
    currentId: lineage.at(-1).id,
    ancestorIds: freezeArray(lineage.slice(0, -1).map(node => node.id)),
  });
}

export {
  projectGlobalNavigation,
  projectLocalNavigation,
  projectBreadcrumbs,
  projectSitemap,
  resolveCurrentSection,
  projectActiveNavigationState,
};
