import { 
  type User, type Tenant, type Subscription, type Customer, type CustomerAgent,
  type Task, type TaskComment, type TaskAIInsight, type Inquiry, type Warehouse,
  type ItemCategory, type ItemSubcategory, type ItemUnit, type Item, type ItemVariant,
  type ItemStock, type BillOfMaterials, type BomComponent, type PriceList, type PriceListItem,
  type InsertUser, type InsertTenant, type InsertSubscription, 
  type InsertCustomer, type InsertCustomerAgent, type InsertTask, type InsertTaskComment, 
  type InsertTaskAIInsight, type InsertInquiry, type InsertWarehouse, 
  type InsertItemCategory, type InsertItemSubcategory, type InsertItemUnit,
  type InsertItem, type InsertItemVariant, type InsertItemStock,
  type InsertBillOfMaterials, type InsertBomComponent, type InsertPriceList, type InsertPriceListItem,
  type OrderAmendment, type InsertOrderAmendment
} from "@shared/schema";
import { TaskFilters, ItemFilters, IStorage } from "./storage";

// Default admin user (password: admin123)
const DEFAULT_ADMIN: User = {
  id: 1,
  username: "admin",
  email: "admin@example.com",
  password: "$2b$10$mLGS6wXHYSJ9LZscXfEV1.fX8/EE.c/aR5aQO2TIj6zgsL5ZIRp3y", // hashed admin123
  firstName: null,
  lastName: null,
  role: "admin",
  tenantId: 1,
  isActive: true,
  lastLogin: null,
  createdAt: new Date(),
  updatedAt: new Date()
};

