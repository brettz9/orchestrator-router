# CHANGES for orchestrator-router

## 4.0.0

- feat!: `Router.prototype.trigger` now awaits whichever route handler (or
  `fallback`) matched before resolving, instead of merely starting it and
  returning immediately. A plain synchronous handler behaves exactly as
  before; an `async` one is now actually waited on, so a caller that
  awaits `trigger()` itself can rely on the handler having fully finished
  (including its own thrown/rejected errors surfacing there, rather than
  becoming a silent unhandled rejection). `Orchestrator`'s own scene
  `callback` option is likewise now awaited internally.
- **BREAKING**: `trigger()` returns `Promise<Router>` instead of `Router`.
  Existing callers that don't use the return value (the overwhelming
  majority — including every internal call site: the click listener's
  popstate dispatch, the popstate listener, and the readyState-triggered
  initial call, all deliberately left un-awaited, matching their existing
  fire-and-forget nature) are unaffected. The only real break is a caller
  chaining another call synchronously off `trigger()`'s return value (e.g.
  `router.trigger(a).trigger(b)`) — that now needs `await` between the
  two calls.

## 3.0.0

- feat: accept a `URLPattern` instance for `Router.prototype.route` patterns and
  `Orchestrator` scene keys
- feat!: plain string patterns are now parsed with `URLPattern` by default. Pass
  `{ patterns: 'uritemplate' }` to the `Router` constructor or `Orchestrator`
  config (or a third argument to `Router.prototype.route`) to keep RFC 6570 URI
  Template parsing for string patterns.
- **BREAKING**: existing URI Template route strings (e.g. `'/login{?email,}'`)
  no longer match unless `patterns: 'uritemplate'` is set.
- **BREAKING**: require Node >=24.16.0

## 2.0.3

- docs: point to source of fork

## 2.0.2

- fix: incomplete rename of default export class

## 2.0.1

- fix: ensure publishing latest types

## 2.0.0

- initial fork
