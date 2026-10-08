import {
  mountResolvedProjector,
  denyRendererBoundary,
  errorRendererBoundary,
} from './renderer.js';

const ACCESS_DECISIONS = Object.freeze(['allow', 'deny']);
const ACCESS_DECISION_SET = new Set(ACCESS_DECISIONS);

function assertPlainObject(value, message) {
  if (
    value == null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new TypeError(message);
  }
}

function projectIAMAccessSubject(identity) {
  assertPlainObject(
    identity,
    'AccessCore preflight requires an IAM identity context',
  );

  if (identity.authority !== 'IAM') {
    throw new Error('AccessCore preflight identity authority must be IAM');
  }
  if (typeof identity.authenticated !== 'boolean') {
    throw new Error('IAM identity context requires authenticated boolean');
  }

  if (!identity.authenticated) {
    if (identity.subject != null) {
      throw new Error('anonymous IAM identity must not contain a subject');
    }

    return Object.freeze({
      authority: 'IAM',
      authenticated: false,
    });
  }

  assertPlainObject(
    identity.subject,
    'authenticated IAM identity requires subject',
  );

  const {
    id,
    username,
    status,
    verified,
  } = identity.subject;

  if (typeof id !== 'string' || !id) {
    throw new Error('IAM access subject requires id');
  }
  if (
    typeof username !== 'string' ||
    !username.trim() ||
    username !== username.trim()
  ) {
    throw new Error('IAM access subject requires username');
  }
  if (status !== 'active') {
    throw new Error('IAM access subject requires active status');
  }
  if (typeof verified !== 'boolean') {
    throw new Error('IAM access subject verified must be boolean');
  }

  return Object.freeze({
    authority: 'IAM',
    authenticated: true,
    id,
    username,
    verified,
  });
}

function normalizeAccessCoreDecisionRequest(request) {
  assertPlainObject(
    request,
    'AccessCore decision request must be an object',
  );

  const {
    subject,
    action,
    resource,
    context = {},
  } = request;

  if (subject == null || subject === '') {
    throw new Error('AccessCore decision request requires subject');
  }
  if (
    typeof action !== 'string' ||
    !action.trim() ||
    action !== action.trim()
  ) {
    throw new Error(
      'AccessCore decision request requires a non-empty trimmed action',
    );
  }
  if (resource == null || resource === '') {
    throw new Error('AccessCore decision request requires resource');
  }

  assertPlainObject(
    context,
    'AccessCore decision request context must be an object',
  );

  return Object.freeze({
    subject,
    action,
    resource,
    context: Object.freeze({ ...context }),
  });
}

function createAccessCoreRequest({
  identity,
  action,
  resource,
  context = {},
} = {}) {
  return normalizeAccessCoreDecisionRequest({
    subject: projectIAMAccessSubject(identity),
    action,
    resource,
    context,
  });
}

function normalizeAccessCoreDecision(decision) {
  if (
    typeof decision !== 'string' ||
    !ACCESS_DECISION_SET.has(decision)
  ) {
    throw new Error(
      'AccessCore decision must be exactly allow or deny',
    );
  }

  return decision;
}

function createAccessCoreAdapter({
  check,
} = {}) {
  if (typeof check !== 'function') {
    throw new TypeError(
      'AccessCore adapter requires async-compatible check(request)',
    );
  }

  return Object.freeze({
    async check(request) {
      const canonical = normalizeAccessCoreDecisionRequest(request);
      const decision = await check(canonical);
      return normalizeAccessCoreDecision(decision);
    },
  });
}

async function checkAccess(adapter, request) {
  if (
    adapter == null ||
    typeof adapter !== 'object' ||
    typeof adapter.check !== 'function'
  ) {
    throw new TypeError(
      'checkAccess requires an AccessCore adapter',
    );
  }

  return adapter.check(
    normalizeAccessCoreDecisionRequest(request),
  );
}

async function preflightProjectorAccess(
  boundary,
  resolvedProjector,
  {
    identity,
    action,
    resource,
    context = {},
  } = {},
  adapter,
  {
    rendererContext = {},
    rendererOptions = {},
    onError = null,
  } = {},
) {
  const request = createAccessCoreRequest({
    identity,
    action,
    resource,
    context,
  });

  let decision;
  try {
    decision = await checkAccess(adapter, request);
  } catch (error) {
    await errorRendererBoundary(boundary, {
      projectorId: resolvedProjector?.id ?? null,
      onError,
    });
    throw error;
  }

  if (decision === 'deny') {
    const denied = await denyRendererBoundary(boundary, {
      projectorId: resolvedProjector?.id ?? null,
      onError,
    });

    return Object.freeze({
      decision,
      state: denied.state,
      renderer: null,
    });
  }

  const accessContext = Object.freeze({
    decision: 'allow',
    action,
    resource,
  });

  const renderer = await mountResolvedProjector(
    boundary,
    resolvedProjector,
    Object.freeze({
      ...(rendererContext ?? {}),
      identity,
      access: accessContext,
    }),
    {
      ...(rendererOptions ?? {}),
      onError: rendererOptions?.onError ?? onError,
    },
  );

  return Object.freeze({
    decision,
    state: renderer.state,
    renderer,
  });
}

export {
  ACCESS_DECISIONS,
  projectIAMAccessSubject,
  normalizeAccessCoreDecisionRequest,
  createAccessCoreRequest,
  normalizeAccessCoreDecision,
  createAccessCoreAdapter,
  checkAccess,
  preflightProjectorAccess,
};
