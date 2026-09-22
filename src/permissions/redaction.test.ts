import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { redactSecrets } from './redaction.js';

describe('redaction object graphs', () => {
  it('preserves shared research warnings while redacting each occurrence', () => {
    const warnings = ['insufficient evidence', 'api_key=example-private-value'];
    const result = redactSecrets({ warnings, gateResult: { warnings } }) as any;
    assert.deepEqual(result.warnings, result.gateResult.warnings);
    assert.equal(Array.isArray(result.warnings), true);
    assert.doesNotMatch(JSON.stringify(result), /example-private-value|Circular/);
    assert.match(JSON.stringify(result), /REDACTED/);
    assert.equal(warnings[1], 'api_key=example-private-value');
  });

  it('preserves repeated objects and still terminates true cycles', () => {
    const shared: Record<string, unknown> = { password: 'private', label: 'source' };
    shared.self = shared;
    const result = redactSecrets({ first: shared, second: shared }) as any;
    assert.deepEqual(result.first, { password: '[REDACTED]', label: 'source', self: '[Circular]' });
    assert.deepEqual(result.second, result.first);
    assert.doesNotMatch(JSON.stringify(result), /private/);
  });

  it('handles a cyclic array repeated through sibling fields', () => {
    const values: unknown[] = ['safe'];
    values.push(values);
    assert.deepEqual(redactSecrets({ a: values, b: values }), {
      a: ['safe', '[Circular]'], b: ['safe', '[Circular]'],
    });
  });
});
