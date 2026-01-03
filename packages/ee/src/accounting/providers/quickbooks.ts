import {
  AuthProvider,
  BaseProvider,
  createOAuthClient,
  HTTPClient,
  ProviderConfig,
  ProviderCredentials,
  ProviderID,
  Resource
} from "../core";
import { Accounting, QuickBooks } from "../entities";

export interface IQuickBooksProvider extends BaseProvider {
  // Add resource interfaces as needed, e.g.: customers, invoices, etc.
  contacts: Pick<
    Resource<Accounting.Contact, unknown, unknown>,
    "get" | "list"
  >;
}

type QuickBooksProviderConfig = ProviderConfig<{
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  tenantId?: string;
  environment?: "sandbox" | "production";
}> & {
  id: ProviderID.QUICKBOOKS;
};

export class QuickBooksProvider implements IQuickBooksProvider {
  http: HTTPClient;
  auth: AuthProvider;

  static id = ProviderID.QUICKBOOKS;

  constructor(public config: Omit<QuickBooksProviderConfig, "id">) {
    const host =
      config.environment === "production"
        ? "https://quickbooks.api.intuit.com"
        : "https://sandbox-quickbooks.api.intuit.com";
    const baseURL = `${host}/v3/company/${this.config.tenantId}`;

    this.http = new HTTPClient(baseURL, 3);
    this.auth = createOAuthClient({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      onTokenRefresh: config.onTokenRefresh,
      getAuthUrl(scopes, redirect_uri = "") {
        const params = new URLSearchParams({
          client_id: config.clientId,
          scope: scopes.join(" ") || "com.intuit.quickbooks.accounting",
          redirect_uri,
          response_type: "code",
          access_type: "offline",
          state: crypto.randomUUID()
        });
        return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
      }
    });
  }

  get id(): ProviderID.QUICKBOOKS {
    // @ts-expect-error
    return this.constructor.id;
  }

  contacts: IQuickBooksProvider["contacts"] = {
    list: async () => {
      const res = await this.http.requestWithRetry<{
        QueryResponse: {
          Customer: QuickBooks.Customer[];
        };
      }>(
        "GET",
        `/query?query=${encodeURIComponent("select * from Customer")}'`
      );

      if (res.error) {
        throw new Error(`Failed to fetch contacts: ${res.message}`);
      }

      return res.data?.QueryResponse.Customer || [];
    },
    get: async (id) => {
      const res = await this.http.requestWithRetry<{
        Contacts: Xero.Contact[];
      }>("GET", `/Contacts/${id}`);

      if (res.error || !res.data?.Contacts?.length) {
        throw new Error(`Failed to fetch contact ${id}: ${res.message}`);
      }

      const contact = res.data.Contacts[0]!;

      return contact;
    }
  };

  authenticate(
    code: string,
    redirectUri: string
  ): Promise<ProviderCredentials> {
    return this.auth.exchangeCode(code, redirectUri);
  }

  async request<T>(method: string, url: string, options?: RequestInit) {
    const { accessToken, ...creds } = this.auth.getCredentials();

    const tenantId = creds.tenantId || this.config.tenantId;

    const baseHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...((options?.headers ?? {}) as Record<string, string>)
    };

    const endpoint = `/v3/company/${tenantId}${url}`;

    const response = await this.http.requestWithRetry(method, endpoint, {
      ...options,
      headers: baseHeaders
    });

    if (response.code === 401) {
      await this.auth.refresh();

      const c = this.auth.getCredentials();

      if (typeof this.config.onTokenRefresh === "function") {
        this.config.onTokenRefresh(c);
      }

      const retryHeaders: Record<string, string> = {
        ...baseHeaders,
        Authorization: `Bearer ${c.accessToken}`
      };

      return this.http.request<T>(method, url, {
        ...options,
        headers: retryHeaders
      });
    }

    return response;
  }

  async validate(auth: ProviderCredentials): Promise<boolean> {
    if (!auth?.accessToken || !auth?.tenantId) {
      return false;
    }

    try {
      const response = await this.request("GET", "/companyinfo");
      return !response.error;
    } catch {
      return false;
    }
  }
}
