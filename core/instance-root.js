const WEBENGINE_DEPLOY_MARKER = '/lib/webengine/';

function validateLogicalRootPath(path, label = 'logical path') {
  if (
    typeof path !== 'string' ||
    !path ||
    path !== path.trim() ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('?') ||
    path.includes('#') ||
    path.includes('\\')
  ) {
    throw new Error(
      `${label} must be a root-relative path without query, fragment or backslash`,
    );
  }

  const segments = path.split('/');
  if (segments.some(segment => segment === '.' || segment === '..')) {
    throw new Error(`${label} must not contain path traversal`);
  }

  return path;
}

function normalizeInstanceRoot(instanceRoot) {
  validateLogicalRootPath(instanceRoot, 'instance root');

  if (instanceRoot === '/') {
    return '/';
  }

  return instanceRoot.endsWith('/')
    ? instanceRoot
    : `${instanceRoot}/`;
}

function deriveInstanceRootPath(moduleUrl = import.meta.url) {
  let parsed;
  try {
    parsed = new URL(moduleUrl);
  } catch {
    throw new TypeError('WebEngine module URL must be a valid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return '/';
  }

  const markerIndex = parsed.pathname.indexOf(WEBENGINE_DEPLOY_MARKER);
  if (markerIndex < 0) {
    throw new Error(
      `WebEngine module must be deployed under ${WEBENGINE_DEPLOY_MARKER}`,
    );
  }

  const root = parsed.pathname.slice(0, markerIndex) || '/';
  return normalizeInstanceRoot(root);
}

const INSTANCE_ROOT_PATH = deriveInstanceRootPath();

function resolveInstancePath(
  logicalPath,
  {
    instanceRoot = INSTANCE_ROOT_PATH,
  } = {},
) {
  validateLogicalRootPath(logicalPath);
  const root = normalizeInstanceRoot(instanceRoot);

  if (logicalPath === '/') {
    return root;
  }

  return root === '/'
    ? logicalPath
    : `${root}${logicalPath.slice(1)}`;
}

function stripInstanceRoot(
  publicPath,
  {
    instanceRoot = INSTANCE_ROOT_PATH,
  } = {},
) {
  validateLogicalRootPath(publicPath, 'public path');
  const root = normalizeInstanceRoot(instanceRoot);

  if (root === '/') {
    return publicPath;
  }

  const rootWithoutSlash = root.slice(0, -1);

  if (publicPath === rootWithoutSlash || publicPath === root) {
    return '/';
  }

  if (!publicPath.startsWith(root)) {
    return null;
  }

  const suffix = publicPath.slice(root.length);
  return suffix ? `/${suffix}` : '/';
}

export {
  WEBENGINE_DEPLOY_MARKER,
  INSTANCE_ROOT_PATH,
  validateLogicalRootPath,
  normalizeInstanceRoot,
  deriveInstanceRootPath,
  resolveInstancePath,
  stripInstanceRoot,
};
