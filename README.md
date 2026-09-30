# WebEngine

Shared web application runtime for AIGM.fi.

WebEngine composes public presentation surfaces from declarative projector contracts. It owns shared application behavior such as projector resolution, composition, mount lifecycle, shell/navigation context, IAM identity context and AccessCore authorization integration.

WebEngine does **not** own domain logic, domain data, visual styling, DOM primitives or spatial primitives.

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

## Content contract

Content is domain-owned text:

```text
(domain, id) -> text
```

Canonical fields:

```text
id
domain
text
```

## Identity and authorization

IAM answers **who** the subject is.

AccessCore answers only:

```text
(subject, action, resource, context) -> allow | deny
```

WebEngine may request an authorization decision but never owns authorization policy.

See `Contracts/` for canonical boundaries.
