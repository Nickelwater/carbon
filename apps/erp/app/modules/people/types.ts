import type {
  getAttribute,
  getAttributeCategories,
  getAttributeCategory,
  getDepartments,
  getEmployeeJob,
  getEmployeeSummary,
  getHolidays,
  getPeople,
  getShifts,
  getTraining,
  getTrainingAssignment,
  getTrainingQuestions,
  getTrainings,
} from "./people.service";
import type { trainingAssignmentStatusOptions, trainingFrequency } from "./people.models";

export type Attribute = NonNullable<
  Awaited<ReturnType<typeof getAttribute>>["data"]
>;

export type AttributeCategory = NonNullable<
  Awaited<ReturnType<typeof getAttributeCategories>>["data"]
>[number];

export type AttributeCategoryDetailType = NonNullable<
  Awaited<ReturnType<typeof getAttributeCategory>>["data"]
>;

export type AttributeDataType = {
  id: number;
  label: string;
  isBoolean: boolean;
  isDate: boolean;
  isList: boolean;
  isNumeric: boolean;
  isText: boolean;
  isUser: boolean;
  isCustomer: boolean;
  isSupplier: boolean;
};

export type Department = NonNullable<
  Awaited<ReturnType<typeof getDepartments>>["data"]
>[number];

export type EmployeeJob = NonNullable<
  Awaited<ReturnType<typeof getEmployeeJob>>["data"]
>;

export type EmployeeSummary = NonNullable<
  Awaited<ReturnType<typeof getEmployeeSummary>>["data"]
>;

export type Holiday = NonNullable<
  Awaited<ReturnType<typeof getHolidays>>["data"]
>[number];

export type Person = NonNullable<
  Awaited<ReturnType<typeof getPeople>>["data"]
>[number];

export type Shift = NonNullable<
  Awaited<ReturnType<typeof getShifts>>["data"]
>[number];

export type Training = NonNullable<
  Awaited<ReturnType<typeof getTraining>>["data"]
>;

export type TrainingListItem = NonNullable<
  Awaited<ReturnType<typeof getTrainings>>["data"]
>[number];

export type TrainingQuestion = NonNullable<
  Awaited<ReturnType<typeof getTrainingQuestions>>["data"]
>[number];

export type TrainingAssignmentStatusItem = {
  trainingAssignmentId: string;
  trainingId: string;
  trainingName: string;
  frequency: (typeof trainingFrequency)[number];
  trainingType: "Mandatory" | "Optional";
  employeeId: string;
  employeeName: string | null;
  avatarUrl: string | null;
  employeeStartDate: string | null;
  companyId: string;
  currentPeriod: string | null;
  completionId: number | null;
  completedAt: string | null;
  status: (typeof trainingAssignmentStatusOptions)[number];
};

export type TrainingAssignmentSummaryItem = {
  trainingId: string;
  trainingName: string;
  frequency: (typeof trainingFrequency)[number];
  currentPeriod: string | null;
  totalAssigned: number;
  completed: number;
  pending: number;
  overdue: number;
  completionPercent: number;
};

export type TrainingAssignment = NonNullable<
  Awaited<ReturnType<typeof getTrainingAssignment>>["data"]
>;
