import { Router } from "express";
import { db } from "../db";
import { currencyExchangeRates } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { authenticate } from "../middleware/auth";

const router = Router();

// Get all exchange rates for tenant
router.get("/exchange-rates", authenticate, async (req: any, res) => {
  try {
    const rates = await db
      .select()
      .from(currencyExchangeRates)
      .where(and(
        eq(currencyExchangeRates.tenantId, req.tenantId),
        eq(currencyExchangeRates.isActive, true)
      ))
      .orderBy(desc(currencyExchangeRates.effectiveDate));

    res.json(rates);
  } catch (error) {
    console.error("Error fetching exchange rates:", error);
    res.status(500).json({ error: "Failed to fetch exchange rates" });
  }
});

// Get exchange rate for specific currency pair
router.get("/exchange-rates/:from/:to", authenticate, async (req: any, res) => {
  try {
    const { from, to } = req.params;
    
    const rate = await db
      .select()
      .from(currencyExchangeRates)
      .where(and(
        eq(currencyExchangeRates.tenantId, req.tenantId),
        eq(currencyExchangeRates.fromCurrency, from),
        eq(currencyExchangeRates.toCurrency, to),
        eq(currencyExchangeRates.isActive, true)
      ))
      .orderBy(desc(currencyExchangeRates.effectiveDate))
      .limit(1);

    if (rate.length === 0) {
      return res.status(404).json({ error: "Exchange rate not found" });
    }

    res.json(rate[0]);
  } catch (error) {
    console.error("Error fetching exchange rate:", error);
    res.status(500).json({ error: "Failed to fetch exchange rate" });
  }
});

// Create or update exchange rate
router.post("/exchange-rates", authenticate, async (req: any, res) => {
  try {
    const { fromCurrency, toCurrency, exchangeRate, effectiveDate, source = "manual" } = req.body;

    // Validate required fields
    if (!fromCurrency || !toCurrency || !exchangeRate) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Deactivate previous rates for this currency pair
    await db
      .update(currencyExchangeRates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(currencyExchangeRates.tenantId, req.tenantId),
        eq(currencyExchangeRates.fromCurrency, fromCurrency),
        eq(currencyExchangeRates.toCurrency, toCurrency)
      ));

    // Insert new rate
    const [newRate] = await db
      .insert(currencyExchangeRates)
      .values({
        tenantId: req.tenantId,
        fromCurrency,
        toCurrency,
        exchangeRate: exchangeRate.toString(),
        effectiveDate: effectiveDate || new Date().toISOString().split('T')[0],
        source,
        isActive: true,
      })
      .returning();

    res.json(newRate);
  } catch (error) {
    console.error("Error creating exchange rate:", error);
    res.status(500).json({ error: "Failed to create exchange rate" });
  }
});

// Update exchange rate
router.put("/exchange-rates/:id", authenticate, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { exchangeRate, effectiveDate, source, isActive } = req.body;

    const [updatedRate] = await db
      .update(currencyExchangeRates)
      .set({
        ...(exchangeRate && { exchangeRate: exchangeRate.toString() }),
        ...(effectiveDate && { effectiveDate }),
        ...(source && { source }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date(),
      })
      .where(and(
        eq(currencyExchangeRates.id, parseInt(id)),
        eq(currencyExchangeRates.tenantId, req.tenantId)
      ))
      .returning();

    if (!updatedRate) {
      return res.status(404).json({ error: "Exchange rate not found" });
    }

    res.json(updatedRate);
  } catch (error) {
    console.error("Error updating exchange rate:", error);
    res.status(500).json({ error: "Failed to update exchange rate" });
  }
});

// Delete exchange rate
router.delete("/exchange-rates/:id", authenticate, async (req: any, res) => {
  try {
    const { id } = req.params;

    const [deletedRate] = await db
      .delete(currencyExchangeRates)
      .where(and(
        eq(currencyExchangeRates.id, parseInt(id)),
        eq(currencyExchangeRates.tenantId, req.tenantId)
      ))
      .returning();

    if (!deletedRate) {
      return res.status(404).json({ error: "Exchange rate not found" });
    }

    res.json({ message: "Exchange rate deleted successfully" });
  } catch (error) {
    console.error("Error deleting exchange rate:", error);
    res.status(500).json({ error: "Failed to delete exchange rate" });
  }
});

// Bulk update exchange rates (for automated rate updates)
router.post("/exchange-rates/bulk-update", authenticate, async (req: any, res) => {
  try {
    const { rates } = req.body;

    if (!Array.isArray(rates)) {
      return res.status(400).json({ error: "Rates must be an array" });
    }

    const results = [];

    for (const rate of rates) {
      const { fromCurrency, toCurrency, exchangeRate, effectiveDate, source = "api" } = rate;

      // Deactivate previous rates for this currency pair
      await db
        .update(currencyExchangeRates)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(currencyExchangeRates.tenantId, req.tenantId),
          eq(currencyExchangeRates.fromCurrency, fromCurrency),
          eq(currencyExchangeRates.toCurrency, toCurrency)
        ));

      // Insert new rate
      const [newRate] = await db
        .insert(currencyExchangeRates)
        .values({
          tenantId: req.tenantId,
          fromCurrency,
          toCurrency,
          exchangeRate: exchangeRate.toString(),
          effectiveDate: effectiveDate || new Date().toISOString().split('T')[0],
          source,
          isActive: true,
        })
        .returning();

      results.push(newRate);
    }

    res.json({ message: `Updated ${results.length} exchange rates`, rates: results });
  } catch (error) {
    console.error("Error bulk updating exchange rates:", error);
    res.status(500).json({ error: "Failed to bulk update exchange rates" });
  }
});

// Fetch live exchange rates from open.er-api.com (free, no key required)
router.get("/live-rates", authenticate, async (req: any, res) => {
  const FALLBACK_RATES: Record<string, number> = {
    BDT: 110.50, EUR: 0.92, GBP: 0.79, JPY: 149.50, CNY: 7.24,
    INR: 83.10, AUD: 1.53, CAD: 1.36, CHF: 0.90, SGD: 1.34,
    HKD: 7.82, MYR: 4.72, THB: 35.50, VND: 24500, KRW: 1325,
    TRY: 32.10, SAR: 3.75, AED: 3.67, PKR: 278.0, LKR: 325.0,
  };

  try {
    const base = (req.query.base as string || "USD").toUpperCase();
    const url = `https://open.er-api.com/v6/latest/${base}`;
    
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    
    const data = await response.json() as any;
    
    if (data.result !== "success") throw new Error("API returned non-success result");
    
    res.json({
      rates: data.rates,
      base: data.base_code || base,
      source: "open.er-api.com",
      fetchedAt: new Date().toISOString(),
      live: true,
    });
  } catch (err) {
    console.warn("[CURRENCY] Live rate fetch failed, using fallback:", err instanceof Error ? err.message : String(err));
    res.json({
      rates: FALLBACK_RATES,
      base: "USD",
      source: "fallback",
      fetchedAt: new Date().toISOString(),
      live: false,
    });
  }
});

export default router;