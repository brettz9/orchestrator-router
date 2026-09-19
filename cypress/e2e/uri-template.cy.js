import UriTemplate from '../../src/uri-template.js';

describe('UriTemplate', () => {
  it('fills templates from objects and callbacks', () => {
    const template = new UriTemplate(
      'https://example.com{/segments*}{?query,empty,missing}'
    );

    expect(template.toString()).to.equal(
      'https://example.com{/segments*}{?query,empty,missing}'
    );
    expect(template.varNames).to.deep.equal([
      'segments', 'query', 'empty', 'missing'
    ]);
    expect(template.fillFromObject({
      segments: /** @type {{[key: string]: string}} */ (/** @type {unknown} */ (
        ['one', 'two']
      )),
      query: 'hello world',
      empty: ''
    })).to.equal('https://example.com/one/two?query=hello%20world&empty=');
    expect(template.fill((name) => (name === 'query' ? 'a/b' : undefined))).
      to.equal('https://example.com?query=a%2Fb');
  });

  it('supports URI template operators and value shapes', () => {
    expect(new UriTemplate('{var}').fillFromObject({var: 'a b!'})).
      to.equal('a%20b%21');
    expect(new UriTemplate('{+var}').fillFromObject({var: 'a/b?c'})).
      to.equal('a/b?c');
    expect(new UriTemplate('{#var}').fillFromObject({var: 'a/b'})).
      to.equal('#a/b');
    expect(new UriTemplate('{.var}').fillFromObject({var: 'a', other: 'b'})).
      to.equal('.a');
    expect(new UriTemplate('{/var,other}').fillFromObject({
      var: 'a', other: 'b'
    })).to.equal('/a/b');
    expect(new UriTemplate('{;var,empty}').fillFromObject({
      var: 'a', empty: ''
    })).to.equal(';var=a;empty');
    expect(new UriTemplate('{?list*}').fillFromObject({
      list: ['a', 'b']
    })).to.equal('?list=a&list=b');
    expect(new UriTemplate('{?keys*}').fillFromObject({
      keys: {a: '1', b: '2'}
    })).to.equal('?a=1&b=2');
    expect(new UriTemplate('{?keys}').fillFromObject({
      keys: {a: '1', b: '2'}
    })).to.equal('?keys=a,1,b,2');
    expect(new UriTemplate('{?one,two}').fillFromObject({two: '2'})).
      to.equal('?two=2');
    expect(new UriTemplate('{?one,two}').fillFromObject({one: '1', two: '2'})).
      to.equal('?one=1&two=2');
    expect(new UriTemplate('{list}').fillFromObject({list: ['a', 'b']})).
      to.equal('a,b');
    expect(new UriTemplate('{?list}').fillFromObject({list: ['a', 'b']})).
      to.equal('?list=a,b');
    expect(new UriTemplate('{+keys*}').fillFromObject({
      keys: {a: '1/2', b: '3/4'}
    })).to.equal('a=1/2,b=3/4');
    expect(new UriTemplate('{+keys}').fillFromObject({
      keys: {a: '1/2', b: '3/4'}
    })).to.equal('a,1/2,b,3/4');
    expect(new UriTemplate('{var:3}').fillFromObject({var: 'abcdef'})).
      to.equal('abc');
  });

  it('parses scalar, list, object, and prefixed values', () => {
    expect(new UriTemplate('/users/{id}').fromUri('/users/42')).
      to.deep.equal({id: '42'});
    expect(new UriTemplate('{/segments*}').fromUri('/one/two')).
      to.deep.equal({segments: ['one', 'two']});
    expect(new UriTemplate('{?one,two}').fromUri('?one=1&two=2')).
      to.deep.equal({one: '1', two: '2'});
    expect(new UriTemplate('{?pairs*}').fromUri('?a=1&b=2')).
      to.deep.equal({pairs: {a: '1', b: '2'}});
    expect(new UriTemplate('{?list*}').fromUri('?list=a&list=b')).
      to.deep.equal({list: ['a', 'b']});
    expect(new UriTemplate('{+value}').fromUri('a/b')).
      to.deep.equal({value: 'a/b'});
    expect(new UriTemplate('{value}').fromUri('a%20b')).
      to.deep.equal({value: 'a b'});
  });

  it('returns undefined for malformed or non-matching values', () => {
    expect(new UriTemplate('/fixed').fromUri('/fixed-extra')).to.be.undefined;
    expect(new UriTemplate('/users/{id}').fromUri('/teams/42')).
      to.be.undefined;
    expect(new UriTemplate('/users/{id}/profile').fromUri('/users/42/extra')).
      to.be.undefined;
    expect(new UriTemplate('{?one,two}').fromUri('?one=1&two=')).
      to.deep.equal({one: '1', two: ''});
    expect(new UriTemplate('{/first}{/second}').fromUri('/one')).
      to.deep.equal({second: 'one'});
  });

  it('covers repeated, empty, and multi-variable parsing edges', () => {
    expect(new UriTemplate('{?list*}').fromUri('?list=a&list=b')).
      to.deep.equal({list: ['a', 'b']});
    expect(new UriTemplate('{?key,other*}').fromUri('?key=1&other=2&other=3')).
      to.deep.equal({key: '1', other: ['2', '3']});
    expect(new UriTemplate('{?empty,filled}').fromUri('?empty=&filled=1')).
      to.deep.equal({empty: '', filled: '1'});
    expect(new UriTemplate('{first,second}').fromUri('one,two')).
      to.deep.equal({first: 'one', second: 'two'});
    expect(new UriTemplate('{first,second}').fromUri('one')).
      to.deep.equal({first: 'one'});
    // RFC 6570 allows an empty value for a variable, so a trailing empty
    // value after a non-empty adjacent variable is a valid parse result.
    expect(new UriTemplate('{first}{second}').fromUri('one')).
      to.deep.equal({first: 'one', second: ''});
    expect(new UriTemplate('/users/{id}/profile').fromUri('/users/42')).
      to.be.undefined;
    expect(new UriTemplate('/users/{id}/profile').fromUri('/users/42/profile')).
      to.deep.equal({id: '42'});
    expect(new UriTemplate('/x{?a,b}').fromUri('/x?a=1&b=2')).
      to.deep.equal({a: '1', b: '2'});
    expect(new UriTemplate('{?a,b}').fromUri('?a=&b=1')).
      to.deep.equal({a: '', b: '1'});
    expect(new UriTemplate('{?a,b}').fromUri('?a=1&b=2&c=3')).
      to.deep.equal({a: '1', b: '2', c: '3'});
    expect(new UriTemplate('{?a*}').fromUri('?a=')).
      to.deep.equal({a: ''});
    expect(new UriTemplate('{?a,a}').fromUri('?a=1&a=2')).
      to.deep.equal({a: ['1', '2']});
    expect(new UriTemplate('{first}{second}').fromUri('onetwo')).
      to.deep.equal({first: 'onetwo', second: ''});
    expect(new UriTemplate('{first}{second}').fromUri('one')).
      to.deep.equal({first: 'one', second: ''});
  });

  it('parses exploded and adjacent expansion edge cases', () => {
    expect(new UriTemplate('{+value}').fillFromObject({value: 'a%20b'})).
      to.equal('a%20b');
    expect(new UriTemplate('{&one,two}').fromUri('&one=1&two=2')).
      to.deep.equal({one: '1', two: '2'});
    expect(new UriTemplate('{+values*}').fromUri('one,two')).
      to.deep.equal({values: ['one', 'two']});
    expect(new UriTemplate('{?values*}').fromUri('?a=one,two')).
      to.deep.equal({values: {a: ['one', 'two']}});
    expect(new UriTemplate('{?values*}').fromUri('?a=1&a=2&a=3')).
      to.deep.equal({values: {a: ['1', '2', '3']}});
    expect(new UriTemplate('{?values*}').fromUri('?a=one&two')).
      to.deep.equal({values: {a: 'one&two'}});
    expect(new UriTemplate('{values*}').fromUri('a=one,b')).
      to.deep.equal({values: {a: ['one', 'b']}});
    expect(new UriTemplate('{?values*}').fromUri('?&a=one')).
      to.deep.equal({values: {a: 'one'}});
    expect(new UriTemplate('{values*}{values*}').fromUri('one,two')).
      to.deep.equal({values: ['one', 'two', '']});
    expect(new UriTemplate('{value}{value*}').fromUri('one')).
      to.deep.equal({value: ['one', '']});
    expect(new UriTemplate('{?one,two}').fromUri('?')).to.deep.equal({});
    expect(new UriTemplate('{first*,second}').fromUri('one,two,three')).
      to.deep.equal({first: ['one', 'two'], second: 'three'});
    expect(new UriTemplate('{first,second*,third}').
      fromUri('one,two,three,four')).
      to.deep.equal({first: 'one', second: ['two', 'three'], third: 'four'});
    expect(new UriTemplate('{first,second*}').fromUri('one,two,three,four')).
      to.deep.equal({first: 'one', second: ['two', 'three', 'four']});
    expect(new UriTemplate('{first}-{second}').fromUri('one-two')).
      to.deep.equal({first: 'one', second: 'two'});
    expect(new UriTemplate('{first}{/second}').fromUri('one')).
      to.deep.equal({first: 'one'});
    expect(new UriTemplate('{first}{/second}').fromUri('one/two')).
      to.deep.equal({first: 'one', second: 'two'});
  });
});
