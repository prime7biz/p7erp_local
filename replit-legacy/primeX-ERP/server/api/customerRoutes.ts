import express, { Request, Response } from "express";
import { storage } from "../storage";
import { insertCustomerSchema, insertCustomerAgentSchema, parties, chartOfAccounts, accountGroups } from "@shared/schema";
import { z } from "zod";
import { SequentialIdGenerator } from "../utils/sequentialIdGenerator";
import { db } from "../db";
import { eq, and, ilike, desc, sql } from "drizzle-orm";
import { requireTenant, withTenantFilter, assertTenantWrite } from "../utils/tenantScope";
import { requirePermission } from "../middleware/rbacMiddleware";
import { logAudit } from "../services/auditService";
import { upsertPartyFromCustomer } from "../services/partySyncService";

const router = express.Router();

router.get("/", requirePermission('crm:customer:read'), async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);

    const customers = await storage.getAllCustomers(tenantId);
    res.json(customers);
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ message: "Failed to fetch customers" });
  }
});

router.get("/:id", requirePermission('crm:customer:read'), async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }

    const customer = await storage.getCustomerById(id, tenantId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // If customer has an agent, fetch agent details
    let agent = undefined;
    if (customer.hasAgent) {
      agent = await storage.getAgentByCustomerId(customer.id);
    }

    res.json({ ...customer, agent });
  } catch (error) {
    console.error("Error fetching customer:", error);
    res.status(500).json({ message: "Failed to fetch customer" });
  }
});

router.get("/:id/party-info", requirePermission('crm:customer:read'), async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid customer ID" });

    const [party] = await db.select().from(parties)
      .where(withTenantFilter(parties.tenantId, tenantId, eq(parties.customerId, id)));
    
    if (!party) return res.json({ linked: false, party: null, ledgerAccount: null });
    
    let ledgerAccount = null;
    if (party.ledgerAccountId) {
      const [account] = await db.select().from(chartOfAccounts)
        .where(withTenantFilter(chartOfAccounts.tenantId, tenantId, eq(chartOfAccounts.id, party.ledgerAccountId)));
      ledgerAccount = account || null;
    }

    const balanceResult = await db.execute(sql`
      SELECT COALESCE(SUM(CASE WHEN vi.debit_amount > 0 THEN CAST(vi.debit_amount AS numeric) ELSE 0 END), 0) -
             COALESCE(SUM(CASE WHEN vi.credit_amount > 0 THEN CAST(vi.credit_amount AS numeric) ELSE 0 END), 0) as balance
      FROM voucher_items vi
      JOIN vouchers v ON vi.voucher_id = v.id
      WHERE vi.account_id = ${party.ledgerAccountId} AND v.tenant_id = ${tenantId} AND v.is_posted = true
    `);
    const outstandingBalance = balanceResult.rows?.[0]?.balance || '0';

    res.json({
      linked: true,
      party: {
        id: party.id,
        partyCode: party.partyCode,
        name: party.name,
        partyType: party.partyType,
        creditLimit: party.creditLimit,
        creditPeriodDays: party.creditPeriodDays,
        defaultPaymentTerms: party.defaultPaymentTerms,
        groupLabel: party.groupLabel,
        taxId: party.taxId,
        bankName: party.bankName,
        bankAccountNumber: party.bankAccountNumber,
      },
      ledgerAccount: ledgerAccount ? {
        id: ledgerAccount.id,
        accountNumber: ledgerAccount.accountNumber,
        name: ledgerAccount.name,
        balance: ledgerAccount.balance,
      } : null,
      outstandingBalance,
    });
  } catch (error) {
    console.error("Error fetching party info for customer:", error);
    res.status(500).json({ message: "Failed to fetch party info" });
  }
});

router.post("/", requirePermission('crm:customer:create'), async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);

    // Validate request body
    // Extend the schema to explicitly include the new fields
    const createSchema = insertCustomerSchema
      .extend({
        industrySegment: z.string().optional(),
        paymentTerms: z.string().optional(),
        leadTime: z.coerce.number().min(0).optional(),
        complianceLevel: z.string().optional(),
        sustainabilityRating: z.coerce.number().optional(),
      });
    
    const validationResult = createSchema.safeParse(
      assertTenantWrite(req.body, tenantId)
    );

    if (!validationResult.success) {
      return res.status(400).json({ 
        message: "Invalid customer data", 
        errors: validationResult.error.errors 
      });
    }

    // We'll let the storage implementation handle the customerId generation
    // This ensures consistent ID generation throughout the application
    const customerData = {
      ...validationResult.data
    };
    
    console.log("Creating customer with data:", customerData);
    const customer = await storage.createCustomer(customerData);
    logAudit({ tenantId, entityType: 'customer', entityId: customer.id, action: 'CREATE', performedBy: req.user!.id, newValues: customer, ipAddress: req.ip });

    if (customer.hasAgent && req.body.agent) {
      const agentValidation = insertCustomerAgentSchema.safeParse({
        ...req.body.agent,
        customerId: customer.id
      });

      if (agentValidation.success) {
        await storage.createCustomerAgent(agentValidation.data);
      }
    }

    await upsertPartyFromCustomer(tenantId, {
      id: customer.id,
      customerName: customer.customerName,
      email: customer.email,
      phone: customer.phone,
      contactPerson: customer.contactPerson,
      address: customer.address,
      country: customer.country,
      paymentTerms: customer.paymentTerms,
    }, req.user?.id);

    res.status(201).json(customer);
  } catch (error) {
    console.error("Error creating customer:", error);
    res.status(500).json({ message: "Failed to create customer" });
  }
});

