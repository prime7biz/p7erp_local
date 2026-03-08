import { db } from "../db";
import { eq, and, desc, sql, count } from "drizzle-orm";
import {
  qcParameters, qcTemplates, qcTemplateParameters,
  qcInspections2, qcInspectionResults2, qcHoldReleases,
  labTests, capaActions, returnRequests, returnRequestLines,
  InsertQcParameter, InsertQcTemplate, InsertQcTemplateParameter,
  InsertQcInspection2, InsertQcInspectionResult, InsertQcHoldRelease,
  InsertLabTest, InsertCapaAction, InsertReturnRequest, InsertReturnRequestLine,
} from "@shared/schema";

export async function createQcParameter(data: InsertQcParameter) {
  const [result] = await db.insert(qcParameters).values(data).returning();
  return result;
}

export async function listQcParameters(tenantId: number) {
  return db.select().from(qcParameters).where(eq(qcParameters.tenantId, tenantId)).orderBy(desc(qcParameters.createdAt));
}

export async function getQcParameter(tenantId: number, id: number) {
  const [result] = await db.select().from(qcParameters).where(and(eq(qcParameters.id, id), eq(qcParameters.tenantId, tenantId)));
  if (!result) throw new Error("QC Parameter not found");
  return result;
}

export async function updateQcParameter(tenantId: number, id: number, data: Partial<InsertQcParameter>) {
  const [result] = await db.update(qcParameters).set(data).where(and(eq(qcParameters.id, id), eq(qcParameters.tenantId, tenantId))).returning();
  if (!result) throw new Error("QC Parameter not found");
  return result;
}

export async function createQcTemplate(data: InsertQcTemplate) {
  const [result] = await db.insert(qcTemplates).values(data).returning();
  return result;
}

export async function listQcTemplates(tenantId: number) {
  return db.select().from(qcTemplates).where(eq(qcTemplates.tenantId, tenantId)).orderBy(desc(qcTemplates.createdAt));
}

export async function getQcTemplate(tenantId: number, id: number) {
  const [template] = await db.select().from(qcTemplates).where(and(eq(qcTemplates.id, id), eq(qcTemplates.tenantId, tenantId)));
  if (!template) throw new Error("QC Template not found");
  const params = await db.select().from(qcTemplateParameters).where(eq(qcTemplateParameters.templateId, id)).orderBy(qcTemplateParameters.sortOrder);
  return { ...template, parameters: params };
}

export async function updateQcTemplate(tenantId: number, id: number, data: Partial<InsertQcTemplate>) {
  const [result] = await db.update(qcTemplates).set(data).where(and(eq(qcTemplates.id, id), eq(qcTemplates.tenantId, tenantId))).returning();
  if (!result) throw new Error("QC Template not found");
  return result;
}

export async function addTemplateParameters(templateId: number, params: InsertQcTemplateParameter[]) {
  if (!params.length) return [];
  const values = params.map(p => ({ ...p, templateId }));
  return db.insert(qcTemplateParameters).values(values).returning();
}

export async function removeTemplateParameter(templateId: number, parameterId: number) {
  await db.delete(qcTemplateParameters).where(and(eq(qcTemplateParameters.templateId, templateId), eq(qcTemplateParameters.parameterId, parameterId)));
}

async function generateNumber(prefix: string, tenantId: number, table: any, field: any): Promise<string> {
  const result = await db.select({ cnt: count() }).from(table).where(eq(table.tenantId, tenantId));
  const num = (result[0]?.cnt || 0) + 1;
  return `${prefix}-${String(num).padStart(5, "0")}`;
}

export async function createQcInspection(data: InsertQcInspection2) {
  if (!data.inspectionNumber) {
    data.inspectionNumber = await generateNumber("QCI", data.tenantId, qcInspections2, qcInspections2.tenantId);
  }
  const [result] = await db.insert(qcInspections2).values(data).returning();
  return result;
}

export async function listQcInspections(tenantId: number, filters?: { inspectionType?: string; status?: string; overallResult?: string }) {
  let conditions = [eq(qcInspections2.tenantId, tenantId)];
  if (filters?.inspectionType) conditions.push(eq(qcInspections2.inspectionType, filters.inspectionType));
  if (filters?.status) conditions.push(eq(qcInspections2.status, filters.status));
  if (filters?.overallResult) conditions.push(eq(qcInspections2.overallResult, filters.overallResult));
  return db.select().from(qcInspections2).where(and(...conditions)).orderBy(desc(qcInspections2.createdAt));
}

export async function getQcInspection(tenantId: number, id: number) {
  const [inspection] = await db.select().from(qcInspections2).where(and(eq(qcInspections2.id, id), eq(qcInspections2.tenantId, tenantId)));
  if (!inspection) throw new Error("Inspection not found");
  const results = await db.select().from(qcInspectionResults2).where(and(eq(qcInspectionResults2.inspectionId, id), eq(qcInspectionResults2.tenantId, tenantId)));
  return { ...inspection, results };
}

