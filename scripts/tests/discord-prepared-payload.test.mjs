import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  buildDiscordPayloads,
  loadPreparedDiscordPayload,
  loadRecommendations,
  parseArgs,
  writeDiscordPayloadArtifact,
} from '../../.agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs';

const DATE = '2026-07-15';
const BATCH = 'daily-2026-07-15-full';
const TARGET = 'discord:test';

describe('prepared Discord recommendation payloads', () => {
  it('parses explicit prepared-payload integrity proofs', () => {
    const args = parseArgs([
      '--artifact', '/tmp/recommendations.json',
      '--prepared-payload', '/tmp/prepared.json',
      '--expected-payload-sha256', 'a'.repeat(64),
      '--expected-source-manifest-sha256', 'b'.repeat(64),
      '--transport', 'discord-native',
      '--gateway-target', TARGET,
    ]);
    assert.equal(args.preparedPayload, '/tmp/prepared.json');
    assert.equal(args.expectedPayloadSha256, 'a'.repeat(64));
    assert.equal(args.expectedSourceManifestSha256, 'b'.repeat(64));
  });

  it('reuses only a payload bound to the exact complete source snapshot and target', () => {
    withFixture(({ artifactPath }) => {
      const loaded = loadRecommendations(artifactPath, { strictSources: true });
      const payloads = buildDiscordPayloads(loaded.artifact, { max: 25, gatewayTarget: TARGET });
      const written = writePrepared(artifactPath, loaded, payloads);
      const prepared = loadPrepared(artifactPath, loaded, written);

      assert.equal(prepared.sha256, written.sha256);
      assert.equal(prepared.sourceManifestSha256, loaded.sourceManifestSha256);
      assert.deepEqual(prepared.payloads, payloads);
      assert.throws(() => loadPreparedDiscordPayload(written.path, {
        artifactPath,
        artifact: loaded.artifact,
        transport: 'discord-native',
        gatewayTarget: 'discord:other',
        sourceManifest: loaded.sourceManifest,
        sourceManifestSha256: loaded.sourceManifestSha256,
        expectedPayloadSha256: written.sha256,
        expectedSourceManifestSha256: loaded.sourceManifestSha256,
      }), /transport\/target/);
    });
  });

  it('rejects payload tampering against the out-of-band expected SHA before delivery', () => {
    withFixture(({ artifactPath }) => {
      const loaded = loadRecommendations(artifactPath, { strictSources: true });
      const written = writePrepared(artifactPath, loaded, [{ content: '', embeds: [{ title: 'Frozen preview' }] }]);
      const tampered = JSON.parse(readFileSync(written.path, 'utf8'));
      tampered.payloads[0].embeds[0].title = 'Tampered after reservation';
      tampered.payloadSha256 = sha256(JSON.stringify(tampered.payloads));
      writeFileSync(written.path, `${JSON.stringify(tampered, null, 2)}\n`);

      assert.throws(() => loadPrepared(artifactPath, loaded, written), /payload SHA-256 verification/);
    });
  });

  it('rejects required-league addendum mutation after the prepared preview', () => {
    withFixture(({ artifactPath, requiredPath }) => {
      const loaded = loadRecommendations(artifactPath, { strictSources: true });
      const written = writePrepared(artifactPath, loaded, buildDiscordPayloads(loaded.artifact));
      writeFileSync(requiredPath, JSON.stringify(requiredAddendum({ marker: 'changed' })));
      const changed = loadRecommendations(artifactPath, { strictSources: true });

      assert.notEqual(changed.sourceManifestSha256, loaded.sourceManifestSha256);
      assert.throws(() => loadPrepared(artifactPath, changed, written), /source manifest changed/);
    });
  });

  it('rejects provider-comparison mutation after the prepared preview', () => {
    withFixture(({ artifactPath, comparisonPath }) => {
      const loaded = loadRecommendations(artifactPath, { strictSources: true });
      const written = writePrepared(artifactPath, loaded, buildDiscordPayloads(loaded.artifact));
      writeFileSync(comparisonPath, JSON.stringify(providerComparison({ marker: 'changed' })));
      const changed = loadRecommendations(artifactPath, { strictSources: true });

      assert.notEqual(changed.sourceManifestSha256, loaded.sourceManifestSha256);
      assert.throws(() => loadPrepared(artifactPath, changed, written), /source manifest changed/);
    });
  });

  it('fails strict source loading for a sidecar with the wrong slate identity', () => {
    withFixture(({ artifactPath, requiredPath }) => {
      writeFileSync(requiredPath, JSON.stringify({ ...requiredAddendum(), dailyBatchId: 'daily-other' }));
      assert.throws(
        () => loadRecommendations(artifactPath, { strictSources: true }),
        /date\/dailyBatchId does not match/,
      );
    });
  });
});

function withFixture(callback) {
  const dir = mkdtempSync(join(tmpdir(), 'gana-prepared-discord-'));
  try {
    const artifactPath = join(dir, 'daily-parlay-recommendations.json');
    const requiredPath = join(dir, 'required.json');
    const comparisonPath = join(dir, 'comparison.json');
    writeFileSync(requiredPath, JSON.stringify(requiredAddendum()));
    writeFileSync(comparisonPath, JSON.stringify(providerComparison()));
    writeFileSync(artifactPath, JSON.stringify({
      date: DATE,
      dailyBatchId: BATCH,
      recommendations: [],
      requiredLeagueRecommendationsPath: requiredPath,
      providerComparisonPath: comparisonPath,
    }));
    callback({ dir, artifactPath, requiredPath, comparisonPath });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function requiredAddendum(extra = {}) {
  return {
    date: DATE,
    dailyBatchId: BATCH,
    coverage: { fixtures: [{ fixtureId: 'fixture-1', fixture: 'A vs B' }] },
    atomicProjections: [],
    parlayProjections: [],
    ...extra,
  };
}

function providerComparison(extra = {}) {
  return {
    date: DATE,
    dailyBatchId: BATCH,
    items: [],
    ...extra,
  };
}

function writePrepared(artifactPath, loaded, payloads) {
  return writeDiscordPayloadArtifact(artifactPath, loaded.artifact, {
    transport: 'discord-native',
    gatewayTarget: TARGET,
    sourceArtifactSha256: loaded.sourceArtifactSha256,
    sourceManifest: loaded.sourceManifest,
    sourceManifestSha256: loaded.sourceManifestSha256,
  }, payloads);
}

function loadPrepared(artifactPath, loaded, written) {
  return loadPreparedDiscordPayload(written.path, {
    artifactPath,
    artifact: loaded.artifact,
    transport: 'discord-native',
    gatewayTarget: TARGET,
    sourceManifest: loaded.sourceManifest,
    sourceManifestSha256: loaded.sourceManifestSha256,
    expectedPayloadSha256: written.sha256,
    expectedSourceManifestSha256: written.sourceManifestSha256,
  });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
