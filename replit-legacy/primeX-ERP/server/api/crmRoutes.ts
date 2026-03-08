import { parseIntParam } from "../utils/parseParams";
import { requireTenant } from "../utils/tenantScope";
import { Router } from 'express';
import { IStorage } from '../storage';
import CrmService from '../services/crmService';
import { 
  insertCrmActivitySchema, 
  insertSampleApprovalSchema, 
  insertTrimApprovalSchema,
  insertCustomerInsightSchema,
  insertCommunicationTemplateSchema
} from '../../shared/schema';

export function registerCrmRoutes(router: Router, storage: IStorage) {
  const crmService = new CrmService(storage);

  // Get all CRM activities for a customer
  router.get('/api/crm/customers/:customerId/activities', async (req, res) => {
    try {
      const customerId = parseIntParam(req.params.customerId, "customerId");
      const tenantId = requireTenant(req);
      
      const activities = await storage.getCrmActivitiesByCustomerId(customerId, tenantId);
      res.json(activities);
    } catch (error) {
      console.error('Error fetching CRM activities:', error);
      res.status(500).json({ message: 'Failed to fetch CRM activities' });
    }
  });

  // Create a new CRM activity
  router.post('/api/crm/activities', async (req, res) => {
    try {
      const tenantId = requireTenant(req);
      const userId = req.user?.id || 1;
      
      const parsedData = insertCrmActivitySchema.parse({
        ...req.body,
        tenantId,
        createdBy: userId
      });
      
      const activity = await storage.createCrmActivity(parsedData);
      res.status(201).json(activity);
    } catch (error) {
      console.error('Error creating CRM activity:', error);
      res.status(500).json({ message: 'Failed to create CRM activity' });
    }
  });

  // Get all sample approvals for a sample
  router.get('/api/samples/:sampleId/approvals', async (req, res) => {
    try {
      const sampleId = parseIntParam(req.params.sampleId, "sampleId");
      const tenantId = requireTenant(req);
      
      const approvals = await storage.getSampleApprovalsBySampleId(sampleId, tenantId);
      res.json(approvals);
    } catch (error) {
      console.error('Error fetching sample approvals:', error);
      res.status(500).json({ message: 'Failed to fetch sample approvals' });
    }
  });

  // Create a new sample approval
  router.post('/api/samples/:sampleId/approvals', async (req, res) => {
    try {
      const sampleId = parseIntParam(req.params.sampleId, "sampleId");
      const tenantId = requireTenant(req);
      
      const parsedData = insertSampleApprovalSchema.parse({
        ...req.body,
        sampleId,
        tenantId
      });
      
      const approval = await storage.createSampleApproval(parsedData);
      res.status(201).json(approval);
    } catch (error) {
      console.error('Error creating sample approval:', error);
      res.status(500).json({ message: 'Failed to create sample approval' });
    }
  });

  // Update a sample approval
  router.patch('/api/samples/approvals/:approvalId', async (req, res) => {
    try {
      const approvalId = parseIntParam(req.params.approvalId, "approvalId");
      const tenantId = requireTenant(req);
      
      const approval = await storage.updateSampleApproval(approvalId, tenantId, req.body);
      res.json(approval);
    } catch (error) {
      console.error('Error updating sample approval:', error);
      res.status(500).json({ message: 'Failed to update sample approval' });
    }
  });

  // Get all trim approvals for an order
  router.get('/api/orders/:orderId/trim-approvals', async (req, res) => {
    try {
      const orderId = parseIntParam(req.params.orderId, "orderId");
      const tenantId = requireTenant(req);
      
      const approvals = await storage.getTrimApprovalsByOrderId(orderId, tenantId);
      res.json(approvals);
    } catch (error) {
      console.error('Error fetching trim approvals:', error);
      res.status(500).json({ message: 'Failed to fetch trim approvals' });
    }
  });

  // Create a new trim approval
  router.post('/api/orders/:orderId/trim-approvals', async (req, res) => {
    try {
      const orderId = parseIntParam(req.params.orderId, "orderId");
      const tenantId = requireTenant(req);
      
      const parsedData = insertTrimApprovalSchema.parse({
        ...req.body,
        orderId,
        tenantId
      });
      
      const approval = await storage.createTrimApproval(parsedData);
      res.status(201).json(approval);
    } catch (error) {
      console.error('Error creating trim approval:', error);
      res.status(500).json({ message: 'Failed to create trim approval' });
    }
  });

  // Update a trim approval
  router.patch('/api/trim-approvals/:approvalId', async (req, res) => {
    try {
      const approvalId = parseIntParam(req.params.approvalId, "approvalId");
      const tenantId = requireTenant(req);
      
      const approval = await storage.updateTrimApproval(approvalId, tenantId, req.body);
      res.json(approval);
    } catch (error) {
      console.error('Error updating trim approval:', error);
      res.status(500).json({ message: 'Failed to update trim approval' });
    }
  });

  // Get AI-generated customer insights
  router.get('/api/crm/customers/:customerId/insights', async (req, res) => {
    try {
      const customerId = parseIntParam(req.params.customerId, "customerId");
      const tenantId = requireTenant(req);
      
      const insights = await storage.getCustomerInsightsByCustomerId(customerId, tenantId);
      res.json(insights);
    } catch (error) {
      console.error('Error fetching customer insights:', error);
      res.status(500).json({ message: 'Failed to fetch customer insights' });
    }
  });

  // Generate new AI insights for a customer
  router.post('/api/crm/customers/:customerId/generate-insights', async (req, res) => {
    try {
      const customerId = parseIntParam(req.params.customerId, "customerId");
      const tenantId = requireTenant(req);
      
      const insights = await crmService.generateCustomerInsights(customerId, tenantId);
      res.status(201).json(insights);
    } catch (error) {
      console.error('Error generating customer insights:', error);
      if (error.message === 'Customer not found') {
        res.status(404).json({ message: 'Customer not found' });
      } else {
        res.status(500).json({ message: 'Failed to generate customer insights' });
      }
    }
  });

  // Get AI-generated sample approval recommendations
  router.get('/api/samples/:sampleId/approval-recommendations', async (req, res) => {
    try {
      const sampleId = parseIntParam(req.params.sampleId, "sampleId");
      const tenantId = requireTenant(req);
      
      const recommendations = await crmService.generateSampleApprovalRecommendations(sampleId, tenantId);
      res.json(recommendations);
    } catch (error) {
      console.error('Error generating sample approval recommendations:', error);
      if (error.message === 'Sample not found') {
        res.status(404).json({ message: 'Sample not found' });
      } else {
        res.status(500).json({ message: 'Failed to generate sample approval recommendations' });
      }
    }
  });

  // Get all communication templates
  router.get('/api/crm/communication-templates', async (req, res) => {
    try {
      const tenantId = requireTenant(req);
      const type = req.query.type as string;
      
      const templates = await storage.getCommunicationTemplates(tenantId, type);
      res.json(templates);
    } catch (error) {
      console.error('Error fetching communication templates:', error);
      res.status(500).json({ message: 'Failed to fetch communication templates' });
    }
  });

  // Create a new communication template
  router.post('/api/crm/communication-templates', async (req, res) => {
    try {
      const tenantId = requireTenant(req);
      const userId = req.user?.id || 1;
      
      const parsedData = insertCommunicationTemplateSchema.parse({
        ...req.body,
        tenantId,
        createdBy: userId
      });
      
      const template = await storage.createCommunicationTemplate(parsedData);
      res.status(201).json(template);
    } catch (error) {
      console.error('Error creating communication template:', error);
      res.status(500).json({ message: 'Failed to create communication template' });
    }
  });

  // Generate a communication template using AI
  router.post('/api/crm/generate-communication-template', async (req, res) => {
    try {
      const { type, purpose, customerId, relatedEntityType, relatedEntityId } = req.body;
      const tenantId = requireTenant(req);
      
      if (!type || !purpose || !customerId) {
        return res.status(400).json({ message: 'Type, purpose, and customerId are required' });
      }
      
      const template = await crmService.generateCommunicationTemplate(
        type, 
        purpose, 
        parseInt(customerId), 
        tenantId, 
        relatedEntityType, 
        relatedEntityId ? parseInt(relatedEntityId) : undefined
      );
      
      res.status(201).json(template);
    } catch (error) {
      console.error('Error generating communication template:', error);
      res.status(500).json({ message: 'Failed to generate communication template' });
    }
  });

  // Get portal activity logs for a portal user
  router.get('/api/crm/portal-users/:portalUserId/activity-logs', async (req, res) => {
    try {
      const portalUserId = parseIntParam(req.params.portalUserId, "portalUserId");
      const tenantId = requireTenant(req);
      
      const logs = await storage.getPortalActivityLogsByPortalUserId(portalUserId, tenantId);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching portal activity logs:', error);
      res.status(500).json({ message: 'Failed to fetch portal activity logs' });
    }
  });

  return router;
}