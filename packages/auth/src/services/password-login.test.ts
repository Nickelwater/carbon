// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { beforeEach, describe, expect, it, vi } from "vitest";

const ratelimitLimit = vi.hoisted(() => vi.fn());
const lockoutStatus = vi.hoisted(() => vi.fn());
const lockoutRecordFailure = vi.hoisted(() => vi.fn());
const lockoutReset = vi.hoisted(() => vi.fn());
const verifyBotProtection = vi.hoisted(() => vi.fn());
const getUserByEmail = vi.hoisted(() => vi.fn());
const getCompaniesForUser = vi.hoisted(() => vi.fn());
const signInWithPassword = vi.hoisted(() => vi.fn());
const companySelect = vi.hoisted(() => vi.fn());

vi.mock("../config/env", () => ({
  CarbonEdition: "Community",
  DOMAIN: "localhost",
  ERP_URL: "http://localhost:3000",
  MES_URL: "http://localhost:3001",
  IS_LOCAL_DEV: true,
  RATE_LIMIT: 5,
  REFRESH_ACCESS_TOKEN_THRESHOLD: 600,
  SESSION_KEY: "auth",
  SESSION_MAX_AGE: 60 * 60 * 24 * 7,
  SESSION_SECRET: "test-session-secret",
  STRIPE_BYPASS_COMPANY_IDS: "",
  SUPABASE_ANON_KEY: "anon",
  VERCEL_URL: "",
  getSupabaseUrl: () => "http://localhost:54321"
}));

vi.mock("@carbon/kv", () => ({
  redis: {},
  Ratelimit: class {
    static slidingWindow = vi.fn(() => ({}));
    limit = ratelimitLimit;
  },
  AccountLockout: class {
    status = lockoutStatus;
    recordFailure = lockoutRecordFailure;
    reset = lockoutReset;
  }
}));

vi.mock("./bot-protection.server", () => ({
  verifyBotProtection
}));

vi.mock("./auth-events.server", () => ({
  logAuthEvent: vi.fn()
}));

vi.mock("./users.server", () => ({
  getUserByEmail,
  getUserClaims: vi.fn()
}));

vi.mock("./users", () => ({
  getCompaniesForUser,
  getPermissionCacheKey: (id: string) => `permissions:${id}`
}));

vi.mock("../lib/supabase", () => ({
  getCarbon: vi.fn()
}));

vi.mock("../lib/supabase/client", () => ({
  getCarbon: vi.fn(),
  getCarbonClient: vi.fn(),
  getCarbonAPIKeyClient: vi.fn()
}));

vi.mock("../lib/supabase/client.server", () => ({
  getCarbonServiceRole: () => ({
    auth: { signInWithPassword },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: companySelect
        })
      })
    })
  }),
  requestFetch: vi.fn()
}));

vi.mock("./company.server", () => ({
  getCompanyPlanId: vi.fn(),
  isCarbonOwnedCompany: vi.fn()
}));

vi.mock("./console-pin.server", () => ({
  resolveConsolePinIn: vi.fn()
}));

vi.mock("./session.server", () => ({
  destroyAuthSession: vi.fn(),
  flash: vi.fn(),
  requireAuthSession: vi.fn()
}));

vi.mock("./api-key.server", () => ({
  getApiKeyRecord: vi.fn()
}));

import {
  attemptPasswordLogin,
  isPasswordLoginPrimary,
  PASSWORD_LOGIN_GENERIC_ERROR
} from "./auth.server";

function sessionPayload() {
  return {
    access_token: "access",
    refresh_token: "refresh",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: { id: "user-1", email: "user@example.com" }
  };
}

describe("isPasswordLoginPrimary", () => {
  it("is true for non-Cloud (Community mock)", () => {
    expect(isPasswordLoginPrimary()).toBe(true);
  });
});

describe("attemptPasswordLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ratelimitLimit.mockResolvedValue({ success: true });
    lockoutStatus.mockResolvedValue({ locked: false });
    lockoutRecordFailure.mockResolvedValue({ locked: false });
    lockoutReset.mockResolvedValue(undefined);
    verifyBotProtection.mockResolvedValue(null);
    getUserByEmail.mockResolvedValue({ data: { id: "user-1", active: true } });
    getCompaniesForUser.mockResolvedValue(["company-1"]);
    companySelect.mockResolvedValue({
      data: { companyGroupId: "group-1" }
    });
  });

  it("returns ok with authSession on valid credentials", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: sessionPayload(), user: { id: "user-1" } },
      error: null
    });

    const result = await attemptPasswordLogin({
      email: "  User@Example.com ",
      password: "secret1",
      ip: "1.2.3.4"
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.email).toBe("user@example.com");
      expect(result.authSession.userId).toBe("user-1");
    }
    expect(lockoutReset).toHaveBeenCalledWith("user@example.com");
  });

  it("returns generic invalid on bad password without revealing existence", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Invalid login" }
    });

    const result = await attemptPasswordLogin({
      email: "user@example.com",
      password: "wrong",
      ip: "1.2.3.4"
    });

    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      message: PASSWORD_LOGIN_GENERIC_ERROR
    });
    expect(lockoutRecordFailure).toHaveBeenCalledWith("user@example.com");
    expect(lockoutReset).not.toHaveBeenCalled();
  });

  it("returns locked when the account is already locked", async () => {
    lockoutStatus.mockResolvedValue({
      locked: true,
      retryAfterSeconds: 60
    });

    const result = await attemptPasswordLogin({
      email: "user@example.com",
      password: "secret1",
      ip: "1.2.3.4"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("locked");
    }
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns rate_limited when the IP limit is exceeded", async () => {
    ratelimitLimit.mockResolvedValue({ success: false });

    const result = await attemptPasswordLogin({
      email: "user@example.com",
      password: "secret1",
      ip: "1.2.3.4"
    });

    expect(result).toEqual({
      ok: false,
      reason: "rate_limited",
      message: "Rate limit exceeded"
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns generic invalid for an inactive user after a successful GoTrue sign-in", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: sessionPayload(), user: { id: "user-1" } },
      error: null
    });
    getUserByEmail.mockResolvedValue({ data: { id: "user-1", active: false } });

    const result = await attemptPasswordLogin({
      email: "user@example.com",
      password: "secret1",
      ip: "1.2.3.4"
    });

    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      message: PASSWORD_LOGIN_GENERIC_ERROR
    });
    expect(lockoutRecordFailure).toHaveBeenCalled();
    expect(lockoutReset).not.toHaveBeenCalled();
  });
});
