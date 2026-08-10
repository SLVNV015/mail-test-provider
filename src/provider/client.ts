import pino from "pino";
import { Page, pageSchema } from "./schema";
import { th } from "zod/locales";

export interface RetryOPtions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  factor?: number;
}

export class ApiError extends Error {
  status: number;
  data?: unknown;
  headers: Headers;

  constructor(response: Response, data?: unknown) {
    super(`HTTP error: ${response.status} ${response.statusText}`);
    this.name = `ApiError`;
    this.status = response.status;
    this.headers = response.headers;
    this.data = data;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }
}

export class ProviderClient {
  private readonly finalRetryOptions: Required<RetryOPtions>;
  private totalRequestsSent = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly logger: pino.Logger,
    private readonly abortController?: AbortController,
    retryOptions?: RetryOPtions,
  ) {
    this.baseUrl = baseUrl;
    this.abortController = abortController;
    this.finalRetryOptions = {
      maxRetries: 3,
      baseDelay: 2_000,
      maxDelay: 30_000,
      factor: 2,
      ...retryOptions,
    };
  }

  // 1. Добавьте свойство-счетчик в класс ProviderClient

  async request<T>(url: URL, options: RequestInit = {}): Promise<T> {
    const signal = options?.signal ?? this.abortController?.signal;

    this.totalRequestsSent++;
    const currentRequestId = this.totalRequestsSent;
    const timestamp = new Date().toISOString();

    this.logger.debug(
      `[Запрос #${currentRequestId}] Отправка на ${url.pathname} в ${timestamp}`,
    );

    try {
      const response = await fetch(url, { ...options, signal });

      if (!response.ok) {
        const isJson = response.headers.get("content-type")?.includes("json");
        const errData = isJson
          ? await response.json().catch(() => null)
          : await response.text().catch(() => null);

        this.logger.error(
          `[Запрос #${currentRequestId}] Ошибка HTTP ${response.status}`,
        );
        throw new ApiError(response, errData);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof DOMException) throw error;
      if (error instanceof ApiError) throw error;

      this.logger.error(
        `[Запрос #${currentRequestId}] Сетевая ошибка: ${error instanceof Error ? error.message : "Unknown"}`,
      );
      throw new Error(
        error instanceof Error ? error.message : "Unknown Network Error",
      );
    }
  }

  private async fetchWithRetries<T>(
    url: URL,
    options: RequestInit = {},
  ): Promise<T> {
    const { maxRetries, baseDelay, maxDelay, factor } = this.finalRetryOptions;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.request<T>(url, options);
      } catch (error) {
        if (attempt === maxRetries) throw error;

        if (error instanceof DOMException && error.name === "AbortError")
          throw error;

        let delay = 0;

        if (error instanceof ApiError) {
          const isRetryableStatus = error.status === 429 || error.status >= 500;
          if (!isRetryableStatus) throw error; // 400, 401, 403, 404 и т.д. не ретраемоло

          if (error.status === 429) {
            const retryAfterHeader = error.headers.get("retry-after");
            if (retryAfterHeader) {
              const seconds = parseInt(retryAfterHeader, 10);
              if (!isNaN(seconds)) {
                delay = seconds * 1_000;
              }
            }
          }
        }

        if (delay === 0) {
          const exponentialDelay = Math.min(
            maxDelay,
            baseDelay * Math.pow(factor, attempt),
          );
          delay = Math.random() * exponentialDelay;
        }

        this.logger.warn(
          `Попытка ${attempt + 1} не удалась. Ошибка: ${error instanceof Error ? error.message : "Unknown"}. Повтор через ${Math.round(delay)}мс...`,
        );

        await this.sleep(delay);
      }
    }

    throw new Error("Unexpected end of retry loop");
  }

  private async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async getMessages(cursor?: string): Promise<Page> {
    const url = new URL(`v1/messages`, this.baseUrl);
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);

    this.logger.info({ url });
    const response = await this.fetchWithRetries<Page>(url, { method: "GET" });
    return await pageSchema.parseAsync(response);
  }

  public async getMetrics() {
    const url = new URL(`/v1/metrics`, this.baseUrl);
    const response = await this.fetchWithRetries<unknown>(url, {
      method: "GET",
    });
    return response;
  }
}
