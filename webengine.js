import {
  WEBENGINE_DEPLOY_MARKER,
  INSTANCE_ROOT_PATH,
  normalizeInstanceRoot,
  deriveInstanceRootPath,
  resolveInstancePath,
  stripInstanceRoot,
} from './core/instance-root.js';

import {
  parseProjectorId,
  projectorIdToDwhSymbol,
} from './core/projector-id.js';

import {
  SITE_TREE_SYMBOL,
  parseSiteTree,
  validateSiteTree,
  createSiteTreeIndex,
  resolveSiteNodeById,
  resolveSiteNodeByPath,
  loadSiteTree,
} from './core/site-tree.js';

import {
  DWH_SYMBOL_PATTERN,
  assertDwhSymbol,
  normalizeDwhProjectionEnvelope,
  createDwhAdapter,
  projectDwhSymbol,
} from './core/dwh.js';

import {
  projectGlobalNavigation,
  projectLocalNavigation,
  projectBreadcrumbs,
  projectSitemap,
  resolveCurrentSection,
  projectActiveNavigationState,
} from './core/site-tree-projections.js';

import {
  CONTENT_TYPES,
  validateContentRecord,
  freezeContentRecord,
  assertProviderRelativeResource,
  assertResolvedUrl,
  createContentProviderRegistry,
  createInlineTextProvider,
  createAssetProvider,
  createEmbedProvider,
  resolveContent,
} from './core/content.js';

import {
  validateDeclarativeValue,
  validateProjectorProjection,
  deepFreezeDeclarative,
  createProjectorResolutionContext,
  resolveProjector,
} from './core/projector-resolver.js';

import {
  validateRendererModuleUrl,
  resolveRendererModuleUrl,
  loadRendererModule,
  normalizeMountResult,
  mountResolvedProjector,
  denyRendererBoundary,
  errorRendererBoundary,
  destroyRendererBoundary,
} from './core/renderer.js';

import {
  parseActionRef,
  validateActionRecord,
  freezeActionRecord,
  createActionRegistry,
  executeAction,
  bindActionControl,
} from './core/actions.js';

import {
  createPageContext,
  createWebEngineShell,
  createProjectorSlot,
  mountProjectorSlot,
  composeProjector,
  destroyWebEngineComposition,
} from './core/composition.js';

import {
  IAM_IDENTITY_ENDPOINT,
  normalizeIAMIdentityPayload,
  createAnonymousIAMIdentityContext,
  loadIAMIdentityContext,
} from './core/identity.js';

import {
  ACCESS_DECISIONS,
  projectIAMAccessSubject,
  normalizeAccessCoreDecisionRequest,
  createAccessCoreRequest,
  normalizeAccessCoreDecision,
  createAccessCoreAdapter,
  checkAccess,
  preflightProjectorAccess,
} from './core/access.js';

const WEBENGINE_VERSION = '0.12.0';

export {
  WEBENGINE_VERSION,
  parseProjectorId,
  projectorIdToDwhSymbol,
  SITE_TREE_SYMBOL,
  parseSiteTree,
  validateSiteTree,
  createSiteTreeIndex,
  resolveSiteNodeById,
  resolveSiteNodeByPath,
  loadSiteTree,
  DWH_SYMBOL_PATTERN,
  assertDwhSymbol,
  normalizeDwhProjectionEnvelope,
  createDwhAdapter,
  projectDwhSymbol,
  projectGlobalNavigation,
  projectLocalNavigation,
  projectBreadcrumbs,
  projectSitemap,
  resolveCurrentSection,
  projectActiveNavigationState,
  CONTENT_TYPES,
  validateContentRecord,
  freezeContentRecord,
  assertProviderRelativeResource,
  assertResolvedUrl,
  createContentProviderRegistry,
  createInlineTextProvider,
  createAssetProvider,
  createEmbedProvider,
  resolveContent,
  validateDeclarativeValue,
  validateProjectorProjection,
  deepFreezeDeclarative,
  createProjectorResolutionContext,
  resolveProjector,
  validateRendererModuleUrl,
  resolveRendererModuleUrl,
  loadRendererModule,
  normalizeMountResult,
  mountResolvedProjector,
  denyRendererBoundary,
  destroyRendererBoundary,
  parseActionRef,
  validateActionRecord,
  freezeActionRecord,
  createActionRegistry,
  executeAction,
  bindActionControl,
  createPageContext,
  createWebEngineShell,
  createProjectorSlot,
  mountProjectorSlot,
  composeProjector,
  destroyWebEngineComposition,
  IAM_IDENTITY_ENDPOINT,
  normalizeIAMIdentityPayload,
  createAnonymousIAMIdentityContext,
  loadIAMIdentityContext,
  ACCESS_DECISIONS,
  projectIAMAccessSubject,
  normalizeAccessCoreDecisionRequest,
  createAccessCoreRequest,
  normalizeAccessCoreDecision,
  createAccessCoreAdapter,
  checkAccess,
  preflightProjectorAccess,
};
