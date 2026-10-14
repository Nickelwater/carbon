// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import type { Database, Json } from "@carbon/database";
import { getCompanyTimeZone } from "@carbon/database";
import type { Kysely, KyselyDatabase } from "@carbon/database/client";
import { pairPunchesByDay } from "@carbon/timeclock";
import { datetime } from "@carbon/utils";
import { getDayOfWeek, today } from "@internationalized/date";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { DataType } from "~/modules/shared";
import type { Employee } from "~/modules/users";
import { getEmployees } from "~/modules/users/users.service";
import type { GenericQueryFilters } from "~/utils/query";
import { LIST_COUNT, setGenericQueryFilters } from "~/utils/query";
import { sanitize } from "~/utils/supabase";
import type {
  departmentValidator,
  employeeJobValidator,
  holidayValidator,
  shiftValidator
} from "./people.models";

/** @mcp delete */
export async function deleteAttribute(
  client: SupabaseClient<Database>,
  attributeId: string
) {
  return client
    .from("userAttribute")
    .update({ active: false })
    .eq("id", attributeId);
}

/** @mcp delete */
export async function deleteAttributeCategory(
  client: SupabaseClient<Database>,
  attributeCategoryId: string
) {
  return client
    .from("userAttributeCategory")
    .update({ active: false })
    .eq("id", attributeCategoryId);
}

/** @mcp delete */
export async function deleteDepartment(
  client: SupabaseClient<Database>,
  departmentId: string
) {
  return client.from("department").delete().eq("id", departmentId);
}

/** @mcp delete */
export async function deleteHoliday(
  client: SupabaseClient<Database>,
  holidayId: string
) {
  return client.from("holiday").delete().eq("id", holidayId);
}

/** @mcp delete */
export async function deleteShift(
  client: SupabaseClient<Database>,
  shiftId: string
) {
  // TODO: Set all employeeShifts to null
  return client.from("shift").update({ active: false }).eq("id", shiftId);
}

/** @mcp read */
export async function getAttribute(
  client: SupabaseClient<Database>,
  attributeId: string
) {
  return client
    .from("userAttribute")
    .select("*, userAttributeCategory(name)")
    .eq("id", attributeId)
    .eq("active", true)
    .single();
}

async function getAttributes(
  client: SupabaseClient<Database>,
  companyId: string,
  userIds: string[]
) {
  return client
    .from("userAttributeCategory")
    .select(
      `*,
      userAttribute(id, name, listOptions, canSelfManage,
        attributeDataType(id, isBoolean, isDate, isNumeric, isText, isUser, isFile),
        userAttributeValue(
          id, userId, valueBoolean, valueDate, valueNumeric, valueText, valueUser, valueFile, user!userAttributeValue_userId_fkey(id, fullName, avatarUrl)
        )
      )`
    )
    .eq("companyId", companyId)
    .eq("userAttribute.active", true)
    .in("userAttribute.userAttributeValue.userId", userIds)
    .order("sortOrder", { foreignTable: "userAttribute", ascending: true });
}

/** @mcp read */
export async function getAttributeCategories(
  client: SupabaseClient<Database>,
  companyId: string,
  args?: { search: string | null } & GenericQueryFilters
) {
  let query = client
    .from("userAttributeCategory")
    .select("*, userAttribute(id, name, attributeDataType(id))", {
      count: LIST_COUNT
    })
    .eq("companyId", companyId)
    .eq("active", true)
    .eq("userAttribute.active", true);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "name", ascending: true }
    ]);
  }

  return query;
}

/** @mcp read */
export async function getAttributeCategory(
  client: SupabaseClient<Database>,
  id: string
) {
  return client
    .from("userAttributeCategory")
    .select(
      `*,
      userAttribute(
        id, name, sortOrder,
        attributeDataType(id, label, isBoolean, isDate, isList, isNumeric, isText, isUser, isFile))
      `,
      {
        count: "exact"
      }
    )
    .eq("id", id)
    .eq("active", true)
    .eq("userAttribute.active", true)
    .single();
}

/** @mcp read */
export async function getAttributeDataTypes(client: SupabaseClient<Database>) {
  return client.from("attributeDataType").select("*");
}

/** @mcp read */
export async function getDepartment(
  client: SupabaseClient<Database>,
  departmentId: string
) {
  return client.from("department").select("*").eq("id", departmentId).single();
}

/** @mcp read */
export async function getDepartments(
  client: SupabaseClient<Database>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("department")
    .select(`*, department(id, name)`, {
      count: LIST_COUNT
    })
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "name", ascending: true }
    ]);
  }

  return query;
}

/** @mcp read */
export async function getDepartmentsList(
  client: SupabaseClient<Database>,
  companyId: string
) {
  return client
    .from("department")
    .select(`id, name`)
    .eq("companyId", companyId)
    .order("name");
}

/** @mcp read */
export async function getDepartmentsTree(
  client: SupabaseClient<Database>,
  companyId: string
) {
  return client
    .from("department")
    .select("id, name, parentDepartmentId")
    .eq("companyId", companyId)
    .order("name");
}

