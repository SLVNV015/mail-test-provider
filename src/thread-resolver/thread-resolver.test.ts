import { describe, it, expect, beforeEach, vi } from "vitest";
import type pino from "pino";
import { ThreadResolver } from "./thread-resolver.js";
import { ExternalId } from "../repositories/graph.repository.js";
import { ThreadRepository } from "../repositories/thread.repository.js";

describe("ThreadResolver", () => {
  let threadResolver: ThreadResolver;
  let mockThreadRepository: ThreadRepository;
  let mockLogger: pino.Logger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as pino.Logger;

    mockThreadRepository = {
      getThreadEdgesBatch: vi.fn(),
      getMessageIdsBatch: vi.fn(),
      updateThreads: vi.fn(),
    } as unknown as ThreadRepository;

    threadResolver = new ThreadResolver(mockThreadRepository, mockLogger);
  });

  describe("fillDsu", () => {
    it("должен обработать пустой батч и завершиться", async () => {
      vi.spyOn(mockThreadRepository, "getThreadEdgesBatch").mockResolvedValue({
        edges: [],
        nextCursor: null,
      });

      await threadResolver.fillDsu();

      expect(mockThreadRepository.getThreadEdgesBatch).toHaveBeenCalledWith(
        null,
        2000,
      );
    });

    it("должен обработать один батч edges", async () => {
      const edges = [
        { from: "msg1" as ExternalId, to: "msg2" as ExternalId },
        { from: "msg2" as ExternalId, to: "msg3" as ExternalId },
      ];

      vi.spyOn(
        mockThreadRepository,
        "getThreadEdgesBatch",
      ).mockResolvedValueOnce({
        edges,
        nextCursor: null,
      });

      await threadResolver.fillDsu();

      expect(mockThreadRepository.getThreadEdgesBatch).toHaveBeenCalledTimes(1);
    });

    it("должен обработать несколько батчей", async () => {
      const batch1 = [{ from: "msg1" as ExternalId, to: "msg2" as ExternalId }];
      const batch2 = [{ from: "msg3" as ExternalId, to: "msg4" as ExternalId }];

      vi.spyOn(mockThreadRepository, "getThreadEdgesBatch")
        .mockResolvedValueOnce({
          edges: batch1,
          nextCursor: "cursor1" as ExternalId,
        })
        .mockResolvedValueOnce({
          edges: batch2,
          nextCursor: null,
        });

      await threadResolver.fillDsu();

      expect(mockThreadRepository.getThreadEdgesBatch).toHaveBeenCalledTimes(2);
      expect(mockThreadRepository.getThreadEdgesBatch).toHaveBeenNthCalledWith(
        1,
        null,
        2000,
      );
      expect(mockThreadRepository.getThreadEdgesBatch).toHaveBeenNthCalledWith(
        2,
        "cursor1",
        2000,
      );
    });
  });

  describe("resolveThreads", () => {
    it("должен обработать пустой батч сообщений", async () => {
      vi.spyOn(mockThreadRepository, "getMessageIdsBatch").mockResolvedValue({
        messages: [],
        nextCursor: null,
      });

      await threadResolver.resolveThreads();

      expect(mockThreadRepository.getMessageIdsBatch).toHaveBeenCalledWith(
        null,
        2000,
      );
      expect(mockThreadRepository.updateThreads).not.toHaveBeenCalled();
    });

    it("должен обработать батч сообщений и обновить thread keys", async () => {
      const messages = ["msg1" as ExternalId, "msg2" as ExternalId];

      vi.spyOn(mockThreadRepository, "getThreadEdgesBatch").mockResolvedValue({
        edges: [],
        nextCursor: null,
      });

      vi.spyOn(
        mockThreadRepository,
        "getMessageIdsBatch",
      ).mockResolvedValueOnce({
        messages,
        nextCursor: null,
      });

      const updateThreadsSpy = vi.spyOn(mockThreadRepository, "updateThreads");

      await threadResolver.fillDsu();
      await threadResolver.resolveThreads();

      expect(updateThreadsSpy).toHaveBeenCalledWith([
        { externalId: "msg1", threadKey: "msg1" },
        { externalId: "msg2", threadKey: "msg2" },
      ]);
    });

    it("должен правильно объединить сообщения в треды через DSU", async () => {
      const edges = [
        { from: "msg1" as ExternalId, to: "msg2" as ExternalId },
        { from: "msg2" as ExternalId, to: "msg3" as ExternalId },
      ];

      const messages = [
        "msg1" as ExternalId,
        "msg2" as ExternalId,
        "msg3" as ExternalId,
      ];

      vi.spyOn(mockThreadRepository, "getThreadEdgesBatch")
        .mockResolvedValueOnce({
          edges,
          nextCursor: null,
        })
        .mockResolvedValueOnce({
          edges: [],
          nextCursor: null,
        });

      vi.spyOn(mockThreadRepository, "getMessageIdsBatch")
        .mockResolvedValueOnce({
          messages,
          nextCursor: null,
        })
        .mockResolvedValueOnce({
          messages: [],
          nextCursor: null,
        });

      const updateThreadsSpy = vi.spyOn(mockThreadRepository, "updateThreads");

      await threadResolver.fillDsu();
      await threadResolver.resolveThreads();

      const updates = updateThreadsSpy.mock.calls[0][0];
      const threadKeys = new Set(updates.map((u) => u.threadKey));

      expect(threadKeys.size).toBe(1);
      expect(updates).toHaveLength(3);
    });

    it("должен обработать несколько батчей сообщений", async () => {
      const batch1 = ["msg1" as ExternalId];
      const batch2 = ["msg2" as ExternalId];

      vi.spyOn(mockThreadRepository, "getThreadEdgesBatch").mockResolvedValue({
        edges: [],
        nextCursor: null,
      });

      vi.spyOn(mockThreadRepository, "getMessageIdsBatch")
        .mockResolvedValueOnce({
          messages: batch1,
          nextCursor: "cursor1" as ExternalId,
        })
        .mockResolvedValueOnce({
          messages: batch2,
          nextCursor: null,
        });

      await threadResolver.fillDsu();
      await threadResolver.resolveThreads();

      expect(mockThreadRepository.updateThreads).toHaveBeenCalledTimes(2);
    });
  });

  describe("интеграция fillDsu и resolveThreads", () => {
    it("должен создать отдельные треды для несвязанных сообщений", async () => {
      const edges = [
        { from: "msg1" as ExternalId, to: "msg2" as ExternalId },
        { from: "msg3" as ExternalId, to: "msg4" as ExternalId },
      ];

      const messages = [
        "msg1" as ExternalId,
        "msg2" as ExternalId,
        "msg3" as ExternalId,
        "msg4" as ExternalId,
      ];

      vi.spyOn(mockThreadRepository, "getThreadEdgesBatch")
        .mockResolvedValueOnce({
          edges,
          nextCursor: null,
        })
        .mockResolvedValueOnce({
          edges: [],
          nextCursor: null,
        });

      vi.spyOn(mockThreadRepository, "getMessageIdsBatch")
        .mockResolvedValueOnce({
          messages,
          nextCursor: null,
        })
        .mockResolvedValueOnce({
          messages: [],
          nextCursor: null,
        });

      const updateThreadsSpy = vi.spyOn(mockThreadRepository, "updateThreads");

      await threadResolver.fillDsu();
      await threadResolver.resolveThreads();

      const updates = updateThreadsSpy.mock.calls[0][0];
      const threadKeys = new Set(updates.map((u) => u.threadKey));

      expect(threadKeys.size).toBe(2);
    });

    it("должен корректно объединить несколько связанных сообщений", async () => {
      const edges = [
        { from: "msg1" as ExternalId, to: "msg2" as ExternalId },
        { from: "msg1" as ExternalId, to: "msg3" as ExternalId },
        { from: "msg2" as ExternalId, to: "msg4" as ExternalId },
      ];

      const messages = [
        "msg1" as ExternalId,
        "msg2" as ExternalId,
        "msg3" as ExternalId,
        "msg4" as ExternalId,
      ];

      vi.spyOn(mockThreadRepository, "getThreadEdgesBatch")
        .mockResolvedValueOnce({
          edges,
          nextCursor: null,
        })
        .mockResolvedValueOnce({
          edges: [],
          nextCursor: null,
        });

      vi.spyOn(mockThreadRepository, "getMessageIdsBatch")
        .mockResolvedValueOnce({
          messages,
          nextCursor: null,
        })
        .mockResolvedValueOnce({
          messages: [],
          nextCursor: null,
        });

      const updateThreadsSpy = vi.spyOn(mockThreadRepository, "updateThreads");

      await threadResolver.fillDsu();
      await threadResolver.resolveThreads();

      const updates = updateThreadsSpy.mock.calls[0][0];
      const threadKeys = new Set(updates.map((u) => u.threadKey));

      expect(threadKeys.size).toBe(1);
    });
  });
});
