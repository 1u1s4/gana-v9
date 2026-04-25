import { buildStatusReport, pickFirstConfiguredValue, type ServiceStatusReport } from '../filters/status.js';

export interface DatabaseStatusConfig {
  url?: string;
  databaseUrl?: string;
  connectionString?: string;
  directUrl?: string;
  serviceRoleKey?: string;
  anonKey?: string;
}

export type DbStatusConfig = {
  databaseUrl?: string;
  database?: DatabaseStatusConfig;
  db?: DatabaseStatusConfig;
  storage?: {
    database?: DatabaseStatusConfig;
  };
};

export function getDbStatus(config: DbStatusConfig = {}): ServiceStatusReport {
  const database = config.database ?? config.storage?.database ?? config.db ?? {};
  const connection = pickFirstConfiguredValue(
    config.databaseUrl,
    database.url,
    database.databaseUrl,
    database.connectionString,
    database.directUrl,
  );

  return buildStatusReport({
    service: 'storage.db',
    requirements: [{ key: 'connection', value: connection }],
    config: {
      databaseUrl: config.databaseUrl,
      url: database.url,
      nestedDatabaseUrl: database.databaseUrl,
      connectionString: database.connectionString,
      directUrl: database.directUrl,
      serviceRoleKey: database.serviceRoleKey,
      anonKey: database.anonKey,
    },
    configuredMessage: 'Database configuration is present; connectivity is not checked by the skeleton status service.',
  });
}

export const getDatabaseStatus = getDbStatus;
