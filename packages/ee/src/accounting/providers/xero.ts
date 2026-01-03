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
import { Xero } from "../entities";
import { Accounting } from "../entities/types";

export interface IXeroProvider extends BaseProvider {
  contacts: Resource<Accounting.Contact, Accounting.Contact>;
}

type XeroProviderConfig = ProviderConfig<{
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  tenantId?: string;
}> & {
  id: ProviderID.XERO;
  accessToken?: string;
  refreshToken?: string;
};

const fromDotnetDate = (date: Date | string) => {
  if (typeof date === "string") {
    const value = date.replace(/\/Date\((\d+)([-+]\d+)?\)\//, "$1");
    return new Date(parseInt(value));
  }

  return date;
};

export class XeroProvider implements IXeroProvider {
  static id = ProviderID.XERO;

  http: HTTPClient;
  auth: AuthProvider;

  constructor(public config: Omit<XeroProviderConfig, "id">) {
    this.http = new HTTPClient("https://api.xero.com/api.xro/2.0", 3);
    this.auth = createOAuthClient({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      accessToken: config.accessToken,
      refreshToken: config.refreshToken,
      redirectUri: config.redirectUri,
      tokenUrl: "https://identity.xero.com/connect/token",
      onTokenRefresh: config.onTokenRefresh,
      getAuthUrl(scopes: string[], redirectURL): string {
        const params = new URLSearchParams({
          response_type: "code",
          client_id: config.clientId,
          redirect_uri: redirectURL,
          scope: scopes.join(" "),
          state: crypto.randomUUID()
        });

        return `https://login.xero.com/identity/connect/authorize?${params.toString()}`;
      }
    });
  }

  get id(): ProviderID.XERO {
    // @ts-expect-error
    return this.constructor.id;
  }

  contacts: IXeroProvider["contacts"] = {
    list: async () => {
      const res = await this.request<{
        Contacts: Xero.Contact[];
      }>("GET", `/Contacts`);

      if (res.error) {
        throw new Error(`Failed to fetch contacts: ${res.message}`);
      }

      return (res.data?.Contacts || []).map((c) =>
        transformContact(c, this.config.companyId)
      );
    },
    get: async (id) => {
      const res = await this.request<{
        Contacts: Xero.Contact[];
      }>("GET", `/Contacts/${id}`);

      if (res.error || !res.data?.Contacts?.length) {
        throw new Error(`Failed to fetch contact ${id}: ${res.message}`);
      }

      const contact = res.data.Contacts[0]!;

      return transformContact(contact, this.config.companyId);
    },
    create: async (data) => {
      const res = await this.request<{
        Contacts: Xero.Contact[];
      }>("PUT", `/Contacts`, {
        body: JSON.stringify({
          Contacts: [
            {
              Name: data.name,
              FirstName: data.firstName,
              LastName: data.lastName,
              EmailAddress: data.email,
              Website: data.website,
              TaxNumber: data.taxId,
              IsCustomer: data.isCustomer,
              IsSupplier: data.isVendor,
              Phones: data.phones?.map((p) => ({
                PhoneType: p.type,
                PhoneNumber: p.phone
              })),
              Addresses: data.addresses?.map((a) => ({
                AddressLine1: a.line1,
                AddressLine2: a.line2,
                City: a.city,
                Region: a.region,
                Country: a.country,
                PostalCode: a.postalCode
              }))
            }
          ]
        })
      });

      if (res.error || !res.data?.Contacts?.length) {
        throw new Error(`Failed to create contact: ${res.message}`);
      }

      const contact = res.data.Contacts[0]!;

      return transformContact(contact, this.config.companyId);
    },
    update: async (id, data) => {
      const res = await this.request<{
        Contacts: Xero.Contact[];
      }>("POST", `/Contacts/${id}`, {
        body: JSON.stringify({
          Contacts: [
            {
              Name: data.name,
              FirstName: data.firstName,
              LastName: data.lastName,
              EmailAddress: data.email,
              Website: data.website,
              TaxNumber: data.taxId,
              IsCustomer: data.isCustomer,
              IsSupplier: data.isVendor,
              Phones: data.phones?.map((p) => ({
                PhoneType: p.type,
                PhoneNumber: p.phone
              })),
              Addresses: data.addresses?.map((a) => ({
                AddressLine1: a.line1,
                AddressLine2: a.line2,
                City: a.city,
                Region: a.region,
                Country: a.country,
                PostalCode: a.postalCode
              }))
            }
          ]
        })
      });

      if (res.error || !res.data?.Contacts?.length) {
        throw new Error(`Failed to update contact: ${res.message}`);
      }

      const contact = res.data.Contacts[0]!;

      return transformContact(contact, this.config.companyId);
    },
    delete: async (id) => {
      const res = await this.request<{
        Contacts: Xero.Contact[];
      }>("POST", `/Contacts/${id}`, {
        body: JSON.stringify({
          ContactID: id,
          ContactStatus: "ARCHIVED"
        })
      });

      if (res.error) {
        throw new Error(`Failed to delete contact ${id}: ${res.message}`);
      }
    },
    upsert: async ({ id, ...data }) => {
      const res = await this.request<{
        Contacts: Xero.Contact[];
      }>("POST", `/Contacts`, {
        body: JSON.stringify({
          Contacts: [
            {
              ContactID: id,
              Name: data.name,
              FirstName: data.firstName,
              LastName: data.lastName,
              EmailAddress: data.email,
              Website: data.website,
              TaxNumber: data.taxId,
              IsCustomer: data.isCustomer,
              IsSupplier: data.isVendor,
              Phones: data.phones?.map((p) => ({
                PhoneType: p.type,
                PhoneNumber: p.phone
              })),
              Addresses: data.addresses?.map((a) => ({
                AddressLine1: a.line1,
                AddressLine2: a.line2,
                City: a.city,
                Region: a.region,
                Country: a.country,
                PostalCode: a.postalCode
              }))
            }
          ]
        })
      });

      if (res.error || !res.data?.Contacts?.length) {
        throw new Error(`Failed to upsert contact: ${res.message}`);
      }

      const contact = res.data.Contacts[0]!;

      return transformContact(contact, this.config.companyId);
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

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...((options?.headers ?? {}) as Record<string, string>)
    };

    if (tenantId) {
      headers["xero-tenant-id"] = tenantId;
    }

    const response = await this.http.requestWithRetry<T>(method, url, {
      ...options,
      headers: headers
    });

    if (response.code === 401) {
      await this.auth.refresh();

      const c = this.auth.getCredentials();

      const retryHeaders: Record<string, string> = {
        ...headers,
        Authorization: `Bearer ${c.accessToken}`
      };

      if (tenantId) {
        retryHeaders["xero-tenant-id"] = tenantId;
      }

      return this.http.request<T>(method, url, {
        ...options,
        headers: retryHeaders
      });
    }

    return response;
  }

  async validate(auth: ProviderCredentials): Promise<boolean> {
    if (!auth?.accessToken || !auth.tenantId) return false;
    try {
      const response = await this.request("GET", `/Organisation`);
      return !response.error;
    } catch {
      return false;
    }
  }
}

/** Helpers */
const transformContact = (
  contact: Xero.Contact,
  companyId: string
): Accounting.Contact => {
  const firstName = contact.FirstName || "";
  const lastName = contact.LastName || "";

  const phones = contact.Phones ?? [];
  const addresses = contact.Addresses ?? [];

  return {
    id: contact.ContactID,
    name: `${firstName} ${lastName}`.trim(),
    firstName,
    lastName,
    companyId,
    website: contact.Website,
    currencyCode: contact.DefaultCurrency ?? "USD",
    taxId: contact.TaxNumber,
    email: contact.EmailAddress,
    isCustomer: contact.IsCustomer,
    isVendor: contact.IsSupplier,
    addresses: addresses.map((a) => ({
      label: a.AttentionTo,
      line1: a.AddressLine1,
      line2: a.AddressLine2,
      city: a.City,
      region: a.Region,
      country: a.Country,
      postalCode: a.PostalCode
    })),
    phones: phones.map((p) => ({
      type: p.PhoneType,
      phone: p.PhoneNumber
    })),
    updatedAt: fromDotnetDate(contact.UpdatedDateUTC).toISOString()
  };
};
