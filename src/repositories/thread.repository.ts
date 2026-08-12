import { ExternalId } from "./graph.repository";

export interface ThreadEdge {
  from: ExternalId;
  to: ExternalId;
}

export interface ButhcOfThreadEdges {
  edges: ThreadEdge[];
  nextCursor: ExternalId | null;
}

export interface ThreadKeyDto {
  externalId: ExternalId;
  threadKey: string;
}

export interface ThreadRepository {
  updateThreads(threadKeyDto: ThreadKeyDto[]): Promise<void>;

  getThreadEdgesBatch(
    cursot: ExternalId | null,
    limit: number,
  ): Promise<ButhcOfThreadEdges>;
}
