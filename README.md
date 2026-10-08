# WebEngine

Shared browser execution runtime for AIGM.fi.

WebEngine does not own the canonical website structure. DWH owns that declarative authority. WebEngine consumes DWH projections and executes them in the browser.

## Canonical responsibility split

```text
IAM        = who
AccessCore = authority / may
DWH        = where / what relates to what
WebEngine  = execute the declared web structure
WebGUI     = generic UI primitives
S3D        = spatial / 3D primitives
```

These responsibilities are intentionally non-overlapping.

## Core role

WebEngine is the runtime/interpreter between canonical declarations and presentation primitives.

```text
                 IAM
                  │ identity
                  ▼
DWH ─────────► WebEngine ◄──────── AccessCore
declarations      │                 authority
                  │ runtime execution
             ┌────┴────┐
             ▼         ▼
          WebGUI       S3D
```

WebEngine owns execution semantics, not declarative authority.

## What DWH owns

DWH is the canonical authority for declarative website structure, including:

```text
site hierarchy
content identity and content relations
projector definitions and bindings
renderer bindings
route declarations
composition graph
action declarations
ordering
semantic symbols and deterministic projections
```

WebEngine consumes these declarations through semantic DWH projections. It must not duplicate them as a second canonical model.

## What WebEngine owns

WebEngine owns browser runtime behavior:

```text
DWH projection consumption and validation
runtime page/context construction
projector execution orchestration
renderer loading and lifecycle
runtime Content provider execution
runtime SiteTree indexing and exact lookup
runtime Navigation derivation
runtime Action binding
composition instance execution
shared shell runtime
DOM / WebGUI / S3D orchestration
IAM identity adapter
AccessCore decision adapter
physical instance-root projection
.we-* runtime/presentation semantics
```

The distinction is deliberate:

```text
DWH       = declare
WebEngine = execute
```

## DWH consumer boundary

WebEngine addresses DWH by semantic symbol, never by database schema.

```text
WebEngine
    ↓ project(symbol, context)
DWH projection interface
    ↓
canonical DWH entities + relations
```

WebEngine must not know:

```text
DWH SQL tables
PHP class layout
physical DWH storage backend
relation-table implementation
internal joins
```

The generic browser-side consumer boundary is:

```js
createDwhAdapter({ project })
createHttpDwhAdapter({ endpoint })
projectDwhSymbol(adapter, symbol, context)
```

For the current PHP DWH profile:

```text
/test/app/dwh/api/project.php   test deployment
/app/dwh/api/project.php        production after cutover
```

Transport does not define symbol semantics; the same adapter carries `#SITE`, `#METAMODULE:CATALOG` and later contracted symbols.

A DWH projection response identifies the symbol it satisfies and carries the projected data. Symbol mismatch or dependency failure is an error; WebEngine does not invent a second canonical source.

## SiteTree

The canonical site hierarchy is owned by DWH and exposed initially as:

```text
#SITE
```

Authority flow:

```text
DWH entities + relations
        ↓
      #SITE
        ↓
generic DWH projection API
        ↓
WebEngine validates projection
        ↓
immutable SiteTree runtime index
        ↓
navigation / breadcrumbs / sitemap / current section / page context
```

`site.json` is not the semantic identity or authority. JSON may exist as transport serialization, cache or diagnostic output, but the runtime identity is `#SITE`.

Current SiteTree node projection:

```text
id
label
path
children
```

WebEngine validates this shape, creates an immutable runtime snapshot and performs exact id/path lookup. It does not infer missing hierarchy or author a competing tree.

## Navigation

Navigation is runtime projection state derived from the validated `#SITE` snapshot.

WebEngine may derive:

```text
global navigation
local navigation
breadcrumbs
sitemap
current section
active state
```

These are runtime views, not canonical hierarchy authorities.

## Content

Canonical Content identity, declarations and relations belong to DWH.

WebEngine owns only runtime Content execution:

```text
validate projected Content record
select registered provider adapter
resolve provider-relative resource
normalize safe presentation descriptor
hand descriptor to renderer/presentation layer
```

Provider resolution does not transfer Content authority to WebEngine.

## Projectors

Canonical projector declarations and their relations belong to DWH.

WebEngine owns projector execution:

```text
receive effective projector projection
validate it
construct runtime context
perform AccessCore preflight when required
load renderer
mount renderer
track lifecycle
isolate failure
destroy stale/obsolete mount instances
```

Projector declarations remain data. Renderer modules remain executable presentation implementations.

