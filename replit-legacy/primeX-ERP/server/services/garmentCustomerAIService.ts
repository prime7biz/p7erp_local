import { db, pool, executeQuery } from '../db';
import { getGeminiAIResponse as getAIResponse } from './geminiAIUtilities';

// Generate AI insights for a specific customer
export async function generateCustomerInsights(customer: any) {
  try {
    const customerId = Number(customer.id);
    if (isNaN(customerId)) {
      throw new Error('Invalid customer ID');
    }
    
    // First, get real-world information about the customer if website is available
    let webResearch = {};
    if (customer.website) {
      try {
        const systemPrompt = `You are an AI research assistant specialized in the garment industry. Research and gather accurate, detailed information about the following garment industry company. Focus on their business model, product offerings, sustainability practices, market position, and any recent news or developments.`;
        
        const userPrompt = `Please research "${customer.customerName}" based on their website ${customer.website} and provide detailed, factual information about the company. Include information about their product types, market segments, sustainability initiatives, and business model in the garment industry.`;
        
        webResearch = await getAIResponse(systemPrompt, userPrompt);
        console.log("Web research completed for customer:", customer.customerName);
      } catch (error) {
        console.error("Error researching customer website:", error);
        webResearch = { researchError: "Could not retrieve website information" };
      }
    }
    
    // Try to get customer orders, but don't fail if the table doesn't exist
    let orders = [];
    try {
      orders = await executeQuery(async () => {
        // Use prepared statement to avoid SQL injection
        const result = await pool.query(
          'SELECT * FROM commercial_orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 10',
          [customerId]
        );
        return result.rows;
      });
    } catch (error) {
      console.log("Note: commercial_orders table may not exist yet:", error.message);
    }
    
    // Try to get customer inquiries, but don't fail if the table doesn't exist
    let inquiries = [];
    try {
      inquiries = await executeQuery(async () => {
        // Use prepared statement to avoid SQL injection
        const result = await pool.query(
          'SELECT * FROM inquiries WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 10',
          [customerId]
        );
        return result.rows;
      });
    } catch (error) {
      console.log("Note: inquiries table may not exist yet:", error.message);
    }
    
    // Create the context for the AI
    const context = {
      customer,
      orders,
      inquiries,
      webResearch,
      customerName: customer.customerName || 'Unknown Customer',
      customerCountry: customer.country || 'Unknown',
      customerWebsite: customer.website || 'Unknown',
      customerIndustry: customer.industrySegment || 'Garments',
      totalOrders: orders.length,
      totalInquiries: inquiries.length,
      recentActivity: orders.slice(0, 3)
    };

    const systemPrompt = `You are an AI assistant specialized in garment manufacturing business intelligence for a Bangladesh-based production facility. Analyze the provided customer data and generate comprehensive, detailed actionable insights.
    
    Analyze these specific aspects about the customer:
    1. Detailed order pattern analysis and seasonal preferences
    2. Financial strength assessment based on order volume and consistency
    3. Risk factors specific to this customer
    4. Market positioning and competitive advantage
    5. Comprehensive forecasting for next 12 months
    6. Marketing strategy recommendations
    7. Any potential compliance or ethical concerns
    8. Decision-making factors that influence this customer
    9. Customer confidence rating with detailed explanation
    
    Format your response as a detailed JSON object with these keys:
      - customerProfile: Brief summary of this specific customer
      - insights: Array of at least 5 insight objects with title, description, type (opportunity, risk, trend, warning, strength), confidence (0-1), and impact (high, medium, low)
      - marketingRecommendations: Array of specific marketing approaches for this client
      - financialAssessment: Object with stability rating (1-10), payment reliability (1-10), and detailed explanation
      - riskFactors: Array of specific risk factors with likelihood (1-10) and mitigation strategies
      - forecastedGrowth: Projected growth over next 4 quarters with reasoning
      - decisionDrivers: Key factors that influence this customer's purchasing decisions
      - confidenceScore: Overall confidence score (1-10) with detailed explanation
    
    Be extremely specific to this customer and the garment manufacturing industry in Bangladesh with accurate terminology. Do not use generic insights - tailor everything to this specific customer's data.`;

    // Use the AI utilities with automatic fallback
    return await getAIResponse(systemPrompt, JSON.stringify(context));
  } catch (error) {
    console.error('Error generating customer insights:', error);
    throw new Error('Failed to generate customer insights');
  }
}

