import { ProviderCredentials, ProviderID } from "./models";

export interface AuthProvider {
  getCredentials(): ProviderCredentials;
  getAuthUrl(scopes: string[], redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<ProviderCredentials>;
  refresh(): Promise<ProviderCredentials>;
}

export interface RequestContext {
  auth?: ProviderCredentials;
  signal?: AbortSignal;
}

export interface SyncOptions {
  modifiedSince?: Date;
  cursor?: string;
  limit?: number;
  includeDeleted?: boolean;
}

export interface ReadableResource<T> {
  list(options?: SyncOptions): Promise<T[]>;
  get(id: string): Promise<T>;
}

export type WritableResource<T, Create, Update> = {
  create(data: Create): Promise<T>;
  update(id: string, data: Update): Promise<T>;
  upsert(data: Update & { id: string }): Promise<T>;
  delete(id: string): Promise<void>;
};

export type Resource<T, Create, Update = Create> = ReadableResource<T> &
  WritableResource<T, Create, Update>;

export abstract class BaseProvider {
  static id: ProviderID;

  protected creds?: ProviderCredentials;
  public auth!: AuthProvider;

  abstract validate(auth: ProviderCredentials): Promise<boolean>;

  abstract authenticate(...args: any[]): Promise<ProviderCredentials>;
}
