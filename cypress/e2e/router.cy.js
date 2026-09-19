/* eslint-disable mocha/no-async-in-sync-tests, no-shadow,
  unicorn/no-return-array-push, unicorn/prefer-global-this -- Cypress command
  callbacks are asynchronous despite synchronous Mocha test functions. */
import {Orchestrator, Router} from '../../src/index.js';

/**
 * A real macrotask delay, not just a microtask (`Promise.resolve()`) —
 * needed so the "is this actually awaited" tests below are a reliable
 * regression check. A single-microtask delay happens to resolve before
 * `trigger()`'s own outer promise regardless of whether the handler is
 * genuinely awaited (both are exactly one microtask tick deep, and which
 * one the JS engine happens to run first is a queueing-order coincidence,
 * not a real signal) — a `setTimeout`-based delay can never finish before
 * a same-tick microtask chain, so only a *real* `await` of the handler
 * inside `trigger()` can make the assertion below see the pushed value.
 * @param {number} [ms]
 * @returns {Promise<void>}
 */
// eslint-disable-next-line promise/avoid-new -- No callback-based timer API
const delay = (ms = 10) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

describe('Router', () => {
  it('matches URLPattern routes, exposes named groups, and falls back',
    () => {
      /** @type {unknown[]} */
      const calls = [];
      cy.window().then(async () => {
        const router = new Router(
          new Map([
            [new URLPattern({pathname: '/users/:id', search: '?ref=:ref'}),
              (params) => calls.push(['user', params])]
          ]),
          (path) => calls.push(['fallback', path])
        );
        await router.trigger('/users/42?ref=nav#top');
        await router.trigger('/users/42?ref=nav#top');
        await router.trigger('/missing');
        expect(calls).to.deep.equal([
          ['user', {id: '42', ref: 'nav'}],
          ['fallback', '/missing']
        ]);
        expect(router.route('/books/:isbn', () => undefined)).to.equal(
          router
        );
        router.close();
      });
    });

  it('supports URLPattern instances and URI templates', () => {
    /** @type {unknown[]} */
    const calls = [];
    cy.window().then(async () => {
      const router = new Router(new Map(), (path) => calls.push(path), {
        patterns: 'uritemplate'
      });
      router.route(
        new URLPattern({pathname: '/items/:id'}),
        (params) => calls.push(params)
      );
      router.route('/search{?q}', (params) => calls.push(params));
      await router.trigger('/items/a%20b');
      await router.trigger('/search?q=hello');
      expect(calls).to.deep.equal([{id: 'a%20b'}, {q: 'hello'}]);
      router.close();
    });
  });

  it('navigates to a registered route and can be closed', () => {
    /** @type {unknown[]} */
    const calls = [];
    cy.window().then(async () => {
      const router = new Router(new Map([
        ['/next', () => calls.push('next')]
      ]));
      await router.trigger('/next');
      expect(calls).to.deep.equal(['next']);
      router.close();
    });
  });

  it('awaits an async handler before trigger() itself resolves',
    () => {
      /** @type {unknown[]} */
      const calls = [];
      cy.window().then(async () => {
        const router = new Router(new Map([
          ['/slow', async () => {
            await delay();
            calls.push('slow-done');
          }]
        ]));
        await router.trigger('/slow');
        // If `trigger()` merely started the handler without awaiting it (the
        //   pre-3.1.0 behavior), this would run well before `calls` was
        //   ever populated, since nothing here would have paused for the
        //   handler's own internal delay.
        expect(calls).to.deep.equal(['slow-done']);
        router.close();
      });
    });

  it('awaits an async fallback before trigger() itself resolves', () => {
    /** @type {unknown[]} */
    const calls = [];
    cy.window().then(async () => {
      const router = new Router(new Map(), async (path) => {
        await delay();
        calls.push(['fallback-done', path]);
      });
      await router.trigger('/missing');
      expect(calls).to.deep.equal([['fallback-done', '/missing']]);
      router.close();
    });
  });

  it('handles same-origin anchor clicks and cleanup', () => {
    /** @type {unknown[]} */
    const calls = [];
    cy.window().then(() => {
      const router = new Router(new Map([
        ['/about', () => calls.push('about')]
      ]), () => calls.push('fallback'));

      const anchor = document.createElement('a');
      anchor.href = '/about';
      document.body.append(anchor);
      anchor.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true
      }));

      expect(calls).to.deep.equal(['about']);
      expect(anchor.closest('a')).to.not.be.null;

      const external = document.createElement('a');
      external.href = 'https://example.com/other';
      document.body.append(external);
      external.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true
      }));
      expect(calls).to.deep.equal(['about']);
      router.close();
      document.body.querySelectorAll('a').forEach((el) => el.remove());
    });
  });

  it('covers same-path, wildcard, and non-anchor branches', () => {
    /** @type {unknown[]} */
    const calls = [];
    cy.window().then(async () => {
      /** @type {[string|URLPattern, () => number][]} */
      const routes = [
        ['/same', () => calls.push('same')],
        [new URLPattern({pathname: '/*'}), () => calls.push('wild')]
      ];
      const router = new Router(new Map(routes), () => calls.push('fallback'));

      await router.trigger('/same');
      await router.trigger('/same');
      await router.trigger('/wild/ok');

      const div = document.createElement('div');
      document.body.append(div);
      div.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true
      }));
      expect(calls).to.deep.equal(['same', 'wild']);
      router.close();

      const defaultRouter = new Router();
      defaultRouter.route('/home', () => calls.push('home'));
      await defaultRouter.trigger('/home');
      await defaultRouter.trigger('/home');
      expect(calls).to.deep.equal(['same', 'wild', 'home']);
      defaultRouter.close();
    });
  });

  it('handles non-matches, duck-typed patterns, and default triggers', () => {
    /** @type {unknown[]} */
    const calls = [];
    cy.window().then(async () => {
      // A minimal object exercising the exact `exec`/`test`/`pathname` trio
      //   `isUrlPattern`'s own duck-typing fallback checks for (its own doc
      //   comment: real `URLPattern` support is what Node lacks a brand for,
      //   not what this module actually uses) — not a real `URLPattern`
      //   instance, so it doesn't structurally satisfy every property of
      //   the real DOM interface (`hasRegExpGroups`, `hostname`, etc.) that
      //   this library's own runtime check never looks at. The assertion
      //   below asserts exactly what `isUrlPattern`'s own type predicate
      //   (`value is URLPattern`) already promises callers: anything
      //   passing its duck-type check is treated as a `URLPattern` from
      //   here on.
      const pattern = /** @type {URLPattern} */ ({
        pathname: '/virtual/:id',
        search: '*',
        hash: '*',
        test: () => true,
        exec: (/** @type {string} */ path) => (path === '/virtual/42'
          ? {
            pathname: {groups: {id: '42', missing: undefined}},
            search: {groups: {}},
            hash: {groups: {}}
          }
          : null)
      });
      /** @type {[URLPattern, (params: unknown) => number][]} */
      const routes = [
        [pattern, (params) => calls.push(['virtual', params])],
        [new URLPattern({pathname: '/only'}), () => calls.push(['only'])]
      ];
      const router = new Router(
        new Map(routes), (path) => calls.push(['fallback', path])
      );

      await router.trigger('/virtual/42');
      await router.trigger('/missing');
      await router.trigger();
      expect(calls).to.deep.equal([
        ['virtual', {id: '42'}],
        ['fallback', '/missing'],
        ['fallback', '']
      ]);
      router.close();
    });
  });
});

