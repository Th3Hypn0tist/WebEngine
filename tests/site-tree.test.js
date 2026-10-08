import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SITE_TREE_SYMBOL,
  createDwhAdapter,
  parseSiteTree,
  validateSiteTree,
  createSiteTreeIndex,
  resolveSiteNodeById,
  resolveSiteNodeByPath,
  loadSiteTree,
} from '../webengine.js';

const example = () => ({
  id: 'aigm',
  label: 'AIGM',
  children: [
    {
      id: 'aigmos',
      label: 'AIGMos',
      path: '/aigmos/',
      children: [
        {
          id: 'expose',
          label: 'Expose',
          path: '/aigmos/expose/',
        },
      ],
    },
    {
      id: 'iam',
      label: 'IAM',
      path: '/iam/',
    },
    {
      id: 'lmts',
      label: 'LMTS',
      path: '/lmts/',
    },
  ],
});

test('parses and validates a SiteTree JSON serialization', () => {
  const parsed = parseSiteTree(JSON.stringify(example()));
  assert.equal(parsed.id, 'aigm');
  assert.equal(parsed.children[0].children[0].id, 'expose');
});

test('rejects malformed JSON and non-string parser input', () => {
  assert.throws(() => parseSiteTree('{'));
  assert.throws(() => parseSiteTree(example()), TypeError);
});

test('rejects fields outside the canonical node shape', () => {
  const root = example();
  root.children[0].owner = 'aigmos';
  assert.throws(() => validateSiteTree(root), /unknown site tree node field/);
});

test('rejects duplicate ids and duplicate public paths', () => {
  const duplicateId = example();
  duplicateId.children.push({ id: 'iam', label: 'Other IAM', path: '/other-iam/' });
  assert.throws(() => validateSiteTree(duplicateId), /duplicate site node id/);

  const duplicatePath = example();
  duplicatePath.children.push({ id: 'other', label: 'Other', path: '/iam/' });
  assert.throws(() => validateSiteTree(duplicatePath), /duplicate site node path/);
});

test('rejects relative, query and fragment paths', () => {
  for (const path of ['iam/', '/iam/?x=1', '/iam/#top']) {
    const root = { id: 'root', label: 'Root', children: [{ id: 'iam', label: 'IAM', path }] };
    assert.throws(() => validateSiteTree(root));
  }
});

test('rejects cycles and reused node objects', () => {
  const reused = { id: 'iam', label: 'IAM', path: '/iam/' };
  const root = { id: 'root', label: 'Root', children: [reused, reused] };
  assert.throws(() => validateSiteTree(root), /cycles or reused node objects/);

  const cyclic = { id: 'root', label: 'Root', children: [] };
  cyclic.children.push(cyclic);
  assert.throws(() => validateSiteTree(cyclic), /cycles or reused node objects/);
});

test('creates an isolated frozen canonical index snapshot', () => {
  const source = example();
  const siteTree = createSiteTreeIndex(source);

  source.label = 'MUTATED';
  source.children[0].label = 'MUTATED';

  assert.equal(siteTree.root.label, 'AIGM');
  assert.equal(resolveSiteNodeById(siteTree, 'aigmos').label, 'AIGMos');
  assert.equal(siteTree.size, 5);
  assert.equal(siteTree.addressableSize, 4);
  assert.ok(Object.isFrozen(siteTree));
  assert.ok(Object.isFrozen(siteTree.root));
  assert.ok(Object.isFrozen(siteTree.root.children));
});

test('resolves ids and paths exactly without implicit normalization', () => {
  const siteTree = createSiteTreeIndex(example());

  assert.equal(resolveSiteNodeById(siteTree, 'iam').label, 'IAM');
  assert.equal(resolveSiteNodeByPath(siteTree, '/iam/').id, 'iam');
  assert.equal(resolveSiteNodeById(siteTree, 'missing'), null);
  assert.equal(resolveSiteNodeByPath(siteTree, '/missing/'), null);
  assert.equal(resolveSiteNodeByPath(siteTree, '/iam'), null);
});

test('loads SiteTree from the DWH #SITE symbol', async () => {
  const calls = [];
  const dwh = createDwhAdapter({
    project: async (symbol, context) => {
      calls.push({ symbol, context });
      return { symbol, data: example(), revision: 'r1' };
    },
  });

  const siteTree = await loadSiteTree({
    dwh,
    context: { domain: 'site' },
  });

  assert.deepEqual(calls, [{ symbol: SITE_TREE_SYMBOL, context: { domain: 'site' } }]);
  assert.equal(resolveSiteNodeByPath(siteTree, '/aigmos/expose/').id, 'expose');
});

test('fails closed when DWH projection cannot be resolved', async () => {
  const dwh = createDwhAdapter({
    project: async () => {
      throw new Error('DWH unavailable');
    },
  });

  await assert.rejects(loadSiteTree({ dwh }), /DWH unavailable/);
});

test('fails closed when #SITE projection shape is invalid', async () => {
  const dwh = createDwhAdapter({
    project: async symbol => ({ symbol, data: { nope: true } }),
  });

  await assert.rejects(loadSiteTree({ dwh }));
});