/** @mcp read */
export async function getEmployeeJob(
  client: SupabaseClient<Database>,
  employeeId: string,
  companyId: string
) {
  return client
    .from("employeeJob")
    .select("*")
    .eq("id", employeeId)
    .eq("companyId", companyId)
    .single();
}

/** @mcp read */
export async function getEmployeeSummary(
  client: SupabaseClient<Database>,
  employeeId: string,
  companyId: string
) {
  return client
    .from("employeeSummary")
    .select("*")
    .eq("id", employeeId)
    .eq("companyId", companyId)
    .single();
}

/** @mcp read */
export async function getHoliday(
  client: SupabaseClient<Database>,
  holidayId: string
) {
  return client.from("holiday").select("*").eq("id", holidayId).single();
}

/** @mcp read */
export async function getHolidays(
  client: SupabaseClient<Database>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("holiday")
    .select("*", {
      count: LIST_COUNT
    })
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "date", ascending: true }
    ]);
  }

  return query;
}

/** @mcp read */
export function getHolidayYears(
  client: SupabaseClient<Database>,
  companyId: string
) {
  return client.from("holidayYears").select("year").eq("companyId", companyId);
}

type UserAttributeId = string;

export type PersonAttributeValue = {
  userAttributeValueId: string;
  value: boolean | string | number;
  dataType?: DataType;
  user?: {
    id: string;
    fullName: string | null;
    avatarUrl: string | null;
  } | null;
};

type PersonAttributes = Record<UserAttributeId, PersonAttributeValue>;

type Person = Employee & {
  attributes: PersonAttributes;
};

/** @mcp read */
export async function getPeople(
  client: SupabaseClient<Database>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  const employees = await getEmployees(client, companyId, args);
  if (employees.error) return employees;

  if (!employees.data) throw new Error("Failed to get employee data");

  const userIds = employees.data.reduce<string[]>((acc, employee) => {
    if (employee.id) acc.push(employee.id);
    return acc;
  }, []);

  const attributeCategories = await getAttributes(client, companyId, userIds);
  if (attributeCategories.error) return attributeCategories;

  const people: Person[] = employees.data.map((employee) => {
    const userId = employee.id;

    const employeeAttributes =
      attributeCategories.data.reduce<PersonAttributes>((acc, category) => {
        if (!category.userAttribute || !Array.isArray(category.userAttribute))
          return acc;
        category.userAttribute.forEach((attribute) => {
          if (
            attribute.userAttributeValue &&
            Array.isArray(attribute.userAttributeValue) &&
            !Array.isArray(attribute.attributeDataType)
          ) {
            const userAttributeId = attribute.id;
            const userAttributeValue = attribute.userAttributeValue.find(
              (attributeValue) => attributeValue.userId === userId
            );
            const value =
              typeof userAttributeValue?.valueBoolean === "boolean"
                ? userAttributeValue.valueBoolean
                : userAttributeValue?.valueDate ||
                  userAttributeValue?.valueNumeric ||
                  userAttributeValue?.valueText ||
                  userAttributeValue?.valueUser ||
                  userAttributeValue?.valueFile;

            if (value && userAttributeValue?.id) {
              acc[userAttributeId] = {
                userAttributeValueId: userAttributeValue.id,
                dataType: attribute.attributeDataType?.id as DataType,
                value,
                user: !Array.isArray(userAttributeValue.user)
                  ? userAttributeValue.user
                  : undefined
              };
            }
          }
        });
        return acc;
      }, {});

    return {
      ...employee,
      attributes: employeeAttributes
    };
  });

  return {
    count: employees.count,
    data: people,
    error: null
  };
}

/** @mcp read */
export async function getContacts(
  client: SupabaseClient<Database>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client
    .from("contact")
    .select("*", { count: LIST_COUNT })
    .eq("companyId", companyId);

  if (args.search) {
    query = query.or(
      `firstName.ilike.%${args.search}%,lastName.ilike.%${args.search}%,email.ilike.%${args.search}%`
    );
  }

  query = setGenericQueryFilters(query, args, [
    { column: "lastName", ascending: true }
  ]);

  const contacts = await query;

  if (!contacts.data) throw new Error("Failed to get contacts data");

  return {
    count: contacts.count,
    data: contacts.data,
    error: null
  };
}
/** @mcp read */
export async function getShift(
  client: SupabaseClient<Database>,
  shiftId: string
) {
  return client
    .from("shifts")
    .select("*")
    .eq("id", shiftId)
    .eq("active", true)
    .single();
}

/** @mcp read */
export async function getShifts(
  client: SupabaseClient<Database>,
  companyId: string,
  args: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("shifts")
    .select("*", {
      count: LIST_COUNT
    })
    .eq("companyId", companyId)
    .eq("active", true);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "locationId", ascending: true }
  ]);
  return query;
}

