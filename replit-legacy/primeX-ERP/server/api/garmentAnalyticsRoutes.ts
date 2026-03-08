import express, { Request, Response } from "express";
import * as garmentCustomerAIService from "../services/garmentCustomerAIService";
import { storage } from "../storage";

const router = express.Router();

// Get AI-powered garment industry insights for a specific customer
router.get('/customers/:id/insights', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const tenantId = 1; // Get from auth context in production
    
    // Get customer data
    const customer = await storage.getCustomerById(customerId, tenantId);
    
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    
    // Get agent if customer has one
    let agent = undefined;
    if (customer.hasAgent) {
      agent = await storage.getAgentByCustomerId(customerId);
    }
    
    // Generate AI insights
    const aiResponse = await garmentCustomerAIService.generateCustomerInsights({...customer, agent});
    
    // Format the response for the frontend
    // The frontend expects an array of AIInsight objects
    const formattedInsights = [];
    
    // Check if we have insights in the AI response
    if (aiResponse && aiResponse.insights && Array.isArray(aiResponse.insights)) {
      // Transform each AI insight to the format expected by the frontend
      formattedInsights.push(...aiResponse.insights.map(insight => {
        return {
          id: insight.id || `insight-${Math.random().toString(36).substr(2, 9)}`,
          title: insight.title,
          description: insight.description,
          // Map the AI's type to the frontend's type
          type: mapInsightType(insight.type),
          confidence: insight.confidence,
          // Generate recommendations array if it doesn't exist
          recommendations: insight.recommendations || 
            generateRecommendations(insight.description, insight.type)
        };
      }));
    }
    
    // Return the formatted insights
    return res.json(formattedInsights);
  } catch (error) {
    console.error("Error generating garment customer insights:", error);
    return res.status(500).json({ message: "Failed to generate insights" });
  }
});

// Helper function to map AI insight types to frontend types
function mapInsightType(type: string): 'info' | 'warning' | 'success' {
  switch (type?.toLowerCase()) {
    case 'opportunity':
    case 'strength':
    case 'positive':
      return 'success';
    case 'risk':
    case 'warning':
    case 'negative':
      return 'warning';
    case 'trend':
    case 'info':
    case 'neutral':
    default:
      return 'info';
  }
}

// Helper function to generate recommendations if none exist
function generateRecommendations(description: string, type: string): string[] {
  if (type?.toLowerCase() === 'opportunity' || type?.toLowerCase() === 'strength') {
    return [
      'Leverage this strength in customer communications',
      'Prioritize resources to maintain this advantage',
      'Document this as a success story for similar customers'
    ];
  } else if (type?.toLowerCase() === 'risk' || type?.toLowerCase() === 'warning') {
    return [
      'Develop a mitigation plan to address this concern',
      'Schedule a strategy meeting to discuss approaches',
      'Monitor this area closely for any changes'
    ];
  } else {
    return [
      'Consider this insight in future planning',
      'Share this information with relevant team members',
      'Monitor for changes in this trend'
    ];
  }
}

