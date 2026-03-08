import OpenAI from "openai";
import { AIService } from './aiService';

// Initialize AIService
const aiService = new AIService();

// Check if API key is available
const isApiKeyAvailable = () => !!process.env.OPENAI_API_KEY;

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
// Initialize OpenAI client if key is available
let openai: OpenAI | null = null;
if (isApiKeyAvailable()) {
  openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY 
  });
}

// Validate the API key format
function isValidOpenAIKey(key: string | undefined): boolean {
  if (!key) return false;
  // Check for correct API key format
  return key.startsWith('sk-') && key.length > 20;
}

interface InventoryItem {
  id: number;
  name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  unitType: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  lastOrderDate: Date | null;
  lastOrderQuantity: number;
  averageDailyUsage: number;
  leadTimeInDays: number;
  unitCost: number;
  salesVelocity: 'high' | 'medium' | 'low';
}

interface InventoryOptimizationRecommendation {
  itemId: number;
  itemName: string;
  recommendationType: 'increase_stock' | 'decrease_stock' | 'reorder' | 'discontinue' | 'no_action';
  recommendedAction: string;
  reasoningDetail: string;
  potentialSavings: number | null;
  confidenceScore: number;
  suggestedReorderQuantity?: number;
  dataPoints: string[];
}

/**
 * Generates AI-powered recommendations for inventory optimization
 */
export async function getInventoryOptimizationRecommendations(
  tenantId: number,
  categoryFilter?: string,
  limit: number = 5
): Promise<InventoryOptimizationRecommendation[]> {
  try {
    // Get inventory items
    const inventoryItems = await getInventoryItems(tenantId, categoryFilter);
    
    if (inventoryItems.length === 0) {
      return [];
    }
    
    // Select a subset of items to analyze based on the limit
    const itemsToAnalyze = inventoryItems.slice(0, limit);
    
    // Format inventory data for the AI model
    const inventoryData = itemsToAnalyze.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      subcategory: item.subcategory || 'N/A',
      currentStock: item.currentStock,
      minStock: item.minStock,
      maxStock: item.maxStock,
      lastOrderDate: item.lastOrderDate ? item.lastOrderDate.toISOString().split('T')[0] : 'N/A',
      lastOrderQuantity: item.lastOrderQuantity,
      averageDailyUsage: item.averageDailyUsage,
      leadTimeInDays: item.leadTimeInDays,
      unitCost: item.unitCost,
      salesVelocity: item.salesVelocity
    }));
    
    // If OpenAI client is not available, use mock service
    if (!openai) {
      console.log("OpenAI API key not available, using mock inventory recommendations");
      return await aiService.generateInventoryRecommendations(inventoryData, limit);
    }
    
    // Validate OpenAI API key
    if (!isValidOpenAIKey(process.env.OPENAI_API_KEY)) {
      console.log("Invalid OpenAI API key format, using mock inventory recommendations");
      return await aiService.generateInventoryRecommendations(inventoryData, limit);
    }
    
    // Create a prompt for the AI model
    const prompt = `
      As an inventory optimization expert, analyze these garment manufacturing inventory items:
      
      ${JSON.stringify(inventoryData, null, 2)}
      
      For each item, provide an optimization recommendation in the following JSON format:
      [
        {
          "itemId": number,
          "itemName": string,
          "recommendationType": "increase_stock" | "decrease_stock" | "reorder" | "discontinue" | "no_action",
          "recommendedAction": string (concise action statement),
          "reasoningDetail": string (detailed explanation),
          "potentialSavings": number | null,
          "confidenceScore": number (between 0 and 1),
          "suggestedReorderQuantity": number (only include if recommend reordering),
          "dataPoints": string[] (key data points that informed this decision)
        }
      ]
      
      Focus on:
      1. Overstocking issues (current stock > max stock)
      2. Understocking risks (current stock < min stock)
      3. Reorder timing based on lead time and usage rate
      4. Potential cost savings
      5. Slow-moving inventory that might need to be reduced
      
      Provide actionable, specific recommendations with clear reasoning.
    `;
    
    try {
      // Call the OpenAI API
      const response = await openai!.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are an AI inventory optimization assistant specialized in garment manufacturing." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.5,
        max_tokens: 2000,
      });
      
      // Parse the response
      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("No content in AI response");
      }
      
      const recommendations = JSON.parse(content);
      
      // Ensure it's in the expected format
      if (!Array.isArray(recommendations)) {
        throw new Error("AI response is not in the expected format");
      }
      
      return recommendations;
    } catch (openaiError) {
      console.error('OpenAI API error:', openaiError);
      
      // Use our mock AI service if OpenAI call fails
      console.log("OpenAI API call failed, using mock inventory recommendations");
      return await aiService.generateInventoryRecommendations(inventoryData, limit);
    }
  } catch (error) {
    console.error('Error generating inventory recommendations:', error);
    throw error;
  }
}

