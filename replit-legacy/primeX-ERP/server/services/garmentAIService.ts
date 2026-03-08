import { OpenAI } from 'openai';
import { db, executeQuery } from '../db';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const AI_MODEL = 'gpt-4o';

console.log('OpenAI API initialized successfully');

// Generate comprehensive production analysis report
export async function generateProductionAnalysisReport(orderId: number, tenantId: number = 1) {
  try {
    // Fetch order details
    const orderResult = await executeQuery(async () => {
      return await db.select().from('commercial_orders')
        .where('id', '=', orderId)
        .where('tenant_id', '=', tenantId);
    });
    
    if (orderResult.length === 0) {
      throw new Error('Order not found');
    }
    
    const order = orderResult[0];
    
    // Fetch production data
    const productionData = await executeQuery(async () => {
      return await db.select().from('production_data')
        .where('order_id', '=', orderId)
        .where('tenant_id', '=', tenantId)
        .orderBy('date', 'desc');
    });
    
    // Fetch quality inspection data
    const qualityData = await executeQuery(async () => {
      return await db.select().from('quality_inspections')
        .where('order_id', '=', orderId)
        .where('tenant_id', '=', tenantId)
        .orderBy('inspection_date', 'desc');
    });
    
    // Create analysis context
    const analysisContext = {
      order,
      productionData: productionData.rows,
      qualityData: qualityData.rows
    };

    const systemPrompt = `You are an AI assistant specialized in garment manufacturing production analysis for a Bangladesh-based production facility. Analyze the provided production and quality data for this specific order and generate a comprehensive analysis report.
    
    1. Identify key production metrics (efficiency, productivity, defect rates)
    2. Compare actual vs. planned production timelines
    3. Identify bottlenecks and quality issues
    4. Provide specific, actionable recommendations
    5. Format your response as a JSON object with these keys:
      - summary: executive summary of production status
      - metrics: key metrics with current values and targets
      - issues: array of identified production issues with severity and impact
      - bottlenecks: array of production bottlenecks with descriptions
      - recommendations: array of specific action items to address issues
      - riskAreas: array of potential risk areas for continued monitoring
    
    Be specific to the garment manufacturing industry with appropriate terminology.`;

    // Make the OpenAI request
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: JSON.stringify(analysisContext)
        }
      ],
      response_format: { type: "json_object" }
    });

    // Parse the AI response
    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Error generating production analysis report:', error);
    throw new Error('Failed to generate production analysis report');
  }
}

// Analyze production efficiency metrics
export async function analyzeProductionEfficiency(orderId: number, tenantId: number = 1) {
  try {
    // Fetch order details
    const orderResult = await executeQuery(async () => {
      return await db.select().from('commercial_orders')
        .where('id', '=', orderId)
        .where('tenant_id', '=', tenantId);
    });
    
    if (orderResult.length === 0) {
      throw new Error('Order not found');
    }
    
    const order = orderResult[0];
    
    // Fetch production data
    const productionData = await executeQuery(async () => {
      return await db.select().from('production_data')
        .where('order_id', '=', orderId)
        .where('tenant_id', '=', tenantId)
        .orderBy('date', 'desc');
    });
    
    // Create analysis context
    const analysisContext = {
      order,
      productionData: productionData.rows
    };

    const systemPrompt = `You are an AI assistant specialized in garment manufacturing efficiency analysis for a Bangladesh-based production facility. Analyze the provided production data for this specific order and generate an efficiency analysis report.
    
    1. Calculate key efficiency metrics (SMV achievement, line efficiency, productivity)
    2. Compare actual vs. target production outputs
    3. Identify efficiency bottlenecks and their causes
    4. Suggest specific efficiency improvement measures
    5. Format your response as a JSON object with these keys:
      - efficiency: overall efficiency rating (percentage)
      - metrics: object with key metrics and their values
      - bottlenecks: array of efficiency bottlenecks with root causes
      - improvements: array of specific improvement suggestions with estimated impact
      - benchmarks: industry benchmarks for comparison
      - timeline: suggested timeline for implementing improvements
    
    Use garment industry standard terminology and metrics.`;

    // Make the OpenAI request
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: JSON.stringify(analysisContext)
        }
      ],
      response_format: { type: "json_object" }
    });

    // Parse the AI response
    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Error analyzing production efficiency:', error);
    throw new Error('Failed to analyze production efficiency');
  }
}

