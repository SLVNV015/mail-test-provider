import pino from "pino";
import { Page, pageSchema } from "./schema";

export interface RetryOPtions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  factor?: number;
  requestTimeout?: number;
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

  private readonly RPS_LIMIT = 10;
  private readonly RPS_INTERVAL = 1_000;
  private requestTimestamps: number[] = []; // Исправлена опечатка
  private limitQueue: (() => void)[] = [];

  constructor(
    private readonly baseUrl: string,
    private readonly logger: pino.Logger,
    private readonly abortController?: AbortController,
    retryOptions?: RetryOPtions,
  ) {
    this.baseUrl = baseUrl;
    this.abortController = abortController;
    this.finalRetryOptions = {
      maxRetries: 6,
      baseDelay: 250,
      maxDelay: 10_000,
      factor: 2,
      requestTimeout: 1_500,
      ...retryOptions,
    };
  }

  async request<T>(url: URL, options: RequestInit = {}): Promise<T> {
    const globalSignal = options?.signal ?? this.abortController?.signal;
    const timeOutSignal = AbortSignal.timeout(
      this.finalRetryOptions.requestTimeout,
    );

    const signal = globalSignal
      ? AbortSignal.any([globalSignal, timeOutSignal])
      : timeOutSignal;
    this.totalRequestsSent++;
    const currentRequestId = this.totalRequestsSent;
    const timestamp = new Date().toISOString();

    this.logger.debug(
      `[Запрос #${currentRequestId}] Отправка на ${url.pathname} в ${timestamp}`,
    );

    try {
      const response = await fetch(url, { ...options, signal: signal });

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
      if (error instanceof DOMException) {
        if (error.name === "T") {
          this.logger.warn(
            `[Запрос #${currentRequestId}] Превышено время ожидания`,
          );

          throw new Error(
            `Request timeout after ${this.finalRetryOptions.requestTimeout}ms`,
          );
        }
        throw error;
      }
      if (error instanceof ApiError) throw error;

      this.logger.error(
        `[Запрос #${currentRequestId}] Сетевая ошибка: ${error instanceof Error ? error.message : "Unknown"}`,
      );
      throw new Error(
        error instanceof Error ? error.message : "Unknown Network Error",
      );
    }
  }

  public async getMessages(cursor: string | null): Promise<Page> {
    const url = new URL(`v1/messages`, this.baseUrl);
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);

    this.logger.info({ url: url.toString() });
    const response = await this.fetchWithRetries<Page>(url, { method: "GET" });
    return await pageSchema.parseAsync(response);
  }

  public async getMetrics() {
    const url = new URL(`/v1/metrics`, this.baseUrl);
    return await this.request<unknown>(url, { method: "GET" });
  }

  private async fetchWithRetries<T>(
    url: URL,
    options: RequestInit = {},
  ): Promise<T> {
    const { maxRetries, baseDelay, maxDelay, factor } = this.finalRetryOptions;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (this.abortController?.signal.aborted) {
          throw new DOMException("The operation was aborted.", "AbortError");
        }

        await this.throttle();
        return await this.request<T>(url, options);
      } catch (error) {
        if (attempt === maxRetries) throw error;

        if (error instanceof DOMException && error.name === "AbortError")
          throw error;

        let delay = 0;

        if (error instanceof ApiError) {
          const isRetryableStatus = error.status === 429 || error.status >= 500;
          if (!isRetryableStatus) throw error;

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
        } else {
          delay = Math.min(maxDelay, delay);
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

  private async throttle(): Promise<void> {
    return new Promise((resolve) => {
      this.limitQueue.push(resolve);
      this.processQueue();
    });
  }

  private processQueue(): void {
    const now = Date.now();

    // Удаляем старые таймстампы
    this.requestTimestamps = this.requestTimestamps.filter(
      (ts) => now - ts < this.RPS_INTERVAL,
    );

    while (
      this.requestTimestamps.length < this.RPS_LIMIT &&
      this.limitQueue.length > 0
    ) {
      const nextResolve = this.limitQueue.shift();
      if (nextResolve) {
        this.requestTimestamps.push(Date.now());
        nextResolve();
      }
    }

    if (this.limitQueue.length > 0) {
      const oldestTs = this.requestTimestamps[0] || now;
      const timeToWait = Math.max(0, this.RPS_INTERVAL - (now - oldestTs));
      setTimeout(() => this.processQueue(), timeToWait + 5);
    }
  }
}
