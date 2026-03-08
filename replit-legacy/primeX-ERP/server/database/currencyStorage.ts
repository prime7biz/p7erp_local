import { db } from "../db";
import { eq, asc, desc, and, isNull, sql } from "drizzle-orm";
import { currencies, exchangeRates, currencyInsights } from "@shared/schema";
import type { Currency, ExchangeRate, CurrencyInsight, InsertCurrency, InsertExchangeRate, InsertCurrencyInsight } from "@shared/schema";

export const currencyStorage = {
  // Currency operations
  async getAllCurrencies(tenantId: number, activeOnly: boolean = false): Promise<Currency[]> {
    if (activeOnly) {
      return db
        .select()
        .from(currencies)
        .where(and(eq(currencies.tenantId, tenantId), eq(currencies.isActive, true)))
        .orderBy(asc(currencies.name));
    }
    
    return db
      .select()
      .from(currencies)
      .where(eq(currencies.tenantId, tenantId))
      .orderBy(asc(currencies.name));
  },

  async getCurrencyById(id: number, tenantId: number): Promise<Currency | undefined> {
    const result = await db
      .select()
      .from(currencies)
      .where(and(eq(currencies.id, id), eq(currencies.tenantId, tenantId)));
    
    return result[0];
  },

  async getCurrencyByCode(code: string, tenantId: number): Promise<Currency | undefined> {
    const result = await db
      .select()
      .from(currencies)
      .where(and(eq(currencies.code, code), eq(currencies.tenantId, tenantId)));
    
    return result[0];
  },

  async getDefaultCurrency(tenantId: number): Promise<Currency | undefined> {
    const result = await db
      .select()
      .from(currencies)
      .where(and(eq(currencies.isDefault, true), eq(currencies.tenantId, tenantId)));
    
    return result[0];
  },

  async createCurrency(currency: InsertCurrency): Promise<Currency> {
    // If setting as default, clear default flag on other currencies first
    if (currency.isDefault) {
      await db
        .update(currencies)
        .set({ isDefault: false })
        .where(eq(currencies.tenantId, currency.tenantId));
    }
    
    const result = await db
      .insert(currencies)
      .values(currency)
      .returning();
    
    return result[0];
  },

  async updateCurrency(id: number, tenantId: number, data: Partial<InsertCurrency>): Promise<Currency> {
    // If setting as default, clear default flag on other currencies first
    if (data.isDefault) {
      await db
        .update(currencies)
        .set({ isDefault: false })
        .where(eq(currencies.tenantId, tenantId));
    }
    
    const result = await db
      .update(currencies)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(and(eq(currencies.id, id), eq(currencies.tenantId, tenantId)))
      .returning();
    
    return result[0];
  },

  async setDefaultCurrency(id: number, tenantId: number): Promise<Currency> {
    // Clear default flag on all currencies for this tenant
    await db
      .update(currencies)
      .set({ isDefault: false })
      .where(eq(currencies.tenantId, tenantId));
    
    // Set the selected currency as default
    const result = await db
      .update(currencies)
      .set({
        isDefault: true,
        updatedAt: new Date()
      })
      .where(and(eq(currencies.id, id), eq(currencies.tenantId, tenantId)))
      .returning();
    
    return result[0];
  },

  async deleteCurrency(id: number, tenantId: number): Promise<boolean> {
    // Check if it's the default currency
    const currency = await this.getCurrencyById(id, tenantId);
    if (!currency) {
      return false;
    }
    
    if (currency.isDefault) {
      throw new Error("Cannot delete default currency");
    }
    
    // Exchange rates and insights will be automatically deleted via CASCADE
    const result = await db
      .delete(currencies)
      .where(and(eq(currencies.id, id), eq(currencies.tenantId, tenantId)))
      .returning();
    
    return result.length > 0;
  },
  
  // Exchange Rate operations
  async getExchangeRates(currencyId: number, tenantId: number): Promise<ExchangeRate[]> {
    return db
      .select()
      .from(exchangeRates)
      .where(and(
        eq(exchangeRates.currencyId, currencyId),
        eq(exchangeRates.tenantId, tenantId)
      ))
      .orderBy(desc(exchangeRates.validFrom));
  },
  
  async getCurrentExchangeRate(currencyId: number, tenantId: number): Promise<ExchangeRate | undefined> {
    const today = new Date();
    
    const result = await db
      .select()
      .from(exchangeRates)
      .where(and(
        eq(exchangeRates.currencyId, currencyId),
        eq(exchangeRates.tenantId, tenantId),
        sql`${exchangeRates.validFrom} <= ${today}`,
        sql`(${exchangeRates.validTo} IS NULL OR ${exchangeRates.validTo} >= ${today})`
      ))
      .orderBy(desc(exchangeRates.validFrom))
      .limit(1);
    
    return result[0];
  },
  
  async createExchangeRate(rate: InsertExchangeRate): Promise<ExchangeRate> {
    const result = await db
      .insert(exchangeRates)
      .values(rate)
      .returning();
    
    return result[0];
  },
  
  async updateExchangeRate(id: number, tenantId: number, data: Partial<InsertExchangeRate>): Promise<ExchangeRate> {
    const result = await db
      .update(exchangeRates)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(and(
        eq(exchangeRates.id, id),
        eq(exchangeRates.tenantId, tenantId)
      ))
      .returning();
    
    return result[0];
  },
  
  // Currency Insights operations
  async getCurrencyInsights(currencyId: number, tenantId: number): Promise<CurrencyInsight[]> {
    return db
      .select()
      .from(currencyInsights)
      .where(and(
        eq(currencyInsights.currencyId, currencyId),
        eq(currencyInsights.tenantId, tenantId)
      ))
      .orderBy(desc(currencyInsights.createdAt));
  },
  
  async createCurrencyInsight(insight: InsertCurrencyInsight): Promise<CurrencyInsight> {
    const result = await db
      .insert(currencyInsights)
      .values(insight)
      .returning();
    
    return result[0];
  }
};