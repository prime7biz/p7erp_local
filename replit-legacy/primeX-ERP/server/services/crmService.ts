// CRM AI Service using OpenAI
import OpenAI from "openai";
import { IStorage } from '../storage';

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const MODEL = "gpt-4o";

class CrmService {
  private openai: OpenAI;
  private storage: IStorage;

  constructor(storage: IStorage) {
    this.storage = storage;
    
    // Initialize OpenAI client
    if (!process.env.OPENAI_API_KEY) {
      console.warn("Warning: OPENAI_API_KEY not found. AI insights will not be available.");
    }
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generateCustomerInsights(customerId: number, tenantId: number): Promise<any> {
    try {
      // Get customer data
      const customer = await this.storage.getCustomerById(customerId, tenantId);
      if (!customer) {
        throw new Error("Customer not found");
      }

      // Get customer's orders, inquiries, and quotations
      const orders = await this.storage.getAllOrdersByCustomerId(customerId, tenantId);
      const inquiries = await this.storage.getAllInquiriesByCustomerId(customerId, tenantId);
      const quotations = await this.storage.getAllQuotationsByCustomerId(customerId, tenantId);
      
      // Get sample developments and trim approvals if available
      const samples = await this.storage.getAllSamplesByCustomerId(customerId, tenantId);

      // Compile data for analysis
      const customerData = {
        customer,
        orders: orders || [],
        inquiries: inquiries || [],
        quotations: quotations || [],
        samples: samples || []
      };

      // Create a prompt for the AI model
      const prompt = `
        Analyze this customer's data and provide strategic insights for managing the relationship:

        Customer: ${JSON.stringify(customer)}
        Orders: ${JSON.stringify(orders || [])}
        Inquiries: ${JSON.stringify(inquiries || [])}
        Quotations: ${JSON.stringify(quotations || [])}
        Samples: ${JSON.stringify(samples || [])}

        Based on this data, generate the following insights:
        1. Order Pattern Analysis: Analyze ordering patterns, frequencies, seasonal trends if any
        2. Risk Assessment: Identify any potential risks (delayed payments, rejected samples, etc.)
        3. Opportunity Identification: Potential for upselling, new product lines, etc.
        4. Communication Analysis: Feedback on communication patterns
        5. Relationship Health: Overall health of business relationship

        Provide a score from 1-100 for each category and provide detailed, specific insights relevant to the garment manufacturing industry.
        Format your response as a JSON object with the following structure:
        {
          "orderPatternInsight": { "score": number, "title": string, "description": string, "data": any },
          "riskAssessmentInsight": { "score": number, "title": string, "description": string, "data": any },
          "opportunityInsight": { "score": number, "title": string, "description": string, "data": any },
          "communicationInsight": { "score": number, "title": string, "description": string, "data": any },
          "relationshipHealthInsight": { "score": number, "title": string, "description": string, "data": any }
        }
      `;

      // Call OpenAI API for analysis
      const response = await this.openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: "You are an AI analyst for a garment manufacturing CRM system. Provide data-driven, detailed insights focused on customer relationship management in the apparel industry." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });

      // Parse the response
      const insights = JSON.parse(response.choices[0].message.content);

      // Store insights in database
      const storedInsights = [];
      
      // Store order pattern insight
      if (insights.orderPatternInsight) {
        const orderInsight = await this.storage.createCustomerInsight({
          tenantId,
          customerId,
          insightType: 'order_pattern',
          title: insights.orderPatternInsight.title,
          description: insights.orderPatternInsight.description,
          score: insights.orderPatternInsight.score,
          insightData: insights.orderPatternInsight.data
        });
        storedInsights.push(orderInsight);
      }
      
      // Store risk assessment insight
      if (insights.riskAssessmentInsight) {
        const riskInsight = await this.storage.createCustomerInsight({
          tenantId,
          customerId,
          insightType: 'risk',
          title: insights.riskAssessmentInsight.title,
          description: insights.riskAssessmentInsight.description,
          score: insights.riskAssessmentInsight.score,
          insightData: insights.riskAssessmentInsight.data
        });
        storedInsights.push(riskInsight);
      }
      
      // Store opportunity insight
      if (insights.opportunityInsight) {
        const opportunityInsight = await this.storage.createCustomerInsight({
          tenantId,
          customerId,
          insightType: 'opportunity',
          title: insights.opportunityInsight.title,
          description: insights.opportunityInsight.description,
          score: insights.opportunityInsight.score,
          insightData: insights.opportunityInsight.data
        });
        storedInsights.push(opportunityInsight);
      }
      
      // Store communication insight
      if (insights.communicationInsight) {
        const communicationInsight = await this.storage.createCustomerInsight({
          tenantId,
          customerId,
          insightType: 'communication',
          title: insights.communicationInsight.title,
          description: insights.communicationInsight.description,
          score: insights.communicationInsight.score,
          insightData: insights.communicationInsight.data
        });
        storedInsights.push(communicationInsight);
      }
      
      // Store relationship health insight
      if (insights.relationshipHealthInsight) {
        const healthInsight = await this.storage.createCustomerInsight({
          tenantId,
          customerId,
          insightType: 'relationship_health',
          title: insights.relationshipHealthInsight.title,
          description: insights.relationshipHealthInsight.description,
          score: insights.relationshipHealthInsight.score,
          insightData: insights.relationshipHealthInsight.data
        });
        storedInsights.push(healthInsight);
      }

      return storedInsights;
    } catch (error) {
      console.error("Error generating customer insights:", error);
      throw error;
    }
  }

  async generateSampleApprovalRecommendations(sampleId: number, tenantId: number): Promise<any> {
    try {
      const sample = await this.storage.getSampleById(sampleId, tenantId);
      if (!sample) {
        throw new Error("Sample not found");
      }

      const customer = await this.storage.getCustomerById(sample.customerId, tenantId);
      const previousSamples = await this.storage.getSamplesByStyleName(sample.styleName, tenantId);
      
      // Create a prompt for the AI
      const prompt = `
        Analyze this sample development and provide recommendations for approval process:

        Sample: ${JSON.stringify(sample)}
        Customer: ${JSON.stringify(customer)}
        Previous Samples for same style: ${JSON.stringify(previousSamples || [])}

        Based on this data, provide recommendations for:
        1. Key approval criteria to focus on for this type of sample
        2. Potential issues to watch out for based on previous sample approvals
        3. Communication strategy for seeking approval
        4. Timeline recommendations for the approval process

        Format your response as a JSON object with the following structure:
        {
          "approvalCriteria": { "title": string, "recommendations": string[] },
          "potentialIssues": { "title": string, "recommendations": string[] },
          "communicationStrategy": { "title": string, "recommendations": string[] },
          "timelineRecommendations": { "title": string, "recommendations": string[] }
        }
      `;

      // Call OpenAI API for analysis
      const response = await this.openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: "You are an AI assistant for a garment manufacturing system. Provide data-driven recommendations for sample approval processes." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });

      // Parse the response
      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error("Error generating sample approval recommendations:", error);
      throw error;
    }
  }

  async generateCommunicationTemplate(
    type: string, 
    purpose: string, 
    customerId: number, 
    tenantId: number, 
    relatedEntityType?: string, 
    relatedEntityId?: number
  ): Promise<any> {
    try {
      // Get customer data
      const customer = await this.storage.getCustomerById(customerId, tenantId);
      if (!customer) {
        throw new Error("Customer not found");
      }

      // Get related entity (optional)
      let relatedEntity = null;
      if (relatedEntityType && relatedEntityId) {
        switch (relatedEntityType) {
          case 'order':
            relatedEntity = await this.storage.getOrderById(relatedEntityId, tenantId);
            break;
          case 'quotation':
            relatedEntity = await this.storage.getQuotationById(relatedEntityId, tenantId);
            break;
          case 'inquiry':
            relatedEntity = await this.storage.getInquiryById(relatedEntityId, tenantId);
            break;
          case 'sample':
            relatedEntity = await this.storage.getSampleById(relatedEntityId, tenantId);
            break;
        }
      }

      // Create a prompt for the AI
      const prompt = `
        Generate a professional ${type} template for ${purpose} to be sent to a customer in garment manufacturing:

        Customer: ${JSON.stringify(customer)}
        ${relatedEntity ? `Related ${relatedEntityType}: ${JSON.stringify(relatedEntity)}` : ''}

        Based on this information, create:
        1. A subject line (if email)
        2. A professional message body with appropriate tone and terminology
        3. List of available variables that can be used for customization

        Format your response as a JSON object with the following structure:
        {
          "name": string,
          "type": "${type}",
          "subject": string,
          "content": string,
          "variables": string[]
        }
      `;

      // Call OpenAI API for template generation
      const response = await this.openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: "You are an AI assistant specialized in creating professional communication templates for the garment manufacturing industry." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });

      // Parse the response
      const template = JSON.parse(response.choices[0].message.content);
      
      // Save the template
      return await this.storage.createCommunicationTemplate({
        tenantId,
        name: template.name,
        type: template.type,
        subject: template.subject,
        content: template.content,
        variables: template.variables,
        createdBy: 1, // Admin user
        isActive: true
      });
    } catch (error) {
      console.error("Error generating communication template:", error);
      throw error;
    }
  }
}

export default CrmService;