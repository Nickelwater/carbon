import type { Database, Json } from "@carbon/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod/v3";
import type { DataType } from "~/modules/shared";
import type { Employee } from "~/modules/users";
import { getEmployees } from "~/modules/users/users.service";
import type { GenericQueryFilters } from "~/utils/query";
import { setGenericQueryFilters } from "~/utils/query";
import { sanitize } from "~/utils/supabase";
import type {
  departmentValidator,
  employeeJobValidator,
  holidayValidator,
  shiftValidator,
  trainingQuestionValidator,
  trainingValidator,
} from "./people.models";

export async function deleteAttribute(
  client: SupabaseClient<Database>,
  attributeId: string
) {
  return client
    .from("userAttribute")
    .update({ active: false })
    .eq("id", attributeId);
}

export async function deleteAttributeCategory(
  client: SupabaseClient<Database>,
  attributeCategoryId: string
) {
  return client
    .from("userAttributeCategory")
    .update({ active: false })
    .eq("id", attributeCategoryId);
}

export async function deleteDepartment(
  client: SupabaseClient<Database>,
  departmentId: string
) {
  return client.from("department").delete().eq("id", departmentId);
}

export async function deleteHoliday(
  client: SupabaseClient<Database>,
  holidayId: string
) {
  return client.from("holiday").delete().eq("id", holidayId);
}

export async function deleteShift(
  client: SupabaseClient<Database>,
  shiftId: string
) {
  // TODO: Set all employeeShifts to null
  return client.from("shift").update({ active: false }).eq("id", shiftId);
}

export async function deleteTraining(
  client: SupabaseClient<Database>,
  trainingId: string
) {
  return client.from("training").delete().eq("id", trainingId);
}

export async function deleteTrainingQuestion(
  client: SupabaseClient<Database>,
  trainingQuestionId: string,
  companyId: string
) {
  return client
    .from("trainingQuestion")
    .delete()
    .eq("id", trainingQuestionId)
    .eq("companyId", companyId);
}

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
        attributeDataType(id, isBoolean, isDate, isNumeric, isText, isUser),
        userAttributeValue(
          id, userId, valueBoolean, valueDate, valueNumeric, valueText, valueUser, user!userAttributeValue_userId_fkey(id, fullName, avatarUrl)
        )
      )`
    )
    .eq("companyId", companyId)
    .eq("userAttribute.active", true)
    .in("userAttribute.userAttributeValue.userId", userIds)
    .order("sortOrder", { foreignTable: "userAttribute", ascending: true });
}

export async function getAttributeCategories(
  client: SupabaseClient<Database>,
  companyId: string,
  args?: { search: string | null } & GenericQueryFilters
) {
  let query = client
    .from("userAttributeCategory")
    .select("*, userAttribute(id, name, attributeDataType(id))", {
      count: "exact",
    })
    .eq("companyId", companyId)
    .eq("active", true)
    .eq("userAttribute.active", true);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "name", ascending: true },
    ]);
  }

  return query;
}

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
        attributeDataType(id, label,  isBoolean, isDate, isList, isNumeric, isText, isUser ))
      `,
      {
        count: "exact",
      }
    )
    .eq("id", id)
    .eq("active", true)
    .eq("userAttribute.active", true)
    .single();
}

export async function getAttributeDataTypes(client: SupabaseClient<Database>) {
  return client.from("attributeDataType").select("*");
}

export async function getDepartment(
  client: SupabaseClient<Database>,
  departmentId: string
) {
  return client.from("department").select("*").eq("id", departmentId).single();
}

export async function getDepartments(
  client: SupabaseClient<Database>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("department")
    .select(`*, department(id, name)`, {
      count: "exact",
    })
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "name", ascending: true },
    ]);
  }

  return query;
}

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

export async function getHoliday(
  client: SupabaseClient<Database>,
  holidayId: string
) {
  return client.from("holiday").select("*").eq("id", holidayId).single();
}

export async function getHolidays(
  client: SupabaseClient<Database>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("holiday")
    .select("*", {
      count: "exact",
    })
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "date", ascending: true },
    ]);
  }

  return query;
}

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
        category.userAttribute.forEach(
          // @ts-ignore
          (attribute) => {
            if (
              attribute.userAttributeValue &&
              Array.isArray(attribute.userAttributeValue) &&
              !Array.isArray(attribute.attributeDataType)
            ) {
              const userAttributeId = attribute.id;
              const userAttributeValue = attribute.userAttributeValue.find(
                // @ts-ignore
                (attributeValue) => attributeValue.userId === userId
              );
              const value =
                typeof userAttributeValue?.valueBoolean === "boolean"
                  ? userAttributeValue.valueBoolean
                  : userAttributeValue?.valueDate ||
                    userAttributeValue?.valueNumeric ||
                    userAttributeValue?.valueText ||
                    userAttributeValue?.valueUser;

              if (value && userAttributeValue?.id) {
                acc[userAttributeId] = {
                  userAttributeValueId: userAttributeValue.id,
                  // @ts-ignore
                  dataType: attribute.attributeDataType?.id as DataType,
                  value,
                  user: !Array.isArray(userAttributeValue.user)
                    ? userAttributeValue.user
                    : undefined,
                };
              }
            }
          }
        );
        return acc;
      }, {});

    return {
      ...employee,
      attributes: employeeAttributes,
    };
  });

  return {
    count: employees.count,
    data: people,
    error: null,
  };
}

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

