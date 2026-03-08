import { Router } from "express";
import { db } from "../db";
import { timeActionPlans, timeActionMilestones } from "../../shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

// Get all time and action plans
router.get("/time-action-plans", async (req, res) => {
  try {
    const plans = await db.select().from(timeActionPlans).orderBy(timeActionPlans.createdAt);
    res.json(plans);
  } catch (error) {
    console.error("Error fetching time action plans:", error);
    res.status(500).json({ message: "Error fetching time action plans" });
  }
});

// Get a specific time and action plan by ID
router.get("/time-action-plans/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [plan] = await db
      .select()
      .from(timeActionPlans)
      .where(eq(timeActionPlans.id, parseInt(id)));

    if (!plan) {
      return res.status(404).json({ message: "Time action plan not found" });
    }

    res.json(plan);
  } catch (error) {
    console.error("Error fetching time action plan:", error);
    res.status(500).json({ message: "Error fetching time action plan" });
  }
});

// Create a new time and action plan
router.post("/time-action-plans", async (req, res) => {
  try {
    const { orderId, name, description, startDate, endDate, totalDays, fabricType } = req.body;
    
    const [plan] = await db
      .insert(timeActionPlans)
      .values({
        orderId,
        name,
        description,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalDays,
        fabricType,
        status: "active",
        tenantId: 1, // In production, this should come from the authenticated user's tenant
        createdBy: 1, // In production, this should come from the authenticated user's ID
      })
      .returning();

    res.status(201).json(plan);
  } catch (error) {
    console.error("Error creating time action plan:", error);
    res.status(500).json({ message: "Error creating time action plan" });
  }
});

// Update a time and action plan
router.patch("/time-action-plans/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, startDate, endDate, totalDays, status, fabricType } = req.body;
    
    const [updatedPlan] = await db
      .update(timeActionPlans)
      .set({
        name,
        description,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        totalDays,
        status,
        fabricType,
        updatedAt: new Date(),
      })
      .where(eq(timeActionPlans.id, parseInt(id)))
      .returning();

    if (!updatedPlan) {
      return res.status(404).json({ message: "Time action plan not found" });
    }

    res.json(updatedPlan);
  } catch (error) {
    console.error("Error updating time action plan:", error);
    res.status(500).json({ message: "Error updating time action plan" });
  }
});

// Delete a time and action plan
router.delete("/time-action-plans/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    await db
      .delete(timeActionPlans)
      .where(eq(timeActionPlans.id, parseInt(id)));

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting time action plan:", error);
    res.status(500).json({ message: "Error deleting time action plan" });
  }
});

// Milestone routes
// Get all milestones for a specific plan
router.get("/time-action-milestones", async (req, res) => {
  try {
    const milestones = await db
      .select()
      .from(timeActionMilestones)
      .orderBy(timeActionMilestones.sortOrder);

    res.json(milestones);
  } catch (error) {
    console.error("Error fetching all milestones:", error);
    res.status(500).json({ message: "Error fetching all milestones" });
  }
});

// Get milestones for a specific plan
router.get("/time-action-milestones/:planId", async (req, res) => {
  try {
    const { planId } = req.params;
    const milestones = await db
      .select()
      .from(timeActionMilestones)
      .where(eq(timeActionMilestones.planId, parseInt(planId)))
      .orderBy(timeActionMilestones.sortOrder);

    res.json(milestones);
  } catch (error) {
    console.error("Error fetching milestones:", error);
    res.status(500).json({ message: "Error fetching milestones" });
  }
});

// Create a new milestone
router.post("/time-action-milestones", async (req, res) => {
  console.log("Creating new milestone with data:", req.body);
  try {
    const {
      planId,
      milestoneName,
      description,
      plannedStartDate,
      plannedEndDate,
      actualStartDate,
      actualEndDate,
      status,
      responsiblePerson,
      department,
      priority,
      isCritical,
      comments,
      dependencies,
      sortOrder
    } = req.body;
    
    // Get count of existing milestones to determine sort order
    const milestoneCount = await db
      .select()
      .from(timeActionMilestones)
      .where(eq(timeActionMilestones.planId, planId));
    
    const count = milestoneCount.length;
    
    const [milestone] = await db
      .insert(timeActionMilestones)
      .values({
        planId,
        tenantId: 1, // In production, this should come from the authenticated user's tenant
        milestoneName,
        description,
        plannedStartDate: new Date(plannedStartDate),
        plannedEndDate: new Date(plannedEndDate),
        actualStartDate: actualStartDate ? new Date(actualStartDate) : null,
        actualEndDate: actualEndDate ? new Date(actualEndDate) : null,
        status: status || "pending",
        responsiblePerson,
        department,
        comments,
        dependencies,
        priority: priority || "medium",
        isCritical: isCritical || false,
        sortOrder: sortOrder !== undefined ? sortOrder : count + 1,
      })
      .returning();

    res.status(201).json(milestone);
  } catch (error) {
    console.error("Error creating milestone:", error);
    res.status(500).json({ message: "Error creating milestone" });
  }
});

