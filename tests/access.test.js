import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACCESS_DECISIONS,
  createAnonymousIAMIdentityContext,
  normalizeIAMIdentityPayload,
  projectIAMAccessSubject,
  normalizeAccessCoreDecisionRequest,
  createAccessCoreRequest,
  normalizeAccessCoreDecision,
  createAccessCoreAdapter,
  checkAccess,
  preflightProjectorAccess,
} from '../webengine.js';

function createElement(tagName = 'div', documentRef = null) {
  const classes = new Set();

  return {
    tagName,
    dataset: {},
    children: [],
    textContent: '',
    ownerDocument: documentRef,
    classList: {
      add(value) { classes.add(value); },
      contains(value) { return classes.has(value); },
    },
    replaceChildren(...children) {
      this.children = children;
    },
  };
}

function createBoundary() {
  const documentRef = {
    createElement(tagName) {
      return createElement(tagName, documentRef);
    },
  };

  return createElement('section', documentRef);
}

function identity(tier = 1337) {
  return normalizeIAMIdentityPayload({
    ok: true,
    contract: 'iam.light',
    version: '1.1',
    auth_level: 'light',
    user: {
      id: 'usr_1',
      username: 'TheHypnotist',
      status: 'active',
      verified: true,
    },
    claims: { tier },
  }, {
    domain: 'lmts',
  });
}

function resolved() {
  return Object.freeze({
    id: 'LMTS:ranking',
    projection: Object.freeze({
      title: 'Ranking',
    }),
  });
}

test('defines only canonical AccessCore decisions', () => {
  assert.deepEqual(ACCESS_DECISIONS, ['allow', 'deny']);
  assert.ok(Object.isFrozen(ACCESS_DECISIONS));

  assert.equal(normalizeAccessCoreDecision('allow'), 'allow');
  assert.equal(normalizeAccessCoreDecision('deny'), 'deny');
  assert.throws(() => normalizeAccessCoreDecision('ALLOW'));
  assert.throws(() => normalizeAccessCoreDecision(true));
});

test('projects authenticated IAM identity without management-tier authority leakage', () => {
  const subject = projectIAMAccessSubject(identity(1337));

  assert.deepEqual(subject, {
    authority: 'IAM',
    authenticated: true,
    id: 'usr_1',
    username: 'TheHypnotist',
    verified: true,
  });

  assert.equal('managementTier' in subject, false);
  assert.equal('tier' in subject, false);
  assert.equal('permissions' in subject, false);
});

test('projects anonymous IAM auth state without auto-denying it', () => {
  const anonymous = createAnonymousIAMIdentityContext('lmts');

  assert.deepEqual(
    projectIAMAccessSubject(anonymous),
    {
      authority: 'IAM',
      authenticated: false,
    },
  );
});

test('normalizes canonical AccessCore request shape without policy inference', () => {
  const subject = Object.freeze({
    authority: 'IAM',
    authenticated: true,
    id: 'usr_1',
    username: 'TheHypnotist',
    verified: true,
  });

  const request = normalizeAccessCoreDecisionRequest({
    subject,
    action: 'lmts.ranking.read',
    resource: 'lmts.ranking:global',
    context: {
      page: '/lmts/ranking/',
    },
  });

  assert.equal(request.subject, subject);
  assert.equal(request.action, 'lmts.ranking.read');
  assert.equal(request.resource, 'lmts.ranking:global');
  assert.deepEqual(request.context, {
    page: '/lmts/ranking/',
  });
  assert.ok(Object.isFrozen(request));
  assert.ok(Object.isFrozen(request.context));

  assert.throws(
    () => normalizeAccessCoreDecisionRequest({
      subject,
      action: '  ',
      resource: 'x',
    }),
    /requires a non-empty trimmed action/,
  );
});

test('builds AccessCore request from explicit domain-owned action and resource semantics', () => {
  const request = createAccessCoreRequest({
    identity: identity(),
    action: 'lmts.ranking.read',
    resource: 'lmts.ranking:global',
    context: {
      page: '/lmts/ranking/',
    },
  });

  assert.equal(request.action, 'lmts.ranking.read');
  assert.equal(request.resource, 'lmts.ranking:global');
  assert.equal(request.context.page, '/lmts/ranking/');
  assert.ok(Object.isFrozen(request));
  assert.ok(Object.isFrozen(request.context));
  assert.equal('projectorId' in request, false);
});