// Generate order forecasts for a specific customer
export async function generateOrderForecasts(customerId: number) {
  try {
    const customerIdNum = Number(customerId);
    if (isNaN(customerIdNum)) {
      throw new Error('Invalid customer ID');
    }
    
    // Get customer details first to enable web research
    const customer = await executeQuery(async () => {
      const result = await pool.query(
        'SELECT * FROM customers WHERE id = $1',
        [customerIdNum]
      );
      return result.rows[0];
    });
    
    // Get industry insights from external data
    let industryResearch = {};
    if (customer && customer.industrySegment) {
      try {
        const systemPrompt = `You are an AI research specialist for the garment manufacturing industry. Provide accurate, data-driven insights about market trends and forecasts specific to this segment of the garment industry.`;
        
        const userPrompt = `Please provide detailed industry forecast data for the "${customer.industrySegment || 'garment'}" segment. Include information about seasonal trends, growth projections, and market shifts. Focus on factual information that would be valuable for production planning.`;
        
        industryResearch = await getAIResponse(systemPrompt, userPrompt, 0.3);
      } catch (error) {
        console.error("Error researching industry trends:", error);
        industryResearch = { researchError: "Could not retrieve industry research" };
      }
    }
    
    // Try to get customer orders, but don't fail if the table doesn't exist
    let orders = [];
    try {
      orders = await executeQuery(async () => {
        // Use prepared statement to avoid SQL injection
        const result = await pool.query(
          'SELECT * FROM commercial_orders WHERE customer_id = $1 AND created_at > NOW() - INTERVAL \'12 months\' ORDER BY created_at DESC',
          [customerIdNum]
        );
        return result.rows;
      });
    } catch (error) {
      console.log("Note: commercial_orders table may not exist yet:", error.message);
    }

    // Try to get industry seasonal trends, but don't fail if the table doesn't exist
    let seasonalData = [];
    try {
      seasonalData = await executeQuery(async () => {
        // Use prepared statement to avoid SQL injection
        const result = await pool.query(
          'SELECT * FROM kpi_history WHERE kpi_code IN ($1, $2, $3, $4) ORDER BY period_date DESC LIMIT 4',
          ['SEASONAL-Q1', 'SEASONAL-Q2', 'SEASONAL-Q3', 'SEASONAL-Q4']
        );
        return result.rows;
      });
    } catch (error) {
      console.log("Note: kpi_history table may not exist yet:", error.message);
      // Create some default seasonal data
      seasonalData = [
        { period_date: '2024-03-31', kpi_code: 'SEASONAL-Q1', kpi_value: 0.85 },
        { period_date: '2024-06-30', kpi_code: 'SEASONAL-Q2', kpi_value: 1.20 },
        { period_date: '2024-09-30', kpi_code: 'SEASONAL-Q3', kpi_value: 1.35 },
        { period_date: '2024-12-31', kpi_code: 'SEASONAL-Q4', kpi_value: 0.95 }
      ];
    }
    
    // Create the context for the AI
    const context = {
      customerId: customerIdNum,
      customer, // Include full customer details
      industryResearch, // Include industry research
      orderHistory: orders,
      seasonalTrends: seasonalData,
      orderMetrics: {
        quantity: orders.length,
        frequencyMonthly: orders.length > 0 ? orders.length / 12 : 0,
        averageOrderSize: orders.length > 0 ? orders.reduce((sum, order) => sum + (order.orderQuantity || 0), 0) / orders.length : 0,
        recentOrders: orders.slice(0, 5)
      }
    };

    const systemPrompt = `You are an AI assistant specialized in garment manufacturing order forecasting for a Bangladesh-based production facility. Analyze the provided ordering data and generate detailed, data-driven forecasts for this specific customer.
    
    Provide a comprehensive analysis that includes:
    1. Detailed monthly order forecasts for the next 12 months
    2. Seasonal pattern analysis with specific predictions for peak months
    3. Style trend forecasting based on historical order patterns
    4. Material requirement projections with specific fabric types and quantities
    5. Revenue projections with confidence intervals
    6. Production capacity planning recommendations
    7. Specific marketing initiatives tied to forecasted demand
    8. Risk assessment for each forecasted period
    
    Format your response as a detailed JSON object with these keys:
      - forecastSummary: Brief executive summary of the forecast outlook
      - monthlyForecasts: Array of detailed monthly forecasts for the next 12 months, each containing:
          * month: The forecast month
          * projectedOrderQuantity: Forecasted order quantity
          * projectedStyles: Array of likely style types
          * projectedRevenue: Forecasted revenue
          * seasonalFactors: Specific seasonal influences for this month
          * confidenceScore: Confidence in this month's forecast (0-1)
      - materialRequirements: Detailed projections of material needs
      - marketingRecommendations: Array of specific marketing initiatives tied to the forecast
      - capacityPlanning: Specific production capacity recommendations
      - riskAssessment: Array of potential risks to the forecast with mitigation strategies
      - confidenceAnalysis: Detailed explanation of confidence levels in the overall forecast
    
    Be extremely specific to this customer and the garment manufacturing industry in Bangladesh. Use precise terminology and provide actionable insights based solely on the data provided.`;

    // Use the AI utilities with automatic fallback
    return await getAIResponse(systemPrompt, JSON.stringify(context));
  } catch (error) {
    console.error('Error generating order forecasts:', error);
    throw new Error('Failed to generate order forecasts');
  }
}

