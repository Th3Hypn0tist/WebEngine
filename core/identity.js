const IAM_IDENTITY_ENDPOINT = '/iam/api/me.php';
const IAM_IDENTITY_CONTRACT = 'iam.light';
const IAM_IDENTITY_MAJOR_VERSION = '1';
const IAM_AUTH_LEVEL = 'light';
const IAM_MANAGEMENT_TIERS = new Set([3, 2, 1, 1337]);
const IAM_DOMAIN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function assertPlainObject(value, message) {
  if (
    value == null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new TypeError(message);
  }
}

function assertIAMDomain(domain) {
  if (typeof domain !== 'string' || !IAM_DOMAIN.test(domain)) {
    throw new Error(
      'IAM domain must be a canonical lowercase domain id',
    );
  }
  return domain;
}

function validateIAMIdentityEndpoint(endpoint) {
  if (
    typeof endpoint !== 'string' ||
    !endpoint ||
    endpoint !== endpoint.trim() ||
    !endpoint.startsWith('/') ||
    endpoint.startsWith('//') ||
    endpoint.includes('?') ||
    endpoint.includes('#') ||
    endpoint.includes('\\')
  ) {
    throw new Error(
      'IAM identity endpoint must be a root-relative path without query or fragment',
    );
  }

  return endpoint;
}

function assertIAMContractVersion(version) {
  if (typeof version !== 'string' || !version) {
    throw new Error('IAM identity version must be a non-empty string');
  }

  const [major] = version.split('.');
  if (major !== IAM_IDENTITY_MAJOR_VERSION) {
    throw new Error(
      `unsupported IAM identity contract major version: ${version}`,
    );
  }

  return version;
}

function normalizeIAMIdentityPayload(payload, {
  domain,
} = {}) {
  assertIAMDomain(domain);
  assertPlainObject(payload, 'IAM identity payload must be an object');

  if (payload.ok !== true) {
    throw new Error('IAM identity payload must have ok=true');
  }
  if (payload.contract !== IAM_IDENTITY_CONTRACT) {
    throw new Error(
      `unsupported IAM identity contract: ${String(payload.contract)}`,
    );
  }

  const version = assertIAMContractVersion(payload.version);

  if (payload.auth_level !== IAM_AUTH_LEVEL) {
    throw new Error(
      `unsupported IAM auth level: ${String(payload.auth_level)}`,
    );
  }

  assertPlainObject(payload.user, 'IAM identity payload requires user');
  assertPlainObject(payload.claims, 'IAM identity payload requires claims');

  const { id, username, status, verified } = payload.user;
  const tier = payload.claims.tier;

  if (typeof id !== 'string' || !id) {
    throw new Error('IAM user id must be a non-empty string');
  }
  if (
    typeof username !== 'string' ||
    !username.trim() ||
    username !== username.trim()
  ) {
    throw new Error('IAM username must be a non-empty trimmed string');
  }
  if (status !== 'active') {
    throw new Error('IAM identity context requires an active user');
  }
  if (typeof verified !== 'boolean') {
    throw new Error('IAM user verified must be a boolean');
  }
  if (!Number.isInteger(tier) || !IAM_MANAGEMENT_TIERS.has(tier)) {
    throw new Error('IAM management tier is invalid');
  }

  const subject = Object.freeze({
    id,
    username,
    status,
    verified,
  });

  return Object.freeze({
    authority: 'IAM',
    authenticated: true,
    domain,
    contract: IAM_IDENTITY_CONTRACT,
    version,
    authLevel: IAM_AUTH_LEVEL,
    subject,
    managementTier: tier,
  });
}

function createAnonymousIAMIdentityContext(domain) {
  assertIAMDomain(domain);

  return Object.freeze({
    authority: 'IAM',
    authenticated: false,
    domain,
    contract: null,
    version: null,
    authLevel: null,
    subject: null,
    managementTier: null,
  });
}

async function responseJson(response) {
  if (response && typeof response.json === 'function') {
    return response.json();
  }

  if (response && typeof response.text === 'function') {
    const source = await response.text();
    return JSON.parse(source);
  }

  throw new TypeError(
    'IAM identity fetch must return a Response-like object',
  );
}

async function loadIAMIdentityContext({
  domain,
  endpoint = IAM_IDENTITY_ENDPOINT,
  fetch: fetchImpl = globalThis.fetch,
} = {}) {
  assertIAMDomain(domain);
  validateIAMIdentityEndpoint(endpoint);

  if (typeof fetchImpl !== 'function') {
    throw new TypeError('IAM identity adapter requires a fetch implementation');
  }

  const url = `${endpoint}?domain=${encodeURIComponent(domain)}`;

  const response = await fetchImpl(url, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response || typeof response !== 'object') {
    throw new TypeError(
      'IAM identity fetch must return a Response-like object',
    );
  }

  if (response.status === 401) {
    return createAnonymousIAMIdentityContext(domain);
  }

  if (response.ok !== true) {
    const status = Number.isInteger(response.status)
      ? ` HTTP ${response.status}`
      : '';
    throw new Error(
      `IAM identity request failed:${status}`.replace(/:$/, ''),
    );
  }

  let payload;
  try {
    payload = await responseJson(response);
  } catch (error) {
    throw new Error(
      `invalid IAM identity response: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  return normalizeIAMIdentityPayload(payload, { domain });
}

export {
  IAM_IDENTITY_ENDPOINT,
  normalizeIAMIdentityPayload,
  createAnonymousIAMIdentityContext,
  loadIAMIdentityContext,
};
