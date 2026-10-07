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

## Identity and authorization

IAM answers **who** the subject is.

AccessCore answers only:

```text
(subject, action, resource, context) -> allow | deny
```

WebEngine may request an authorization decision but never owns authorization policy.

UI visibility or projector gating is never the authoritative backend security boundary.

See `Contracts/` for canonical boundaries.
