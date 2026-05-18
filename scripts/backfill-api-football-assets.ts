import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

type AssetMetadata = Record<string, string>;
type CliOptions = { batchSize: number; limit: number | null; dryRun: boolean; concurrency: number };
type UpdateTask = () => Promise<void>;

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readProviderId(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return value.trim();
  return undefined;
}

function readUrl(value: unknown): string | undefined {
  const text = readString(value);
  if (!text) return undefined;
  try {
    const parsed = new URL(text);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function mergeAssetMetadata(current: unknown, next: AssetMetadata): Record<string, unknown> | undefined {
  const base = readRecord(current);
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(next)) {
    if (value) merged[key] = value;
  }
  if (Object.keys(next).length === 0) return undefined;
  merged.assetSource = 'api-football';
  return merged;
}

function alreadyHasAssets(current: unknown, next: AssetMetadata): boolean {
  const base = readRecord(current);
  return Object.entries(next).every(([key, value]) => base[key] === value);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const provider = await db.sportsProvider.findUnique({ where: { code: 'api-football' } });
  if (!provider) throw new Error('api-football provider is not persisted yet.');

  let updatedCompetitions = 0;
  let updatedTeams = 0;
  let scannedFixtures = 0;
  let cursorProviderFixtureId: string | undefined;
  const seenCompetitions = new Set<string>();
  const seenTeams = new Set<string>();

  while (true) {
    const remaining = options.limit === null ? options.batchSize : Math.max(0, Math.min(options.batchSize, options.limit - scannedFixtures));
    if (remaining === 0) break;
    console.error(`loading batch after=${cursorProviderFixtureId ?? 'start'} take=${remaining}`);
    const fixtures = await db.fixture.findMany({
      where: { providerId: provider.id },
      orderBy: { providerFixtureId: 'asc' },
      take: remaining,
      ...(cursorProviderFixtureId
        ? {
          skip: 1,
          cursor: {
            providerId_providerFixtureId: {
              providerId: provider.id,
              providerFixtureId: cursorProviderFixtureId,
            },
          },
        }
        : {}),
      select: {
        providerFixtureId: true,
        metadata: true,
        competition: { select: { id: true, metadata: true } },
        homeTeam: { select: { id: true, providerTeamId: true, country: true, metadata: true } },
        awayTeam: { select: { id: true, providerTeamId: true, country: true, metadata: true } },
      },
    });
    if (!fixtures.length) break;

    const updateTasks: UpdateTask[] = [];
    for (const fixture of fixtures) {
      scannedFixtures += 1;
      const metadata = readRecord(fixture.metadata);
      const item = readRecord(metadata.raw);
      if (!Object.keys(item).length) continue;
      const league = readRecord(item.league);
      const leagueId = readProviderId(league.id);
      const leagueLogo = readUrl(league.logo);
      const leagueFlag = readUrl(league.flag);
      if (fixture.competition && leagueId && (leagueLogo || leagueFlag) && !seenCompetitions.has(leagueId)) {
        seenCompetitions.add(leagueId);
        const next = {
          ...(leagueLogo ? { logoUrl: leagueLogo } : {}),
          ...(leagueFlag ? { flagUrl: leagueFlag } : {}),
        };
        const metadata = mergeAssetMetadata(fixture.competition.metadata, next);
        if (metadata && !alreadyHasAssets(fixture.competition.metadata, next)) {
          if (!options.dryRun) {
            const competitionId = fixture.competition.id;
            updateTasks.push(async () => {
              await db.competition.update({ where: { id: competitionId }, data: { metadata } });
            });
          }
          updatedCompetitions += 1;
        }
      }

      const teams = readRecord(item.teams);
      const leagueCountry = readString(league.country);
      for (const side of ['home', 'away'] as const) {
        const team = readRecord(teams[side]);
        const record = side === 'home' ? fixture.homeTeam : fixture.awayTeam;
        const teamId = readProviderId(team.id);
        const logoUrl = readUrl(team.logo);
        if (!record || !teamId || !logoUrl || seenTeams.has(teamId)) continue;
        seenTeams.add(teamId);
        const next = { logoUrl };
        const metadata = mergeAssetMetadata(record.metadata, next);
        if (metadata && !alreadyHasAssets(record.metadata, next)) {
          if (!options.dryRun) {
            const teamId = record.id;
            const country = record.country ?? readString(team.country) ?? leagueCountry ?? null;
            updateTasks.push(async () => {
              await db.team.update({
                where: { id: teamId },
                data: { country, metadata },
              });
            });
          }
          updatedTeams += 1;
        }
      }
    }

    await runLimited(updateTasks, options.concurrency);
    console.error(`scanned=${scannedFixtures} teams=${seenTeams.size} competitions=${seenCompetitions.size} updatedTeams=${updatedTeams} updatedCompetitions=${updatedCompetitions}`);
    cursorProviderFixtureId = fixtures.at(-1)?.providerFixtureId;
  }

  console.log(JSON.stringify({ scannedFixtures, updatedCompetitions, updatedTeams, dryRun: options.dryRun }, null, 2));
}

function parseOptions(args: string[]): CliOptions {
  const readFlag = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const batchSize = positiveInteger(readFlag('--batch-size'), 50);
  const limitRaw = readFlag('--limit');
  const concurrency = positiveInteger(readFlag('--concurrency'), 8);
  return {
    batchSize,
    limit: limitRaw === undefined ? null : positiveInteger(limitRaw, 0),
    dryRun: args.includes('--dry-run'),
    concurrency: Math.max(1, Math.min(32, concurrency)),
  };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

async function runLimited(tasks: UpdateTask[], concurrency: number): Promise<void> {
  if (!tasks.length) return;
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor];
      cursor += 1;
      await task();
    }
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
