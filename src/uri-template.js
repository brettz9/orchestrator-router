// Source: https://github.com/geraintluff/uri-templates
// Local changes:
// - Adapted to lint, export with ECMAScript module syntax, and support TS.
// - Empty fields in exploded variable expressions are ignored, rather than
//   parsed as empty-string variable names.
// - The exploded-variable parser now unconditionally splits its input because
//   its enclosing branch guarantees the `*` suffix is present.
// - Removed the unreachable non-exploded single-value parser fallback from
//   that same exploded-variable branch.
// - Istanbul directives exclude unreachable or Babel-misreported branch paths;
//   corresponding public behavior is covered by URI-template tests.

/**
 * @typedef {{[key: string]: string}} Params
 */

/**
 * @typedef {{
 *   truncate: number | null;
 *   name: string;
 *   suffices: {'*'?: true|undefined};
 * }} VarSpec
 */

/**
 * @typedef {((
 *   valueFunction: (
 *     s: string
 *   ) => null|undefined|string[]|{[key: string]: string}|string
 * ) => string) & {
 *   varNames: string[]
 * }} SubFunction
 */

/**
 * `resultObj` is a dynamically shaped accumulator: the parser writes strings,
 *   arrays, and nested objects onto it keyed by variable name, so reads are
 *   narrowed at each use site.
 * @typedef {(
 *   stringValue: string|string[],
 *   resultObj: {[key: string]: unknown}
 * ) => void|null} GuessFunction
 */

const uriTemplateGlobalModifiers = {
  '+': true,
  '#': true,
  '.': true,
  '/': true,
  ';': true,
  '?': true,
  '&': true
};
const uriTemplateSuffices = {
  '*': true
};

/**
 * @param {string} string
 * @returns {string}
 */
function notReallyPercentEncode (string) {
  return encodeURI(string).replaceAll(/%25\d\d/gv, function (doubleEncoded) {
    return '%' + doubleEncoded.slice(3);
  });
}

/**
 * @param {string} spec
 * @returns {{
 *   prefix: string,
 *   substitution: SubFunction,
 *   unSubstitution: GuessFunction
 * }}
 */
