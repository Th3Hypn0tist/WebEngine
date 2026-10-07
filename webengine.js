import {
  parseProjectorId,
  resolveProjectorDefinitionUrls,
  resolveDefaultRendererUrl,
} from './core/projector-id.js';

import {
  SITE_TREE_URL,
  parseSiteTree,
  validateSiteTree,
  createSiteTreeIndex,
  resolveSiteNodeById,
  resolveSiteNodeByPath,
  loadSiteTree,
} from './core/site-tree.js';

import {
  projectGlobalNavigation,
  projectLocalNavigation,
  projectBreadcrumbs,
  projectSitemap,
  resolveCurrentSection,
  projectActiveNavigationState,
} from './core/site-tree-projections.js';

const WEBENGINE_VERSION = '0.3.0';

export {
  WEBENGINE_VERSION,
  parseProjectorId,
  resolveProjectorDefinitionUrls,
  resolveDefaultRendererUrl,
  SITE_TREE_URL,
  parseSiteTree,
  validateSiteTree,
  createSiteTreeIndex,
  resolveSiteNodeById,
  resolveSiteNodeByPath,
  loadSiteTree,
  projectGlobalNavigation,
  projectLocalNavigation,
  projectBreadcrumbs,
  projectSitemap,
  resolveCurrentSection,
  projectActiveNavigationState,
};
