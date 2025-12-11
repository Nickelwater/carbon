import { z } from "zod/v3";
import { zfd } from "zod-form-data";
import { DataType } from "~/modules/shared";

export const attributeValidator = z
  .object({
    id: zfd.text(z.string().optional()),
    name: z.string().min(1, { message: "Name is required" }),
    userAttributeCategoryId: z.string().min(20),
    attributeDataTypeId: zfd.numeric(),
    listOptions: z.string().min(1).array().optional(),
    canSelfManage: zfd.checkbox(),
  })
  .refine((input) => {
    // allows bar to be optional only when foo is 'foo'
    if (
      input.attributeDataTypeId === DataType.List &&
      (input.listOptions === undefined ||
        input.listOptions.length === 0 ||
        input.listOptions.some((option) => option.length === 0))
    )
      return false;

    return true;
  });

export const attributeCategoryValidator = z.object({
  id: zfd.text(z.string().optional()),
  name: z.string().min(1, { message: "Name is required" }),
  emoji: zfd.text(z.string().optional()),
  isPublic: zfd.checkbox(),
});

export const departmentValidator = z.object({
  id: zfd.text(z.string().optional()),
  name: z.string().min(1, { message: "Name is required" }),
  parentDepartmentId: zfd.text(z.string().optional()),
});

export const employeeJobValidator = z.object({
  title: zfd.text(z.string().optional()),
  startDate: zfd.text(z.string().optional()),
  locationId: zfd.text(z.string().optional()),
  shiftId: zfd.text(z.string().optional()),
  managerId: zfd.text(z.string().optional()),
});

export const holidayValidator = z.object({
  id: zfd.text(z.string().optional()),
  name: z.string().min(1, { message: "Name is required" }),
  date: z.string().min(1, { message: "Date is required" }),
});

export const shiftValidator = z.object({
  id: zfd.text(z.string().optional()),
  name: z.string().min(1, { message: "Name is required" }),
  startTime: z.string().min(1, { message: "Start time is required" }),
  endTime: z.string().min(1, { message: "End time is required" }),
  locationId: z.string().min(1, { message: "Location is required" }),
  monday: zfd.checkbox(),
  tuesday: zfd.checkbox(),
  wednesday: zfd.checkbox(),
  thursday: zfd.checkbox(),
  friday: zfd.checkbox(),
  saturday: zfd.checkbox(),
  sunday: zfd.checkbox(),
});

export const trainingStatus = ["Draft", "Active", "Archived"] as const;
export const trainingFrequency = ["Once", "Quarterly", "Annual"] as const;
export const trainingType = ["Mandatory", "Optional"] as const;
export const trainingQuestionType = [
  "MultipleChoice",
  "TrueFalse",
  "MultipleAnswers",
  "MatchingPairs",
  "Numerical",
] as const;

export const trainingValidator = z.object({
  id: zfd.text(z.string().optional()),
  name: z.string().min(1, { message: "Name is required" }),
  content: zfd.text(z.string().optional()),
});

export const trainingQuestionValidator = z
  .object({
    id: zfd.text(z.string().optional()),
    trainingId: z.string().min(1, { message: "Training is required" }),
    question: z.string().min(1, { message: "Question is required" }),
    type: z.enum(trainingQuestionType, {
      errorMap: () => ({ message: "Type is required" }),
    }),
    sortOrder: zfd.numeric(z.number().min(0).optional()),
    required: zfd.checkbox().optional(),

    // For MultipleChoice and MultipleAnswers
    options: z.array(z.string()).optional(),
    // Accept string (from Select) or array (from MultiSelect), normalize to array
    correctAnswers: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((val) => {
        if (!val) return undefined;
        if (Array.isArray(val)) return val.filter((v) => v.trim() !== "");
        return val.trim() !== "" ? [val] : undefined;
      }),

    // For TrueFalse - accept string "true"/"false" and transform to boolean
    correctBoolean: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((val) => {
        if (typeof val === "boolean") return val;
        if (typeof val === "string") return val === "true";
        return false;
      }),

    // For MatchingPairs - stored as JSON string
    matchingPairs: zfd.text(z.string().optional()),

    // For Numerical
    correctNumber: zfd.numeric(z.number().optional()),
    tolerance: zfd.numeric(z.number().min(0).optional()),
  })
  .refine(
    (data) => {
      if (data.type === "MultipleChoice" || data.type === "MultipleAnswers") {
        return (
          !!data.options &&
          data.options.length >= 2 &&
          data.options.every((option) => option.trim() !== "")
        );
      }
      return true;
    },
    {
      message: "At least 2 options are required",
      path: ["options"],
    }
  )
  .refine(
    (data) => {
      if (data.type === "MultipleChoice") {
        return !!data.correctAnswers && data.correctAnswers.length === 1;
      }
      return true;
    },
    {
      message: "Exactly one correct answer is required for multiple choice",
      path: ["correctAnswers"],
    }
  )
  .refine(
    (data) => {
      if (data.type === "MultipleAnswers") {
        return !!data.correctAnswers && data.correctAnswers.length >= 1;
      }
      return true;
    },
    {
      message: "At least one correct answer is required",
      path: ["correctAnswers"],
    }
  )
  .refine(
    (data) => {
      if (data.type === "MatchingPairs") {
        if (!data.matchingPairs) return false;
        try {
          const pairs = JSON.parse(data.matchingPairs);
          return (
            Array.isArray(pairs) &&
            pairs.length >= 2 &&
            pairs.every(
              (pair: { left?: string; right?: string }) =>
                pair.left?.trim() && pair.right?.trim()
            )
          );
        } catch {
          return false;
        }
      }
      return true;
    },
    {
      message: "At least 2 matching pairs are required",
      path: ["matchingPairs"],
    }
  )
  .refine(
    (data) => {
      if (data.type === "Numerical") {
        return data.correctNumber !== undefined && data.correctNumber !== null;
      }
      return true;
    },
    {
      message: "Correct number is required",
      path: ["correctNumber"],
    }
  );

export const trainingAssignmentValidator = z.object({
  id: zfd.text(z.string().optional()),
  trainingId: z.string().min(1, { message: "Training is required" }),
  groupIds: z.array(z.string()).min(1, { message: "At least one group is required" }),
});

export const trainingCompletionValidator = z.object({
  trainingAssignmentId: z.string().min(1, { message: "Training assignment is required" }),
  employeeId: z.string().min(1, { message: "Employee is required" }),
  period: zfd.text(z.string().optional()),
});

export const trainingAssignmentStatusOptions = [
  "Completed",
  "Pending",
  "Overdue",
  "Not Required",
] as const;