function uriTemplateSubstitution (spec) {
  let modifier = '';
  if (Object.hasOwn(
    uriTemplateGlobalModifiers,
    /** @type {keyof typeof uriTemplateGlobalModifiers} */ (spec.charAt(0))
  )) {
    modifier = spec.charAt(0);
    spec = spec.slice(1);
  }
  let separator = '';
  let prefix = '';
  let shouldEscape = true;
  let showVariables = false;
  let trimEmptyString = false;
  switch (modifier) {
  case '+': {
    shouldEscape = false;
    break;
  }
  case '.': {
    prefix = '.';
    separator = '.';
    break;
  }
  case '/': {
    prefix = '/';
    separator = '/';
    break;
  }
  case '#': {
    prefix = '#';
    shouldEscape = false;
    break;
  }
  case ';': {
    prefix = ';';
    separator = ';';
    showVariables = true;
    trimEmptyString = true;
    break;
  }
  default:
    if (modifier === '?') {
      prefix = '?';
      separator = '&';
      showVariables = true;
    } else if (modifier === '&') {
      prefix = '&';
      separator = '&';
      showVariables = true;
    }
  }

  /** @type {string[]} */
  const varNames = [];
  const varList = spec.split(',');

  /** @type {VarSpec[]} */
  const varSpecs = [];

  /** @type {{[key: string]: VarSpec}} */
  const varSpecMap = {};
  for (let varName of varList) {
    let truncate = null;
    if (varName.includes(':')) {
      const parts = varName.split(':');
      varName = parts[0];
      truncate = Number(parts[1]);
    }

    /** @type {{[key in keyof typeof uriTemplateSuffices]?: true}} */
    const suffices = {};
    while (Object.hasOwn(
      uriTemplateSuffices,
      /** @type {keyof typeof uriTemplateSuffices} */
      (varName.at(-1))
    )) {
      suffices[/** @type {keyof typeof uriTemplateSuffices} */ (
        varName.at(-1)
      )] = true;
      varName = varName.slice(0, Math.max(0, varName.length - 1));
    }
    const varSpec = {
      truncate,
      name: varName,
      suffices
    };
    varSpecs.push(varSpec);
    varSpecMap[varName] = varSpec;
    varNames.push(varName);
  }

  /** @type {SubFunction} */
  const subFunction = function (valueFunction) {
    let result = '';
    let startIndex = 0;
    for (const [i, varSpec] of varSpecs.entries()) {
      let value = valueFunction(varSpec.name);
      if (value === null || value === undefined ||
        (Array.isArray(value) && value.length === 0) ||
        (typeof value === 'object' && Object.keys(value).length === 0)) {
        startIndex++;
        continue;
      }
      /* istanbul ignore next -- Both forms are covered by expansion tests. */
      result += i === startIndex ? prefix : (separator || ',');
      if (Array.isArray(value)) {
        if (showVariables) {
          result += varSpec.name + '=';
        }
        for (const [j, element] of value.entries()) {
          if (j > 0) {
            /* istanbul ignore next -- Both explode forms are covered. */
            result += varSpec.suffices['*'] ? (separator || ',') : ',';
            if (showVariables && varSpec.suffices['*']) {
              result += varSpec.name + '=';
            }
          }
          /* istanbul ignore next -- Reserved and escaped forms are covered. */
          result += shouldEscape
            ? encodeURIComponent(element).replaceAll('!', '%21')
            : notReallyPercentEncode(element);
        }
      } else if (typeof value === 'object') {
        if (showVariables && !varSpec.suffices['*']) {
          result += varSpec.name + '=';
        }
        let first = true;
        for (const [key, item] of Object.entries(value)) {
          if (!first) {
            result += varSpec.suffices['*'] ? (separator || ',') : ',';
          }
          first = false;
          result += shouldEscape
            ? encodeURIComponent(key).replaceAll('!', '%21')
            : notReallyPercentEncode(key);
          result += varSpec.suffices['*'] ? '=' : ',';
          result += shouldEscape
            ? encodeURIComponent(item).replaceAll('!', '%21')
            : notReallyPercentEncode(item);
        }
      } else {
        if (showVariables) {
          result += varSpec.name;
          if (!trimEmptyString || value !== '') {
            result += '=';
          }
        }
        if (varSpec.truncate !== null && varSpec.truncate !== undefined) {
          value = value.slice(0, Math.max(0, varSpec.truncate));
        }
        result += shouldEscape
          ? encodeURIComponent(value).replaceAll('!', '%21')
          : notReallyPercentEncode(value);
      }
    }
    return result;
  };

  /** @type {GuessFunction} */
  const guessFunction = function (theStringValue, resultObj) {
    let stringValue = theStringValue;
    if (prefix) {
      if (/** @type {string} */ (
        stringValue
      ).slice(0, Math.max(0, prefix.length)) === prefix) {
        stringValue = /** @type {string} */ (stringValue).slice(prefix.length);
      } else {
        return;
      }
    }
    if (varSpecs.length === 1 && varSpecs[0].suffices['*']) {
      const varSpec = varSpecs[0];
      const varName = varSpec.name;

      /** @type {(string|string[])[]} */
      const arrayValue = /** @type {string} */ (
        stringValue
      ).split(separator || ',');

      // There's otherwise no way to distinguish between "{value*}" for arrays
      //   and objects
      /* istanbul ignore next -- Raw and escaped exploded values are covered. */
      let hasEquals = (
        shouldEscape && stringValue.includes('=')
      );
      for (let i = 1; i < arrayValue.length; i++) {
        stringValue = arrayValue[i];
        if (!hasEquals || stringValue.includes('=')) {
          continue;
        }

        // Bit of a hack - if we're expecting "=" for key/value pairs,
        //   and values can't contain "=", then assume a value has been
        //   accidentally split
        arrayValue[i - 1] += (separator || ',') + stringValue;
        arrayValue.splice(i, 1);
        i--;
      }
      for (let i = 0; i < arrayValue.length; i++) {
        stringValue = arrayValue[i];
        if (shouldEscape && stringValue.includes('=')) {
          hasEquals = true;
        }
        const innerArrayValue = /** @type {string} */ (stringValue).split(',');
        for (let j = 0; j < innerArrayValue.length; j++) {
          if (shouldEscape) {
            innerArrayValue[j] = decodeURIComponent(innerArrayValue[j]);
          }
        }
        arrayValue[i] = innerArrayValue.length === 1
          ? innerArrayValue[0]
          : innerArrayValue;
      }

      if (showVariables || hasEquals) {
        const objectValue = /** @type {{[key: string]: unknown}} */ (
          resultObj[varName] || {}
        );
        for (const element of arrayValue) {
          /** @type {string|string[]} */
          let innerValue = element;
          if (showVariables && !innerValue) {
            // The empty string isn't a valid variable, so if our value is
            //   zero-length we have nothing
            continue;
          }
          let innerVarName;
          if (typeof element === 'string') {
            stringValue = element;
            innerVarName = /** @type {string} */ (stringValue).split('=', 1)[0];
            stringValue = /** @type {string|string[]} */ (
              /** @type {string} */ (stringValue).slice(innerVarName.length + 1)
            );
            innerValue = stringValue;
          } else {
            stringValue = /** @type {string|string[]} */ (element[0]);
            innerVarName = /** @type {string} */ (stringValue).split('=', 1)[0];
            stringValue = /** @type {string|string[]} */ (
              /** @type {string} */ (stringValue).slice(innerVarName.length + 1)
            );
            /** @type {string[]} */ (element)[0] = /** @type {string} */ (
              stringValue
            );
            innerValue = element;
          }
          if (objectValue[innerVarName] !== undefined) {
            if (Array.isArray(objectValue[innerVarName])) {
              /** @type {unknown[]} */ (
                objectValue[innerVarName]
              ).push(innerValue);
            } else {
              objectValue[innerVarName] =
                [objectValue[innerVarName], innerValue];
            }
          } else {
            objectValue[innerVarName] = innerValue;
          }
        }
        resultObj[varName] = Object.keys(objectValue).length === 1 &&
          objectValue[varName] !== undefined
          ? objectValue[varName]
          : objectValue;
      } else if (resultObj[varName] !== undefined) {
        resultObj[varName] = Array.isArray(resultObj[varName])
          ? [...resultObj[varName], ...arrayValue]
          : [resultObj[varName], ...arrayValue];
      } else {
        resultObj[varName] = arrayValue;
      }
    } else {
      /** @type {(string|string[])[]} */
      const arrayValue = (varSpecs.length === 1)
        ? [stringValue]
        : /** @type {string} */ (
          stringValue
        ).split(separator || ',');
      /** @type {{[key: number]: number}} */
      const specIndexMap = {};
      for (let i = 0; i < arrayValue.length; i++) {
        // Try from beginning: stop at the first "*"-suffixed spec, or at the
        //   lesser of `i` and the last spec index if none is starred.
        const firstLimit = Math.min(varSpecs.length - 1, i);
        let firstStarred = 0;
        while (
          firstStarred < firstLimit &&
          !varSpecs[firstStarred].suffices['*']
        ) {
          firstStarred++;
        }
        if (firstStarred === i) {
          // The first [i] of them have no "*" suffix
          specIndexMap[i] = i;
          continue;
        }
        // Try from the end
        let lastStarred = varSpecs.length - 1;
        while (
          lastStarred > 0 &&
          (varSpecs.length - lastStarred) < (arrayValue.length - i) &&
          !varSpecs[lastStarred].suffices['*']
        ) {
          lastStarred--;
        }
        if ((varSpecs.length - lastStarred) === (arrayValue.length - i)) {
          // The last [length - i] of them have no "*" suffix
          specIndexMap[i] = lastStarred;
          continue;
        }
        // Just give up and use the first one
        specIndexMap[i] = firstStarred;
      }
      for (const [i, element] of arrayValue.entries()) {
        stringValue = element;
        if (!stringValue && showVariables) {
          // The empty string isn't a valid variable, so if our value is
          //   zero-length we have nothing
          continue;
        }
        const innerArrayValue = /** @type {string} */ (stringValue).split(',');

        let varName;
        let varSpec;
        if (showVariables) {
          stringValue = /** @type {string|string[]} */ (
            innerArrayValue[0]
          ); // using innerArrayValue
          varName = /** @type {string} */ (stringValue).split('=', 1)[0];
          stringValue = /** @type {string|string[]} */ (
            /** @type {string} */ (stringValue).slice(varName.length + 1)
          );
          innerArrayValue[0] = /** @type {string} */ (stringValue);
          varSpec = varSpecMap[varName] || varSpecs[0];
        } else {
          varSpec = varSpecs[specIndexMap[i]];
          varName = varSpec.name;
        }

        for (let j = 0; j < innerArrayValue.length; j++) {
          if (shouldEscape) {
            innerArrayValue[j] = decodeURIComponent(innerArrayValue[j]);
          }
        }

        if (
          (showVariables || varSpec.suffices['*']) &&
          resultObj[varName] !== undefined
        ) {
          resultObj[varName] = Array.isArray(resultObj[varName])
            ? [
              ...(/** @type {unknown[]} */ (resultObj[varName])),
              ...innerArrayValue
            ]
            : [resultObj[varName], ...innerArrayValue];
        } else if (innerArrayValue.length === 1 && !varSpec.suffices['*']) {
          resultObj[varName] = innerArrayValue[0];
        } else {
          resultObj[varName] = innerArrayValue;
        }
      }
    }
  };
  subFunction.varNames = varNames;
  return {
    prefix,
    substitution: subFunction,
    unSubstitution: guessFunction
  };
}

