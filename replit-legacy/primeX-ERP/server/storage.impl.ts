import { db, executeQuery } from "./db";
import { 
  users, tenants, subscriptions, customers, customerAgents, roles,
  tasks, taskComments, taskAIInsights, warehouses, inquiries, 
  itemCategories, itemSubcategories, itemUnits, items, itemVariants, itemStock,
  billOfMaterials, bomComponents, priceLists, priceListItems,
  quotations, quotationMaterials, quotationManufacturing, quotationOtherCosts, quotationCostSummary,
  orders, orderColorSizeBreakdown, orderMaterials, orderSamples, orderTrims,
  timeActionPlans, timeActionMilestones, customerInteractions, sampleDevelopments, sampleMaterials,
  crmActivities, sampleApprovals, trimApprovals, portalActivityLogs,
  customerInsights, communicationTemplates, buyerPortalUsers,
  type User, type Tenant, type Subscription, type Customer, type CustomerAgent,
  type Task, type TaskComment, type TaskAIInsight, type Warehouse, type Inquiry, 
  type ItemCategory, type ItemSubcategory, type ItemUnit, type Item, type ItemVariant,
  type ItemStock, type BillOfMaterials, type BomComponent, type PriceList, type PriceListItem,
  type Quotation, type QuotationMaterial, type QuotationManufacturing, type QuotationOtherCost, type QuotationCostSummary,
  type Order, type OrderColorSizeBreakdown, type OrderMaterial, type OrderSample, type OrderTrim,
  type TimeActionPlan, type TimeActionMilestone, type CustomerInteraction, 
  type SampleDevelopment, type SampleMaterial,
  type CrmActivity, type SampleApproval, type TrimApproval, type PortalActivityLog,
  type CustomerInsight, type CommunicationTemplate, type BuyerPortalUser,
  type InsertUser, type InsertTenant, type InsertSubscription, 
  type InsertCustomer, type InsertCustomerAgent, type InsertWarehouse, type InsertInquiry,
  type InsertTask, type InsertTaskComment, type InsertTaskAIInsight, 
  type InsertItemCategory, type InsertItemSubcategory, type InsertItemUnit,
  type InsertItem, type InsertItemVariant, type InsertItemStock,
  type InsertBillOfMaterials, type InsertBomComponent, type InsertPriceList, type InsertPriceListItem,
  type InsertQuotation, type InsertQuotationMaterial, type InsertQuotationManufacturing, 
  type InsertQuotationOtherCost, type InsertQuotationCostSummary,
  type InsertOrder, type InsertOrderColorSizeBreakdown, type InsertOrderMaterial, 
  type InsertOrderSample, type InsertOrderTrim, type InsertTimeActionPlan,
  type InsertTimeActionMilestone, type InsertCustomerInteraction,
  type InsertSampleDevelopment, type InsertSampleMaterial,
  type InsertCrmActivity, type InsertSampleApproval, type InsertTrimApproval, type InsertPortalActivityLog,
  type InsertCustomerInsight, type InsertCommunicationTemplate, type InsertBuyerPortalUser,
  orderAmendments, type OrderAmendment, type InsertOrderAmendment
} from "@shared/schema";
import { eq, and, desc, asc, isNull, isNotNull, inArray, sql, like, or, gte, lte } from "drizzle-orm";
import { TaskFilters, ItemFilters, QuotationFilters, IStorage } from "./storage";
import { generateRandomId, generateQuotationId } from "./utils/idGenerator";
import bcrypt from "bcrypt";

