import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOptions } from '../dist/config.js';
test('rejects empty remote endpoints rather than silently launching a local browser', () => {
  assert.throws(() => validateOptions({ endpoint: '' }));
});
test('rejects multiline argument arrays and malformed viewport flags', () => {
  assert.throws(() => validateOptions({ args: ['--remote-debugging-pipe'] }));
  assert.throws(() => validateOptions({ fingerprint: { viewport: { width: 100, height: 100, isMobile: 'yes' } } }));
});
