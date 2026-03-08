import { requireTenant } from "../utils/tenantScope";
import { Router } from 'express';
import * as analyticsService from '../services/analyticsService';
import { generateProductionAnalysisReport, analyzeProductionEfficiency, analyzeQualityDefects, assessDeliveryRisk } from '../services/garmentAIService';

const router = Router();

// Get comprehensive production analysis report
router.get('/production-analysis', async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const report = await generateProductionAnalysisReport(tenantId);
    res.json(report);
  } catch (error) {
    console.error('Error generating production analysis report:', error);
    res.status(500).json({ message: 'Failed to generate production analysis report' });
  }
});

// Get production efficiency insights
router.get('/efficiency-insights', async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const insights = await analyzeProductionEfficiency(tenantId);
    res.json(insights);
  } catch (error) {
    console.error('Error analyzing production efficiency:', error);
    res.status(500).json({ message: 'Failed to analyze production efficiency' });
  }
});

// Get quality defect analysis
router.get('/quality-analysis', async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const analysis = await analyzeQualityDefects(tenantId);
    res.json(analysis);
  } catch (error) {
    console.error('Error analyzing quality defects:', error);
    res.status(500).json({ message: 'Failed to analyze quality defects' });
  }
});

// Get delivery risk assessment
router.get('/delivery-risk', async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const assessment = await assessDeliveryRisk(tenantId);
    res.json(assessment);
  } catch (error) {
    console.error('Error assessing delivery risk:', error);
    res.status(500).json({ message: 'Failed to assess delivery risk' });
  }
});

// Get KPI history by code for trend analysis
router.get('/kpi-history/:kpiCode', async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const { kpiCode } = req.params;
    
    const kpiHistory = await analyticsService.getKPIHistory(tenantId, kpiCode);
    res.json(kpiHistory);
  } catch (error) {
    console.error(`Error fetching KPI history for ${req.params.kpiCode}:`, error);
    res.status(500).json({ message: `Failed to fetch KPI history for ${req.params.kpiCode}` });
  }
});

// Get fabric test results for a specific order
router.get('/fabric-tests/:orderId', async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const { orderId } = req.params;
    
    const fabricTests = await analyticsService.getFabricTestsByOrderId(parseInt(orderId), tenantId);
    res.json(fabricTests);
  } catch (error) {
    console.error(`Error fetching fabric tests for order ${req.params.orderId}:`, error);
    res.status(500).json({ message: `Failed to fetch fabric tests for order ${req.params.orderId}` });
  }
});

// Get production sample history for a specific order or style
router.get('/samples/:orderId', async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const { orderId } = req.params;
    
    const samples = await analyticsService.getProductionSamplesByOrderId(parseInt(orderId), tenantId);
    res.json(samples);
  } catch (error) {
    console.error(`Error fetching production samples for order ${req.params.orderId}:`, error);
    res.status(500).json({ message: `Failed to fetch production samples for order ${req.params.orderId}` });
  }
});

// Get technical specifications for a specific style or order
router.get('/tech-specs/:styleId', async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const { styleId } = req.params;
    
    const techSpecs = await analyticsService.getTechSpecsByStyleId(parseInt(styleId), tenantId);
    res.json(techSpecs);
  } catch (error) {
    console.error(`Error fetching technical specifications for style ${req.params.styleId}:`, error);
    res.status(500).json({ message: `Failed to fetch technical specifications for style ${req.params.styleId}` });
  }
});

export default router;