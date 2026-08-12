export interface ExportedData {
  external_id: string;
  thread_key: string | null;
  parent_id: string | null;
  sent_at: string | null;
  subject: string | null;
}

export interface ExportedDataBatch {
  data: ExportedData[];
  nextCursor: string | null;
}

export interface ExporterDataRepository {
  getBatch(cursor: string | null, limit: number): Promise<ExportedDataBatch>;
}
