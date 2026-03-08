import { db } from "../db";
import { orders, inquiries, quotations, sampleDevelopments } from "@shared/schema";
import { count, eq } from "drizzle-orm";

/**
 * Generate a unique order ID
 * @returns Unique ID string in format ORD-XXXXX
 */
export async function generateOrderId(): Promise<string> {
  try {
    // Count all existing orders and add 1 for the new one
    const [result] = await db.select({ count: count() }).from(orders);
    const nextId = (result?.count || 0) + 1;
    return `ORD-${nextId.toString().padStart(5, '0')}`;
  } catch (error) {
    console.error("Error generating order ID:", error);
    // Fallback to timestamp-based ID if query fails
    return `ORD-${Date.now().toString().slice(-5)}`;
  }
}

/**
 * Generate a unique quotation ID
 * @returns Unique ID string in format QUO-XXXXX
 */
export async function generateQuotationId(): Promise<string> {
  try {
    // Count all existing quotations and add 1 for the new one
    const [result] = await db.select({ count: count() }).from(quotations);
    const nextId = (result?.count || 0) + 1;
    return `QUO-${nextId.toString().padStart(5, '0')}`;
  } catch (error) {
    console.error("Error generating quotation ID:", error);
    // Fallback to timestamp-based ID if query fails
    return `QUO-${Date.now().toString().slice(-5)}`;
  }
}

/**
 * Generate a unique inquiry ID
 * @returns Unique ID string in format INQ-XXXXX
 */
export async function generateInquiryId(): Promise<string> {
  try {
    // Count all existing inquiries and add 1 for the new one
    const [result] = await db.select({ count: count() }).from(inquiries);
    const nextId = (result?.count || 0) + 1;
    return `INQ-${nextId.toString().padStart(5, '0')}`;
  } catch (error) {
    console.error("Error generating inquiry ID:", error);
    // Fallback to timestamp-based ID if query fails
    return `INQ-${Date.now().toString().slice(-5)}`;
  }
}

/**
 * Generate a unique sample ID
 * @returns Unique ID string in format SAM-XXXXX
 */
export async function generateSampleId(): Promise<string> {
  try {
    // Count all existing samples and add 1 for the new one
    const [result] = await db.select({ count: count() }).from(sampleDevelopments);
    const nextId = (result?.count || 0) + 1;
    return `SAM-${nextId.toString().padStart(5, '0')}`;
  } catch (error) {
    console.error("Error generating sample ID:", error);
    // Fallback to timestamp-based ID if query fails
    return `SAM-${Date.now().toString().slice(-5)}`;
  }
}