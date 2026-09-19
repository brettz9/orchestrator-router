/* eslint-disable unicorn/no-unnecessary-global-this -- Easier to polyfill */
/* globals PopStateEvent, document, Node, location -- Browser or polyfill */

import UriTemplate from './uri-template.js';

/**
 * @typedef {import('./uri-template.js').Params} Params
 */

/**
 * @typedef {(params: Params) => void} Handler
 */

/**
 * @typedef {(path: string) => Params | undefined} Predicate
 */

/**
 * How a route pattern given as a plain string is interpreted: parsed by
 * `URLPattern` (the default) or as an RFC 6570 URI Template. A `URLPattern`
 * instance is always used as-is regardless of this setting.
 * @typedef {'urlpattern'|'uritemplate'} PatternSyntax
 */

/** @type {PatternSyntax} */
const defaultPatternSyntax = 'urlpattern';

// Base used to resolve the (path-only) strings passed to `trigger`, and any
// relative pattern strings, into the absolute URLs that `URLPattern` expects.
// The origin is irrelevant since routes are matched on `pathname`, `search`,
// and `hash` only.
const urlPatternBase = 'http://localhost/';

// URL components that can carry named/indexed groups worth exposing as params.
const urlPatternComponents = /** @type {const} */ (
  ['pathname', 'search', 'hash']
);

/**
 * Brand check for a `URLPattern` instance. Prefers the `Symbol.toStringTag`
 * value that Web IDL puts on the interface prototype (rather than `instanceof`,
 * which breaks across realms such as an `iframe` and throws where the
 * `URLPattern` global is absent), then falls back to duck-typing the members
 * this module uses because Node — through at least v26 — omits that tag.
 * @param {unknown} value
 * @returns {value is URLPattern}
 */
function isUrlPattern (value) {
  if (Object.prototype.toString.call(value) === '[object URLPattern]') {
    return true;
  }
  // We can drop the following upon https://github.com/nodejs/node/issues/65924
  const candidate = /** @type {Partial<URLPattern>} */ (value);
  return typeof candidate === 'object' && candidate !== null &&
    typeof candidate.exec === 'function' &&
    typeof candidate.test === 'function' &&
    typeof candidate.pathname === 'string';
}

/**
 * Wraps a `URLPattern` so it behaves like `UriTemplate.prototype.fromUri`,
 * returning a flat map of matched group values or `undefined` when the path
 * does not match.
 * @param {URLPattern} pattern
 * @returns {Predicate}
 */
function fromUrlPattern (pattern) {
  return (path) => {
    const match = pattern.exec(path, urlPatternBase);
    // Covered by the unmatched URLPattern route test.
    /* istanbul ignore next -- See comment above */
    if (match === null) {
      return undefined;
    }

    /** @type {Params} */
    const params = {};
    for (const component of urlPatternComponents) {
      // An unconstrained component matches as a bare `*` wildcard and only
      // contributes a synthetic unnamed group; skip it so parts of the URL the
      // caller did not describe do not leak into the params.
      if (pattern[component] === '*') {
        continue;
      }

      // eslint-disable-next-line @stylistic/max-len -- Long
      // eslint-disable-next-line unicorn/no-unreadable-for-of-expression -- Readable
      for (const [key, value] of Object.entries(match[component].groups)) {
        if (value !== undefined) {
          params[key] = value;
        }
      }
    }
    return params;
  };
}

/**
 * Turns a route pattern into the predicate used to match paths against it.
 * @param {string|URLPattern} pattern
 * @param {PatternSyntax} syntax How a string `pattern` is interpreted.
 * @returns {Predicate}
 */
function toPredicate (pattern, syntax) {
  if (isUrlPattern(pattern)) {
    return fromUrlPattern(pattern);
  }
  return syntax === 'uritemplate'
    ? new UriTemplate(pattern).fromUri
    : fromUrlPattern(new URLPattern(pattern, urlPatternBase));
}

/**
 *
 */
