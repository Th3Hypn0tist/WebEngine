# WebEngine

Shared web application runtime for AIGM.fi.

WebEngine composes public presentation surfaces from declarative projector contracts. It owns shared application behavior such as projector resolution, composition, renderer lifecycle, Content, SiteTree mechanisms, Navigation projections, Actions, routing/page context, shell behavior, IAM identity context and AccessCore authorization integration.

WebEngine does **not** own domain business logic, visual styling, DOM primitives, spatial primitives, site-specific hierarchy instance data or authorization policy.

## Dependency direction

```text
WebGUI ---->
             WebEngine ----> domain projections
S3D ----------------------->
Style --------------------->
```

- WebGUI owns DOM/UI primitives.
- S3D owns spatial/3D primitives.
- Style owns visual presentation.
- WebEngine owns shared application runtime behavior.
- Domain code owns services, APIs, renderers and projector definitions.



## Relocatable site instance root

WebEngine derives the active site instance root from its own canonical deployment location:

```text
/test/lib/webengine/webengine.js -> /test/
/lib/webengine/webengine.js      -> /
```

Canonical site/domain data remains deployment-neutral:

```text
/site.json
/lmts/
/app/lmts/projectors/ranking.json
/app/lmts/renderers/ranking.js
/app/iam/api/me.php
```

At runtime those logical paths are projected through the active instance root.

Example test deployment:

```text
/test/
├── site.json
├── lib/
│   ├── webengine/
│   ├── webgui/
│   └── s3d/
├── style/
├── app/
│   ├── iam/
│   └── lmts/
├── iam/    # public projection
└── lmts/   # public projection
```

The exact same canonical data under production root becomes:

```text
/
├── site.json
├── lib/
├── style/
├── app/
│   ├── iam/
│   └── lmts/
├── iam/    # public projection
└── lmts/   # public projection
```

No `/test` literal belongs in SiteTree, projector definitions, renderer paths, Content identities or domain code.

The runtime applies the prefix to physical SiteTree/projector/renderer/IAM/asset requests and navigation links. Browser paths are stripped back to logical paths before SiteTree lookup.

Promotion from the test mirror to production therefore changes deployment root only.

## Canonical deployment

```text
/lib/webengine/webengine.js
```

AIGM.fi site hierarchy instance data lives separately:

```text
/site.json
```

`/site.json` is **not** part of the WebEngine library deployment. WebEngine owns the SiteTree contract and runtime mechanisms that parse, validate, index, resolve and project that instance data.

Domain runtime roots use:

```text
/app/<domain>/
├── contracts/
├── services/
├── api/
├── renderers/
└── projectors/
```

Projectors are declarative definitions. Renderers are executable implementations.

## Projector identifiers

```text
LMTS:ranking
-> /app/lmts/projectors/ranking.json

LMTS:ranking:top3
-> /app/lmts/projectors/ranking/top3.json
```

The default renderer for both is derived from the base projector:

```text
/app/lmts/renderers/ranking.js
```

A variant defines only the delta from its parent projection.



## Projector resolver

Projector definitions remain declarative JSON data.

Runtime API:

```js
validateProjectorDefinition(definition)
parseProjectorDefinition(source)
mergeProjectorDelta(parent, delta)
loadProjectorDefinition(url)
createProjectorResolutionContext({ maxDepth })
resolveProjector(id, options)
```

Canonical resolution:

```text
LMTS:ranking
  -> /app/lmts/projectors/ranking.json

LMTS:ranking:top3
  -> /app/lmts/projectors/ranking.json
  -> /app/lmts/projectors/ranking/top3.json
```

Merge semantics are intentionally minimal:

```text
object + object -> recursive merge
array           -> replace
scalar          -> replace
null            -> replace
```

There are no deletion operators, expressions, conditions or executable projector directives. Projector JSON remains data rather than becoming a programming language.

Top-level `id`, `domain` and `entry` are rejected because they are derivable from the canonical projector ID.

Resolved projections are deep-frozen. Missing/invalid definitions fail closed and partial merge results are never returned.

