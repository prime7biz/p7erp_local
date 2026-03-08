import { parseIntParam } from "../utils/parseParams";
import { Router } from "express";
import { db } from "../db";
import { and, eq } from "drizzle-orm";
import {
  vouchers,
  voucherStatus,
  voucherWorkflow,
  voucherApprovalHistory,
  users,
} from "../../shared/schema";

const router = Router();

// Get available actions for a voucher
router.get("/vouchers/:id/actions", async (req, res) => {
  try {
    const voucherId = parseIntParam(req.params.id, "id");
    const [voucher] = await db
      .select()
      .from(vouchers)
      .where(eq(vouchers.id, voucherId));

    if (!voucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    // Get available workflow actions
    const workflowActions = await db
      .select()
      .from(voucherWorkflow)
      .where(
        and(
          eq(voucherWorkflow.voucherTypeId, voucher.voucherTypeId),
          eq(voucherWorkflow.fromStatusId, voucher.statusId) 
        )
      );

    // Also get actions where from_status_id is NULL (applicable to any status)
    const generalActions = await db
      .select()
      .from(voucherWorkflow)
      .where(
        and(
          eq(voucherWorkflow.voucherTypeId, voucher.voucherTypeId),
          eq(voucherWorkflow.fromStatusId, null)
        )
      );

    // Combine both sets of actions
    const availableActions = [...workflowActions, ...generalActions];

    res.json(availableActions);
  } catch (error) {
    console.error("Error getting voucher actions:", error);
    res.status(500).json({ message: "Failed to get voucher actions" });
  }
});

// Process an action on a voucher
router.post("/vouchers/:id/actions", async (req, res) => {
  try {
    const voucherId = parseIntParam(req.params.id, "id");
    const { actionId, comments } = req.body;
    const userId = req.user?.id || 1; // Default to admin user if not authenticated

    // Get the voucher
    const [voucher] = await db
      .select()
      .from(vouchers)
      .where(eq(vouchers.id, voucherId));

    if (!voucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    // Get the workflow action
    const [action] = await db
      .select()
      .from(voucherWorkflow)
      .where(eq(voucherWorkflow.id, actionId));

    if (!action) {
      return res.status(404).json({ message: "Action not found" });
    }

    // Check if the action is applicable to the current voucher status
    if (action.fromStatusId !== null && action.fromStatusId !== voucher.statusId) {
      return res.status(400).json({ message: "Action not applicable to current voucher status" });
    }

    // Update the voucher status
    const [updatedVoucher] = await db
      .update(vouchers)
      .set({
        statusId: action.toStatusId,
        updatedAt: new Date(),
      })
      .where(eq(vouchers.id, voucherId))
      .returning();

    // Record the action in approval history
    await db.insert(voucherApprovalHistory).values({
      voucherId,
      fromStatusId: voucher.statusId,
      toStatusId: action.toStatusId,
      actionName: action.actionName,
      actionById: userId,
      comments,
      tenantId: voucher.tenantId,
    });

    // Handle status-specific actions
    if (action.actionName === 'Approve') {
      await db
        .update(vouchers)
        .set({
          approvedById: userId,
          approvedDate: new Date(),
        })
        .where(eq(vouchers.id, voucherId));
    } else if (action.actionName === 'Reject') {
      await db
        .update(vouchers)
        .set({
          rejectedById: userId,
          rejectedDate: new Date(),
          rejectionReason: comments,
        })
        .where(eq(vouchers.id, voucherId));
    } else if (action.actionName === 'Post') {
      await db
        .update(vouchers)
        .set({
          isPosted: true,
          postingDate: new Date(),
        })
        .where(eq(vouchers.id, voucherId));
    } else if (action.actionName === 'Cancel') {
      await db
        .update(vouchers)
        .set({
          isCancelled: true,
          cancelledById: userId,
          cancellationDate: new Date(),
          cancellationReason: comments,
        })
        .where(eq(vouchers.id, voucherId));
    }

    // Get the updated voucher with status name
    const [result] = await db
      .select({
        voucher: vouchers,
        statusName: voucherStatus.name,
        statusColor: voucherStatus.color,
      })
      .from(vouchers)
      .leftJoin(voucherStatus, eq(vouchers.statusId, voucherStatus.id))
      .where(eq(vouchers.id, voucherId));

    res.json({
      message: `Voucher ${action.actionName.toLowerCase()} successful`,
      voucher: result.voucher,
      status: {
        name: result.statusName,
        color: result.statusColor,
      },
    });
  } catch (error) {
    console.error("Error processing voucher action:", error);
    res.status(500).json({ message: "Failed to process voucher action" });
  }
});

// Get voucher approval history
router.get("/vouchers/:id/history", async (req, res) => {
  try {
    const voucherId = parseIntParam(req.params.id, "id");
    
    const historyItems = await db
      .select({
        id: voucherApprovalHistory.id,
        fromStatus: voucherStatus.name,
        toStatus: voucherStatus.name,
        actionName: voucherApprovalHistory.actionName,
        actionBy: users.username,
        comments: voucherApprovalHistory.comments,
        actionDate: voucherApprovalHistory.actionDate,
      })
      .from(voucherApprovalHistory)
      .leftJoin(voucherStatus, eq(voucherApprovalHistory.fromStatusId, voucherStatus.id))
      .leftJoin(voucherStatus, eq(voucherApprovalHistory.toStatusId, voucherStatus.id))
      .leftJoin(users, eq(voucherApprovalHistory.actionById, users.id))
      .where(eq(voucherApprovalHistory.voucherId, voucherId))
      .orderBy(voucherApprovalHistory.actionDate);

    res.json(historyItems);
  } catch (error) {
    console.error("Error getting voucher history:", error);
    res.status(500).json({ message: "Failed to get voucher history" });
  }
});

export default router;