/**
 * Gets inventory items for the tenant
 * Note: This is a mock function for demonstration purposes.
 * In a real implementation, this would query the database.
 */
async function getInventoryItems(tenantId: number, categoryFilter?: string): Promise<InventoryItem[]> {
  // This is a mock function that returns sample inventory items
  // In a real implementation, this would query your database
  
  const items: InventoryItem[] = [
    {
      id: 1,
      name: "Cotton T-Shirt Fabric",
      description: "Premium cotton jersey fabric for t-shirts",
      category: "Fabrics",
      subcategory: "Cotton",
      unitType: "Yard",
      currentStock: 1200,
      minStock: 500,
      maxStock: 2000,
      lastOrderDate: new Date('2025-04-10'),
      lastOrderQuantity: 1000,
      averageDailyUsage: 50,
      leadTimeInDays: 14,
      unitCost: 2.50,
      salesVelocity: 'high'
    },
    {
      id: 2,
      name: "Polyester Blend",
      description: "Polyester-cotton blend for athletic wear",
      category: "Fabrics",
      subcategory: "Synthetic",
      unitType: "Yard",
      currentStock: 350,
      minStock: 400,
      maxStock: 1000,
      lastOrderDate: new Date('2025-04-20'),
      lastOrderQuantity: 800,
      averageDailyUsage: 40,
      leadTimeInDays: 10,
      unitCost: 3.25,
      salesVelocity: 'medium'
    },
    {
      id: 3,
      name: "Metal Buttons",
      description: "Durable metal buttons for jackets",
      category: "Accessories",
      subcategory: "Buttons",
      unitType: "Piece",
      currentStock: 5000,
      minStock: 1000,
      maxStock: 10000,
      lastOrderDate: new Date('2025-03-15'),
      lastOrderQuantity: 5000,
      averageDailyUsage: 200,
      leadTimeInDays: 7,
      unitCost: 0.10,
      salesVelocity: 'medium'
    },
    {
      id: 4,
      name: "Denim Fabric",
      description: "Heavy-duty denim for jeans",
      category: "Fabrics",
      subcategory: "Denim",
      unitType: "Yard",
      currentStock: 3000,
      minStock: 1000,
      maxStock: 4000,
      lastOrderDate: new Date('2025-02-28'),
      lastOrderQuantity: 2000,
      averageDailyUsage: 120,
      leadTimeInDays: 21,
      unitCost: 4.75,
      salesVelocity: 'high'
    },
    {
      id: 5,
      name: "Plastic Zippers",
      description: "Standard plastic zippers for casual wear",
      category: "Accessories",
      subcategory: "Zippers",
      unitType: "Piece",
      currentStock: 1500,
      minStock: 2000,
      maxStock: 5000,
      lastOrderDate: new Date('2025-04-05'),
      lastOrderQuantity: 3000,
      averageDailyUsage: 250,
      leadTimeInDays: 5,
      unitCost: 0.15,
      salesVelocity: 'high'
    },
    {
      id: 6,
      name: "Silk Fabric",
      description: "Premium silk for high-end blouses",
      category: "Fabrics",
      subcategory: "Silk",
      unitType: "Yard",
      currentStock: 200,
      minStock: 100,
      maxStock: 300,
      lastOrderDate: new Date('2025-03-25'),
      lastOrderQuantity: 150,
      averageDailyUsage: 5,
      leadTimeInDays: 30,
      unitCost: 12.00,
      salesVelocity: 'low'
    },
    {
      id: 7,
      name: "Wool Blend",
      description: "Wool-polyester blend for winter wear",
      category: "Fabrics",
      subcategory: "Wool",
      unitType: "Yard",
      currentStock: 800,
      minStock: 300,
      maxStock: 1000,
      lastOrderDate: new Date('2025-01-15'),
      lastOrderQuantity: 500,
      averageDailyUsage: 10,
      leadTimeInDays: 25,
      unitCost: 8.50,
      salesVelocity: 'low'
    },
    {
      id: 8,
      name: "Wooden Buttons",
      description: "Natural wooden buttons for eco-friendly lines",
      category: "Accessories",
      subcategory: "Buttons",
      unitType: "Piece",
      currentStock: 2500,
      minStock: 1000,
      maxStock: 3000,
      lastOrderDate: new Date('2025-03-10'),
      lastOrderQuantity: 2000,
      averageDailyUsage: 100,
      leadTimeInDays: 14,
      unitCost: 0.25,
      salesVelocity: 'medium'
    }
  ];
  
  // Apply category filter if provided
  if (categoryFilter) {
    return items.filter(item => 
      item.category.toLowerCase() === categoryFilter.toLowerCase() || 
      (item.subcategory && item.subcategory.toLowerCase() === categoryFilter.toLowerCase())
    );
  }
  
  return items;
}