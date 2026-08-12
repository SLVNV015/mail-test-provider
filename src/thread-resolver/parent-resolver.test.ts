import { describe, it, expect, beforeEach, vi } from "vitest";
import type pino from "pino";
import { GraphRepository } from "../repositories/graph.repository.js";
import { ParentResolver } from "./parent-resolver.js";

describe("ParentResolver", () => {
  let parentResolver: ParentResolver;
  let mockGraphRepository: GraphRepository;
  let mockLogger: pino.Logger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as pino.Logger;

    mockGraphRepository = {
      getMessageBatch: vi.fn(),
      saveMessageBatch: vi.fn(),
    } as unknown as GraphRepository;

    parentResolver = new ParentResolver(mockGraphRepository, mockLogger);
  });

  describe("resolveAll", () => {
    it("должен обработать пустой батч и завершиться", async () => {
      vi.spyOn(mockGraphRepository, "getMessageBatch").mockResolvedValue({
        messages: [],
        nextCursor: null,
        existingsIds: new Set(),
      });

      await parentResolver.resolveAll();

      expect(mockGraphRepository.getMessageBatch).toHaveBeenCalledWith(
        null,
        1000,
      );
      expect(mockGraphRepository.saveMessageBatch).not.toHaveBeenCalled();
    });

    it("должен обработать один батч сообщений", async () => {
      const messages: GraphMessage[] = [
        {
          id: "msg1" as ExternalId,
          references: ["msg0" as ExternalId],
          inReplyTo: null,
        },
        {
          id: "msg2" as ExternalId,
          references: [],
          inReplyTo: "msg1" as ExternalId,
        },
      ];

      const existingsIds = new Set<ExternalId>([
        "msg0" as ExternalId,
        "msg1" as ExternalId,
      ]);

      vi.spyOn(mockGraphRepository, "getMessageBatch")
        .mockResolvedValueOnce({
          messages,
          nextCursor: null,
          existingsIds,
        })
        .mockResolvedValueOnce({
          messages: [],
          nextCursor: null,
          existingsIds: new Set(),
        });

      const saveMessageBatchSpy = vi.spyOn(
        mockGraphRepository,
        "saveMessageBatch",
      );

      await parentResolver.resolveAll();

      expect(saveMessageBatchSpy).toHaveBeenCalledWith([
        { id: "msg1", parentId: "msg0" },
        { id: "msg2", parentId: "msg1" },
      ]);
    });

    it("должен обработать несколько батчей", async () => {
      const batch1Messages: GraphMessage[] = [
        {
          id: "msg1" as ExternalId,
          references: [],
          inReplyTo: null,
        },
      ];

      const batch2Messages: GraphMessage[] = [
        {
          id: "msg2" as ExternalId,
          references: ["msg1" as ExternalId],
          inReplyTo: null,
        },
      ];

      vi.spyOn(mockGraphRepository, "getMessageBatch")
        .mockResolvedValueOnce({
          messages: batch1Messages,
          nextCursor: "cursor1" as ExternalId,
          existingsIds: new Set(["msg0" as ExternalId]),
        })
        .mockResolvedValueOnce({
          messages: batch2Messages,
          nextCursor: null,
          existingsIds: new Set(["msg1" as ExternalId]),
        })
        .mockResolvedValueOnce({
          messages: [],
          nextCursor: null,
          existingsIds: new Set(),
        });

      await parentResolver.resolveAll();

      expect(mockGraphRepository.saveMessageBatch).toHaveBeenCalledTimes(2);
    });

    it("должен правильно резолвить родителя через references", async () => {
      const messages: GraphMessage[] = [
        {
          id: "msg3" as ExternalId,
          references: ["msg1" as ExternalId, "msg2" as ExternalId],
          inReplyTo: null,
        },
      ];

      const existingsIds = new Set<ExternalId>([
        "msg1" as ExternalId,
        "msg2" as ExternalId,
      ]);

      vi.spyOn(mockGraphRepository, "getMessageBatch")
        .mockResolvedValueOnce({
          messages,
          nextCursor: null,
          existingsIds,
        })
        .mockResolvedValueOnce({
          messages: [],
          nextCursor: null,
          existingsIds: new Set(),
        });

      const saveMessageBatchSpy = vi.spyOn(
        mockGraphRepository,
        "saveMessageBatch",
      );

      await parentResolver.resolveAll();

      expect(saveMessageBatchSpy).toHaveBeenCalledWith([
        { id: "msg3", parentId: "msg1" },
      ]);
    });

    it("должен вернуть null если родитель не найден", async () => {
      const messages: GraphMessage[] = [
        {
          id: "msg1" as ExternalId,
          references: ["non-existing" as ExternalId],
          inReplyTo: "also-non-existing" as ExternalId,
        },
      ];

      const existingsIds = new Set<ExternalId>();

      vi.spyOn(mockGraphRepository, "getMessageBatch")
        .mockResolvedValueOnce({
          messages,
          nextCursor: null,
          existingsIds,
        })
        .mockResolvedValueOnce({
          messages: [],
          nextCursor: null,
          existingsIds: new Set(),
        });

      const saveMessageBatchSpy = vi.spyOn(
        mockGraphRepository,
        "saveMessageBatch",
      );

      await parentResolver.resolveAll();

      expect(saveMessageBatchSpy).toHaveBeenCalledWith([
        { id: "msg1", parentId: null },
      ]);
    });

    it("должен предпочесть inReplyTo если references пустой", async () => {
      const messages: GraphMessage[] = [
        {
          id: "msg2" as ExternalId,
          references: [],
          inReplyTo: "msg1" as ExternalId,
        },
      ];

      const existingsIds = new Set<ExternalId>(["msg1" as ExternalId]);

      vi.spyOn(mockGraphRepository, "getMessageBatch")
        .mockResolvedValueOnce({
          messages,
          nextCursor: null,
          existingsIds,
        })
        .mockResolvedValueOnce({
          messages: [],
          nextCursor: null,
          existingsIds: new Set(),
        });

      const saveMessageBatchSpy = vi.spyOn(
        mockGraphRepository,
        "saveMessageBatch",
      );

      await parentResolver.resolveAll();

      expect(saveMessageBatchSpy).toHaveBeenCalledWith([
        { id: "msg2", parentId: "msg1" },
      ]);
    });
  });
});
