import { currencyStorage } from "../database/currencyStorage";
import type { Currency, ExchangeRate, CurrencyInsight, InsertCurrency, InsertExchangeRate, InsertCurrencyInsight } from "@shared/schema";

export const currencyService = {
  async getAllCurrencies(tenantId: number, activeOnly: boolean = false): Promise<Currency[]> {
    return currencyStorage.getAllCurrencies(tenantId, activeOnly);
  },

  async getCurrencyById(id: number, tenantId: number): Promise<Currency | undefined> {
    return currencyStorage.getCurrencyById(id, tenantId);
  },

  async getCurrencyByCode(code: string, tenantId: number): Promise<Currency | undefined> {
    return currencyStorage.getCurrencyByCode(code, tenantId);
  },

  async getDefaultCurrency(tenantId: number): Promise<Currency | undefined> {
    return currencyStorage.getDefaultCurrency(tenantId);
  },

  async createCurrency(currency: InsertCurrency): Promise<Currency> {
    // Ensure a default currency is set if this is the first currency
    const existingCurrencies = await currencyStorage.getAllCurrencies(currency.tenantId);
    if (existingCurrencies.length === 0) {
      currency.isDefault = true;
    }
    
    return currencyStorage.createCurrency(currency);
  },

  async updateCurrency(id: number, tenantId: number, data: Partial<InsertCurrency>): Promise<Currency> {
    return currencyStorage.updateCurrency(id, tenantId, data);
  },

  async setDefaultCurrency(id: number, tenantId: number): Promise<Currency> {
    return currencyStorage.setDefaultCurrency(id, tenantId);
  },

  async deleteCurrency(id: number, tenantId: number): Promise<boolean> {
    return currencyStorage.deleteCurrency(id, tenantId);
  },
  
  // Exchange Rate operations
  async getExchangeRates(currencyId: number, tenantId: number): Promise<ExchangeRate[]> {
    return currencyStorage.getExchangeRates(currencyId, tenantId);
  },
  
  async getCurrentExchangeRate(currencyId: number, tenantId: number): Promise<ExchangeRate | undefined> {
    return currencyStorage.getCurrentExchangeRate(currencyId, tenantId);
  },
  
  async createExchangeRate(rate: InsertExchangeRate): Promise<ExchangeRate> {
    return currencyStorage.createExchangeRate(rate);
  },
  
  async updateExchangeRate(id: number, tenantId: number, data: Partial<InsertExchangeRate>): Promise<ExchangeRate> {
    return currencyStorage.updateExchangeRate(id, tenantId, data);
  },
  
  // Currency Insights operations
  async getCurrencyInsights(currencyId: number, tenantId: number): Promise<CurrencyInsight[]> {
    return currencyStorage.getCurrencyInsights(currencyId, tenantId);
  },
  
  async generateMarketInsight(currencyId: number, tenantId: number): Promise<CurrencyInsight> {
    // Get the currency details
    const currency = await currencyStorage.getCurrencyById(currencyId, tenantId);
    if (!currency) {
      throw new Error("Currency not found");
    }
    
    // Simulate an AI-generated insight
    const insights = [
      `The ${currency.name} is currently showing stability in the market with minor fluctuations expected.`,
      `Recent economic indicators suggest a slight strengthening of the ${currency.name} over the next quarter.`,
      `Global market trends may put pressure on the ${currency.name} in the coming months, monitoring recommended.`,
      `Political developments in key economies could impact the ${currency.name} exchange rates, prepare for potential volatility.`,
      `The ${currency.name} has shown resilience against major currencies despite economic challenges.`
    ];
    
    const randomInsight = insights[Math.floor(Math.random() * insights.length)];
    const confidence = (Math.floor(Math.random() * 30) + 70) / 100; // Random confidence between 0.70 and 0.99
    
    const insight: InsertCurrencyInsight = {
      currencyId,
      tenantId,
      insightType: "market_analysis",
      title: `${currency.name} Market Analysis`,
      content: randomInsight,
      confidence: confidence.toString()
    };
    
    return currencyStorage.createCurrencyInsight(insight);
  },
  
  async generateExchangeRateInsight(currencyId: number, tenantId: number): Promise<CurrencyInsight> {
    // Get the currency details
    const currency = await currencyStorage.getCurrencyById(currencyId, tenantId);
    if (!currency) {
      throw new Error("Currency not found");
    }
    
    // Get exchange rate history
    const rates = await currencyStorage.getExchangeRates(currencyId, tenantId);
    
    // Simulate an AI-generated exchange rate insight
    const insights = [
      `${currency.name} exchange rates have been relatively stable over the past period. Consider maintaining current hedging strategy.`,
      `Volatility in ${currency.name} exchange rates has increased. Consider reviewing your currency risk management strategy.`,
      `${currency.name} is trending downward against your base currency. This may impact import costs and pricing strategy.`,
      `Favorable exchange rate movements for ${currency.name}. Consider adjusting pricing or procurement timing to maximize benefits.`,
      `${currency.name} exchange rates are following seasonal patterns. Plan financial operations accordingly.`
    ];
    
    const randomInsight = insights[Math.floor(Math.random() * insights.length)];
    const confidence = (Math.floor(Math.random() * 25) + 75) / 100; // Random confidence between 0.75 and 0.99
    
    const insight: InsertCurrencyInsight = {
      currencyId,
      tenantId,
      insightType: "exchange_rate_forecast",
      title: `${currency.name} Exchange Rate Forecast`,
      content: randomInsight,
      confidence: confidence.toString()
    };
    
    return currencyStorage.createCurrencyInsight(insight);
  }
};