// Analyze quality defects and suggest improvements
export async function analyzeQualityDefects(orderId: number, tenantId: number = 1) {
  try {
    // Fetch order details
    const orderResult = await executeQuery(async () => {
      return await db.select().from('commercial_orders')
        .where('id', '=', orderId)
        .where('tenant_id', '=', tenantId);
    });
    
    if (orderResult.length === 0) {
      throw new Error('Order not found');
    }
    
    const order = orderResult[0];
    
    // Fetch quality inspection data
    const qualityData = await executeQuery(async () => {
      return await db.select().from('quality_inspections')
        .where('order_id', '=', orderId)
        .where('tenant_id', '=', tenantId)
        .orderBy('inspection_date', 'desc');
    });
    
    // Create analysis context
    const analysisContext = {
      order,
      qualityData: qualityData.rows
    };

    const systemPrompt = `You are an AI assistant specialized in garment manufacturing quality analysis for a Bangladesh-based production facility. Analyze the provided quality inspection data for this specific order and generate a quality defect analysis report.
    
    1. Identify major defect types and their frequencies
    2. Calculate defect rates (DHU, RFT rates)
    3. Analyze root causes of recurring defects
    4. Suggest specific quality improvement measures
    5. Format your response as a JSON object with these keys:
      - defectRate: overall defect rate percentage
      - majorDefects: array of most common defects with counts and percentages
      - rootCauses: identified root causes for major defects
      - improvements: array of specific quality improvement recommendations
      - criticalAreas: production stages requiring immediate attention
      - preventiveMeasures: suggested preventive measures for future orders
    
    Use garment industry standard quality terminology and metrics.`;

    // Make the OpenAI request
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: JSON.stringify(analysisContext)
        }
      ],
      response_format: { type: "json_object" }
    });

    // Parse the AI response
    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Error analyzing quality defects:', error);
    throw new Error('Failed to analyze quality defects');
  }
}

// Assess delivery risk for a specific order
export async function assessDeliveryRisk(orderId: number, tenantId: number = 1) {
  try {
    // Fetch order details
    const orderResult = await executeQuery(async () => {
      return await db.select().from('commercial_orders')
        .where('id', '=', orderId)
        .where('tenant_id', '=', tenantId);
    });
    
    if (orderResult.length === 0) {
      throw new Error('Order not found');
    }
    
    const order = orderResult[0];
    
    // Fetch production data
    const productionData = await executeQuery(async () => {
      return await db.select().from('production_data')
        .where('order_id', '=', orderId)
        .where('tenant_id', '=', tenantId)
        .orderBy('date', 'desc');
    });
    
    // Fetch milestone data from Time & Action plan
    const milestoneData = await executeQuery(async () => {
      return await db.select()
        .from('tna_milestones')
        .innerJoin('tna_plans', eb => 
          eb.on('tna_milestones.plan_id', '=', 'tna_plans.id')
        )
        .where('tna_plans.order_id', '=', orderId)
        .where('tna_plans.tenant_id', '=', tenantId)
        .orderBy('tna_milestones.planned_end_date');
    });
    
    // Create analysis context
    const analysisContext = {
      order,
      productionData: productionData.rows,
      milestones: milestoneData.rows
    };

    const systemPrompt = `You are an AI assistant specialized in garment manufacturing delivery risk assessment for a Bangladesh-based production facility. Analyze the provided order, production, and milestone data to assess the delivery risk for this specific order.
    
    1. Compare actual vs. planned milestone completion dates
    2. Calculate current production status vs. required timeline
    3. Identify critical path delays and their impact
    4. Assess overall delivery risk and mitigation options
    5. Format your response as a JSON object with these keys:
      - riskScore: delivery risk score from 1-10 (10 being highest risk)
      - riskLevel: categorized risk level (Low, Medium, High, Critical)
      - delayFactors: array of specific factors contributing to potential delay
      - criticalPathStatus: status of critical path milestones
      - mitigationOptions: array of specific actions to mitigate delivery risk
      - revisedTimeline: suggested revised timeline if needed
      - escalationNeeded: boolean indicating if management escalation is needed
    
    Use garment industry standard terminology and be specific about Bangladesh export context.`;

    // Make the OpenAI request
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: JSON.stringify(analysisContext)
        }
      ],
      response_format: { type: "json_object" }
    });

    // Parse the AI response
    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Error assessing delivery risk:', error);
    throw new Error('Failed to assess delivery risk');
  }
}