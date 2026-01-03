import { ProviderCredentials } from "./models";
import { AuthProvider } from "./provider";

export class HTTPClient {
  constructor(
    private baseUrl?: string,
    private maxRetries: number = 3
  ) {}

  async request<T>(method: string, path: string, opts: RequestInit = {}) {
    const response = await this.fetch(method, path, opts);
    return this.parseResponse<T>(response);
  }

  async requestWithRetry<T>(
    method: string,
    path: string,
    opts: RequestInit = {}
  ) {
    let attempt = 0;

    while (true) {
      const response = await this.fetch(method, path, opts);

      if (this.shouldRetry(response, attempt)) {
        attempt++;

        const retryAfterMs = this.getRetryAfterMs(response);
        if (retryAfterMs !== undefined) {
          await this.sleep(retryAfterMs);
        }

        continue;
      }

      return this.parseResponse<T>(response);
    }
  }

  private fetch(
    method: string,
    path: string,
    opts: RequestInit
  ): Promise<Response> {
    const url = this.baseUrl ? `${this.baseUrl}${path}` : path;

    return fetch(url, {
      method,
      ...opts
    });
  }

  private async parseResponse<T>(response: Response) {
    const hasBody =
      response.headers.get("content-length") !== "0" &&
      response.headers.get("content-type")?.includes("application/json");

    if (!response.ok) {
      return {
        error: true,
        message: response.statusText,
        code: response.status,
        data: await response.text()
      } as const;
    }

    if (hasBody) {
      return {
        error: false,
        message: response.statusText,
        code: response.status,
        data: (await response.json()) as T
      } as const;
    }

    return {
      error: false,
      message: response.statusText,
      code: response.status,
      data: null
    } as const;
  }

  private shouldRetry(response: Response, attempt: number): boolean {
    return response.status === 429 && attempt < this.maxRetries;
  }

  private getRetryAfterMs(response: Response): number | undefined {
    const retryAfter = response.headers.get("Retry-After");
    if (!retryAfter) return undefined;

    const seconds = Number(retryAfter);
    if (!Number.isNaN(seconds)) {
      return seconds * 1000;
    }

    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) {
      return Math.max(0, date - Date.now());
    }

    return undefined;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class NotImplementedError extends Error {
  constructor(name: string) {
    super(`Method ${name} is not implemented.`);
    this.name = "NotImplementedError";
  }
}

interface OAuthClientOptions {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  accessToken?: string;
  refreshToken?: string;
  redirectUri?: string;
  getAuthUrl: (scopes: string[], redirectUri: string) => string;
  onTokenRefresh?: (creds: ProviderCredentials) => void;
}

export function createOAuthClient({
  clientId,
  clientSecret,
  ...options
}: OAuthClientOptions): AuthProvider {
  const basicAuth = btoa(`${clientId}:${clientSecret}`);
  const http = new HTTPClient();

  let creds: ProviderCredentials = {
    type: "oauth2",
    accessToken: options.accessToken!,
    refreshToken: options.refreshToken!
  };

  return {
    getAuthUrl: options.getAuthUrl,
    async exchangeCode(code: string, redirectUri?: string) {
      const response = await http.request<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
      }>("POST", options.tokenUrl, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri ?? options.redirectUri ?? ""
        })
      });

      if (response.error || !response.data) {
        throw new Error(`Auth failed: ${response.data}`);
      }

      const newCreds = {
        type: "oauth2",
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresAt: new Date(
          Date.now() + response.data.expires_in * 1000
        ).toISOString()
      } satisfies ProviderCredentials;

      options.onTokenRefresh?.(newCreds);

      return newCreds;
    },
    async refresh() {
      if (!creds?.refreshToken) {
        throw new Error("No refresh token available");
      }

      const response = await http.request<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
      }>("POST", options.tokenUrl, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: creds.refreshToken
        })
      });

      if (response.error || !response.data) {
        console.log(response.data);
        throw new Error(`Token refresh failed: ${response.error}`);
      }

      const newCreds = {
        type: "oauth2",
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresAt: new Date(
          Date.now() + response.data.expires_in * 1000
        ).toISOString(),
        tenantId: creds?.tenantId
      } satisfies ProviderCredentials;

      options.onTokenRefresh?.(newCreds);

      return newCreds;
    },
    getCredentials() {
      if (!creds) {
        throw new Error("No credentials available");
      }

      return creds;
    }
  };
}