// Generate sustainability metrics for a specific customer
export async function generateSustainabilityMetrics(customerId: number) {
  try {
    const customerIdNum = Number(customerId);
    if (isNaN(customerIdNum)) {
      throw new Error('Invalid customer ID');
    }
    
    // Get customer data first
    const customer = await executeQuery(async () => {
      const result = await pool.query(
        'SELECT * FROM customers WHERE id = $1',
        [customerIdNum]
      );
      return result.rows[0];
    });
    
    // Use customer country and industry to get country-specific sustainability regulations and standards
    let sustainabilityResearch = {};
    if (customer) {
      try {
        const systemPrompt = `You are an AI sustainability specialist for the garment manufacturing industry. Provide accurate information about sustainability standards, regulations, and best practices specific to the customer's country and industry segment.`;
        
        const userPrompt = `Research and provide detailed information about sustainability standards, regulations and practices in the garment industry ${customer.industrySegment ? `for the ${customer.industrySegment} segment` : ''} in ${customer.country || 'global markets'}. Include information about certification standards, compliance requirements, and benchmarks for water usage, chemical management, carbon footprint, and waste reduction.`;
        
        sustainabilityResearch = await getAIResponse(systemPrompt, userPrompt, 0.2);
      } catch (error) {
        console.error("Error researching sustainability standards:", error);
        sustainabilityResearch = { researchError: "Could not retrieve sustainability research" };
      }
    }
    
    // Try to get customer orders with material details, but don't fail if tables don't exist
    let orders = [];
    try {
      orders = await executeQuery(async () => {
        const result = await pool.query(
          'SELECT * FROM commercial_orders LEFT JOIN order_materials ON commercial_orders.id = order_materials.order_id WHERE commercial_orders.customer_id = $1',
          [customerIdNum]
        );
        return result.rows;
      });
    } catch (error) {
      console.log("Note: order_materials table may not exist yet:", error.message);
    }
    
    // Create the context for the AI
    const context = {
      customerId: customerIdNum,
      customer, // Include full customer details
      sustainabilityResearch, // Include sustainability standards research
      orderMaterials: orders,
      materialMetrics: {
        totalMaterials: orders.length,
        materialTypes: [...new Set(orders.map(order => order.materialType || 'unknown'))]
      }
    };

    const systemPrompt = `You are an AI assistant specialized in sustainability metrics for the garment manufacturing industry. Analyze the provided customer data and generate comprehensive sustainability metrics and recommendations.
    
    Generate a detailed sustainability analysis that includes:
    1. Environmental impact assessment based on material usage
    2. Carbon footprint estimation using industry benchmarks
    3. Water usage analysis and efficiency recommendations
    4. Chemical management assessment based on material types
    5. Waste reduction opportunities specific to this customer's material mix
    6. Compliance status with key sustainability certifications
    7. Benchmarking against industry standards
    8. Specific, actionable sustainability improvement recommendations
    
    Format your response as a detailed JSON object with these keys:
      - sustainabilitySummary: Brief executive summary of sustainability performance
      - environmentalImpact: Detailed assessment of environmental footprint with specific metrics
      - carbonFootprint: Estimated carbon emissions with breakdown by source
      - waterUsage: Water consumption metrics and benchmarks
      - chemicalManagement: Assessment of chemical usage and recommendations
      - wasteAnalysis: Breakdown of waste production and reduction opportunities
      - certificationStatus: Status and recommendations for key sustainability certifications
      - benchmarkComparison: How the customer compares to industry standards
      - improvementRoadmap: Detailed, specific recommendations for improving sustainability metrics
    
    Be extremely specific to this customer's material usage and the garment manufacturing industry in Bangladesh. Use precise terminology and provide actionable insights based on the data provided.`;

    // Use the AI utilities with automatic fallback
    return await getAIResponse(systemPrompt, JSON.stringify(context));
  } catch (error) {
    console.error('Error generating sustainability metrics:', error);
    throw new Error('Failed to generate sustainability metrics');
  }
}