// Get order forecasts for a specific customer
router.get('/customers/:id/forecasts', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const tenantId = 1; // Get from auth context in production
    
    // Check if customer exists
    const customer = await storage.getCustomerById(customerId, tenantId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    
    // Generate order forecasts
    const aiResponse = await garmentCustomerAIService.generateOrderForecasts(customerId);
    
    // Format the response for the frontend
    // The frontend expects an array of GarmentOrderForecast objects
    const formattedForecasts = [];
    
    // Check if we have forecasts or monthly forecasts in the AI response
    if (aiResponse) {
      if (aiResponse.monthlyForecasts && Array.isArray(aiResponse.monthlyForecasts)) {
        // Transform monthly forecasts to the expected format
        formattedForecasts.push(...aiResponse.monthlyForecasts.map((forecast, index) => {
          // Extract the season from the month
          const month = forecast.month || '';
          let season = 'Spring/Summer';
          if (month.includes('Sep') || month.includes('Oct') || month.includes('Nov')) {
            season = 'Fall/Winter';
          } else if (month.includes('Jun') || month.includes('Jul') || month.includes('Aug')) {
            season = 'Summer';
          } else if (month.includes('Dec') || month.includes('Jan') || month.includes('Feb')) {
            season = 'Winter';
          } else if (month.includes('Mar') || month.includes('Apr') || month.includes('May')) {
            season = 'Spring';
          }
          
          return {
            seasonId: `season-${index + 1}`,
            seasonName: season,
            predictedVolume: forecast.projectedOrderQuantity || 0,
            predictedValue: forecast.projectedRevenue || 0,
            confidenceLevel: forecast.confidenceScore || 0.7,
            changeFromLastYear: 5, // Default value if not provided
            factors: forecast.projectedStyles || ['Seasonal trend', 'Market demand', 'Historical patterns']
          };
        }));
      } else if (aiResponse.forecastedGrowth) {
        // Transform quarterly forecasts to the expected format
        const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
        for (const [key, value] of Object.entries(aiResponse.forecastedGrowth)) {
          if (key.startsWith('q') && quarters.includes(key.toUpperCase())) {
            let season = 'Spring/Summer';
            if (key === 'q1') season = 'Spring';
            else if (key === 'q2') season = 'Summer';
            else if (key === 'q3') season = 'Fall';
            else if (key === 'q4') season = 'Winter';
            
            const projection = typeof value === 'object' ? (value as any).projection : value;
            const reasoning = typeof value === 'object' ? (value as any).reasoning : '';
            
            // Try to extract a percentage value
            let percentageChange = 0;
            if (typeof projection === 'string') {
              const match = projection.match(/[+-]?\d+(\.\d+)?%?/);
              if (match) {
                percentageChange = parseFloat(match[0].replace('%', ''));
              }
            }
            
            formattedForecasts.push({
              seasonId: `forecast-${key}`,
              seasonName: `${season} ${new Date().getFullYear()}`,
              predictedVolume: 1000 + (percentageChange * 10), // Scale percentage to volume
              predictedValue: 30000 + (percentageChange * 300), // Scale percentage to value
              confidenceLevel: 0.75,
              changeFromLastYear: percentageChange,
              factors: reasoning ? [reasoning] : ['Market analysis', 'Customer trends', 'Industry forecasts']
            });
          }
        }
      }
    }
    
    // If we still don't have any forecasts, generate some placeholder data
    if (formattedForecasts.length === 0) {
      const seasons = ['Spring', 'Summer', 'Fall', 'Winter'];
      const volumes = [2500, 3200, 3000, 2800];
      const values = [75000, 96000, 90000, 84000];
      const changes = [5, 8, 6, 4];
      
      for (let i = 0; i < seasons.length; i++) {
        formattedForecasts.push({
          seasonId: `forecast-${i+1}`,
          seasonName: `${seasons[i]} ${new Date().getFullYear()}`,
          predictedVolume: volumes[i],
          predictedValue: values[i],
          confidenceLevel: 0.7 + (Math.random() * 0.2),
          changeFromLastYear: changes[i],
          factors: ['Market demand', 'Seasonal trends', 'Historical patterns']
        });
      }
    }
    
    return res.json(formattedForecasts);
  } catch (error) {
    console.error("Error generating order forecasts:", error);
    return res.status(500).json({ message: "Failed to generate forecasts" });
  }
});