/** @mcp read */
export async function getShiftsList(
  client: SupabaseClient<Database>,
  companyId: string,
  locationId: string | null
) {
  let query = client
    .from("shift")
    .select(`id, name`)
    .eq("companyId", companyId)
    .eq("active", true);

  if (locationId) {
    query = query.eq("locationId", locationId);
  }

  return query.order("name");
}

/** @mcp read */
export async function getEmployeeShifts(
  client: SupabaseClient<Database>,
  companyId: string
) {
  return client
    .from("employeeShift")
    .select("employeeId, shiftId")
    .eq("companyId", companyId);
}

/** @mcp read */
export async function getEmployeeDepartments(
  client: SupabaseClient<Database>,
  companyId: string
) {
  return client
    .from("employeeJob")
    .select("id, departmentId")
    .eq("companyId", companyId);
}

/** @mcp read */
export async function getShiftsWithTimes(
  client: SupabaseClient<Database>,
  companyId: string,
  locationId: string
) {
  return client
    .from("shift")
    .select(
      "id, name, startTime, endTime, monday, tuesday, wednesday, thursday, friday, saturday, sunday"
    )
    .eq("companyId", companyId)
    .eq("locationId", locationId)
    .eq("active", true)
    .order("name");
}

/** @mcp create */
export async function insertAttribute(
  client: SupabaseClient<Database>,
  attribute: {
    name: string;
    attributeDataTypeId: number;
    userAttributeCategoryId: string;
    listOptions?: string[];
    canSelfManage: boolean;
    createdBy: string;
  }
) {
  // TODO: there's got to be a better way to get the max
  const sortOrders = await client
    .from("userAttribute")
    .select("sortOrder")
    .eq("userAttributeCategoryId", attribute.userAttributeCategoryId);

  if (sortOrders.error) return sortOrders;
  const maxSortOrder = sortOrders.data.reduce((max, item) => {
    return Math.max(max, item.sortOrder);
  }, 0);

  return client
    .from("userAttribute")
    .upsert([{ ...attribute, sortOrder: maxSortOrder + 1 }])
    .select("id")
    .single();
}

/** @mcp create */
export async function insertAttributeCategory(
  client: SupabaseClient<Database>,
  attributeCategory: {
    name: string;
    emoji?: string;
    public: boolean;
    companyId: string;
    createdBy: string;
  }
) {
  return client
    .from("userAttributeCategory")
    .upsert([attributeCategory])
    .select("id")
    .single();
}

/** @mcp create */
export async function insertEmployeeJob(
  client: SupabaseClient<Database>,
  job: {
    id: string;
    companyId: string;
    locationId: string;
    enrollId?: string | null;
  }
) {
  return client
    .from("employeeJob")
    .insert({
      id: job.id,
      companyId: job.companyId,
      locationId: job.locationId,
      ...(job.enrollId ? { enrollId: job.enrollId } : {})
    })
    .select("*")
    .single();
}

/** @mcp update */
export async function updateAttribute(
  client: SupabaseClient<Database>,
  attribute: {
    id?: string;
    name: string;
    listOptions?: string[];
    canSelfManage: boolean;
    updatedBy: string;
  }
) {
  if (!attribute.id) throw new Error("id is required");
  return client
    .from("userAttribute")
    .update(
      sanitize({
        name: attribute.name,
        listOptions: attribute.listOptions,
        canSelfManage: attribute.canSelfManage,
        updatedBy: attribute.updatedBy
      })
    )
    .eq("id", attribute.id);
}

/** @mcp update */
export async function updateAttributeCategory(
  client: SupabaseClient<Database>,
  attributeCategory: {
    id: string;
    name: string;
    emoji?: string;
    public: boolean;
    updatedBy: string;
  }
) {
  const { id, ...update } = attributeCategory;
  return client
    .from("userAttributeCategory")
    .update(sanitize(update))
    .eq("id", id);
}

/** @mcp update */
export async function updateAttributeSortOrder(
  client: SupabaseClient<Database>,
  updates: {
    id: string;
    sortOrder: number;
    updatedBy: string;
  }[]
) {
  const updatePromises = updates.map(({ id, sortOrder, updatedBy }) =>
    client.from("userAttribute").update({ sortOrder, updatedBy }).eq("id", id)
  );
  return Promise.all(updatePromises);
}

