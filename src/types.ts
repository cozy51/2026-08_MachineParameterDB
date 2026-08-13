export type Parameter = {
  id: string; number: string; standardValue: string; unit: string; name: string;
  detail: string; unitCategory: string; note: string; extra?: Record<string, unknown>;
};
export type Override = Partial<Omit<Parameter, 'id' | 'number'>>;
export type Model = { id: string; name: string; overrides: Record<string, Override> };
export type Series = { id: string; name: string; description: string; models: Model[]; parameters: Parameter[] };
export type ResolvedParameter = Parameter & { override: Override; changedFields: string[] };
export type BackupEnvelope = { schemaVersion: 1; dataVersion: number; updatedAt: string; deviceId: string; data: { series: Series[] } };
