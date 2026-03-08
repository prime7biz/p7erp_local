import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

export function preventDestructiveDelete(tableName: string, referencingTables: { table: string; column: string }[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resourceId = parseInt(req.params.id, 10);
      if (isNaN(resourceId)) {
        return res.status(400).json({ error: "Invalid resource ID", code: "INVALID_ID" });
      }

      for (const ref of referencingTables) {
        const result = await db.execute(
          sql`SELECT COUNT(*)::int as count FROM ${sql.identifier(ref.table)} WHERE ${sql.identifier(ref.column)} = ${resourceId} LIMIT 1`
        );
        const count = (result.rows[0] as any)?.count || 0;
        if (count > 0) {
          return res.status(409).json({
            error: `Cannot delete: this record is referenced by ${ref.table}. Remove or reassign those records first.`,
            code: "DELETE_BLOCKED_BY_REFERENCE",
            referencingTable: ref.table,
          });
        }
      }

      next();
    } catch (error) {
      console.error("Destructive delete check failed:", error);
      return res.status(500).json({ error: "Failed to validate delete operation", code: "DELETE_CHECK_ERROR" });
    }
  };
}
