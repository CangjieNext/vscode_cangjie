const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oniguruma = require('vscode-oniguruma');
const textmate = require('vscode-textmate');

const wasmPath = require.resolve('vscode-oniguruma/release/onig.wasm');
const grammarPath = path.resolve(__dirname, '..', 'syntaxes', 'Cangjie.tmLanguage.json');

async function createGrammar() {
  const wasm = await oniguruma.loadWASM(fs.readFileSync(wasmPath));
  const registry = new textmate.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (sources) => new oniguruma.OnigScanner(sources),
      createOnigString: (value) => new oniguruma.OnigString(value)
    }),
    loadGrammar: async (scopeName) => scopeName === 'source.cj'
      ? textmate.parseRawGrammar(fs.readFileSync(grammarPath, 'utf8'), grammarPath)
      : null
  });
  return registry.loadGrammar('source.cj');
}

function tokenScopes(grammar, lines) {
  let ruleStack = null;
  const scopes = [];
  for (const line of lines) {
    const result = grammar.tokenizeLine(line, ruleStack);
    ruleStack = result.ruleStack;
    scopes.push(result.tokens.map((token) => ({
      text: line.slice(token.startIndex, token.endIndex),
      scopes: token.scopes
    })));
  }
  return scopes;
}

function hasScope(tokens, text, scopePart) {
  return tokens.some((token) => token.text === text && token.scopes.some((scope) => scope.includes(scopePart)));
}

(async () => {
  const grammar = await createGrammar();

  for (const source of [
    ['String @ local!', ['@', 'local', '!']],
    ['String @ local?', ['@', 'local', '?']],
    ['String @ ~local', ['@', '~', 'local']]
  ]) {
    const tokens = tokenScopes(grammar, [source[0]])[0];
    for (const symbol of source[1]) {
      const expectedScope = symbol === 'local'
        ? 'support.function.Cangjie.macro'
        : 'keyword.control.Cangjie';
      assert.ok(hasScope(tokens, symbol, expectedScope), `expected modal scope for ${symbol} in ${source[0]}`);
    }
  }

  for (const lines of [
    ['String', '  @', '  local!'],
    ['String', '  @', '  ~', '  local'],
    ['String', '  @', '  local', '  ?']
  ]) {
    const tokens = tokenScopes(grammar, lines).flat();
    assert.ok(hasScope(tokens, 'local', 'support.function.Cangjie.macro'), `expected multiline modal identifier scope for ${lines.join('\\n')}`);
    assert.ok(hasScope(tokens, '@', 'keyword.control.Cangjie'), `expected modal axis scope for ${lines.join('\\n')}`);
  }

  const ordinaryAnnotation = tokenScopes(grammar, ['@C func f()'])[0];
  assert.ok(hasScope(ordinaryAnnotation, '@', 'keyword.control.Cangjie'), 'ordinary annotation should remain a keyword');
  assert.ok(hasScope(ordinaryAnnotation, 'C', 'support.function.Cangjie.macro'), 'ordinary annotation name should retain its existing macro scope');

  const comment = tokenScopes(grammar, ['// String @ local!'])[0];
  assert.equal(hasScope(comment, 'local', 'support.function.Cangjie.macro'), false, 'modal syntax should not be highlighted inside comments');

  const string = tokenScopes(grammar, ['"String @ local!"'])[0];
  assert.equal(hasScope(string, 'local', 'support.function.Cangjie.macro'), false, 'modal syntax should not be highlighted inside strings');

  for (const lines of [['let local = 1'], ['func local() {}'], ['obj.local'], ['let demode = 1']]) {
    const tokens = tokenScopes(grammar, lines)[0];
    assert.equal(tokens.some((token) => token.text === 'local' && token.scopes.some((scope) => scope.includes('support.function.Cangjie.macro'))), false, `ordinary identifier was highlighted as a modal macro: ${lines[0]}`);
  }

  const field = tokenScopes(grammar, ['class C { demode var field: String }'])[0];
  assert.ok(hasScope(field, 'demode', 'storage.modifier.Cangjie'), 'demode field modifier should be highlighted');

  for (const source of ['demode var field: String', 'func f() { demode var field: String }']) {
    const tokens = tokenScopes(grammar, [source])[0];
    assert.equal(hasScope(tokens, 'demode', 'storage.modifier.Cangjie'), false, `demode outside an instance member was highlighted: ${source}`);
  }

  for (const source of ['@local!!', '@local?Name', '@local!Name', '@~local!', '@~localName']) {
    const tokens = tokenScopes(grammar, [source])[0];
    assert.equal(tokens.some((token) => ['~', '!', '?'].includes(token.text) && token.scopes.some((scope) => scope.includes('keyword.control.Cangjie'))), false, 'invalid modal was highlighted');
  }

  const invalidMultilineModal = tokenScopes(grammar, ['String', '  @', '  local!Name']).flat();
  assert.equal(invalidMultilineModal.some((token) => ['~', '!', '?'].includes(token.text) && token.scopes.some((scope) => scope.includes('keyword.control.Cangjie'))), false, 'invalid multiline modal was highlighted');

  console.log('grammar modal tokenizer checks passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