export async function updateQcInspection(tenantId: number, id: number, data: Partial<InsertQcInspection2>) {
  const [result] = await db.update(qcInspections2).set(data).where(and(eq(qcInspections2.id, id), eq(qcInspections2.tenantId, tenantId))).returning();
  if (!result) throw new Error("Inspection not found");
  return result;
}

export async function completeInspection(tenantId: number, id: number, results: InsertQcInspectionResult[], overallResult: string, userId: number) {
  if (results.length > 0) {
    await db.insert(qcInspectionResults2).values(results.map(r => ({ ...r, inspectionId: id, tenantId })));
  }
  const passedCount = results.filter(r => r.result === "PASS").length;
  const failedCount = results.filter(r => r.result === "FAIL").length;
  const [updated] = await db.update(qcInspections2).set({
    status: "COMPLETED",
    overallResult,
    passedQty: passedCount,
    failedQty: failedCount,
    inspectedBy: userId,
    inspectedAt: new Date(),
  }).where(and(eq(qcInspections2.id, id), eq(qcInspections2.tenantId, tenantId))).returning();
  return updated;
}

export async function approveInspection(tenantId: number, id: number, userId: number) {
  const [result] = await db.update(qcInspections2).set({
    approvedBy: userId,
    approvedAt: new Date(),
  }).where(and(eq(qcInspections2.id, id), eq(qcInspections2.tenantId, tenantId))).returning();
  if (!result) throw new Error("Inspection not found");
  return result;
}

export async function createHoldRelease(data: InsertQcHoldRelease) {
  const [result] = await db.insert(qcHoldReleases).values(data).returning();
  return result;
}

export async function listHoldReleases(tenantId: number) {
  return db.select().from(qcHoldReleases).where(eq(qcHoldReleases.tenantId, tenantId)).orderBy(desc(qcHoldReleases.performedAt));
}

export async function createLabTest(data: InsertLabTest) {
  if (!data.testNumber) {
    data.testNumber = await generateNumber("LAB", data.tenantId, labTests, labTests.tenantId);
  }
  const [result] = await db.insert(labTests).values(data).returning();
  return result;
}

export async function listLabTests(tenantId: number) {
  return db.select().from(labTests).where(eq(labTests.tenantId, tenantId)).orderBy(desc(labTests.createdAt));
}

export async function getLabTest(tenantId: number, id: number) {
  const [result] = await db.select().from(labTests).where(and(eq(labTests.id, id), eq(labTests.tenantId, tenantId)));
  if (!result) throw new Error("Lab test not found");
  return result;
}

export async function updateLabTest(tenantId: number, id: number, data: Partial<InsertLabTest>) {
  const [result] = await db.update(labTests).set(data).where(and(eq(labTests.id, id), eq(labTests.tenantId, tenantId))).returning();
  if (!result) throw new Error("Lab test not found");
  return result;
}

export async function createCapaAction(data: InsertCapaAction) {
  if (!data.capaNumber) {
    data.capaNumber = await generateNumber("CAPA", data.tenantId, capaActions, capaActions.tenantId);
  }
  const [result] = await db.insert(capaActions).values(data).returning();
  return result;
}

export async function listCapaActions(tenantId: number) {
  return db.select().from(capaActions).where(eq(capaActions.tenantId, tenantId)).orderBy(desc(capaActions.createdAt));
}

export async function getCapaAction(tenantId: number, id: number) {
  const [result] = await db.select().from(capaActions).where(and(eq(capaActions.id, id), eq(capaActions.tenantId, tenantId)));
  if (!result) throw new Error("CAPA not found");
  return result;
}

export async function updateCapaAction(tenantId: number, id: number, data: Partial<InsertCapaAction>) {
  const [result] = await db.update(capaActions).set(data).where(and(eq(capaActions.id, id), eq(capaActions.tenantId, tenantId))).returning();
  if (!result) throw new Error("CAPA not found");
  return result;
}

export async function completeCapaAction(tenantId: number, id: number) {
  const today = new Date().toISOString().split("T")[0];
  const [result] = await db.update(capaActions).set({ status: "COMPLETED", completedDate: today }).where(and(eq(capaActions.id, id), eq(capaActions.tenantId, tenantId))).returning();
  if (!result) throw new Error("CAPA not found");
  return result;
}

export async function verifyCapaAction(tenantId: number, id: number, userId: number, effectivenessCheck?: string) {
  const [result] = await db.update(capaActions).set({
    status: "VERIFIED",
    verifiedBy: userId,
    verifiedAt: new Date(),
    effectivenessCheck: effectivenessCheck || null,
  }).where(and(eq(capaActions.id, id), eq(capaActions.tenantId, tenantId))).returning();
  if (!result) throw new Error("CAPA not found");
  return result;
}

