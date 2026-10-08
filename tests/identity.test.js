import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IAM_IDENTITY_ENDPOINT,
  normalizeIAMIdentityPayload,
  createAnonymousIAMIdentityContext,
  loadIAMIdentityContext,
} from '../webengine.js';

function iamPayload(overrides = {}) {
  return {
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
    claims: {
      tier: 2,
    },
    ...overrides,
  };
}

function response(payload, {
  ok = true,
  status = 200,
} = {}) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

test('normalizes canonical IAM identity into frozen WebEngine context', () => {
  const identity = normalizeIAMIdentityPayload(
    iamPayload(),
    { domain: 'lmts' },
  );

  assert.deepEqual(identity, {
    authority: 'IAM',
    authenticated: true,
    domain: 'lmts',
    contract: 'iam.light',
    version: '1.1',
    authLevel: 'light',
    subject: {
      id: 'usr_1',
      username: 'TheHypnotist',
      status: 'active',
      verified: true,
    },
    managementTier: 2,
  });

  assert.ok(Object.isFrozen(identity));
  assert.ok(Object.isFrozen(identity.subject));
});

test('managementTier remains an IAM management claim and is not converted to permissions', () => {
  for (const tier of [3, 2, 1, 1337]) {
    const identity = normalizeIAMIdentityPayload(
      iamPayload({ claims: { tier } }),
      { domain: 'lmts' },
    );

    assert.equal(identity.managementTier, tier);
    assert.equal('permissions' in identity, false);
    assert.equal('allow' in identity, false);
    assert.equal('roles' in identity, false);
  }
});

test('rejects malformed or unsupported IAM identity payloads', () => {
  assert.throws(
    () => normalizeIAMIdentityPayload(
      iamPayload({ contract: 'other' }),
      { domain: 'lmts' },
    ),
    /unsupported IAM identity contract/,
  );

  assert.throws(
    () => normalizeIAMIdentityPayload(
      iamPayload({ version: '2.0' }),
      { domain: 'lmts' },
    ),
    /unsupported IAM identity contract major version/,
  );

  assert.throws(
    () => normalizeIAMIdentityPayload(
      iamPayload({ auth_level: 'full' }),
      { domain: 'lmts' },
    ),
    /unsupported IAM auth level/,
  );

  assert.throws(
    () => normalizeIAMIdentityPayload(
      iamPayload({ claims: { tier: 4 } }),
      { domain: 'lmts' },
    ),
    /management tier is invalid/,
  );
});

test('requires canonical lowercase IAM domain context', () => {
  for (const domain of ['', 'LMTS', 'lmts/path', ' lmts ']) {
    assert.throws(
      () => createAnonymousIAMIdentityContext(domain),
      /canonical lowercase domain id/,
    );
  }
});

test('represents HTTP 401 as anonymous identity instead of an application denial', async () => {
  const identity = await loadIAMIdentityContext({
    domain: 'lmts',
    fetch: async () => response(
      { ok: false, error: 'authentication required' },
      { ok: false, status: 401 },
    ),
  });

  assert.deepEqual(
    identity,
    createAnonymousIAMIdentityContext('lmts'),
  );
});

test('loads current identity from canonical IAM me endpoint using same-origin session transport', async () => {
  const calls = [];

  const identity = await loadIAMIdentityContext({
    domain: 'lmts',
    fetch: async (url, options) => {
      calls.push([url, options]);
      return response(iamPayload());
    },
  });

  assert.equal(
    calls[0][0],
    `${IAM_IDENTITY_ENDPOINT}?domain=lmts`,
  );
  assert.equal(calls[0][1].method, 'GET');
  assert.equal(calls[0][1].credentials, 'same-origin');
  assert.equal(calls[0][1].cache, 'no-store');
  assert.equal(calls[0][1].headers.Accept, 'application/json');
  assert.equal(identity.subject.username, 'TheHypnotist');
});

test('does not expose or accept IAM bearer/session tokens in identity context', async () => {
  const identity = await loadIAMIdentityContext({
    domain: 'lmts',
    fetch: async () => response({
      ...iamPayload(),
      token: 'opaque-secret',
      expires_at: '2099-01-01T00:00:00Z',
    }),
  });

  assert.equal('token' in identity, false);
  assert.equal('expires_at' in identity, false);
  assert.equal('session' in identity, false);
});

test('treats domain-membership and server failures as identity adapter errors', async () => {
  for (const status of [400, 403, 500]) {
    await assert.rejects(
      loadIAMIdentityContext({
        domain: 'lmts',
        fetch: async () => response(
          { ok: false },
          { ok: false, status },
        ),
      }),
      new RegExp(`HTTP ${status}`),
    );
  }
});

test('rejects malformed successful IAM responses instead of inventing identity', async () => {
  await assert.rejects(
    loadIAMIdentityContext({
      domain: 'lmts',
      fetch: async () => response({
        ok: true,
        contract: 'iam.light',
      }),
    }),
    /invalid IAM identity response|IAM identity/,
  );
});
