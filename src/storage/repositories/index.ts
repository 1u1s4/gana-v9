import type { StoragePrismaClient } from '../types.js';
import { createCatalogRepositories } from './catalog.js';
import { createLowOddsRepositories } from './low-odds.js';
import { createPresetRepositories } from './presets.js';
import { createRuntimeRepositories } from './runtime.js';
import { createSnapshotRepositories } from './snapshots.js';

export * from './catalog.js';
export * from './low-odds.js';
export * from './presets.js';
export * from './runtime.js';
export * from './snapshots.js';

export function createStorageRepositories(db: StoragePrismaClient) {
  return {
    ...createCatalogRepositories(db),
    ...createSnapshotRepositories(db),
    ...createRuntimeRepositories(db),
    ...createPresetRepositories(db),
    ...createLowOddsRepositories(db),
  };
}
