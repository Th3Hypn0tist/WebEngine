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

## Identity and authorization

IAM answers **who** the subject is.

AccessCore answers only:

```text
(subject, action, resource, context) -> allow | deny
```

WebEngine may request an authorization decision but never owns authorization policy.

UI visibility or projector gating is never the authoritative backend security boundary.

See `Contracts/` for canonical boundaries.
