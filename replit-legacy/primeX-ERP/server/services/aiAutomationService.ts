import { db } from "../db";
import { sql } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI();

export async function listRules(tenantId: number, filters?: { trigger_type?: string; is_enabled?: boolean }) {
  let query = sql`SELECT * FROM automation_rules WHERE tenant_id = ${tenantId}`;
  if (filters?.trigger_type) query = sql`${query} AND trigger_type = ${filters.trigger_type}`;
  if (filters?.is_enabled !== undefined) query = sql`${query} AND is_enabled = ${filters.is_enabled}`;
  query = sql`${query} ORDER BY created_at DESC`;
  const result = await db.execute(query);
  return result.rows;
}

export async function getRule(tenantId: number, id: number) {
  const result = await db.execute(
    sql`SELECT * FROM automation_rules WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!result.rows.length) throw new Error("Automation rule not found");
  return result.rows[0];
}

export async function createRule(tenantId: number, data: {
  name: string;
  trigger_type: string;
  event_key?: string;
  schedule_cron?: string;
  conditions?: any[];
  actions?: any[];
  is_enabled?: boolean;
  created_by: number;
}) {
  const result = await db.execute(
    sql`INSERT INTO automation_rules (tenant_id, name, is_enabled, trigger_type, event_key, schedule_cron, conditions, actions, created_by, updated_by, created_at, updated_at)
        VALUES (${tenantId}, ${data.name}, ${data.is_enabled ?? true}, ${data.trigger_type}, ${data.event_key ?? null}, ${data.schedule_cron ?? null}, ${JSON.stringify(data.conditions ?? [])}::jsonb, ${JSON.stringify(data.actions ?? [])}::jsonb, ${data.created_by}, ${data.created_by}, NOW(), NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function updateRule(tenantId: number, id: number, data: {
  name?: string;
  trigger_type?: string;
  event_key?: string;
  schedule_cron?: string;
  conditions?: any[];
  actions?: any[];
  is_enabled?: boolean;
  updated_by: number;
}) {
  const existing = await db.execute(
    sql`SELECT * FROM automation_rules WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Automation rule not found");

  const result = await db.execute(
    sql`UPDATE automation_rules SET
        name = COALESCE(${data.name ?? null}, name),
        trigger_type = COALESCE(${data.trigger_type ?? null}, trigger_type),
        event_key = COALESCE(${data.event_key ?? null}, event_key),
        schedule_cron = COALESCE(${data.schedule_cron ?? null}, schedule_cron),
        conditions = COALESCE(${data.conditions ? JSON.stringify(data.conditions) : null}::jsonb, conditions),
        actions = COALESCE(${data.actions ? JSON.stringify(data.actions) : null}::jsonb, actions),
        is_enabled = COALESCE(${data.is_enabled ?? null}, is_enabled),
        updated_by = ${data.updated_by},
        updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function toggleRule(tenantId: number, id: number) {
  const existing = await db.execute(
    sql`SELECT * FROM automation_rules WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Automation rule not found");

  const result = await db.execute(
    sql`UPDATE automation_rules SET is_enabled = NOT is_enabled, updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING *`
  );
  return result.rows[0];
}

export async function deleteRule(tenantId: number, id: number) {
  const existing = await db.execute(
    sql`SELECT * FROM automation_rules WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Automation rule not found");

  await db.execute(
    sql`DELETE FROM automation_runs WHERE rule_id = ${id} AND tenant_id = ${tenantId}`
  );
  await db.execute(
    sql`DELETE FROM automation_rules WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  return { success: true };
}

export function evaluateConditions(context: Record<string, any>, conditions: any[]): boolean {
  if (!conditions || conditions.length === 0) return true;

  for (const condition of conditions) {
    const { field, operator, value } = condition;
    const actual = context[field];

    switch (operator) {
      case "equals":
        if (actual !== value) return false;
        break;
      case "not_equals":
        if (actual === value) return false;
        break;
      case "gt":
        if (!(actual > value)) return false;
        break;
      case "lt":
        if (!(actual < value)) return false;
        break;
      case "gte":
        if (!(actual >= value)) return false;
        break;
      case "lte":
        if (!(actual <= value)) return false;
        break;
      case "in":
        if (!Array.isArray(value) || !value.includes(actual)) return false;
        break;
      case "contains":
        if (typeof actual === "string" && !actual.includes(value)) return false;
        else if (Array.isArray(actual) && !actual.includes(value)) return false;
        else if (typeof actual !== "string" && !Array.isArray(actual)) return false;
        break;
      default:
        return false;
    }
  }

  return true;
}

export async function executeActions(
  tenantId: number,
  ruleId: number,
  runId: number,
  actions: any[],
  context: Record<string, any>
) {
  const results: any[] = [];

  for (const action of actions) {
    try {
      if (action.type === "notify") {
        const config = action.config || {};
        const recipientUserId = config.recipient === "creator"
          ? context.created_by || context.user_id || null
          : config.recipient_user_id || null;

        if (recipientUserId) {
          await db.execute(
            sql`INSERT INTO automation_notifications (tenant_id, run_id, channel, recipient_user_id, title, message, is_read, created_at)
                VALUES (${tenantId}, ${runId}, 'IN_APP', ${recipientUserId}, ${config.title || 'Notification'}, ${config.message || ''}, false, NOW())`
          );
        }
        results.push({ type: "notify", status: "done" });
      } else if (action.type === "create_task") {
        const config = action.config || {};
        await db.execute(
          sql`INSERT INTO tasks (tenant_id, title, description, status, priority, assigned_to, due_date, created_by, created_at, updated_at)
              VALUES (${tenantId}, ${config.title || 'Auto-created task'}, ${config.description || ''}, 'pending', ${config.priority || 'medium'}, ${config.assigned_to || null}, ${config.due_date || null}, ${context.user_id || context.created_by || null}, NOW(), NOW())
              RETURNING id`
        );
        results.push({ type: "create_task", status: "done" });
      } else if (action.type === "ai_summarize") {
        const config = action.config || {};
        try {
          const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: "You are Prime7 ERP AI. Provide a concise business summary based on the given context.",
              },
              {
                role: "user",
                content: `Generate a ${config.scope || "general"} summary for tenant ${tenantId}. Context: ${JSON.stringify(context)}`,
              },
            ],
            temperature: 0.4,
            max_tokens: 1000,
          });
          const summary = response.choices[0].message.content || "No summary generated.";
          await db.execute(
            sql`UPDATE automation_runs SET result = ${JSON.stringify({ summary })}::jsonb
                WHERE id = ${runId} AND tenant_id = ${tenantId}`
          );
          results.push({ type: "ai_summarize", status: "done", summary });
        } catch (aiError) {
          console.error("AI summarize error:", aiError);
          results.push({ type: "ai_summarize", status: "error", error: "AI service unavailable" });
        }
      }
    } catch (err: any) {
      console.error(`Action ${action.type} failed:`, err);
      results.push({ type: action.type, status: "error", error: err.message });
    }
  }

  return results;
}

export async function triggerEvent(tenantId: number, eventKey: string, context: Record<string, any>) {
  const rulesResult = await db.execute(
    sql`SELECT * FROM automation_rules WHERE tenant_id = ${tenantId} AND is_enabled = true AND trigger_type = 'EVENT' AND event_key = ${eventKey}`
  );
  const rules = rulesResult.rows as any[];

  const results: any[] = [];

  for (const rule of rules) {
    const conditions = rule.conditions || [];
    if (!evaluateConditions(context, conditions)) continue;

    const runResult = await db.execute(
      sql`INSERT INTO automation_runs (tenant_id, rule_id, status, started_at, input_context, created_at)
          VALUES (${tenantId}, ${rule.id}, 'RUNNING', NOW(), ${JSON.stringify(context)}::jsonb, NOW())
          RETURNING *`
    );
    const run = runResult.rows[0] as any;

    try {
      const actions = rule.actions || [];
      const actionResults = await executeActions(tenantId, rule.id, run.id, actions, context);

      await db.execute(
        sql`UPDATE automation_runs SET status = 'SUCCESS', finished_at = NOW(), result = COALESCE(result, '{}')::jsonb || ${JSON.stringify({ actions: actionResults })}::jsonb
            WHERE id = ${run.id} AND tenant_id = ${tenantId}`
      );
      results.push({ ruleId: rule.id, runId: run.id, status: "SUCCESS" });
    } catch (err: any) {
      await db.execute(
        sql`UPDATE automation_runs SET status = 'FAILED', finished_at = NOW(), error = ${err.message}
            WHERE id = ${run.id} AND tenant_id = ${tenantId}`
      );
      results.push({ ruleId: rule.id, runId: run.id, status: "FAILED", error: err.message });
    }
  }

  return results;
}

export async function listRuns(tenantId: number, ruleId?: number) {
  let query = sql`SELECT ar.*, arule.name as rule_name FROM automation_runs ar LEFT JOIN automation_rules arule ON arule.id = ar.rule_id AND arule.tenant_id = ar.tenant_id WHERE ar.tenant_id = ${tenantId}`;
  if (ruleId) query = sql`${query} AND ar.rule_id = ${ruleId}`;
  query = sql`${query} ORDER BY ar.created_at DESC`;
  const result = await db.execute(query);
  return result.rows;
}

export async function getRun(tenantId: number, id: number) {
  const result = await db.execute(
    sql`SELECT ar.*, arule.name as rule_name FROM automation_runs ar LEFT JOIN automation_rules arule ON arule.id = ar.rule_id AND arule.tenant_id = ar.tenant_id WHERE ar.id = ${id} AND ar.tenant_id = ${tenantId}`
  );
  if (!result.rows.length) throw new Error("Automation run not found");
  return result.rows[0];
}

export async function listNotifications(tenantId: number, userId: number) {
  const result = await db.execute(
    sql`SELECT * FROM automation_notifications WHERE tenant_id = ${tenantId} AND recipient_user_id = ${userId} ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function markNotificationRead(tenantId: number, notificationId: number) {
  const existing = await db.execute(
    sql`SELECT * FROM automation_notifications WHERE id = ${notificationId} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Notification not found");

  const result = await db.execute(
    sql`UPDATE automation_notifications SET is_read = true WHERE id = ${notificationId} AND tenant_id = ${tenantId} RETURNING *`
  );
  return result.rows[0];
}

export async function getUnreadCount(tenantId: number, userId: number) {
  const result = await db.execute(
    sql`SELECT COUNT(*)::int as count FROM automation_notifications WHERE tenant_id = ${tenantId} AND recipient_user_id = ${userId} AND is_read = false`
  );
  return result.rows[0]?.count ?? 0;
}

export async function seedDefaultRules(tenantId: number, userId: number) {
  const existing = await db.execute(
    sql`SELECT COUNT(*)::int as count FROM automation_rules WHERE tenant_id = ${tenantId}`
  );
  if ((existing.rows[0] as any)?.count > 0) return { seeded: false, message: "Rules already exist" };

  const rules = [
    {
      name: "Low Stock Alert",
      trigger_type: "EVENT",
      event_key: "stock.low",
      schedule_cron: null,
      conditions: [{ field: "qty", operator: "lt", value: 100 }],
      actions: [{ type: "notify", config: { title: "Low Stock Alert", message: "Stock is below threshold", recipient: "creator" } }],
    },
    {
      name: "Order Approved",
      trigger_type: "EVENT",
      event_key: "order.approved",
      schedule_cron: null,
      conditions: [],
      actions: [{ type: "notify", config: { title: "Order Approved", message: "An order has been approved", recipient: "creator" } }],
    },
    {
      name: "Daily Summary",
      trigger_type: "SCHEDULED",
      event_key: null,
      schedule_cron: "0 18 * * *",
      conditions: [],
      actions: [{ type: "ai_summarize", config: { scope: "daily" } }],
    },
  ];

  const created = [];
  for (const rule of rules) {
    const result = await db.execute(
      sql`INSERT INTO automation_rules (tenant_id, name, is_enabled, trigger_type, event_key, schedule_cron, conditions, actions, created_by, updated_by, created_at, updated_at)
          VALUES (${tenantId}, ${rule.name}, true, ${rule.trigger_type}, ${rule.event_key}, ${rule.schedule_cron}, ${JSON.stringify(rule.conditions)}::jsonb, ${JSON.stringify(rule.actions)}::jsonb, ${userId}, ${userId}, NOW(), NOW())
          RETURNING *`
    );
    created.push(result.rows[0]);
  }

  return { seeded: true, rules: created };
}