Nested resolution must reuse the active resolution context. The context rejects canonical projector cycles and enforces a bounded recursion depth.

## Canonical concerns

```text
Content
= typed page/site content resources

SiteTree
= the canonical public site hierarchy mechanism over /site.json

Navigation
= derived SiteTree projections such as global/local navigation and breadcrumbs

Actions
= user-triggered action identity, labels and action bindings
```

These concerns are intentionally separate.

The public site hierarchy exists canonically once in `/site.json`. Navigation, breadcrumbs, sitemap, current section and active navigation state are derived projections of SiteTree; they are not separately maintained hierarchy authorities.

Navigation labels come from SiteTree. Action/button labels are owned by Actions. Neither belongs in Content.

API and service routing are separate machine-interface concerns and are not derived from the public SiteTree hierarchy.

## SiteTree contract

Canonical instance:

```text
/site.json
```

Current node shape:

```text
id
label
path
children
```

WebEngine owns:

```text
SiteTree contract
parser
validator
indexer
resolver
derived projection mechanisms
```

The AIGM.fi instance owns the actual `/site.json` data.



## SiteTree runtime API

WebEngine exposes a small deterministic SiteTree runtime:

```js
loadSiteTree()
parseSiteTree(source)
validateSiteTree(root)
createSiteTreeIndex(root)
resolveSiteNodeById(siteTree, id)
resolveSiteNodeByPath(siteTree, path)
```

Default loader target:

```text
/site.json
```

The runtime does not normalize or repair hierarchy identity. IDs and public paths resolve exactly as declared. Invalid JSON, invalid node shape, duplicate IDs, duplicate paths, cycles and fetch failures reject instead of creating fallback hierarchy.

`createSiteTreeIndex()` creates an isolated frozen snapshot so later mutation of the source object cannot mutate the runtime hierarchy.

This step implements SiteTree loading, parsing, validation, indexing and exact resolution only. Navigation, breadcrumbs and other SiteTree projections remain a separate layer.



## SiteTree projections

SiteTree projection helpers derive presentation data from the canonical runtime snapshot without exposing canonical nodes as mutable presentation state:

```js
projectGlobalNavigation(siteTree)
projectLocalNavigation(siteTree, currentPath)
projectBreadcrumbs(siteTree, currentPath)
projectSitemap(siteTree)
resolveCurrentSection(siteTree, currentPath)
projectActiveNavigationState(siteTree, currentPath)
```

Semantics:

```text
global navigation = root children
local navigation  = exact current node children
breadcrumbs       = root -> current lineage
sitemap           = recursive detached SiteTree projection
current section   = first node below the SiteTree root
active state      = current node id + ordered ancestor ids
```

All projections are detached immutable values. They may be duplicated anywhere without becoming hierarchy authority.

Current-path resolution is exact. Projection logic does not lowercase paths, append or remove slashes, prefix-match, or infer hierarchy from URL strings. Unknown paths produce the projection type's empty/null inactive result.

## Presentation contract

WebEngine owns the semantic meaning of the shared application/composition namespace:

```text
.we-*
```

Current public classes:

```text
.we-shell
.we-header
.we-main
.we-nav
.we-nav-item
.we-page
.we-section
.we-projector
.we-projector-header
.we-projector-body
.we-content
```

These names describe structural/application semantics, not visual appearance.

State is represented with semantic carriers where a dedicated structural class is unnecessary:

```text
data-state
data-status
data-variant
aria-current
native disabled state
```

The owning subsystem defines the value vocabulary for a state carrier. The presentation contract does not invent renderer lifecycle states, business statuses or domain variants.

WebEngine owns the semantics. Style owns their visual implementation. WebGUI keeps its separate `.wg-*` primitive namespace.

Presentation state is never authorization authority.



## Renderer lifecycle

Canonical renderer entry:

```text
mount(target, projection, context)
```

A renderer mount may be synchronous or asynchronous. A successful mount may return a mount-instance result:

```text
{
  state: "ready" | "empty",   // optional, default = ready
  destroy: () => void | Promise<void>   // optional
}
```

