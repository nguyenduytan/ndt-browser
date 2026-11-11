import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProxy, validateOptions } from '../dist/config.js';
test('proxy URL decodes credentials and removes them from launch endpoint', () => {
  assert.deepEqual(normalizeProxy('http://u%40ser:p%3Ass@localhost:8080'), {
    server: 'http://localhost:8080/', username: 'u@ser', password: 'p:ss'
  });
  assert.doesNotThrow(() => validateOptions({ proxy: 'http://user:pass@localhost:8080' }));
  assert.throws(() => normalizeProxy('secret-invalid-url'), error => !error.message.includes('secret-invalid-url'));
});
