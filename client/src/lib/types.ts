import type { UIDataTypes, UIMessage } from 'ai';
import type { ChartSpec, CurrentWeather } from '@wwa/shared';

/** Mirrors the server's AnswerMetadata. */
export interface AnswerMetadata {
  createdAt?: string;
  model?: string;
  provider?: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  staleData?: boolean;
}

/** Tool parts as the client sees them; only the shapes the UI renders are typed precisely. */
type Tools = {
  find_place: { input: { query: string }; output: { matches: { name: string; population: number | null }[] } };
  get_current: { input: { place: string }; output: CurrentWeather & { alternatives: string[]; stale: boolean } };
  get_forecast: { input: { place: string; granularity: 'daily' | 'hourly'; days?: number; hours?: number }; output: Record<string, unknown> };
  get_history: {
    input: { place: string; start_date: string; end_date: string; granularity?: string; compare_to_normal?: boolean };
    output: Record<string, unknown>;
  };
  get_air_quality: { input: { place: string; days?: number }; output: Record<string, unknown> };
  show_chart: { input: { kind: string; dataset_ids: string[]; metric?: string }; output: ChartSpec };
};

export type ChatMessage = UIMessage<AnswerMetadata, UIDataTypes, Tools>;
export type MessagePart = ChatMessage['parts'][number];