// Get sustainability metrics for a specific customer
router.get('/customers/:id/sustainability', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const tenantId = 1; // Get from auth context in production
    
    // Check if customer exists
    const customer = await storage.getCustomerById(customerId, tenantId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    
    // Generate sustainability metrics
    const aiResponse = await garmentCustomerAIService.generateSustainabilityMetrics(customerId);
    
    // Format the response for the frontend
    const formattedMetrics = {
      overallRating: 0,
      categories: []
    };
    
    // Extract overall rating if available
    if (aiResponse) {
      // Look for overall sustainability rating
      if (customer.sustainabilityRating) {
        formattedMetrics.overallRating = customer.sustainabilityRating;
      } else if (aiResponse.overallRating) {
        formattedMetrics.overallRating = typeof aiResponse.overallRating === 'number' 
          ? aiResponse.overallRating 
          : 3.5; // Default if not a number
      } else if (aiResponse.benchmarkComparison && aiResponse.benchmarkComparison.overall) {
        // Try to extract a numeric score from the overall benchmark
        formattedMetrics.overallRating = 3.5; // Default rating
      }
      
      // Extract categories
      const categories = [];
      
      // Check for different structures in the AI response
      if (aiResponse.environmentalImpact) {
        // Process environmental impact metrics
        for (const [key, value] of Object.entries(aiResponse.environmentalImpact)) {
          if (typeof value === 'object' && value !== null) {
            const name = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
            categories.push({
              name,
              score: calculateScore(value.current),
              industryAverage: calculateIndustryAverage(value.industryComparison),
              recommendations: [(value as any).reductionPotential]
            });
          }
        }
      }
      
      // Check for water usage
      if (aiResponse.waterUsage && aiResponse.waterUsage.recommendations) {
        categories.push({
          name: 'Water Usage Efficiency',
          score: 3.0, // Default score
          industryAverage: 3.5,
          recommendations: aiResponse.waterUsage.recommendations
        });
      }
      
      // Check for chemical management
      if (aiResponse.chemicalManagement && aiResponse.chemicalManagement.recommendations) {
        categories.push({
          name: 'Chemical Management',
          score: 3.2, // Default score
          industryAverage: 3.0,
          recommendations: aiResponse.chemicalManagement.recommendations
        });
      }
      
      // Check for waste analysis
      if (aiResponse.wasteAnalysis && aiResponse.wasteAnalysis.recommendations) {
        categories.push({
          name: 'Waste Management',
          score: 3.1, // Default score
          industryAverage: 2.8,
          recommendations: aiResponse.wasteAnalysis.recommendations
        });
      }
      
      // Check for certification status
      if (aiResponse.certificationStatus) {
        const certRecs = [];
        if (aiResponse.certificationStatus.recommended && Array.isArray(aiResponse.certificationStatus.recommended)) {
          certRecs.push(...aiResponse.certificationStatus.recommended.map(cert => `Obtain ${cert} certification`));
        }
        
        categories.push({
          name: 'Certifications',
          score: 2.8, // Default score
          industryAverage: 2.5,
          recommendations: certRecs.length > 0 ? certRecs : ['Pursue sustainability certifications']
        });
      }
      
      // Add more categories from improvement roadmap if available
      if (aiResponse.improvementRoadmap && Array.isArray(aiResponse.improvementRoadmap)) {
        const uniqueCategoryNames = new Set(categories.map(c => c.name));
        
        for (const initiative of aiResponse.improvementRoadmap) {
          const name = initiative.initiative;
          if (name && !uniqueCategoryNames.has(name)) {
            categories.push({
              name,
              score: calculateImpactScore(initiative.impact),
              industryAverage: 3.0,
              recommendations: [`Implement within ${initiative.timeline}`]
            });
            uniqueCategoryNames.add(name);
          }
        }
      }
      
      // If we still don't have any categories, add some defaults
      if (categories.length === 0) {
        categories.push(
          {
            name: 'Material Sustainability',
            score: 3.5,
            industryAverage: 3.0,
            recommendations: ['Increase use of sustainable fabrics', 'Reduce reliance on synthetic materials']
          },
          {
            name: 'Carbon Footprint',
            score: 3.2,
            industryAverage: 3.4,
            recommendations: ['Implement energy efficiency measures', 'Optimize logistics for carbon reduction']
          },
          {
            name: 'Waste Management',
            score: 2.8,
            industryAverage: 2.6,
            recommendations: ['Develop comprehensive waste reduction program', 'Implement fabric waste recycling']
          },
          {
            name: 'Water Conservation',
            score: 3.0,
            industryAverage: 2.8,
            recommendations: ['Adopt low-water dyeing technologies', 'Implement water recycling systems']
          }
        );
      }
      
      formattedMetrics.categories = categories;
    }
    
    return res.json(formattedMetrics);
  } catch (error) {
    console.error("Error generating sustainability metrics:", error);
    return res.status(500).json({ message: "Failed to generate metrics" });
  }
});

// Helper function to calculate a score from a string rating
function calculateScore(rating: string): number {
  if (!rating) return 3.0;
  
  if (typeof rating === 'number') {
    return Math.min(5, Math.max(1, rating));
  }
  
  const ratingLower = rating.toLowerCase();
  if (ratingLower.includes('high')) return 4.0;
  if (ratingLower.includes('medium-high')) return 3.7;
  if (ratingLower.includes('medium')) return 3.0;
  if (ratingLower.includes('medium-low')) return 2.3;
  if (ratingLower.includes('low')) return 1.7;
  
  return 3.0; // Default
}

// Helper function to extract industry average from comparison string
function calculateIndustryAverage(comparison: string): number {
  if (!comparison) return 3.0;
  
  try {
    // Try to extract percentage difference
    const percentMatch = comparison.match(/([\+\-]?\d+(?:\.\d+)?)%/);
    if (percentMatch) {
      const percentDiff = parseFloat(percentMatch[1]);
      // Convert percentage to a scale adjustment
      return 3.0 + (percentDiff / 25); // Adjust baseline by percentage/25
    }
  } catch (e) {
    // Ignore parsing errors
  }
  
  return 3.0; // Default
}

// Helper function to calculate score from impact rating
function calculateImpactScore(impact: string): number {
  if (!impact) return 3.0;
  
  const impactLower = impact?.toLowerCase();
  if (impactLower.includes('high')) return 4.2;
  if (impactLower.includes('medium-high')) return 3.8;
  if (impactLower.includes('medium')) return 3.0;
  if (impactLower.includes('medium-low')) return 2.5;
  if (impactLower.includes('low')) return 2.0;
  
  return 3.0; // Default
}