// Update a milestone
router.patch("/time-action-milestones/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      milestoneName,
      description,
      plannedStartDate,
      plannedEndDate,
      actualStartDate,
      actualEndDate,
      status,
      responsiblePerson,
      department,
      priority,
      isCritical,
      comments,
      dependencies,
      sortOrder
    } = req.body;
    
    const [updatedMilestone] = await db
      .update(timeActionMilestones)
      .set({
        milestoneName,
        description,
        plannedStartDate: plannedStartDate ? new Date(plannedStartDate) : undefined,
        plannedEndDate: plannedEndDate ? new Date(plannedEndDate) : undefined,
        actualStartDate: actualStartDate ? new Date(actualStartDate) : null,
        actualEndDate: actualEndDate ? new Date(actualEndDate) : null,
        status,
        responsiblePerson,
        department,
        comments,
        dependencies,
        priority,
        isCritical,
        sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(timeActionMilestones.id, parseInt(id)))
      .returning();

    if (!updatedMilestone) {
      return res.status(404).json({ message: "Milestone not found" });
    }

    res.json(updatedMilestone);
  } catch (error) {
    console.error("Error updating milestone:", error);
    res.status(500).json({ message: "Error updating milestone" });
  }
});

// Delete a milestone
router.delete("/time-action-milestones/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    await db
      .delete(timeActionMilestones)
      .where(eq(timeActionMilestones.id, parseInt(id)));

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting milestone:", error);
    res.status(500).json({ message: "Error deleting milestone" });
  }
});

// Re-order milestones
router.post("/time-action-milestones/reorder", async (req, res) => {
  try {
    const { milestoneIds } = req.body;
    
    // Update the sortOrder for each milestone
    const updatePromises = milestoneIds.map((id: number, index: number) => {
      return db
        .update(timeActionMilestones)
        .set({ sortOrder: index + 1 })
        .where(eq(timeActionMilestones.id, id));
    });
    
    await Promise.all(updatePromises);
    
    res.status(200).json({ message: "Milestones reordered successfully" });
  } catch (error) {
    console.error("Error reordering milestones:", error);
    res.status(500).json({ message: "Error reordering milestones" });
  }
});

// Get AI insights for a specific plan
router.get("/time-action-plans/:planId/insights", async (req, res) => {
  try {
    const { planId } = req.params;
    
    // Get plan details
    const [plan] = await db
      .select()
      .from(timeActionPlans)
      .where(eq(timeActionPlans.id, parseInt(planId)));
    
    if (!plan) {
      return res.status(404).json({ message: "Time action plan not found" });
    }
    
    // Get all milestones for the plan
    const milestones = await db
      .select()
      .from(timeActionMilestones)
      .where(eq(timeActionMilestones.planId, parseInt(planId)))
      .orderBy(timeActionMilestones.sortOrder);
    
    // Calculate insights
    const totalMilestones = milestones.length;
    const completedMilestones = milestones.filter(m => m.status === "completed").length;
    const delayedMilestones = milestones.filter(m => m.status === "delayed").length;
    const atRiskMilestones = milestones.filter(m => m.status === "at_risk").length;
    const criticalMilestones = milestones.filter(m => m.isCritical).length;
    const criticalCompleted = milestones.filter(m => m.isCritical && m.status === "completed").length;
    
    // Calculate progress percentage
    const progressPercentage = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
    
    // Calculate if plan is on track, ahead, or behind schedule
    let scheduleStatus;
    const today = new Date();
    const startDate = new Date(plan.startDate);
    const endDate = new Date(plan.endDate);
    const totalDuration = endDate.getTime() - startDate.getTime();
    const elapsedDuration = today.getTime() - startDate.getTime();
    const expectedProgress = Math.min(100, Math.max(0, Math.round((elapsedDuration / totalDuration) * 100)));
    
    if (progressPercentage >= expectedProgress + 10) {
      scheduleStatus = "ahead";
    } else if (progressPercentage <= expectedProgress - 10) {
      scheduleStatus = "behind";
    } else {
      scheduleStatus = "on_track";
    }
    
    // Generate AI recommendations based on plan status
    const recommendations = [];
    
    if (scheduleStatus === "behind") {
      recommendations.push({
        type: "warning",
        title: "Behind Schedule",
        description: "The production plan is falling behind schedule.",
        suggestedAction: "Consider allocating additional resources to critical milestones."
      });
    }
    
    if (delayedMilestones > 0) {
      recommendations.push({
        type: "warning",
        title: "Delayed Milestones",
        description: `${delayedMilestones} milestone${delayedMilestones > 1 ? 's are' : ' is'} currently delayed.`,
        suggestedAction: "Review delayed milestones and update timeline accordingly."
      });
    }
    
    if (atRiskMilestones > 0) {
      recommendations.push({
        type: "warning",
        title: "At-Risk Milestones",
        description: `${atRiskMilestones} milestone${atRiskMilestones > 1 ? 's are' : ' is'} at risk of delay.`,
        suggestedAction: "Proactively address at-risk milestones to prevent delays."
      });
    }
    
    if (scheduleStatus === "ahead") {
      recommendations.push({
        type: "success",
        title: "Ahead of Schedule",
        description: "The production plan is ahead of schedule.",
        suggestedAction: "Consider optimizing resource allocation or expediting delivery."
      });
    }
    
    if (scheduleStatus === "on_track" && delayedMilestones === 0 && atRiskMilestones === 0) {
      recommendations.push({
        type: "success",
        title: "On Track",
        description: "The production plan is on track with no significant issues.",
        suggestedAction: "Continue with the current execution plan."
      });
    }
    
    // Return insights
    res.json({
      planId: plan.id,
      planName: plan.name,
      totalMilestones,
      completedMilestones,
      delayedMilestones,
      atRiskMilestones,
      criticalMilestones,
      criticalCompleted,
      progressPercentage,
      scheduleStatus,
      expectedProgress,
      recommendations
    });
  } catch (error) {
    console.error("Error generating insights:", error);
    res.status(500).json({ message: "Error generating insights" });
  }
});

export default router;