// Create a default admin user if none exists
async function ensureAdminUserExists() {
  try {
    // Temporarily skip admin user creation to avoid schema issues
    console.log('Admin user check skipped - proceeding with existing user');
    return;
    const adminUsers = await db.select().from(users).where(eq(users.username, 'admin'));
    
    if (adminUsers.length === 0) {
      console.log('Creating default admin user...');
      // Create default tenant
      const [defaultTenant] = await db.insert(tenants).values({
        name: 'Prime7 Solutions',
        domain: 'prime7.primex.app',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      
      // Create default subscription
      await db.insert(subscriptions).values({
        tenantId: defaultTenant.id,
        plan: 'enterprise',
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Generate secure random password for admin - user must change on first login
      const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
      const hashedPassword = await bcrypt.hash(tempPassword, 12);
      console.log(`SECURITY: Temporary admin password generated - CHANGE IMMEDIATELY`);
      
      // Create admin user
      await db.insert(users).values({
        username: 'admin',
        email: 'admin@example.com',
        password: hashedPassword,
        role: 'admin',
        tenantId: defaultTenant.id,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      console.log('Default admin user created successfully');
    }
  } catch (error) {
    console.error('Error ensuring admin user exists:', error);
  }
}

// Try to create admin user on startup
ensureAdminUserExists().catch(console.error);

export class DatabaseStorage implements IStorage {
  // Methods for deleting all related records for a quotation
  async deleteAllQuotationMaterials(quotationId: number, tenantId: number): Promise<boolean> {
    return await executeQuery(async () => {
      const result = await db.delete(quotationMaterials)
        .where(and(
          eq(quotationMaterials.quotationId, quotationId),
          eq(quotationMaterials.tenantId, tenantId)
        ));
      return true; // Return true even if no records were deleted
    });
  }

  async deleteAllQuotationManufacturing(quotationId: number, tenantId: number): Promise<boolean> {
    return await executeQuery(async () => {
      const result = await db.delete(quotationManufacturing)
        .where(and(
          eq(quotationManufacturing.quotationId, quotationId),
          eq(quotationManufacturing.tenantId, tenantId)
        ));
      return true; // Return true even if no records were deleted
    });
  }

  async deleteAllQuotationOtherCosts(quotationId: number, tenantId: number): Promise<boolean> {
    return await executeQuery(async () => {
      const result = await db.delete(quotationOtherCosts)
        .where(and(
          eq(quotationOtherCosts.quotationId, quotationId),
          eq(quotationOtherCosts.tenantId, tenantId)
        ));
      return true; // Return true even if no records were deleted
    });
  }
  
  // Order methods
  async getAllOrders(tenantId: number, filters?: { customerId?: number; status?: string }): Promise<Order[]> {
    try {
      let query = db.select().from(orders).where(eq(orders.tenantId, tenantId));
      
      if (filters?.customerId) {
        query = query.where(eq(orders.customerId, filters.customerId));
      }
      
      if (filters?.status) {
        query = query.where(eq(orders.orderStatus, filters.status));
      }
      
      return await query.orderBy(desc(orders.createdAt));
    } catch (error) {
      console.error("Failed to get all orders:", error);
      return [];
    }
  }
  
  async getOrderById(id: number, tenantId: number): Promise<Order | undefined> {
    try {
      const [order] = await db.select()
        .from(orders)
        .where(and(
          eq(orders.id, id),
          eq(orders.tenantId, tenantId)
        ));
      
      return order;
    } catch (error) {
      console.error(`Failed to get order with ID ${id}:`, error);
      return undefined;
    }
  }
  
  async getOrderByOrderId(orderId: string, tenantId: number): Promise<Order | undefined> {
    try {
      const [order] = await db.select()
        .from(orders)
        .where(and(
          eq(orders.orderId, orderId),
          eq(orders.tenantId, tenantId)
        ));
      
      return order;
    } catch (error) {
      console.error(`Failed to get order with order ID ${orderId}:`, error);
      return undefined;
    }
  }
  
  async createOrder(data: InsertOrder): Promise<Order> {
    try {
      const [order] = await db.insert(orders)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      return order;
    } catch (error) {
      console.error("Failed to create order:", error);
      throw new Error("Failed to create order");
    }
  }
  
  async updateOrder(id: number, tenantId: number, data: Partial<InsertOrder>): Promise<Order> {
    try {
      const [updatedOrder] = await db.update(orders)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(and(
          eq(orders.id, id),
          eq(orders.tenantId, tenantId)
        ))
        .returning();
      
      if (!updatedOrder) {
        throw new Error(`Order with ID ${id} not found`);
      }
      
      return updatedOrder;
    } catch (error) {
      console.error(`Failed to update order with ID ${id}:`, error);
      throw new Error(`Failed to update order with ID ${id}`);
    }
  }
  
  async deleteOrder(id: number, tenantId: number): Promise<boolean> {
    try {
      // First delete associated records
      await db.delete(orderColorSizeBreakdown).where(eq(orderColorSizeBreakdown.orderId, id));
      await db.delete(orderMaterials).where(eq(orderMaterials.orderId, id));
      await db.delete(orderSamples).where(eq(orderSamples.orderId, id));
      await db.delete(orderTrims).where(eq(orderTrims.orderId, id));
      
      // Get Time Action Plan associated with this order
      const [timeActionPlan] = await db.select()
        .from(timeActionPlans)
        .where(eq(timeActionPlans.orderId, id));
      
      if (timeActionPlan) {
        // Delete Time Action Milestones
        await db.delete(timeActionMilestones).where(eq(timeActionMilestones.planId, timeActionPlan.id));
        // Delete Time Action Plan
        await db.delete(timeActionPlans).where(eq(timeActionPlans.id, timeActionPlan.id));
      }
      
      // Delete customer interactions
      await db.delete(customerInteractions).where(and(
        eq(customerInteractions.entityType, 'order'),
        eq(customerInteractions.entityId, id)
      ));
      
      // Finally delete the order
      const result = await db.delete(orders)
        .where(and(
          eq(orders.id, id),
          eq(orders.tenantId, tenantId)
        ));
      
      return result.rowCount > 0;
    } catch (error) {
      console.error(`Failed to delete order with ID ${id}:`, error);
      return false;
    }
  }
  
  // Order Color/Size Breakdown methods
  async getOrderColorSizeBreakdown(orderId: number): Promise<OrderColorSizeBreakdown[]> {
    try {
      return await db.select()
        .from(orderColorSizeBreakdown)
        .where(eq(orderColorSizeBreakdown.orderId, orderId))
        .orderBy(asc(orderColorSizeBreakdown.id));
    } catch (error) {
      console.error(`Failed to get color/size breakdown for order ID ${orderId}:`, error);
      return [];
    }
  }
  
  async createOrderColorSizeBreakdown(data: InsertOrderColorSizeBreakdown): Promise<OrderColorSizeBreakdown> {
    try {
      const [item] = await db.insert(orderColorSizeBreakdown)
        .values(data)
        .returning();
      
      return item;
    } catch (error) {
      console.error("Failed to create order color/size breakdown:", error);
      throw new Error("Failed to create order color/size breakdown");
    }
  }
  
  async updateOrderColorSizeBreakdown(id: number, data: Partial<InsertOrderColorSizeBreakdown>): Promise<OrderColorSizeBreakdown> {
    try {
      const [updatedItem] = await db.update(orderColorSizeBreakdown)
        .set(data)
        .where(eq(orderColorSizeBreakdown.id, id))
        .returning();
      
      if (!updatedItem) {
        throw new Error(`Order color/size breakdown with ID ${id} not found`);
      }
      
      return updatedItem;
    } catch (error) {
      console.error(`Failed to update order color/size breakdown with ID ${id}:`, error);
      throw new Error(`Failed to update order color/size breakdown with ID ${id}`);
    }
  }
  
  async deleteOrderColorSizeBreakdown(orderId: number): Promise<boolean> {
    try {
      const result = await db.delete(orderColorSizeBreakdown)
        .where(eq(orderColorSizeBreakdown.orderId, orderId));
      
      return result.rowCount > 0;
    } catch (error) {
      console.error(`Failed to delete color/size breakdown for order ID ${orderId}:`, error);
      return false;
    }
  }
  
  // Order Materials methods
  async getOrderMaterials(orderId: number): Promise<OrderMaterial[]> {
    try {
      return await db.select()
        .from(orderMaterials)
        .where(eq(orderMaterials.orderId, orderId))
        .orderBy(asc(orderMaterials.id));
    } catch (error) {
      console.error(`Failed to get materials for order ID ${orderId}:`, error);
      return [];
    }
  }
  
  async createOrderMaterial(data: InsertOrderMaterial): Promise<OrderMaterial> {
    try {
      const [material] = await db.insert(orderMaterials)
        .values(data)
        .returning();
      
      return material;
    } catch (error) {
      console.error("Failed to create order material:", error);
      throw new Error("Failed to create order material");
    }
  }
  
  async updateOrderMaterial(id: number, data: Partial<InsertOrderMaterial>): Promise<OrderMaterial> {
    try {
      const [updatedMaterial] = await db.update(orderMaterials)
        .set(data)
        .where(eq(orderMaterials.id, id))
        .returning();
      
      if (!updatedMaterial) {
        throw new Error(`Order material with ID ${id} not found`);
      }
      
      return updatedMaterial;
    } catch (error) {
      console.error(`Failed to update order material with ID ${id}:`, error);
      throw new Error(`Failed to update order material with ID ${id}`);
    }
  }
  
  async deleteOrderMaterial(id: number): Promise<boolean> {
    try {
      const result = await db.delete(orderMaterials)
        .where(eq(orderMaterials.id, id));
      
      return result.rowCount > 0;
    } catch (error) {
      console.error(`Failed to delete order material with ID ${id}:`, error);
      return false;
    }
  }
  
  // Order Samples methods
  async getOrderSamples(orderId: number): Promise<OrderSample[]> {
    try {
      return await db.select()
        .from(orderSamples)
        .where(eq(orderSamples.orderId, orderId))
        .orderBy(asc(orderSamples.id));
    } catch (error) {
      console.error(`Failed to get samples for order ID ${orderId}:`, error);
      return [];
    }
  }
  
  async createOrderSample(data: InsertOrderSample): Promise<OrderSample> {
    try {
      const [sample] = await db.insert(orderSamples)
        .values(data)
        .returning();
      
      return sample;
    } catch (error) {
      console.error("Failed to create order sample:", error);
      throw new Error("Failed to create order sample");
    }
  }
  
  async updateOrderSample(id: number, data: Partial<InsertOrderSample>): Promise<OrderSample> {
    try {
      const [updatedSample] = await db.update(orderSamples)
        .set(data)
        .where(eq(orderSamples.id, id))
        .returning();
      
      if (!updatedSample) {
        throw new Error(`Order sample with ID ${id} not found`);
      }
      
      return updatedSample;
    } catch (error) {
      console.error(`Failed to update order sample with ID ${id}:`, error);
      throw new Error(`Failed to update order sample with ID ${id}`);
    }
  }
  
  async deleteOrderSample(id: number): Promise<boolean> {
    try {
      const result = await db.delete(orderSamples)
        .where(eq(orderSamples.id, id));
      
      return result.rowCount > 0;
    } catch (error) {
      console.error(`Failed to delete order sample with ID ${id}:`, error);
      return false;
    }
  }
  
  // Order Trims methods
  async getOrderTrims(orderId: number): Promise<OrderTrim[]> {
    try {
      return await db.select()
        .from(orderTrims)
        .where(eq(orderTrims.orderId, orderId))
        .orderBy(asc(orderTrims.id));
    } catch (error) {
      console.error(`Failed to get trims for order ID ${orderId}:`, error);
      return [];
    }
  }
  
  async createOrderTrim(data: InsertOrderTrim): Promise<OrderTrim> {
    try {
      const [trim] = await db.insert(orderTrims)
        .values(data)
        .returning();
      
      return trim;
    } catch (error) {
      console.error("Failed to create order trim:", error);
      throw new Error("Failed to create order trim");
    }
  }
  
  async updateOrderTrim(id: number, data: Partial<InsertOrderTrim>): Promise<OrderTrim> {
    try {
      const [updatedTrim] = await db.update(orderTrims)
        .set(data)
        .where(eq(orderTrims.id, id))
        .returning();
      
      if (!updatedTrim) {
        throw new Error(`Order trim with ID ${id} not found`);
      }
      
      return updatedTrim;
    } catch (error) {
      console.error(`Failed to update order trim with ID ${id}:`, error);
      throw new Error(`Failed to update order trim with ID ${id}`);
    }
  }
  
  async deleteOrderTrim(id: number): Promise<boolean> {
    try {
      const result = await db.delete(orderTrims)
        .where(eq(orderTrims.id, id));
      
      return result.rowCount > 0;
    } catch (error) {
      console.error(`Failed to delete order trim with ID ${id}:`, error);
      return false;
    }
  }
  
  // Time Action Plan methods
  async getTimeActionPlanByOrderId(orderId: number): Promise<TimeActionPlan | undefined> {
    try {
      const [plan] = await db.select()
        .from(timeActionPlans)
        .where(eq(timeActionPlans.orderId, orderId));
      
      return plan;
    } catch (error) {
      console.error(`Failed to get time action plan for order ID ${orderId}:`, error);
      return undefined;
    }
  }
  
  async createTimeActionPlan(data: InsertTimeActionPlan): Promise<TimeActionPlan> {
    try {
      const [plan] = await db.insert(timeActionPlans)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      return plan;
    } catch (error) {
      console.error("Failed to create time action plan:", error);
      throw new Error("Failed to create time action plan");
    }
  }
  
  async updateTimeActionPlan(id: number, data: Partial<InsertTimeActionPlan>): Promise<TimeActionPlan> {
    try {
      const [updatedPlan] = await db.update(timeActionPlans)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(eq(timeActionPlans.id, id))
        .returning();
      
      if (!updatedPlan) {
        throw new Error(`Time action plan with ID ${id} not found`);
      }
      
      return updatedPlan;
    } catch (error) {
      console.error(`Failed to update time action plan with ID ${id}:`, error);
      throw new Error(`Failed to update time action plan with ID ${id}`);
    }
  }
  
  async deleteTimeActionPlan(id: number): Promise<boolean> {
    try {
      // First delete all milestones
      await db.delete(timeActionMilestones)
        .where(eq(timeActionMilestones.planId, id));
      
      // Then delete the plan
      const result = await db.delete(timeActionPlans)
        .where(eq(timeActionPlans.id, id));
      
      return result.rowCount > 0;
    } catch (error) {
      console.error(`Failed to delete time action plan with ID ${id}:`, error);
      return false;
    }
  }
  
  // Time Action Milestone methods
  async getTimeActionMilestones(planId: number): Promise<TimeActionMilestone[]> {
    try {
      return await db.select()
        .from(timeActionMilestones)
        .where(eq(timeActionMilestones.planId, planId))
        .orderBy(asc(timeActionMilestones.sortOrder));
    } catch (error) {
      console.error(`Failed to get milestones for plan ID ${planId}:`, error);
      return [];
    }
  }
  
  async createTimeActionMilestone(data: InsertTimeActionMilestone): Promise<TimeActionMilestone> {
    try {
      const [milestone] = await db.insert(timeActionMilestones)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      return milestone;
    } catch (error) {
      console.error("Failed to create time action milestone:", error);
      throw new Error("Failed to create time action milestone");
    }
  }
  
  async updateTimeActionMilestone(id: number, data: Partial<InsertTimeActionMilestone>): Promise<TimeActionMilestone> {
    try {
      const [updatedMilestone] = await db.update(timeActionMilestones)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(eq(timeActionMilestones.id, id))
        .returning();
      
      if (!updatedMilestone) {
        throw new Error(`Time action milestone with ID ${id} not found`);
      }
      
      return updatedMilestone;
    } catch (error) {
      console.error(`Failed to update time action milestone with ID ${id}:`, error);
      throw new Error(`Failed to update time action milestone with ID ${id}`);
    }
  }
  
  async deleteTimeActionMilestone(id: number): Promise<boolean> {
    try {
      const result = await db.delete(timeActionMilestones)
        .where(eq(timeActionMilestones.id, id));
      
      return result.rowCount > 0;
    } catch (error) {
      console.error(`Failed to delete time action milestone with ID ${id}:`, error);
      return false;
    }
  }
  
  // Sample Development methods
  async getSampleDevelopmentsByOrderId(orderId: number): Promise<SampleDevelopment[]> {
    try {
      return await db.select()
        .from(sampleDevelopments)
        .where(and(
          eq(sampleDevelopments.entityType, 'order'),
          eq(sampleDevelopments.entityId, orderId)
        ))
        .orderBy(desc(sampleDevelopments.createdAt));
    } catch (error) {
      console.error(`Failed to get sample developments for order ID ${orderId}:`, error);
      return [];
    }
  }
  
  async createSampleDevelopment(data: InsertSampleDevelopment): Promise<SampleDevelopment> {
    try {
      const [sample] = await db.insert(sampleDevelopments)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      return sample;
    } catch (error) {
      console.error("Failed to create sample development:", error);
      throw new Error("Failed to create sample development");
    }
  }
  
  async updateSampleDevelopment(id: number, data: Partial<InsertSampleDevelopment>): Promise<SampleDevelopment> {
    try {
      const [updatedSample] = await db.update(sampleDevelopments)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(eq(sampleDevelopments.id, id))
        .returning();
      
      if (!updatedSample) {
        throw new Error(`Sample development with ID ${id} not found`);
      }
      
      return updatedSample;
    } catch (error) {
      console.error(`Failed to update sample development with ID ${id}:`, error);
      throw new Error(`Failed to update sample development with ID ${id}`);
    }
  }
  
  async deleteSampleDevelopment(id: number): Promise<boolean> {
    try {
      // First delete all sample materials
      await db.delete(sampleMaterials)
        .where(eq(sampleMaterials.sampleId, id));
      
      // Then delete the sample development
      const result = await db.delete(sampleDevelopments)
        .where(eq(sampleDevelopments.id, id));
      
      return result.rowCount > 0;
    } catch (error) {
      console.error(`Failed to delete sample development with ID ${id}:`, error);
      return false;
    }
  }
  
  // Sample Materials methods
  async getSampleMaterials(sampleId: number): Promise<SampleMaterial[]> {
    try {
      return await db.select()
        .from(sampleMaterials)
        .where(eq(sampleMaterials.sampleId, sampleId))
        .orderBy(asc(sampleMaterials.id));
    } catch (error) {
      console.error(`Failed to get materials for sample ID ${sampleId}:`, error);
      return [];
    }
  }
  
  async createSampleMaterial(data: InsertSampleMaterial): Promise<SampleMaterial> {
    try {
      const [material] = await db.insert(sampleMaterials)
        .values(data)
        .returning();
      
      return material;
    } catch (error) {
      console.error("Failed to create sample material:", error);
      throw new Error("Failed to create sample material");
    }
  }
  
  async updateSampleMaterial(id: number, data: Partial<InsertSampleMaterial>): Promise<SampleMaterial> {
    try {
      const [updatedMaterial] = await db.update(sampleMaterials)
        .set(data)
        .where(eq(sampleMaterials.id, id))
        .returning();
      
      if (!updatedMaterial) {
        throw new Error(`Sample material with ID ${id} not found`);
      }
      
      return updatedMaterial;
    } catch (error) {
      console.error(`Failed to update sample material with ID ${id}:`, error);
      throw new Error(`Failed to update sample material with ID ${id}`);
    }
  }
  
  async deleteSampleMaterial(id: number): Promise<boolean> {
    try {
      const result = await db.delete(sampleMaterials)
        .where(eq(sampleMaterials.id, id));
      
      return result.rowCount > 0;
    } catch (error) {
      console.error(`Failed to delete sample material with ID ${id}:`, error);
      return false;
    }
  }
  
  // Customer Interactions methods
  async getCustomerInteractionsByOrderId(orderId: number): Promise<CustomerInteraction[]> {
    try {
      return await db.select()
        .from(customerInteractions)
        .where(and(
          eq(customerInteractions.entityType, 'order'),
          eq(customerInteractions.entityId, orderId)
        ))
        .orderBy(desc(customerInteractions.createdAt));
    } catch (error) {
      console.error(`Failed to get customer interactions for order ID ${orderId}:`, error);
      return [];
    }
  }
  
  async createCustomerInteraction(data: InsertCustomerInteraction): Promise<CustomerInteraction> {
    try {
      const [interaction] = await db.insert(customerInteractions)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      return interaction;
    } catch (error) {
      console.error("Failed to create customer interaction:", error);
      throw new Error("Failed to create customer interaction");
    }
  }
  
  async updateCustomerInteraction(id: number, data: Partial<InsertCustomerInteraction>): Promise<CustomerInteraction> {
    try {
      const [updatedInteraction] = await db.update(customerInteractions)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(eq(customerInteractions.id, id))
        .returning();
      
      if (!updatedInteraction) {
        throw new Error(`Customer interaction with ID ${id} not found`);
      }
      
      return updatedInteraction;
    } catch (error) {
      console.error(`Failed to update customer interaction with ID ${id}:`, error);
      throw new Error(`Failed to update customer interaction with ID ${id}`);
    }
  }
  
  async deleteCustomerInteraction(id: number): Promise<boolean> {
    try {
      const result = await db.delete(customerInteractions)
        .where(eq(customerInteractions.id, id));
      
      return result.rowCount > 0;
    } catch (error) {
      console.error(`Failed to delete customer interaction with ID ${id}:`, error);
      return false;
    }
  }
  
  // Quotation operations
  async getAllQuotations(tenantId: number, filters?: QuotationFilters): Promise<Quotation[]> {
    try {
      let query = db.select().from(quotations).where(eq(quotations.tenantId, tenantId));
      
      if (filters) {
        // Apply filters
        if (filters.customerId) {
          query = query.where(eq(quotations.customerId, filters.customerId));
        }
        
        if (filters.inquiryId) {
          query = query.where(eq(quotations.inquiryId, filters.inquiryId));
        }
        
        if (filters.status) {
          if (Array.isArray(filters.status)) {
            query = query.where(inArray(quotations.status, filters.status));
          } else {
            query = query.where(eq(quotations.status, filters.status));
          }
        }
        
        if (filters.searchQuery) {
          query = query.where(
            or(
              like(quotations.quotationId, `%${filters.searchQuery}%`),
              like(quotations.styleName, `%${filters.searchQuery}%`),
              like(quotations.department, `%${filters.searchQuery}%`)
            )
          );
        }
        
        if (filters.dateRange?.start) {
          query = query.where(sql`${quotations.quotationDate} >= ${filters.dateRange.start}`);
        }
        
        if (filters.dateRange?.end) {
          query = query.where(sql`${quotations.quotationDate} <= ${filters.dateRange.end}`);
        }
        
        if (filters.projectedQuantityRange?.min) {
          query = query.where(sql`${quotations.projectedQuantity} >= ${filters.projectedQuantityRange.min}`);
        }
        
        if (filters.projectedQuantityRange?.max) {
          query = query.where(sql`${quotations.projectedQuantity} <= ${filters.projectedQuantityRange.max}`);
        }
        
        if (filters.priceRange?.min) {
          query = query.where(sql`${quotations.quotedPrice} >= ${filters.priceRange.min}`);
        }
        
        if (filters.priceRange?.max) {
          query = query.where(sql`${quotations.quotedPrice} <= ${filters.priceRange.max}`);
        }
        
        if (filters.departmentList && filters.departmentList.length > 0) {
          query = query.where(inArray(quotations.department, filters.departmentList));
        }
        
        // Sort
        if (filters.sortBy) {
          const direction = filters.sortDirection === 'desc' ? desc : asc;
          switch (filters.sortBy) {
            case 'quotationId':
              query = query.orderBy(direction(quotations.quotationId));
              break;
            case 'quotationDate':
              query = query.orderBy(direction(quotations.quotationDate));
              break;
            case 'styleName':
              query = query.orderBy(direction(quotations.styleName));
              break;
            case 'projectedQuantity':
              query = query.orderBy(direction(quotations.projectedQuantity));
              break;
            case 'quotedPrice':
              query = query.orderBy(direction(quotations.quotedPrice));
              break;
            default:
              query = query.orderBy(desc(quotations.createdAt));
          }
        } else {
          query = query.orderBy(desc(quotations.createdAt));
        }
        
        // Pagination
        if (filters.limit) {
          query = query.limit(filters.limit);
        }
        
        if (filters.offset) {
          query = query.offset(filters.offset);
        }
      } else {
        query = query.orderBy(desc(quotations.createdAt));
      }
      
      return await query;
    } catch (error) {
      console.error("Error in getAllQuotations:", error);
      return [];
    }
  }
  
  async getQuotationById(id: number, tenantId: number): Promise<Quotation | undefined> {
    try {
      const [quotation] = await db
        .select()
        .from(quotations)
        .where(and(eq(quotations.id, id), eq(quotations.tenantId, tenantId)));
      
      return quotation;
    } catch (error) {
      console.error("Error in getQuotationById:", error);
      return undefined;
    }
  }
  
  async getQuotationByQuotationId(quotationId: string, tenantId: number): Promise<Quotation | undefined> {
    try {
      const [quotation] = await db
        .select()
        .from(quotations)
        .where(and(eq(quotations.quotationId, quotationId), eq(quotations.tenantId, tenantId)));
      
      return quotation;
    } catch (error) {
      console.error("Error in getQuotationByQuotationId:", error);
      return undefined;
    }
  }
  
  async createQuotation(quotation: InsertQuotation): Promise<Quotation> {
    try {
      // Generate a quotation ID if not provided
      if (!quotation.quotationId) {
        quotation.quotationId = `QUO-${generateRandomId(5)}`;
      }
      
      const [newQuotation] = await db
        .insert(quotations)
        .values(quotation)
        .returning();
      
      return newQuotation;
    } catch (error) {
      console.error("Error in createQuotation:", error);
      throw error;
    }
  }
  
  async updateQuotation(id: number, tenantId: number, data: Partial<InsertQuotation>): Promise<Quotation> {
    try {
      const [updatedQuotation] = await db
        .update(quotations)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(quotations.id, id), eq(quotations.tenantId, tenantId)))
        .returning();
      
      return updatedQuotation;
    } catch (error) {
      console.error("Error in updateQuotation:", error);
      throw error;
    }
  }
  
  async deleteQuotation(id: number, tenantId: number): Promise<boolean> {
    try {
      await db
        .delete(quotations)
        .where(and(eq(quotations.id, id), eq(quotations.tenantId, tenantId)));
      
      return true;
    } catch (error) {
      console.error("Error in deleteQuotation:", error);
      return false;
    }
  }
  
  // Quotation material operations
  async getQuotationMaterials(quotationId: number, tenantId: number): Promise<QuotationMaterial[]> {
    try {
      const materials = await db
        .select()
        .from(quotationMaterials)
        .where(and(
          eq(quotationMaterials.quotationId, quotationId),
          eq(quotationMaterials.tenantId, tenantId)
        ))
        .orderBy(asc(quotationMaterials.serialNo));
      
      return materials;
    } catch (error) {
      console.error("Error in getQuotationMaterials:", error);
      return [];
    }
  }
  
  async createQuotationMaterial(material: InsertQuotationMaterial): Promise<QuotationMaterial> {
    try {
      const [newMaterial] = await db
        .insert(quotationMaterials)
        .values(material)
        .returning();
      
      return newMaterial;
    } catch (error) {
      console.error("Error in createQuotationMaterial:", error);
      throw error;
    }
  }
  
  async updateQuotationMaterial(id: number, tenantId: number, data: Partial<InsertQuotationMaterial>): Promise<QuotationMaterial> {
    try {
      const [updatedMaterial] = await db
        .update(quotationMaterials)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(quotationMaterials.id, id), eq(quotationMaterials.tenantId, tenantId)))
        .returning();
      
      return updatedMaterial;
    } catch (error) {
      console.error("Error in updateQuotationMaterial:", error);
      throw error;
    }
  }
  
  async deleteQuotationMaterial(id: number, tenantId: number): Promise<boolean> {
    try {
      await db
        .delete(quotationMaterials)
        .where(and(eq(quotationMaterials.id, id), eq(quotationMaterials.tenantId, tenantId)));
      
      return true;
    } catch (error) {
      console.error("Error in deleteQuotationMaterial:", error);
      return false;
    }
  }
  
  // Quotation manufacturing operations
  async getQuotationManufacturing(quotationId: number, tenantId: number): Promise<QuotationManufacturing[]> {
    try {
      const manufacturingCosts = await db
        .select()
        .from(quotationManufacturing)
        .where(and(
          eq(quotationManufacturing.quotationId, quotationId),
          eq(quotationManufacturing.tenantId, tenantId)
        ))
        .orderBy(asc(quotationManufacturing.serialNo));
      
      return manufacturingCosts;
    } catch (error) {
      console.error("Error in getQuotationManufacturing:", error);
      return [];
    }
  }
  
  async createQuotationManufacturing(manufacturing: InsertQuotationManufacturing): Promise<QuotationManufacturing> {
    try {
      const [newManufacturing] = await db
        .insert(quotationManufacturing)
        .values(manufacturing)
        .returning();
      
      return newManufacturing;
    } catch (error) {
      console.error("Error in createQuotationManufacturing:", error);
      throw error;
    }
  }
  
  async updateQuotationManufacturing(id: number, tenantId: number, data: Partial<InsertQuotationManufacturing>): Promise<QuotationManufacturing> {
    try {
      const [updatedManufacturing] = await db
        .update(quotationManufacturing)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(quotationManufacturing.id, id), eq(quotationManufacturing.tenantId, tenantId)))
        .returning();
      
      return updatedManufacturing;
    } catch (error) {
      console.error("Error in updateQuotationManufacturing:", error);
      throw error;
    }
  }
  
  async deleteQuotationManufacturing(id: number, tenantId: number): Promise<boolean> {
    try {
      await db
        .delete(quotationManufacturing)
        .where(and(eq(quotationManufacturing.id, id), eq(quotationManufacturing.tenantId, tenantId)));
      
      return true;
    } catch (error) {
      console.error("Error in deleteQuotationManufacturing:", error);
      return false;
    }
  }
  
  // Quotation other costs operations
  async getQuotationOtherCosts(quotationId: number, tenantId: number): Promise<QuotationOtherCost[]> {
    try {
      const otherCosts = await db
        .select()
        .from(quotationOtherCosts)
        .where(and(
          eq(quotationOtherCosts.quotationId, quotationId),
          eq(quotationOtherCosts.tenantId, tenantId)
        ))
        .orderBy(asc(quotationOtherCosts.serialNo));
      
      return otherCosts;
    } catch (error) {
      console.error("Error in getQuotationOtherCosts:", error);
      return [];
    }
  }
  
  async createQuotationOtherCost(otherCost: InsertQuotationOtherCost): Promise<QuotationOtherCost> {
    try {
      const [newOtherCost] = await db
        .insert(quotationOtherCosts)
        .values(otherCost)
        .returning();
      
      return newOtherCost;
    } catch (error) {
      console.error("Error in createQuotationOtherCost:", error);
      throw error;
    }
  }
  
  async updateQuotationOtherCost(id: number, tenantId: number, data: Partial<InsertQuotationOtherCost>): Promise<QuotationOtherCost> {
    try {
      const [updatedOtherCost] = await db
        .update(quotationOtherCosts)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(quotationOtherCosts.id, id), eq(quotationOtherCosts.tenantId, tenantId)))
        .returning();
      
      return updatedOtherCost;
    } catch (error) {
      console.error("Error in updateQuotationOtherCost:", error);
      throw error;
    }
  }
  
  async deleteQuotationOtherCost(id: number, tenantId: number): Promise<boolean> {
    try {
      await db
        .delete(quotationOtherCosts)
        .where(and(eq(quotationOtherCosts.id, id), eq(quotationOtherCosts.tenantId, tenantId)));
      
      return true;
    } catch (error) {
      console.error("Error in deleteQuotationOtherCost:", error);
      return false;
    }
  }
  
  // Quotation cost summary operations
  async getQuotationCostSummary(quotationId: number, tenantId: number): Promise<QuotationCostSummary[]> {
    try {
      const costSummary = await db
        .select()
        .from(quotationCostSummary)
        .where(and(
          eq(quotationCostSummary.quotationId, quotationId),
          eq(quotationCostSummary.tenantId, tenantId)
        ));
      
      return costSummary;
    } catch (error) {
      console.error("Error in getQuotationCostSummary:", error);
      return [];
    }
  }
  
  async createQuotationCostSummary(costSummary: InsertQuotationCostSummary): Promise<QuotationCostSummary> {
    try {
      const [newCostSummary] = await db
        .insert(quotationCostSummary)
        .values(costSummary)
        .returning();
      
      return newCostSummary;
    } catch (error) {
      console.error("Error in createQuotationCostSummary:", error);
      throw error;
    }
  }
  
  async updateQuotationCostSummary(id: number, tenantId: number, data: Partial<InsertQuotationCostSummary>): Promise<QuotationCostSummary> {
    try {
      const [updatedCostSummary] = await db
        .update(quotationCostSummary)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(quotationCostSummary.id, id), eq(quotationCostSummary.tenantId, tenantId)))
        .returning();
      
      return updatedCostSummary;
    } catch (error) {
      console.error("Error in updateQuotationCostSummary:", error);
      throw error;
    }
  }
  
  async deleteQuotationCostSummary(id: number, tenantId: number): Promise<boolean> {
    try {
      await db
        .delete(quotationCostSummary)
        .where(and(eq(quotationCostSummary.id, id), eq(quotationCostSummary.tenantId, tenantId)));
      
      return true;
    } catch (error) {
      console.error("Error in deleteQuotationCostSummary:", error);
      return false;
    }
  }
  
  // Inquiry to Quotation conversion
  async convertInquiryToQuotation(inquiryId: number, tenantId: number, profitPercentage: number = 15): Promise<Quotation> {
    try {
      // Get the inquiry details
      const inquiry = await this.getInquiryById(inquiryId, tenantId);
      if (!inquiry) {
        throw new Error("Inquiry not found");
      }
      
      // Properly handle the dates to avoid NaN date errors
      // Using a properly formatted date string (YYYY-MM-DD) instead of Date objects for dates
      // This is needed because the projectedDeliveryDate in inquiries is timestamp, but in quotations it's date
      let projectedDeliveryDateStr: string | undefined;
      
      if (inquiry.projectedDeliveryDate) {
        try {
          // Convert to date object first (whether it's a string or Date already)
          const dateObj = typeof inquiry.projectedDeliveryDate === 'string' 
            ? new Date(inquiry.projectedDeliveryDate) 
            : inquiry.projectedDeliveryDate;
            
          // Validate that we have a valid date
          if (!isNaN(dateObj.getTime())) {
            // Format as YYYY-MM-DD string for PostgreSQL date field
            projectedDeliveryDateStr = dateObj.toISOString().split('T')[0];
          } else {
            // If invalid, use today + 60 days as fallback
            const fallbackDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
            projectedDeliveryDateStr = fallbackDate.toISOString().split('T')[0];
          }
        } catch (e) {
          // If parsing fails, use today + 60 days as fallback
          const fallbackDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
          projectedDeliveryDateStr = fallbackDate.toISOString().split('T')[0];
        }
      } else {
        // If no date provided, use today + 60 days as default
        const fallbackDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
        projectedDeliveryDateStr = fallbackDate.toISOString().split('T')[0];
      }
      
      // Today's date and 30 days from now for quotation validity as YYYY-MM-DD strings
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const validUntilDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      const validUntilStr = validUntilDate.toISOString().split('T')[0];
      
      // Generate proper quotation ID
      const quotationId = await generateQuotationId(tenantId);
      
      // Create a new quotation from the inquiry
      const quotationData: InsertQuotation = {
        tenantId,
        quotationId,
        inquiryId,
        customerId: inquiry.customerId,
        styleName: inquiry.styleName,
        department: inquiry.department,
        projectedQuantity: inquiry.projectedQuantity,
        projectedDeliveryDate: projectedDeliveryDateStr,
        targetPrice: inquiry.targetPrice,
        status: "draft",
        profitPercentage: profitPercentage.toString(),
        quotationDate: todayStr,
        validUntil: validUntilStr,
        notes: `Converted from Inquiry ${inquiry.inquiryId}`,
        createdBy: 1, // Default admin user
      };
      
      // Create the quotation
      const newQuotation = await this.createQuotation(quotationData);
      
      return newQuotation;
    } catch (error) {
      console.error("Error in convertInquiryToQuotation:", error);
      throw error;
    }
  }
  
  // Item Category operations
  async getAllItemCategories(tenantId: number): Promise<ItemCategory[]> {
    return await executeQuery(() => 
      db.select()
        .from(itemCategories)
        .where(eq(itemCategories.tenantId, tenantId))
        .orderBy(asc(itemCategories.name))
    );
  }

  async getItemCategoryById(id: number, tenantId: number): Promise<ItemCategory | undefined> {
    const [category] = await executeQuery(() => 
      db.select()
        .from(itemCategories)
        .where(and(
          eq(itemCategories.id, id),
          eq(itemCategories.tenantId, tenantId)
        ))
    );
    return category;
  }

  async getItemCategoryByCategoryId(categoryId: string, tenantId: number): Promise<ItemCategory | undefined> {
    const [category] = await executeQuery(() => 
      db.select()
        .from(itemCategories)
        .where(and(
          eq(itemCategories.categoryId, categoryId),
          eq(itemCategories.tenantId, tenantId)
        ))
    );
    return category;
  }

  async createItemCategory(category: InsertItemCategory): Promise<ItemCategory> {
    const now = new Date();
    const [newCategory] = await executeQuery(() => 
      db.insert(itemCategories)
        .values({
          ...category,
          createdAt: now,
          updatedAt: now
        })
        .returning()
    );
    return newCategory;
  }

  async updateItemCategory(id: number, tenantId: number, data: Partial<InsertItemCategory>): Promise<ItemCategory> {
    const [updatedCategory] = await executeQuery(() => 
      db.update(itemCategories)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(and(
          eq(itemCategories.id, id),
          eq(itemCategories.tenantId, tenantId)
        ))
        .returning()
    );
    return updatedCategory;
  }

  async deleteItemCategory(id: number, tenantId: number): Promise<boolean> {
    try {
      await executeQuery(() => 
        db.delete(itemCategories)
          .where(and(
            eq(itemCategories.id, id),
            eq(itemCategories.tenantId, tenantId)
          ))
      );
      return true;
    } catch (error) {
      console.error('Error deleting item category:', error);
      return false;
    }
  }
  
  // Item Subcategory operations
  async getAllItemSubcategories(tenantId: number, categoryId?: number): Promise<ItemSubcategory[]> {
    let query = db.select()
      .from(itemSubcategories)
      .where(eq(itemSubcategories.tenantId, tenantId));
    
    if (categoryId) {
      query = query.where(eq(itemSubcategories.categoryId, categoryId));
    }
    
    return await executeQuery(() => query.orderBy(asc(itemSubcategories.name)));
  }

  async getItemSubcategoryById(id: number, tenantId: number): Promise<ItemSubcategory | undefined> {
    const [subcategory] = await executeQuery(() => 
      db.select()
        .from(itemSubcategories)
        .where(and(
          eq(itemSubcategories.id, id),
          eq(itemSubcategories.tenantId, tenantId)
        ))
    );
    return subcategory;
  }

  async getItemSubcategoryBySubcategoryId(subcategoryId: string, tenantId: number): Promise<ItemSubcategory | undefined> {
    const [subcategory] = await executeQuery(() => 
      db.select()
        .from(itemSubcategories)
        .where(and(
          eq(itemSubcategories.subcategoryId, subcategoryId),
          eq(itemSubcategories.tenantId, tenantId)
        ))
    );
    return subcategory;
  }

  async createItemSubcategory(subcategory: InsertItemSubcategory): Promise<ItemSubcategory> {
    const now = new Date();
    const [newSubcategory] = await executeQuery(() => 
      db.insert(itemSubcategories)
        .values({
          ...subcategory,
          createdAt: now,
          updatedAt: now
        })
        .returning()
    );
    return newSubcategory;
  }

  async updateItemSubcategory(id: number, tenantId: number, data: Partial<InsertItemSubcategory>): Promise<ItemSubcategory> {
    const [updatedSubcategory] = await executeQuery(() => 
      db.update(itemSubcategories)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(and(
          eq(itemSubcategories.id, id),
          eq(itemSubcategories.tenantId, tenantId)
        ))
        .returning()
    );
    return updatedSubcategory;
  }

  async deleteItemSubcategory(id: number, tenantId: number): Promise<boolean> {
    try {
      await executeQuery(() => 
        db.delete(itemSubcategories)
          .where(and(
            eq(itemSubcategories.id, id),
            eq(itemSubcategories.tenantId, tenantId)
          ))
      );
      return true;
    } catch (error) {
      console.error('Error deleting item subcategory:', error);
      return false;
    }
  }
  
  // Item Unit operations
  async getAllItemUnits(tenantId: number, type?: string): Promise<ItemUnit[]> {
    let query = db.select()
      .from(itemUnits)
      .where(eq(itemUnits.tenantId, tenantId));
    
    if (type) {
      query = query.where(eq(itemUnits.type, type));
    }
    
    return await executeQuery(() => query.orderBy(asc(itemUnits.name)));
  }

  async getItemUnitById(id: number, tenantId: number): Promise<ItemUnit | undefined> {
    const [unit] = await executeQuery(() => 
      db.select()
        .from(itemUnits)
        .where(and(
          eq(itemUnits.id, id),
          eq(itemUnits.tenantId, tenantId)
        ))
    );
    return unit;
  }

  async getItemUnitByUnitCode(unitCode: string, tenantId: number): Promise<ItemUnit | undefined> {
    const [unit] = await executeQuery(() => 
      db.select()
        .from(itemUnits)
        .where(and(
          eq(itemUnits.unitCode, unitCode),
          eq(itemUnits.tenantId, tenantId)
        ))
    );
    return unit;
  }

  async createItemUnit(unit: InsertItemUnit): Promise<ItemUnit> {
    const now = new Date();
    const [newUnit] = await executeQuery(() => 
      db.insert(itemUnits)
        .values({
          ...unit,
          createdAt: now,
          updatedAt: now
        })
        .returning()
    );
    return newUnit;
  }

  async updateItemUnit(id: number, tenantId: number, data: Partial<InsertItemUnit>): Promise<ItemUnit> {
    const [updatedUnit] = await executeQuery(() => 
      db.update(itemUnits)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(and(
          eq(itemUnits.id, id),
          eq(itemUnits.tenantId, tenantId)
        ))
        .returning()
    );
    return updatedUnit;
  }

  async deleteItemUnit(id: number, tenantId: number): Promise<boolean> {
    try {
      await executeQuery(() => 
        db.delete(itemUnits)
          .where(and(
            eq(itemUnits.id, id),
            eq(itemUnits.tenantId, tenantId)
          ))
      );
      return true;
    } catch (error) {
      console.error('Error deleting item unit:', error);
      return false;
    }
  }

  // Item operations
  async getAllItems(tenantId: number, filters?: ItemFilters): Promise<Item[]> {
    let query = db.select()
      .from(items)
      .where(eq(items.tenantId, tenantId));
    
    if (filters) {
      if (filters.categoryId) {
        query = query.where(eq(items.categoryId, filters.categoryId));
      }
      
      if (filters.subcategoryId) {
        query = query.where(eq(items.subcategoryId, filters.subcategoryId));
      }
      
      if (filters.type) {
        if (Array.isArray(filters.type)) {
          query = query.where(inArray(items.type, filters.type));
        } else {
          query = query.where(eq(items.type, filters.type));
        }
      }
      
      if (filters.searchQuery) {
        query = query.where(
          sql`LOWER(${items.name}) LIKE LOWER(${'%' + filters.searchQuery + '%'}) OR 
              LOWER(${items.description}) LIKE LOWER(${'%' + filters.searchQuery + '%'}) OR
              LOWER(${items.itemCode}) LIKE LOWER(${'%' + filters.searchQuery + '%'})
          `
        );
      }
      
      if (filters.isActive !== undefined) {
        query = query.where(eq(items.isActive, filters.isActive));
      }
      
      if (filters.hasVariants !== undefined) {
        query = query.where(eq(items.hasVariants, filters.hasVariants));
      }
      
      if (filters.isStockable !== undefined) {
        query = query.where(eq(items.isStockable, filters.isStockable));
      }
      
      if (filters.isServiceItem !== undefined) {
        query = query.where(eq(items.isServiceItem, filters.isServiceItem));
      }
      
      if (filters.isBillOfMaterial !== undefined) {
        query = query.where(eq(items.isBillOfMaterial, filters.isBillOfMaterial));
      }
      
      if (filters.tags && filters.tags.length > 0) {
        query = query.where(
          sql`${items.tags} && ARRAY[${filters.tags.map(tag => `'${tag}'`).join(', ')}]::text[]`
        );
      }
      
      // Sort options
      const sortField = filters.sortBy || 'name';
      const sortDir = filters.sortDirection === 'desc' ? desc : asc;
      
      // Map client-side sort field to database field
      let orderByField;
      switch (sortField) {
        case 'itemCode':
          orderByField = items.itemCode;
          break;
        case 'type':
          orderByField = items.type;
          break;
        case 'updatedAt':
          orderByField = items.updatedAt;
          break;
        case 'name':
        default:
          orderByField = items.name;
      }
      
      query = query.orderBy(sortDir(orderByField));
      
      // Limit and offset for pagination
      if (filters.limit) {
        query = query.limit(filters.limit);
        
        if (filters.offset) {
          query = query.offset(filters.offset);
        }
      }
    } else {
      // Default sorting
      query = query.orderBy(asc(items.name));
    }
    
    return await executeQuery(() => query);
  }

  async getItemById(id: number, tenantId: number): Promise<Item | undefined> {
    const [item] = await executeQuery(() => 
      db.select()
        .from(items)
        .where(and(
          eq(items.id, id),
          eq(items.tenantId, tenantId)
        ))
    );
    return item;
  }

  async getItemByItemCode(itemCode: string, tenantId: number): Promise<Item | undefined> {
    const [item] = await executeQuery(() => 
      db.select()
        .from(items)
        .where(and(
          eq(items.itemCode, itemCode),
          eq(items.tenantId, tenantId)
        ))
    );
    return item;
  }

  async createItem(item: InsertItem): Promise<Item> {
    const now = new Date();
    const [newItem] = await executeQuery(() => 
      db.insert(items)
        .values({
          ...item,
          createdAt: now,
          updatedAt: now
        })
        .returning()
    );
    return newItem;
  }

  async updateItem(id: number, tenantId: number, data: Partial<InsertItem>): Promise<Item> {
    const [updatedItem] = await executeQuery(() => 
      db.update(items)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(and(
          eq(items.id, id),
          eq(items.tenantId, tenantId)
        ))
        .returning()
    );
    return updatedItem;
  }

  async deleteItem(id: number, tenantId: number): Promise<boolean> {
    try {
      await executeQuery(() => 
        db.delete(items)
          .where(and(
            eq(items.id, id),
            eq(items.tenantId, tenantId)
          ))
      );
      return true;
    } catch (error) {
      console.error('Error deleting item:', error);
      return false;
    }
  }

  // Item variant operations
  async getItemVariants(itemId: number, tenantId: number): Promise<ItemVariant[]> {
    return await executeQuery(() => 
      db.select()
        .from(itemVariants)
        .where(and(
          eq(itemVariants.parentItemId, itemId),
          eq(itemVariants.tenantId, tenantId)
        ))
        .orderBy(asc(itemVariants.name))
    );
  }

  async getItemVariantById(id: number, tenantId: number): Promise<ItemVariant | undefined> {
    const [variant] = await executeQuery(() => 
      db.select()
        .from(itemVariants)
        .where(and(
          eq(itemVariants.id, id),
          eq(itemVariants.tenantId, tenantId)
        ))
    );
    return variant;
  }

  async createItemVariant(variant: InsertItemVariant): Promise<ItemVariant> {
    const now = new Date();
    const [newVariant] = await executeQuery(() => 
      db.insert(itemVariants)
        .values({
          ...variant,
          createdAt: now,
          updatedAt: now
        })
        .returning()
    );
    return newVariant;
  }

  async updateItemVariant(id: number, tenantId: number, data: Partial<InsertItemVariant>): Promise<ItemVariant> {
    const [updatedVariant] = await executeQuery(() => 
      db.update(itemVariants)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(and(
          eq(itemVariants.id, id),
          eq(itemVariants.tenantId, tenantId)
        ))
        .returning()
    );
    return updatedVariant;
  }

  async deleteItemVariant(id: number, tenantId: number): Promise<boolean> {
    try {
      await executeQuery(() => 
        db.delete(itemVariants)
          .where(and(
            eq(itemVariants.id, id),
            eq(itemVariants.tenantId, tenantId)
          ))
      );
      return true;
    } catch (error) {
      console.error('Error deleting item variant:', error);
      return false;
    }
  }

  // Item stock operations
  async getItemStock(itemId: number, tenantId: number, warehouseId?: number): Promise<ItemStock[]> {
    let query = db.select()
      .from(itemStock)
      .where(and(
        eq(itemStock.itemId, itemId),
        eq(itemStock.tenantId, tenantId)
      ));
    
    if (warehouseId) {
      query = query.where(eq(itemStock.warehouseId, warehouseId));
    }
    
    return await executeQuery(() => query);
  }

  async getItemStockById(id: number, tenantId: number): Promise<ItemStock | undefined> {
    const [stock] = await executeQuery(() => 
      db.select()
        .from(itemStock)
        .where(and(
          eq(itemStock.id, id),
          eq(itemStock.tenantId, tenantId)
        ))
    );
    return stock;
  }

  async updateItemStock(id: number, tenantId: number, data: Partial<InsertItemStock>): Promise<ItemStock> {
    const [updatedStock] = await executeQuery(() => 
      db.update(itemStock)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(and(
          eq(itemStock.id, id),
          eq(itemStock.tenantId, tenantId)
        ))
        .returning()
    );
    return updatedStock;
  }

  async adjustItemStock(
    itemId: number, 
    warehouseId: number, 
    quantity: number, 
    reason: string, 
    tenantId: number
  ): Promise<ItemStock> {
    // First, check if stock entry exists
    const [existingStock] = await executeQuery(() => 
      db.select()
        .from(itemStock)
        .where(and(
          eq(itemStock.itemId, itemId),
          eq(itemStock.warehouseId, warehouseId),
          eq(itemStock.tenantId, tenantId)
        ))
    );
    
    if (existingStock) {
      // Update existing stock
      const newQuantity = parseFloat(existingStock.quantity) + quantity;
      const availableQuantity = newQuantity - parseFloat(existingStock.reservedQuantity || '0');
      
      const [updatedStock] = await executeQuery(() => 
        db.update(itemStock)
          .set({
            quantity: newQuantity.toString(),
            availableQuantity: availableQuantity.toString(),
            notes: existingStock.notes ? `${existingStock.notes}; ${reason}` : reason,
            updatedAt: new Date()
          })
          .where(and(
            eq(itemStock.id, existingStock.id),
            eq(itemStock.tenantId, tenantId)
          ))
          .returning()
      );
      
      return updatedStock;
    } else {
      // Create new stock entry
      const now = new Date();
      const [newStock] = await executeQuery(() => 
        db.insert(itemStock)
          .values({
            itemId,
            warehouseId,
            tenantId,
            quantity: quantity.toString(),
            reservedQuantity: '0',
            availableQuantity: quantity.toString(),
            notes: reason,
            createdAt: now,
            updatedAt: now
          })
          .returning()
      );
      
      return newStock;
    }
  }
  
  // Bill of Materials operations
  async getItemBOM(itemId: number, tenantId: number, version?: string): Promise<BillOfMaterials | undefined> {
    let query = db.select()
      .from(billOfMaterials)
      .where(and(
        eq(billOfMaterials.itemId, itemId),
        eq(billOfMaterials.tenantId, tenantId)
      ));
    
    if (version) {
      query = query.where(eq(billOfMaterials.version, version));
    } else {
      // If no version specified, return the default one or latest one
      query = query.where(eq(billOfMaterials.isDefault, true));
    }
    
    const [bom] = await executeQuery(() => query.limit(1));
    return bom;
  }

  async getBillOfMaterialsById(id: number, tenantId: number): Promise<BillOfMaterials | undefined> {
    const [bom] = await executeQuery(() => 
      db.select()
        .from(billOfMaterials)
        .where(and(
          eq(billOfMaterials.id, id),
          eq(billOfMaterials.tenantId, tenantId)
        ))
    );
    return bom;
  }

  async createBillOfMaterials(bom: InsertBillOfMaterials): Promise<BillOfMaterials> {
    const now = new Date();
    
    // If setting this BOM as default, unset any previous default
    if (bom.isDefault) {
      await executeQuery(() => 
        db.update(billOfMaterials)
          .set({ isDefault: false })
          .where(and(
            eq(billOfMaterials.itemId, bom.itemId),
            eq(billOfMaterials.tenantId, bom.tenantId),
            eq(billOfMaterials.isDefault, true)
          ))
      );
    }
    
    const [newBom] = await executeQuery(() => 
      db.insert(billOfMaterials)
        .values({
          ...bom,
          createdAt: now,
          updatedAt: now
        })
        .returning()
    );
    
    return newBom;
  }

  async updateBillOfMaterials(id: number, tenantId: number, data: Partial<InsertBillOfMaterials>): Promise<BillOfMaterials> {
    // If setting this BOM as default, unset any previous default
    if (data.isDefault) {
      const [currentBom] = await executeQuery(() => 
        db.select()
          .from(billOfMaterials)
          .where(and(
            eq(billOfMaterials.id, id),
            eq(billOfMaterials.tenantId, tenantId)
          ))
      );
      
      if (currentBom) {
        await executeQuery(() => 
          db.update(billOfMaterials)
            .set({ isDefault: false })
            .where(and(
              eq(billOfMaterials.itemId, currentBom.itemId),
              eq(billOfMaterials.tenantId, tenantId),
              eq(billOfMaterials.isDefault, true),
              sql`${billOfMaterials.id} <> ${id}`
            ))
        );
      }
    }
    
    const [updatedBom] = await executeQuery(() => 
      db.update(billOfMaterials)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(and(
          eq(billOfMaterials.id, id),
          eq(billOfMaterials.tenantId, tenantId)
        ))
        .returning()
    );
    
    return updatedBom;
  }

  async deleteBillOfMaterials(id: number, tenantId: number): Promise<boolean> {
    try {
      // First, delete all components associated with this BOM
      await executeQuery(() => 
        db.delete(bomComponents)
          .where(and(
            eq(bomComponents.bomId, id),
            eq(bomComponents.tenantId, tenantId)
          ))
      );
      
      // Now delete the BOM itself
      await executeQuery(() => 
        db.delete(billOfMaterials)
          .where(and(
            eq(billOfMaterials.id, id),
            eq(billOfMaterials.tenantId, tenantId)
          ))
      );
      
      return true;
    } catch (error) {
      console.error('Error deleting bill of materials:', error);
      return false;
    }
  }

  async getBOMComponents(bomId: number, tenantId: number): Promise<BomComponent[]> {
    return await executeQuery(() => 
      db.select()
        .from(bomComponents)
        .where(and(
          eq(bomComponents.bomId, bomId),
          eq(bomComponents.tenantId, tenantId)
        ))
        .orderBy(asc(bomComponents.sortOrder))
    );
  }

  async createBOMComponent(component: InsertBomComponent): Promise<BomComponent> {
    const now = new Date();
    
    // Get max sort order to append at the end
    const [maxSort] = await executeQuery(() => 
      db.select({ maxSort: sql`MAX(${bomComponents.sortOrder})` })
        .from(bomComponents)
        .where(and(
          eq(bomComponents.bomId, component.bomId),
          eq(bomComponents.tenantId, component.tenantId)
        ))
    );
    
    const sortOrder = maxSort?.maxSort ? Number(maxSort.maxSort) + 10 : 10;
    
    const [newComponent] = await executeQuery(() => 
      db.insert(bomComponents)
        .values({
          ...component,
          sortOrder,
          createdAt: now,
          updatedAt: now
        })
        .returning()
    );
    
    // Update the total cost of the BOM
    await this.updateBOMTotalCost(component.bomId);
    
    return newComponent;
  }

  async updateBOMComponent(id: number, tenantId: number, data: Partial<InsertBomComponent>): Promise<BomComponent> {
    const [component] = await executeQuery(() => 
      db.select()
        .from(bomComponents)
        .where(and(
          eq(bomComponents.id, id),
          eq(bomComponents.tenantId, tenantId)
        ))
    );
    
    if (!component) {
      throw new Error(`BOM Component with ID ${id} not found`);
    }
    
    const [updatedComponent] = await executeQuery(() => 
      db.update(bomComponents)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(and(
          eq(bomComponents.id, id),
          eq(bomComponents.tenantId, tenantId)
        ))
        .returning()
    );
    
    // Update the total cost of the BOM
    await this.updateBOMTotalCost(component.bomId);
    
    return updatedComponent;
  }

  async deleteBOMComponent(id: number, tenantId: number): Promise<boolean> {
    try {
      // Get the BOM ID first
      const [component] = await executeQuery(() => 
        db.select()
          .from(bomComponents)
          .where(and(
            eq(bomComponents.id, id),
            eq(bomComponents.tenantId, tenantId)
          ))
      );
      
      if (!component) {
        return false;
      }
      
      await executeQuery(() => 
        db.delete(bomComponents)
          .where(and(
            eq(bomComponents.id, id),
            eq(bomComponents.tenantId, tenantId)
          ))
      );
      
      // Update the total cost of the BOM
      await this.updateBOMTotalCost(component.bomId);
      
      return true;
    } catch (error) {
      console.error('Error deleting BOM component:', error);
      return false;
    }
  }

  private async updateBOMTotalCost(bomId: number): Promise<void> {
    // Calculate the total cost of all components
    const [result] = await executeQuery(() => 
      db.select({ totalCost: sql`SUM(${bomComponents.quantity}::numeric * COALESCE(${bomComponents.unitCost}::numeric, 0))` })
        .from(bomComponents)
        .where(eq(bomComponents.bomId, bomId))
    );
    
    const totalCost = result?.totalCost || '0';
    
    // Update the BOM total cost
    await executeQuery(() => 
      db.update(billOfMaterials)
        .set({ 
          totalCost: totalCost.toString(),
          updatedAt: new Date()
        })
        .where(eq(billOfMaterials.id, bomId))
    );
  }
  
  // Price List operations
  async getAllPriceLists(tenantId: number, isActive?: boolean): Promise<PriceList[]> {
    let query = db.select()
      .from(priceLists)
      .where(eq(priceLists.tenantId, tenantId));
    
    if (isActive !== undefined) {
      query = query.where(eq(priceLists.isActive, isActive));
    }
    
    return await executeQuery(() => query.orderBy(desc(priceLists.effectiveDate)));
  }

  async getPriceListById(id: number, tenantId: number): Promise<PriceList | undefined> {
    const [priceList] = await executeQuery(() => 
      db.select()
        .from(priceLists)
        .where(and(
          eq(priceLists.id, id),
          eq(priceLists.tenantId, tenantId)
        ))
    );
    return priceList;
  }

  async createPriceList(priceList: InsertPriceList): Promise<PriceList> {
    const now = new Date();
    
    // If setting this price list as default, unset any previous default
    if (priceList.isDefault) {
      await executeQuery(() => 
        db.update(priceLists)
          .set({ isDefault: false })
          .where(and(
            eq(priceLists.tenantId, priceList.tenantId),
            eq(priceLists.isDefault, true)
          ))
      );
    }
    
    const [newPriceList] = await executeQuery(() => 
      db.insert(priceLists)
        .values({
          ...priceList,
          createdAt: now,
          updatedAt: now
        })
        .returning()
    );
    
    return newPriceList;
  }

  async updatePriceList(id: number, tenantId: number, data: Partial<InsertPriceList>): Promise<PriceList> {
    // If setting this price list as default, unset any previous default
    if (data.isDefault) {
      await executeQuery(() => 
        db.update(priceLists)
          .set({ isDefault: false })
          .where(and(
            eq(priceLists.tenantId, tenantId),
            eq(priceLists.isDefault, true),
            sql`${priceLists.id} <> ${id}`
          ))
      );
    }
    
    const [updatedPriceList] = await executeQuery(() => 
      db.update(priceLists)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(and(
          eq(priceLists.id, id),
          eq(priceLists.tenantId, tenantId)
        ))
        .returning()
    );
    
    return updatedPriceList;
  }

  async deletePriceList(id: number, tenantId: number): Promise<boolean> {
    try {
      // Delete all price list items first
      await executeQuery(() => 
        db.delete(priceListItems)
          .where(and(
            eq(priceListItems.priceListId, id),
            eq(priceListItems.tenantId, tenantId)
          ))
      );
      
      // Then delete the price list
      await executeQuery(() => 
        db.delete(priceLists)
          .where(and(
            eq(priceLists.id, id),
            eq(priceLists.tenantId, tenantId)
          ))
      );
      
      return true;
    } catch (error) {
      console.error('Error deleting price list:', error);
      return false;
    }
  }

  async getItemPricing(itemId: number, tenantId: number, priceListId?: number): Promise<PriceListItem[]> {
    let query = db.select()
      .from(priceListItems)
      .where(and(
        eq(priceListItems.itemId, itemId),
        eq(priceListItems.tenantId, tenantId)
      ));
    
    if (priceListId) {
      query = query.where(eq(priceListItems.priceListId, priceListId));
    }
    
    return await executeQuery(() => query);
  }

  async getPriceListItems(priceListId: number, tenantId: number): Promise<PriceListItem[]> {
    return await executeQuery(() => 
      db.select()
        .from(priceListItems)
        .where(and(
          eq(priceListItems.priceListId, priceListId),
          eq(priceListItems.tenantId, tenantId)
        ))
    );
  }

  async createPriceListItem(priceListItem: InsertPriceListItem): Promise<PriceListItem> {
    const now = new Date();
    const [newPriceListItem] = await executeQuery(() => 
      db.insert(priceListItems)
        .values({
          ...priceListItem,
          createdAt: now,
          updatedAt: now
        })
        .returning()
    );
    
    return newPriceListItem;
  }

  async updatePriceListItem(id: number, tenantId: number, data: Partial<InsertPriceListItem>): Promise<PriceListItem> {
    const [updatedPriceListItem] = await executeQuery(() => 
      db.update(priceListItems)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(and(
          eq(priceListItems.id, id),
          eq(priceListItems.tenantId, tenantId)
        ))
        .returning()
    );
    
    return updatedPriceListItem;
  }

  async deletePriceListItem(id: number, tenantId: number): Promise<boolean> {
    try {
      await executeQuery(() => 
        db.delete(priceListItems)
          .where(and(
            eq(priceListItems.id, id),
            eq(priceListItems.tenantId, tenantId)
          ))
      );
      
      return true;
    } catch (error) {
      console.error('Error deleting price list item:', error);
      return false;
    }
  }
  // User operations
  async getRoleById(id: number): Promise<any | undefined> {
    try {
      const [role] = await executeQuery(() => db.select().from(roles).where(eq(roles.id, id)));
      return role;
    } catch (error) {
      console.error(`[DATABASE] Error getting role by ID ${id}:`, error);
      return undefined;
    }
  }

  async getUserById(id: number): Promise<User | undefined> {
    try {
      const result = await executeQuery(() => db.select().from(users).where(eq(users.id, id)));
      return result.length > 0 ? result[0] : undefined;
    } catch (error) {
      console.error(`[DATABASE] Error getting user by ID ${id}:`, error);
      return undefined;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const [user] = await executeQuery(() => db.select().from(users).where(eq(users.username, username)));
      return user;
    } catch (error) {
      console.error(`Error getting user by username ${username}:`, error);
      
      // For development purposes only - if database is down, return a default admin user
      if (username === 'admin') {
        console.log('Database connection failed, using fallback admin user');
        return {
          id: 1,
          username: 'admin',
          email: 'admin@demo.com',
          password: '$2b$10$Qnz6J5mOzVfyIchEFmFnAOLq2z/z13gKNXm/A3V9mxEVXQnc1Qivy', // hashed admin123
          firstName: null,
          lastName: null,
          role: 'admin',
          tenantId: 1,
          isActive: true,
          lastLogin: null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }
      
      return undefined;
    }
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }
  
  // Tenant operations
  async getTenantById(id: number): Promise<Tenant | undefined> {
    try {
      const [tenant] = await executeQuery(() => db.select().from(tenants).where(eq(tenants.id, id)));
      return tenant;
    } catch (error) {
      console.error(`Error getting tenant by ID ${id}:`, error);
      
      // For development purposes only - if database is down, return a default tenant
      if (id === 1) {
        console.log('Database connection failed, using fallback tenant');
        return {
          id: 1,
          name: 'Prime7 Solutions',
          domain: 'prime7.primex.app',
          logo: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }
      
      return undefined;
    }
  }

  async getTenantByDomain(domain: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.domain, domain));
    return tenant;
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const [newTenant] = await db.insert(tenants).values(tenant).returning();
    return newTenant;
  }

  async updateTenant(id: number, data: Partial<InsertTenant>): Promise<Tenant> {
    const [updatedTenant] = await db
      .update(tenants)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(tenants.id, id))
      .returning();
    return updatedTenant;
  }
  
  // Subscription operations
  async getSubscriptionById(id: number): Promise<Subscription | undefined> {
    try {
      const [subscription] = await executeQuery(() => db.select().from(subscriptions).where(eq(subscriptions.id, id)));
      return subscription;
    } catch (error) {
      console.error(`Error getting subscription by ID ${id}:`, error);
      return undefined;
    }
  }

  async getActiveSubscriptionByTenantId(tenantId: number): Promise<Subscription | undefined> {
    try {
      const [subscription] = await executeQuery(() => 
        db.select()
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.tenantId, tenantId),
              eq(subscriptions.status, "active")
            )
          )
      );
      return subscription;
    } catch (error) {
      console.error(`Error getting active subscription for tenant ${tenantId}:`, error);
      
      // For development purposes only - if database is down, return a default subscription
      if (tenantId === 1) {
        console.log('Database connection failed, using fallback subscription');
        const now = new Date();
        const nextYear = new Date();
        nextYear.setFullYear(now.getFullYear() + 1);
        
        return {
          id: 1,
          tenantId: 1,
          plan: 'enterprise',
          status: 'active',
          startDate: now,
          endDate: nextYear,
          createdAt: now,
          updatedAt: now
        };
      }
      
      return undefined;
    }
  }

  async createSubscription(subscription: InsertSubscription): Promise<Subscription> {
    const [newSubscription] = await db
      .insert(subscriptions)
      .values(subscription)
      .returning();
    return newSubscription;
  }

  async updateSubscription(id: number, data: Partial<InsertSubscription>): Promise<Subscription> {
    const [updatedSubscription] = await db
      .update(subscriptions)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(subscriptions.id, id))
      .returning();
    return updatedSubscription;
  }
  
  // Customer operations
  async getAllCustomers(tenantId: number): Promise<Customer[]> {
    return await db
      .select()
      .from(customers)
      .where(eq(customers.tenantId, tenantId));
  }

  async getCustomerById(id: number, tenantId: number): Promise<Customer | undefined> {
    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)));
    return customer;
  }

  async getCustomerByCustomerId(customerId: string, tenantId: number): Promise<Customer | undefined> {
    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.customerId, customerId), eq(customers.tenantId, tenantId)));
    return customer;
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    try {
      // Get all existing customers for this tenant
      const existingCustomers = await this.getAllCustomers(customer.tenantId);
      
      // Find the highest existing ID number
      let maxNumber = 0;
      const prefix = "CUST-";
      
      existingCustomers.forEach(c => {
        if (c.customerId && c.customerId.startsWith(prefix)) {
          const idNumber = parseInt(c.customerId.substring(prefix.length));
          if (!isNaN(idNumber) && idNumber > maxNumber) {
            maxNumber = idNumber;
          }
        }
      });
      
      // Generate new sequential ID
      const nextNumber = maxNumber + 1;
      const customerId = `${prefix}${nextNumber.toString().padStart(5, '0')}`;
      
      console.log(`Generating sequential customer ID: ${customerId} (max found: ${maxNumber})`);
      
      // Explicitly construct the object with all required fields to ensure customerId is included
      const customerData = {
        customerName: customer.customerName,
        address: customer.address,
        website: customer.website,
        country: customer.country,
        hasAgent: customer.hasAgent || false,
        contactPerson: customer.contactPerson,
        email: customer.email,
        phone: customer.phone,
        isActive: customer.isActive !== undefined ? customer.isActive : true,
        tenantId: customer.tenantId,
        customerId: customerId, // Use proper sequential ID
        // Add garment industry specific fields
        orderCount: customer.orderCount,
        inquiryCount: customer.inquiryCount,
        totalSpend: customer.totalSpend,
        avgOrderValue: customer.avgOrderValue,
        lastOrderDate: customer.lastOrderDate,
        paymentTerms: customer.paymentTerms,
        leadTime: customer.leadTime,
        industrySegment: customer.industrySegment,
        sustainabilityRating: customer.sustainabilityRating ? customer.sustainabilityRating.toString() : null,
        complianceLevel: customer.complianceLevel
      };
      
      console.log("Creating customer with data:", customerData);
      
      const [newCustomer] = await db
        .insert(customers)
        .values(customerData)
        .returning();
        
      return newCustomer;
    } catch (error) {
      console.error("Error in createCustomer:", error);
      throw error;
    }
  }

  async updateCustomer(id: number, tenantId: number, data: Partial<InsertCustomer>): Promise<Customer> {
    const [updatedCustomer] = await db
      .update(customers)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
      .returning();
    return updatedCustomer;
  }

  async setCustomerStatus(id: number, tenantId: number, isActive: boolean): Promise<Customer> {
    const [updatedCustomer] = await db
      .update(customers)
      .set({
        isActive,
        updatedAt: new Date()
      })
      .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
      .returning();
    return updatedCustomer;
  }

  async deleteCustomer(id: number, tenantId: number): Promise<boolean> {
    try {
      const result = await db
        .delete(customers)
        .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)));
      return !!result;
    } catch (error) {
      console.error("Error deleting customer:", error);
      return false;
    }
  }
  
  // Customer Agent operations
  async getAgentByCustomerId(customerId: number): Promise<CustomerAgent | undefined> {
    const [agent] = await db
      .select()
      .from(customerAgents)
      .where(eq(customerAgents.customerId, customerId));
    return agent;
  }

  async createCustomerAgent(agent: InsertCustomerAgent): Promise<CustomerAgent> {
    const [newAgent] = await db
      .insert(customerAgents)
      .values(agent)
      .returning();
    return newAgent;
  }

  async updateCustomerAgent(customerId: number, data: Partial<InsertCustomerAgent>): Promise<CustomerAgent> {
    const [updatedAgent] = await db
      .update(customerAgents)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(customerAgents.customerId, customerId))
      .returning();
    return updatedAgent;
  }

  async deleteCustomerAgent(customerId: number): Promise<boolean> {
    try {
      const result = await db
        .delete(customerAgents)
        .where(eq(customerAgents.customerId, customerId));
      return result.length > 0;
    } catch (error) {
      console.error("Error deleting customer agent:", error);
      return false;
    }
  }

  // Task operations
  async getAllTasks(tenantId: number, filters?: TaskFilters): Promise<Task[]> {
    try {
      let query = db.select().from(tasks)
        .where(eq(tasks.tenantId, tenantId));
      
      if (filters) {
        // Add filters for status
        if (filters.status) {
          if (Array.isArray(filters.status)) {
            query = query.where(inArray(tasks.status, filters.status));
          } else {
            query = query.where(eq(tasks.status, filters.status));
          }
        }
        
        // Add filters for priority
        if (filters.priority) {
          if (Array.isArray(filters.priority)) {
            query = query.where(inArray(tasks.priority, filters.priority));
          } else {
            query = query.where(eq(tasks.priority, filters.priority));
          }
        }
        
        // Add filter for assigned user
        if (filters.assignedTo) {
          query = query.where(eq(tasks.assignedTo, filters.assignedTo));
        }
        
        // Add filter for creator
        if (filters.createdBy) {
          query = query.where(eq(tasks.createdBy, filters.createdBy));
        }
        
        // Add filter for completion status
        if (filters.completed !== undefined) {
          query = query.where(eq(tasks.completed, filters.completed));
        }
        
        // Add filter for due date range
        if (filters.dueDate) {
          if (filters.dueDate.start) {
            query = query.where(sql`${tasks.dueDate} >= ${filters.dueDate.start}`);
          }
          if (filters.dueDate.end) {
            query = query.where(sql`${tasks.dueDate} <= ${filters.dueDate.end}`);
          }
        }
        
        // Add filter for tags
        if (filters.tags && filters.tags.length > 0) {
          // Overlap exists between the arrays
          query = query.where(sql`${tasks.tags} && ${filters.tags}`);
        }
        
        // Add filter for related entity
        if (filters.relatedEntityType) {
          query = query.where(eq(tasks.relatedEntityType, filters.relatedEntityType));
          
          if (filters.relatedEntityId) {
            query = query.where(eq(tasks.relatedEntityId, filters.relatedEntityId));
          }
        }
        
        // Add text search if provided
        if (filters.search) {
          query = query.where(
            sql`(${tasks.title} ILIKE ${`%${filters.search}%`} OR ${tasks.description} ILIKE ${`%${filters.search}%`})`
          );
        }
        
        // Add sorting
        if (filters.sortBy) {
          const direction = filters.sortDirection === 'desc' ? desc : asc;
          const column = tasks[filters.sortBy as keyof typeof tasks] as any;
          if (column) {
            query = query.orderBy(direction(column));
          } else {
            // Default sort by dueDate if invalid column
            query = query.orderBy(asc(tasks.dueDate));
          }
        } else {
          // Default sort by dueDate
          query = query.orderBy(asc(tasks.dueDate));
        }
        
        // Add pagination
        if (filters.limit) {
          query = query.limit(filters.limit);
          
          if (filters.offset) {
            query = query.offset(filters.offset);
          }
        }
      } else {
        // Default sorting by due date
        query = query.orderBy(asc(tasks.dueDate));
      }
      
      return await query;
    } catch (error) {
      console.error("Error getting tasks:", error);
      return [];
    }
  }
  
  async getTaskById(id: number, tenantId: number): Promise<Task | undefined> {
    try {
      const [task] = await db.select()
        .from(tasks)
        .where(and(
          eq(tasks.id, id),
          eq(tasks.tenantId, tenantId)
        ));
      return task;
    } catch (error) {
      console.error("Error getting task by ID:", error);
      return undefined;
    }
  }
  
  async createTask(task: InsertTask): Promise<Task> {
    try {
      const [created] = await db.insert(tasks)
        .values(task)
        .returning();
      return created;
    } catch (error) {
      console.error("Error creating task:", error);
      throw error;
    }
  }
  
  async updateTask(id: number, tenantId: number, data: Partial<InsertTask>): Promise<Task> {
    try {
      const [updated] = await db.update(tasks)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(and(
          eq(tasks.id, id),
          eq(tasks.tenantId, tenantId)
        ))
        .returning();
      
      if (!updated) {
        throw new Error("Task not found or not updated");
      }
      
      return updated;
    } catch (error) {
      console.error("Error updating task:", error);
      throw error;
    }
  }
  
  async completeTask(id: number, tenantId: number, completed: boolean): Promise<Task> {
    try {
      const now = new Date();
      const [updated] = await db.update(tasks)
        .set({
          completed,
          completedAt: completed ? now : null,
          status: completed ? 'completed' : 'pending',
          updatedAt: now
        })
        .where(and(
          eq(tasks.id, id),
          eq(tasks.tenantId, tenantId)
        ))
        .returning();
      
      if (!updated) {
        throw new Error("Task not found or not updated");
      }
      
      return updated;
    } catch (error) {
      console.error("Error completing task:", error);
      throw error;
    }
  }
  
  async deleteTask(id: number, tenantId: number): Promise<boolean> {
    try {
      const result = await db.delete(tasks)
        .where(and(
          eq(tasks.id, id),
          eq(tasks.tenantId, tenantId)
        ))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Error deleting task:", error);
      return false;
    }
  }
  
  // Task comment operations
  async getTaskComments(taskId: number): Promise<TaskComment[]> {
    try {
      return await db.select()
        .from(taskComments)
        .where(eq(taskComments.taskId, taskId))
        .orderBy(asc(taskComments.createdAt));
    } catch (error) {
      console.error("Error getting task comments:", error);
      return [];
    }
  }
  
  async createTaskComment(comment: InsertTaskComment): Promise<TaskComment> {
    try {
      const [created] = await db.insert(taskComments)
        .values(comment)
        .returning();
      return created;
    } catch (error) {
      console.error("Error creating task comment:", error);
      throw error;
    }
  }
  
  async deleteTaskComment(id: number): Promise<boolean> {
    try {
      const result = await db.delete(taskComments)
        .where(eq(taskComments.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Error deleting task comment:", error);
      return false;
    }
  }
  
  // Task AI insights operations
  async getTaskAIInsights(taskId: number): Promise<TaskAIInsight[]> {
    try {
      return await db.select()
        .from(taskAIInsights)
        .where(eq(taskAIInsights.taskId, taskId))
        .orderBy(desc(taskAIInsights.createdAt));
    } catch (error) {
      console.error("Error getting task AI insights:", error);
      return [];
    }
  }
  
  async createTaskAIInsight(insight: InsertTaskAIInsight): Promise<TaskAIInsight> {
    try {
      const [created] = await db.insert(taskAIInsights)
        .values(insight)
        .returning();
      return created;
    } catch (error) {
      console.error("Error creating task AI insight:", error);
      throw error;
    }
  }

  // Inquiry operations
  async getAllInquiries(tenantId: number): Promise<Inquiry[]> {
    try {
      return await db.select()
        .from(inquiries)
        .where(eq(inquiries.tenantId, tenantId));
    } catch (error) {
      console.error("Error getting inquiries:", error);
      return [];
    }
  }
  
  async getInquiryById(id: number, tenantId: number): Promise<Inquiry | undefined> {
    try {
      const [inquiry] = await db.select()
        .from(inquiries)
        .where(
          and(
            eq(inquiries.id, id),
            eq(inquiries.tenantId, tenantId)
          )
        );
      return inquiry;
    } catch (error) {
      console.error("Error getting inquiry by ID:", error);
      return undefined;
    }
  }
  
  async getInquiryByInquiryId(inquiryId: string, tenantId: number): Promise<Inquiry | undefined> {
    try {
      const [inquiry] = await db.select()
        .from(inquiries)
        .where(
          and(
            eq(inquiries.inquiryId, inquiryId),
            eq(inquiries.tenantId, tenantId)
          )
        );
      return inquiry;
    } catch (error) {
      console.error("Error getting inquiry by inquiry ID:", error);
      return undefined;
    }
  }
  
  async createInquiry(inquiry: InsertInquiry): Promise<Inquiry> {
    try {
      const [created] = await db.insert(inquiries)
        .values(inquiry)
        .returning();
      return created;
    } catch (error) {
      console.error("Error creating inquiry:", error);
      throw error;
    }
  }
  
  async updateInquiry(id: number, tenantId: number, data: Partial<InsertInquiry>): Promise<Inquiry> {
    try {
      // First, get the current inquiry to ensure it exists
      const existing = await this.getInquiryById(id, tenantId);
      if (!existing) {
        throw new Error("Inquiry not found");
      }
      
      // Use executeQuery to run a raw SQL update which gives us more control
      // over the types and format of the data being sent to PostgreSQL
      return await executeQuery(async () => {
        // Build the SET clause parameters dynamically
        const updateFields: string[] = [];
        const params: any[] = [id, tenantId]; // First two params are for the WHERE clause
        let paramIndex = 3; // Start at 3 since we're using $1 and $2 in WHERE
        
        // Handle each field that can be updated
        if (data.styleName !== undefined) {
          updateFields.push(`style_name = $${paramIndex++}`);
          params.push(data.styleName);
        }
        
        if (data.inquiryType !== undefined) {
          updateFields.push(`inquiry_type = $${paramIndex++}`);
          params.push(data.inquiryType);
        }
        
        if (data.department !== undefined) {
          updateFields.push(`department = $${paramIndex++}`);
          params.push(data.department);
        }
        
        if (data.projectedQuantity !== undefined) {
          updateFields.push(`projected_quantity = $${paramIndex++}`);
          params.push(data.projectedQuantity);
        }
        
        if (data.targetPrice !== undefined) {
          updateFields.push(`target_price = $${paramIndex++}`);
          params.push(data.targetPrice);
        }
        
        if (data.status !== undefined) {
          updateFields.push(`status = $${paramIndex++}`);
          params.push(data.status);
        }
        
        if (data.technicalFiles !== undefined) {
          updateFields.push(`technical_files = $${paramIndex++}`);
          params.push(data.technicalFiles);
        }
        
        if (data.customerId !== undefined) {
          updateFields.push(`customer_id = $${paramIndex++}`);
          params.push(data.customerId);
        }
        
        // Handle the date field carefully
        if (data.projectedDeliveryDate !== undefined) {
          let formattedDate;
          try {
            // Convert to Date object first if it's a string
            const dateValue = typeof data.projectedDeliveryDate === 'string' 
              ? new Date(data.projectedDeliveryDate)
              : data.projectedDeliveryDate;
              
            // Format as YYYY-MM-DD for PostgreSQL DATE type
            formattedDate = dateValue.toISOString().split('T')[0];
            
            updateFields.push(`projected_delivery_date = $${paramIndex++}`);
            params.push(formattedDate);
          } catch (err) {
            console.warn("Invalid projected delivery date format, skipping:", err);
            // Don't add this field to the update if it's invalid
          }
        }
        
        // Always update the updated_at timestamp
        updateFields.push(`updated_at = NOW()`);
        
        // If there are no fields to update, just return the existing record
        if (updateFields.length === 0) {
          return existing;
        }
        
        // Construct and execute the SQL query
        const updateQuery = `
          UPDATE inquiries
          SET ${updateFields.join(', ')}
          WHERE id = $1 AND tenant_id = $2
          RETURNING *;
        `;
        
        const result = await db.execute(updateQuery, params);
        
        if (!result.rows || result.rows.length === 0) {
          throw new Error("Failed to update inquiry");
        }
        
        return result.rows[0] as Inquiry;
      });
    } catch (error) {
      console.error("Error updating inquiry:", error);
      throw error;
    }
  }
  
  async deleteInquiry(id: number, tenantId: number): Promise<boolean> {
    try {
      const result = await db.delete(inquiries)
        .where(
          and(
            eq(inquiries.id, id),
            eq(inquiries.tenantId, tenantId)
          )
        )
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Error deleting inquiry:", error);
      return false;
    }
  }
  
  async generateInquiryInsights(inquiryId: number): Promise<any> {
    // This would connect to an AI service to generate insights
    // Placeholder for now
    return { message: "AI analysis would be performed here" };
  }

  // Warehouse operations
  async getAllWarehouses(tenantId: number): Promise<Warehouse[]> {
    try {
      return await db.select()
        .from(warehouses)
        .where(eq(warehouses.tenantId, tenantId));
    } catch (error) {
      console.error("Error getting warehouses:", error);
      return [];
    }
  }
  
  async getWarehouseById(id: number, tenantId: number): Promise<Warehouse | undefined> {
    try {
      const [warehouse] = await db.select()
        .from(warehouses)
        .where(
          and(
            eq(warehouses.id, id),
            eq(warehouses.tenantId, tenantId)
          )
        );
      return warehouse;
    } catch (error) {
      console.error("Error getting warehouse by ID:", error);
      return undefined;
    }
  }
  
  async getWarehouseByWarehouseId(warehouseId: string, tenantId: number): Promise<Warehouse | undefined> {
    try {
      const [warehouse] = await db.select()
        .from(warehouses)
        .where(
          and(
            eq(warehouses.warehouseId, warehouseId),
            eq(warehouses.tenantId, tenantId)
          )
        );
      return warehouse;
    } catch (error) {
      console.error("Error getting warehouse by warehouse ID:", error);
      return undefined;
    }
  }
  
  async createWarehouse(warehouse: InsertWarehouse): Promise<Warehouse> {
    try {
      const [created] = await db.insert(warehouses)
        .values(warehouse)
        .returning();
      return created;
    } catch (error) {
      console.error("Error creating warehouse:", error);
      throw error;
    }
  }
  
  async updateWarehouse(id: number, tenantId: number, data: Partial<InsertWarehouse>): Promise<Warehouse> {
    try {
      const [updated] = await db.update(warehouses)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(warehouses.id, id),
            eq(warehouses.tenantId, tenantId)
          )
        )
        .returning();
      
      if (!updated) {
        throw new Error("Warehouse not found or not updated");
      }
      
      return updated;
    } catch (error) {
      console.error("Error updating warehouse:", error);
      throw error;
    }
  }
  
  async deleteWarehouse(id: number, tenantId: number): Promise<boolean> {
    try {
      const result = await db.delete(warehouses)
        .where(
          and(
            eq(warehouses.id, id),
            eq(warehouses.tenantId, tenantId)
          )
        )
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Error deleting warehouse:", error);
      return false;
    }
  }

  // Item Category operations
  async getAllItemCategories(tenantId: number): Promise<ItemCategory[]> {
    try {
      const categories = await db
        .select()
        .from(itemCategories)
        .where(eq(itemCategories.tenantId, tenantId))
        .orderBy(desc(itemCategories.updatedAt));
      
      return categories;
    } catch (error) {
      console.error("Error fetching item categories:", error);
      return [];
    }
  }

  async getItemCategoryById(id: number, tenantId: number): Promise<ItemCategory | undefined> {
    try {
      const [category] = await db
        .select()
        .from(itemCategories)
        .where(and(
          eq(itemCategories.id, id),
          eq(itemCategories.tenantId, tenantId)
        ));
      
      return category;
    } catch (error) {
      console.error(`Error fetching item category with id ${id}:`, error);
      return undefined;
    }
  }

  async getItemCategoryByCategoryId(categoryId: string, tenantId: number): Promise<ItemCategory | undefined> {
    try {
      const [category] = await db
        .select()
        .from(itemCategories)
        .where(and(
          eq(itemCategories.categoryId, categoryId),
          eq(itemCategories.tenantId, tenantId)
        ));
      
      return category;
    } catch (error) {
      console.error(`Error fetching item category with categoryId ${categoryId}:`, error);
      return undefined;
    }
  }

  async createItemCategory(category: InsertItemCategory): Promise<ItemCategory> {
    try {
      const [newCategory] = await db
        .insert(itemCategories)
        .values({
          ...category,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      return newCategory;
    } catch (error) {
      console.error("Error creating item category:", error);
      throw error;
    }
  }

  async updateItemCategory(id: number, tenantId: number, data: Partial<InsertItemCategory>): Promise<ItemCategory> {
    try {
      const [updatedCategory] = await db
        .update(itemCategories)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(and(
          eq(itemCategories.id, id),
          eq(itemCategories.tenantId, tenantId)
        ))
        .returning();
      
      return updatedCategory;
    } catch (error) {
      console.error(`Error updating item category with id ${id}:`, error);
      throw error;
    }
  }

  async deleteItemCategory(id: number, tenantId: number): Promise<boolean> {
    try {
      const result = await db
        .delete(itemCategories)
        .where(and(
          eq(itemCategories.id, id),
          eq(itemCategories.tenantId, tenantId)
        ));
      
      return true;
    } catch (error) {
      console.error(`Error deleting item category with id ${id}:`, error);
      return false;
    }
  }

  // CRM Activities methods
  async getCrmActivitiesByCustomerId(customerId: number, tenantId: number): Promise<CrmActivity[]> {
    try {
      const activities = await db
        .select()
        .from(crmActivities)
        .where(and(
          eq(crmActivities.customerId, customerId),
          eq(crmActivities.tenantId, tenantId)
        ))
        .orderBy(desc(crmActivities.createdAt));

      return activities;
    } catch (error) {
      console.error(`Error fetching CRM activities for customer ${customerId}:`, error);
      return [];
    }
  }

  async createCrmActivity(data: InsertCrmActivity): Promise<CrmActivity> {
    try {
      const [activity] = await db
        .insert(crmActivities)
        .values(data)
        .returning();

      return activity;
    } catch (error) {
      console.error('Error creating CRM activity:', error);
      throw error;
    }
  }

  async updateCrmActivity(id: number, tenantId: number, data: Partial<InsertCrmActivity>): Promise<CrmActivity> {
    try {
      const [updatedActivity] = await db
        .update(crmActivities)
        .set(data)
        .where(and(
          eq(crmActivities.id, id),
          eq(crmActivities.tenantId, tenantId)
        ))
        .returning();

      return updatedActivity;
    } catch (error) {
      console.error(`Error updating CRM activity with id ${id}:`, error);
      throw error;
    }
  }

  async deleteCrmActivity(id: number, tenantId: number): Promise<boolean> {
    try {
      await db
        .delete(crmActivities)
        .where(and(
          eq(crmActivities.id, id),
          eq(crmActivities.tenantId, tenantId)
        ));

      return true;
    } catch (error) {
      console.error(`Error deleting CRM activity with id ${id}:`, error);
      return false;
    }
  }

  // Sample Approvals methods
  async getSampleApprovalsBySampleId(sampleId: number, tenantId: number): Promise<SampleApproval[]> {
    try {
      const approvals = await db
        .select()
        .from(sampleApprovals)
        .where(and(
          eq(sampleApprovals.sampleId, sampleId),
          eq(sampleApprovals.tenantId, tenantId)
        ))
        .orderBy(desc(sampleApprovals.createdAt));

      return approvals;
    } catch (error) {
      console.error(`Error fetching sample approvals for sample ${sampleId}:`, error);
      return [];
    }
  }

  async createSampleApproval(data: InsertSampleApproval): Promise<SampleApproval> {
    try {
      const [approval] = await db
        .insert(sampleApprovals)
        .values(data)
        .returning();

      return approval;
    } catch (error) {
      console.error('Error creating sample approval:', error);
      throw error;
    }
  }

  async updateSampleApproval(id: number, tenantId: number, data: Partial<InsertSampleApproval>): Promise<SampleApproval> {
    try {
      const [updatedApproval] = await db
        .update(sampleApprovals)
        .set(data)
        .where(and(
          eq(sampleApprovals.id, id),
          eq(sampleApprovals.tenantId, tenantId)
        ))
        .returning();

      return updatedApproval;
    } catch (error) {
      console.error(`Error updating sample approval with id ${id}:`, error);
      throw error;
    }
  }

  async deleteSampleApproval(id: number, tenantId: number): Promise<boolean> {
    try {
      await db
        .delete(sampleApprovals)
        .where(and(
          eq(sampleApprovals.id, id),
          eq(sampleApprovals.tenantId, tenantId)
        ));

      return true;
    } catch (error) {
      console.error(`Error deleting sample approval with id ${id}:`, error);
      return false;
    }
  }

  // Trim Approvals methods
  async getTrimApprovalsByOrderId(orderId: number, tenantId: number): Promise<TrimApproval[]> {
    try {
      const approvals = await db
        .select()
        .from(trimApprovals)
        .where(and(
          eq(trimApprovals.orderId, orderId),
          eq(trimApprovals.tenantId, tenantId)
        ))
        .orderBy(desc(trimApprovals.createdAt));

      return approvals;
    } catch (error) {
      console.error(`Error fetching trim approvals for order ${orderId}:`, error);
      return [];
    }
  }

  async createTrimApproval(data: InsertTrimApproval): Promise<TrimApproval> {
    try {
      const [approval] = await db
        .insert(trimApprovals)
        .values(data)
        .returning();

      return approval;
    } catch (error) {
      console.error('Error creating trim approval:', error);
      throw error;
    }
  }

  async updateTrimApproval(id: number, tenantId: number, data: Partial<InsertTrimApproval>): Promise<TrimApproval> {
    try {
      const [updatedApproval] = await db
        .update(trimApprovals)
        .set(data)
        .where(and(
          eq(trimApprovals.id, id),
          eq(trimApprovals.tenantId, tenantId)
        ))
        .returning();

      return updatedApproval;
    } catch (error) {
      console.error(`Error updating trim approval with id ${id}:`, error);
      throw error;
    }
  }

  async deleteTrimApproval(id: number, tenantId: number): Promise<boolean> {
    try {
      await db
        .delete(trimApprovals)
        .where(and(
          eq(trimApprovals.id, id),
          eq(trimApprovals.tenantId, tenantId)
        ));

      return true;
    } catch (error) {
      console.error(`Error deleting trim approval with id ${id}:`, error);
      return false;
    }
  }

  // Portal Activity Logs methods
  async getPortalActivityLogsByPortalUserId(portalUserId: number, tenantId: number): Promise<PortalActivityLog[]> {
    try {
      const logs = await db
        .select()
        .from(portalActivityLogs)
        .where(and(
          eq(portalActivityLogs.portalUserId, portalUserId),
          eq(portalActivityLogs.tenantId, tenantId)
        ))
        .orderBy(desc(portalActivityLogs.createdAt));

      return logs;
    } catch (error) {
      console.error(`Error fetching portal activity logs for portal user ${portalUserId}:`, error);
      return [];
    }
  }

  async createPortalActivityLog(data: InsertPortalActivityLog): Promise<PortalActivityLog> {
    try {
      const [log] = await db
        .insert(portalActivityLogs)
        .values(data)
        .returning();

      return log;
    } catch (error) {
      console.error('Error creating portal activity log:', error);
      throw error;
    }
  }

  // Customer Insights methods
  async getCustomerInsightsByCustomerId(customerId: number, tenantId: number): Promise<CustomerInsight[]> {
    try {
      const insights = await db
        .select()
        .from(customerInsights)
        .where(and(
          eq(customerInsights.customerId, customerId),
          eq(customerInsights.tenantId, tenantId)
        ))
        .orderBy(desc(customerInsights.createdAt));

      return insights;
    } catch (error) {
      console.error(`Error fetching customer insights for customer ${customerId}:`, error);
      return [];
    }
  }

  async createCustomerInsight(data: InsertCustomerInsight): Promise<CustomerInsight> {
    try {
      const [insight] = await db
        .insert(customerInsights)
        .values(data)
        .returning();

      return insight;
    } catch (error) {
      console.error('Error creating customer insight:', error);
      throw error;
    }
  }

  // Communication Templates methods
  async getCommunicationTemplates(tenantId: number, type?: string): Promise<CommunicationTemplate[]> {
    try {
      let query = db
        .select()
        .from(communicationTemplates)
        .where(eq(communicationTemplates.tenantId, tenantId));

      if (type) {
        query = query.where(eq(communicationTemplates.type, type));
      }

      const templates = await query.orderBy(communicationTemplates.name);
      return templates;
    } catch (error) {
      console.error('Error fetching communication templates:', error);
      return [];
    }
  }

  async getCommunicationTemplateById(id: number, tenantId: number): Promise<CommunicationTemplate | undefined> {
    try {
      const [template] = await db
        .select()
        .from(communicationTemplates)
        .where(and(
          eq(communicationTemplates.id, id),
          eq(communicationTemplates.tenantId, tenantId)
        ));

      return template;
    } catch (error) {
      console.error(`Error fetching communication template with id ${id}:`, error);
      return undefined;
    }
  }

  async createCommunicationTemplate(data: InsertCommunicationTemplate): Promise<CommunicationTemplate> {
    try {
      const [template] = await db
        .insert(communicationTemplates)
        .values(data)
        .returning();

      return template;
    } catch (error) {
      console.error('Error creating communication template:', error);
      throw error;
    }
  }

  async updateCommunicationTemplate(id: number, tenantId: number, data: Partial<InsertCommunicationTemplate>): Promise<CommunicationTemplate> {
    try {
      const [updatedTemplate] = await db
        .update(communicationTemplates)
        .set(data)
        .where(and(
          eq(communicationTemplates.id, id),
          eq(communicationTemplates.tenantId, tenantId)
        ))
        .returning();

      return updatedTemplate;
    } catch (error) {
      console.error(`Error updating communication template with id ${id}:`, error);
      throw error;
    }
  }

  async deleteCommunicationTemplate(id: number, tenantId: number): Promise<boolean> {
    try {
      await db
        .delete(communicationTemplates)
        .where(and(
          eq(communicationTemplates.id, id),
          eq(communicationTemplates.tenantId, tenantId)
        ));

      return true;
    } catch (error) {
      console.error(`Error deleting communication template with id ${id}:`, error);
      return false;
    }
  }

  // Sample methods for CRM
  async getSamplesByCustomerId(customerId: number, tenantId: number): Promise<SampleDevelopment[]> {
    try {
      const samples = await db
        .select({
          sampleDevelopment: sampleDevelopments,
          order: orders,
        })
        .from(sampleDevelopments)
        .innerJoin(orders, eq(sampleDevelopments.orderId, orders.id))
        .where(and(
          eq(orders.customerId, customerId),
          eq(sampleDevelopments.tenantId, tenantId)
        ))
        .orderBy(desc(sampleDevelopments.createdAt));

      return samples.map(row => row.sampleDevelopment);
    } catch (error) {
      console.error(`Error fetching samples for customer ${customerId}:`, error);
      return [];
    }
  }

  async getSamplesByStyleName(styleName: string, tenantId: number): Promise<SampleDevelopment[]> {
    try {
      const samples = await db
        .select({
          sampleDevelopment: sampleDevelopments,
          order: orders,
        })
        .from(sampleDevelopments)
        .innerJoin(orders, eq(sampleDevelopments.orderId, orders.id))
        .where(and(
          eq(orders.styleName, styleName),
          eq(sampleDevelopments.tenantId, tenantId)
        ))
        .orderBy(desc(sampleDevelopments.createdAt));

      return samples.map(row => row.sampleDevelopment);
    } catch (error) {
      console.error(`Error fetching samples for style name ${styleName}:`, error);
      return [];
    }
  }

  async getSampleById(id: number, tenantId: number): Promise<SampleDevelopment | undefined> {
    try {
      const [sample] = await db
        .select()
        .from(sampleDevelopments)
        .where(and(
          eq(sampleDevelopments.id, id),
          eq(sampleDevelopments.tenantId, tenantId)
        ));

      return sample;
    } catch (error) {
      console.error(`Error fetching sample with id ${id}:`, error);
      return undefined;
    }
  }

  // Buyer Portal User methods
  async getBuyerPortalUsersByCustomerId(customerId: number, tenantId: number): Promise<BuyerPortalUser[]> {
    try {
      const portalUsers = await db
        .select()
        .from(buyerPortalUsers)
        .where(and(
          eq(buyerPortalUsers.customerId, customerId),
          eq(buyerPortalUsers.tenantId, tenantId)
        ))
        .orderBy(buyerPortalUsers.email);

      return portalUsers;
    } catch (error) {
      console.error(`Error fetching buyer portal users for customer ${customerId}:`, error);
      return [];
    }
  }

  async getBuyerPortalUserById(id: number, tenantId: number): Promise<BuyerPortalUser | undefined> {
    try {
      const [portalUser] = await db
        .select()
        .from(buyerPortalUsers)
        .where(and(
          eq(buyerPortalUsers.id, id),
          eq(buyerPortalUsers.tenantId, tenantId)
        ));

      return portalUser;
    } catch (error) {
      console.error(`Error fetching buyer portal user with id ${id}:`, error);
      return undefined;
    }
  }

  async createBuyerPortalUser(data: InsertBuyerPortalUser): Promise<BuyerPortalUser> {
    try {
      // Hash password before saving
      if (data.password) {
        data.password = await bcrypt.hash(data.password, 10);
      }

      const [portalUser] = await db
        .insert(buyerPortalUsers)
        .values(data)
        .returning();

      return portalUser;
    } catch (error) {
      console.error('Error creating buyer portal user:', error);
      throw error;
    }
  }

  async updateBuyerPortalUser(id: number, tenantId: number, data: Partial<InsertBuyerPortalUser>): Promise<BuyerPortalUser> {
    try {
      // Hash password if provided
      if (data.password) {
        data.password = await bcrypt.hash(data.password, 10);
      }

      const [updatedPortalUser] = await db
        .update(buyerPortalUsers)
        .set(data)
        .where(and(
          eq(buyerPortalUsers.id, id),
          eq(buyerPortalUsers.tenantId, tenantId)
        ))
        .returning();

      return updatedPortalUser;
    } catch (error) {
      console.error(`Error updating buyer portal user with id ${id}:`, error);
      throw error;
    }
  }

  async deleteBuyerPortalUser(id: number, tenantId: number): Promise<boolean> {
    try {
      await db
        .delete(buyerPortalUsers)
        .where(and(
          eq(buyerPortalUsers.id, id),
          eq(buyerPortalUsers.tenantId, tenantId)
        ));

      return true;
    } catch (error) {
      console.error(`Error deleting buyer portal user with id ${id}:`, error);
      return false;
    }
  }

  // Sample Development methods
  async getAllSamples(tenantId: number, filters?: SampleFilters): Promise<SampleDevelopment[]> {
    try {
      let query = db
        .select()
        .from(sampleDevelopments)
        .where(eq(sampleDevelopments.tenantId, tenantId));

      if (filters) {
        if (filters.customerId) {
          query = query.where(eq(sampleDevelopments.customerId, filters.customerId));
        }
        
        if (filters.inquiryId) {
          query = query.where(eq(sampleDevelopments.inquiryId as any, filters.inquiryId));
        }

        if (filters.sampleType) {
          if (Array.isArray(filters.sampleType)) {
            query = query.where(inArray(sampleDevelopments.sampleType, filters.sampleType));
          } else {
            query = query.where(eq(sampleDevelopments.sampleType, filters.sampleType));
          }
        }

        if (filters.status) {
          if (Array.isArray(filters.status)) {
            query = query.where(inArray(sampleDevelopments.status, filters.status));
          } else {
            query = query.where(eq(sampleDevelopments.status, filters.status));
          }
        }

        if (filters.dateRange) {
          if (filters.dateRange.start) {
            query = query.where(gte(sampleDevelopments.requestedDate, filters.dateRange.start));
          }
          if (filters.dateRange.end) {
            query = query.where(lte(sampleDevelopments.requestedDate, filters.dateRange.end));
          }
        }

        if (filters.searchQuery) {
          query = query.where(
            or(
              like(sampleDevelopments.styleName, `%${filters.searchQuery}%`),
              like(sampleDevelopments.description as any, `%${filters.searchQuery}%`),
              like(sampleDevelopments.sampleId, `%${filters.searchQuery}%`)
            )
          );
        }

        if (filters.sortBy) {
          const direction = filters.sortDirection === 'desc' ? desc : asc;
          switch (filters.sortBy) {
            case 'requestedDate':
              query = query.orderBy(direction(sampleDevelopments.requestedDate));
              break;
            case 'targetCompletionDate':
              query = query.orderBy(direction(sampleDevelopments.targetCompletionDate));
              break;
            case 'styleName':
              query = query.orderBy(direction(sampleDevelopments.styleName));
              break;
            case 'status':
              query = query.orderBy(direction(sampleDevelopments.status));
              break;
            default:
              query = query.orderBy(desc(sampleDevelopments.createdAt));
              break;
          }
        } else {
          query = query.orderBy(desc(sampleDevelopments.createdAt));
        }

        if (filters.limit) {
          query = query.limit(filters.limit);
        }

        if (filters.offset) {
          query = query.offset(filters.offset);
        }
      } else {
        query = query.orderBy(desc(sampleDevelopments.createdAt));
      }

      return await query;
    } catch (error) {
      console.error('Error fetching samples:', error);
      return [];
    }
  }

  async getSampleById(id: number, tenantId: number): Promise<SampleDevelopment | undefined> {
    try {
      const [sample] = await db
        .select()
        .from(sampleDevelopments)
        .where(and(
          eq(sampleDevelopments.id, id),
          eq(sampleDevelopments.tenantId, tenantId)
        ));
      return sample;
    } catch (error) {
      console.error(`Error getting sample by ID ${id}:`, error);
      return undefined;
    }
  }

  async getSamplesByCustomerId(customerId: number, tenantId: number): Promise<SampleDevelopment[]> {
    try {
      return await db
        .select()
        .from(sampleDevelopments)
        .where(and(
          eq(sampleDevelopments.customerId, customerId),
          eq(sampleDevelopments.tenantId, tenantId)
        ))
        .orderBy(desc(sampleDevelopments.createdAt));
    } catch (error) {
      console.error(`Error getting samples by customer ID ${customerId}:`, error);
      return [];
    }
  }

  async getSamplesByInquiryId(inquiryId: number, tenantId: number): Promise<SampleDevelopment[]> {
    try {
      return await db
        .select()
        .from(sampleDevelopments)
        .where(and(
          eq(sampleDevelopments.inquiryId as any, inquiryId),
          eq(sampleDevelopments.tenantId, tenantId)
        ))
        .orderBy(desc(sampleDevelopments.createdAt));
    } catch (error) {
      console.error(`Error getting samples by inquiry ID ${inquiryId}:`, error);
      return [];
    }
  }

  async getSamplesByOrderId(orderId: number, tenantId: number): Promise<SampleDevelopment[]> {
    try {
      // For samples linked to orders, we need to join with orderSamples
      const result = await db
        .select({
          sample: sampleDevelopments
        })
        .from(sampleDevelopments)
        .innerJoin(orderSamples, eq(orderSamples.sampleId, sampleDevelopments.id))
        .where(and(
          eq(orderSamples.orderId, orderId),
          eq(sampleDevelopments.tenantId, tenantId)
        ))
        .orderBy(desc(sampleDevelopments.createdAt));

      return result.map(r => r.sample);
    } catch (error) {
      console.error(`Error getting samples by order ID ${orderId}:`, error);
      return [];
    }
  }

  async getSamplesByStyleName(styleName: string, tenantId: number): Promise<SampleDevelopment[]> {
    try {
      return await db
        .select()
        .from(sampleDevelopments)
        .where(and(
          like(sampleDevelopments.styleName, `%${styleName}%`),
          eq(sampleDevelopments.tenantId, tenantId)
        ))
        .orderBy(desc(sampleDevelopments.createdAt));
    } catch (error) {
      console.error(`Error getting samples by style name ${styleName}:`, error);
      return [];
    }
  }

  async createSampleDevelopment(data: InsertSampleDevelopment): Promise<SampleDevelopment> {
    try {
      const [newSample] = await db
        .insert(sampleDevelopments)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      return newSample;
    } catch (error) {
      console.error('Error creating sample:', error);
      throw error;
    }
  }

  async updateSampleDevelopment(id: number, data: Partial<InsertSampleDevelopment>): Promise<SampleDevelopment> {
    try {
      const [updatedSample] = await db
        .update(sampleDevelopments)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(eq(sampleDevelopments.id, id))
        .returning();
      return updatedSample;
    } catch (error) {
      console.error(`Error updating sample with ID ${id}:`, error);
      throw error;
    }
  }

  async deleteSampleDevelopment(id: number): Promise<boolean> {
    try {
      const result = await db
        .delete(sampleDevelopments)
        .where(eq(sampleDevelopments.id, id));
      return true;
    } catch (error) {
      console.error(`Error deleting sample with ID ${id}:`, error);
      return false;
    }
  }

  async getSampleMaterials(sampleId: number): Promise<SampleMaterial[]> {
    try {
      return await db
        .select()
        .from(sampleMaterials)
        .where(eq(sampleMaterials.sampleId, sampleId))
        .orderBy(asc(sampleMaterials.id));
    } catch (error) {
      console.error(`Error getting materials for sample ID ${sampleId}:`, error);
      return [];
    }
  }

  async createSampleMaterial(data: InsertSampleMaterial): Promise<SampleMaterial> {
    try {
      const [newMaterial] = await db
        .insert(sampleMaterials)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      return newMaterial;
    } catch (error) {
      console.error('Error creating sample material:', error);
      throw error;
    }
  }

  async updateSampleMaterial(id: number, data: Partial<InsertSampleMaterial>): Promise<SampleMaterial> {
    try {
      const [updatedMaterial] = await db
        .update(sampleMaterials)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(eq(sampleMaterials.id, id))
        .returning();
      return updatedMaterial;
    } catch (error) {
      console.error(`Error updating sample material with ID ${id}:`, error);
      throw error;
    }
  }

  async deleteSampleMaterial(id: number): Promise<boolean> {
    try {
      await db
        .delete(sampleMaterials)
        .where(eq(sampleMaterials.id, id));
      return true;
    } catch (error) {
      console.error(`Error deleting sample material with ID ${id}:`, error);
      return false;
    }
  }

  // Sample Approval Methods
  async getSampleApprovalsBySampleId(sampleId: number, tenantId: number): Promise<SampleApproval[]> {
    try {
      return await db
        .select()
        .from(sampleApprovals)
        .where(and(
          eq(sampleApprovals.sampleId, sampleId),
          eq(sampleApprovals.tenantId, tenantId)
        ))
        .orderBy(desc(sampleApprovals.createdAt));
    } catch (error) {
      console.error(`Error getting approvals for sample ID ${sampleId}:`, error);
      return [];
    }
  }

  async getSampleApprovalById(id: number, tenantId: number): Promise<SampleApproval | undefined> {
    try {
      const [approval] = await db
        .select()
        .from(sampleApprovals)
        .where(and(
          eq(sampleApprovals.id, id),
          eq(sampleApprovals.tenantId, tenantId)
        ));
      return approval;
    } catch (error) {
      console.error(`Error getting sample approval by ID ${id}:`, error);
      return undefined;
    }
  }

  async createSampleApproval(data: InsertSampleApproval): Promise<SampleApproval> {
    try {
      const [newApproval] = await db
        .insert(sampleApprovals)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      return newApproval;
    } catch (error) {
      console.error('Error creating sample approval:', error);
      throw error;
    }
  }

  async updateSampleApproval(id: number, data: Partial<InsertSampleApproval>): Promise<SampleApproval> {
    try {
      const [updatedApproval] = await db
        .update(sampleApprovals)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(eq(sampleApprovals.id, id))
        .returning();
      return updatedApproval;
    } catch (error) {
      console.error(`Error updating sample approval with ID ${id}:`, error);
      throw error;
    }
  }

  async deleteSampleApproval(id: number): Promise<boolean> {
    try {
      await db
        .delete(sampleApprovals)
        .where(eq(sampleApprovals.id, id));
      return true;
    } catch (error) {
      console.error(`Error deleting sample approval with ID ${id}:`, error);
      return false;
    }
  }

  async getOrderAmendments(orderId: number, tenantId: number): Promise<OrderAmendment[]> {
    try {
      return await db
        .select()
        .from(orderAmendments)
        .where(and(eq(orderAmendments.orderId, orderId), eq(orderAmendments.tenantId, tenantId)))
        .orderBy(desc(orderAmendments.createdAt));
    } catch (error) {
      console.error(`Error fetching amendments for order ${orderId}:`, error);
      throw error;
    }
  }

  async createOrderAmendment(data: InsertOrderAmendment): Promise<OrderAmendment> {
    try {
      const [amendment] = await db
        .insert(orderAmendments)
        .values(data)
        .returning();
      return amendment;
    } catch (error) {
      console.error(`Error creating order amendment:`, error);
      throw error;
    }
  }

  async updateOrderAmendment(id: number, tenantId: number, data: Partial<InsertOrderAmendment>): Promise<OrderAmendment> {
    try {
      const [updated] = await db
        .update(orderAmendments)
        .set(data)
        .where(and(eq(orderAmendments.id, id), eq(orderAmendments.tenantId, tenantId)))
        .returning();
      return updated;
    } catch (error) {
      console.error(`Error updating order amendment ${id}:`, error);
      throw error;
    }
  }

  async getNextAmendmentNumber(orderId: number, tenantId: number): Promise<number> {
    try {
      const result = await db
        .select({ maxNum: sql<number>`COALESCE(MAX(${orderAmendments.amendmentNumber}), 0)` })
        .from(orderAmendments)
        .where(and(eq(orderAmendments.orderId, orderId), eq(orderAmendments.tenantId, tenantId)));
      return (result[0]?.maxNum || 0) + 1;
    } catch (error) {
      console.error(`Error getting next amendment number for order ${orderId}:`, error);
      throw error;
    }
  }
}