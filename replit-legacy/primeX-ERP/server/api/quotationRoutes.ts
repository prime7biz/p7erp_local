import express from "express";
import { z } from "zod";
import { storage } from "../storage";
import { db } from "../db";
import { quotationSizeRatios } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { 
  insertQuotationSchema, 
  insertQuotationMaterialSchema, 
  insertQuotationManufacturingSchema, 
  insertQuotationOtherCostSchema,
  insertQuotationCostSummarySchema 
} from "@shared/schema";
import { SequentialIdGenerator } from "../utils/sequentialIdGenerator";
import { initializeDocumentWorkflow } from "../services/workflowInstanceService";
import { requireLock } from "../middleware/lockMiddleware";
import { requirePermission } from "../middleware/rbacMiddleware";
import { requireTenant } from "../utils/tenantScope";

const router = express.Router();

// Get all quotations with filtering options
router.get("/", requirePermission('sales:quotation:read'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    
    const filters = {
      customerId: req.query.customerId ? Number(req.query.customerId) : undefined,
      inquiryId: req.query.inquiryId ? Number(req.query.inquiryId) : undefined,
      status: req.query.status as string | string[] | undefined,
      searchQuery: req.query.search as string | undefined,
      departmentList: req.query.departments ? (req.query.departments as string).split(',') : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      sortBy: req.query.sortBy as string | undefined,
      sortDirection: req.query.sortDirection as 'asc' | 'desc' | undefined,
    };

    // Handle date ranges
    if (req.query.startDate || req.query.endDate) {
      filters.dateRange = {};
      if (req.query.startDate) filters.dateRange.start = new Date(req.query.startDate as string);
      if (req.query.endDate) filters.dateRange.end = new Date(req.query.endDate as string);
    }

    // Handle quantity ranges
    if (req.query.minQuantity || req.query.maxQuantity) {
      filters.projectedQuantityRange = {};
      if (req.query.minQuantity) filters.projectedQuantityRange.min = Number(req.query.minQuantity);
      if (req.query.maxQuantity) filters.projectedQuantityRange.max = Number(req.query.maxQuantity);
    }

    // Handle price ranges
    if (req.query.minPrice || req.query.maxPrice) {
      filters.priceRange = {};
      if (req.query.minPrice) filters.priceRange.min = Number(req.query.minPrice);
      if (req.query.maxPrice) filters.priceRange.max = Number(req.query.maxPrice);
    }

    const quotations = await storage.getAllQuotations(tenantId, filters);
    res.json(quotations);
  } catch (error) {
    console.error("Error fetching quotations:", error);
    res.status(500).json({ message: "Failed to fetch quotations", error: String(error) });
  }
});

// Get a single quotation by ID
router.get("/:id", requirePermission('sales:quotation:read'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = Number(req.params.id);
    
    const quotation = await storage.getQuotationById(id, tenantId);
    
    if (!quotation) {
      return res.status(404).json({ message: "Quotation not found" });
    }
    
    let style = null;
    if (quotation.styleId) {
      try {
        const { getStyleById } = await import("../services/merchandisingService");
        style = await getStyleById(tenantId, quotation.styleId);
      } catch (e) {
        console.error(`Error fetching style ${quotation.styleId} for quotation ${id}:`, e);
      }
    }

    const [materials, manufacturing, otherCostsData, sizeRatiosData] = await Promise.all([
      storage.getQuotationMaterials(id, tenantId),
      storage.getQuotationManufacturing(id, tenantId),
      storage.getQuotationOtherCosts(id, tenantId),
      db.select().from(quotationSizeRatios).where(and(eq(quotationSizeRatios.quotationId, id), eq(quotationSizeRatios.tenantId, tenantId))),
    ]);
    
    res.json({ ...quotation, style, materials, manufacturing, otherCosts: otherCostsData, sizeRatios: sizeRatiosData });
  } catch (error) {
    console.error("Error fetching quotation:", error);
    res.status(500).json({ message: "Failed to fetch quotation", error: String(error) });
  }
});

// Get a quotation by quotationId
router.get("/reference/:quotationId", requirePermission('sales:quotation:read'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const quotationId = req.params.quotationId;
    
    const quotation = await storage.getQuotationByQuotationId(quotationId, tenantId);
    
    if (!quotation) {
      return res.status(404).json({ message: "Quotation not found" });
    }
    
    res.json(quotation);
  } catch (error) {
    console.error("Error fetching quotation:", error);
    res.status(500).json({ message: "Failed to fetch quotation", error: String(error) });
  }
});

