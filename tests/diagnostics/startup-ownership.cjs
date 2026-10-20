// SPDX-License-Identifier: Apache-2.0
// Diagnostic only: run the real startup shell against isolated command doubles.
// No Docker daemon, RPC, dependencies, credentials, or live containers are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const script = path.resolve(__dirname, '../../scripts/start-local-network.sh');
const source = fs.readFileSync(script);
function probe(scenario) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weighin-ownership-probe-'));
  const log = path.join(dir, 'calls.jsonl');
  try {
    fs.writeFileSync(path.join(dir, 'docker'), `#!${process.execPath}
const fs=require('node:fs'), a=process.argv.slice(2);
fs.appendFileSync(process.env.PROBE_LOG,JSON.stringify(a)+'\\n');
if(a[0]==='ps'&&process.env.PROBE_SCENARIO==='unowned')console.log('unrelated-id');
if(a[0]==='inspect')console.log('another-owner');
if(a[0]==='run')console.log('this-attempt-id');
if(a[0]==='logs')console.log('retained failure diagnostic');
`);
    fs.writeFileSync(path.join(dir, 'node'), `#!${process.execPath}
if(process.argv[2]==='-e')process.exit(0);
if(process.env.PROBE_SCENARIO==='failure'){
 console.error('injected readiness failure');process.exit(1);
}
console.log('network is ready');
`);
    for (const command of ['docker', 'node']) fs.chmodSync(path.join(dir, command), 0o755);
    const run = spawnSync('bash', [script], {
      cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', timeout: 10000,
      env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}`,
        PROBE_LOG: log, PROBE_SCENARIO: scenario, WEIGHIN_REPLACE_UNOWNED_CONTAINER: '' },
    });
    assert.ifError(run.error);
    const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
    return { scenario, exit: run.status, stdout: run.stdout, stderr: run.stderr, calls };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const ready = probe('ready');
assert.equal(ready.exit, 0);
assert.equal(ready.calls.filter(a => a[0] === 'run').length, 1);
assert.equal(ready.calls.some(a => ['rm', 'stop'].includes(a[0])), false);
const collision = probe('unowned');
assert.equal(collision.exit, 1);
assert.equal(collision.calls.some(a => ['run', 'rm', 'stop'].includes(a[0])), false);
const failure = probe('failure');
assert.equal(failure.exit, 1);
assert.equal(failure.calls.filter(a => a[0] === 'run').length, 1);
assert.equal(failure.calls.filter(a => a[0] === 'logs').length, 1);
const cleanup = failure.calls.findIndex(a => ['stop', 'rm'].includes(a[0]) && a.includes('this-attempt-id'));
const logIndex = failure.calls.findIndex(a => a[0] === 'logs');
const report = {
  schema: 'weighin.startup-ownership-probe.v1',
  scriptSha256: createHash('sha256').update(source).digest('hex'),
  controls: { successRetainsSidecar: true, unownedCollisionPreserved: true, readinessFailureStaysFailure: true },
  acceptance: { failureLogsCaptured: logIndex >= 0, ownedContainerCleaned: cleanup >= 0,
    logsBeforeOwnedCleanup: cleanup > logIndex && logIndex >= 0 },
  runs: [ready, collision, failure],
};
console.log(JSON.stringify(report, null, 2));
// Exit 2 means the requested cleanup contract remains unmet, not a harness crash.
process.exitCode = Object.values(report.acceptance).every(Boolean) ? 0 : 2;
