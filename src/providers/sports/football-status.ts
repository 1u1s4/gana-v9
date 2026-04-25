import { buildStatusReport, pickFirstConfiguredValue, type ServiceStatusReport } from '../../filters/status.js';

export interface FootballProviderStatusConfig {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  token?: string;
  season?: string | number;
  league?: string | number;
}

export type FootballStatusConfig = {
  apiFootballKey?: string;
  apiFootballBaseUrl?: string;
  football?: FootballProviderStatusConfig;
  sports?: {
    football?: FootballProviderStatusConfig;
  };
  providers?: {
    sports?: {
      football?: FootballProviderStatusConfig;
    };
  };
};

export function getFootballStatus(config: FootballStatusConfig = {}): ServiceStatusReport {
  const football = config.sports?.football ?? config.providers?.sports?.football ?? config.football ?? {};
  const provider = pickFirstConfiguredValue(football.provider, config.apiFootballBaseUrl ? 'api-football' : undefined);
  const credential = pickFirstConfiguredValue(config.apiFootballKey, football.apiKey, football.token);

  return buildStatusReport({
    service: 'providers.sports.football',
    requirements: [
      { key: 'provider', value: provider },
      { key: 'credential', value: credential },
    ],
    readyWhenConfigured: true,
    config: {
      apiFootballKey: config.apiFootballKey,
      apiFootballBaseUrl: config.apiFootballBaseUrl,
      provider: football.provider,
      baseUrl: football.baseUrl,
      apiKey: football.apiKey,
      token: football.token,
      season: football.season,
      league: football.league,
    },
    missingMessage: 'Football provider configuration is missing required provider or credential values.',
    readyMessage: 'Football provider configuration is present, but execution is not implemented yet.',
  });
}

export const getSportsFootballStatus = getFootballStatus;
