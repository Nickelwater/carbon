// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { describe, expect, it } from "vitest";
import {
  inviteSetPasswordValidator,
  passwordLoginValidator
} from "./validators";

describe("passwordLoginValidator", () => {
  it("accepts a valid email and password", () => {
    const result = passwordLoginValidator.safeParse({
      email: "user@example.com",
      password: "secret1",
      redirectTo: "/x"
    });
    expect(result.success).toBe(true);
  });

  it("rejects a short password", () => {
    const result = passwordLoginValidator.safeParse({
      email: "user@example.com",
      password: "short",
      redirectTo: "/x"
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = passwordLoginValidator.safeParse({
      email: "not-an-email",
      password: "secret1"
    });
    expect(result.success).toBe(false);
  });
});

describe("inviteSetPasswordValidator", () => {
  it("accepts matching passwords of length >= 6", () => {
    const result = inviteSetPasswordValidator.safeParse({
      password: "secret1",
      confirmPassword: "secret1"
    });
    expect(result.success).toBe(true);
  });

  it("rejects a short password", () => {
    const result = inviteSetPasswordValidator.safeParse({
      password: "short",
      confirmPassword: "short"
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched passwords", () => {
    const result = inviteSetPasswordValidator.safeParse({
      password: "secret1",
      confirmPassword: "secret2"
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.includes("confirmPassword"))
      ).toBe(true);
    }
  });
});