// Get production metrics for a specific customer
router.get('/customers/:id/production-metrics', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const tenantId = 1; // Get from auth context in production
    
    // Check if customer exists
    const customer = await storage.getCustomerById(customerId, tenantId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    
    // Generate production metrics
    const aiResponse = await garmentCustomerAIService.generateProductionMetrics(customerId);
    
    // Format the response for the frontend
    // The frontend expects an array of ProductionInsight objects
    const formattedMetrics = [];
    
    // Process the AI response if available
    if (aiResponse) {
      // Check for efficiency metrics
      if (aiResponse.efficiencyMetrics) {
        // Process cycle times
        if (aiResponse.efficiencyMetrics.cycleTimes) {
          for (const [key, value] of Object.entries(aiResponse.efficiencyMetrics.cycleTimes)) {
            const metricName = key.charAt(0).toUpperCase() + key.slice(1) + ' Cycle Time';
            let currentValue = 0;
            let industryBenchmark = 0;
            
            // Try to parse benchmark percentages
            if (typeof value === 'string') {
              const match = value.match(/(\d+)%/);
              if (match) {
                const percent = parseInt(match[1]);
                currentValue = percent;
                industryBenchmark = 100;
              }
            }
            
            formattedMetrics.push({
              metricName,
              currentValue: currentValue || 85,
              industryBenchmark: industryBenchmark || 100,
              trend: currentValue >= 95 ? 'improving' : currentValue >= 80 ? 'stable' : 'declining',
              recommendations: [
                `Optimize ${key} process workflow`,
                `Review equipment efficiency in ${key} department`,
                `Analyze operator training for ${key} operations`
              ]
            });
          }
        }
        
        // Add overall efficiency if available
        if (aiResponse.efficiencyMetrics.overallEfficiency) {
          let currentValue = 0;
          let industryBenchmark = 0;
          
          // Try to parse percentages
          const effString = aiResponse.efficiencyMetrics.overallEfficiency.toString();
          const overallMatch = effString.match(/(\d+)%/);
          if (overallMatch) {
            currentValue = parseInt(overallMatch[1]);
          }
          
          // Try to parse benchmark from string like "76% (industry benchmark: 82%)"
          const benchmarkMatch = effString.match(/benchmark:\s*(\d+)%/);
          if (benchmarkMatch) {
            industryBenchmark = parseInt(benchmarkMatch[1]);
          }
          
          formattedMetrics.push({
            metricName: 'Overall Production Efficiency',
            currentValue: currentValue || 76,
            industryBenchmark: industryBenchmark || 82,
            trend: currentValue >= industryBenchmark ? 'improving' : 
                  currentValue >= industryBenchmark * 0.9 ? 'stable' : 'declining',
            recommendations: 
              aiResponse.efficiencyMetrics.recommendations || 
              [
                'Implement comprehensive efficiency monitoring system',
                'Develop targeted improvement plan for low-performing areas',
                'Establish regular efficiency review meetings'
              ]
          });
        }
        
        // Add labor efficiency if available
        if (aiResponse.efficiencyMetrics.laborEfficiency) {
          const laborEffString = aiResponse.efficiencyMetrics.laborEfficiency.toString();
          let laborValue = 0;
          
          // Try to parse SMV ratio like "0.85 SMV ratio"
          const laborMatch = laborEffString.match(/(\d+\.\d+)/);
          if (laborMatch) {
            laborValue = parseFloat(laborMatch[1]) * 100; // Convert to percentage
          }
          
          formattedMetrics.push({
            metricName: 'Labor Efficiency (SMV Ratio)',
            currentValue: laborValue || 85,
            industryBenchmark: 90,
            trend: laborValue >= 90 ? 'improving' : laborValue >= 80 ? 'stable' : 'declining',
            recommendations: [
              'Enhance operator training program',
              'Review workstation layout and ergonomics',
              'Implement incentive program for high performers'
            ]
          });
        }
      }
      
      // Check for quality metrics
      if (aiResponse.qualityMetrics) {
        // Process defect rates
        if (aiResponse.qualityMetrics.defectRates) {
          const formatDefectRate = (rate, type) => {
            let value = 0;
            let benchmark = 0;
            
            // Try to parse percentage
            if (typeof rate === 'string') {
              const match = rate.match(/(\d+(?:\.\d+)?)%/);
              if (match) {
                value = parseFloat(match[1]);
              }
              
              // Try to parse benchmark
              const benchMatch = rate.match(/benchmark:\s*(\d+(?:\.\d+)?)%/);
              if (benchMatch) {
                benchmark = parseFloat(benchMatch[1]);
              }
            }
            
            return {
              metricName: `${type.charAt(0).toUpperCase() + type.slice(1)} Defect Rate`,
              currentValue: value || 3.5,
              industryBenchmark: benchmark || 2.5,
              trend: value <= benchmark ? 'improving' : value <= benchmark * 1.5 ? 'stable' : 'declining',
              recommendations: [
                `Implement targeted quality control for ${type} issues`,
                `Review operator training on ${type} quality standards`,
                `Analyze root causes of ${type} defects`
              ]
            };
          };
          
          for (const [key, value] of Object.entries(aiResponse.qualityMetrics.defectRates)) {
            formattedMetrics.push(formatDefectRate(value, key));
          }
          
          // If no specific defect rates, add overall defect rate
          if (Object.keys(aiResponse.qualityMetrics.defectRates).length === 0) {
            formattedMetrics.push({
              metricName: 'Overall Defect Rate',
              currentValue: 3.2,
              industryBenchmark: 2.5,
              trend: 'stable',
              recommendations: [
                'Implement comprehensive quality inspection system',
                'Establish defect root cause analysis program',
                'Develop targeted quality improvement plan'
              ]
            });
          }
        }
      }
      
      // Check for production throughput
      if (aiResponse.throughput) {
        formattedMetrics.push({
          metricName: 'Production Throughput',
          currentValue: 85,
          industryBenchmark: 90,
          trend: 'stable',
          recommendations: [
            'Optimize production line balancing',
            'Reduce changeover times between styles',
            'Implement real-time production monitoring'
          ]
        });
      }
      
      // Check for lead time
      if (aiResponse.leadTime) {
        formattedMetrics.push({
          metricName: 'Manufacturing Lead Time',
          currentValue: customer.leadTime || 30,
          industryBenchmark: 25,
          trend: (customer.leadTime || 30) <= 25 ? 'improving' : (customer.leadTime || 30) <= 30 ? 'stable' : 'declining',
          recommendations: [
            'Streamline pre-production approval process',
            'Implement advanced production planning system',
            'Reduce work-in-process inventory'
          ]
        });
      }
    }
    
    // If we don't have enough metrics, add some standard ones
    if (formattedMetrics.length < 4) {
      const standardMetrics = [
        {
          metricName: 'Manufacturing Efficiency',
          currentValue: 78,
          industryBenchmark: 85,
          trend: 'stable',
          recommendations: [
            'Implement line balancing optimization',
            'Reduce machine downtime through preventive maintenance',
            'Enhance production planning methodology'
          ]
        },
        {
          metricName: 'Quality First-Pass Yield',
          currentValue: 92,
          industryBenchmark: 95,
          trend: 'stable',
          recommendations: [
            'Strengthen quality control at critical production stages',
            'Implement automated defect detection systems',
            'Enhance operator training on quality standards'
          ]
        },
        {
          metricName: 'On-Time Delivery Rate',
          currentValue: 88,
          industryBenchmark: 90,
          trend: 'improving',
          recommendations: [
            'Implement advanced production scheduling system',
            'Establish daily production tracking and reporting',
            'Develop early warning system for potential delays'
          ]
        },
        {
          metricName: 'Machine Utilization',
          currentValue: 76,
          industryBenchmark: 82,
          trend: 'declining',
          recommendations: [
            'Implement equipment effectiveness monitoring',
            'Optimize maintenance schedules',
            'Reduce changeover times between production runs'
          ]
        }
      ];
      
      // Add standard metrics that aren't already in the formattedMetrics
      const existingMetricNames = new Set(formattedMetrics.map(m => m.metricName));
      for (const metric of standardMetrics) {
        if (!existingMetricNames.has(metric.metricName)) {
          formattedMetrics.push(metric);
          if (formattedMetrics.length >= 6) break; // Limit to 6 metrics total
        }
      }
    }
    
    return res.json(formattedMetrics);
  } catch (error) {
    console.error("Error generating production metrics:", error);
    return res.status(500).json({ message: "Failed to generate metrics" });
  }
});

// Get market trends for the garment industry
router.get('/market-trends', async (_req: Request, res: Response) => {
  try {
    // Generate market trends
    const trends = await garmentCustomerAIService.generateMarketTrends();
    
    return res.json(trends);
  } catch (error) {
    console.error("Error generating market trends:", error);
    return res.status(500).json({ message: "Failed to generate trends" });
  }
});

export default router;