import OpenAI from "openai";
import { Task } from "@shared/schema";
import { AIService } from './aiService';

// Initialize AIService
const aiService = new AIService();

// Check if API key is available
const isApiKeyAvailable = () => !!process.env.OPENAI_API_KEY;

// Initialize OpenAI client if API key is available
let openai: OpenAI | null = null;
if (isApiKeyAvailable()) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const MODEL = "gpt-4o";

export interface TaskAIInsight {
  id?: string;
  title: string;
  description: string;
  type: 'suggestion' | 'warning' | 'alert' | 'info' | 'success';
  confidence: number;
  recommendations: string[];
}

export class TaskAIService {
  /**
   * Generate AI insights for a specific task
   */
  async generateTaskInsights(task: Task): Promise<TaskAIInsight[]> {
    try {
      // If OpenAI is not available, use mock data
      if (!openai) {
        console.log("OpenAI API key not available, using mock task insights");
        const insights = await aiService.generateTaskInsights([task]);
        return insights.map(insight => ({
          title: insight.insight,
          description: insight.actionItems.join(". "),
          type: insight.priority === 'high' ? 'warning' : 
                insight.priority === 'medium' ? 'suggestion' : 'info',
          confidence: 0.85,
          recommendations: insight.actionItems
        }));
      }
      
      const prompt = `
      As an AI assistant for primeX, an enterprise resource planning system for garments manufacturers,
      analyze the following task and provide insights to help the user be more productive and effective.
      
      Task details:
      Title: ${task.title}
      Description: ${task.description || 'No description provided'}
      Priority: ${task.priority}
      Due Date: ${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date'}
      Status: ${task.status}
      Tags: ${task.tags ? task.tags.join(', ') : 'No tags'}
      
      Provide 2-3 insights formatted as JSON with the following structure:
      [
        {
          "title": "Brief insight title",
          "description": "Detailed explanation of the insight (2-3 sentences)",
          "type": "suggestion" | "warning" | "alert" | "info" | "success",
          "confidence": 0.1-0.99 (confidence level),
          "recommendations": ["recommendation 1", "recommendation 2"]
        }
      ]
      
      Focus on insights related to:
      1. Garment manufacturing priorities for this specific task type
      2. Potential bottlenecks in the production process
      3. Optimization opportunities for manufacturing efficiency
      4. Critical deadlines and milestone tracking
      5. Quality control considerations for garment production
      `;
      
      try {
        // Call OpenAI API to generate insights
        const response = await openai.chat.completions.create({
          model: MODEL,
          messages: [
            { role: "system", content: "You are a productivity AI assistant for garment manufacturing professionals. Your insights should be specific, actionable, and tailored to manufacturing contexts." },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" }
        });
        
        const content = response.choices[0].message.content;
        if (!content) {
          throw new Error("No content received from OpenAI");
        }
        
        const parsedResponse = JSON.parse(content);
        return Array.isArray(parsedResponse) ? parsedResponse : [];
      } catch (openaiError) {
        console.error("OpenAI API error:", openaiError);
        
        // Fallback to mock insights if OpenAI call fails
        console.log("OpenAI API call failed, using mock task insights");
        const insights = await aiService.generateTaskInsights([task]);
        return insights.map(insight => ({
          title: insight.insight,
          description: insight.actionItems.join(". "),
          type: insight.priority === 'high' ? 'warning' : 
                insight.priority === 'medium' ? 'suggestion' : 'info',
          confidence: 0.85,
          recommendations: insight.actionItems
        }));
      }
    } catch (error) {
      console.error("Error generating task insights:", error);
      return [];
    }
  }

  /**
   * Generate deadline recommendations based on task priority and workload
   */
  async suggestDeadlines(tasks: Task[], newTaskTitle: string, newTaskDescription: string, priority: string): Promise<{suggestedDate: Date, reasoning: string}> {
    try {
      // Format existing tasks to analyze workload
      const existingTasksData = tasks.map(task => ({
        title: task.title,
        dueDate: task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date',
        priority: task.priority,
        status: task.status,
        completed: task.completed
      }));
      
      const prompt = `
      As an AI assistant for primeX, an enterprise resource planning system for garments manufacturers,
      analyze the following existing tasks and recommend an optimal deadline for a new task.
      
      Existing tasks (workload):
      ${JSON.stringify(existingTasksData, null, 2)}
      
      New task details:
      Title: ${newTaskTitle}
      Description: ${newTaskDescription || 'No description provided'}
      Priority: ${priority}
      
      Based on the existing workload and the priority of this new task, recommend a deadline.
      Consider:
      1. Current workload distribution
      2. Priority of this task
      3. Similar tasks in the system
      4. Realistic timeframes for manufacturing tasks
      
      Provide your response in JSON with this structure:
      {
        "suggestedDate": "YYYY-MM-DD",
        "reasoning": "Detailed explanation of why this date was suggested (3-4 sentences)"
      }
      `;
      
      // Call OpenAI API to generate deadline suggestion
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: "You are a productivity AI assistant for garment manufacturing professionals. Your deadline suggestions should be realistic and consider manufacturing workflows." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });
      
      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("No content received from OpenAI");
      }
      
