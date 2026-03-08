import { db } from "../db";
import { sql } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI();

export async function listThreads(tenantId: number, userId: number) {
  const result = await db.execute(
    sql`SELECT * FROM assistant_threads WHERE tenant_id = ${tenantId} AND created_by = ${userId} ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function createThread(tenantId: number, userId: number, title: string) {
  const result = await db.execute(
    sql`INSERT INTO assistant_threads (tenant_id, created_by, title, created_at)
        VALUES (${tenantId}, ${userId}, ${title}, NOW())
        RETURNING *`
  );
  const thread = result.rows[0];

  await logAudit(tenantId, userId, (thread as any).id, 'thread_created', { title }, null);

  return thread;
}

export async function getThread(tenantId: number, threadId: number) {
  const threadResult = await db.execute(
    sql`SELECT * FROM assistant_threads WHERE id = ${threadId} AND tenant_id = ${tenantId}`
  );
  if (!threadResult.rows.length) throw new Error("Thread not found");

  const messagesResult = await db.execute(
    sql`SELECT * FROM assistant_messages WHERE tenant_id = ${tenantId} AND thread_id = ${threadId} ORDER BY created_at ASC`
  );

  return { thread: threadResult.rows[0], messages: messagesResult.rows };
}

export async function deleteThread(tenantId: number, threadId: number) {
  const existing = await db.execute(
    sql`SELECT * FROM assistant_threads WHERE id = ${threadId} AND tenant_id = ${tenantId}`
  );
  if (!existing.rows.length) throw new Error("Thread not found");

  await db.execute(
    sql`DELETE FROM assistant_messages WHERE tenant_id = ${tenantId} AND thread_id = ${threadId}`
  );
  await db.execute(
    sql`DELETE FROM assistant_threads WHERE id = ${threadId} AND tenant_id = ${tenantId}`
  );

  return { success: true };
}

export async function addMessage(tenantId: number, threadId: number, role: string, content: string, userId: number) {
  const thread = await db.execute(
    sql`SELECT id FROM assistant_threads WHERE id = ${threadId} AND tenant_id = ${tenantId}`
  );
  if (!thread.rows.length) throw new Error("Thread not found");

  const result = await db.execute(
    sql`INSERT INTO assistant_messages (tenant_id, thread_id, role, content, created_by, created_at)
        VALUES (${tenantId}, ${threadId}, ${role}, ${content}, ${userId}, NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function getReply(tenantId: number, threadId: number, userId: number) {
  const messagesResult = await db.execute(
    sql`SELECT * FROM assistant_messages WHERE tenant_id = ${tenantId} AND thread_id = ${threadId} ORDER BY created_at ASC`
  );
  const messages = messagesResult.rows as any[];

  const chatMessages: { role: string; content: string }[] = [
    {
      role: "system",
      content: `You are Prime7 ERP AI Assistant, an intelligent copilot for a garment manufacturing ERP system. You help users with production planning, quality management, inventory tracking, order management, HR, and accounting tasks. Provide concise, actionable responses. When referencing data, use specific numbers and dates. Tenant ID: ${tenantId}, User ID: ${userId}.`,
    },
    ...messages.map((m: any) => ({
      role: m.role as string,
      content: m.content as string,
    })),
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: chatMessages as any,
      temperature: 0.4,
      max_tokens: 1500,
    });

    const assistantContent = response.choices[0].message.content || "I'm sorry, I couldn't generate a response.";

    const saved = await addMessage(tenantId, threadId, "assistant", assistantContent, userId);
    return saved;
  } catch (error) {
    console.error("AI reply error:", error);

    const fallbackContent = "I'm currently unable to connect to the AI service. Please try again in a moment, or contact support if the issue persists.";
    const saved = await addMessage(tenantId, threadId, "assistant", fallbackContent, userId);
    return saved;
  }
}

export async function logAudit(
  tenantId: number,
  userId: number,
  threadId: number | null,
  action: string,
  metadata?: Record<string, any> | null,
  ipAddress?: string | null
) {
  const result = await db.execute(
    sql`INSERT INTO assistant_audit_log (tenant_id, user_id, thread_id, action, metadata, ip_address, created_at)
        VALUES (${tenantId}, ${userId}, ${threadId}, ${action}, ${JSON.stringify(metadata ?? {})}::jsonb, ${ipAddress ?? null}, NOW())
        RETURNING *`
  );
  return result.rows[0];
}

export async function listAuditLogs(tenantId: number, filters?: { user_id?: number; action?: string }) {
  let query = sql`SELECT * FROM assistant_audit_log WHERE tenant_id = ${tenantId}`;
  if (filters?.user_id) query = sql`${query} AND user_id = ${filters.user_id}`;
  if (filters?.action) query = sql`${query} AND action = ${filters.action}`;
  query = sql`${query} ORDER BY created_at DESC`;
  const result = await db.execute(query);
  return result.rows;
}

export function getQuickSuggestions(module?: string): string[] {
  const suggestions: Record<string, string[]> = {
    production: [
      "Show today production summary",
      "What is the current DHU?",
      "Which lines are behind target?",
      "Show hourly production breakdown",
    ],
    quality: [
      "List open corrective actions",
      "Show AQL results",
      "What is the current defect rate?",
      "Show top defect categories this week",
    ],
    inventory: [
      "Show low stock items",
      "What items need reordering?",
      "Show stock movement summary",
      "List items with excess inventory",
    ],
    hr: [
      "Show today attendance summary",
      "List pending leave requests",
      "Show overtime report this month",
      "What is the current headcount?",
    ],
    orders: [
      "Show overdue orders",
      "List orders shipping this week",
      "What is the current order backlog?",
      "Show order fulfillment rate",
    ],
    accounts: [
      "Show outstanding receivables",
      "What is today cash position?",
      "List overdue payables",
      "Show monthly revenue summary",
    ],
  };

  if (module && suggestions[module]) {
    return suggestions[module];
  }

  return [
    "Show today production summary",
    "What are the pending tasks?",
    "Show inventory alerts",
    "What orders are due this week?",
    "Show quality metrics overview",
    "Help me with a report",
  ];
}
