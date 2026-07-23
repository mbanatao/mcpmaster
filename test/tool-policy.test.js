const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyToolRisk,
  requiresApproval,
  secureTokenMatches,
} = require('../dist/runtime/tool-policy.js');

test('classifies read-only tools', () => {
  assert.equal(classifyToolRisk('github.get-repository'), 'read');
  assert.equal(classifyToolRisk('linear.search-issues'), 'read');
  assert.equal(requiresApproval('notion.query-database'), false);
});

test('classifies write tools', () => {
  assert.equal(classifyToolRisk('github.create-issue'), 'write');
  assert.equal(classifyToolRisk('openai.generate-chat'), 'write');
  assert.equal(requiresApproval('box.upload-file'), true);
});

test('classifies destructive tools', () => {
  assert.equal(classifyToolRisk('github.merge-pull-request'), 'destructive');
  assert.equal(classifyToolRisk('neon.drop-table'), 'destructive');
  assert.equal(classifyToolRisk('gcp.deploy-cloud-run-service'), 'destructive');
});

test('unknown actions fail closed', () => {
  assert.equal(classifyToolRisk('example.do-something-new'), 'write');
  assert.equal(requiresApproval('example.do-something-new'), true);
});

test('approval tokens use exact matching', () => {
  const token = 'a'.repeat(32);
  assert.equal(secureTokenMatches(token, token), true);
  assert.equal(secureTokenMatches('b'.repeat(32), token), false);
  assert.equal(secureTokenMatches('short', token), false);
  assert.equal(secureTokenMatches(undefined, token), false);
});