// Create a new quotation
router.post("/", requirePermission('sales:quotation:create'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    
    // Generate a sequential quotation ID or use the provided one
    const quotationId = req.body.quotationId || await SequentialIdGenerator.generateQuotationId(tenantId);
    
    // If styleId is provided, look up the style and set styleName for backward compatibility
    let styleNameFromStyle = req.body.styleName;
    if (req.body.styleId && !req.body.styleName) {
      try {
        const { getStyleById } = await import("../services/merchandisingService");
        const style = await getStyleById(tenantId, req.body.styleId);
        if (style) styleNameFromStyle = style.styleName;
      } catch (e) {
        console.error(`Error fetching style ${req.body.styleId} for new quotation:`, e);
      }
    }

    // Handle multi-currency data
    const currencyData = {
      currency: req.body.currency || 'USD',
      exchangeRate: req.body.exchangeRate || 1,
      baseAmount: req.body.baseAmount || req.body.targetPrice,
      localAmount: req.body.localAmount || req.body.targetPrice
    };

    // Validate and parse the request body
    const validatedData = insertQuotationSchema.parse({
      ...req.body,
      ...currencyData,
      styleName: styleNameFromStyle || req.body.styleName,
      tenantId,
      quotationId,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    const newQuotation = await storage.createQuotation(validatedData);

    await initializeDocumentWorkflow(tenantId, 'quotation', newQuotation.id).catch(console.error);

    res.status(201).json(newQuotation);
  } catch (error) {
    console.error("Error creating quotation:", error);
    res.status(400).json({ message: "Failed to create quotation", error: String(error) });
  }
});

// Update a quotation
router.patch("/:id", requirePermission('sales:quotation:edit'), requireLock('quotation'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = Number(req.params.id);
    
    // Check if quotation exists
    const existingQuotation = await storage.getQuotationById(id, tenantId);
    if (!existingQuotation) {
      return res.status(404).json({ message: "Quotation not found" });
    }
    
    // If styleId is provided, look up the style and set styleName for backward compatibility
    const updateData = { ...req.body };
    if (updateData.styleId && !updateData.styleName) {
      try {
        const { getStyleById } = await import("../services/merchandisingService");
        const style = await getStyleById(tenantId, updateData.styleId);
        if (style) updateData.styleName = style.styleName;
      } catch (e) {
        console.error(`Error fetching style ${updateData.styleId} for quotation update:`, e);
      }
    }

    // Update the quotation
    const updatedQuotation = await storage.updateQuotation(id, tenantId, {
      ...updateData,
      updatedAt: new Date()
    });
    
    res.json(updatedQuotation);
  } catch (error) {
    console.error("Error updating quotation:", error);
    res.status(400).json({ message: "Failed to update quotation", error: String(error) });
  }
});

