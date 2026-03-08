import { parseIntParam } from "../utils/parseParams";
import { requireTenant } from "../utils/tenantScope";
import { Router } from "express";
import { z } from "zod";
import { currencyService } from "../services/currencyService";
import { authenticate as authMiddleware } from "../middleware/auth";
import { safeErrorMessage } from "../utils/parseParams";
import { insertCurrencySchema, insertExchangeRateSchema, currencyExchangeRates } from "@shared/schema";
import { SequentialIdGenerator } from "../utils/sequentialIdGenerator";
import { fetchLiveRate } from "../services/forexService";
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

// Apply auth middleware to all currency routes
router.use(authMiddleware);

// Get all currencies for a tenant
router.get("/", async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const activeOnly = req.query.activeOnly === "true";
    
    const currencies = await currencyService.getAllCurrencies(tenantId, activeOnly);
    res.json(currencies);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

router.get("/live-rate", async (req: any, res) => {
  try {
    const from = (req.query.from as string || "USD").toUpperCase();
    const to = (req.query.to as string || "BDT").toUpperCase();
    const tenantId = requireTenant(req);

    const [liveResult, lastInputRows] = await Promise.all([
      fetchLiveRate(from, to),
      db
        .select()
        .from(currencyExchangeRates)
        .where(
          and(
            eq(currencyExchangeRates.tenantId, tenantId),
            eq(currencyExchangeRates.fromCurrency, from),
            eq(currencyExchangeRates.toCurrency, to),
            eq(currencyExchangeRates.isActive, true)
          )
        )
        .orderBy(desc(currencyExchangeRates.effectiveDate))
        .limit(1),
    ]);

    const lastInput = lastInputRows[0] || null;

    res.json({
      liveRate: liveResult.liveRate,
      liveSource: liveResult.liveSource,
      liveUpdated: liveResult.liveUpdated,
      liveError: liveResult.error || null,
      lastInputRate: lastInput ? parseFloat(lastInput.exchangeRate) : null,
      lastInputDate: lastInput?.effectiveDate || null,
      lastInputSource: lastInput?.source || null,
    });
  } catch (error: any) {
    console.error("Error fetching live rate:", error);
    res.status(500).json({ message: safeErrorMessage(error, "Failed to fetch live rate") });
  }
});

router.post("/save-live-rate", async (req: any, res) => {
  try {
    const tenantId = requireTenant(req);
    const { fromCurrency, toCurrency, rate, source } = req.body;

    if (!fromCurrency || !toCurrency || !rate) {
      return res.status(400).json({ message: "fromCurrency, toCurrency, and rate are required" });
    }

    const today = new Date().toISOString().split("T")[0];

    const result = await db
      .insert(currencyExchangeRates)
      .values({
        tenantId,
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
        exchangeRate: String(rate),
        effectiveDate: today,
        source: source || "api",
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [
          currencyExchangeRates.tenantId,
          currencyExchangeRates.fromCurrency,
          currencyExchangeRates.toCurrency,
          currencyExchangeRates.effectiveDate,
        ],
        set: {
          exchangeRate: String(rate),
          source: source || "api",
          updatedAt: new Date(),
        },
      })
      .returning();

    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error("Error saving live rate:", error);
    res.status(500).json({ message: safeErrorMessage(error, "Failed to save live rate") });
  }
});

// Get a currency by ID
router.get("/:id", async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = parseIntParam(req.params.id, "id");
    
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid currency ID" });
    }
    
    const currency = await currencyService.getCurrencyById(id, tenantId);
    
    if (!currency) {
      return res.status(404).json({ message: "Currency not found" });
    }
    
    res.json(currency);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// Create a new currency
router.post("/", async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    
    // Generate sequential currency ID
    const currencyId = await SequentialIdGenerator.generateCurrencyId(tenantId);
    
    // Validate request body
    const validatedData = insertCurrencySchema.parse({
      ...req.body,
      currencyId, // Add the sequential ID
      tenantId
    });
    
    const newCurrency = await currencyService.createCurrency(validatedData);
    res.status(201).json(newCurrency);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    if (error.message?.includes("duplicate key") || error.message?.includes("unique constraint")) {
      return res.status(409).json({ message: `Currency with code "${req.body.code}" already exists` });
    }
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// Update a currency
router.put("/:id", async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = parseIntParam(req.params.id, "id");
    
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid currency ID" });
    }
    
    // Get existing currency to make sure it exists
    const existingCurrency = await currencyService.getCurrencyById(id, tenantId);
    
    if (!existingCurrency) {
      return res.status(404).json({ message: "Currency not found" });
    }
    
    // Remove tenantId from request body if present (cannot change tenant)
    const { tenantId: _, ...updateData } = req.body;
    
    const updatedCurrency = await currencyService.updateCurrency(id, tenantId, updateData);
    res.json(updatedCurrency);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// Set a currency as the default for a tenant
router.put("/:id/default", async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = parseIntParam(req.params.id, "id");
    
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid currency ID" });
    }
    
    // Get existing currency to make sure it exists
    const existingCurrency = await currencyService.getCurrencyById(id, tenantId);
    
    if (!existingCurrency) {
      return res.status(404).json({ message: "Currency not found" });
    }
    
    const updatedCurrency = await currencyService.setDefaultCurrency(id, tenantId);
    res.json(updatedCurrency);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// Delete a currency
router.delete("/:id", async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = parseIntParam(req.params.id, "id");
    
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid currency ID" });
    }
    
    const result = await currencyService.deleteCurrency(id, tenantId);
    
    if (!result) {
      return res.status(404).json({ message: "Currency not found or could not be deleted" });
    }
    
    res.status(204).end();
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// Get exchange rates for a currency
router.get("/:id/exchange-rates", async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const currencyId = parseIntParam(req.params.id, "id");
    
    if (isNaN(currencyId)) {
      return res.status(400).json({ message: "Invalid currency ID" });
    }
    
    const rates = await currencyService.getExchangeRates(currencyId, tenantId);
    res.json(rates);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// Get current exchange rate for a currency
router.get("/:id/current-rate", async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const currencyId = parseIntParam(req.params.id, "id");
    
    if (isNaN(currencyId)) {
      return res.status(400).json({ message: "Invalid currency ID" });
    }
    
    const rate = await currencyService.getCurrentExchangeRate(currencyId, tenantId);
    
    if (!rate) {
      return res.status(404).json({ message: "No current exchange rate found for this currency" });
    }
    
    res.json(rate);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// Add a new exchange rate for a currency
router.post("/:id/exchange-rates", async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const currencyId = parseIntParam(req.params.id, "id");
    
    if (isNaN(currencyId)) {
      return res.status(400).json({ message: "Invalid currency ID" });
    }
    
    // Validate request body
    const validatedData = insertExchangeRateSchema.parse({
      ...req.body,
      currencyId,
      tenantId
    });
    
    const newRate = await currencyService.createExchangeRate(validatedData);
    res.status(201).json(newRate);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// Update an exchange rate
router.put("/exchange-rates/:id", async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const id = parseIntParam(req.params.id, "id");
    
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid exchange rate ID" });
    }
    
    // Remove tenantId from request body if present (cannot change tenant)
    const { tenantId: _, ...updateData } = req.body;
    
    const updatedRate = await currencyService.updateExchangeRate(id, tenantId, updateData);
    res.json(updatedRate);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// Get insights for a currency
router.get("/:id/insights", async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const currencyId = parseIntParam(req.params.id, "id");
    
    if (isNaN(currencyId)) {
      return res.status(400).json({ message: "Invalid currency ID" });
    }
    
    const insights = await currencyService.getCurrencyInsights(currencyId, tenantId);
    res.json(insights);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// Generate a market insight for a currency
router.post("/:id/insights/market", async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const currencyId = parseIntParam(req.params.id, "id");
    
    if (isNaN(currencyId)) {
      return res.status(400).json({ message: "Invalid currency ID" });
    }
    
    const insight = await currencyService.generateMarketInsight(currencyId, tenantId);
    res.status(201).json(insight);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// Generate an exchange rate insight for a currency
router.post("/:id/insights/exchange-rate", async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const currencyId = parseIntParam(req.params.id, "id");
    
    if (isNaN(currencyId)) {
      return res.status(400).json({ message: "Invalid currency ID" });
    }
    
    const insight = await currencyService.generateExchangeRateInsight(currencyId, tenantId);
    res.status(201).json(insight);
  } catch (error: any) {
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

export default router;