/** @mcp update destructive */
export async function updateEmployeeJob(
  db: Kysely<KyselyDatabase>,
  employeeId: string,
  employeeJob: z.infer<typeof employeeJobValidator> & {
    companyId: string;
    updatedBy: string;
    customFields?: Json;
  }
) {
  // One Kysely transaction: the employeeJob update and the employeeShift
  // sync commit or roll back together. Kysely also bypasses RLS, so the
  // sync no longer silently no-ops for users without people_create/
  // people_delete — the route's people_update check is the auth gate.
  try {
    // sanitize() turns any absent field into null, and locationId is NOT NULL,
    // so a caller that omits it (the API/MCP tool leaves it optional) would
    // otherwise wipe a set location. Never write a falsy locationId — drop it
    // from the payload so the existing value is preserved.
    const sanitized = sanitize(employeeJob);
    // An explicit allow-list, never the caller's object: the API passes
    // `employeeJob` through with whatever keys were sent, and a spread into
    // Kysely's `.set()` (no RLS) would reach any column — `companyId` included.
    const updatePayload = {
      title: sanitized.title,
      startDate: sanitized.startDate,
      ...(sanitized.locationId ? { locationId: sanitized.locationId } : {}),
      shiftId: sanitized.shiftId,
      departmentId: sanitized.departmentId,
      managerId: sanitized.managerId,
      enrollId: sanitized.enrollId,
      ...("customFields" in sanitized
        ? { customFields: sanitized.customFields }
        : {}),
      updatedBy: sanitized.updatedBy
    };

    const { companyId } = employeeJob;

    await db.transaction().execute(async (trx) => {
      // Kysely bypasses RLS and every id below comes from the caller, so each
      // one is re-read under companyId: the single-column FKs would accept a
      // location, shift, department or manager from any company.
      const [employee, location, shift, department, manager] =
        await Promise.all([
          trx
            .selectFrom("employee")
            .select("id")
            .where("id", "=", employeeId)
            .where("companyId", "=", companyId)
            .executeTakeFirst(),
          updatePayload.locationId
            ? trx
                .selectFrom("location")
                .select("id")
                .where("id", "=", updatePayload.locationId)
                .where("companyId", "=", companyId)
                .executeTakeFirst()
            : null,
          employeeJob.shiftId
            ? trx
                .selectFrom("shift")
                .select("id")
                .where("id", "=", employeeJob.shiftId)
                .where("companyId", "=", companyId)
                .executeTakeFirst()
            : null,
          employeeJob.departmentId
            ? trx
                .selectFrom("department")
                .select("id")
                .where("id", "=", employeeJob.departmentId)
                .where("companyId", "=", companyId)
                .executeTakeFirst()
            : null,
          employeeJob.managerId
            ? trx
                .selectFrom("employee")
                .select("id")
                .where("id", "=", employeeJob.managerId)
                .where("companyId", "=", companyId)
                .executeTakeFirst()
            : null
        ]);
      if (!employee) throw new Error("Employee not found");
      if (updatePayload.locationId && !location) {
        throw new Error("Location not found");
      }
      if (employeeJob.shiftId && !shift) throw new Error("Shift not found");
      if (employeeJob.departmentId && !department) {
        throw new Error("Department not found");
      }
      if (employeeJob.managerId && !manager) {
        throw new Error("Manager not found");
      }

      const updated = await trx
        .updateTable("employeeJob")
        .set(updatePayload)
        .where("id", "=", employeeId)
        .where("companyId", "=", companyId)
        .executeTakeFirst();
      // No row means the employee is not in this company — stop before the
      // employeeShift insert below writes a row for a foreign user id.
      if (Number(updated.numUpdatedRows) === 0) {
        throw new Error("Employee not found");
      }

      // The scheduler reads shift assignments from employeeShift (see
      // getEmployeeShiftWindows in the schedule engine), NOT from
      // employeeJob.shiftId — keep them in sync so assigning a shift here
      // actually constrains ability-gated scheduling.
      await trx
        .deleteFrom("employeeShift")
        .where("employeeId", "=", employeeId)
        .where("companyId", "=", employeeJob.companyId)
        .execute();

      if (employeeJob.shiftId) {
        await trx
          .insertInto("employeeShift")
          .values({
            employeeId,
            shiftId: employeeJob.shiftId,
            companyId: employeeJob.companyId
          })
          .execute();
      }
    });
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: err as Error };
  }
}