describe('Orchestrator', () => {
  /**
   * @param {import('../../src/orchestrator.js').Scene[]} scenes
   * @param {import('../../src/router.js').PatternSyntax} [patterns]
   */
  const setup = (scenes, patterns) => cy.window().then((window) => {
    const stage = window.document.createElement('main');
    window.document.body.append(stage);
    const orchestrator = new Orchestrator({stage, scenes, patterns});
    return {stage, orchestrator};
  });

  afterEach(() => {
    cy.window().then((window) => {
      window.document.querySelector('main')?.remove();
    });
  });

  it('renders, updates, replaces, and removes tag-name scenes', () => {
    setup([
      ['/users/:id', 'user-card'],
      ['/settings', 'settings-panel']
    ]).then(async ({stage, orchestrator}) => {
      await orchestrator.trigger('/users/1');
      const firstScene = /** @type {HTMLElement} */ (stage.firstElementChild);
      expect(firstScene.localName).to.equal('user-card');
      expect(firstScene.dataset.id).to.equal('1');
      const scene = firstScene;
      await orchestrator.trigger('/users/2');
      expect(stage.firstElementChild).to.equal(scene);
      expect(scene.dataset.id).to.equal('2');
      await orchestrator.trigger('/settings');
      expect(stage.firstElementChild?.localName).to.equal('settings-panel');
      await orchestrator.trigger('/missing');
      expect(stage.firstElementChild).to.be.null;
      orchestrator.close();
    });
  });

  it('runs callbacks and redirects', () => {
    /** @type {unknown[]} */
    const callbackCalls = [];
    setup([
      [
        '/callback/:id',
        /** @type {import('../../src/orchestrator.js').SceneCallback} */
        ((pattern, params) => {
          callbackCalls.push([pattern, params]);
        })
      ],
      ['/old', /** @type {Location} */ (/** @type {unknown} */ (
        new URL('/new', window.location.href)
      ))]
    ]).then(async ({stage, orchestrator}) => {
      await orchestrator.trigger('/callback/7');
      expect(callbackCalls).to.deep.equal([
        ['/callback/:id', {id: '7'}]
      ]);
      await orchestrator.trigger('/old');
      expect(window.location.pathname).to.equal('/new');
      expect(stage.children).to.have.length(0);
      window.history.replaceState(null, '', '/');
      orchestrator.close();
    });
  });

  it('awaits an async scene callback before trigger() itself resolves',
    () => {
      /** @type {unknown[]} */
      const callbackCalls = [];
      setup([
        [
          '/async-callback/:id',
          /** @type {import('../../src/orchestrator.js').SceneCallback} */
          (async (pattern, params) => {
            await delay();
            callbackCalls.push([pattern, params]);
          })
        ]
      ]).then(async ({orchestrator}) => {
        await orchestrator.trigger('/async-callback/3');
        // If `#onRoute` merely started the callback without awaiting it
        //   (the pre-3.1.0 behavior), this would run before `callbackCalls`
        //   was ever populated.
        expect(callbackCalls).to.deep.equal([
          ['/async-callback/:id', {id: '3'}]
        ]);
        orchestrator.close();
      });
    });

  it('removes the existing scene before running a callback', () => {
    /** @type {unknown[]} */
    const callbackCalls = [];
    setup([
      ['/current', 'current-scene'],
      [
        '/callback/:id',
        /** @type {import('../../src/orchestrator.js').SceneCallback} */
        ((pattern, params) => {
          callbackCalls.push([pattern, params]);
        })
      ]
    ]).then(async ({stage, orchestrator}) => {
      await orchestrator.trigger('/current');
      expect(stage.children).to.have.length(1);
      await orchestrator.trigger('/callback/9');
      expect(callbackCalls).to.deep.equal([
        ['/callback/:id', {id: '9'}]
      ]);
      expect(stage.children).to.have.length(0);
      orchestrator.close();
    });
  });

  it('uses URI-template scene patterns', () => {
    setup([
      ['/search{?q}', 'search-results']
    ], 'uritemplate').then(async ({stage, orchestrator}) => {
      await orchestrator.trigger('/search?q=term');
      const scene = /** @type {HTMLElement} */ (stage.firstElementChild);
      expect(scene.dataset.q).to.equal('term');
      orchestrator.close();
    });
  });
});
