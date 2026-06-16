import { describe, expect, it } from "vitest";
import { rewireSamplingPlansToActiveInspectionDocument } from "./inspectionDocumentVersioning";

describe("rewireSamplingPlansToActiveInspectionDocument", () => {
  it("rewires sampling plans from sibling version ids to the activated document", async () => {
    const updatePayloads: unknown[] = [];
    const inFilters: unknown[] = [];

    const client = {
      from: (table: string) => {
        if (table === "inspectionDocument") {
          return {
            select: () => ({
              eq: (_col: string, value: unknown) => {
                if (value === "new-active-id") {
                  return {
                    eq: () => ({
                      single: () =>
                        Promise.resolve({
                          data: {
                            id: "new-active-id",
                            documentFamilyId: "family-1"
                          },
                          error: null
                        })
                    })
                  };
                }
                return {
                  eq: () => ({
                    neq: () =>
                      Promise.resolve({
                        data: [{ id: "old-active-id" }, { id: "archived-id" }],
                        error: null
                      })
                  }),
                  neq: () =>
                    Promise.resolve({
                      data: [{ id: "old-active-id" }, { id: "archived-id" }],
                      error: null
                    })
                };
              }
            })
          };
        }
        if (table === "itemSamplingPlan") {
          return {
            update: (payload: unknown) => {
              updatePayloads.push(payload);
              return {
                eq: () => ({
                  in: (_col: string, ids: unknown) => {
                    inFilters.push(ids);
                    return {
                      select: () =>
                        Promise.resolve({
                          data: [{ itemId: "item-1" }, { itemId: "item-2" }],
                          error: null
                        })
                    };
                  }
                })
              };
            }
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }
    };

    const result = await rewireSamplingPlansToActiveInspectionDocument(
      client as never,
      "new-active-id",
      "company-1"
    );

    expect(result.error).toBeNull();
    expect(result.data?.updated).toBe(2);
    expect(updatePayloads).toEqual([{ inspectionDocumentId: "new-active-id" }]);
    expect(inFilters).toEqual([["old-active-id", "archived-id"]]);
  });

  it("returns zero updates when there are no sibling versions", async () => {
    const client = {
      from: (table: string) => {
        if (table === "inspectionDocument") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: () =>
                    Promise.resolve({
                      data: {
                        id: "only-id",
                        documentFamilyId: "family-1"
                      },
                      error: null
                    }),
                  neq: () => Promise.resolve({ data: [], error: null })
                })
              })
            })
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }
    };

    const result = await rewireSamplingPlansToActiveInspectionDocument(
      client as never,
      "only-id",
      "company-1"
    );

    expect(result.error).toBeNull();
    expect(result.data?.updated).toBe(0);
  });
});
