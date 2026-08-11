export type ExternalId = string;

export interface GraphMessage {
  id: ExternalId;
  references: ExternalId[];
  inReplyTo: ExternalId | null;
}

export interface GraphMessageBatch {
  messages: GraphMessage[];
  existingsIds: Set<ExternalId>;
  nextCursor: string | null;
}

export interface ParentIdMessage {
  id: ExternalId;
  parentId: ExternalId | null;
}

export interface GraphRepository {
  getMessageBatch(
    cursor: string | null,
    limit: number,
  ): Promise<GraphMessageBatch>;

  saveMessageBatch(batch: ParentIdMessage[]): Promise<void>;
}
