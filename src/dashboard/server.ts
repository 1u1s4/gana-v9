import { createServer, type Server, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { Prisma, PrismaClient } from '@prisma/client';
import { fixtureDateRange, redactText } from '../storage/repositories/helpers.js';
import { getPrismaClient } from '../storage/db.js';
import type { AgentConfig } from '../config.js';
import { dashboardHtml } from './page.js';
import {
  createMetadata,
  normalizeSortAndDirectionForTab,
  parseOverviewQuery,
  type DashboardDirection,
  type DashboardMetadata,
  type DashboardTab,
} from './query.js';
import type {
  DashboardCounts,
  DashboardFixtureRow,
  DashboardOverviewResponse,
  DashboardParlayRow,
  DashboardPredictionRow,
  DashboardRunRow,
  DashboardValidationRow,
} from './types.js';

type DashboardDb = Pick<
  PrismaClient,
  | 'prediction'
  | 'parlay'
  | 'validationArtifact'
  | 'harnessRun'
  | 'fixture'
  | 'team'
  | 'competition'
> & {
  $queryRaw: PrismaClient['$queryRaw'];
};

type DashboardEntityKind = 'fixture' | 'prediction' | 'parlay' | 'validation' | 'run';

export interface DashboardOptions {
  host?: string;
  port?: number;
}

export interface DashboardServer {
  server: Server;
  url: string;
}

export interface DashboardEntityResponse {
  kind: DashboardEntityKind;
  entity: DashboardFixtureRow | DashboardPredictionRow | DashboardParlayRow | DashboardValidationRow | DashboardRunRow;
  validationHistory?: DashboardValidationRow[];
}

type QueryArgs = Record<string, unknown>;
type DateWindow = { start: Date; end: Date };
type SortCandidateMap = {
  fixtures: ReadonlyArray<string>;
  predictions: ReadonlyArray<string>;
  parlays: ReadonlyArray<string>;
  validations: ReadonlyArray<string>;
  runs: ReadonlyArray<string>;
};

const SORTABLE_FIELDS: SortCandidateMap = {
  fixtures: ['scheduledAt', 'status', 'createdAt', 'updatedAt'],
  predictions: ['generatedAt', 'marketKey', 'selectionKey', 'odds', 'impliedProbability', 'edge', 'confidence', 'status'],
  parlays: ['generatedAt', 'combinedOdds', 'aggregateConfidence', 'aggregateQuality', 'status'],
  validations: ['evaluatedAt', 'status', 'createdAt'],
  runs: ['createdAt', 'startedAt', 'completedAt', 'status', 'verdict'],
};

const DEFAULT_SORT_BY = {
  fixtures: 'scheduledAt',
  predictions: 'generatedAt',
  parlays: 'generatedAt',
  validations: 'evaluatedAt',
  runs: 'createdAt',
} as const;

export async function startDashboardServer(
  config: AgentConfig,
  options: DashboardOptions = {},
  db: DashboardDb = getPrismaClient(),
): Promise<DashboardServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 4317;

  const server = createServer(async (req, res) => {
    if (!req.method || req.method !== 'GET') {
      return sendJson(res, 405, { error: 'method_not_allowed' });
    }

    try {
      const url = new URL(req.url ?? '/', `http://${host}:${port}`);

      if (url.pathname === '/') {
        return sendHtml(res, dashboardHtml());
      }

      if (url.pathname === '/api/metadata') {
        return sendJson(res, 200, await readMetadata(db));
      }

      if (url.pathname === '/api/overview') {
        return sendJson(res, 200, await readOverview(db, config, url.searchParams));
      }

      const entityMatch = /^\/api\/entity\/(fixture|prediction|parlay|validation|run)\/([^/]+)$/.exec(url.pathname);
      if (entityMatch) {
        const kind = entityMatch[1];
        const id = entityMatch[2] ?? '';
        if (!kind || !id) return sendJson(res, 400, { error: 'invalid_entity_request' });
        const result = await readEntity(db, kind as DashboardEntityKind, id);
        if ('error' in result) return sendJson(res, 404, result);
        return sendJson(res, 200, result);
      }

      if (url.pathname === '/api/health') {
        await db.$queryRaw`SELECT 1`;
        return sendJson(res, 200, { ok: true });
      }

      return sendJson(res, 404, { error: 'not_found' });
    } catch (err: unknown) {
      return sendJson(res, 500, {
        error: 'dashboard_error',
        message: redactText(err instanceof Error ? err.message : String(err)) ?? 'dashboard request failed',
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return { server, url: `http://${host}:${actualPort}` };
}

export async function readMetadata(db: DashboardDb): Promise<DashboardMetadata> {
  const [teams, competitions, metadata] = await Promise.all([
    db.team.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.competition.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    Promise.resolve(createMetadata()),
  ]);

  return {
    ...metadata,
    teams: teams.map((team) => ({ id: String(team.id), name: String(team.name) })),
    competitions: competitions.map((competition) => ({ id: String(competition.id), name: String(competition.name) })),
  };
}

export async function readOverview(
  db: DashboardDb,
  config: AgentConfig,
  params: URLSearchParams,
): Promise<DashboardOverviewResponse> {
  const metadata = createMetadata();
  const query = parseOverviewQuery(params, {
    defaultTab: 'fixtures',
    defaultSortBy: DEFAULT_SORT_BY.fixtures,
    defaultDirection: 'desc',
  });

  const page = Math.max(1, query.page);
  const normalized = normalizeSortAndDirectionForTab(query.tab, query.sort, query.direction);
  const dateWindow = resolveDateWindow(query.dateFrom, query.dateTo, config.apiFootball.timezone);
  const skip = (page - 1) * query.take;
  const statusFilter = filterStatusByKind(query.tab, query.statuses, metadata);

  const where = buildFilters(query, dateWindow, statusFilter);

  const [counts, statusFacets, total, rows] = await Promise.all([
    countAllTabs(db, where),
    readStatusFacets(db, query.tab, where),
    countActive(db, query.tab, where[query.tab]),
    readActiveRows(db, query.tab, where[query.tab], normalized.sort, normalized.direction, skip, query.take),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    activeTab: query.tab,
    page,
    take: query.take,
    sort: normalized.sort,
    direction: normalized.direction,
    filters: {
      validationTarget: query.validationTarget,
      targetId: query.targetId,
      date: query.date,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      fixtureStatus: query.fixtureStatuses,
      runId: query.runId,
      status: statusFilter,
      market: query.market,
      team: query.team,
      competition: query.competition,
      minConfidence: query.minConfidence,
      maxConfidence: query.maxConfidence,
      minEdge: query.minEdge,
      maxEdge: query.maxEdge,
      quality: query.qualities,
    },
    config: {
      timezone: config.apiFootball.timezone,
      artifactRoot: config.artifactRoot,
      providerSports: 'api-football',
      providerAgentic: config.provider,
      model: config.model,
    },
    counts,
    pagination: {
      page,
      take: query.take,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.take)),
    },
    statusFacets,
    fixtures: rows.fixtures,
    predictions: rows.predictions,
    parlays: rows.parlays,
    validations: rows.validations,
    runs: rows.runs,
  };
}

export async function readEntity(
  db: DashboardDb,
  kind: DashboardEntityKind,
  id: string,
): Promise<DashboardEntityResponse | { error: 'not_found'; message: string }> {
  if (kind === 'fixture') {
    const row = (await db.fixture.findUnique({
      where: { id },
      include: {
        competition: true,
        homeTeam: true,
        awayTeam: true,
        _count: {
          select: { predictions: true, parlayLegs: true, validationArtifacts: true },
        },
        predictions: {
          orderBy: { generatedAt: 'desc' },
          take: 8,
          include: {
            validationArtifacts: { orderBy: { evaluatedAt: 'desc' }, take: 1 },
          },
        },
        parlayLegs: {
          orderBy: { legIndex: 'asc' },
          take: 12,
          include: {
            prediction: {
              select: {
                id: true,
                status: true,
                confidence: true,
                edge: true,
              },
            },
          },
        },
        validationArtifacts: {
          orderBy: { evaluatedAt: 'desc' },
          take: 12,
          include: {
            prediction: {
              include: {
                fixture: {
                  include: { competition: true, homeTeam: true, awayTeam: true },
                },
              },
            },
            parlay: {
              include: {
                legs: { select: { id: true } },
              },
            },
          },
        },
      },
    })) as unknown;

    if (!row) return { error: 'not_found', message: `fixture ${id} not found` };
    return { kind: 'fixture', entity: mapFixture(row, true) as DashboardFixtureRow };
  }

  if (kind === 'prediction') {
    const row = (await db.prediction.findUnique({
      where: { id },
      include: {
        fixture: {
          include: { competition: true, homeTeam: true, awayTeam: true },
        },
        validationArtifacts: {
          orderBy: { evaluatedAt: 'desc' },
          take: 15,
        },
      },
    })) as unknown;

    if (!row) return { error: 'not_found', message: `prediction ${id} not found` };
    const prediction = mapPrediction(row);
    const validationHistory = toArray(toRecord(row).validationArtifacts).map((item) => mapValidation(item));
    return { kind: 'prediction', entity: prediction, validationHistory };
  }

  if (kind === 'parlay') {
    const row = (await db.parlay.findUnique({
      where: { id },
      include: {
        legs: {
          orderBy: { legIndex: 'asc' },
          include: {
            fixture: {
              include: { competition: true, homeTeam: true, awayTeam: true },
            },
            prediction: {
              select: {
                id: true,
                status: true,
                confidence: true,
                edge: true,
              },
            },
          },
        },
        validationArtifacts: {
          orderBy: { evaluatedAt: 'desc' },
          take: 15,
        },
      },
    })) as unknown;

    if (!row) return { error: 'not_found', message: `parlay ${id} not found` };
    const parlay = mapParlay(row);
    const validationHistory = toArray(toRecord(row).validationArtifacts).map((item) => mapValidation(item));
    return { kind: 'parlay', entity: parlay, validationHistory };
  }

  if (kind === 'validation') {
    const row = (await db.validationArtifact.findUnique({
      where: { id },
      include: {
        fixture: {
          include: { competition: true, homeTeam: true, awayTeam: true },
        },
        prediction: {
          include: {
            fixture: {
              include: { competition: true, homeTeam: true, awayTeam: true },
            },
          },
        },
        parlay: {
          include: {
            legs: {
              select: { id: true },
            },
          },
        },
      },
    })) as unknown;

    if (!row) return { error: 'not_found', message: `validation ${id} not found` };
    return { kind: 'validation', entity: mapValidation(row) };
  }

  const row = (await db.harnessRun.findUnique({
    where: { id },
    include: {
      _count: {
        select: { tasks: true, artifacts: true, predictions: true, parlays: true, validationArtifacts: true },
      },
      predictions: {
        orderBy: { generatedAt: 'desc' },
        take: 8,
        include: {
          fixture: {
            include: { competition: true, homeTeam: true, awayTeam: true },
          },
          validationArtifacts: { orderBy: { evaluatedAt: 'desc' }, take: 1 },
        },
      },
      parlays: {
        orderBy: { generatedAt: 'desc' },
        take: 8,
        include: {
          validationArtifacts: { orderBy: { evaluatedAt: 'desc' }, take: 1 },
          legs: {
            orderBy: { legIndex: 'asc' },
            include: {
              fixture: {
                include: { competition: true, homeTeam: true, awayTeam: true },
              },
              prediction: {
                select: {
                  id: true,
                  status: true,
                  confidence: true,
                  edge: true,
                },
              },
            },
          },
        },
      },
      validationArtifacts: {
        orderBy: { evaluatedAt: 'desc' },
        take: 8,
        include: {
          fixture: {
            include: { competition: true, homeTeam: true, awayTeam: true },
          },
          prediction: {
            include: {
              fixture: {
                include: { competition: true, homeTeam: true, awayTeam: true },
              },
            },
          },
          parlay: {
            include: {
              legs: { select: { id: true } },
            },
          },
        },
      },
    },
  })) as unknown;

  if (!row) return { error: 'not_found', message: `run ${id} not found` };
  return { kind: 'run', entity: mapRun(row, true) };
}

function filterStatusByKind(kind: DashboardTab, values: string[], metadata: DashboardMetadata): string[] {
  if (!values.length) return [];
  return values.filter((status) => metadata.statuses[kind].includes(status));
}

function buildFilters(query: ReturnType<typeof parseOverviewQuery>, dateWindow: DateWindow | undefined, statusFilter: string[]) {
  const fixtureFilter = buildFixtureFilter(query, dateWindow);
  return {
    fixtures: buildFixtureWhere(query, fixtureFilter, statusFilter),
    predictions: buildPredictionWhere(query, fixtureFilter, statusFilter),
    parlays: buildParlayWhere(query, fixtureFilter, statusFilter),
    validations: buildValidationWhere(query, fixtureFilter, statusFilter, dateWindow),
    runs: buildRunWhere(query, statusFilter, dateWindow),
  };
}

function buildFixtureWhere(
  query: ReturnType<typeof parseOverviewQuery>,
  fixtureFilter: QueryArgs | undefined,
  statusFilter: string[],
): QueryArgs {
  const clauses: QueryArgs[] = [];
  if (fixtureFilter) clauses.push(fixtureFilter);
  if (statusFilter.length) clauses.push({ status: inFilter(statusFilter) });
  if (query.runId) {
    clauses.push({
      OR: [
        { predictions: { some: { runId: query.runId } } },
        { parlayLegs: { some: { parlay: { runId: query.runId } } } },
        { validationArtifacts: { some: { runId: query.runId } } },
      ],
    });
  }

  const predictionClauses: QueryArgs[] = [];
  if (query.market) predictionClauses.push({ marketKey: query.market });
  if (query.qualities.length) predictionClauses.push({ quality: inFilter(query.qualities) });
  if (query.minConfidence !== undefined || query.maxConfidence !== undefined) {
    predictionClauses.push({ confidence: numberRange(query.minConfidence, query.maxConfidence) });
  }
  if (query.minEdge !== undefined || query.maxEdge !== undefined) {
    predictionClauses.push({ edge: numberRange(query.minEdge, query.maxEdge) });
  }
  if (predictionClauses.length) {
    const predictionWhere = predictionClauses.length === 1 ? predictionClauses[0] : { AND: predictionClauses };
    const relationClauses: QueryArgs[] = [{ predictions: { some: predictionWhere } }];
    if (query.market) relationClauses.push({ parlayLegs: { some: { marketKey: query.market } } });
    clauses.push(relationClauses.length === 1 ? relationClauses[0] as QueryArgs : { OR: relationClauses });
  }

  if (!clauses.length) return {};
  if (clauses.length === 1) return clauses[0] as QueryArgs;
  return { AND: clauses };
}

function buildPredictionWhere(
  query: ReturnType<typeof parseOverviewQuery>,
  fixtureFilter: QueryArgs | undefined,
  statusFilter: string[],
): QueryArgs {
  const where: QueryArgs = {};
  if (query.runId) where.runId = query.runId;
  if (statusFilter.length) where.status = inFilter(statusFilter);
  if (query.market) where.marketKey = query.market;
  if (query.qualities.length) where.quality = inFilter(query.qualities);
  if (query.minConfidence !== undefined || query.maxConfidence !== undefined) {
    where.confidence = numberRange(query.minConfidence, query.maxConfidence);
  }
  if (query.minEdge !== undefined || query.maxEdge !== undefined) {
    where.edge = numberRange(query.minEdge, query.maxEdge);
  }
  if (fixtureFilter) where.fixture = fixtureFilter;
  return where;
}

function buildParlayWhere(
  query: ReturnType<typeof parseOverviewQuery>,
  fixtureFilter: QueryArgs | undefined,
  statusFilter: string[],
): QueryArgs {
  const where: QueryArgs = {};
  if (query.runId) where.runId = query.runId;
  if (statusFilter.length) where.status = inFilter(statusFilter);
  if (query.minConfidence !== undefined || query.maxConfidence !== undefined) {
    where.aggregateConfidence = numberRange(query.minConfidence, query.maxConfidence);
  }
  const legWhere: QueryArgs = {};
  if (query.market) legWhere.marketKey = query.market;
  if (fixtureFilter) legWhere.fixture = fixtureFilter;
  if (Object.keys(legWhere).length > 0) where.legs = { some: legWhere };
  return where;
}

function buildValidationWhere(
  query: ReturnType<typeof parseOverviewQuery>,
  fixtureFilter: QueryArgs | undefined,
  statusFilter: string[],
  dateWindow: DateWindow | undefined,
): QueryArgs {
  const where: QueryArgs = {};
  if (query.runId) where.runId = query.runId;
  if (statusFilter.length) where.status = inFilter(statusFilter);
  if (dateWindow) where.evaluatedAt = dateRangeFilter(dateWindow);
  if (fixtureFilter) where.fixture = fixtureFilter;
  if (query.validationTarget === 'prediction') {
    where.predictionId = query.targetId ? query.targetId : { not: null };
    where.parlayId = null;
  }
  if (query.validationTarget === 'parlay') {
    where.parlayId = query.targetId ? query.targetId : { not: null };
    where.predictionId = null;
  }
  return where;
}

function buildRunWhere(
  query: ReturnType<typeof parseOverviewQuery>,
  statusFilter: string[],
  dateWindow: DateWindow | undefined,
): QueryArgs {
  const where: QueryArgs = {};
  if (query.runId) where.id = query.runId;
  if (statusFilter.length) where.status = inFilter(statusFilter);
  if (dateWindow) where.createdAt = dateRangeFilter(dateWindow);
  return where;
}

function buildFixtureFilter(
  query: ReturnType<typeof parseOverviewQuery>,
  dateWindow: DateWindow | undefined,
): QueryArgs | undefined {
  const clauses: QueryArgs[] = [];
  if (query.team) clauses.push({ OR: [{ homeTeamId: query.team }, { awayTeamId: query.team }] });
  if (query.competition) clauses.push({ competitionId: query.competition });
  if (dateWindow) clauses.push({ scheduledAt: dateRangeFilter(dateWindow) });
  if (query.fixtureStatuses.length) clauses.push({ status: inFilter(query.fixtureStatuses) });

  if (!clauses.length) return undefined;
  if (clauses.length === 1) return clauses[0] as QueryArgs;
  return { AND: clauses };
}

async function readActiveRows(
  db: DashboardDb,
  tab: DashboardTab,
  where: QueryArgs,
  sort: string,
  direction: DashboardDirection,
  skip: number,
  take: number,
) {
  const orderBy = buildOrderBy(tab, sort, direction);

  if (tab === 'fixtures') {
    const fixtures =
      (await db.fixture.findMany({
        where: where as unknown as Prisma.FixtureWhereInput,
        orderBy: orderBy as Prisma.FixtureFindManyArgs['orderBy'],
        skip,
        take,
        include: {
          competition: true,
          homeTeam: true,
          awayTeam: true,
          _count: {
            select: { predictions: true, parlayLegs: true, validationArtifacts: true },
          },
          predictions: {
            orderBy: { generatedAt: 'desc' },
            take: 1,
            include: {
              validationArtifacts: { orderBy: { evaluatedAt: 'desc' }, take: 1 },
            },
          },
          validationArtifacts: {
            orderBy: { evaluatedAt: 'desc' },
            take: 1,
            include: {
              prediction: {
                include: {
                  fixture: {
                    include: { competition: true, homeTeam: true, awayTeam: true },
                  },
                },
              },
              parlay: {
                include: {
                  legs: { select: { id: true } },
                },
              },
            },
          },
        },
      }) as unknown[]);

    return {
      fixtures: fixtures.map((row) => mapFixture(row, true) as DashboardFixtureRow),
      predictions: [],
      parlays: [],
      validations: [],
      runs: [],
    };
  }

  if (tab === 'predictions') {
    const predictions =
      (await db.prediction.findMany({
        where: where as unknown as Prisma.PredictionWhereInput,
        orderBy: orderBy as Prisma.PredictionFindManyArgs['orderBy'],
        skip,
        take,
        include: {
          fixture: {
            include: { competition: true, homeTeam: true, awayTeam: true },
          },
          validationArtifacts: { orderBy: { evaluatedAt: 'desc' }, take: 1 },
        },
      }) as unknown[]);

    return {
      fixtures: [],
      predictions: predictions.map((row) => mapPrediction(row)),
      parlays: [],
      validations: [],
      runs: [],
    };
  }

  if (tab === 'parlays') {
      const parlays =
      (await db.parlay.findMany({
        where: where as unknown as Prisma.ParlayWhereInput,
        orderBy: orderBy as Prisma.ParlayFindManyArgs['orderBy'],
        skip,
        take,
        include: {
          validationArtifacts: { orderBy: { evaluatedAt: 'desc' }, take: 1 },
          legs: {
            orderBy: { legIndex: 'asc' },
            include: {
              fixture: {
                include: { competition: true, homeTeam: true, awayTeam: true },
              },
              prediction: {
                select: {
                  id: true,
                  status: true,
                  confidence: true,
                  edge: true,
                },
              },
            },
          },
        },
      }) as unknown[]);

    return {
      fixtures: [],
      predictions: [],
      parlays: parlays.map((row) => mapParlay(row)),
      validations: [],
      runs: [],
    };
  }

  if (tab === 'validations') {
    const validations =
      (await db.validationArtifact.findMany({
        where: where as unknown as Prisma.ValidationArtifactWhereInput,
        orderBy: orderBy as Prisma.ValidationArtifactFindManyArgs['orderBy'],
        skip,
        take,
        include: {
          fixture: {
            include: { competition: true, homeTeam: true, awayTeam: true },
          },
          prediction: {
            include: {
              fixture: {
                include: { competition: true, homeTeam: true, awayTeam: true },
              },
            },
          },
          parlay: {
            include: {
              legs: {
                select: { id: true },
              },
            },
          },
        },
      }) as unknown[]);

    return {
      fixtures: [],
      predictions: [],
      parlays: [],
      validations: validations.map((row) => mapValidation(row)),
      runs: [],
    };
  }

  const runs = (await db.harnessRun.findMany({
    where: where as unknown as Prisma.HarnessRunWhereInput,
    orderBy: orderBy as Prisma.HarnessRunFindManyArgs['orderBy'],
    skip,
    take,
    include: {
      _count: {
        select: { tasks: true, artifacts: true, predictions: true, parlays: true, validationArtifacts: true },
      },
    },
  }) as unknown[]);

  return {
    fixtures: [],
    predictions: [],
    parlays: [],
    validations: [],
    runs: runs.map((row) => mapRun(row)),
  };
}

async function readStatusFacets(
  db: DashboardDb,
  tab: DashboardTab,
  where: ReturnType<typeof buildFilters>,
): Promise<Record<string, number>> {
  if (tab === 'fixtures') {
    const rows = (await (db.fixture as unknown as { groupBy: (query: unknown) => Promise<unknown[]> }).groupBy({
      by: ['status'],
      where: where.fixtures as unknown as Prisma.FixtureWhereInput,
      _count: { _all: true },
    })) as Array<{ status: string | null; _count: { _all: number | bigint } }>;
    return statusFacetFromRows(rows);
  }

  if (tab === 'predictions') {
    const rows = (await (db.prediction as unknown as { groupBy: (query: unknown) => Promise<unknown[]> }).groupBy({
      by: ['status'],
      where: where.predictions as unknown as Prisma.PredictionWhereInput,
      _count: { _all: true },
    })) as Array<{ status: string | null; _count: { _all: number | bigint } }>;
    return statusFacetFromRows(rows);
  }

  if (tab === 'parlays') {
    const rows = (await (db.parlay as unknown as { groupBy: (query: unknown) => Promise<unknown[]> }).groupBy({
      by: ['status'],
      where: where.parlays as unknown as Prisma.ParlayWhereInput,
      _count: { _all: true },
    })) as Array<{ status: string | null; _count: { _all: number | bigint } }>;
    return statusFacetFromRows(rows);
  }

  if (tab === 'validations') {
    const rows = (await (db.validationArtifact as unknown as { groupBy: (query: unknown) => Promise<unknown[]> }).groupBy({
      by: ['status'],
      where: where.validations as unknown as Prisma.ValidationArtifactWhereInput,
      _count: { _all: true },
    })) as Array<{ status: string | null; _count: { _all: number | bigint } }>;
    return statusFacetFromRows(rows);
  }

  const rows = (await (db.harnessRun as unknown as { groupBy: (query: unknown) => Promise<unknown[]> }).groupBy({
    by: ['status'],
    where: where.runs as unknown as Prisma.HarnessRunWhereInput,
    _count: { _all: true },
  })) as Array<{ status: string | null; _count: { _all: number | bigint } }>;
  return statusFacetFromRows(rows);
}

function toStatusFacetCount(raw: number | bigint): number {
  return typeof raw === 'bigint' ? Number(raw) : raw;
}

function statusFacetFromRows(rows: Array<{ status: string | null; _count: { _all: number | bigint } }>): Record<string, number> {
  const facets: Record<string, number> = {};
  for (const row of rows) {
    const status = toStringValue(row.status);
    if (!status) continue;
    const count = toStatusFacetCount(row._count._all);
    facets[status] = Number.isFinite(count) ? count : 0;
  }
  return facets;
}

async function countActive(db: DashboardDb, tab: DashboardTab, where: QueryArgs): Promise<number> {
  if (tab === 'fixtures') return db.fixture.count({ where });
  if (tab === 'predictions') return db.prediction.count({ where });
  if (tab === 'parlays') return db.parlay.count({ where });
  if (tab === 'validations') return db.validationArtifact.count({ where });
  return db.harnessRun.count({ where });
}

async function countAllTabs(db: DashboardDb, where: ReturnType<typeof buildFilters>): Promise<DashboardCounts> {
  return {
    fixtures: await db.fixture.count({ where: omitStatus(where.fixtures) }),
    predictions: await db.prediction.count({ where: omitStatus(where.predictions) }),
    parlays: await db.parlay.count({ where: omitStatus(where.parlays) }),
    validations: await db.validationArtifact.count({ where: omitStatus(where.validations) }),
    runs: await db.harnessRun.count({ where: omitStatus(where.runs) }),
  };
}

function omitStatus(where: QueryArgs): QueryArgs {
  const copied = { ...where };
  delete copied.status;
  return copied;
}

function resolveDateWindow(dateFrom: string | undefined, dateTo: string | undefined, timezone: string): DateWindow | undefined {
  if (!dateFrom && !dateTo) return undefined;
  const start = fixtureDateRange(dateFrom ?? dateTo ?? '', timezone).start;
  const end = fixtureDateRange(dateTo ?? dateFrom ?? '', timezone).end;
  return { start, end };
}

function dateRangeFilter(window: DateWindow): QueryArgs {
  return { gte: window.start, lt: window.end };
}

function buildOrderBy(tab: DashboardTab, sort: string, direction: DashboardDirection): Array<Record<string, Prisma.SortOrder>> {
  const safeSort = isAllowedSort(tab, sort) ? sort : DEFAULT_SORT_BY[tab];
  const safeDirection: Prisma.SortOrder = direction === 'asc' ? Prisma.SortOrder.asc : Prisma.SortOrder.desc;
  const candidate: Array<Record<string, Prisma.SortOrder>> = [{ [safeSort]: safeDirection }];

  if (safeSort !== 'id') {
    candidate.push({ id: safeDirection });
  }
  return candidate;
}

function isAllowedSort(tab: DashboardTab, sort: string): sort is string {
  return (SORTABLE_FIELDS[tab] as ReadonlyArray<string>).includes(sort);
}

function numberRange(min: number | undefined, max: number | undefined): QueryArgs {
  const range: QueryArgs = {};
  if (min !== undefined) range.gte = min;
  if (max !== undefined) range.lte = max;
  return range;
}

function inFilter(values: string[]): QueryArgs {
  return { in: values };
}

function mapPrediction(row: unknown): DashboardPredictionRow {
  const item = toRecord(row);
  const validationArtifacts = toArray(item.validationArtifacts);
  const latestValidation = validationArtifacts[0] ? mapValidation(validationArtifacts[0]) : null;

  return {
    id: toStringValue(item.id),
    runId: toNullableString(item.runId),
    fixture: mapFixture(item.fixture),
    marketKey: toStringValue(item.marketKey),
    selectionKey: toStringValue(item.selectionKey),
    line: toNumberOrNull(item.line),
    odds: toNumber(item.odds),
    impliedProbability: toNumber(item.impliedProbability),
    estimatedProbability: toNumberOrNull(item.estimatedProbability),
    edge: toNumberOrNull(item.edge),
    confidence: toNumber(item.confidence),
    quality: toStringValue(item.quality),
    status: toStringValue(item.status),
    rationale: toStringValue(item.rationaleRedacted),
    warnings: item.warnings ?? null,
    generatedAt: toDateString(item.generatedAt),
    latestValidation,
  };
}

function mapParlay(row: unknown): DashboardParlayRow {
  const item = toRecord(row);
  const validationArtifacts = toArray(item.validationArtifacts);
  const latestValidation = validationArtifacts[0] ? mapValidation(validationArtifacts[0]) : null;
  const legs = toArray(item.legs).map((leg) => mapParlayLeg(leg));

  return {
    id: toStringValue(item.id),
    runId: toNullableString(item.runId),
    combinedOdds: toNumberOrNull(item.combinedOdds),
    aggregateConfidence: toNumber(item.aggregateConfidence),
    aggregateQuality: toNumber(item.aggregateQuality),
    status: toStringValue(item.status),
    rationale: toStringValue(item.rationaleRedacted),
    warnings: item.warnings ?? null,
    generatedAt: toDateString(item.generatedAt),
    latestValidation,
    legs,
  };
}

function mapParlayLeg(row: unknown) {
  const item = toRecord(row);
  const prediction = toRecord(item.prediction);

  return {
    id: toStringValue(item.id),
    legIndex: toInteger(item.legIndex),
    predictionId: toStringValue(item.predictionId),
    fixture: mapFixture(item.fixture),
    marketKey: toStringValue(item.marketKey),
    selectionKey: toStringValue(item.selectionKey),
    line: toNumberOrNull(item.line),
    odds: toNumber(item.odds),
    status: toStringValue(item.status),
    inclusionReason: toNullableString(item.inclusionReason),
    predictionStatus: toNullableString(prediction.status),
    confidence: toNumberOrNull(prediction.confidence),
    edge: toNumberOrNull(prediction.edge),
  };
}

function mapValidation(row: unknown): DashboardValidationRow {
  const item = toRecord(row);

  return {
    id: toStringValue(item.id),
    runId: toNullableString(item.runId),
    predictionId: toNullableString(item.predictionId),
    parlayId: toNullableString(item.parlayId),
    target: mapValidationTarget(item),
    fixture: mapFixture(item.fixture),
    status: toStringValue(item.status),
    reason: toNullableString(item.reason),
    evaluatedAt: toNullableDateString(item.evaluatedAt),
    createdAt: toDateString(item.createdAt),
    outcome: item.outcome,
    settlementRuleVersion: toStringValue(item.settlementRuleVersion),
  };
}

function mapValidationTarget(item: Record<string, unknown>) {
  const parlayId = toNullableString(item.parlayId);
  const predictionId = toNullableString(item.predictionId);

  if (parlayId) {
    return {
      kind: 'parlay' as const,
      id: parlayId,
      label: 'Parlay',
      summary: formatParlayTargetSummary(item.parlay),
    };
  }

  if (predictionId) {
    return {
      kind: 'prediction' as const,
      id: predictionId,
      label: 'Atómica',
      summary: formatPredictionTargetSummary(item.prediction, item.fixture),
    };
  }

  return {
    kind: 'unknown' as const,
    id: null,
    label: 'Sin objetivo',
    summary: null,
  };
}

function formatPredictionTargetSummary(predictionRaw: unknown, fallbackFixtureRaw: unknown): string | null {
  const prediction = toRecord(predictionRaw);
  const marketKey = toNullableString(prediction.marketKey);
  const selectionKey = toNullableString(prediction.selectionKey);
  if (!marketKey || !selectionKey) return null;

  const match = formatFixtureMatch(prediction.fixture ?? fallbackFixtureRaw);
  const line = toNumberOrNull(prediction.line);
  const selection = line === null ? selectionKey : `${selectionKey} ${line}`;
  const parts = [match, marketKey, selection].filter((value): value is string => Boolean(value));
  return parts.length ? parts.join(' · ') : null;
}

function formatParlayTargetSummary(parlayRaw: unknown): string | null {
  const parlay = toRecord(parlayRaw);
  const legs = toArray(parlay.legs);
  if (!legs.length) return null;
  return `Parlay de ${legs.length} legs`;
}

function formatFixtureMatch(raw: unknown): string | null {
  if (!raw) return null;
  const fixture = toRecord(raw);
  const homeTeam = toRecord(fixture.homeTeam);
  const awayTeam = toRecord(fixture.awayTeam);
  const home = toNullableString(homeTeam.name);
  const away = toNullableString(awayTeam.name);
  if (!home || !away) return null;
  return `${home} vs ${away}`;
}

function mapRun(row: unknown, includeActivity = false): DashboardRunRow {
  const item = toRecord(row);
  const counts = toRecord(item._count);
  const run: DashboardRunRow = {
    id: toStringValue(item.id),
    runtime: toStringValue(item.runtime),
    profile: toStringValue(item.profile),
    providerSports: toStringValue(item.providerSports),
    providerAgentic: toNullableString(item.providerAgentic),
    model: toNullableString(item.model),
    status: toStringValue(item.status),
    verdict: toNullableString(item.verdict),
    artifactDir: toNullableString(item.artifactDir),
    startedAt: toNullableDateString(item.startedAt),
    completedAt: toNullableDateString(item.completedAt),
    createdAt: toDateString(item.createdAt),
    taskCount: toIntegerOrUndefined(counts.tasks),
    artifactCount: toIntegerOrUndefined(counts.artifacts),
    predictionCount: toIntegerOrUndefined(counts.predictions),
    parlayCount: toIntegerOrUndefined(counts.parlays),
    validationCount: toIntegerOrUndefined(counts.validationArtifacts),
  };

  if (includeActivity) {
    run.recentPredictions = toArray(item.predictions).map((prediction) => mapPrediction(prediction));
    run.recentParlays = toArray(item.parlays).map((parlay) => mapParlay(parlay));
    run.recentValidations = toArray(item.validationArtifacts).map((validation) => mapValidation(validation));
  }

  return run;
}

function mapPredictionSummary(raw: unknown) {
  const item = toRecord(raw);
  return {
    id: toStringValue(item.id),
    runId: toNullableString(item.runId),
    marketKey: toStringValue(item.marketKey),
    selectionKey: toStringValue(item.selectionKey),
    line: toNumberOrNull(item.line),
    odds: toNumber(item.odds),
    edge: toNumberOrNull(item.edge),
    confidence: toNumber(item.confidence),
    quality: toStringValue(item.quality),
    status: toStringValue(item.status),
    generatedAt: toDateString(item.generatedAt),
  };
}

function mapFixture(raw: unknown, includeActivity = false): DashboardFixtureRow | null {
  const item = toRecord(raw);
  if (!raw) return null;

  const competition = toRecord(item.competition);
  const homeTeam = toRecord(item.homeTeam);
  const awayTeam = toRecord(item.awayTeam);
  const counts = toRecord(item._count);
  const recentPredictions = includeActivity ? toArray(item.predictions).map((prediction) => mapPredictionSummary(prediction)) : [];
  const recentParlayLegs = includeActivity ? toArray(item.parlayLegs).map((leg) => mapParlayLeg(leg)) : [];
  const recentValidations = includeActivity ? toArray(item.validationArtifacts).map((validation) => mapValidation(validation)) : [];

  const fixture: DashboardFixtureRow = {
    id: toStringValue(item.id),
    providerFixtureId: toStringValue(item.providerFixtureId),
    season: toIntegerOrNull(item.season),
    scheduledAt: toNullableDateString(item.scheduledAt),
    status: toStringValue(item.status),
    scoreHome: toNumberOrNull(item.scoreHome),
    scoreAway: toNumberOrNull(item.scoreAway),
    competition: item.competition
      ? {
        id: toStringValue(competition.id),
        name: toStringValue(competition.name),
        country: toNullableString(competition.country),
      }
      : null,
    homeTeam: item.homeTeam
      ? {
        id: toStringValue(homeTeam.id),
        name: toStringValue(homeTeam.name),
      }
      : null,
    awayTeam: item.awayTeam
      ? {
        id: toStringValue(awayTeam.id),
        name: toStringValue(awayTeam.name),
      }
      : null,
    predictionCount: toIntegerOrUndefined(counts.predictions),
    parlayLegCount: toIntegerOrUndefined(counts.parlayLegs),
    validationCount: toIntegerOrUndefined(counts.validationArtifacts),
    latestPrediction: recentPredictions[0] ?? null,
    latestValidation: recentValidations[0] ?? null,
  };

  if (includeActivity) {
    fixture.recentPredictions = recentPredictions;
    fixture.recentParlayLegs = recentParlayLegs;
    fixture.recentValidations = recentValidations;
  }

  return fixture;
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}


function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toInteger(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toIntegerOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = toInteger(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIntegerOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = toInteger(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
    const parsed = Number.parseFloat(value.toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateString(value: unknown): string {
  const date = toDateOrNull(value);
  return date ? date.toISOString() : '';
}

function toNullableDateString(value: unknown): string | null {
  const date = toDateOrNull(value);
  return date ? date.toISOString() : null;
}

function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(html);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(toPlain(body)));
}

function toPlain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (typeof item === 'bigint') return item.toString();
    if (item && typeof item === 'object' && typeof item.toString === 'function' && item.constructor?.name === 'Decimal') {
      return Number(item.toString());
    }
    return item;
  }));
}
