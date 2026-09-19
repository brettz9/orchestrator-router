/* globals document, PopStateEvent -- Polyfill or browser */
import Router from './router.js';

/**
 * @typedef {import('./router.js').Params} Params
 */

/**
 * @typedef {string|Location|SceneCallback|
 *   {tagName: string}|{redirect: URL}|{callback: SceneCallback}
 * } SceneOptions
 */

/**
 * @typedef {[
 *   pattern: string|URLPattern,
 *   options: SceneOptions
 * ]} Scene
 */

/**
 * @typedef {(pattern: string|URLPattern, params: Params) => void} SceneCallback
 */

/**
 *
 */
export default class Orchestrator extends Router {
  /**
   * @param {{
   *   stage: Element,
   *   scenes: Scene[],
   *   patterns?: import('./router.js').PatternSyntax
   * }} cfg `patterns` chooses how a scene key given as a plain string is
   *   interpreted (`'urlpattern'`, the default, or `'uritemplate'`).
   */
  constructor ({stage, scenes, patterns}) {
    const routes = new Map();
    // eslint-disable-next-line @stylistic/max-len -- Long
    // eslint-disable-next-line prefer-const, unicorn/no-unreadable-for-of-expression -- Convenient
    for (let [pattern, options] of new Map(scenes)) {
      if (typeof options === 'string') {
        options = {tagName: options};
      }
      if (Object.prototype.toString.call(options) === '[object URL]') {
        options = {
          redirect: /** @type {URL} */ (/** @type {unknown} */ (options))
        };
      }
      if (typeof options === 'function') {
        options = {callback: options};
      }

      /**
       * @param {Params} params
       * @returns {Promise<void>}
       */
      const handler = (params) => this.#onRoute(
        pattern,
        params,
        /**
         * @type {{
         *   tagName: string
         * }|{
         *   redirect: URL
         * }|{
         *   callback: SceneCallback
         * }}
         */
        (options)
      );
      routes.set(pattern, handler);
    }
    super(routes, (/* url */) => this.#onFallback(), {patterns});
    this.stage = stage;

    /** @type {HTMLElement|undefined} */
    this.scene = undefined;
  }

  /**
   * @returns {void}
   */
  #onFallback () {
    if (!this.scene) {
      return;
    }

    this.scene.remove();
    delete this.scene;
  }

  /**
   * @param {string|URLPattern} pattern
   * @param {Params} params
   * @param {{
   *   tagName?: string
   *   redirect?: URL
   *   callback?: SceneCallback
   * }} cfg
   * @returns {Promise<void>}
   */
  async #onRoute (pattern, params, {tagName, callback, redirect}) {
    if (callback) {
      if (this.scene !== undefined) {
        const {scene} = this;
        delete this.scene;
        scene.remove();
      }
      await callback.call(this, pattern, params);
    }

    if (redirect) {
      globalThis.history.replaceState(null, '', redirect);
      globalThis.dispatchEvent(new PopStateEvent('popstate'));
    }

    if (tagName) {
      if (this.scene !== undefined &&
        this.scene.localName === tagName
      ) {
        Object.assign(this.scene.dataset, params);
      } else {
        const scene = document.createElement(tagName);
        Object.assign(scene.dataset, params);
        if (this.scene === undefined) {
          this.stage.append(scene);
        } else {
          this.stage.replaceChild(scene, this.scene);
        }
        this.scene = scene;
      }
    }
  }
}
