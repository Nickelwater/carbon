// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { describe, expect, it } from "vitest";
import {
  createBasicEmployeeValidator,
  promoteBasicEmployeeValidator
} from "./users.models";

describe("createBasicEmployeeValidator", () => {
  it("accepts name, type, location without enrollId or email", () => {
    const result = createBasicEmployeeValidator.safeParse({
      firstName: "Ada",
      lastName: "Lovelace",
      employeeType: "type-1",
      locationId: "loc-1"
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enrollId).toBeUndefined();
    }
  });

  it("accepts optional enrollId", () => {
    const result = createBasicEmployeeValidator.safeParse({
      firstName: "Ada",
      lastName: "Lovelace",
      employeeType: "type-1",
      locationId: "loc-1",
      enrollId: "1001"
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enrollId).toBe("1001");
    }
  });

  it("rejects missing name", () => {
    const result = createBasicEmployeeValidator.safeParse({
      firstName: "",
      lastName: "Lovelace",
      employeeType: "type-1",
      locationId: "loc-1"
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing location", () => {
    const result = createBasicEmployeeValidator.safeParse({
      firstName: "Ada",
      lastName: "Lovelace",
      employeeType: "type-1",
      locationId: ""
    });
    expect(result.success).toBe(false);
  });
});

describe("promoteBasicEmployeeValidator", () => {
  it("requires email and employee type", () => {
    expect(
      promoteBasicEmployeeValidator.safeParse({
        email: "ada@example.com",
        employeeType: "type-1"
      }).success
    ).toBe(true);
    expect(
      promoteBasicEmployeeValidator.safeParse({
        email: "",
        employeeType: "type-1"
      }).success
    ).toBe(false);
  });
});