test('AccessCore adapter accepts async decision function and rejects non-canonical output', async () => {
  const request = createAccessCoreRequest({
    identity: identity(),
    action: 'lmts.ranking.read',
    resource: 'lmts.ranking:global',
  });

  const adapter = createAccessCoreAdapter({
    check: async canonical => {
      assert.equal(canonical.action, 'lmts.ranking.read');
      return 'allow';
    },
  });

  assert.equal(await checkAccess(adapter, request), 'allow');

  const invalid = createAccessCoreAdapter({
    check: async () => ({ decision: 'allow' }),
  });

  await assert.rejects(
    checkAccess(invalid, request),
    /exactly allow or deny/,
  );
});

test('anonymous subject is still decided by AccessCore instead of WebEngine policy', async () => {
  let received;

  const adapter = createAccessCoreAdapter({
    check: async request => {
      received = request.subject;
      return 'allow';
    },
  });

  const decision = await checkAccess(
    adapter,
    createAccessCoreRequest({
      identity: createAnonymousIAMIdentityContext('lmts'),
      action: 'site.public.read',
      resource: 'site.page:home',
    }),
  );

  assert.equal(decision, 'allow');
  assert.deepEqual(received, {
    authority: 'IAM',
    authenticated: false,
  });
});

test('allow preflight mounts renderer and supplies identity/access presentation context', async () => {
  const boundary = createBoundary();
  let rendererContext;

  const adapter = createAccessCoreAdapter({
    check: async request => {
      assert.equal(request.action, 'lmts.ranking.read');
      assert.equal(request.resource, 'lmts.ranking:global');
      return 'allow';
    },
  });

  const result = await preflightProjectorAccess(
    boundary,
    resolved(),
    {
      identity: identity(),
      action: 'lmts.ranking.read',
      resource: 'lmts.ranking:global',
    },
    adapter,
    {
      rendererContext: {
        page: '/lmts/ranking/',
      },
      rendererOptions: {
        importModule: async () => ({
          mount(target, projection, context) {
            target.textContent = projection.title;
            rendererContext = context;
          },
        }),
      },
    },
  );

  assert.equal(result.decision, 'allow');
  assert.equal(result.state, 'ready');
  assert.equal(boundary.dataset.state, 'ready');
  assert.equal(boundary.children[0].textContent, 'Ranking');
  assert.equal(rendererContext.page, '/lmts/ranking/');
  assert.equal(rendererContext.identity.subject.id, 'usr_1');
  assert.deepEqual(rendererContext.access, {
    decision: 'allow',
    action: 'lmts.ranking.read',
    resource: 'lmts.ranking:global',
  });
});

test('deny preflight publishes denied and never loads renderer module', async () => {
  const boundary = createBoundary();
  let rendererLoaded = false;

  const adapter = createAccessCoreAdapter({
    check: async () => 'deny',
  });

  const result = await preflightProjectorAccess(
    boundary,
    resolved(),
    {
      identity: identity(),
      action: 'lmts.ranking.read',
      resource: 'lmts.ranking:restricted',
    },
    adapter,
    {
      rendererOptions: {
        importModule: async () => {
          rendererLoaded = true;
          return { mount() {} };
        },
      },
    },
  );

  assert.equal(result.decision, 'deny');
  assert.equal(result.state, 'denied');
  assert.equal(result.renderer, null);
  assert.equal(boundary.dataset.state, 'denied');
  assert.equal(rendererLoaded, false);
  assert.deepEqual(boundary.children, []);
});

test('AccessCore adapter failure publishes error rather than inventing deny', async () => {
  const boundary = createBoundary();

  const adapter = createAccessCoreAdapter({
    check: async () => {
      throw new Error('policy service unavailable');
    },
  });

  await assert.rejects(
    preflightProjectorAccess(
      boundary,
      resolved(),
      {
        identity: identity(),
        action: 'lmts.ranking.read',
        resource: 'lmts.ranking:global',
      },
      adapter,
    ),
    /policy service unavailable/,
  );

  assert.equal(boundary.dataset.state, 'error');
  assert.deepEqual(boundary.children, []);
});

test('domain action/resource semantics are not inferred from projector identity', async () => {
  const boundary = createBoundary();
  let request;

  const adapter = createAccessCoreAdapter({
    check: async value => {
      request = value;
      return 'deny';
    },
  });

  await preflightProjectorAccess(
    boundary,
    resolved(),
    {
      identity: identity(),
      action: 'custom.read',
      resource: 'custom.resource:42',
    },
    adapter,
  );

  assert.equal(request.action, 'custom.read');
  assert.equal(request.resource, 'custom.resource:42');
  assert.notEqual(request.action, 'LMTS:ranking');
  assert.notEqual(request.resource, 'LMTS:ranking');
});
