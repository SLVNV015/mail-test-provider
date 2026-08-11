import { Page } from "../provider/schema";

export interface TraversalState {
  nextCursor: string | null;
  complited: boolean;
}

export interface MessageRepository {
  getState(): Promise<TraversalState>;
  savePage(page: Page): Promise<void>;
}