Cleanup belongs to the individual mount instance returned by one `mount()` call. The same renderer module may be mounted concurrently in multiple projector boundaries, so a module-global cleanup function is not the canonical lifecycle model.

WebEngine owns the projector-boundary lifecycle:

```text
loading
ready
empty
denied
error
destroy
```

The state is published on:

```text
.we-projector[data-state]
```

`denied` is produced by WebEngine authorization orchestration and never by the renderer. `error` is produced by orchestration when resolution/loading/mount fails. A successful renderer may report only `ready` or `empty`.

Each mount attempt has its own generation identity. Late async completion from an obsolete generation must never overwrite DOM or lifecycle state belonging to a newer generation. If an obsolete mount later resolves with a cleanup handle, WebEngine destroys that stale instance instead of publishing it.

`destroy` is terminal for one mount generation. A reused projector boundary may later start a new generation from `loading`.



## Renderer runtime

Renderer modules are resolved from the canonical projector ID:

```text
LMTS:ranking
-> /app/lmts/renderers/ranking.js
```

An explicit override is allowed only inside the same domain renderer root.

Runtime API:

```js
validateRendererModuleUrl(url, projectorId)
resolveRendererModuleUrl(projectorId, { override })
loadRendererModule(url, options)
normalizeMountResult(value)
mountResolvedProjector(boundary, resolvedProjector, context, options)
denyRendererBoundary(boundary, options)
destroyRendererBoundary(boundary, options)
```

Each mount uses a boundary-local monotonic generation id and an isolated staging target. Renderer DOM is committed into the live `.we-projector` boundary only if the generation is still current after async mount completion.

This prevents stale async mounts from overwriting a newer projection.

Renderer cleanup is mount-instance scoped. A returned `destroy()` handle is invoked at most once for the generation that created it.

Lifecycle state is published only through:

```text
.we-projector[data-state]
```

with:

```text
loading
ready
empty
denied
error
destroy
```

`ready` and `empty` may come from successful renderer mount results. `denied`, `error` and `destroy` remain WebEngine orchestration states.

## Content contract

Canonical fields:

```text
id
domain
type
provider
content
```

Canonical content types:

```text
text
image
svg
video
embed
file
```

`type` defines presentation semantics. `provider` defines the resolver namespace/source.

Examples:

```text
type=image, provider=brand, content=logo.webp
type=svg, provider=brand, content=architecture.svg
type=embed, provider=youtube, content=<provider resource id>
type=text, provider=inline, content=<text>
```

Projectors consume canonical content references; they do not own physical asset paths or provider-specific resolution logic.



## Content runtime

Canonical Content records remain:

```text
id
domain
type
provider
content
```

The runtime exposes:

```js
validateContentRecord(record)
freezeContentRecord(record)
createContentProviderRegistry()
createInlineTextProvider()
createAssetProvider(baseUrl)
createEmbedProvider(resolveResource)
resolveContent(record, registry, context)
```

Providers resolve source values only. They do not redefine Content type semantics.

Resolved descriptors are typed by WebEngine:

```text
text   -> { id, domain, type, text }
image  -> { id, domain, type, url }
svg    -> { id, domain, type, url }
video  -> { id, domain, type, url }
file   -> { id, domain, type, url }
embed  -> { id, domain, type, provider, resource, url, title? }
```

Canonical asset/embed resource identifiers are provider-relative. Parent/current-directory traversal, absolute canonical resource URLs and backslash paths are rejected.

Provider-returned URLs exposed by WebEngine must be root-relative or use HTTP(S). Executable/opaque schemes such as `javascript:`, `data:`, `file:` and `blob:` are rejected.

Embeds remain structured descriptors. Providers cannot return authoritative HTML or iframe payloads.

This runtime step does not choose a Content persistence backend and does not implement projector loading.



## Shell, page composition and Actions

WebEngine composes a shared shell directly from canonical SiteTree projections:

```js
createPageContext(siteTree, currentPath)
createWebEngineShell({ document, siteTree, currentPath, title })
createProjectorSlot(composition, resolvedProjector, options)
mountProjectorSlot(slot, resolvedProjector, context, options)
composeProjector(composition, resolvedProjector, context, options)
destroyWebEngineComposition(composition, options)
```