export async function getShifts(
  client: SupabaseClient<Database>,
  companyId: string,
  args: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("shifts")
    .select("*", {
      count: "exact",
    })
    .eq("companyId", companyId)
    .eq("active", true);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "locationId", ascending: true },
  ]);
  return query;
}

export async function getShiftsList(
  client: SupabaseClient<Database>,
  locationId: string | null
) {
  let query = client.from("shift").select(`id, name`).eq("active", true);

  if (locationId) {
    query = query.eq("locationId", locationId);
  }

  return query.order("name");
}

export async function getTraining(
  client: SupabaseClient<Database>,
  id: string
) {
  return client
    .from("training")
    .select("*, trainingQuestion(*)")
    .eq("id", id)
    .single();
}

export async function getTrainingQuestions(
  client: SupabaseClient<Database>,
  trainingId: string
) {
  return client
    .from("trainingQuestion")
    .select("*")
    .eq("trainingId", trainingId)
    .order("sortOrder", { ascending: true });
}

export async function getTrainings(
  client: SupabaseClient<Database>,
  companyId: string,
  args?: { search: string | null } & GenericQueryFilters
) {
  let query = client
    .from("trainings")
    .select("*", {
      count: "exact",
    })
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "name", ascending: true },
    ]);
  }

  return query;
}

export async function getTrainingsList(
  client: SupabaseClient<Database>,
  companyId: string
) {
  return client
    .from("training")
    .select("id, name, status")
    .eq("companyId", companyId)
    .eq("status", "Active")
    .order("name", { ascending: true });
}

export async function getTrainingAssignmentStatus(
  client: SupabaseClient<Database>,
  companyId: string,
  args?: {
    trainingId?: string;
    status?: "Completed" | "Pending" | "Overdue" | "Not Required";
    search?: string;
  } & GenericQueryFilters
) {
  const { data, error } = await client.rpc("get_training_assignment_status", {
    p_company_id: companyId,
  });

  if (error) return { data: null, error, count: null };

  let filteredData = data ?? [];

  // Apply filters in memory since we're using an RPC function
  if (args?.trainingId) {
    filteredData = filteredData.filter((d) => d.trainingId === args.trainingId);
  }
  if (args?.status) {
    filteredData = filteredData.filter((d) => d.status === args.status);
  }
  if (args?.search) {
    const searchLower = args.search.toLowerCase();
    filteredData = filteredData.filter(
      (d) =>
        d.trainingName?.toLowerCase().includes(searchLower) ||
        d.employeeName?.toLowerCase().includes(searchLower)
    );
  }

  // Apply sorting
  const sortColumn = args?.sorts?.[0]?.sortBy ?? "employeeName";
  const sortAsc = args?.sorts?.[0]?.sortAsc ?? true;
  filteredData.sort((a, b) => {
    const aVal = a[sortColumn as keyof typeof a] ?? "";
    const bVal = b[sortColumn as keyof typeof b] ?? "";
    if (aVal < bVal) return sortAsc ? -1 : 1;
    if (aVal > bVal) return sortAsc ? 1 : -1;
    return 0;
  });

  // Apply pagination
  const count = filteredData.length;
  if (args?.limit) {
    const offset = args.offset ?? 0;
    filteredData = filteredData.slice(offset, offset + args.limit);
  }

  return { data: filteredData, error: null, count };
}

export async function getTrainingAssignmentSummary(
  client: SupabaseClient<Database>,
  companyId: string
) {
  return client.rpc("get_training_assignment_summary", {
    p_company_id: companyId,
  });
}

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

export async function insertEmployeeJob(
  client: SupabaseClient<Database>,
  job: {
    id: string;
    companyId: string;
    locationId?: string;
  }
) {
  return client.from("employeeJob").insert(job).select("*").single();
}

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
        updatedBy: attribute.updatedBy,
      })
    )
    .eq("id", attribute.id);
}

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

export async function updateEmployeeJob(
  client: SupabaseClient<Database>,
  employeeId: string,
  employeeJob: z.infer<typeof employeeJobValidator> & {
    companyId: string;
    updatedBy: string;
    customFields?: Json;
  }
) {
  return client
    .from("employeeJob")
    .update(sanitize(employeeJob))
    .eq("id", employeeId)
    .eq("companyId", employeeJob.companyId);
}

