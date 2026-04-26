# Filtros, Fixtures y Low Odds

## Objetivo

Implementar busqueda deportiva controlada desde TUI/CLI: presets de ligas/equipos, mercados, temporada, ventana operativa, threshold default `1.20`, discovery de fixtures y scan de cuotas bajas.

## SRS cubierto

- Secciones 2.5, 3.1, 6.3, 6.4, 9.
- Secciones 11 RF-004, RF-005, RF-006, RF-008.
- Secciones 13.2, 13.3, 13.4.

## Contexto actual

No existen `src/filters`, entidades deportivas ni comandos `/filters`, `/leagues`, `/teams`, `/threshold`, `/fixtures`, `/low-odds`. La TUI actual solo despacha comandos agentic.

## Cambios requeridos

### Modulos nuevos

- `src/filters/types.ts`
- `src/filters/config.ts`
- `src/filters/presets.ts`
- `src/filters/engine.ts`
- `src/filters/low-odds.ts`

Este plan no crea `src/domain/*`. Debe consumir `Fixture`, `MarketKey`, `MarketSelection` y `OddsQuote` definidos por `06-domain-mercados-y-settlement.md`.

### Config de filtros

```ts
type ApiFootballFilterConfig = {
  defaultSeason: number;
  defaultLeagues: ApiFootballLeagueRef[];
  defaultTeams: ApiFootballTeamRef[];
  defaultMarkets: MarketKey[];
  lowOddsThreshold: number;
  kickoffWindowHours: number;
  includeLiveFixtures: boolean;
  includeCompletedFixtures: boolean;
  maxFixturesPerRun: number;
  bookmakerAllowlist?: string[];
};
```

Defaults:

- `defaultLeagues`: `[]`
- `defaultTeams`: `[]`
- `defaultMarkets`: `h2h`, `double_chance`, `goals_over_under`, `corners_over_under`, `btts`
- `lowOddsThreshold`: `1.2`
- `kickoffWindowHours`: `36`
- `includeLiveFixtures`: `false`
- `includeCompletedFixtures`: `false`
- `maxFixturesPerRun`: `80`

### Reglas de combinacion

- `date` es obligatorio para scans diarios.
- `leagueIds` limita por liga.
- `teamIds` limita por equipo local o visitante.
- Si hay ligas y equipos:
  - default discovery: `OR`.
  - run focalizado: permitir `AND`.
- `markets` limita odds consultadas.
- `threshold` usa comparacion `lte`.
- `bookmakerAllowlist` limita bookmakers.
- `maxFixturesPerRun` protege cuota y rendimiento.

### Razones de inclusion/exclusion

Todo fixture/hit debe registrar razones:

- `included-by-default-league`
- `included-by-default-team`
- `included-by-low-odds-threshold`
- `included-by-manual-query`
- `excluded-missing-odds`
- `excluded-market-not-available`
- `excluded-above-threshold`
- `excluded-outside-window`
- `excluded-provider-rate-limit`
- `excluded-max-fixtures-reached`

### Comandos slash

Agregar en `src/commands.ts` o separar registry:

- `/filters`
- `/leagues`
- `/teams`
- `/threshold`
- `/fixtures`
- `/low-odds`

Comportamiento:

- `/filters`: muestra filtros activos y preset seleccionado.
- `/leagues`: lista presets; `add ID "Name" Country`; `remove ID`.
- `/teams`: lista presets; `add ID "Name" league:ID`; `remove ID`.
- `/threshold`: muestra/cambia threshold.
- `/fixtures today leagues:default`: lista fixtures normalizados.
- `/low-odds today threshold:1.20`: ejecuta scan y muestra hits.

### CLI headless

Agregar parser para:

```bash
pnpm gana filters show
pnpm gana leagues list
pnpm gana leagues add --id 39 --name "Premier League" --country England
pnpm gana leagues remove --id 39
pnpm gana teams list
pnpm gana teams add --id 33 --name "Manchester United" --league 39
pnpm gana teams remove --id 33
pnpm gana fixtures --date YYYY-MM-DD
pnpm gana fixtures --date YYYY-MM-DD --leagues default
pnpm gana fixtures --date YYYY-MM-DD --teams default
pnpm gana scan low-odds --date YYYY-MM-DD --threshold 1.20
```

### Persistencia

Usar DB para:

- presets de ligas;
- presets de equipos;
- filtros usados por run;
- low odds scans;
- low odds hits;
- odds snapshots relacionados;
- razones de inclusion/exclusion.

No depender solo de `agent.config.json` para presets productivos; config file puede ser bootstrap/default, DB es fuente durable.

## UI/TUI

La TUI debe mostrar:

- filtros activos;
- ligas/equipos default;
- threshold;
- fixtures visibles;
- estado de elegibilidad;
- low odds hits con fixture, liga, hora, market, selection, odds, implied probability, bookmaker y reasons.

## Criterios de aceptacion

- `/threshold` muestra default `1.20`.
- `/leagues add/remove` y `/teams add/remove` persisten presets.
- `/fixtures today` consulta API-Football y persiste fixtures.
- `/low-odds today` consulta odds y produce `LowOddsScan` + `LowOddsHit`.
- Cada hit enlaza odds snapshot/quote y razones.
- El scan respeta `maxFixturesPerRun`.
- Si faltan odds o market, se registra exclusion legible.
- `npm run typecheck` pasa.

## Pruebas

- Unit tests de filter engine para `AND`, `OR`, date, league, team, market, threshold.
- Unit tests de reasons de inclusion/exclusion.
- Unit tests de implied probability.
- Integration tests con API-Football mocked.
- Smoke manual:
  - `pnpm gana leagues add --id 39 --name "Premier League" --country England`
  - `pnpm gana fixtures --date YYYY-MM-DD --leagues default`
  - `pnpm gana scan low-odds --date YYYY-MM-DD --threshold 1.20`

## Riesgos

- Scans amplios pueden agotar cuota. Aplicar limites antes de pedir odds.
- Equipos pueden compartir nombres; usar IDs de provider como fuente.
- Una cuota baja `<= 1.20` es un filtro de descubrimiento, no una recomendacion automatica ni una senal de promocion.