// Update a quotation with all related records (full update)
router.put("/:id", requirePermission('sales:quotation:edit'), requireLock('quotation'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = Number(req.params.id);
    
    // Check if quotation exists
    const existingQuotation = await storage.getQuotationById(id, tenantId);
    if (!existingQuotation) {
      return res.status(404).json({ message: "Quotation not found" });
    }
    
    // Extract the related data from the request
    const { materials, manufacturing, otherCosts, summary, sizeRatios, ...quotationData } = req.body;
    
    // If styleId is provided, look up the style and set styleName for backward compatibility
    if (quotationData.styleId && !quotationData.styleName) {
      try {
        const { getStyleById } = await import("../services/merchandisingService");
        const style = await getStyleById(tenantId, quotationData.styleId);
        if (style) quotationData.styleName = style.styleName;
      } catch (e) {
        console.error(`Error fetching style ${quotationData.styleId} for full quotation update:`, e);
      }
    }

    // Update the main quotation
    const updatedQuotation = await storage.updateQuotation(id, tenantId, {
      ...quotationData,
      updatedAt: new Date()
    });
    
    // Handle materials: Delete existing and create new ones
    if (materials && Array.isArray(materials)) {
      // Delete existing materials
      await storage.deleteAllQuotationMaterials(id, tenantId);
      
      // Create new materials
      for (let i = 0; i < materials.length; i++) {
        const material = materials[i];
        // Skip only if truly empty (no category, no item, no description)
        if (material.categoryId == null && !material.itemId && !material.description) continue;
        
        await storage.createQuotationMaterial({
          tenantId,
          quotationId: id,
          serialNo: material.serialNo ?? (i + 1),
          categoryId: material.categoryId || null,
          subcategoryId: material.subcategoryId || null,
          itemId: material.itemId || null,
          description: material.description || null,
          unit: material.unit || null,
          consumptionPerDozen: material.consumptionPerDozen?.toString() || "0",
          unitPrice: material.unitPrice?.toString() || "0",
          amountPerDozen: material.amountPerDozen?.toString() || "0",
          totalAmount: material.totalAmount?.toString() || "0",
          currency: material.currency || "BDT",
          exchangeRate: material.exchangeRate?.toString() || "1",
          baseAmount: material.baseAmount?.toString() || "0",
          localAmount: material.localAmount?.toString() || "0",
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    }
    
    // Handle manufacturing costs: Delete existing and create new ones
    if (manufacturing && Array.isArray(manufacturing)) {
      // Delete existing manufacturing costs
      await storage.deleteAllQuotationManufacturing(id, tenantId);
      
      // Create new manufacturing costs
      for (let i = 0; i < manufacturing.length; i++) {
        const mfg = manufacturing[i];
        // Skip only if no style part specified
        const partValue = mfg.stylePart || mfg.partType;
        if (!partValue) continue;
        
        await storage.createQuotationManufacturing({
          tenantId,
          quotationId: id,
          serialNo: mfg.serialNo ?? (i + 1),
          stylePart: partValue,
          machinesRequired: mfg.machinesRequired ?? 0,
          productionPerHour: mfg.productionPerHour?.toString() || "0",
          productionPerDay: mfg.productionPerDay?.toString() || "0",
          costPerMachine: mfg.costPerMachine?.toString() || "0",
          totalLineCost: mfg.totalLineCost?.toString() || "0",
          costPerDozen: mfg.costPerDozen?.toString() || "0",
          cmPerPiece: (mfg.cmPerPiece || mfg.costPerPiece)?.toString() || "0",
          totalOrderCost: mfg.totalOrderCost?.toString() || "0",
          currency: mfg.currency || "BDT",
          exchangeRate: mfg.exchangeRate?.toString() || "1",
          baseAmount: mfg.baseAmount?.toString() || "0",
          localAmount: mfg.localAmount?.toString() || "0",
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    }
    
    // Handle other costs: Delete existing and create new ones
    if (otherCosts && Array.isArray(otherCosts)) {
      // Delete existing other costs
      await storage.deleteAllQuotationOtherCosts(id, tenantId);
      
      console.log("Processing other costs:", otherCosts);
      
      // Create new other costs
      for (let i = 0; i < otherCosts.length; i++) {
        const cost = otherCosts[i];
        if (!cost.costHead) continue;
        
        const valueNum = parseFloat(cost.value?.toString() || "0") || 0;
        const calculatedNum = parseFloat(cost.calculatedAmount?.toString() || cost.totalAmount?.toString() || "0") || 0;
        const pctNum = parseFloat(cost.percentage?.toString() || "0") || (cost.costType === "percentage" ? valueNum : 0);
        const totalNum = calculatedNum || parseFloat(cost.totalAmount?.toString() || "0") || 0;
        
        await storage.createQuotationOtherCost({
          tenantId,
          quotationId: id,
          serialNo: cost.serialNo ?? (i + 1),
          costHead: cost.costHead,
          percentage: pctNum.toString(),
          totalAmount: totalNum.toString(),
          costType: cost.costType || "fixed",
          value: valueNum.toString(),
          basedOn: cost.basedOn || "subtotal",
          calculatedAmount: calculatedNum.toString(),
          notes: cost.notes || null,
          currency: cost.currency || "BDT",
          exchangeRate: cost.exchangeRate?.toString() || "1",
          baseAmount: cost.baseAmount?.toString() || "0",
          localAmount: cost.localAmount?.toString() || "0",
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    }

    // Handle size ratios: delete existing and insert new ones
    if (sizeRatios && Array.isArray(sizeRatios)) {
      await db.delete(quotationSizeRatios).where(
        and(eq(quotationSizeRatios.quotationId, id), eq(quotationSizeRatios.tenantId, tenantId))
      );
      for (let i = 0; i < sizeRatios.length; i++) {
        const sr = sizeRatios[i];
        if (!sr.size) continue;
        await db.insert(quotationSizeRatios).values({
          tenantId,
          quotationId: id,
          serialNo: sr.serialNo ?? (i + 1),
          size: sr.size,
          ratioPercentage: sr.ratioPercentage?.toString() || "0",
          fabricFactor: sr.fabricFactor?.toString() || "1.0",
          quantity: sr.quantity ?? 0,
        });
      }
    }
    
    // Handle summary: Update or create
    if (summary) {
      const existingSummary = await storage.getQuotationCostSummary(id, tenantId);
      
      if (existingSummary.length > 0) {
        // Update existing summary
        await storage.updateQuotationCostSummary(existingSummary[0].id, tenantId, {
          ...summary,
          updatedAt: new Date()
        });
      } else {
        // Create new summary
        await storage.createQuotationCostSummary({
          tenantId,
          quotationId: id,
          categoryName: "All Categories", // Match the actual field name in schema
          totalCost: summary.actualCostRequired || "0", // Match the actual field name in schema
          percentageOfTotal: 100, // Match the actual field name in schema
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    }
    
    const updatedQuotationWithRelated = await storage.getQuotationById(id, tenantId);
    const [matData, mfgData, ocData, srData] = await Promise.all([
      storage.getQuotationMaterials(id, tenantId),
      storage.getQuotationManufacturing(id, tenantId),
      storage.getQuotationOtherCosts(id, tenantId),
      db.select().from(quotationSizeRatios).where(and(eq(quotationSizeRatios.quotationId, id), eq(quotationSizeRatios.tenantId, tenantId))),
    ]);
    res.json({ ...updatedQuotationWithRelated, materials: matData, manufacturing: mfgData, otherCosts: ocData, sizeRatios: srData });
  } catch (error) {
    console.error("Error updating quotation with related data:", error);
    res.status(400).json({ message: "Failed to update quotation with related data", error: String(error) });
  }
});

// Delete a quotation
router.delete("/:id", requirePermission('sales:quotation:delete'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = Number(req.params.id);
    
    // Check if quotation exists
    const existingQuotation = await storage.getQuotationById(id, tenantId);
    if (!existingQuotation) {
      return res.status(404).json({ message: "Quotation not found" });
    }
    
    // Delete the quotation
    const success = await storage.deleteQuotation(id, tenantId);
    
    if (success) {
      res.status(204).send();
    } else {
      res.status(500).json({ message: "Failed to delete quotation" });
    }
  } catch (error) {
    console.error("Error deleting quotation:", error);
    res.status(500).json({ message: "Failed to delete quotation", error: String(error) });
  }
});

// Generate PDF for a quotation
router.get("/:id/pdf", requirePermission('sales:quotation:read'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = Number(req.params.id);

    const quotation = await storage.getQuotationById(id, tenantId);
    if (!quotation) return res.status(404).json({ message: "Quotation not found" });

    const [materials, manufacturing, otherCosts, tenant, customer, sizeRatioRows] = await Promise.all([
      storage.getQuotationMaterials(id, tenantId),
      storage.getQuotationManufacturing(id, tenantId),
      storage.getQuotationOtherCosts(id, tenantId),
      storage.getTenantById(tenantId),
      storage.getCustomerById(quotation.customerId, tenantId),
      db.select().from(quotationSizeRatios).where(and(eq(quotationSizeRatios.quotationId, id), eq(quotationSizeRatios.tenantId, tenantId))),
    ]);

    const PDFDocument = (await import("pdfkit")).default;
    const QRCode = (await import("qrcode")).default;
    const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${quotation.quotationId || `QTN-${id}`}.pdf"`);
    doc.pipe(res);

    const ORANGE = "#F97316";
    const DARK = "#1F2937";
    const GRAY = "#6B7280";
    const LIGHT = "#F9FAFB";
    const W = 515;
    const margin = 40;

    const fmt = (n: any, dec = 2) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });

    const qtnId = quotation.quotationId || `QTN-${id}`;
    const verifyUrl = `${req.protocol}://${req.get("host")}/verify/quotation/${qtnId}`;
    let qrBuffer: Buffer | null = null;
    try {
      qrBuffer = await QRCode.toBuffer(verifyUrl, { width: 70, margin: 1, color: { dark: "#1F2937", light: "#FFFFFF" } });
    } catch (e) {}

    // --- HEADER ---
    const headerH = 75;
    doc.rect(margin, 40, W, headerH).fill(ORANGE);
    doc.fontSize(16).fillColor("white").font("Helvetica-Bold")
      .text(tenant?.companyName || "Prime7 ERP", margin + 10, 48, { width: W - 160, lineBreak: false });
    const companyDetails = [tenant?.companyAddress, tenant?.companyPhone, tenant?.companyEmail].filter(Boolean).join("  |  ");
    if (companyDetails) {
      doc.fontSize(7).font("Helvetica").fillColor("white")
        .text(companyDetails, margin + 10, 66, { width: W - 160, lineBreak: false });
    }
    doc.fontSize(8).font("Helvetica").fillColor("white")
      .text("Garment Cost Quotation", margin + 10, 78, { width: W - 160, lineBreak: false });
    doc.fontSize(9).font("Helvetica-Bold").fillColor("white")
      .text(qtnId, margin + W - 120, 48, { width: 110, align: "right" });
    const statusLabel = (quotation.workflowStatus || "DRAFT").toUpperCase();
    const badgeBg = statusLabel === "APPROVED" ? "#16A34A" : statusLabel === "SUBMITTED" ? "#2563EB" : "#6B7280";
    doc.rect(margin + W - 100, 62, 80, 16).fill(badgeBg);
    doc.fontSize(8).font("Helvetica-Bold").fillColor("white")
      .text(statusLabel, margin + W - 100, 65, { width: 80, align: "center" });
    if (qrBuffer) {
      doc.image(qrBuffer, margin + W - 95, 82, { width: 28, height: 28 });
    }

    if (statusLabel === "DRAFT") {
      doc.save().opacity(0.06).fontSize(80).fillColor(ORANGE).font("Helvetica-Bold")
        .text("DRAFT", 100, 300, { width: 400, align: "center" }).restore();
    }

    let y = 40 + headerH + 8;

    // --- SUMMARY BOX ---
    doc.rect(margin, y, W, 70).fill(LIGHT).stroke("#E5E7EB");
    doc.fontSize(9).font("Helvetica-Bold").fillColor(DARK);
    const col = W / 4;
    const fields = [
      ["Customer", customer?.customerName || `ID ${quotation.customerId}`],
      ["Style / Product", quotation.styleName || "-"],
      ["Qty (Pcs)", fmt(quotation.projectedQuantity, 0)],
      ["Department", quotation.department || "-"],
      ["Quotation Date", quotation.quotationDate ? String(quotation.quotationDate).slice(0, 10) : "-"],
      ["Valid Until", quotation.validUntil ? String(quotation.validUntil).slice(0, 10) : "-"],
      ["Delivery Date", quotation.projectedDeliveryDate ? String(quotation.projectedDeliveryDate).slice(0, 10) : "-"],
      ["Target Currency", quotation.targetPriceCurrency || "USD"],
    ];
    fields.forEach(([label, val], i) => {
      const cx = margin + 8 + (i % 4) * col;
      const cy = y + 8 + Math.floor(i / 4) * 28;
      doc.fontSize(7).font("Helvetica").fillColor(GRAY).text(label, cx, cy, { width: col - 5 });
      doc.fontSize(9).font("Helvetica-Bold").fillColor(DARK).text(String(val), cx, cy + 10, { width: col - 5 });
    });
    y += 80;

    // Helper: draw a table
    const drawTable = (headers: string[], rows: string[][], colWidths: number[], title: string) => {
      if (rows.length === 0) return;
      const rowH = 16;
      const tableH = (rows.length + 1) * rowH + 20;
      if (y + tableH > doc.page.height - 60) { doc.addPage(); y = 40; }

      doc.fontSize(10).font("Helvetica-Bold").fillColor(ORANGE).text(title, margin, y);
      y += 14;

      // header row
      doc.rect(margin, y, W, rowH).fill(DARK);
      let cx = margin;
      headers.forEach((h, i) => {
        doc.fontSize(7).font("Helvetica-Bold").fillColor("white")
          .text(h, cx + 3, y + 4, { width: colWidths[i] - 4, lineBreak: false });
        cx += colWidths[i];
      });
      y += rowH;

      rows.forEach((row, ri) => {
        if (y + rowH > doc.page.height - 60) { doc.addPage(); y = 40; }
        doc.rect(margin, y, W, rowH).fill(ri % 2 === 0 ? "white" : LIGHT).stroke("#E5E7EB");
        cx = margin;
        row.forEach((cell, ci) => {
          doc.fontSize(7).font("Helvetica").fillColor(DARK)
            .text(cell, cx + 3, y + 4, { width: colWidths[ci] - 4, lineBreak: false });
          cx += colWidths[ci];
        });
        y += rowH;
      });
      y += 10;
    };

    // --- MATERIALS TABLE ---
    drawTable(
      ["#", "Material / Description", "Unit", "Cons/Dz", "Unit Price", "Curr", "Rate", "Amt/Dz (Tk)", "Total (Tk)"],
      materials.map((m, i) => [
        String(i + 1),
        m.description || `Item #${m.itemId || "-"}`,
        m.unit || "-",
        fmt(m.consumptionPerDozen),
        fmt(m.unitPrice),
        m.currency || "BDT",
        fmt(m.exchangeRate),
        fmt(m.amountPerDozen),
        fmt(m.totalAmount),
      ]),
      [20, 120, 35, 45, 55, 30, 40, 80, 90],
      "Material Costs"
    );

    // --- SIZE RATIO TABLE ---
    if (sizeRatioRows.length > 0) {
      drawTable(
        ["#", "Size", "Ratio %", "Qty", "Fabric Factor"],
        sizeRatioRows.map((sr, i) => [
          String(i + 1), sr.size, fmt(sr.ratioPercentage), String(sr.quantity || 0), fmt(sr.fabricFactor),
        ]),
        [25, 80, 80, 80, 250],
        "Size Ratio"
      );
    }

    // --- MANUFACTURING TABLE ---
    drawTable(
      ["#", "Style Part", "Machines", "Prod/Hr", "Prod/Day", "Cost/Machine", "Line Cost", "CM/Dz", "CM/Pc (Tk)", "Total (Tk)"],
      manufacturing.map((m, i) => [
        String(i + 1), m.stylePart, String(m.machinesRequired || 0),
        fmt(m.productionPerHour), fmt(m.productionPerDay),
        fmt(m.costPerMachine), fmt(m.totalLineCost), fmt(m.costPerDozen),
        fmt(m.cmPerPiece), fmt(m.totalOrderCost),
      ]),
      [20, 80, 45, 40, 45, 55, 50, 45, 47, 88],
      "CM / Manufacturing Costs"
    );

    // --- OTHER COSTS TABLE ---
    drawTable(
      ["#", "Cost Head", "Type", "Value", "Based On", "Calc. Amount (Tk)", "Notes"],
      otherCosts.map((c, i) => [
        String(i + 1), c.costHead, c.costType || "fixed",
        fmt(c.value), c.basedOn || "subtotal",
        fmt(c.calculatedAmount || c.totalAmount), c.notes || "-",
      ]),
      [20, 100, 40, 50, 60, 90, 155],
      "Commercial / Other Costs"
    );

    // --- COST SUMMARY ---
    if (y + 120 > doc.page.height - 80) { doc.addPage(); y = 40; }
    doc.fontSize(10).font("Helvetica-Bold").fillColor(ORANGE).text("Cost Summary", margin, y);
    y += 14;

    const matTotal = materials.reduce((s, m) => s + Number(m.totalAmount || 0), 0);
    const cmTotal = manufacturing.reduce((s, m) => s + Number(m.totalOrderCost || 0), 0);
    const commercialTotal = otherCosts.reduce((s, c) => s + Number(c.calculatedAmount || c.totalAmount || 0), 0);
    const grandTotal = matTotal + cmTotal + commercialTotal;
    const profitPct = Number(quotation.profitPercentage || 0);
    const profitAmt = grandTotal * (profitPct / 100);
    const quotedPrice = Number(quotation.quotedPrice || 0) || grandTotal + profitAmt;
    const qty = Number(quotation.projectedQuantity || 1);
    const qtyDz = qty / 12;

    const summaryRows = [
      ["Material Cost", fmt(matTotal), fmt(qtyDz > 0 ? matTotal / qtyDz : 0), grandTotal > 0 ? fmt((matTotal / grandTotal) * 100) + "%" : "-"],
      ["CM Cost", fmt(cmTotal), fmt(qtyDz > 0 ? cmTotal / qtyDz : 0), grandTotal > 0 ? fmt((cmTotal / grandTotal) * 100) + "%" : "-"],
      ["Commercial", fmt(commercialTotal), fmt(qtyDz > 0 ? commercialTotal / qtyDz : 0), grandTotal > 0 ? fmt((commercialTotal / grandTotal) * 100) + "%" : "-"],
      ["Total Cost", fmt(grandTotal), fmt(qtyDz > 0 ? grandTotal / qtyDz : 0), "100%"],
      [`Profit (${profitPct}%)`, fmt(profitAmt), fmt(qtyDz > 0 ? profitAmt / qtyDz : 0), ""],
      ["Quoted Price (Total)", fmt(quotedPrice), "", ""],
    ];

    const colW4 = [W * 0.35, W * 0.25, W * 0.2, W * 0.2];
    doc.rect(margin, y, W, 16).fill(DARK);
    ["Category", "Amount (Tk)", "Per Dozen (Tk)", "% of Total"].forEach((h, i) => {
      doc.fontSize(7).font("Helvetica-Bold").fillColor("white")
        .text(h, margin + colW4.slice(0, i).reduce((a, b) => a + b, 0) + 3, y + 4, { width: colW4[i] - 4, lineBreak: false });
    });
    y += 16;
    summaryRows.forEach((row, ri) => {
      const isBold = ri === 3 || ri === 5;
      doc.rect(margin, y, W, 16).fill(ri % 2 === 0 ? "white" : LIGHT).stroke("#E5E7EB");
      if (isBold) doc.rect(margin, y, W, 16).fill("#FFF7ED");
      row.forEach((cell, ci) => {
        doc.fontSize(isBold ? 8 : 7).font(isBold ? "Helvetica-Bold" : "Helvetica").fillColor(isBold ? ORANGE : DARK)
          .text(cell, margin + colW4.slice(0, ci).reduce((a, b) => a + b, 0) + 3, y + 4, { width: colW4[ci] - 4, lineBreak: false });
      });
      y += 16;
    });

    // Quoted price highlighted
    y += 8;
    doc.rect(margin, y, W, 26).fill(ORANGE);
    doc.fontSize(10).font("Helvetica-Bold").fillColor("white")
      .text(`Quoted Price: Tk ${fmt(quotedPrice)} total  |  Tk ${fmt(qty > 0 ? quotedPrice / qty : 0)} per pc  |  Tk ${fmt(qtyDz > 0 ? quotedPrice / qtyDz : 0)} per dozen`, margin + 10, y + 8, { width: W - 20 });
    y += 36;

    // Notes
    if (quotation.notes) {
      if (y + 40 > doc.page.height - 60) { doc.addPage(); y = 40; }
      doc.fontSize(9).font("Helvetica-Bold").fillColor(DARK).text("Notes:", margin, y);
      y += 12;
      doc.fontSize(8).font("Helvetica").fillColor(GRAY).text(quotation.notes, margin, y, { width: W });
      y += 30;
    }

    // --- SIGNATURE & FOOTER ---
    if (y + 100 > doc.page.height - 40) { doc.addPage(); y = 40; }
    const sigY = doc.page.height - 110;
    const sigLabels = ["Prepared by", "Checked by", "Recommended by", "Audited by", "Approved by"];
    const sigColW = W / sigLabels.length;
    doc.rect(margin, sigY, W, 70).fill(LIGHT).stroke("#E5E7EB");
    sigLabels.forEach((label, i) => {
      const sx = margin + i * sigColW + 5;
      doc.fontSize(7).font("Helvetica-Bold").fillColor(DARK).text(label, sx, sigY + 6, { width: sigColW - 10 });
      doc.moveTo(sx, sigY + 40).lineTo(sx + sigColW - 15, sigY + 40).strokeColor("#9CA3AF").lineWidth(0.5).stroke();
      doc.fontSize(6).font("Helvetica").fillColor(GRAY)
        .text("Name: ________________", sx, sigY + 44, { width: sigColW - 10 })
        .text("Date: ________________", sx, sigY + 54, { width: sigColW - 10 });
    });

    const footerY = doc.page.height - 35;
    doc.fontSize(6).font("Helvetica").fillColor(GRAY)
      .text(`Generated: ${new Date().toLocaleString()}  |  ${tenant?.companyName || "Prime7 ERP"}  |  ${qtnId}`, margin, footerY, { width: W - 40 });
    if (qrBuffer) {
      doc.image(qrBuffer, margin + W - 32, footerY - 8, { width: 28, height: 28 });
    }

    doc.end();
  } catch (error) {
    console.error("Error generating quotation PDF:", error);
    if (!res.headersSent) res.status(500).json({ message: "Failed to generate PDF", error: String(error) });
  }
});

// Send quotation email to customer
router.post("/:id/send-email", requirePermission('sales:quotation:edit'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = Number(req.params.id);
    const { toEmail, toName, message } = req.body;

    const quotation = await storage.getQuotationById(id, tenantId);
    if (!quotation) return res.status(404).json({ message: "Quotation not found" });

    const [tenant, customer, materials, manufacturing, otherCosts] = await Promise.all([
      storage.getTenantById(tenantId),
      storage.getCustomerById(quotation.customerId, tenantId),
      storage.getQuotationMaterials(id, tenantId),
      storage.getQuotationManufacturing(id, tenantId),
      storage.getQuotationOtherCosts(id, tenantId),
    ]);

    const recipientEmail = toEmail || (customer as any)?.email;
    const recipientName = toName || (customer as any)?.customerName || "Valued Customer";

    if (!recipientEmail) {
      return res.status(400).json({ message: "No recipient email address available" });
    }

    const fmt = (n: any, dec = 2) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const matTotal = materials.reduce((s, m) => s + Number(m.totalAmount || 0), 0);
    const cmTotal = manufacturing.reduce((s, m) => s + Number(m.totalOrderCost || 0), 0);
    const otherTotal = otherCosts.reduce((s, c) => s + Number(c.calculatedAmount || c.totalAmount || 0), 0);
    const grandTotal = matTotal + cmTotal + otherTotal;
    const quotedPrice = Number(quotation.quotedPrice || 0) || grandTotal * (1 + Number(quotation.profitPercentage || 0) / 100);
    const qty = Number(quotation.projectedQuantity || 1);

    const companyName = tenant?.companyName || "Prime7 ERP";
    const qtnId = quotation.quotationId || `QTN-${id}`;

    const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { font-family: -apple-system, Arial, sans-serif; color: #1F2937; background: #F9FAFB; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }
  .header { background: linear-gradient(135deg, #F97316 0%, #ea580c 100%); padding: 28px 24px; color: white; }
  .header h1 { margin: 0; font-size: 22px; }
  .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.9; }
  .body { padding: 28px 24px; }
  .summary-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  .summary-table th { background: #1F2937; color: white; padding: 8px 12px; text-align: left; font-size: 12px; }
  .summary-table td { padding: 8px 12px; border-bottom: 1px solid #E5E7EB; font-size: 13px; }
  .summary-table tr:nth-child(even) td { background: #F9FAFB; }
  .highlight { background: #FFF7ED; border-left: 4px solid #F97316; padding: 14px; margin: 16px 0; border-radius: 4px; }
  .highlight p { margin: 0; font-size: 15px; font-weight: 600; color: #1F2937; }
  .cta { display: inline-block; background: #F97316; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; margin: 16px 0; }
  .footer { background: #F3F4F6; padding: 16px 24px; font-size: 12px; color: #6B7280; text-align: center; }
</style>
</head><body>
<div class="container">
  <div class="header">
    <h1>${companyName}</h1>
    <p>Quotation for Your Review — ${qtnId}</p>
  </div>
  <div class="body">
    <p>Dear ${recipientName},</p>
    <p>Please find below our quotation for your review and consideration.</p>
    ${message ? `<p>${message}</p>` : ""}
    <table class="summary-table">
      <tr><th colspan="2">Quotation Summary</th></tr>
      <tr><td><strong>Quotation No.</strong></td><td>${qtnId}</td></tr>
      <tr><td><strong>Style / Product</strong></td><td>${quotation.styleName || "-"}</td></tr>
      <tr><td><strong>Quantity</strong></td><td>${fmt(qty, 0)} pcs</td></tr>
      <tr><td><strong>Delivery Date</strong></td><td>${quotation.projectedDeliveryDate ? String(quotation.projectedDeliveryDate).slice(0, 10) : "-"}</td></tr>
      <tr><td><strong>Valid Until</strong></td><td>${quotation.validUntil ? String(quotation.validUntil).slice(0, 10) : "-"}</td></tr>
      <tr><td><strong>Material Cost</strong></td><td>৳ ${fmt(matTotal)}</td></tr>
      <tr><td><strong>CM Cost</strong></td><td>৳ ${fmt(cmTotal)}</td></tr>
      <tr><td><strong>Commercial Costs</strong></td><td>৳ ${fmt(otherTotal)}</td></tr>
    </table>
    <div class="highlight">
      <p>Quoted Price: ৳ ${fmt(quotedPrice)} total &nbsp;|&nbsp; ৳ ${fmt(qty > 0 ? quotedPrice / qty : 0)} per piece</p>
    </div>
    <p>Please review the quotation and let us know if you have any questions or require any modifications.</p>
    <p>Best regards,<br><strong>${companyName} Team</strong></p>
  </div>
  <div class="footer">${companyName} &nbsp;|&nbsp; ${qtnId} &nbsp;|&nbsp; Generated ${new Date().toLocaleDateString()}</div>
</div>
</body></html>`;

    const text = `Dear ${recipientName},\n\nPlease find our quotation ${qtnId} for ${quotation.styleName}.\nQty: ${fmt(qty, 0)} pcs | Quoted Price: ৳${fmt(quotedPrice)} total | ৳${fmt(qty > 0 ? quotedPrice / qty : 0)}/pc\nDelivery: ${quotation.projectedDeliveryDate || "-"} | Valid Until: ${quotation.validUntil || "-"}\n\nBest regards,\n${companyName} Team`;

    const { default: Resend } = await import("resend") as any;
    const resend = new Resend(process.env.RESEND_API_KEY);

    if (!process.env.RESEND_API_KEY) {
      return res.status(503).json({ message: "Email service not configured. Please set RESEND_API_KEY." });
    }

    const emailResult = await resend.emails.send({
      from: "noreply@prime7erp.com",
      to: recipientEmail,
      subject: `Quotation ${qtnId} from ${companyName}`,
      html,
      text,
    });

    if (emailResult.error) {
      return res.status(500).json({ message: "Failed to send email", error: emailResult.error.message });
    }

    // Mark as SENT
    await storage.updateQuotation(id, tenantId, { workflowStatus: "SENT", updatedAt: new Date() });

    res.json({ success: true, messageId: emailResult.data?.id, sentTo: recipientEmail });
  } catch (error) {
    console.error("Error sending quotation email:", error);
    res.status(500).json({ message: "Failed to send email", error: String(error) });
  }
});

// Convert an inquiry to a quotation
router.post("/convert-inquiry/:inquiryId", requirePermission('sales:quotation:create'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const inquiryId = Number(req.params.inquiryId);
    const profitPercentage = req.body.profitPercentage ? Number(req.body.profitPercentage) : 15;
    
    // Check if inquiry exists
    const inquiry = await storage.getInquiryById(inquiryId, tenantId);
    if (!inquiry) {
      return res.status(404).json({ message: "Inquiry not found" });
    }
    
    // Convert inquiry to quotation
    const newQuotation = await storage.convertInquiryToQuotation(inquiryId, tenantId, profitPercentage);
    
    res.status(201).json(newQuotation);
  } catch (error) {
    console.error("Error converting inquiry to quotation:", error);
    res.status(400).json({ message: "Failed to convert inquiry to quotation", error: String(error) });
  }
});

// Get quotation materials
router.get("/:id/materials", requirePermission('sales:quotation:read'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const quotationId = Number(req.params.id);
    
    const materials = await storage.getQuotationMaterials(quotationId, tenantId);
    res.json(materials);
  } catch (error) {
    console.error("Error fetching quotation materials:", error);
    res.status(500).json({ message: "Failed to fetch quotation materials", error: String(error) });
  }
});

// Add a material to a quotation
router.post("/:id/materials", requirePermission('sales:quotation:edit'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const quotationId = Number(req.params.id);
    
    // Validate and parse the request body
    const validatedData = insertQuotationMaterialSchema.parse({
      ...req.body,
      tenantId,
      quotationId,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    const newMaterial = await storage.createQuotationMaterial(validatedData);
    res.status(201).json(newMaterial);
  } catch (error) {
    console.error("Error adding quotation material:", error);
    res.status(400).json({ message: "Failed to add quotation material", error: String(error) });
  }
});

// Update a quotation material
router.patch("/:quotationId/materials/:id", requirePermission('sales:quotation:edit'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = Number(req.params.id);
    
    const updatedMaterial = await storage.updateQuotationMaterial(id, tenantId, {
      ...req.body,
      updatedAt: new Date()
    });
    
    res.json(updatedMaterial);
  } catch (error) {
    console.error("Error updating quotation material:", error);
    res.status(400).json({ message: "Failed to update quotation material", error: String(error) });
  }
});

// Delete a quotation material
router.delete("/:quotationId/materials/:id", requirePermission('sales:quotation:edit'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = Number(req.params.id);
    
    const success = await storage.deleteQuotationMaterial(id, tenantId);
    
    if (success) {
      res.status(204).send();
    } else {
      res.status(500).json({ message: "Failed to delete quotation material" });
    }
  } catch (error) {
    console.error("Error deleting quotation material:", error);
    res.status(500).json({ message: "Failed to delete quotation material", error: String(error) });
  }
});

// Get quotation manufacturing costs
router.get("/:id/manufacturing", requirePermission('sales:quotation:read'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const quotationId = Number(req.params.id);
    
    const manufacturingCosts = await storage.getQuotationManufacturing(quotationId, tenantId);
    res.json(manufacturingCosts);
  } catch (error) {
    console.error("Error fetching quotation manufacturing costs:", error);
    res.status(500).json({ message: "Failed to fetch quotation manufacturing costs", error: String(error) });
  }
});

// Add a manufacturing cost to a quotation
router.post("/:id/manufacturing", requirePermission('sales:quotation:edit'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const quotationId = Number(req.params.id);
    
    // Validate and parse the request body
    const validatedData = insertQuotationManufacturingSchema.parse({
      ...req.body,
      tenantId,
      quotationId,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    const newManufacturingCost = await storage.createQuotationManufacturing(validatedData);
    res.status(201).json(newManufacturingCost);
  } catch (error) {
    console.error("Error adding quotation manufacturing cost:", error);
    res.status(400).json({ message: "Failed to add quotation manufacturing cost", error: String(error) });
  }
});

// Update a quotation manufacturing cost
router.patch("/:quotationId/manufacturing/:id", requirePermission('sales:quotation:edit'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = Number(req.params.id);
    
    const updatedManufacturingCost = await storage.updateQuotationManufacturing(id, tenantId, {
      ...req.body,
      updatedAt: new Date()
    });
    
    res.json(updatedManufacturingCost);
  } catch (error) {
    console.error("Error updating quotation manufacturing cost:", error);
    res.status(400).json({ message: "Failed to update quotation manufacturing cost", error: String(error) });
  }
});

// Delete a quotation manufacturing cost
router.delete("/:quotationId/manufacturing/:id", requirePermission('sales:quotation:edit'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = Number(req.params.id);
    
    const success = await storage.deleteQuotationManufacturing(id, tenantId);
    
    if (success) {
      res.status(204).send();
    } else {
      res.status(500).json({ message: "Failed to delete quotation manufacturing cost" });
    }
  } catch (error) {
    console.error("Error deleting quotation manufacturing cost:", error);
    res.status(500).json({ message: "Failed to delete quotation manufacturing cost", error: String(error) });
  }
});

// Get quotation other costs
router.get("/:id/other-costs", requirePermission('sales:quotation:read'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const quotationId = Number(req.params.id);
    
    const otherCosts = await storage.getQuotationOtherCosts(quotationId, tenantId);
    res.json(otherCosts);
  } catch (error) {
    console.error("Error fetching quotation other costs:", error);
    res.status(500).json({ message: "Failed to fetch quotation other costs", error: String(error) });
  }
});

// Add an other cost to a quotation
router.post("/:id/other-costs", requirePermission('sales:quotation:edit'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const quotationId = Number(req.params.id);
    
    // Validate and parse the request body
    const validatedData = insertQuotationOtherCostSchema.parse({
      ...req.body,
      tenantId,
      quotationId,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    const newOtherCost = await storage.createQuotationOtherCost(validatedData);
    res.status(201).json(newOtherCost);
  } catch (error) {
    console.error("Error adding quotation other cost:", error);
    res.status(400).json({ message: "Failed to add quotation other cost", error: String(error) });
  }
});

// Update a quotation other cost
router.patch("/:quotationId/other-costs/:id", requirePermission('sales:quotation:edit'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = Number(req.params.id);
    
    const updatedOtherCost = await storage.updateQuotationOtherCost(id, tenantId, {
      ...req.body,
      updatedAt: new Date()
    });
    
    res.json(updatedOtherCost);
  } catch (error) {
    console.error("Error updating quotation other cost:", error);
    res.status(400).json({ message: "Failed to update quotation other cost", error: String(error) });
  }
});

// Delete a quotation other cost
router.delete("/:quotationId/other-costs/:id", requirePermission('sales:quotation:edit'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = Number(req.params.id);
    
    const success = await storage.deleteQuotationOtherCost(id, tenantId);
    
    if (success) {
      res.status(204).send();
    } else {
      res.status(500).json({ message: "Failed to delete quotation other cost" });
    }
  } catch (error) {
    console.error("Error deleting quotation other cost:", error);
    res.status(500).json({ message: "Failed to delete quotation other cost", error: String(error) });
  }
});

// Get quotation cost summary
router.get("/:id/cost-summary", requirePermission('sales:quotation:read'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const quotationId = Number(req.params.id);
    
    const costSummary = await storage.getQuotationCostSummary(quotationId, tenantId);
    res.json(costSummary.length > 0 ? costSummary[0] : null);
  } catch (error) {
    console.error("Error fetching quotation cost summary:", error);
    res.status(500).json({ message: "Failed to fetch quotation cost summary", error: String(error) });
  }
});

// Create or update quotation cost summary
router.post("/:id/cost-summary", requirePermission('sales:quotation:edit'), async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const quotationId = Number(req.params.id);
    
    // Check if summary already exists
    const existingSummary = await storage.getQuotationCostSummary(quotationId, tenantId);
    
    if (existingSummary.length > 0) {
      // Update existing summary
      const updatedSummary = await storage.updateQuotationCostSummary(existingSummary[0].id, tenantId, {
        ...req.body,
        updatedAt: new Date()
      });
      
      res.json(updatedSummary);
    } else {
      // Create new summary
      const validatedData = insertQuotationCostSummarySchema.parse({
        ...req.body,
        tenantId,
        quotationId,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      const newSummary = await storage.createQuotationCostSummary(validatedData);
      res.status(201).json(newSummary);
    }
  } catch (error) {
    console.error("Error managing quotation cost summary:", error);
    res.status(400).json({ message: "Failed to manage quotation cost summary", error: String(error) });
  }
});

export default router;