import { db } from "../db";
import { sql } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI();

export async function listResources(tenantId: number, filters?: { type?: string; active?: boolean }) {
  let query = sql`SELECT * FROM capacity_resources WHERE tenant_id = ${tenantId}`;
  if (filters?.type) query = sql`${query} AND type = ${filters.type}`;
  if (filters?.active !== undefined) query = sql`${query} AND active = ${filters.active}`;
  query = sql`${query} ORDER BY resource_code`;
  const result = await db.execute(query);
  return result.rows;
}

export async function createResource(tenantId: number, data: {
  type: string;
  resource_code: string;
  attributes?: Record<string, any>;
  active?: boolean;
}) {
  const result = await db.execute(
    sql`INSERT INTO capacity_resources (tenant_id, type, resource_code, attributes, active, created_at, updated_at)
        VALUES (${tenantId}, ${data.type}, ${data.resource_code}, ${JSON.stringify(data.attributes ?? {})}::jsonb, ${data.active ?? true}, NOW(), NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function updateResource(tenantId: number, id: number, data: {
  type?: string;
  resource_code?: string;
  attributes?: Record<string, any>;
  active?: boolean;
}) {
  const existing = await db.execute(
    sql`SELECT * FROM capacity_resources WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Resource not found");

  const result = await db.execute(
    sql`UPDATE capacity_resources SET
        type = COALESCE(${data.type ?? null}, type),
        resource_code = COALESCE(${data.resource_code ?? null}, resource_code),
        attributes = COALESCE(${data.attributes ? JSON.stringify(data.attributes) : null}::jsonb, attributes),
        active = COALESCE(${data.active ?? null}, active),
        updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function listCalendarEntries(tenantId: number, resourceId: number, dateRange?: { from?: string; to?: string }) {
  let query = sql`SELECT * FROM capacity_calendars WHERE tenant_id = ${tenantId} AND resource_id = ${resourceId}`;
  if (dateRange?.from) query = sql`${query} AND date >= ${dateRange.from}`;
  if (dateRange?.to) query = sql`${query} AND date <= ${dateRange.to}`;
  query = sql`${query} ORDER BY date`;
  const result = await db.execute(query);
  return result.rows;
}

export async function upsertCalendarEntry(tenantId: number, resourceId: number, date: string, data: {
  available_minutes?: number;
  available_qty?: number;
  downtime_minutes?: number;
  notes?: string;
}) {
  const existing = await db.execute(
    sql`SELECT id FROM capacity_calendars WHERE tenant_id = ${tenantId} AND resource_id = ${resourceId} AND date = ${date}`
  );

  if (existing.rows.length) {
    const result = await db.execute(
      sql`UPDATE capacity_calendars SET
          available_minutes = COALESCE(${data.available_minutes ?? null}, available_minutes),
          available_qty = COALESCE(${data.available_qty ?? null}, available_qty),
          downtime_minutes = COALESCE(${data.downtime_minutes ?? null}, downtime_minutes),
          notes = COALESCE(${data.notes ?? null}, notes)
          WHERE tenant_id = ${tenantId} AND resource_id = ${resourceId} AND date = ${date}
          RETURNING *`
    );
    return result.rows[0];
  }

  const result = await db.execute(
    sql`INSERT INTO capacity_calendars (tenant_id, resource_id, date, available_minutes, available_qty, downtime_minutes, notes, created_at)
        VALUES (${tenantId}, ${resourceId}, ${date}, ${data.available_minutes ?? 480}, ${data.available_qty ?? 0}, ${data.downtime_minutes ?? 0}, ${data.notes ?? null}, NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function listPlanningJobs(tenantId: number, filters?: { job_type?: string; status?: string }) {
  let query = sql`SELECT * FROM planning_jobs WHERE tenant_id = ${tenantId}`;
  if (filters?.job_type) query = sql`${query} AND job_type = ${filters.job_type}`;
  if (filters?.status) query = sql`${query} AND status = ${filters.status}`;
  query = sql`${query} ORDER BY due_date ASC, created_at DESC`;
  const result = await db.execute(query);
  return result.rows;
}

export async function createPlanningJob(tenantId: number, data: {
  job_type: string;
  source_type?: string;
  source_id?: number;
  required_qty: number;
  due_date: string;
  constraints?: Record<string, any>;
}) {
  const result = await db.execute(
    sql`INSERT INTO planning_jobs (tenant_id, job_type, source_type, source_id, required_qty, due_date, constraints, status, created_at, updated_at)
        VALUES (${tenantId}, ${data.job_type}, ${data.source_type ?? null}, ${data.source_id ?? null}, ${data.required_qty}, ${data.due_date}, ${JSON.stringify(data.constraints ?? {})}::jsonb, 'OPEN', NOW(), NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function updatePlanningJob(tenantId: number, id: number, data: {
  job_type?: string;
  source_type?: string;
  source_id?: number;
  required_qty?: number;
  due_date?: string;
  constraints?: Record<string, any>;
  status?: string;
}) {
  const existing = await db.execute(
    sql`SELECT * FROM planning_jobs WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Planning job not found");

  const result = await db.execute(
    sql`UPDATE planning_jobs SET
        job_type = COALESCE(${data.job_type ?? null}, job_type),
        source_type = COALESCE(${data.source_type ?? null}, source_type),
        source_id = COALESCE(${data.source_id ?? null}, source_id),
        required_qty = COALESCE(${data.required_qty ?? null}, required_qty),
        due_date = COALESCE(${data.due_date ?? null}, due_date),
        constraints = COALESCE(${data.constraints ? JSON.stringify(data.constraints) : null}::jsonb, constraints),
        status = COALESCE(${data.status ?? null}, status),
        updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function allocateJob(tenantId: number, jobId: number, resourceId: number, date: string, qty: number, minutes: number) {
  const job = await db.execute(
    sql`SELECT * FROM planning_jobs WHERE id = ${jobId} AND tenant_id = ${tenantId}`
  );
  if (!job.rows.length) throw new Error("Planning job not found");

  const resource = await db.execute(
    sql`SELECT * FROM capacity_resources WHERE id = ${resourceId} AND tenant_id = ${tenantId}`
  );
  if (!resource.rows.length) throw new Error("Resource not found");

  const allocationResult = await db.execute(
    sql`INSERT INTO planning_allocations (tenant_id, planning_job_id, resource_id, date, allocated_qty, allocated_minutes, status, created_at)
        VALUES (${tenantId}, ${jobId}, ${resourceId}, ${date}, ${qty}, ${minutes}, 'PLANNED', NOW())
        RETURNING *`
  );

  await db.execute(
    sql`UPDATE planning_jobs SET status = 'ALLOCATED', updated_at = NOW()
        WHERE id = ${jobId} AND tenant_id = ${tenantId}`
  );

  return allocationResult.rows[0];
}

export async function listAllocations(tenantId: number, jobId: number) {
  const result = await db.execute(
    sql`SELECT pa.*, cr.resource_code, cr.type as resource_type
        FROM planning_allocations pa
        LEFT JOIN capacity_resources cr ON cr.id = pa.resource_id AND cr.tenant_id = pa.tenant_id
        WHERE pa.tenant_id = ${tenantId} AND pa.planning_job_id = ${jobId}
        ORDER BY pa.date`
  );
  return result.rows;
}

export async function runDeterministicAllocation(tenantId: number, jobType: string) {
  const jobsResult = await db.execute(
    sql`SELECT * FROM planning_jobs WHERE tenant_id = ${tenantId} AND job_type = ${jobType} AND status = 'OPEN' ORDER BY due_date ASC`
  );
  let jobs = jobsResult.rows as any[];

  if (jobType === 'KNITTING') {
    jobs = jobs.sort((a: any, b: any) => {
      const gaugeA = a.constraints?.gauge ?? 0;
      const gaugeB = b.constraints?.gauge ?? 0;
      return gaugeA - gaugeB;
    });
  }

  if (jobType === 'DYEING') {
    const shadeGroups: Record<string, any[]> = {};
    for (const job of jobs) {
      const shade = job.constraints?.shade ?? 'UNKNOWN';
      if (!shadeGroups[shade]) shadeGroups[shade] = [];
      shadeGroups[shade].push(job);
    }
    jobs = Object.values(shadeGroups).flat();
  }

  const resourcesResult = await db.execute(
    sql`SELECT * FROM capacity_resources WHERE tenant_id = ${tenantId} AND type = ${jobType} AND active = true ORDER BY resource_code`
  );
  const resources = resourcesResult.rows as any[];

  const today = new Date().toISOString().split('T')[0];

  const allocations: any[] = [];

  for (const job of jobs) {
    for (const resource of resources) {
      const calendarResult = await db.execute(
        sql`SELECT * FROM capacity_calendars
            WHERE tenant_id = ${tenantId} AND resource_id = ${resource.id} AND date >= ${today}
            AND (available_minutes - downtime_minutes) > 0
            ORDER BY date LIMIT 1`
      );

      if (calendarResult.rows.length) {
        const cal = calendarResult.rows[0] as any;
        const availMinutes = cal.available_minutes - cal.downtime_minutes;

        const existingAllocResult = await db.execute(
          sql`SELECT COALESCE(SUM(allocated_minutes), 0)::int as used_minutes
              FROM planning_allocations
              WHERE tenant_id = ${tenantId} AND resource_id = ${resource.id} AND date = ${cal.date}`
        );
        const usedMinutes = (existingAllocResult.rows[0] as any)?.used_minutes ?? 0;
        const remainingMinutes = availMinutes - usedMinutes;

        if (remainingMinutes > 0) {
          const allocMinutes = Math.min(remainingMinutes, availMinutes);
          const allocation = await allocateJob(tenantId, job.id, resource.id, cal.date as string, job.required_qty, allocMinutes);
          allocations.push(allocation);
          break;
        }
      }
    }
  }

  return { jobType, allocationsCreated: allocations.length, allocations };
}

export async function getAISuggestions(tenantId: number, jobType: string) {
  try {
    const [jobsResult, resourcesResult] = await Promise.all([
      db.execute(
        sql`SELECT * FROM planning_jobs WHERE tenant_id = ${tenantId} AND job_type = ${jobType} AND status IN ('OPEN', 'ALLOCATED') ORDER BY due_date LIMIT 50`
      ),
      db.execute(
        sql`SELECT * FROM capacity_resources WHERE tenant_id = ${tenantId} AND type = ${jobType} AND active = true`
      ),
    ]);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert production planning assistant for a garment factory. Analyze the current planning jobs and capacity resources, then provide actionable scheduling and optimization suggestions. Be concise and specific.`,
        },
        {
          role: "user",
          content: `Analyze these ${jobType} planning jobs and resources, then suggest optimizations:\n\nJobs:\n${JSON.stringify(jobsResult.rows, null, 2)}\n\nResources:\n${JSON.stringify(resourcesResult.rows, null, 2)}\n\nProvide suggestions as JSON with fields: suggestions (array of strings), priority (high/medium/low), bottlenecks (array of strings).`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1000,
    });

    return JSON.parse(response.choices[0].message.content || "{}");
  } catch (error) {
    console.error("AI suggestions error:", error);
    return { suggestions: "AI service unavailable", fallback: true };
  }
}