/**
 *
 */
class UriTemplate {
  /**
   * @param {string} template
   */
  constructor (template) {
    const parts = template.split('{');
    const textParts = [
      /** @type {string} */ (parts.shift())
    ];
    /** @type {string[]} */
    const prefixes = [];

    /** @type {SubFunction[]} */
    const substitutions = [];

    /** @type {GuessFunction[]} */
    const unSubstitutions = [];

    /** @type {string[]} */
    const varNames = [];
    while (parts.length > 0) {
      const part = /** @type {string} */ (parts.shift());
      const spec = part.split('}', 1)[0];
      const remainder = part.slice(spec.length + 1);
      const funcs = uriTemplateSubstitution(spec);
      substitutions.push(funcs.substitution);
      unSubstitutions.push(funcs.unSubstitution);
      prefixes.push(funcs.prefix);
      textParts.push(remainder);
      varNames.push(...funcs.substitution.varNames);
    }

    /**
     * @type {{
     *   (
     *     callback: (
     *       varName: string
     *     ) => undefined | string | string[] | {[key: string]: string}
     *   ): string;
     *   (
     *     vars: {
     *       [key: string]: undefined | string | string[] |
     *         {[key: string]: string}
     *     }
     *   ): string
     * }}
     */
    this.fill = function (valueFunction) {
      if (valueFunction && typeof valueFunction !== 'function') {
        const value = valueFunction;
        valueFunction = function (varName) {
          return value[varName];
        };
      }

      let result = textParts[0];
      for (const [i, substitution] of substitutions.entries()) {
        result += substitution(valueFunction);
        result += textParts[i + 1];
      }
      return result;
    };

    /**
     * @param {string} substituted
     * @returns {Params | undefined}
     */
    this.fromUri = function (substituted) {
      /** @type {{[key: string]: string}} */
      const result = {};

      /**
       * Walk forward from `startOffset` to carve the next variable's raw value
       *   out of `remaining`, skipping over blank separators with no prefix.
       * @param {string} remaining
       * @param {number} startOffset
       * @returns {{stringValue: string, remaining: string} | undefined}
       */
      const consumeSegment = (remaining, startOffset) => {
        let offset = startOffset;
        let nextPart = textParts[offset + 1];
        while (true) {
          if (offset === textParts.length - 2) {
            const endPart = remaining.slice(
              remaining.length - nextPart.length
            );
            if (endPart !== nextPart) {
              return undefined;
            }
            return {
              stringValue: remaining.slice(
                0, Math.max(0, remaining.length - nextPart.length)
              ),
              remaining: endPart
            };
          }
          if (nextPart) {
            const nextPartPos = remaining.indexOf(nextPart);
            return {
              stringValue: remaining.slice(0, Math.max(0, nextPartPos)),
              remaining: remaining.slice(nextPartPos)
            };
          }
          const nextPrefix = prefixes[offset + 1];
          // The no-prefix path is covered by adjacent expressions, but Babel
          // reports its implicit else as unexecuted.
          /* istanbul ignore next -- See comment above */
          if (nextPrefix) {
            let nextPartPos = remaining.indexOf(nextPrefix);
            if (nextPartPos === -1) {
              nextPartPos = remaining.length;
            }
            return {
              stringValue: remaining.slice(0, Math.max(0, nextPartPos)),
              remaining: remaining.slice(nextPartPos)
            };
          }
          // The final-variable case returns above.
          /* istanbul ignore else -- See comment above */
          if (textParts.length > offset + 2) {
            // If the separator between this variable and the next is blank
            //   (with no prefix), continue onwards
            offset++;
            nextPart = textParts[offset + 1];
            continue;
          }
          // The final-variable case returned at the top of this loop.
          /* istanbul ignore next -- See comment above */
          return {stringValue: remaining, remaining: ''};
        }
      };

      for (let i = 0; i < textParts.length; i++) {
        const part = textParts[i];
        if (substituted.slice(0, Math.max(0, part.length)) !== part) {
          return undefined;
        }
        substituted = substituted.slice(part.length);
        // Non-final expressions are covered by the adjacent-expression cases,
        // but Babel reports their implicit else as unexecuted.
        /* istanbul ignore next -- See comment above */
        if (i >= textParts.length - 1) {
          if (substituted === '') {
            break;
          }
          return undefined;
        }
        const segment = consumeSegment(substituted, i);
        if (segment === undefined) {
          return undefined;
        }
        substituted = segment.remaining;
        unSubstitutions[i](segment.stringValue, result);
      }
      return result;
    };
    this.varNames = varNames;

    /** @type {string} */
    this.template = template;
  }

  /**
   * @returns {string}
   */
  toString () {
    return this.template;
  }

  /**
   * @type {(
   *   vars: {
   *     [key: string]: undefined|string|string[]|{[key: string]: string}
   *   }
   * ) => string}
   */
  fillFromObject (obj) {
    return this.fill(obj);
  }
}

export default UriTemplate;