      const result = JSON.parse(content);
      return {
        suggestedDate: new Date(result.suggestedDate),
        reasoning: result.reasoning
      };
    } catch (error) {
      console.error("Error suggesting deadline:", error);
      // Fallback to a default deadline (2 weeks from now)
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 14);
      
      return {
        suggestedDate: defaultDate,
        reasoning: "Unable to generate AI recommendation due to an error. A default deadline of two weeks has been suggested instead."
      };
    }
  }

  /**
   * Generate a summary of all tasks, including progress, bottlenecks and recommendations
   */
  async generateTasksSummary(tasks: Task[]): Promise<{
    completionRate: string,
    onTrackTasks: number,
    atRiskTasks: number,
    blockedTasks: number,
    keyBottlenecks: string[],
    recommendations: string[]
  }> {
    try {
      // Format tasks for analysis
      const tasksData = tasks.map(task => ({
        title: task.title,
        description: task.description,
        dueDate: task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date',
        priority: task.priority,
        status: task.status,
        completed: task.completed,
        completedAt: task.completedAt ? new Date(task.completedAt).toLocaleDateString() : null
      }));
      
      const prompt = `
      As an AI assistant for primeX, an enterprise resource planning system for garments manufacturers,
      analyze the following tasks and generate a comprehensive summary of the current state of work.
      
      Tasks data:
      ${JSON.stringify(tasksData, null, 2)}
      
      Generate a summary that includes:
      - Overall completion rate (percentage)
      - Number of tasks that are on track
      - Number of tasks that are at risk of missing deadlines
      - Number of tasks that are blocked or have issues
      - Key bottlenecks or common issues across multiple tasks
      - Strategic recommendations to improve overall productivity
      
      Provide your response in JSON with this structure:
      {
        "completionRate": "XX%",
        "onTrackTasks": Number,
        "atRiskTasks": Number,
        "blockedTasks": Number,
        "keyBottlenecks": ["Bottleneck 1", "Bottleneck 2"],
        "recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"]
      }
      
      Base your analysis on garment manufacturing industry standards and best practices.
      `;
      
      // Call OpenAI API to generate summary
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: "You are a productivity AI assistant for garment manufacturing professionals with expertise in production planning and time management. Your analysis should be data-driven and specific to manufacturing contexts." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });
      
      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("No content received from OpenAI");
      }
      
      return JSON.parse(content);
    } catch (error) {
      console.error("Error generating tasks summary:", error);
      return {
        completionRate: "0%",
        onTrackTasks: 0,
        atRiskTasks: 0,
        blockedTasks: 0,
        keyBottlenecks: ["Unable to analyze bottlenecks due to an error"],
        recommendations: ["Try again later when the service is available"]
      };
    }
  }
  
  /**
   * Analyze task dependencies and identify the critical path
   */
  async analyzeCriticalPath(tasks: Task[], dependencies: {taskId: number, dependsOn: number[]}[]): Promise<{
    criticalPath: number[],
    criticalTasks: {id: number, title: string}[],
    riskScore: number,
    recommendations: string[]
  }> {
    try {
      // Format tasks with their dependencies for analysis
      const tasksWithDependencies = tasks.map(task => {
        const taskDeps = dependencies.find(d => d.taskId === task.id);
        return {
          id: task.id,
          title: task.title,
          description: task.description,
          dueDate: task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date',
          priority: task.priority,
          status: task.status,
          completed: task.completed,
          dependsOn: taskDeps ? taskDeps.dependsOn : []
        };
      });
      
      const prompt = `
      As an AI assistant for primeX, an enterprise resource planning system for garments manufacturers,
      analyze the following tasks and their dependencies to identify the critical path.
      
      Tasks with dependencies:
      ${JSON.stringify(tasksWithDependencies, null, 2)}
      
      Identify the critical path (the sequence of dependent tasks that determines the minimum time needed to complete the entire project).
      
      Provide your response in JSON with this structure:
      {
        "criticalPath": [taskId1, taskId2, taskId3],
        "criticalTasks": [
          {"id": taskId1, "title": "Task title"},
          {"id": taskId2, "title": "Task title"}
        ],
        "riskScore": 0-10 (where 10 is highest risk),
        "recommendations": ["Recommendation 1", "Recommendation 2"]
      }
      
      Base your analysis on garment manufacturing industry practices and common production bottlenecks.
      `;
      
      // Call OpenAI API for critical path analysis
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: "You are a productivity AI assistant for garment manufacturing professionals with expertise in critical path analysis. You understand how task dependencies impact production timelines in manufacturing." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });
      
      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("No content received from OpenAI");
      }
      
      return JSON.parse(content);
    } catch (error) {
      console.error("Error analyzing critical path:", error);
      return {
        criticalPath: [],
        criticalTasks: [],
        riskScore: 5,
        recommendations: ["Unable to analyze critical path due to an error. Please try again later."]
      };
    }
  }
}

export const taskAIService = new TaskAIService();