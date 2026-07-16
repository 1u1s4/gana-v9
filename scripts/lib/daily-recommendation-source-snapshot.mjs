import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

const SOURCE_MANIFEST_SCHEMA_VERSION = 1;

export function readRecommendationSourceSnapshot(artifactPath, { strict = false } = {}) {
  const resolvedArtifactPath = realpathSync(resolve(artifactPath));
  const main = readRequiredJsonSource('recommendations', null, resolvedArtifactPath);
  const artifact = main.value;
  if (!isObject(artifact)) throw new Error(`Invalid recommendations artifact: ${resolvedArtifactPath}`);

  const sources = [main.manifestEntry];
  let requiredLeague;
  if (!isObject(artifact.requiredLeagueRecommendations) && declaredPath(artifact.requiredLeagueRecommendationsPath)) {
    requiredLeague = readDeclaredJsonSource(
      'required-league-recommendations',
      'requiredLeagueRecommendationsPath',
      artifact.requiredLeagueRecommendationsPath,
      resolvedArtifactPath,
      { strict, artifact },
    );
    if (requiredLeague?.manifestEntry) sources.push(requiredLeague.manifestEntry);
  }

  const requiredData = requiredLeagueData(artifact, requiredLeague?.value);
  const requiredFixtures = Array.isArray(requiredData?.coverage?.fixtures) ? requiredData.coverage.fixtures : [];
  let providerComparison;
  if (!Array.isArray(artifact.requiredLeagueGeneralPredictions)
    && requiredFixtures.length > 0
    && declaredPath(artifact.providerComparisonPath)) {
    providerComparison = readDeclaredJsonSource(
      'provider-comparison',
      'providerComparisonPath',
      artifact.providerComparisonPath,
      resolvedArtifactPath,
      { strict, artifact },
    );
    if (providerComparison?.manifestEntry) sources.push(providerComparison.manifestEntry);
  }

  const sourceManifest = { schemaVersion: SOURCE_MANIFEST_SCHEMA_VERSION, sources };
  const sourceManifestSha256 = sha256(JSON.stringify(sourceManifest));

  return {
    artifact,
    requiredLeagueRecommendations: objectOrUndefined(requiredLeague?.value),
    providerComparison: objectOrUndefined(providerComparison?.value),
    sourceArtifactSha256: main.manifestEntry.sha256,
    sourceManifest,
    sourceManifestSha256,
  };
}

function readRequiredJsonSource(role, field, path) {
  const content = readFileSync(path);
  const value = JSON.parse(content.toString('utf8'));
  if (!isObject(value)) throw new Error(`Invalid JSON object source: ${path}`);
  return {
    value,
    manifestEntry: presentManifestEntry(role, field, path, content),
  };
}

function readDeclaredJsonSource(role, field, value, artifactPath, { strict, artifact }) {
  const normalized = declaredPath(value);
  if (!normalized) return undefined;
  const lexicalPath = isAbsolute(normalized) ? resolve(normalized) : resolve(dirname(artifactPath), normalized);
  let path;
  let content;
  try {
    path = realpathSync(lexicalPath);
    if (strict && dirname(path) !== dirname(artifactPath)) {
      throw new Error(`${field} must resolve to a sibling file in the recommendations run directory.`);
    }
    if (!statSync(path).isFile()) throw new Error(`${field} must resolve to a regular file.`);
    content = readFileSync(path);
  } catch (error) {
    if (strict) throw error;
    return {
      value: undefined,
      manifestEntry: {
        role,
        field,
        path: lexicalPath,
        state: 'unavailable',
        byteLength: null,
        sha256: null,
      },
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(content.toString('utf8'));
  } catch (error) {
    if (strict) throw new Error(`${field} must contain valid JSON: ${error instanceof Error ? error.message : error}`);
  }
  if (!isObject(parsed)) {
    if (strict) throw new Error(`${field} must contain a JSON object.`);
    parsed = undefined;
  }
  if (strict && (parsed.date !== artifact.date || parsed.dailyBatchId !== artifact.dailyBatchId)) {
    throw new Error(`${field} date/dailyBatchId does not match the recommendations artifact.`);
  }

  return {
    value: parsed,
    manifestEntry: presentManifestEntry(role, field, path, content),
  };
}

function presentManifestEntry(role, field, path, content) {
  return {
    role,
    field,
    path: resolve(path),
    byteLength: content.byteLength,
    sha256: sha256(content),
  };
}

function requiredLeagueData(artifact, loadedRequiredLeague) {
  if (isObject(artifact.requiredLeagueRecommendations)) return artifact.requiredLeagueRecommendations;
  if (isObject(loadedRequiredLeague)) return loadedRequiredLeague;
  if (artifact.requiredLeagueCoverage || artifact.requiredLeagueGoalCheck) {
    return {
      coverage: artifact.requiredLeagueCoverage,
      goalCheck: artifact.requiredLeagueGoalCheck,
    };
  }
  return undefined;
}

function declaredPath(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function objectOrUndefined(value) {
  return isObject(value) ? value : undefined;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