The page context contains detached derived values only:

```text
currentPath
currentNode
currentSection
globalNavigation
localNavigation
breadcrumbs
activeNavigation
```

The shell emits the existing public WebEngine presentation semantics:

```text
.we-shell
.we-header
.we-main
.we-page
.we-nav
.we-nav-item
.we-section
.we-projector-header
.we-projector
```

Navigation DOM is not a separate public authority. Shell navigation is built from SiteTree-derived Navigation projections, and unaddressable structural nodes never receive invented links.

Projector slots bind one resolved projector identity to one renderer boundary. Renderer lifecycle remains owned by the renderer subsystem, and one projector failure is isolated to that slot.

Actions remain separate from Navigation and Content:

```js
parseActionRef(action)
validateActionRecord(record)
freezeActionRecord(record)
createActionRegistry()
executeAction(record, executor, options)
bindActionControl(control, record, executor, options)
```

Canonical Action record:

```text
id
label
action = DOMAIN:ACTION
```

WebEngine owns action identity, label and binding of user intent to an external action reference. The supplied executor owns the actual domain behavior. UI visibility, labels, listeners or disabled state never grant authorization.

IAM identity and AccessCore authorization adapters are intentionally not implemented by this composition step.



## IAM identity context

IAM remains the identity/authentication/session authority. WebEngine only adapts the current IAM session into immutable runtime context:

```js
loadIAMIdentityContext({ domain })
normalizeIAMIdentityPayload(payload, { domain })
createAnonymousIAMIdentityContext(domain)
```

Canonical browser endpoint:

```text
GET /iam/api/me.php?domain=<domain>
```

Browser session transport uses IAM's Secure/HttpOnly same-origin cookie. Raw IAM bearer/session tokens are not copied into WebEngine context.

Authenticated context:

```text
authority      = IAM
authenticated  = true
domain
contract       = iam.light
version        = 1.x
authLevel      = light
subject        = { id, username, status, verified }
managementTier = 3 | 2 | 1 | 1337
```

`managementTier` is IAM user-management metadata only. It is never converted into application permissions, roles, or AccessCore allow/deny decisions.

HTTP 401 from IAM means anonymous identity. Other IAM/domain failures remain adapter errors rather than being silently reinterpreted as authorization results.

Application authorization remains a separate AccessCore concern.



## AccessCore preflight

WebEngine integrates with AccessCore through a dependency-injected decision adapter:

```js
createAccessCoreAdapter({ check })
createAccessCoreRequest({ identity, action, resource, context })
checkAccess(adapter, request)
preflightProjectorAccess(boundary, resolvedProjector, access, adapter, options)
```

Canonical decision remains:

```text
(subject, action, resource, context)
        ↓
     AccessCore
        ↓
   allow | deny
```

WebEngine does not invent an AccessCore HTTP endpoint or implement authorization policy.

Action and resource semantics are always supplied explicitly by the owning domain. They are not derived from projector IDs, DOM state or IAM management tiers.

IAM identity is projected into the AccessCore subject without `managementTier`:

```text
authenticated:
  authority=IAM
  authenticated=true
  id
  username
  verified

anonymous:
  authority=IAM
  authenticated=false
```

Anonymous identity is still submitted to AccessCore. WebEngine does not auto-deny anonymous users.

Projector preflight mapping:

```text
allow
  -> renderer mount
  -> ready | empty

deny
  -> no renderer load/mount
  -> denied

adapter/policy dependency failure
  -> no renderer mount
  -> error
  -> failure propagated
```

A denied/hidden projector remains presentation gating only. The domain service that executes a protected operation must enforce authorization again at the actual action/resource boundary.

## Identity and authorization

IAM answers **who** the subject is.

AccessCore answers only:

```text
(subject, action, resource, context) -> allow | deny
```

WebEngine may request an authorization decision but never owns authorization policy.

UI visibility or projector gating is never the authoritative backend security boundary.

See `Contracts/` for canonical boundaries.
