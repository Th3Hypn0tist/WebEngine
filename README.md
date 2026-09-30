# WebEngine

Shared web application runtime for AIGM.fi.

WebEngine composes public presentation surfaces from declarative projector contracts. It owns shared application behavior such as projector resolution, composition, renderer lifecycle, Content, Navigation, Actions, routing/page context, shell behavior, IAM identity context and AccessCore authorization integration.

WebEngine does **not** own domain business logic, visual styling, DOM primitives or spatial primitives.

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
- WebEngine owns shared application runtime behavior and the canonical Content, Navigation and Actions subsystems.
- Domain code owns services, APIs, renderers and projector definitions.

## Canonical deployment

```text
/lib/webengine/webengine.js
```

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
= page/site content resources

Navigation
= navigation identity, labels, targets and hierarchy

Actions
= user-triggered action identity, labels and action bindings
```

These concerns are intentionally separate. Navigation labels and action/button labels are not Content.

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

See `Contracts/` for canonical boundaries.
