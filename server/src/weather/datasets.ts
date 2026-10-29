import { LRUCache } from 'lru-cache';
import { createIdGenerator } from 'ai';
import type { Dataset } from './openmeteo';

/**
 * Datasets fetched by the data tools, kept on the server so `show_chart` can refer to them by id.
 * The model only ever sees summaries; full series never pass through it.
 */
const store = new LRUCache<string, Dataset>({ max: 1000, ttl: 6 * 3600_000 });
const newId = createIdGenerator({ prefix: 'ds', size: 8 });

export function saveDataset(data: Omit<Dataset, 'id'>): Dataset {
  const dataset = { ...data, id: newId() };
  store.set(dataset.id, dataset);
  return dataset;
}

export function getDataset(id: string): Dataset | undefined {
  return store.get(id);
}
