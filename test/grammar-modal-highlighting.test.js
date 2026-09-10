const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const grammarPath = path.resolve(__dirname, '..', 'syntaxes', 'Cangjie.tmLanguage.json');
const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8'));
const modal = grammar.repository.modal.patterns[1];
const modalRegex = new RegExp(modal.match, 'u');
const keywordPatterns = grammar.repository.keywords.patterns;
const keywordRegex = new RegExp(keywordPatterns[0].match);
const exclaveRegex = new RegExp(keywordPatterns[1].match);
const demodeRegex = new RegExp(grammar.repository.demode.patterns[0].match);

function assertModal(source, expectedAxis, expectedDegree) {
  const match = modalRegex.exec(source);
  assert.ok(match, `expected modal syntax to match: ${source}`);
  const axis = match[5] || match[6];
  const degree = match[3] ? `~${match[5]}` : `${axis}${match[8]}`;
  assert.equal(axis, expectedAxis, `unexpected modal axis for: ${source}`);
  assert.equal(degree, expectedDegree, `unexpected modal degree for: ${source}`);
}

assertModal('String @ local!', 'local', 'local!');
assertModal('String @ local?', 'local', 'local?');
assertModal('String @ ~local', 'local', '~local');
assertModal('String @local!', 'local', 'local!');
assertModal('String @local?', 'local', 'local?');
assertModal('String @~local', 'local', '~local');
assertModal('String\n  @\n  local!', 'local', 'local!');
assertModal('func @local? f(): String', 'local', 'local?');
assertModal('init(this @ local!, value: String @ local?)', 'local', 'local!');

assert.ok(exclaveRegex.test('exclave'), 'exclave should be a keyword');
assert.ok(demodeRegex.test('demode var value: String'), 'demode should be a declaration modifier');
assert.equal(keywordRegex.test('local'), false, 'local must not be a global keyword');
assert.equal(keywordRegex.test('localName'), false, 'localName must not be a keyword');
assert.equal(modalRegex.test('let local = 1'), false, 'ordinary local must not be modal');
assert.equal(modalRegex.test('func local()'), false, 'function named local must not be modal');
assert.equal(modalRegex.test('class local {}'), false, 'type named local must not be modal');
assert.equal(modalRegex.test('obj.local'), false, 'member named local must not be modal');
assert.equal(modalRegex.test('@C func f()'), false, 'ordinary annotation must not be modal');
assert.equal(modalRegex.test('@local'), false, 'modal axis without a degree must not match');
assert.equal(modalRegex.test('@local!!'), false, 'modal degree must not match an invalid suffix');
assert.equal(modalRegex.test('@local?Name'), false, 'modal degree must not match an identifier suffix');
assert.equal(modalRegex.test('@local!Name'), false, 'modal degree must not match an identifier suffix');
assert.equal(modalRegex.test('@~local!'), false, 'tilde modal must not match a second degree');
assert.equal(modalRegex.test('@~localName'), false, 'tilde modal must not match a longer axis');
assert.equal(demodeRegex.test('demode var value: String'), true, 'demode should match a field modifier');
assert.equal(demodeRegex.test('let demode = 1'), false, 'demode should not match an ordinary variable');
assert.equal(demodeRegex.test('func demode() {}'), false, 'demode should not match an ordinary function');
assert.equal(demodeRegex.test('obj.demode'), false, 'demode should not match an ordinary member');

assert.equal(modal.captures[1].name, 'keyword.control.Cangjie');
assert.equal(modal.captures[3].name, 'keyword.control.Cangjie');
assert.equal(modal.captures[5].name, 'support.function.Cangjie.macro');
assert.equal(modal.captures[6].name, 'support.function.Cangjie.macro');
assert.equal(modal.captures[8].name, 'keyword.control.Cangjie');

console.log('grammar modal highlighting checks passed');