/** @mcp upsert */
export async function upsertDepartment(
  client: SupabaseClient<Database>,
  department:
    | (Omit<z.infer<typeof departmentValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof departmentValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("id" in department) {
    return client
      .from("department")
      .update(sanitize(department))
      .eq("id", department.id);
  }
  return client.from("department").insert(department).select("*").single();
}

/** @mcp upsert */
export async function upsertHoliday(
  client: SupabaseClient<Database>,
  holiday:
    | (Omit<z.infer<typeof holidayValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof holidayValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in holiday) {
    return client.from("holiday").insert(holiday).select("*").single();
  }
  return client.from("holiday").update(sanitize(holiday)).eq("id", holiday.id);
}

/** @mcp upsert */
export async function upsertShift(
  client: SupabaseClient<Database>,
  shift:
    | (Omit<z.infer<typeof shiftValidator>, "id"> & {
        createdBy: string;
        companyId: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof shiftValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in shift) {
    return client.from("shift").insert([shift]).select("*").single();
  }
  return client.from("shift").update(sanitize(shift)).eq("id", shift.id);
}

/**
 * Replace timeCardEntry rows for an employee from the punch ledger pairing.
 * Pairing is per business day in company TZ so an open In never crosses midnight.
 */
export async function rebuildTimeCardEntries(
  client: SupabaseClient<Database>,
  args: {
    companyId: string;
    employeeId: string;
    actorUserId: string;
  }
) {
  const punchesResult = await client
    .from("timeCardPunch")
    .select("id, punchedAt, source, createdBy")
    .eq("companyId", args.companyId)
    .eq("employeeId", args.employeeId)
    .order("punchedAt", { ascending: true });

  if (punchesResult.error) {
    return { data: null, error: punchesResult.error };
  }

  const tz = await getCompanyTimeZone(client, args.companyId);
  const { segments } = pairPunchesByDay(punchesResult.data ?? [], (instant) =>
    datetime.businessDay(instant, tz).toString()
  );

  const del = await client
    .from("timeCardEntry")
    .delete()
    .eq("companyId", args.companyId)
    .eq("employeeId", args.employeeId);

  if (del.error) {
    return { data: null, error: del.error };
  }

  if (segments.length === 0) {
    return { data: [], error: null };
  }

  const rows = segments.map((segment) => ({
    companyId: args.companyId,
    employeeId: args.employeeId,
    clockIn: segment.clockIn.punchedAt,
    clockOut: segment.clockOut?.punchedAt ?? null,
    createdBy: segment.clockIn.createdBy || args.actorUserId,
    updatedBy: segment.clockOut ? args.actorUserId : null,
    updatedAt: segment.clockOut ? new Date().toISOString() : null
  }));

  const insert = await client.from("timeCardEntry").insert(rows).select("id");
  if (insert.error) {
    return { data: null, error: insert.error };
  }

  return { data: insert.data ?? [], error: null };
}

/** @mcp action */
export async function clockIn(
  client: SupabaseClient<Database>,
  args: {
    employeeId: string;
    companyId: string;
    createdBy: string;
  }
) {
  const existing = await getOpenClockEntry(
    client,
    args.employeeId,
    args.companyId
  );
  if (existing.data) {
    return { data: null, error: { message: "Already clocked in" } };
  }

  const insert = await client.from("timeCardPunch").insert({
    employeeId: args.employeeId,
    companyId: args.companyId,
    punchedAt: new Date().toISOString(),
    source: "mes",
    createdBy: args.createdBy
  });
  if (insert.error) {
    return { data: null, error: insert.error };
  }

  return rebuildTimeCardEntries(client, {
    companyId: args.companyId,
    employeeId: args.employeeId,
    actorUserId: args.createdBy
  });
}

/** @mcp action */
export async function clockOut(
  client: SupabaseClient<Database>,
  args: {
    employeeId: string;
    companyId: string;
    updatedBy: string;
    clockOut?: string;
    note?: string;
  }
) {
  const open = await getOpenClockEntry(client, args.employeeId, args.companyId);
  if (!open.data) {
    return { data: null, error: { message: "Not currently clocked in" } };
  }

  const insert = await client.from("timeCardPunch").insert({
    employeeId: args.employeeId,
    companyId: args.companyId,
    punchedAt: args.clockOut ?? new Date().toISOString(),
    source: "mes",
    note: args.note ?? null,
    createdBy: args.updatedBy
  });
  if (insert.error) {
    return { data: null, error: insert.error };
  }

  return rebuildTimeCardEntries(client, {
    companyId: args.companyId,
    employeeId: args.employeeId,
    actorUserId: args.updatedBy
  });
}

/** @mcp create */
export async function createTimeCardEntry(
  client: SupabaseClient<Database>,
  entry: {
    employeeId: string;
    companyId: string;
    clockIn: string;
    clockOut?: string | null;
    note?: string | null;
    createdBy: string;
  }
) {
  const punches: {
    employeeId: string;
    companyId: string;
    punchedAt: string;
    source: "manual";
    note: string | null;
    createdBy: string;
  }[] = [
    {
      employeeId: entry.employeeId,
      companyId: entry.companyId,
      punchedAt: entry.clockIn,
      source: "manual",
      note: entry.note ?? null,
      createdBy: entry.createdBy
    }
  ];
  if (entry.clockOut) {
    punches.push({
      employeeId: entry.employeeId,
      companyId: entry.companyId,
      punchedAt: entry.clockOut,
      source: "manual",
      note: null,
      createdBy: entry.createdBy
    });
  }

  const insert = await client.from("timeCardPunch").insert(punches);
  if (insert.error) {
    return { data: null, error: insert.error };
  }

  const rebuild = await rebuildTimeCardEntries(client, {
    companyId: entry.companyId,
    employeeId: entry.employeeId,
    actorUserId: entry.createdBy
  });
  if (rebuild.error) {
    return { data: null, error: rebuild.error };
  }

  const openOrLast = await client
    .from("timeCardEntry")
    .select("id")
    .eq("companyId", entry.companyId)
    .eq("employeeId", entry.employeeId)
    .eq("clockIn", entry.clockIn)
    .maybeSingle();

  return { data: openOrLast.data, error: openOrLast.error };
}

/** @mcp delete */
export async function deleteTimeCardEntry(
  client: SupabaseClient<Database>,
  entryId: string
) {
  return client.from("timeCardEntry").delete().eq("id", entryId);
}

/** @mcp read */
export async function getClockedInEmployees(
  client: SupabaseClient<Database>,
  companyId: string
) {
  return client
    .from("timeCardEntries")
    .select("*")
    .eq("companyId", companyId)
    .is("clockOut", null)
    .order("clockIn", { ascending: true });
}

/**
 * Currently clocked in iff the chronologically latest segment is still open.
 * An incomplete prior day (missing Out) is a punch error, not live status.
 */
/** @mcp read */
export async function getOpenClockEntry(
  client: SupabaseClient<Database>,
  employeeId: string,
  companyId: string
) {
  const latest = await client
    .from("timeCardEntry")
    .select("*")
    .eq("employeeId", employeeId)
    .eq("companyId", companyId)
    .order("clockIn", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest.error || !latest.data) {
    return latest;
  }
  if (latest.data.clockOut != null) {
    return { data: null, error: null };
  }
  return latest;
}

/** @mcp read */
export async function getRecentTimecards(
  client: SupabaseClient<Database>,
  companyId: string
) {
  return client
    .from("timeCardEntries")
    .select("*")
    .eq("companyId", companyId)
    .order("clockIn", { ascending: false })
    .limit(100);
}

/** @mcp read */
export async function getScheduledEmployeesToday(
  client: SupabaseClient<Database>,
  companyId: string
) {
  const { data } = await client
    .from("employeeJob")
    .select(
      "id, shiftId, shift:shift(id, name, startTime, endTime, sunday, monday, tuesday, wednesday, thursday, friday, saturday)"
    )
    .eq("companyId", companyId)
    .not("shiftId", "is", null);

  if (!data) return [];

  const dayNames = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday"
  ] as const;
  // "Today" on the company calendar — at 01:00 Monday local, UTC is still on
  // Sunday and must not roster Sunday's shift. en-US: 0 = Sunday.
  const tz = await getCompanyTimeZone(client, companyId);
  const dayName = dayNames[getDayOfWeek(today(tz), "en-US")];

  return data.filter((ej) => {
    const shift = ej.shift as Record<string, unknown> | null;
    return shift && shift[dayName] === true;
  });
}

/** @mcp read */
export async function getTimeCardEntry(
  client: SupabaseClient<Database>,
  entryId: string
) {
  return client.from("timeCardEntry").select("*").eq("id", entryId).single();
}

/** @mcp read */
export async function getTimeCardEntries(
  client: SupabaseClient<Database>,
  args: {
    employeeId: string;
    companyId: string;
    from?: string;
    to?: string;
  }
) {
  let query = client
    .from("timeCardEntry")
    .select("*")
    .eq("employeeId", args.employeeId)
    .eq("companyId", args.companyId)
    .order("clockIn", { ascending: false });

  if (args.from) {
    query = query.gte("clockIn", args.from);
  }
  if (args.to) {
    query = query.lte("clockIn", args.to);
  }

  return query;
}

/** @mcp read */
export async function getTimecardEntries(
  client: SupabaseClient<Database>,
  companyId: string,
  args: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("timeCardEntries")
    .select("*", { count: LIST_COUNT })
    .eq("companyId", companyId);

  if (args.search) {
    query = query.or(
      `firstName.ilike.%${args.search}%,lastName.ilike.%${args.search}%`
    );
  }

  query = setGenericQueryFilters(query, args, [
    { column: "clockIn", ascending: false }
  ]);

  return query;
}

/** @mcp read */
export async function getWeeklyHoursForEmployees(
  client: SupabaseClient<Database>,
  companyId: string,
  employeeIds: string[]
): Promise<Record<string, number>> {
  // Week starts Monday 00:00 on the company calendar (one payroll boundary
  // per books), not the server's.
  const tz = await getCompanyTimeZone(client, companyId);
  const { from } = datetime.weekBounds(tz);

  const { data: entries } = await client
    .from("timeCardEntry")
    .select("employeeId, clockIn, clockOut")
    .eq("companyId", companyId)
    .in("employeeId", employeeIds)
    .gte("clockIn", from);

  const weeklyMs: Record<string, number> = {};
  for (const entry of entries ?? []) {
    const end = entry.clockOut
      ? new Date(entry.clockOut).getTime()
      : Date.now();
    const ms = end - new Date(entry.clockIn).getTime();
    weeklyMs[entry.employeeId] = (weeklyMs[entry.employeeId] ?? 0) + ms;
  }

  return weeklyMs;
}

/** @mcp update */
export async function updateTimeCardEntry(
  client: SupabaseClient<Database>,
  args: {
    entryId: string;
    clockIn?: string;
    clockOut?: string | null;
    note?: string | null;
    updatedBy: string;
  }
) {
  return client
    .from("timeCardEntry")
    .update(
      sanitize({
        clockIn: args.clockIn,
        clockOut: args.clockOut,
        note: args.note,
        updatedBy: args.updatedBy,
        updatedAt: new Date().toISOString()
      })
    )
    .eq("id", args.entryId);
}

/** @mcp read */
export async function getTimeClockDevices(
  client: SupabaseClient<Database>,
  companyId: string
) {
  return client
    .from("timeClockDevice")
    .select("*")
    .eq("companyId", companyId)
    .order("serialNumber", { ascending: true });
}

/** @mcp read */
export async function getTimeClockDevice(
  client: SupabaseClient<Database>,
  id: string,
  companyId: string
) {
  return client
    .from("timeClockDevice")
    .select("*")
    .eq("id", id)
    .eq("companyId", companyId)
    .single();
}

/** @mcp update */
export async function updateTimeClockDevice(
  client: SupabaseClient<Database>,
  companyId: string,
  userId: string,
  input: {
    id: string;
    name?: string | null;
    enabled?: boolean;
    autoPoll?: boolean;
    pollIntervalSeconds?: number;
  }
) {
  // Do not sanitize the whole bag: unset optional fields become null and
  // would wipe NOT NULL columns (autoPoll, pollIntervalSeconds).
  const patch: {
    name?: string | null;
    enabled?: boolean;
    autoPoll?: boolean;
    pollIntervalSeconds?: number;
    updatedBy: string;
    updatedAt: string;
  } = {
    updatedBy: userId,
    updatedAt: new Date().toISOString()
  };
  if ("name" in input) patch.name = input.name ?? null;
  if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
  if (typeof input.autoPoll === "boolean") patch.autoPoll = input.autoPoll;
  if (typeof input.pollIntervalSeconds === "number") {
    patch.pollIntervalSeconds = input.pollIntervalSeconds;
  }

  return client
    .from("timeClockDevice")
    .update(patch)
    .eq("id", input.id)
    .eq("companyId", companyId)
    .select("*")
    .single();
}

/** @mcp read */
export async function getTimeClockPunches(
  client: SupabaseClient<Database>,
  companyId: string,
  args: {
    status?: string;
    deviceId?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  let query = client
    .from("timeClockPunch")
    .select("*", { count: "exact" })
    .eq("companyId", companyId)
    .order("punchedAt", { ascending: false });

  if (args.status) {
    query = query.eq("status", args.status);
  }
  if (args.deviceId) {
    query = query.eq("deviceId", args.deviceId);
  }
  if (args.limit !== undefined) {
    const from = args.offset ?? 0;
    query = query.range(from, from + args.limit - 1);
  }

  return query;
}

/**
 * Apply a staged hardware punch onto the timeCardPunch ledger and rebuild
 * timeCardEntry pairs. Used by reprocess action (gateway has its own copy).
 */
export async function applyTimeClockPunchToggle(
  client: SupabaseClient<Database>,
  args: {
    companyId: string;
    punchId: string;
    actorUserId: string;
  }
) {
  const punchResult = await client
    .from("timeClockPunch")
    .select("*")
    .eq("id", args.punchId)
    .eq("companyId", args.companyId)
    .single();

  if (punchResult.error || !punchResult.data) {
    return {
      data: null,
      error: punchResult.error ?? { message: "Punch not found" }
    };
  }

  const punch = punchResult.data;

  if (punch.status === "applied" || punch.status === "duplicate") {
    return { data: punch, error: null };
  }

  const deviceResult = await client
    .from("timeClockDevice")
    .select("id, enabled")
    .eq("id", punch.deviceId)
    .eq("companyId", args.companyId)
    .single();

  if (deviceResult.error || !deviceResult.data) {
    return {
      data: null,
      error: deviceResult.error ?? { message: "Device not found" }
    };
  }

  if (!deviceResult.data.enabled) {
    return client
      .from("timeClockPunch")
      .update({ status: "pending", error: null })
      .eq("id", punch.id)
      .eq("companyId", args.companyId)
      .select("*")
      .single();
  }

  const jobResult = await client
    .from("employeeJob")
    .select("id")
    .eq("companyId", args.companyId)
    .eq("enrollId", punch.enrollId)
    .maybeSingle();

  if (jobResult.error) {
    return { data: null, error: jobResult.error };
  }

  if (!jobResult.data) {
    return client
      .from("timeClockPunch")
      .update({
        status: "unmapped",
        employeeId: null,
        timeCardEntryId: null,
        error: "No employeeJob.enrollId match"
      })
      .eq("id", punch.id)
      .eq("companyId", args.companyId)
      .select("*")
      .single();
  }

  const employeeId = jobResult.data.id;

  const existingLedger = await client
    .from("timeCardPunch")
    .select("id")
    .eq("companyId", args.companyId)
    .eq("timeClockPunchId", punch.id)
    .maybeSingle();

  if (existingLedger.error) {
    return { data: null, error: existingLedger.error };
  }

  if (!existingLedger.data) {
    const ledgerInsert = await client.from("timeCardPunch").insert({
      companyId: args.companyId,
      employeeId,
      punchedAt: punch.punchedAt,
      source: "hardware",
      timeClockPunchId: punch.id,
      createdBy: args.actorUserId
    });
    if (ledgerInsert.error) {
      return { data: null, error: ledgerInsert.error };
    }
  }

  const rebuild = await rebuildTimeCardEntries(client, {
    companyId: args.companyId,
    employeeId,
    actorUserId: args.actorUserId
  });
  if (rebuild.error) {
    return { data: null, error: rebuild.error };
  }

  const entryMatch = await client
    .from("timeCardEntry")
    .select("id")
    .eq("companyId", args.companyId)
    .eq("employeeId", employeeId)
    .or(`clockIn.eq.${punch.punchedAt},clockOut.eq.${punch.punchedAt}`)
    .maybeSingle();

  return client
    .from("timeClockPunch")
    .update({
      status: "applied",
      employeeId,
      timeCardEntryId: entryMatch.data?.id ?? null,
      error: null
    })
    .eq("id", punch.id)
    .eq("companyId", args.companyId)
    .select("*")
    .single();
}

/** @mcp update */
export async function reprocessTimeClockPunch(
  client: SupabaseClient<Database>,
  companyId: string,
  punchId: string,
  userId: string
) {
  return applyTimeClockPunchToggle(client, {
    companyId,
    punchId,
    actorUserId: userId
  });
}

/** @mcp read */
export async function getTimeCardPunches(
  client: SupabaseClient<Database>,
  companyId: string,
  args: {
    employeeId: string;
    startIso: string;
    endIso: string;
  }
) {
  return client
    .from("timeCardPunch")
    .select("*")
    .eq("companyId", companyId)
    .eq("employeeId", args.employeeId)
    .gte("punchedAt", args.startIso)
    .lte("punchedAt", args.endIso)
    .order("punchedAt", { ascending: true });
}

/** @mcp create */
export async function createTimeCardPunch(
  client: SupabaseClient<Database>,
  args: {
    companyId: string;
    employeeId: string;
    punchedAt: string;
    source?: "manual" | "mes";
    note?: string | null;
    createdBy: string;
  }
) {
  const insert = await client
    .from("timeCardPunch")
    .insert({
      companyId: args.companyId,
      employeeId: args.employeeId,
      punchedAt: args.punchedAt,
      source: args.source ?? "manual",
      note: args.note ?? null,
      createdBy: args.createdBy
    })
    .select("*")
    .single();

  if (insert.error) {
    return insert;
  }

  const rebuild = await rebuildTimeCardEntries(client, {
    companyId: args.companyId,
    employeeId: args.employeeId,
    actorUserId: args.createdBy
  });
  if (rebuild.error) {
    return { data: null, error: rebuild.error };
  }

  return insert;
}

/** @mcp update */
export async function updateTimeCardPunch(
  client: SupabaseClient<Database>,
  args: {
    companyId: string;
    id: string;
    punchedAt?: string;
    note?: string | null;
    updatedBy: string;
  }
) {
  const existing = await client
    .from("timeCardPunch")
    .select("*")
    .eq("id", args.id)
    .eq("companyId", args.companyId)
    .single();

  if (existing.error || !existing.data) {
    return {
      data: null,
      error: existing.error ?? { message: "Punch not found" }
    };
  }

  const patch: {
    punchedAt?: string;
    note?: string | null;
    updatedBy: string;
    updatedAt: string;
  } = {
    updatedBy: args.updatedBy,
    updatedAt: new Date().toISOString()
  };
  if (args.punchedAt !== undefined) patch.punchedAt = args.punchedAt;
  if (args.note !== undefined) patch.note = args.note;

  const update = await client
    .from("timeCardPunch")
    .update(patch)
    .eq("id", args.id)
    .eq("companyId", args.companyId)
    .select("*")
    .single();

  if (update.error || !update.data) {
    return update;
  }

  const rebuild = await rebuildTimeCardEntries(client, {
    companyId: args.companyId,
    employeeId: existing.data.employeeId,
    actorUserId: args.updatedBy
  });
  if (rebuild.error) {
    return { data: null, error: rebuild.error };
  }

  return update;
}

/** @mcp delete */
export async function deleteTimeCardPunch(
  client: SupabaseClient<Database>,
  args: {
    companyId: string;
    id: string;
    actorUserId: string;
  }
) {
  const existing = await client
    .from("timeCardPunch")
    .select("*")
    .eq("id", args.id)
    .eq("companyId", args.companyId)
    .single();

  if (existing.error || !existing.data) {
    return {
      data: null,
      error: existing.error ?? { message: "Punch not found" }
    };
  }

  const del = await client
    .from("timeCardPunch")
    .delete()
    .eq("id", args.id)
    .eq("companyId", args.companyId);

  if (del.error) {
    return { data: null, error: del.error };
  }

  return rebuildTimeCardEntries(client, {
    companyId: args.companyId,
    employeeId: existing.data.employeeId,
    actorUserId: args.actorUserId
  });
}