// Generate production metrics for a specific customer
export async function generateProductionMetrics(customerId: number) {
  try {
    const customerIdNum = Number(customerId);
    if (isNaN(customerIdNum)) {
      throw new Error('Invalid customer ID');
    }
    
    // Get customer data first
    const customer = await executeQuery(async () => {
      const result = await pool.query(
        'SELECT * FROM customers WHERE id = $1',
        [customerIdNum]
      );
      return result.rows[0];
    });
    
    // Get production process insights from AI research
    let productionResearch = {};
    if (customer && customer.industrySegment) {
      try {
        const systemPrompt = `You are an AI production specialist for the garment manufacturing industry. Provide accurate, data-driven insights about production processes, efficiency metrics, and quality standards specific to this segment of the garment industry.`;
        
        const userPrompt = `Please provide detailed production metrics and benchmarks for the "${customer.industrySegment || 'garment'}" segment. Include information about standard production times, quality control metrics, defect rates, and efficiency benchmarks. Focus on factual information that would be valuable for production planning and optimization.`;
        
        productionResearch = await getAIResponse(systemPrompt, userPrompt, 0.2);
      } catch (error) {
        console.error("Error researching production metrics:", error);
        productionResearch = { researchError: "Could not retrieve production research" };
      }
    }
    
    // Try to get customer production data, but don't fail if tables don't exist
    let productionData = [];
    try {
      productionData = await executeQuery(async () => {
        const result = await pool.query(
          `SELECT 
            commercial_orders.id as order_id, 
            commercial_orders.style_name, 
            commercial_orders.order_quantity,
            production_runs.id as production_id,
            production_runs.start_date,
            production_runs.end_date,
            production_runs.actual_production,
            production_runs.defect_rate
          FROM commercial_orders 
          LEFT JOIN production_runs ON commercial_orders.id = production_runs.order_id 
          WHERE commercial_orders.customer_id = $1`,
          [customerIdNum]
        );
        return result.rows;
      });
    } catch (error) {
      console.log("Note: production_runs table may not exist yet:", error.message);
    }
    
    // Create the context for the AI
    const context = {
      customerId: customerIdNum,
      customer, // Include full customer details
      productionResearch, // Include production research
      productionData,
      productionMetrics: {
        totalProductions: productionData.length,
        avgDefectRate: productionData.length > 0 ? 
          productionData.reduce((sum, prod) => sum + (prod.defect_rate || 0), 0) / productionData.length : 0,
        recentProductions: productionData.slice(0, 5)
      }
    };

    const systemPrompt = `You are an AI assistant specialized in garment production metrics for a Bangladesh-based manufacturer. Analyze the provided customer production data and generate comprehensive, data-driven production metrics and recommendations.
    
    Generate a detailed production analysis that includes:
    1. Production efficiency metrics compared to industry standards
    2. Quality control performance with specific defect rate analysis
    3. Production cycle time analysis with optimization recommendations
    4. Resource utilization assessment and improvement opportunities
    5. Production planning recommendations based on historical performance
    6. Specific bottleneck identification and mitigation strategies
    7. Quality improvement roadmap with actionable steps
    8. Production cost optimization recommendations
    
    Format your response as a detailed JSON object with these keys:
      - productionSummary: Brief executive summary of production performance
      - efficiencyMetrics: Detailed assessment of production efficiency with specific KPIs
      - qualityPerformance: Quality metrics, defect analysis, and improvement recommendations
      - cycleTimeAnalysis: Production cycle time breakdown and optimization opportunities
      - resourceUtilization: Assessment of resource usage and recommendations
      - planningRecommendations: Specific production planning improvements
      - bottleneckAnalysis: Identification of production bottlenecks with mitigation strategies
      - qualityRoadmap: Detailed action plan for improving quality metrics
      - costOptimization: Specific recommendations for optimizing production costs
    
    Be extremely specific to this customer's production patterns and the garment manufacturing industry in Bangladesh. Use precise terminology and provide actionable insights based on the data provided.`;

    // Use the AI utilities with automatic fallback
    return await getAIResponse(systemPrompt, JSON.stringify(context));
  } catch (error) {
    console.error('Error generating production metrics:', error);
    throw new Error('Failed to generate production metrics');
  }
}

// Generate market trends analysis
export async function generateMarketTrends() {
  try {
    const systemPrompt = `You are an AI market research specialist for the garment manufacturing industry. Provide comprehensive, data-driven insights about current market trends, emerging opportunities, and potential challenges in the global garment industry with specific focus on Bangladesh's position.`;
    
    const userPrompt = `Generate a detailed analysis of current and emerging market trends in the global garment manufacturing industry with specific focus on:

1. Shifts in global sourcing patterns and Bangladesh's competitive position
2. Emerging fashion and apparel segment growth opportunities
3. Sustainability and ethical sourcing requirements from major buyers
4. Impact of technology and automation on production capabilities
5. Post-pandemic changes in supply chain management
6. Current pricing pressures and cost management strategies
7. Regulatory changes affecting garment exports
8. Consumer behavior changes driving production innovations

Provide specific, data-driven insights that would be valuable for a Bangladesh-based garment manufacturer to position itself strategically in the global market.`;
    
    // Use the AI utilities with automatic fallback
    return await getAIResponse(systemPrompt, userPrompt);
  } catch (error) {
    console.error('Error generating market trends:', error);
    throw new Error('Failed to generate market trends');
  }
}