// Default tenant
const DEFAULT_TENANT: Tenant = {
  id: 1,
  name: "Prime7 Solutions",
  domain: "prime7.primex.app",
  logo: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

// Default subscription
const DEFAULT_SUBSCRIPTION: Subscription = {
  id: 1,
  tenantId: 1,
  plan: "enterprise",
  status: "active",
  startDate: new Date(),
  endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
  createdAt: new Date(),
  updatedAt: new Date()
};

// In-memory storage for testing and development
export class MemStorage implements IStorage {
  private users: User[] = [DEFAULT_ADMIN];
  private tenants: Tenant[] = [DEFAULT_TENANT];
  private subscriptions: Subscription[] = [DEFAULT_SUBSCRIPTION];
  private customers: Customer[] = [];
  private customerAgents: CustomerAgent[] = [];
  private tasks: Task[] = [];
  private taskComments: TaskComment[] = [];
  private taskAIInsights: TaskAIInsight[] = [];
  private inquiries: Inquiry[] = [];
  private currencies: Currency[] = [
    {
      id: 1,
      code: "USD",
      name: "US Dollar",
      symbol: "$",
      decimalPlaces: 2,
      isActive: true,
      isDefault: true,
      tenantId: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 2,
      code: "EUR",
      name: "Euro",
      symbol: "€",
      decimalPlaces: 2,
      isActive: true,
      isDefault: false,
      tenantId: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 3,
      code: "GBP",
      name: "British Pound",
      symbol: "£",
      decimalPlaces: 2,
      isActive: true,
      isDefault: false,
      tenantId: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];
  private exchangeRates: ExchangeRate[] = [
    {
      id: 1,
      currencyId: 2,
      rate: "1.07" as any, // EUR to USD
      validFrom: new Date("2023-01-01"),
      validTo: null,
      source: "manual",
      tenantId: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 2,
      currencyId: 3,
      rate: "1.27" as any, // GBP to USD
      validFrom: new Date("2023-01-01"),
      validTo: null,
      source: "manual",
      tenantId: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];
  private currencyInsights: CurrencyInsight[] = [
    {
      id: 1,
      currencyId: 2,
      insightType: "trend",
      title: "Euro trend analysis",
      content: "The Euro has shown stability against the US Dollar in recent months, maintaining a narrow trading range.",
      confidence: 0.85,
      tenantId: 1,
      createdAt: new Date()
    },
    {
      id: 2,
      currencyId: 3,
      insightType: "forecast",
      title: "British Pound forecast",
      content: "The British Pound is expected to strengthen against the US Dollar in the coming quarter due to positive economic indicators.",
      confidence: 0.75,
      tenantId: 1,
      createdAt: new Date()
    }
  ];
  private warehouses: Warehouse[] = [];
  private itemCategories: ItemCategory[] = [];
  private itemSubcategories: ItemSubcategory[] = [];
  private itemUnits: ItemUnit[] = [];
  private items: Item[] = [];
  private itemVariants: ItemVariant[] = [];
  private itemStock: ItemStock[] = [];
  private billOfMaterials: BillOfMaterials[] = [];
  private bomComponents: BomComponent[] = [];
  private priceLists: PriceList[] = [];
  private priceListItems: PriceListItem[] = [];

  // User operations
  async getRoleById(id: number): Promise<any | undefined> {
    return undefined;
  }

  async getUserById(id: number): Promise<User | undefined> {
    return this.users.find(user => user.id === id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.users.find(user => user.username === username);
  }

  async createUser(user: InsertUser): Promise<User> {
    const newUser: User = {
      ...user,
      id: this.users.length + 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.push(newUser);
    return newUser;
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User> {
    const index = this.users.findIndex(user => user.id === id);
    if (index === -1) throw new Error("User not found");
    
    this.users[index] = {
      ...this.users[index],
      ...data,
      updatedAt: new Date()
    };
    
    return this.users[index];
  }
  
  // Tenant operations
  async getTenantById(id: number): Promise<Tenant | undefined> {
    return this.tenants.find(tenant => tenant.id === id);
  }

  async getTenantByDomain(domain: string): Promise<Tenant | undefined> {
    return this.tenants.find(tenant => tenant.domain === domain);
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const newTenant: Tenant = {
      ...tenant,
      id: this.tenants.length + 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.tenants.push(newTenant);
    return newTenant;
  }

  async updateTenant(id: number, data: Partial<InsertTenant>): Promise<Tenant> {
    const index = this.tenants.findIndex(tenant => tenant.id === id);
    if (index === -1) throw new Error("Tenant not found");
    
    this.tenants[index] = {
      ...this.tenants[index],
      ...data,
      updatedAt: new Date()
    };
    
    return this.tenants[index];
  }
  
  // Subscription operations
  async getSubscriptionById(id: number): Promise<Subscription | undefined> {
    return this.subscriptions.find(sub => sub.id === id);
  }

  async getActiveSubscriptionByTenantId(tenantId: number): Promise<Subscription | undefined> {
    return this.subscriptions.find(sub => 
      sub.tenantId === tenantId && sub.status === "active"
    );
  }

  async createSubscription(subscription: InsertSubscription): Promise<Subscription> {
    const newSubscription: Subscription = {
      ...subscription,
      id: this.subscriptions.length + 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.subscriptions.push(newSubscription);
    return newSubscription;
  }

  async updateSubscription(id: number, data: Partial<InsertSubscription>): Promise<Subscription> {
    const index = this.subscriptions.findIndex(sub => sub.id === id);
    if (index === -1) throw new Error("Subscription not found");
    
    this.subscriptions[index] = {
      ...this.subscriptions[index],
      ...data,
      updatedAt: new Date()
    };
    
    return this.subscriptions[index];
  }
  
  // Customer operations
  async getAllCustomers(tenantId: number): Promise<Customer[]> {
    return this.customers.filter(customer => customer.tenantId === tenantId);
  }

  async getCustomerById(id: number, tenantId: number): Promise<Customer | undefined> {
    return this.customers.find(customer => 
      customer.id === id && customer.tenantId === tenantId
    );
  }

  async getCustomerByCustomerId(customerId: string, tenantId: number): Promise<Customer | undefined> {
    return this.customers.find(customer => 
      customer.customerId === customerId && customer.tenantId === tenantId
    );
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    // Generate a unique customer ID in the format "CUS-XXXXX"
    const customerId = `CUS-${Math.floor(10000 + Math.random() * 90000)}`;
    
    // Create new customer with all required fields
    const newCustomer: Customer = {
      ...customer,
      id: this.customers.length + 1,
      customerId: customerId,
      isActive: true,
      hasAgent: customer.hasAgent || false,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.customers.push(newCustomer);
    console.log('Customer created in memory storage:', newCustomer);
    return newCustomer;
  }

  async updateCustomer(id: number, tenantId: number, data: Partial<InsertCustomer>): Promise<Customer> {
    const index = this.customers.findIndex(customer => 
      customer.id === id && customer.tenantId === tenantId
    );
    if (index === -1) throw new Error("Customer not found");
    
    this.customers[index] = {
      ...this.customers[index],
      ...data,
      updatedAt: new Date()
    };
    
    return this.customers[index];
  }

  async setCustomerStatus(id: number, tenantId: number, isActive: boolean): Promise<Customer> {
    const index = this.customers.findIndex(customer => 
      customer.id === id && customer.tenantId === tenantId
    );
    if (index === -1) throw new Error("Customer not found");
    
    this.customers[index] = {
      ...this.customers[index],
      isActive,
      updatedAt: new Date()
    };
    
    return this.customers[index];
  }

  async deleteCustomer(id: number, tenantId: number): Promise<boolean> {
    const index = this.customers.findIndex(customer => 
      customer.id === id && customer.tenantId === tenantId
    );
    if (index === -1) return false;
    
    this.customers.splice(index, 1);
    return true;
  }
  
  // Customer Agent operations
  async getAgentByCustomerId(customerId: number): Promise<CustomerAgent | undefined> {
    return this.customerAgents.find(agent => agent.customerId === customerId);
  }

  async createCustomerAgent(agent: InsertCustomerAgent): Promise<CustomerAgent> {
    const newAgent: CustomerAgent = {
      ...agent,
      id: this.customerAgents.length + 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.customerAgents.push(newAgent);
    return newAgent;
  }

  async updateCustomerAgent(customerId: number, data: Partial<InsertCustomerAgent>): Promise<CustomerAgent> {
    const index = this.customerAgents.findIndex(agent => agent.customerId === customerId);
    if (index === -1) throw new Error("Customer agent not found");
    
    this.customerAgents[index] = {
      ...this.customerAgents[index],
      ...data,
      updatedAt: new Date()
    };
    
    return this.customerAgents[index];
  }

  async deleteCustomerAgent(customerId: number): Promise<boolean> {
    const index = this.customerAgents.findIndex(agent => agent.customerId === customerId);
    if (index === -1) return false;
    
    this.customerAgents.splice(index, 1);
    return true;
  }
  
  // Task operations
  async getAllTasks(tenantId: number, filters?: TaskFilters): Promise<Task[]> {
    let filteredTasks = this.tasks.filter(task => task.tenantId === tenantId);
    
    if (filters) {
      if (filters.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        filteredTasks = filteredTasks.filter(task => statuses.includes(task.status));
      }
      
      if (filters.priority) {
        const priorities = Array.isArray(filters.priority) ? filters.priority : [filters.priority];
        filteredTasks = filteredTasks.filter(task => priorities.includes(task.priority));
      }
      
      if (filters.assignedTo !== undefined) {
        filteredTasks = filteredTasks.filter(task => task.assignedTo === filters.assignedTo);
      }
      
      if (filters.createdBy !== undefined) {
        filteredTasks = filteredTasks.filter(task => task.createdBy === filters.createdBy);
      }
      
      if (filters.completed !== undefined) {
        filteredTasks = filteredTasks.filter(task => task.completed === filters.completed);
      }
      
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filteredTasks = filteredTasks.filter(task => 
          task.title.toLowerCase().includes(searchLower) || 
          (task.description && task.description.toLowerCase().includes(searchLower))
        );
      }
      
      if (filters.relatedEntityType) {
        filteredTasks = filteredTasks.filter(task => task.relatedEntityType === filters.relatedEntityType);
      }
      
      if (filters.relatedEntityId !== undefined) {
        filteredTasks = filteredTasks.filter(task => task.relatedEntityId === filters.relatedEntityId);
      }
      
      if (filters.sortBy) {
        const direction = filters.sortDirection === 'desc' ? -1 : 1;
        filteredTasks.sort((a, b) => {
          const aValue = a[filters.sortBy as keyof Task] as any;
          const bValue = b[filters.sortBy as keyof Task] as any;
          
          if (aValue < bValue) return -1 * direction;
          if (aValue > bValue) return 1 * direction;
          return 0;
        });
      }
      
      if (filters.limit) {
        const offset = filters.offset || 0;
        filteredTasks = filteredTasks.slice(offset, offset + filters.limit);
      }
    }
    
    return filteredTasks;
  }

  async getTaskById(id: number, tenantId: number): Promise<Task | undefined> {
    return this.tasks.find(task => 
      task.id === id && task.tenantId === tenantId
    );
  }

  async createTask(task: InsertTask): Promise<Task> {
    const newTask: Task = {
      ...task,
      id: this.tasks.length + 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.tasks.push(newTask);
    return newTask;
  }

  async updateTask(id: number, tenantId: number, data: Partial<InsertTask>): Promise<Task> {
    const index = this.tasks.findIndex(task => 
      task.id === id && task.tenantId === tenantId
    );
    if (index === -1) throw new Error("Task not found");
    
    this.tasks[index] = {
      ...this.tasks[index],
      ...data,
      updatedAt: new Date()
    };
    
    return this.tasks[index];
  }

  async completeTask(id: number, tenantId: number, completed: boolean): Promise<Task> {
    const index = this.tasks.findIndex(task => 
      task.id === id && task.tenantId === tenantId
    );
    if (index === -1) throw new Error("Task not found");
    
    this.tasks[index] = {
      ...this.tasks[index],
      completed,
      completedAt: completed ? new Date() : null,
      updatedAt: new Date()
    };
    
    return this.tasks[index];
  }

  async deleteTask(id: number, tenantId: number): Promise<boolean> {
    const index = this.tasks.findIndex(task => 
      task.id === id && task.tenantId === tenantId
    );
    if (index === -1) return false;
    
    this.tasks.splice(index, 1);
    return true;
  }
  
  // Task comments operations
  async getTaskComments(taskId: number): Promise<TaskComment[]> {
    return this.taskComments.filter(comment => comment.taskId === taskId);
  }

  async createTaskComment(comment: InsertTaskComment): Promise<TaskComment> {
    const newComment: TaskComment = {
      ...comment,
      id: this.taskComments.length + 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.taskComments.push(newComment);
    return newComment;
  }

  async deleteTaskComment(id: number): Promise<boolean> {
    const index = this.taskComments.findIndex(comment => comment.id === id);
    if (index === -1) return false;
    
    this.taskComments.splice(index, 1);
    return true;
  }
  
  // Task AI insights operations
  async getTaskAIInsights(taskId: number): Promise<TaskAIInsight[]> {
    return this.taskAIInsights.filter(insight => insight.taskId === taskId);
  }

  async createTaskAIInsight(insight: InsertTaskAIInsight): Promise<TaskAIInsight> {
    const newInsight: TaskAIInsight = {
      ...insight,
      id: this.taskAIInsights.length + 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.taskAIInsights.push(newInsight);
    return newInsight;
  }
  
  // Inquiry operations
  async getAllInquiries(tenantId: number): Promise<Inquiry[]> {
    return this.inquiries.filter(inquiry => inquiry.tenantId === tenantId);
  }

  async getInquiryById(id: number, tenantId: number): Promise<Inquiry | undefined> {
    return this.inquiries.find(inquiry => 
      inquiry.id === id && inquiry.tenantId === tenantId
    );
  }

  async getInquiryByInquiryId(inquiryId: string, tenantId: number): Promise<Inquiry | undefined> {
    return this.inquiries.find(inquiry => 
      inquiry.inquiryId === inquiryId && inquiry.tenantId === tenantId
    );
  }

  async createInquiry(inquiry: InsertInquiry): Promise<Inquiry> {
    const newInquiry: Inquiry = {
      ...inquiry,
      id: this.inquiries.length + 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.inquiries.push(newInquiry);
    return newInquiry;
  }

  async updateInquiry(id: number, tenantId: number, data: Partial<InsertInquiry>): Promise<Inquiry> {
    const index = this.inquiries.findIndex(inquiry => 
      inquiry.id === id && inquiry.tenantId === tenantId
    );
    if (index === -1) throw new Error("Inquiry not found");
    
    this.inquiries[index] = {
      ...this.inquiries[index],
      ...data,
      updatedAt: new Date()
    };
    
    return this.inquiries[index];
  }

  async deleteInquiry(id: number, tenantId: number): Promise<boolean> {
    const index = this.inquiries.findIndex(inquiry => 
      inquiry.id === id && inquiry.tenantId === tenantId
    );
    if (index === -1) return false;
    
    this.inquiries.splice(index, 1);
    return true;
  }
  
  // AI Inquiry insights operations
  async generateInquiryInsights(inquiryId: number): Promise<any> {
    // Mock implementation - would be replaced with actual AI implementation
    return {
      summary: "This is a mock insight summary for testing purposes",
      recommendations: [
        "First mock recommendation",
        "Second mock recommendation"
      ],
      sentiment: "positive"
    };
  }
  
  // Item operations
  async getAllItems(tenantId: number, filters?: ItemFilters): Promise<Item[]> {
    let filteredItems = this.items.filter(item => item.tenantId === tenantId);
    
    if (filters) {
      if (filters.categoryId !== undefined) {
        filteredItems = filteredItems.filter(item => item.categoryId === filters.categoryId);
      }
      
      if (filters.subcategoryId !== undefined) {
        filteredItems = filteredItems.filter(item => item.subcategoryId === filters.subcategoryId);
      }
      
      if (filters.type) {
        const types = Array.isArray(filters.type) ? filters.type : [filters.type];
        filteredItems = filteredItems.filter(item => types.includes(item.type));
      }
      
      if (filters.searchQuery) {
        const searchLower = filters.searchQuery.toLowerCase();
        filteredItems = filteredItems.filter(item => 
          item.name.toLowerCase().includes(searchLower) || 
          item.itemCode.toLowerCase().includes(searchLower) ||
          (item.description && item.description.toLowerCase().includes(searchLower))
        );
      }
      
      if (filters.isActive !== undefined) {
        filteredItems = filteredItems.filter(item => item.isActive === filters.isActive);
      }
      
      if (filters.hasVariants !== undefined) {
        filteredItems = filteredItems.filter(item => item.hasVariants === filters.hasVariants);
      }
      
      if (filters.isStockable !== undefined) {
        filteredItems = filteredItems.filter(item => item.isStockable === filters.isStockable);
      }
      
      if (filters.isServiceItem !== undefined) {
        filteredItems = filteredItems.filter(item => item.isServiceItem === filters.isServiceItem);
      }
      
      if (filters.isBillOfMaterial !== undefined) {
        filteredItems = filteredItems.filter(item => item.isBillOfMaterial === filters.isBillOfMaterial);
      }
      
      if (filters.tags && filters.tags.length > 0) {
        filteredItems = filteredItems.filter(item => 
          item.tags && filters.tags!.some(tag => item.tags!.includes(tag))
        );
      }
      
      // Sort items if sortBy is provided
      if (filters.sortBy) {
        const direction = filters.sortDirection === 'desc' ? -1 : 1;
        filteredItems.sort((a, b) => {
          const aValue = a[filters.sortBy as keyof Item] as any;
          const bValue = b[filters.sortBy as keyof Item] as any;
          
          if (aValue < bValue) return -1 * direction;
          if (aValue > bValue) return 1 * direction;
          return 0;
        });
      }
      
      // Apply pagination if limit is provided
      if (filters.limit !== undefined) {
        const offset = filters.offset || 0;
        filteredItems = filteredItems.slice(offset, offset + filters.limit);
      }
    }
    
    return filteredItems;
  }
  
  async getItemById(id: number, tenantId: number): Promise<Item | undefined> {
    return this.items.find(item => item.id === id && item.tenantId === tenantId);
  }
  
  async getItemByItemCode(itemCode: string, tenantId: number): Promise<Item | undefined> {
    return this.items.find(item => item.itemCode === itemCode && item.tenantId === tenantId);
  }
  
  async createItem(item: InsertItem): Promise<Item> {
    const newId = this.items.length > 0 ? Math.max(...this.items.map(i => i.id)) + 1 : 1;
    
    const newItem: Item = {
      ...item,
      id: newId,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.items.push(newItem);
    return newItem;
  }
  
  async updateItem(id: number, tenantId: number, data: Partial<InsertItem>): Promise<Item> {
    const index = this.items.findIndex(item => item.id === id && item.tenantId === tenantId);
    if (index === -1) throw new Error("Item not found");
    
    this.items[index] = {
      ...this.items[index],
      ...data,
      updatedAt: new Date()
    };
    
    return this.items[index];
  }
  
  async deleteItem(id: number, tenantId: number): Promise<boolean> {
    const index = this.items.findIndex(item => item.id === id && item.tenantId === tenantId);
    if (index === -1) return false;
    
    this.items.splice(index, 1);
    return true;
  }
  
  // Item variant operations
  async getItemVariants(itemId: number, tenantId: number): Promise<ItemVariant[]> {
    return this.itemVariants.filter(variant => 
      variant.parentItemId === itemId && variant.tenantId === tenantId
    );
  }
  
  async getItemVariantById(id: number, tenantId: number): Promise<ItemVariant | undefined> {
    return this.itemVariants.find(variant => 
      variant.id === id && variant.tenantId === tenantId
    );
  }
  
  async createItemVariant(variant: InsertItemVariant): Promise<ItemVariant> {
    const newId = this.itemVariants.length > 0 ? Math.max(...this.itemVariants.map(v => v.id)) + 1 : 1;
    
    const newVariant: ItemVariant = {
      ...variant,
      id: newId,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.itemVariants.push(newVariant);
    
    // Update the parent item to set hasVariants to true
    const parentItemIndex = this.items.findIndex(item => 
      item.id === variant.parentItemId && item.tenantId === variant.tenantId
    );
    
    if (parentItemIndex !== -1) {
      this.items[parentItemIndex].hasVariants = true;
    }
    
    return newVariant;
  }
  
  async updateItemVariant(id: number, tenantId: number, data: Partial<InsertItemVariant>): Promise<ItemVariant> {
    const index = this.itemVariants.findIndex(variant => 
      variant.id === id && variant.tenantId === tenantId
    );
    if (index === -1) throw new Error("Item variant not found");
    
    this.itemVariants[index] = {
      ...this.itemVariants[index],
      ...data,
      updatedAt: new Date()
    };
    
    return this.itemVariants[index];
  }
  
  async deleteItemVariant(id: number, tenantId: number): Promise<boolean> {
    const index = this.itemVariants.findIndex(variant => 
      variant.id === id && variant.tenantId === tenantId
    );
    if (index === -1) return false;
    
    const parentItemId = this.itemVariants[index].parentItemId;
    
    this.itemVariants.splice(index, 1);
    
    // Check if this was the last variant for the parent item
    const remainingVariants = this.itemVariants.filter(variant => variant.parentItemId === parentItemId);
    if (remainingVariants.length === 0) {
      // Update the parent item to set hasVariants to false
      const parentItemIndex = this.items.findIndex(item => item.id === parentItemId);
      if (parentItemIndex !== -1) {
        this.items[parentItemIndex].hasVariants = false;
      }
    }
    
    return true;
  }
  
  // Item stock operations
  async getItemStock(itemId: number, tenantId: number, warehouseId?: number): Promise<ItemStock[]> {
    return this.itemStock.filter(stock => 
      stock.itemId === itemId && 
      stock.tenantId === tenantId &&
      (warehouseId === undefined || stock.warehouseId === warehouseId)
    );
  }
  
  async getItemStockById(id: number, tenantId: number): Promise<ItemStock | undefined> {
    return this.itemStock.find(stock => 
      stock.id === id && stock.tenantId === tenantId
    );
  }
  
  async updateItemStock(id: number, tenantId: number, data: Partial<InsertItemStock>): Promise<ItemStock> {
    const index = this.itemStock.findIndex(stock => 
      stock.id === id && stock.tenantId === tenantId
    );
    if (index === -1) throw new Error("Item stock not found");
    
    this.itemStock[index] = {
      ...this.itemStock[index],
      ...data,
      updatedAt: new Date()
    };
    
    // Recalculate the available quantity
    if (data.quantity !== undefined || data.reservedQuantity !== undefined) {
      const quantity = data.quantity !== undefined ? 
        parseFloat(data.quantity.toString()) : 
        parseFloat(this.itemStock[index].quantity.toString());
      
      const reservedQuantity = data.reservedQuantity !== undefined ? 
        parseFloat(data.reservedQuantity.toString()) : 
        parseFloat(this.itemStock[index].reservedQuantity.toString());
      
      this.itemStock[index].availableQuantity = (quantity - reservedQuantity).toString();
    }
    
    return this.itemStock[index];
  }
  
  async adjustItemStock(
    itemId: number, 
    warehouseId: number, 
    quantity: number, 
    reason: string, 
    tenantId: number
  ): Promise<ItemStock> {
    // Find existing stock record
    let stockIndex = this.itemStock.findIndex(stock => 
      stock.itemId === itemId && 
      stock.warehouseId === warehouseId && 
      stock.tenantId === tenantId
    );
    
    // If stock record doesn't exist, create it
    if (stockIndex === -1) {
      const newId = this.itemStock.length > 0 ? Math.max(...this.itemStock.map(s => s.id)) + 1 : 1;
      
      const newStock: ItemStock = {
        id: newId,
        itemId,
        warehouseId,
        tenantId,
        quantity: "0",
        reservedQuantity: "0",
        availableQuantity: "0",
        unitCost: "0",
        locationCode: "",
        lotNumber: null,
        serialNumbers: null,
        minimumStockLevel: "0",
        reorderPoint: "0",
        reorderQuantity: "0",
        expiryDate: null,
        lastCountDate: null,
        maximumStockLevel: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      this.itemStock.push(newStock);
      stockIndex = this.itemStock.length - 1;
    }
    
    // Calculate the new quantity
    const currentQuantity = parseFloat(this.itemStock[stockIndex].quantity.toString());
    const newQuantity = currentQuantity + quantity;
    const reservedQuantity = parseFloat(this.itemStock[stockIndex].reservedQuantity.toString());
    
    // Update the stock record
    this.itemStock[stockIndex] = {
      ...this.itemStock[stockIndex],
      quantity: newQuantity.toString(),
      availableQuantity: (newQuantity - reservedQuantity).toString(),
      updatedAt: new Date()
    };
    
    return this.itemStock[stockIndex];
  }
  
  // Bill of Materials operations
  async getItemBOM(itemId: number, tenantId: number, version?: string): Promise<BillOfMaterials | undefined> {
    let boms = this.billOfMaterials.filter(bom => 
      bom.itemId === itemId && bom.tenantId === tenantId
    );
    
    if (version) {
      return boms.find(bom => bom.version === version);
    } else {
      // If no version specified, return the default BOM or the first one
      const defaultBom = boms.find(bom => bom.isDefault);
      return defaultBom || boms[0];
    }
  }
  
  async getBillOfMaterialsById(id: number, tenantId: number): Promise<BillOfMaterials | undefined> {
    return this.billOfMaterials.find(bom => 
      bom.id === id && bom.tenantId === tenantId
    );
  }
  
  async createBillOfMaterials(bom: InsertBillOfMaterials): Promise<BillOfMaterials> {
    const newId = this.billOfMaterials.length > 0 ? Math.max(...this.billOfMaterials.map(b => b.id)) + 1 : 1;
    
    // If this is the first BOM for the item or isDefault is true, ensure it's set as the default
    const isFirstBom = !this.billOfMaterials.some(b => b.itemId === bom.itemId);
    const isDefault = bom.isDefault === undefined ? isFirstBom : bom.isDefault;
    
    // If this BOM is being set as default, unset default flag on any other BOMs for the same item
    if (isDefault) {
      this.billOfMaterials.forEach((b, index) => {
        if (b.itemId === bom.itemId && b.isDefault) {
          this.billOfMaterials[index].isDefault = false;
        }
      });
    }
    
    const newBom: BillOfMaterials = {
      ...bom,
      id: newId,
      isDefault,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.billOfMaterials.push(newBom);
    
    // Update the item to indicate it has a Bill of Materials
    const itemIndex = this.items.findIndex(item => item.id === bom.itemId);
    if (itemIndex !== -1) {
      this.items[itemIndex].isBillOfMaterial = true;
    }
    
    return newBom;
  }
  
  async updateBillOfMaterials(id: number, tenantId: number, data: Partial<InsertBillOfMaterials>): Promise<BillOfMaterials> {
    const index = this.billOfMaterials.findIndex(bom => 
      bom.id === id && bom.tenantId === tenantId
    );
    if (index === -1) throw new Error("Bill of Materials not found");
    
    // If this BOM is being set as default, unset default flag on any other BOMs for the same item
    if (data.isDefault) {
      const itemId = this.billOfMaterials[index].itemId;
      this.billOfMaterials.forEach((b, i) => {
        if (i !== index && b.itemId === itemId && b.isDefault) {
          this.billOfMaterials[i].isDefault = false;
        }
      });
    }
    
    this.billOfMaterials[index] = {
      ...this.billOfMaterials[index],
      ...data,
      updatedAt: new Date()
    };
    
    return this.billOfMaterials[index];
  }
  
  async deleteBillOfMaterials(id: number, tenantId: number): Promise<boolean> {
    const index = this.billOfMaterials.findIndex(bom => 
      bom.id === id && bom.tenantId === tenantId
    );
    if (index === -1) return false;
    
    const itemId = this.billOfMaterials[index].itemId;
    const wasDefault = this.billOfMaterials[index].isDefault;
    
    this.billOfMaterials.splice(index, 1);
    
    // If this was the default BOM, set another one as default if available
    if (wasDefault) {
      const remainingBoms = this.billOfMaterials.filter(bom => bom.itemId === itemId);
      if (remainingBoms.length > 0) {
        remainingBoms[0].isDefault = true;
      }
    }
    
    // Check if this was the last BOM for the item
    const remainingBoms = this.billOfMaterials.filter(bom => bom.itemId === itemId);
    if (remainingBoms.length === 0) {
      // Update the item to indicate it no longer has a Bill of Materials
      const itemIndex = this.items.findIndex(item => item.id === itemId);
      if (itemIndex !== -1) {
        this.items[itemIndex].isBillOfMaterial = false;
      }
    }
    
    return true;
  }
  
  // BOM component operations
  async getBOMComponents(bomId: number, tenantId: number): Promise<BomComponent[]> {
    return this.bomComponents.filter(component => 
      component.bomId === bomId && component.tenantId === tenantId
    );
  }
  
  async createBOMComponent(component: InsertBomComponent): Promise<BomComponent> {
    const newId = this.bomComponents.length > 0 ? Math.max(...this.bomComponents.map(c => c.id)) + 1 : 1;
    
    const newComponent: BomComponent = {
      ...component,
      id: newId,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.bomComponents.push(newComponent);
    
    // Update the BOM's total cost
    this.updateBOMTotalCost(component.bomId);
    
    return newComponent;
  }
  
  async updateBOMComponent(id: number, tenantId: number, data: Partial<InsertBomComponent>): Promise<BomComponent> {
    const index = this.bomComponents.findIndex(component => 
      component.id === id && component.tenantId === tenantId
    );
    if (index === -1) throw new Error("BOM component not found");
    
    this.bomComponents[index] = {
      ...this.bomComponents[index],
      ...data,
      updatedAt: new Date()
    };
    
    // Update the BOM's total cost
    this.updateBOMTotalCost(this.bomComponents[index].bomId);
    
    return this.bomComponents[index];
  }
  
  async deleteBOMComponent(id: number, tenantId: number): Promise<boolean> {
    const index = this.bomComponents.findIndex(component => 
      component.id === id && component.tenantId === tenantId
    );
    if (index === -1) return false;
    
    const bomId = this.bomComponents[index].bomId;
    
    this.bomComponents.splice(index, 1);
    
    // Update the BOM's total cost
    this.updateBOMTotalCost(bomId);
    
    return true;
  }
  
  // Helper function to update a BOM's total cost
  private updateBOMTotalCost(bomId: number): void {
    const components = this.bomComponents.filter(component => component.bomId === bomId);
    let totalCost = 0;
    
    for (const component of components) {
      const quantity = parseFloat(component.quantity.toString());
      const costPerUnit = parseFloat(component.costPerUnit?.toString() || "0");
      totalCost += quantity * costPerUnit;
    }
    
    const bomIndex = this.billOfMaterials.findIndex(bom => bom.id === bomId);
    if (bomIndex !== -1) {
      this.billOfMaterials[bomIndex].totalCost = totalCost.toString();
    }
  }
  
  // Price list operations
  async getAllPriceLists(tenantId: number, isActive?: boolean): Promise<PriceList[]> {
    let filteredLists = this.priceLists.filter(list => list.tenantId === tenantId);
    
    if (isActive !== undefined) {
      filteredLists = filteredLists.filter(list => list.isActive === isActive);
    }
    
    return filteredLists;
  }
  
  async getPriceListById(id: number, tenantId: number): Promise<PriceList | undefined> {
    return this.priceLists.find(list => 
      list.id === id && list.tenantId === tenantId
    );
  }
  
  async createPriceList(priceList: InsertPriceList): Promise<PriceList> {
    const newId = this.priceLists.length > 0 ? Math.max(...this.priceLists.map(p => p.id)) + 1 : 1;
    
    // If this price list is being set as default, unset default flag on any other price lists
    if (priceList.isDefault) {
      this.priceLists.forEach((p, index) => {
        if (p.tenantId === priceList.tenantId && p.isDefault) {
          this.priceLists[index].isDefault = false;
        }
      });
    }
    
    const newPriceList: PriceList = {
      ...priceList,
      id: newId,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.priceLists.push(newPriceList);
    return newPriceList;
  }
  
  async updatePriceList(id: number, tenantId: number, data: Partial<InsertPriceList>): Promise<PriceList> {
    const index = this.priceLists.findIndex(list => 
      list.id === id && list.tenantId === tenantId
    );
    if (index === -1) throw new Error("Price list not found");
    
    // If this price list is being set as default, unset default flag on any other price lists
    if (data.isDefault) {
      this.priceLists.forEach((p, i) => {
        if (i !== index && p.tenantId === tenantId && p.isDefault) {
          this.priceLists[i].isDefault = false;
        }
      });
    }
    
    this.priceLists[index] = {
      ...this.priceLists[index],
      ...data,
      updatedAt: new Date()
    };
    
    return this.priceLists[index];
  }
  
  async deletePriceList(id: number, tenantId: number): Promise<boolean> {
    const index = this.priceLists.findIndex(list => 
      list.id === id && list.tenantId === tenantId
    );
    if (index === -1) return false;
    
    const wasDefault = this.priceLists[index].isDefault;
    
    // Delete the price list
    this.priceLists.splice(index, 1);
    
    // Delete all price list items associated with this price list
    this.priceListItems = this.priceListItems.filter(item => item.priceListId !== id);
    
    // If this was the default price list, set another one as default if available
    if (wasDefault) {
      const remainingLists = this.priceLists.filter(list => list.tenantId === tenantId);
      if (remainingLists.length > 0) {
        remainingLists[0].isDefault = true;
      }
    }
    
    return true;
  }
  
  // Price list item operations
  async getItemPricing(itemId: number, tenantId: number, priceListId?: number): Promise<PriceListItem[]> {
    return this.priceListItems.filter(item => 
      item.itemId === itemId && 
      item.tenantId === tenantId &&
      (priceListId === undefined || item.priceListId === priceListId)
    );
  }
  
  async getPriceListItems(priceListId: number, tenantId: number): Promise<PriceListItem[]> {
    return this.priceListItems.filter(item => 
      item.priceListId === priceListId && item.tenantId === tenantId
    );
  }
  
  async createPriceListItem(priceListItem: InsertPriceListItem): Promise<PriceListItem> {
    const newId = this.priceListItems.length > 0 ? Math.max(...this.priceListItems.map(p => p.id)) + 1 : 1;
    
    const newPriceListItem: PriceListItem = {
      ...priceListItem,
      id: newId,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.priceListItems.push(newPriceListItem);
    return newPriceListItem;
  }
  
  async updatePriceListItem(id: number, tenantId: number, data: Partial<InsertPriceListItem>): Promise<PriceListItem> {
    const index = this.priceListItems.findIndex(item => 
      item.id === id && item.tenantId === tenantId
    );
    if (index === -1) throw new Error("Price list item not found");
    
    this.priceListItems[index] = {
      ...this.priceListItems[index],
      ...data,
      updatedAt: new Date()
    };
    
    return this.priceListItems[index];
  }
  
  async deletePriceListItem(id: number, tenantId: number): Promise<boolean> {
    const index = this.priceListItems.findIndex(item => 
      item.id === id && item.tenantId === tenantId
    );
    if (index === -1) return false;
    
    this.priceListItems.splice(index, 1);
    return true;
  }
  
  // Warehouse operations
  async getAllWarehouses(tenantId: number): Promise<Warehouse[]> {
    return this.warehouses.filter(warehouse => warehouse.tenantId === tenantId);
  }

  async getWarehouseById(id: number, tenantId: number): Promise<Warehouse | undefined> {
    return this.warehouses.find(warehouse => 
      warehouse.id === id && warehouse.tenantId === tenantId
    );
  }

  async getWarehouseByWarehouseId(warehouseId: string, tenantId: number): Promise<Warehouse | undefined> {
    return this.warehouses.find(warehouse => 
      warehouse.warehouseId === warehouseId && warehouse.tenantId === tenantId
    );
  }

  async createWarehouse(warehouse: InsertWarehouse): Promise<Warehouse> {
    const newWarehouse: Warehouse = {
      ...warehouse,
      id: this.warehouses.length + 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.warehouses.push(newWarehouse);
    return newWarehouse;
  }

  async updateWarehouse(id: number, tenantId: number, data: Partial<InsertWarehouse>): Promise<Warehouse> {
    const index = this.warehouses.findIndex(warehouse => 
      warehouse.id === id && warehouse.tenantId === tenantId
    );
    if (index === -1) throw new Error("Warehouse not found");
    
    this.warehouses[index] = {
      ...this.warehouses[index],
      ...data,
      updatedAt: new Date()
    };
    
    return this.warehouses[index];
  }

  async deleteWarehouse(id: number, tenantId: number): Promise<boolean> {
    const index = this.warehouses.findIndex(warehouse => 
      warehouse.id === id && warehouse.tenantId === tenantId
    );
    if (index === -1) return false;
    
    this.warehouses.splice(index, 1);
    return true;
  }
  
  // Item Category operations
  async getAllItemCategories(tenantId: number): Promise<ItemCategory[]> {
    return this.itemCategories.filter(category => category.tenantId === tenantId);
  }

  async getItemCategoryById(id: number, tenantId: number): Promise<ItemCategory | undefined> {
    return this.itemCategories.find(category => 
      category.id === id && category.tenantId === tenantId
    );
  }

  async getItemCategoryByCategoryId(categoryId: string, tenantId: number): Promise<ItemCategory | undefined> {
    return this.itemCategories.find(category => 
      category.categoryId === categoryId && category.tenantId === tenantId
    );
  }

  async createItemCategory(category: InsertItemCategory): Promise<ItemCategory> {
    const newCategory: ItemCategory = {
      ...category,
      id: this.itemCategories.length + 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.itemCategories.push(newCategory);
    return newCategory;
  }

  async updateItemCategory(id: number, tenantId: number, data: Partial<InsertItemCategory>): Promise<ItemCategory> {
    const index = this.itemCategories.findIndex(category => 
      category.id === id && category.tenantId === tenantId
    );
    if (index === -1) throw new Error("Item category not found");
    
    this.itemCategories[index] = {
      ...this.itemCategories[index],
      ...data,
      updatedAt: new Date()
    };
    
    return this.itemCategories[index];
  }

  async deleteItemCategory(id: number, tenantId: number): Promise<boolean> {
    const index = this.itemCategories.findIndex(category => 
      category.id === id && category.tenantId === tenantId
    );
    if (index === -1) return false;
    
    this.itemCategories.splice(index, 1);
    return true;
  }
  
  // Item Subcategory operations
  async getAllItemSubcategories(tenantId: number, categoryId?: number): Promise<ItemSubcategory[]> {
    return this.itemSubcategories.filter(subcategory => {
      if (categoryId) {
        return subcategory.tenantId === tenantId && subcategory.categoryId === categoryId;
      }
      return subcategory.tenantId === tenantId;
    });
  }

  async getItemSubcategoryById(id: number, tenantId: number): Promise<ItemSubcategory | undefined> {
    return this.itemSubcategories.find(
      subcategory => subcategory.id === id && subcategory.tenantId === tenantId
    );
  }

  async getItemSubcategoryBySubcategoryId(subcategoryId: string, tenantId: number): Promise<ItemSubcategory | undefined> {
    return this.itemSubcategories.find(
      subcategory => subcategory.subcategoryId === subcategoryId && subcategory.tenantId === tenantId
    );
  }

  async createItemSubcategory(subcategory: InsertItemSubcategory): Promise<ItemSubcategory> {
    const newSubcategory: ItemSubcategory = {
      ...subcategory,
      id: this.itemSubcategories.length + 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.itemSubcategories.push(newSubcategory);
    return newSubcategory;
  }

  async updateItemSubcategory(id: number, tenantId: number, data: Partial<InsertItemSubcategory>): Promise<ItemSubcategory> {
    const index = this.itemSubcategories.findIndex(subcategory => 
      subcategory.id === id && subcategory.tenantId === tenantId
    );
    
    if (index === -1) throw new Error("Item subcategory not found");
    
    this.itemSubcategories[index] = {
      ...this.itemSubcategories[index],
      ...data,
      updatedAt: new Date()
    };
    
    return this.itemSubcategories[index];
  }

  async deleteItemSubcategory(id: number, tenantId: number): Promise<boolean> {
    const index = this.itemSubcategories.findIndex(subcategory => 
      subcategory.id === id && subcategory.tenantId === tenantId
    );
    
    if (index === -1) return false;
    
    this.itemSubcategories.splice(index, 1);
    return true;
  }

  // Item Unit operations
  async getAllItemUnits(tenantId: number, type?: string): Promise<ItemUnit[]> {
    let units = this.itemUnits.filter(unit => unit.tenantId === tenantId);
    
    if (type) {
      units = units.filter(unit => unit.type === type);
    }
    
    return units;
  }

  async getItemUnitById(id: number, tenantId: number): Promise<ItemUnit | undefined> {
    return this.itemUnits.find(
      unit => unit.id === id && unit.tenantId === tenantId
    );
  }

  async getItemUnitByUnitCode(unitCode: string, tenantId: number): Promise<ItemUnit | undefined> {
    return this.itemUnits.find(
      unit => unit.unitCode === unitCode && unit.tenantId === tenantId
    );
  }

  async createItemUnit(unit: InsertItemUnit): Promise<ItemUnit> {
    const newUnit: ItemUnit = {
      id: this.itemUnits.length ? Math.max(...this.itemUnits.map(u => u.id)) + 1 : 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...unit
    };
    
    this.itemUnits.push(newUnit);
    return newUnit;
  }

  async updateItemUnit(id: number, tenantId: number, data: Partial<InsertItemUnit>): Promise<ItemUnit> {
    const unit = await this.getItemUnitById(id, tenantId);
    
    if (!unit) {
      throw new Error(`Unit with id ${id} not found`);
    }
    
    const updatedUnit = {
      ...unit,
      ...data,
      updatedAt: new Date()
    };
    
    const index = this.itemUnits.findIndex(u => u.id === id);
    this.itemUnits[index] = updatedUnit;
    
    return updatedUnit;
  }

  async deleteItemUnit(id: number, tenantId: number): Promise<boolean> {
    const index = this.itemUnits.findIndex(
      unit => unit.id === id && unit.tenantId === tenantId
    );
    
    if (index === -1) return false;
    
    this.itemUnits.splice(index, 1);
    return true;
  }

  private orderAmendments: OrderAmendment[] = [];
  private orderAmendmentIdCounter = 1;

  async getOrderAmendments(orderId: number, tenantId: number): Promise<OrderAmendment[]> {
    return this.orderAmendments.filter(a => a.orderId === orderId && a.tenantId === tenantId);
  }

  async createOrderAmendment(data: InsertOrderAmendment): Promise<OrderAmendment> {
    const amendment = { ...data, id: this.orderAmendmentIdCounter++, createdAt: new Date(), approvedAt: null } as OrderAmendment;
    this.orderAmendments.push(amendment);
    return amendment;
  }

  async updateOrderAmendment(id: number, tenantId: number, data: Partial<InsertOrderAmendment>): Promise<OrderAmendment> {
    const index = this.orderAmendments.findIndex(a => a.id === id && a.tenantId === tenantId);
    if (index === -1) throw new Error(`Amendment ${id} not found`);
    this.orderAmendments[index] = { ...this.orderAmendments[index], ...data };
    return this.orderAmendments[index];
  }

  async getNextAmendmentNumber(orderId: number, tenantId: number): Promise<number> {
    const existing = this.orderAmendments.filter(a => a.orderId === orderId && a.tenantId === tenantId);
    const max = existing.reduce((m, a) => Math.max(m, a.amendmentNumber), 0);
    return max + 1;
  }
}