## Composition

DWH owns the canonical composition graph: page/section structure, ordering, projector placement, Content placement, renderer bindings and Action placement.

WebEngine executes that graph into a runtime composition instance.

```text
DWH composition projection
        ↓
WebEngine execution
        ↓
page context
slots
renderer boundaries
WebGUI / S3D primitives
```

Runtime composition state is disposable and rebuildable. It never becomes a second canonical page model.

## Actions

Canonical Action identity, label/metadata, domain action reference and placement belong to DWH.

WebEngine owns the runtime binding:

```text
presented control
      ↓
projected Action declaration
      ↓
AccessCore decision when required
      ↓
external domain executor
```

WebEngine does not implement domain business behavior. UI visibility, disabled state or listener presence never grants authority.

## IAM integration

IAM is the identity/authentication authority.

WebEngine consumes identity context only:

```text
IAM -> who is this subject?
```

WebEngine does not store passwords, become a session authority or translate IAM management tiers into application permission.

## AccessCore integration

AccessCore is the authorization authority.

Canonical decision:

```text
(subject, action, resource, context)
        ↓
    AccessCore
        ↓
   allow | deny
```

WebEngine may request and consume this decision. It does not own policy.

A denied projector/action may be gated in presentation, but the service performing a protected operation must enforce authorization again at the actual action/resource boundary.

## WebGUI boundary

WebGUI provides standalone, generic DOM/UI primitives.

WebEngine may compose WebGUI primitives but must not redefine or absorb them.

```text
WebEngine -> WebGUI
WebGUI -/-> WebEngine
```

WebGUI owns `.wg-*` generic UI semantics. WebEngine owns `.we-*` application/runtime composition semantics.

## S3D boundary

S3D provides standalone structural spatial/3D primitives and reusable spatial domain modules.

WebEngine may orchestrate S3D instances when a projection requires spatial presentation, but S3D does not become aware of DWH, IAM, AccessCore or WebEngine application semantics.

```text
WebEngine -> S3D
S3D -/-> WebEngine
```

## Renderer lifecycle

Renderer execution is WebEngine runtime authority.

Canonical projector-boundary lifecycle:

```text
loading
ready
empty
denied
error
destroy
```

Each mount attempt has independent generation identity. Obsolete asynchronous mounts must not overwrite newer state. Cleanup is mount-instance scoped.

Renderer state is runtime state only. It never mutates canonical DWH declarations.

## Relocatable runtime root

Physical runtime code/resources may be deployed under a temporary root without changing canonical DWH identity.

Example:

```text
/test/lib/webengine/webengine.js -> instance root /test/
/lib/webengine/webengine.js      -> instance root /
```

Logical domain/runtime paths remain deployment-neutral. DWH symbols such as `#SITE` do not contain deployment prefixes.

Temporary deployment location is physical runtime data, not application semantics.

## Domain boundary

Domain services own domain business behavior.

```text
DWH        -> declares relationships/bindings
WebEngine  -> executes browser composition
Domain     -> executes business behavior
AccessCore -> decides authority
```

WebEngine must not turn declarative Actions or Projectors into a hidden domain service layer.

## Dependency direction

```text
IAM -----------┐
AccessCore ----┤
DWH -----------┤
               ▼
           WebEngine
           /       \
      WebGUI       S3D
```

Authority flows into WebEngine. Canonical authority does not flow back out of WebEngine.

## Architectural invariants

1. One canonical authority per concern.
2. DWH owns declarative website structure.
3. WebEngine owns execution of that structure in the browser.
4. IAM owns identity/authentication.
5. AccessCore owns authorization decisions.
6. WebGUI owns generic UI primitives.
7. S3D owns generic spatial/3D primitives.
8. Domain services own business execution.
9. Runtime state is never promoted to canonical DWH truth.
10. WebEngine never infers DWH relations from storage layout.
11. Resolvability and visibility never imply authority.
12. Dependency failure does not cause invention of fallback canonical data.
13. Physical deployment paths do not define canonical identity.
14. Presentation semantics and visual styling remain separate concerns.

## Implementation status

This README and the machine-readable contracts define the target WebEngine architecture used for implementation and external evaluation.

The DWH consumer boundary, HTTP adapter, #SITE consumer and #METAMODULE:CATALOG consumer are implemented. Remaining Content/Action/composition migration continues over the same projection boundary.

See `Contracts/` for the machine-readable responsibility and interface boundaries.