export async function createReturnRequest(data: InsertReturnRequest, lines?: InsertReturnRequestLine[]) {
  if (!data.returnNumber) {
    data.returnNumber = await generateNumber("RET", data.tenantId, returnRequests, returnRequests.tenantId);
  }
  data.totalItems = lines?.length || 0;
  const [result] = await db.insert(returnRequests).values(data).returning();
  if (lines && lines.length > 0) {
    await db.insert(returnRequestLines).values(lines.map(l => ({ ...l, returnRequestId: result.id, tenantId: data.tenantId })));
  }
  return result;
}

export async function listReturnRequests(tenantId: number) {
  return db.select().from(returnRequests).where(eq(returnRequests.tenantId, tenantId)).orderBy(desc(returnRequests.createdAt));
}

export async function getReturnRequest(tenantId: number, id: number) {
  const [request] = await db.select().from(returnRequests).where(and(eq(returnRequests.id, id), eq(returnRequests.tenantId, tenantId)));
  if (!request) throw new Error("Return request not found");
  const lines = await db.select().from(returnRequestLines).where(and(eq(returnRequestLines.returnRequestId, id), eq(returnRequestLines.tenantId, tenantId)));
  return { ...request, lines };
}

export async function updateReturnRequest(tenantId: number, id: number, data: Partial<InsertReturnRequest>) {
  const [result] = await db.update(returnRequests).set(data).where(and(eq(returnRequests.id, id), eq(returnRequests.tenantId, tenantId))).returning();
  if (!result) throw new Error("Return request not found");
  return result;
}

export async function approveReturnRequest(tenantId: number, id: number, userId: number) {
  const [result] = await db.update(returnRequests).set({
    status: "APPROVED",
    approvedBy: userId,
    approvedAt: new Date(),
  }).where(and(eq(returnRequests.id, id), eq(returnRequests.tenantId, tenantId))).returning();
  if (!result) throw new Error("Return request not found");
  return result;
}

export async function getQualityDashboard(tenantId: number) {
  const [inspectionCounts] = await db.select({
    total: count(),
    passed: sql<number>`count(*) filter (where ${qcInspections2.overallResult} = 'PASS')`.as("passed"),
    failed: sql<number>`count(*) filter (where ${qcInspections2.overallResult} = 'FAIL')`.as("failed"),
    pending: sql<number>`count(*) filter (where ${qcInspections2.status} = 'DRAFT' OR ${qcInspections2.status} = 'IN_PROGRESS')`.as("pending"),
  }).from(qcInspections2).where(eq(qcInspections2.tenantId, tenantId));

  const [capaCounts] = await db.select({
    total: count(),
    open: sql<number>`count(*) filter (where ${capaActions.status} = 'OPEN')`.as("open"),
    inProgress: sql<number>`count(*) filter (where ${capaActions.status} = 'IN_PROGRESS')`.as("in_progress"),
  }).from(capaActions).where(eq(capaActions.tenantId, tenantId));

  const [returnCounts] = await db.select({
    total: count(),
    pending: sql<number>`count(*) filter (where ${returnRequests.status} = 'PENDING')`.as("pending"),
  }).from(returnRequests).where(eq(returnRequests.tenantId, tenantId));

  const [labTestCounts] = await db.select({
    total: count(),
    pending: sql<number>`count(*) filter (where ${labTests.status} = 'PENDING' OR ${labTests.status} = 'SENT')`.as("pending"),
  }).from(labTests).where(eq(labTests.tenantId, tenantId));

  const recentInspections = await db.select().from(qcInspections2).where(eq(qcInspections2.tenantId, tenantId)).orderBy(desc(qcInspections2.createdAt)).limit(10);

  const totalInsp = inspectionCounts?.total || 0;
  const passedInsp = Number(inspectionCounts?.passed) || 0;
  const passRate = totalInsp > 0 ? Math.round((passedInsp / totalInsp) * 10000) / 100 : 0;

  return {
    inspections: { total: totalInsp, passed: passedInsp, failed: Number(inspectionCounts?.failed) || 0, pending: Number(inspectionCounts?.pending) || 0 },
    passRate,
    capa: { total: capaCounts?.total || 0, open: Number(capaCounts?.open) || 0, inProgress: Number(capaCounts?.inProgress) || 0 },
    returns: { total: returnCounts?.total || 0, pending: Number(returnCounts?.pending) || 0 },
    labTests: { total: labTestCounts?.total || 0, pending: Number(labTestCounts?.pending) || 0 },
    recentInspections,
  };
}