router.put("/:id", requirePermission('crm:customer:edit'), async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }

    // Check if customer exists
    const existingCustomer = await storage.getCustomerById(id, tenantId);
    if (!existingCustomer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Validate request body
    // Extend the schema to explicitly include the new fields
    const updateSchema = insertCustomerSchema.omit({ customerId: true })
      .extend({
        industrySegment: z.string().optional(),
        paymentTerms: z.string().optional(),
        leadTime: z.coerce.number().min(0).optional(),
        complianceLevel: z.string().optional(),
        sustainabilityRating: z.coerce.number().optional(),
      })
      .partial();
    const validationResult = updateSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({ 
        message: "Invalid customer data", 
        errors: validationResult.error.errors 
      });
    }

    const customerData = validationResult.data;
    const updatedCustomer = await storage.updateCustomer(id, tenantId, customerData);
    logAudit({ tenantId, entityType: 'customer', entityId: id, action: 'UPDATE', performedBy: req.user!.id, oldValues: existingCustomer, newValues: updatedCustomer, ipAddress: req.ip });

    await upsertPartyFromCustomer(tenantId, {
      id: updatedCustomer.id,
      customerName: updatedCustomer.customerName,
      email: updatedCustomer.email,
      phone: updatedCustomer.phone,
      contactPerson: updatedCustomer.contactPerson,
      address: updatedCustomer.address,
      country: updatedCustomer.country,
      paymentTerms: updatedCustomer.paymentTerms,
    }, req.user?.id);

    // Handle agent data if present
    if (req.body.agent) {
      const agentUpdateSchema = insertCustomerAgentSchema.omit({ customerId: true }).partial();
      const agentValidation = agentUpdateSchema.safeParse(req.body.agent);

      if (agentValidation.success) {
        const existingAgent = await storage.getAgentByCustomerId(id);
        
        if (existingAgent) {
          // Update existing agent
          await storage.updateCustomerAgent(id, {
            ...agentValidation.data,
            updatedAt: new Date()
          });
        } else if (updatedCustomer.hasAgent) {
          // Create new agent if customer has agent but no agent record exists
          await storage.createCustomerAgent({
            ...req.body.agent,
            customerId: id
          });
        }
      }
    }

    // If hasAgent is false, delete any existing agent
    if (updatedCustomer.hasAgent === false) {
      await storage.deleteCustomerAgent(id);
    }

    res.json(updatedCustomer);
  } catch (error) {
    console.error("Error updating customer:", error);
    res.status(500).json({ message: "Failed to update customer" });
  }
});

router.patch("/:id/status", requirePermission('crm:customer:edit'), async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }

    // Validate request body
    const statusSchema = z.object({ isActive: z.boolean() });
    const validationResult = statusSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({ 
        message: "Invalid status data", 
        errors: validationResult.error.errors 
      });
    }

    const { isActive } = validationResult.data;
    const updatedCustomer = await storage.setCustomerStatus(id, tenantId, isActive);

    if (!updatedCustomer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.json(updatedCustomer);
  } catch (error) {
    console.error("Error updating customer status:", error);
    res.status(500).json({ message: "Failed to update customer status" });
  }
});

router.delete("/:id", requirePermission('crm:customer:delete'), async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }

    // Check if customer exists
    const existingCustomer = await storage.getCustomerById(id, tenantId);
    if (!existingCustomer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Delete any associated agent first
    if (existingCustomer.hasAgent) {
      await storage.deleteCustomerAgent(id);
    }

    // Delete the customer
    const success = await storage.deleteCustomer(id, tenantId);
    if (!success) {
      return res.status(500).json({ message: "Failed to delete customer" });
    }
    logAudit({ tenantId, entityType: 'customer', entityId: id, action: 'DELETE', performedBy: req.user!.id, oldValues: existingCustomer, ipAddress: req.ip });

    res.status(204).end();
  } catch (error) {
    console.error("Error deleting customer:", error);
    res.status(500).json({ message: "Failed to delete customer" });
  }
});

export default router;