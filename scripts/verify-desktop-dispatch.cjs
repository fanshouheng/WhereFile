const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const boats = readFileSync(path.join(__dirname, '../desktop/DesktopBoats.cs'), 'utf8');
const shell = readFileSync(path.join(__dirname, '../desktop/DesktopShell.cs'), 'utf8');

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const setMode = section(boats, 'internal async void SetMode(', 'async void Poll()');
const poll = section(boats, 'async void Poll()', 'internal void Message(');
const message = section(boats, 'internal void Message(', 'public void Dispose()');
const capture = section(boats, 'async void Capture(', 'public void Dispose()');
const hide = section(shell, 'internal bool Hide(', 'internal bool IsHidden(');
const scanRequest = section(shell, 'sealed class Request', 'readonly BlockingCollection<Request> requests');

assert.match(setMode, /await scanner\.Read\(\)/);
assert.doesNotMatch(setMode, /shell\.Read\(/);
assert.match(poll, /await scanner\.ReadEntry\(entry\.Path\)/);
assert.doesNotMatch(poll, /shell\.Read\(/);
assert.doesNotMatch(message, /shell\.Read\(/);
assert.match(message, /Capture\(id,data\)/);
assert.match(capture, /await scanner\.ReadEntry\(entry\.Path\)/);
assert.doesNotMatch(capture, /shell\.Read\(/);
assert.match(capture, /ReferenceEquals\(move,latest\)/);
assert.doesNotMatch(hide, /Read\(/);
assert.match(scanRequest, /reader\.ReadEntry\(path\)/);

console.log('PASS: desktop moves and captures use background Shell reads, not synchronous UI scans.');
