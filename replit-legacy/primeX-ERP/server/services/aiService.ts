import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const DEFAULT_OPENAI_MODEL = 'gpt-4o';

export class AIService {
  // Analyze inventory discrepancies
  async analyzeInventoryDiscrepancies(context: any): Promise<any> {
    try {
      // Format the context for better prompting
      const formattedDiscrepancies = context.significantDiscrepancies
        .map((item: any, index: any) => {
          return `${index + 1}. ${item.itemName} (${item.itemCode})
             - System quantity: ${item.systemQuantity}
             - Counted quantity: ${item.quantity}
             - Discrepancy: ${item.discrepancy > 0 ? '+' : ''}${item.discrepancy} (${item.discrepancyPercent.toFixed(2)}%)
             - Value impact: $${Math.abs(item.discrepancy * item.cost).toFixed(2)}`;
        })
        .join('\n');

      console.log('Generating inventory discrepancy analysis using OpenAI API');
      try {
        const response = await openai.chat.completions.create({
          model: DEFAULT_OPENAI_MODEL,
          messages: [
            {
              role: 'system',
              content: `You are an expert inventory management system AI assistant. You analyze physical inventory count discrepancies and provide insights and recommendations. Be concise but informative. Focus on:
              1. Potential causes for discrepancies based on patterns
              2. Specific recommendations for improving inventory accuracy
              3. Risk assessment and financial impact
              Structure your response with clear sections for Summary, Analysis, Recommendations, and Next Steps.`
            },
            {
              role: 'user',
              content: `Analyze these inventory count discrepancies from warehouse "${context.warehouseName}" (Count ID: ${context.countId}):
              
Count date: ${new Date(context.countDate).toLocaleDateString()}
Count method: ${context.countMethod}
Total items counted: ${context.totalItems}
Items with significant discrepancies: ${context.itemsWithDiscrepancies}
Total count value: $${context.totalCountValue.toFixed(2)}
Total discrepancy value: $${context.totalDiscrepancyValue > 0 ? '+' : ''}${context.totalDiscrepancyValue.toFixed(2)} (${context.discrepancyPercentage.toFixed(2)}%)

Significant discrepancies:
${formattedDiscrepancies}

Provide a professional analysis with actionable insights.`
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 1000
        });

        return JSON.parse(response.choices[0].message.content || '{}');
      } catch (error) {
        console.error('Error generating inventory discrepancy analysis with OpenAI:', error);
      }

      // Fall back to mock analysis if AI service fails
      console.log('AI API call failed, using mock inventory discrepancy analysis');
      return this.generateMockInventoryAnalysis(context);
    } catch (error) {
      console.error('Error in inventory discrepancy analysis:', error);
      return this.generateMockInventoryAnalysis(context);
    }
  }

  // Generate physical inventory count recommendations
  async generateInventoryCountRecommendations(context: any): Promise<any> {
    try {
      console.log('Generating inventory count recommendations using OpenAI API');
      try {
        const response = await openai.chat.completions.create({
          model: DEFAULT_OPENAI_MODEL,
          messages: [
            {
              role: 'system',
              content: `You are an expert inventory management system AI assistant. You provide recommendations for physical inventory counts based on warehouse data, item values, and previous count history. Be concise but informative.`
            },
            {
              role: 'user',
              content: `Based on this warehouse inventory data, provide physical count recommendations:
              
${JSON.stringify(context, null, 2)}

Provide a clear, actionable recommendation for which warehouses to prioritize for physical counts and why. Format as JSON with priorityWarehouses (array), reasoning (string), and recommendations (array of specific actionable steps).`
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 1000
        });

        return JSON.parse(response.choices[0].message.content || '{}');
      } catch (error) {
        console.error('Error generating inventory count recommendations with OpenAI:', error);
      }

      // Fall back to mock recommendations if AI service fails
      console.log('AI API call failed, using mock inventory count recommendations');
      return this.generateMockCountRecommendations(context);
    } catch (error) {
      console.error('Error in inventory count recommendations:', error);
      return this.generateMockCountRecommendations(context);
    }
  }

  // Generate mock inventory analysis (fallback)
  private generateMockInventoryAnalysis(context: any): any {
    // Calculate if it's overall positive or negative discrepancy
    const isOverallPositive = context.totalDiscrepancyValue > 0;
    const absoluteDiscrepancyPercentage = Math.abs(context.discrepancyPercentage);
    
    let severityLevel = 'low';
    if (absoluteDiscrepancyPercentage > 10) {
      severityLevel = 'high';
    } else if (absoluteDiscrepancyPercentage > 5) {
      severityLevel = 'medium';
    }

    return {
      "summary": `The physical inventory count for warehouse "${context.warehouseName}" shows a ${isOverallPositive ? 'positive' : 'negative'} discrepancy of $${Math.abs(context.totalDiscrepancyValue).toFixed(2)} (${absoluteDiscrepancyPercentage.toFixed(2)}% of total inventory value). This represents a ${severityLevel} severity level discrepancy that requires ${severityLevel === 'high' ? 'immediate' : severityLevel === 'medium' ? 'prompt' : 'routine'} attention.`,
      
      "analysis": [
        `${context.itemsWithDiscrepancies} out of ${context.totalItems} items (${((context.itemsWithDiscrepancies / context.totalItems) * 100).toFixed(1)}%) show significant discrepancies.`,
        `The count was performed using the ${context.countMethod} method, which ${context.countMethod === 'manual' ? 'may introduce human error' : 'typically provides better accuracy than manual counting'}.`,
        `${isOverallPositive ? 'Positive discrepancies (more items found than recorded)' : 'Negative discrepancies (fewer items found than recorded)'} dominate, suggesting potential issues with ${isOverallPositive ? 'receiving process documentation or returns processing' : 'inventory theft, damage recording, or shipping documentation'}.`
      ],
      
      "recommendations": [
        "Verify receipt documentation for the past 30 days to identify potential recording errors",
        "Implement cycle counting for high-value items showing discrepancies",
        "Review inventory movement procedures, especially for items with large discrepancies",
        `${context.countMethod === 'manual' ? 'Consider implementing barcode scanning for future counts to reduce human error' : 'Ensure proper training on scanning equipment for all inventory personnel'}`
      ],
      
      "nextSteps": [
        "Investigate top 5 items with largest value discrepancies",
        "Schedule follow-up count for affected areas within 14 days",
        "Document findings and update inventory policies as needed",
        "Conduct staff training on proper inventory procedures"
      ]
    };
  }

  // Generate mock count recommendations (fallback)
  private generateMockCountRecommendations(context: any): any {
    // Sort warehouses by priority
    const sortedWarehouses = [...context].sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return (priorityOrder as any)[a.priority] - (priorityOrder as any)[b.priority];
    });

    // Get high priority warehouses
    const highPriorityWarehouses = sortedWarehouses
      .filter(w => w.priority === 'high')
      .map(w => w.warehouseName);

    return {
      "priorityWarehouses": highPriorityWarehouses.length > 0 ? highPriorityWarehouses : [sortedWarehouses[0]?.warehouseName],
      
      "reasoning": `Based on ${highPriorityWarehouses.length > 0 ? 'high priority classification' : 'analysis of count history and inventory value'}, these warehouses should be counted first to minimize financial risk and ensure inventory accuracy.`,
      
      "recommendations": [
        "Schedule physical counts for high-priority warehouses within the next 14 days",
        "Implement cycle counting for medium-priority warehouses on a monthly basis",
        "Ensure adequate staffing and resources for upcoming counts",
        "Prepare pre-count checklists for warehouse staff to minimize disruptions",
        "Consider freezing inventory movements during count periods for better accuracy"
      ]
    };
  }

  // Generate customer insights
  async generateCustomerInsights(customer: any): Promise<any> {
    try {
      console.log('Generating customer insights using OpenAI API');
      try {
        const response = await openai.chat.completions.create({
          model: DEFAULT_OPENAI_MODEL,
          messages: [
            {
              role: 'system',
              content: 'You are an expert sales and customer relationship consultant. Analyze customer data and provide actionable insights to help improve engagement, identify opportunities, and optimize the customer relationship.'
            },
            {
              role: 'user',
              content: `Analyze this customer data and provide business insights:
              
${JSON.stringify(customer, null, 2)}

Provide specific, actionable insights for this customer. Format as JSON with sections for summary, opportunityAnalysis, riskFactors, and recommendations.`
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 1000
        });

        return JSON.parse(response.choices[0].message.content || '{}');
      } catch (error) {
        console.error('Error generating customer insights with OpenAI:', error);
      }

      console.log('Using mock customer insights');
      return {
        "summary": "This is a high-value customer with consistent order history, primarily focused on premium fabrics for seasonal collections.",
        "opportunityAnalysis": [
          "Customer typically increases orders by 15-20% during Q3 for holiday season production",
          "Has shown interest in eco-friendly materials but has not placed significant orders in this category",
          "Previous cross-sell attempts for accessories were successful"
        ],
        "riskFactors": [
          "Last order was delayed by 2 weeks, causing customer frustration",
          "Increasing competition from supplier X offering similar products at 5-7% lower pricing",
          "Recent communication frequency has decreased compared to historical patterns"
        ],
        "recommendations": [
          "Proactively reach out with Q3 collection planning information in next 2 weeks",
          "Present eco-friendly fabric alternatives with comparable pricing to current orders",
          "Schedule quarterly review meeting to discuss recent delivery issues and resolution",
          "Consider 5% volume discount on orders over 5000 yards to counter competitive pressure"
        ]
      };
    } catch (error) {
      console.error('Error in customer insights:', error);
      return {
        "summary": "Basic analysis of customer data available.",
        "opportunityAnalysis": ["Regular ordering pattern detected"],
        "riskFactors": ["Unable to perform detailed risk analysis"],
        "recommendations": ["Gather more detailed customer data for comprehensive analysis"]
      };
    }
  }

  // Generate business intelligence
  async generateBusinessIntelligence(customers: any[]): Promise<any> {
    try {
      console.log('Generating business intelligence using OpenAI API');
      try {
        const response = await openai.chat.completions.create({
          model: DEFAULT_OPENAI_MODEL,
          messages: [
            {
              role: 'system',
              content: 'You are an expert business intelligence consultant for a garment manufacturing company. Analyze customer data and provide actionable insights on market trends, customer segmentation, and business optimization opportunities.'
            },
            {
              role: 'user',
              content: `Analyze this customer dataset and provide business intelligence insights:
              
${JSON.stringify(customers.slice(0, 10), null, 2)}

Provide high-level business intelligence insights based on the customer data. Format as JSON with sections for summary, customerSegmentation, marketTrends, and strategicRecommendations.`
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 1000
        });

        return JSON.parse(response.choices[0].message.content || '{}');
      } catch (error) {
        console.error('Error generating business intelligence with OpenAI:', error);
      }

      console.log('Using mock business intelligence');
      return {
        "summary": "Analysis of customer data reveals four distinct segments with varying profitability and growth potential. Overall customer base is growing at 7% annually with shifting preferences toward sustainable materials.",
        "customerSegmentation": [
          {
            "segment": "Enterprise Accounts",
            "description": "Large volume buyers with consistent ordering patterns",
            "percentage": "35%",
            "revenueContribution": "58%",
            "growthRate": "4.2%"
          },
          {
            "segment": "Growth Innovators",
            "description": "Mid-sized customers with rapid growth and diverse product needs",
            "percentage": "22%",
            "revenueContribution": "17%",
            "growthRate": "18.7%"
          },
          {
            "segment": "Value Seekers",
            "description": "Price-sensitive customers with inconsistent ordering",
            "percentage": "28%",
            "revenueContribution": "15%",
            "growthRate": "2.1%"
          },
          {
            "segment": "Specialty Boutique",
            "description": "Small volume buyers of premium products",
            "percentage": "15%",
            "revenueContribution": "10%",
            "growthRate": "9.3%"
          }
        ],
        "marketTrends": [
          "Increasing demand for sustainable and eco-certified materials (+24% YoY)",
          "Growing preference for domestic production due to supply chain concerns",
          "Seasonal ordering patterns becoming less distinct with fast-fashion influence",
          "Rising customer expectations for digital sampling and shorter lead times"
        ],
        "strategicRecommendations": [
          "Develop tiered service model based on customer segmentation to optimize resource allocation",
          "Expand sustainable material offerings to capitalize on growing market trend",
          "Implement key account management structure for Enterprise and Growth segments",
          "Develop streamlined ordering process for Value Seekers to improve margin",
          "Invest in digital sampling capabilities to meet evolving customer expectations"
        ]
      };
    } catch (error) {
      console.error('Error in business intelligence:', error);
      return {
        "summary": "Basic business intelligence available with limited data.",
        "customerSegmentation": [
          {
            "segment": "General Customers",
            "description": "All customers in database",
            "percentage": "100%"
          }
        ],
        "marketTrends": ["Insufficient data for trend analysis"],
        "strategicRecommendations": ["Gather more detailed customer data for comprehensive analysis"]
      };
    }
  }
  
  // Generate inventory optimization recommendations
  // Generate quotation insights
  async generateQuotationInsights(quotation: any): Promise<any> {
    try {
      console.log('Generating quotation insights using OpenAI API');
      try {
        const response = await openai.chat.completions.create({
          model: DEFAULT_OPENAI_MODEL,
          messages: [
            {
              role: 'system',
              content: 'You are an expert textile and garment manufacturing consultant. Analyze quotation data and provide actionable insights to help improve profit margins, identify risks, and optimize production.'
            },
            {
              role: 'user',
              content: `Analyze this quotation and provide business insights:
              
${JSON.stringify(quotation, null, 2)}

Provide specific, actionable insights for this quotation. Format as JSON with sections for summary, costAnalysis, riskFactors, and recommendations.`
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 1000
        });

        return JSON.parse(response.choices[0].message.content || '{}');
      } catch (error) {
        console.error('Error generating quotation insights with OpenAI:', error);
      }

      // Fall back to mock insights if AI service fails
      console.log('AI API call failed, using mock quotation insights');
      return {
        "summary": "This quotation for fabric materials shows standard pricing but with tight margins. Several cost optimization opportunities exist.",
        "costAnalysis": [
          "Material costs represent 65% of total costs, which is slightly above industry average of 60%",
          "Labor costs are within normal range, but could be optimized with process improvements",
          "Overhead allocation appears higher than necessary for this order type"
        ],
        "riskFactors": [
          "Delivery timeline is aggressive considering current supply chain conditions",
          "Price sensitivity is high based on competitive market conditions",
          "Material price volatility may impact margins if ordering is delayed"
        ],
        "recommendations": [
          "Consider alternative material sourcing to reduce primary cost driver",
          "Negotiate volume discount with supplier based on upcoming production schedule",
          "Review overhead allocation methodology for small-batch orders",
          "Consider slight increase in delivery timeline to reduce expedited processing costs"
        ]
      };
    } catch (error) {
      console.error('Error in quotation insights:', error);
      return {
        "summary": "Basic analysis of quotation available with limited data.",
        "costAnalysis": ["Standard cost structure detected"],
        "riskFactors": ["Unable to perform detailed risk analysis"],
        "recommendations": ["Gather more detailed quotation data for comprehensive analysis"]
      };
    }
  }

  async generateInventoryRecommendations(context: any): Promise<any> {
    try {
      console.log('Generating real-time inventory recommendations using OpenAI API');
      try {
        const response = await openai.chat.completions.create({
          model: DEFAULT_OPENAI_MODEL,
          messages: [
            {
              role: 'system',
              content: 'You are an expert inventory optimization AI assistant for a garment manufacturing company. Analyze inventory data and provide actionable recommendations to optimize stock levels, reduce costs, and improve efficiency.'
            },
            {
              role: 'user',
              content: `Analyze this inventory data and provide optimization recommendations:
              
${JSON.stringify(context, null, 2)}

Provide specific, actionable recommendations for inventory optimization. Format as JSON with sections for summary, itemRecommendations (array), and generalRecommendations (array).`
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 1000
        });

        return JSON.parse(response.choices[0].message.content || '{}');
      } catch (error) {
        console.error('Error generating inventory recommendations with OpenAI:', error);
      }

      // Fall back to mock recommendations if AI service fails
      console.log('AI API call failed, using mock inventory recommendations');
      return {
        "summary": "Analysis indicates opportunities to optimize inventory levels across multiple categories. Priority actions focus on reducing excess stock of slow-moving items while ensuring adequate levels of high-demand materials.",
        
        "itemRecommendations": [
          {
            "itemId": 1,
            "itemName": "Cotton Fabric - Navy Blue",
            "currentStock": 420,
            "recommendation": "Reduce stock by 15%. Current levels exceed forecasted demand by 32%.",
            "action": "Postpone next order by 2 weeks or reduce next order quantity by 30%."
          },
          {
            "itemId": 3,
            "itemName": "Denim Fabric - Dark Wash",
            "currentStock": 150,
            "recommendation": "Increase stock by 25%. Current levels are 46% below forecasted demand.",
            "action": "Place expedited order for 130 units to prevent production delays."
          },
          {
            "itemId": 5,
            "itemName": "YKK Zippers - 6 inch Black",
            "currentStock": 2200,
            "recommendation": "Implement FIFO inventory management. Oldest stock is approaching 6-month threshold.",
            "action": "Use oldest stock first and adjust reorder point from 1500 to 1200 units."
          }
        ],
        
        "generalRecommendations": [
          "Implement ABC inventory classification to prioritize management of high-value items",
          "Establish vendor-managed inventory agreements for class C items to reduce administrative costs",
          "Review safety stock levels for seasonal items to align with production schedule",
          "Consolidate orders of similar materials to qualify for bulk discounts",
          "Set up automated reorder alerts at optimized reorder points"
        ]
      };
    } catch (error) {
      console.error('Error generating inventory recommendations:', error);
      return {
        "summary": "Basic inventory optimization opportunities identified based on available data.",
        "itemRecommendations": [],
        "generalRecommendations": [
          "Review inventory levels regularly",
          "Consider implementing cycle counting",
          "Optimize order quantities based on usage patterns",
          "Identify and address slow-moving inventory"
        ]
      };
    }
  }
}