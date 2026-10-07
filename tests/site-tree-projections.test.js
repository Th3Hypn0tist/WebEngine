import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSiteTreeIndex,
  resolveSiteNodeByPath,
  projectGlobalNavigation,
  projectLocalNavigation,
  projectBreadcrumbs,
  projectSitemap,
  resolveCurrentSection,
  projectActiveNavigationState,
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
      children: [
        {
          id: 'benchmark',
          label: 'Benchmark',
          path: '/lmts/benchmark/',
        },
        {
          id: 'systems',
          label: 'Systems',
          path: '/lmts/systems/',
        },
      ],
    },
  ],
});

test('projects global navigation from root children in canonical order', () => {
  const siteTree = createSiteTreeIndex(example());

  assert.deepEqual(
    projectGlobalNavigation(siteTree),
    [
      { id: 'aigmos', label: 'AIGMos', path: '/aigmos/' },
      { id: 'iam', label: 'IAM', path: '/iam/' },
      { id: 'lmts', label: 'LMTS', path: '/lmts/' },
    ],
  );
});

test('projects local navigation from the exact current node', () => {
  const siteTree = createSiteTreeIndex(example());

  assert.deepEqual(
    projectLocalNavigation(siteTree, '/lmts/'),
    [
      { id: 'benchmark', label: 'Benchmark', path: '/lmts/benchmark/' },
      { id: 'systems', label: 'Systems', path: '/lmts/systems/' },
    ],
  );

  assert.deepEqual(projectLocalNavigation(siteTree, '/lmts/benchmark/'), []);
  assert.deepEqual(projectLocalNavigation(siteTree, '/missing/'), []);
});

test('projects breadcrumbs as the root-to-current authority chain', () => {
  const siteTree = createSiteTreeIndex(example());

  assert.deepEqual(
    projectBreadcrumbs(siteTree, '/aigmos/expose/'),
    [
      { id: 'aigm', label: 'AIGM' },
      { id: 'aigmos', label: 'AIGMos', path: '/aigmos/' },
      { id: 'expose', label: 'Expose', path: '/aigmos/expose/' },
    ],
  );

  assert.deepEqual(projectBreadcrumbs(siteTree, '/missing/'), []);
});

test('projects a recursive immutable sitemap without returning canonical nodes', () => {
  const siteTree = createSiteTreeIndex(example());
  const sitemap = projectSitemap(siteTree);
  const canonical = resolveSiteNodeByPath(siteTree, '/lmts/');

  assert.equal(sitemap.id, 'aigm');
  assert.equal(sitemap.children[2].id, 'lmts');
  assert.equal(sitemap.children[2].children[1].id, 'systems');
  assert.notEqual(sitemap.children[2], canonical);
  assert.ok(Object.isFrozen(sitemap));
  assert.ok(Object.isFrozen(sitemap.children));
  assert.ok(Object.isFrozen(sitemap.children[2]));
});

test('resolves current section as the first node below the SiteTree root', () => {
  const siteTree = createSiteTreeIndex(example());

  assert.deepEqual(
    resolveCurrentSection(siteTree, '/aigmos/expose/'),
    { id: 'aigmos', label: 'AIGMos', path: '/aigmos/' },
  );
  assert.deepEqual(
    resolveCurrentSection(siteTree, '/iam/'),
    { id: 'iam', label: 'IAM', path: '/iam/' },
  );
  assert.equal(resolveCurrentSection(siteTree, '/missing/'), null);
});

test('projects active state without mutating navigation authority', () => {
  const siteTree = createSiteTreeIndex(example());

  assert.deepEqual(
    projectActiveNavigationState(siteTree, '/aigmos/expose/'),
    {
      currentId: 'expose',
      ancestorIds: ['aigm', 'aigmos'],
    },
  );

  assert.deepEqual(
    projectActiveNavigationState(siteTree, '/missing/'),
    {
      currentId: null,
      ancestorIds: [],
    },
  );
});

test('projection records are frozen detached values', () => {
  const siteTree = createSiteTreeIndex(example());
  const global = projectGlobalNavigation(siteTree);
  const canonical = resolveSiteNodeByPath(siteTree, '/aigmos/');

  assert.notEqual(global[0], canonical);
  assert.ok(Object.isFrozen(global));
  assert.ok(Object.isFrozen(global[0]));
  assert.throws(() => {
    global[0].label = 'MUTATED';
  }, TypeError);
});

test('projection path context remains exact and is never normalized', () => {
  const siteTree = createSiteTreeIndex(example());

  assert.deepEqual(projectBreadcrumbs(siteTree, '/lmts'), []);
  assert.equal(resolveCurrentSection(siteTree, '/LMTS/'), null);
  assert.deepEqual(
    projectActiveNavigationState(siteTree, '/lmts'),
    { currentId: null, ancestorIds: [] },
  );
});
