# Domain, Mercados y Settlement

## Objetivo

Definir el dominio deportivo minimo para Gana v9 y las reglas versionadas de settlement para los mercados iniciales: `h2h`, `double_chance`, `goals_over_under`, `corners_over_under`, `btts`.

Aunque este archivo conserve el numero `06`, su contenido debe ejecutarse temprano, antes de API-Football y filtros. Es el dueno unico de `src/domain/*` y de `src/validation/settlement-rules.ts`.

## SRS cubierto

- Secciones 8.3, 11 RF-010, RF-012.
- Secciones 12, 13.1, 13.5, 13.6, 13.7.
- Seccion 17.5.

## Contexto actual

No existen `src/domain`, `src/prediction`, `src/parlay` ni `src/validation`. Los nombres y reglas de mercado deben quedar estables antes de construir scoring, parlays y validation.

Tambien deben quedar estables antes de mapear API-Football y antes de implementar low-odds, porque ambos necesitan `MarketKey`, selections y lineas canonicas.

## Modulos nuevos

- `src/domain/ids.ts`
- `src/domain/fixtures.ts`
- `src/domain/teams.ts`
- `src/domain/competitions.ts`
- `src/domain/markets.ts`
- `src/domain/odds.ts`
- `src/validation/settlement-rules.ts`
- `src/validation/types.ts`

`src/validation/types.ts` contiene solo tipos base de settlement y validation status compartidos. La orquestacion, fetching de resultados y persistencia de `ValidationArtifact` pertenecen al plan 08.

## Tipos base

```ts
type MarketKey =
  | 'h2h'
  | 'double_chance'
  | 'goals_over_under'
  | 'corners_over_under'
  | 'btts';

type MarketSelection = {
  market: MarketKey;
  selection: string;
  line?: number;
  odds: number;
  impliedProbability: number;
  sourceSnapshotId: string;
};
```

Agregar tambien `OddsQuote` canonico para que API-Football, filtros y scoring no inventen formas paralelas:

```ts
type OddsQuote = {
  fixtureId: string;
  market: MarketKey;
  selection: string;
  line?: number;
  price: number;
  impliedProbability: number;
  bookmaker?: string;
  capturedAt: string;
  sourceSnapshotId: string;
};
```

`Fixture` debe incluir:

- internal id;
- provider;
- provider fixture id;
- competition/league;
- season;
- home/away team ids;
- scheduledAt;
- status;
- scoreHome/scoreAway;
- includedByFilters;
- timestamps.

## Reglas de mercado

### `h2h`

Selections:

- `home`
- `draw`
- `away`

Settlement:

- `home`: gana local.
- `draw`: empate.
- `away`: gana visitante.

### `double_chance`

Selections:

- `home_or_draw`
- `home_or_away`
- `draw_or_away`

Settlement:

- `home_or_draw`: local gana o empata.
- `home_or_away`: cualquier equipo gana, no empate.
- `draw_or_away`: visitante gana o empata.

### `goals_over_under`

Selections:

- `over` con linea numerica.
- `under` con linea numerica.

Settlement:

- usa goles totales del resultado final.
- si total == linea, `push`.
- si resultado final no esta disponible, `pending` o `blocked` segun contexto.

### `corners_over_under`

Selections:

- `over` con linea numerica.
- `under` con linea numerica.

Settlement:

- usa total de corners desde estadisticas finales del provider.
- si corners no estan disponibles, `blocked` con `corners-statistics-unavailable`.
- no inferir corners desde texto no verificable.

### `btts`

Selections:

- `yes`
- `no`

Settlement:

- `yes`: ambos equipos anotan al menos un gol.
- `no`: al menos un equipo termina con cero goles.

## Versionado

Crear `SettlementRuleVersion`:

```ts
const SETTLEMENT_RULE_VERSION = 'settlement-v1';
```

Cada `ValidationArtifact` debe guardar:

- `settlementRuleVersion`;
- inputs usados;
- result snapshot;
- status;
- evaluatedAt;
- degradation/error reason.

## Validaciones de input

Implementar validadores:

- market conocido;
- selection valida para market;
- line requerida para over/under;
- odds decimal > 1;
- implied probability entre 0 y 1;
- fixture status compatible con settlement;
- resultado final presente cuando se requiere.

Usar Zod si encaja con las dependencias actuales.

## Integracion con API-Football

Los mappers de API-Football deben traducir markets nativos al `MarketKey` canonico. Si un market no se puede mapear, registrar `mapping_error` y no inventar equivalencias.

## Criterios de aceptacion

- Existe una sola definicion canonica de `MarketKey`.
- Existe una sola definicion canonica de `Fixture` y `OddsQuote`.
- Todos los mercados iniciales tienen selections validas y settlement versionado.
- API-Football, filtros, scoring, parlay y validation usan estos tipos, no strings ad hoc.
- `corners_over_under` bloquea si faltan estadisticas.
- `goals_over_under` maneja push.
- `npm run typecheck` pasa.

## Pruebas

- Unit tests de settlement:
  - home win/draw/away win;
  - double chance;
  - over/under con win/loss/push;
  - corners missing => blocked;
  - btts yes/no.
- Unit tests de validacion de market/selection/line.
- Unit tests de mapper API-Football a `MarketKey` con payloads fixtures.

## Riesgos

- Bookmakers pueden usar nombres distintos para el mismo mercado. Resolver en mapper con tabla explicita y tests.
- No ampliar mercados antes de estabilizar el MVP; nuevos markets requieren version de reglas.