export async function updateTrainingQuestionOrder(
  client: SupabaseClient<Database>,
  updates: {
    id: string;
    sortOrder: number;
    updatedBy: string;
  }[]
) {
  const updatePromises = updates.map(({ id, sortOrder, updatedBy }) =>
    client
      .from("trainingQuestion")
      .update({ sortOrder, updatedBy })
      .eq("id", id)
  );
  return Promise.all(updatePromises);
}

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

export async function upsertTraining(
  client: SupabaseClient<Database>,
  training:
    | (Omit<z.infer<typeof trainingValidator>, "id"> & {
        companyId: string;
        createdBy: string;
      })
    | (Omit<z.infer<typeof trainingValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  if ("id" in training) {
    return client
      .from("training")
      .update(sanitize(training))
      .eq("id", training.id)
      .select("id")
      .single();
  }

  return client.from("training").insert([training]).select("id").single();
}

export async function upsertTrainingQuestion(
  client: SupabaseClient<Database>,
  trainingQuestion:
    | (Omit<z.infer<typeof trainingQuestionValidator>, "id"> & {
        companyId: string;
        createdBy: string;
      })
    | (Omit<z.infer<typeof trainingQuestionValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  if ("id" in trainingQuestion) {
    return client
      .from("trainingQuestion")
      .update(sanitize(trainingQuestion))
      .eq("id", trainingQuestion.id)
      .select("id")
      .single();
  }
  return client
    .from("trainingQuestion")
    .insert([trainingQuestion])
    .select("id")
    .single();
}

export async function upsertTrainingAssignment(
  client: SupabaseClient<Database>,
  assignment: {
    id?: string;
    trainingId: string;
    groupIds: string[];
    companyId: string;
    createdBy?: string;
    updatedBy?: string;
  }
) {
  if (assignment.id) {
    return client
      .from("trainingAssignment")
      .update({
        groupIds: assignment.groupIds,
        updatedBy: assignment.updatedBy,
      })
      .eq("id", assignment.id)
      .select("id")
      .single();
  }
  return client
    .from("trainingAssignment")
    .insert({
      trainingId: assignment.trainingId,
      groupIds: assignment.groupIds,
      companyId: assignment.companyId,
      createdBy: assignment.createdBy!,
    })
    .select("id")
    .single();
}

export async function insertTrainingCompletion(
  client: SupabaseClient<Database>,
  completion: {
    trainingAssignmentId: string;
    employeeId: string;
    period: string | null;
    companyId: string;
    completedBy: string;
    createdBy: string;
  }
) {
  return client
    .from("trainingCompletion")
    .insert({
      ...completion,
      completedAt: new Date().toISOString(),
    })
    .select("id")
    .single();
}

export async function getTrainingAssignment(
  client: SupabaseClient<Database>,
  assignmentId: string
) {
  return client
    .from("trainingAssignment")
    .select("*, training(id, name, frequency, type, status)")
    .eq("id", assignmentId)
    .single();
}

export async function getTrainingAssignments(
  client: SupabaseClient<Database>,
  companyId: string,
  trainingId?: string
) {
  let query = client
    .from("trainingAssignment")
    .select("*, training(id, name, frequency)")
    .eq("companyId", companyId);

  if (trainingId) {
    query = query.eq("trainingId", trainingId);
  }

  return query;
}

export async function deleteTrainingAssignment(
  client: SupabaseClient<Database>,
  assignmentId: string
) {
  return client.from("trainingAssignment").delete().eq("id", assignmentId);
}

export async function getTrainingAssignmentForCompletion(
  client: SupabaseClient<Database>,
  assignmentId: string
) {
  return client
    .from("trainingAssignment")
    .select(
      `*,
      training(
        id,
        name,
        description,
        content,
        frequency,
        type,
        status,
        estimatedDuration,
        trainingQuestion(*)
      )`
    )
    .eq("id", assignmentId)
    .single();
}

export async function getOutstandingTrainingsForUser(
  client: SupabaseClient<Database>,
  companyId: string,
  employeeId: string
) {
  const { data, error } = await client.rpc("get_training_assignment_status", {
    p_company_id: companyId,
  });

  if (error) return { data: null, error };

  // Filter to this employee's pending/overdue trainings
  const filteredData = (data ?? [])
    .filter(
      (d) =>
        d.employeeId === employeeId &&
        (d.status === "Pending" || d.status === "Overdue")
    )
    .sort((a, b) => {
      // Overdue first
      if (a.status === "Overdue" && b.status !== "Overdue") return -1;
      if (a.status !== "Overdue" && b.status === "Overdue") return 1;
      return 0;
    });

  return { data: filteredData, error: null };
}