export default class Router {
  /**
   * @param {Map<string|URLPattern, Handler>} routes
   * @param {(path: string) => void} fallback
   * @param {{patterns?: PatternSyntax}} [options] `patterns` chooses how a
   *   route pattern given as a plain string is interpreted; it defaults to
   *   `'urlpattern'`. A `URLPattern` instance is always honoured directly.
   */
  constructor (
    routes = new Map(),
    fallback = () => {
      //
    },
    {patterns = defaultPatternSyntax} = {}
  ) {
    this.routes = new Map();
    this.fallback = fallback;
    /** @type {PatternSyntax} */
    this.patterns = patterns;
    /** @type {string|undefined} */
    this.path = undefined;

    for (const [pattern, handler] of routes) {
      this.route(pattern, handler);
    }

    /**
     * @param {Event} event
     */
    const clickListener = (event) => {
      const elementNode = Node.ELEMENT_NODE;
      for (const target of /** @type {(HTMLAnchorElement)[]} */ (
        event.composedPath()
      )) {
        if (target.nodeType === elementNode && target.localName === 'a') {
          // Covered by the external-anchor click test.
          /* istanbul ignore next -- See comment above */
          if (target.origin === globalThis.origin) {
            event.preventDefault();
            globalThis.history.pushState(null, '', target.href);
            globalThis.dispatchEvent(new PopStateEvent('popstate'));
            break;
          }
        }
      }
    };

    /**
     * @returns {void}
     */
    const popstateListener = (/* event */) => {
      this.trigger(location);
    };

    document.addEventListener('click', clickListener);
    globalThis.addEventListener('popstate', popstateListener);

    // Cancelled by `close()` below — otherwise this fires regardless of
    //   whether the instance has since been closed. A closed instance's
    //   `trigger()` running anyway is not just a wasted call: since
    //   `trigger()` now awaits its matched handler (this version), a
    //   `close()`-then-forgotten instance's deferred initial trigger can
    //   fire well after the code that created and closed it has moved on
    //   (e.g. in a test suite, during a *later* test or its setup/teardown)
    //   and act on now-stale DOM state.
    /** @type {ReturnType<typeof globalThis.setTimeout>|undefined} */
    let initialTriggerTimeout;

    this.close = () => {
      document.removeEventListener('click', clickListener);
      globalThis.removeEventListener('popstate', popstateListener);
      // `clearTimeout(undefined)` is a harmless no-op (per spec) when the
      //   `if` below never ran, so no guard is needed here.
      globalThis.clearTimeout(initialTriggerTimeout);
    };

    // Cypress runs specs after the document leaves the loading state.
    /* istanbul ignore else -- Browser lifecycle state */
    if (document.readyState === 'interactive' ||
        document.readyState === 'complete'
    ) {
      initialTriggerTimeout = globalThis.setTimeout(
        () => this.trigger(location), 0
      );
    }
  }

  /**
   * Registers a route. The `pattern` may be a `URLPattern` instance, a string
   * parsed by `URLPattern`, or (when `syntax` is `'uritemplate'`) an RFC 6570
   * URI Template string. It is reduced to a predicate mapping a path to its
   * matched parameters, or `undefined` when it does not match.
   * @param {string|URLPattern} pattern
   * @param {Handler} handler
   * @param {PatternSyntax} [syntax] Overrides the instance's `patterns` setting
   *   for this one route.
   * @returns {Router}
   */
  route (pattern, handler, syntax = this.patterns) {
    this.routes.set(toPredicate(pattern, syntax), handler);
    return this;
  }

  /**
   * Resolves `url` against the registered routes and awaits whichever
   * handler (or `fallback`) matched — a plain synchronous handler resolves
   * immediately, same as before; an `async` one is now actually waited on
   * rather than merely started and forgotten. See CHANGES.md (this
   * version) for what this changes for callers that don't await `trigger`
   * themselves (the overwhelmingly common case, including this library's
   * own internal `popstateListener`/readyState-triggered calls, deliberately
   * left un-awaited below): none of their existing behavior changes — a
   * handler that threw already became a silent unhandled rejection before
   * this change, and still does if nobody awaits this call now either.
   * @param {string|Location} url
   * @returns {Promise<Router>}
   */
  async trigger (url = '') {
    const path = typeof url === 'string'
      ? url
      : url.pathname + url.search + url.hash;

    if (path === this.path) {
      return this;
    }
    this.path = path;

    for (const [predicate, handler] of this.routes) {
      const params = predicate(path);
      if (params !== undefined) {
        // Not sequential: the loop always returns right after this, so at
        //   most one iteration ever awaits anything.
        // eslint-disable-next-line no-await-in-loop -- See above
        await handler(params);
        return this;
      }
    }

    await this.fallback(path);
    return this;
  }
}
