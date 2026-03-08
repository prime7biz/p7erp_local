import { 
  type User, type Tenant, type Subscription, type Customer, type CustomerAgent,
  type Task, type TaskComment, type TaskAIInsight, type Inquiry, type Warehouse,
  type ItemCategory, type ItemSubcategory, type ItemUnit, type Item, type ItemVariant,
  type ItemStock, type BillOfMaterials, type BomComponent, type PriceList, type PriceListItem,
  type Currency, type ExchangeRate, type CurrencyInsight,
  type InsertUser, type InsertTenant, type InsertSubscription, 
  type InsertCustomer, type InsertCustomerAgent, type InsertTask, type InsertTaskComment, 
  type InsertTaskAIInsight, type InsertInquiry, type InsertWarehouse, 
  type InsertItemCategory, type InsertItemSubcategory, type InsertItemUnit,
  type InsertItem, type InsertItemVariant, type InsertItemStock,
  type InsertBillOfMaterials, type InsertBomComponent, type InsertPriceList, type InsertPriceListItem,
  type InsertCurrency, type InsertExchangeRate, type InsertCurrencyInsight,
  type Quotation, type InsertQuotation, type QuotationMaterial, type InsertQuotationMaterial,
  type QuotationManufacturing, type InsertQuotationManufacturing, type QuotationOtherCost, type InsertQuotationOtherCost,
  type QuotationCostSummary, type InsertQuotationCostSummary,
  type Order, type InsertOrder, type OrderColorSizeBreakdown, type InsertOrderColorSizeBreakdown,
  type OrderMaterial, type InsertOrderMaterial, type OrderSample, type InsertOrderSample,
  type OrderTrim, type InsertOrderTrim, type TimeActionPlan, type InsertTimeActionPlan,
  type TimeActionMilestone, type InsertTimeActionMilestone, type CustomerInteraction, type InsertCustomerInteraction,
  type SampleDevelopment, type InsertSampleDevelopment, type SampleMaterial, type InsertSampleMaterial,
  type CrmActivity, type InsertCrmActivity, type SampleApproval, type InsertSampleApproval,
  type TrimApproval, type InsertTrimApproval, type PortalActivityLog, type InsertPortalActivityLog,
  type CustomerInsight, type InsertCustomerInsight, type CommunicationTemplate, type InsertCommunicationTemplate,
  type BuyerPortalUser, type InsertBuyerPortalUser,
  type OrderAmendment, type InsertOrderAmendment
} from "@shared/schema";

// Task filters interface for querying tasks
export interface TaskFilters {
  status?: string | string[];
  priority?: string | string[];
  assignedTo?: number;
  createdBy?: number;
  dueDate?: { start?: Date; end?: Date };
  completed?: boolean;
  search?: string;
  tags?: string[];
  relatedEntityType?: string;
  relatedEntityId?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// Item filters interface for querying items
export interface ItemFilters {
  categoryId?: number;
  subcategoryId?: number;
  type?: string | string[];
  searchQuery?: string;
  isActive?: boolean;
  hasVariants?: boolean;
  isStockable?: boolean;
  isServiceItem?: boolean;
  isBillOfMaterial?: boolean;
  tags?: string[];
  warehouseId?: number;
  vendorId?: number;
  priceListId?: number;
  priceRange?: { min?: number; max?: number };
  stockLevel?: { min?: number; max?: number };
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// Quotation filters interface for querying quotations
export interface QuotationFilters {
  customerId?: number;
  inquiryId?: number;
  status?: string | string[];
  dateRange?: { start?: Date; end?: Date };
  projectedQuantityRange?: { min?: number; max?: number };
  priceRange?: { min?: number; max?: number };
  departmentList?: string[];
  searchQuery?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// Sample Development filters interface
export interface SampleFilters {
  customerId?: number;
  inquiryId?: number;
  orderId?: number; 
  sampleType?: string | string[];
  status?: string | string[];
  dateRange?: { start?: Date; end?: Date };
  searchQuery?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface IStorage {
  // User operations
  getUserById(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User>;
  
  // Role operations
  getRoleById(id: number): Promise<any | undefined>;

  // Tenant operations
  getTenantById(id: number): Promise<Tenant | undefined>;
  getTenantByDomain(domain: string): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  updateTenant(id: number, data: Partial<InsertTenant>): Promise<Tenant>;
  
  // Subscription operations
  getSubscriptionById(id: number): Promise<Subscription | undefined>;
  getActiveSubscriptionByTenantId(tenantId: number): Promise<Subscription | undefined>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: number, data: Partial<InsertSubscription>): Promise<Subscription>;
  
  // Customer operations
  getAllCustomers(tenantId: number): Promise<Customer[]>;
  getCustomerById(id: number, tenantId: number): Promise<Customer | undefined>;
  getCustomerByCustomerId(customerId: string, tenantId: number): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, tenantId: number, data: Partial<InsertCustomer>): Promise<Customer>;
  setCustomerStatus(id: number, tenantId: number, isActive: boolean): Promise<Customer>;
  deleteCustomer(id: number, tenantId: number): Promise<boolean>;
  
  // Customer Agent operations
  getAgentByCustomerId(customerId: number): Promise<CustomerAgent | undefined>;
  createCustomerAgent(agent: InsertCustomerAgent): Promise<CustomerAgent>;
  updateCustomerAgent(customerId: number, data: Partial<InsertCustomerAgent>): Promise<CustomerAgent>;
  deleteCustomerAgent(customerId: number): Promise<boolean>;
  
  // Task operations
  getAllTasks(tenantId: number, filters?: TaskFilters): Promise<Task[]>;
  getTaskById(id: number, tenantId: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, tenantId: number, data: Partial<InsertTask>): Promise<Task>;
  completeTask(id: number, tenantId: number, completed: boolean): Promise<Task>;
  deleteTask(id: number, tenantId: number): Promise<boolean>;
  
  // Task comments operations
  getTaskComments(taskId: number): Promise<TaskComment[]>;
  createTaskComment(comment: InsertTaskComment): Promise<TaskComment>;
  deleteTaskComment(id: number): Promise<boolean>;
  
  // Task AI insights operations
  getTaskAIInsights(taskId: number): Promise<TaskAIInsight[]>;
  createTaskAIInsight(insight: InsertTaskAIInsight): Promise<TaskAIInsight>;
  
  // Inquiry operations
  getAllInquiries(tenantId: number): Promise<Inquiry[]>;
  getInquiryById(id: number, tenantId: number): Promise<Inquiry | undefined>;
  getInquiryByInquiryId(inquiryId: string, tenantId: number): Promise<Inquiry | undefined>;
  createInquiry(inquiry: InsertInquiry): Promise<Inquiry>;
  updateInquiry(id: number, tenantId: number, data: Partial<InsertInquiry>): Promise<Inquiry>;
  deleteInquiry(id: number, tenantId: number): Promise<boolean>;
  
  // AI Inquiry insights operations
  generateInquiryInsights(inquiryId: number): Promise<any>;
  
  // Warehouse operations
  getAllWarehouses(tenantId: number): Promise<Warehouse[]>;
  getWarehouseById(id: number, tenantId: number): Promise<Warehouse | undefined>;
  getWarehouseByWarehouseId(warehouseId: string, tenantId: number): Promise<Warehouse | undefined>;
  createWarehouse(warehouse: InsertWarehouse): Promise<Warehouse>;
  updateWarehouse(id: number, tenantId: number, data: Partial<InsertWarehouse>): Promise<Warehouse>;
  deleteWarehouse(id: number, tenantId: number): Promise<boolean>;
  
  // Item Category operations
  getAllItemCategories(tenantId: number): Promise<ItemCategory[]>;
  getItemCategoryById(id: number, tenantId: number): Promise<ItemCategory | undefined>;
  getItemCategoryByCategoryId(categoryId: string, tenantId: number): Promise<ItemCategory | undefined>;
  createItemCategory(category: InsertItemCategory): Promise<ItemCategory>;
  updateItemCategory(id: number, tenantId: number, data: Partial<InsertItemCategory>): Promise<ItemCategory>;
  deleteItemCategory(id: number, tenantId: number): Promise<boolean>;
  
  // Item Subcategory operations
  getAllItemSubcategories(tenantId: number, categoryId?: number): Promise<ItemSubcategory[]>;
  getItemSubcategoryById(id: number, tenantId: number): Promise<ItemSubcategory | undefined>;
  getItemSubcategoryBySubcategoryId(subcategoryId: string, tenantId: number): Promise<ItemSubcategory | undefined>;
  createItemSubcategory(subcategory: InsertItemSubcategory): Promise<ItemSubcategory>;
  updateItemSubcategory(id: number, tenantId: number, data: Partial<InsertItemSubcategory>): Promise<ItemSubcategory>;
  deleteItemSubcategory(id: number, tenantId: number): Promise<boolean>;
  
  // Item Unit operations
  getAllItemUnits(tenantId: number, type?: string): Promise<ItemUnit[]>;
  getItemUnitById(id: number, tenantId: number): Promise<ItemUnit | undefined>;
  getItemUnitByUnitCode(unitCode: string, tenantId: number): Promise<ItemUnit | undefined>;
  createItemUnit(unit: InsertItemUnit): Promise<ItemUnit>;
  updateItemUnit(id: number, tenantId: number, data: Partial<InsertItemUnit>): Promise<ItemUnit>;
  deleteItemUnit(id: number, tenantId: number): Promise<boolean>;
  
  // Item operations
  getAllItems(tenantId: number, filters?: ItemFilters): Promise<Item[]>;
  getItemById(id: number, tenantId: number): Promise<Item | undefined>;
  getItemByItemCode(itemCode: string, tenantId: number): Promise<Item | undefined>;
  createItem(item: InsertItem): Promise<Item>;
  updateItem(id: number, tenantId: number, data: Partial<InsertItem>): Promise<Item>;
  deleteItem(id: number, tenantId: number): Promise<boolean>;
  
  // Item variant operations
  getItemVariants(itemId: number, tenantId: number): Promise<ItemVariant[]>;
  getItemVariantById(id: number, tenantId: number): Promise<ItemVariant | undefined>;
  createItemVariant(variant: InsertItemVariant): Promise<ItemVariant>;
  updateItemVariant(id: number, tenantId: number, data: Partial<InsertItemVariant>): Promise<ItemVariant>;
  deleteItemVariant(id: number, tenantId: number): Promise<boolean>;
  
  // Item stock operations
  getItemStock(itemId: number, tenantId: number, warehouseId?: number): Promise<ItemStock[]>;
  getItemStockById(id: number, tenantId: number): Promise<ItemStock | undefined>;
  updateItemStock(id: number, tenantId: number, data: Partial<InsertItemStock>): Promise<ItemStock>;
  adjustItemStock(itemId: number, warehouseId: number, quantity: number, reason: string, tenantId: number): Promise<ItemStock>;
  
  // Bill of Materials operations
  getItemBOM(itemId: number, tenantId: number, version?: string): Promise<BillOfMaterials | undefined>;
  getBillOfMaterialsById(id: number, tenantId: number): Promise<BillOfMaterials | undefined>;
  createBillOfMaterials(bom: InsertBillOfMaterials): Promise<BillOfMaterials>;
  updateBillOfMaterials(id: number, tenantId: number, data: Partial<InsertBillOfMaterials>): Promise<BillOfMaterials>;
  deleteBillOfMaterials(id: number, tenantId: number): Promise<boolean>;
  
  // BOM component operations
  getBOMComponents(bomId: number, tenantId: number): Promise<BomComponent[]>;
  createBOMComponent(component: InsertBomComponent): Promise<BomComponent>;
  updateBOMComponent(id: number, tenantId: number, data: Partial<InsertBomComponent>): Promise<BomComponent>;
  deleteBOMComponent(id: number, tenantId: number): Promise<boolean>;
  
  // Price list operations
  getAllPriceLists(tenantId: number, isActive?: boolean): Promise<PriceList[]>;
  getPriceListById(id: number, tenantId: number): Promise<PriceList | undefined>;
  createPriceList(priceList: InsertPriceList): Promise<PriceList>;
  updatePriceList(id: number, tenantId: number, data: Partial<InsertPriceList>): Promise<PriceList>;
  deletePriceList(id: number, tenantId: number): Promise<boolean>;
  
  // Price list item operations
  getItemPricing(itemId: number, tenantId: number, priceListId?: number): Promise<PriceListItem[]>;
  getPriceListItems(priceListId: number, tenantId: number): Promise<PriceListItem[]>;
  createPriceListItem(priceListItem: InsertPriceListItem): Promise<PriceListItem>;
  updatePriceListItem(id: number, tenantId: number, data: Partial<InsertPriceListItem>): Promise<PriceListItem>;
  deletePriceListItem(id: number, tenantId: number): Promise<boolean>;
  
  // Quotation operations
  getAllQuotations(tenantId: number, filters?: QuotationFilters): Promise<Quotation[]>;
  getQuotationById(id: number, tenantId: number): Promise<Quotation | undefined>;
  getQuotationByQuotationId(quotationId: string, tenantId: number): Promise<Quotation | undefined>;
  createQuotation(quotation: InsertQuotation): Promise<Quotation>;
  updateQuotation(id: number, tenantId: number, data: Partial<InsertQuotation>): Promise<Quotation>;
  deleteQuotation(id: number, tenantId: number): Promise<boolean>;
  
  // Quotation material operations
  getQuotationMaterials(quotationId: number, tenantId: number): Promise<QuotationMaterial[]>;
  createQuotationMaterial(material: InsertQuotationMaterial): Promise<QuotationMaterial>;
  updateQuotationMaterial(id: number, tenantId: number, data: Partial<InsertQuotationMaterial>): Promise<QuotationMaterial>;
  deleteQuotationMaterial(id: number, tenantId: number): Promise<boolean>;
  
  // Quotation manufacturing operations
  getQuotationManufacturing(quotationId: number, tenantId: number): Promise<QuotationManufacturing[]>;
  createQuotationManufacturing(manufacturing: InsertQuotationManufacturing): Promise<QuotationManufacturing>;
  updateQuotationManufacturing(id: number, tenantId: number, data: Partial<InsertQuotationManufacturing>): Promise<QuotationManufacturing>;
  deleteQuotationManufacturing(id: number, tenantId: number): Promise<boolean>;
  
  // Quotation other costs operations
  getQuotationOtherCosts(quotationId: number, tenantId: number): Promise<QuotationOtherCost[]>;
  createQuotationOtherCost(otherCost: InsertQuotationOtherCost): Promise<QuotationOtherCost>;
  updateQuotationOtherCost(id: number, tenantId: number, data: Partial<InsertQuotationOtherCost>): Promise<QuotationOtherCost>;
  deleteQuotationOtherCost(id: number, tenantId: number): Promise<boolean>;
  
  // Quotation cost summary operations
  getQuotationCostSummary(quotationId: number, tenantId: number): Promise<QuotationCostSummary[]>;
  createQuotationCostSummary(costSummary: InsertQuotationCostSummary): Promise<QuotationCostSummary>;
  updateQuotationCostSummary(id: number, tenantId: number, data: Partial<InsertQuotationCostSummary>): Promise<QuotationCostSummary>;
  deleteQuotationCostSummary(id: number, tenantId: number): Promise<boolean>;
  
  // Inquiry to Quotation conversion
  convertInquiryToQuotation(inquiryId: number, tenantId: number, profitPercentage?: number): Promise<Quotation>;
  
  // Currency operations
  getAllCurrencies(tenantId: number, activeOnly?: boolean): Promise<Currency[]>;
  getCurrencyById(id: number, tenantId: number): Promise<Currency | undefined>;
  getCurrencyByCode(code: string, tenantId: number): Promise<Currency | undefined>;
  getDefaultCurrency(tenantId: number): Promise<Currency | undefined>;
  createCurrency(currency: InsertCurrency): Promise<Currency>;
  updateCurrency(id: number, tenantId: number, data: Partial<InsertCurrency>): Promise<Currency>;
  setDefaultCurrency(id: number, tenantId: number): Promise<Currency>;
  deleteCurrency(id: number, tenantId: number): Promise<boolean>;
  
  // Exchange Rate operations
  getExchangeRates(currencyId: number, tenantId: number): Promise<ExchangeRate[]>;
  getCurrentExchangeRate(currencyId: number, tenantId: number): Promise<ExchangeRate | undefined>;
  createExchangeRate(rate: InsertExchangeRate): Promise<ExchangeRate>;
  updateExchangeRate(id: number, tenantId: number, data: Partial<InsertExchangeRate>): Promise<ExchangeRate>;
  deleteExchangeRate(id: number, tenantId: number): Promise<boolean>;
  
  // Currency Insights operations
  getCurrencyInsights(currencyId: number, tenantId: number): Promise<CurrencyInsight[]>;
  createCurrencyInsight(insight: InsertCurrencyInsight): Promise<CurrencyInsight>;
  generateCurrencyInsights(currencyId: number, tenantId: number): Promise<CurrencyInsight[]>;

  // Order methods
  getAllOrders(tenantId: number, filters?: { customerId?: number; status?: string }): Promise<Order[]>;
  getOrderById(id: number, tenantId: number): Promise<Order | undefined>;
  getOrderByOrderId(orderId: string, tenantId: number): Promise<Order | undefined>;
  createOrder(data: InsertOrder): Promise<Order>;
  updateOrder(id: number, tenantId: number, data: Partial<InsertOrder>): Promise<Order>;
  deleteOrder(id: number, tenantId: number): Promise<boolean>;
  
  // Order Color/Size Breakdown methods
  getOrderColorSizeBreakdown(orderId: number): Promise<OrderColorSizeBreakdown[]>;
  createOrderColorSizeBreakdown(data: InsertOrderColorSizeBreakdown): Promise<OrderColorSizeBreakdown>;
  updateOrderColorSizeBreakdown(id: number, data: Partial<InsertOrderColorSizeBreakdown>): Promise<OrderColorSizeBreakdown>;
  deleteOrderColorSizeBreakdown(orderId: number): Promise<boolean>;
  
  // Order Materials methods
  getOrderMaterials(orderId: number): Promise<OrderMaterial[]>;
  createOrderMaterial(data: InsertOrderMaterial): Promise<OrderMaterial>;
  updateOrderMaterial(id: number, data: Partial<InsertOrderMaterial>): Promise<OrderMaterial>;
  deleteOrderMaterial(id: number): Promise<boolean>;
  
  // Order Samples methods
  getOrderSamples(orderId: number): Promise<OrderSample[]>;
  createOrderSample(data: InsertOrderSample): Promise<OrderSample>;
  updateOrderSample(id: number, data: Partial<InsertOrderSample>): Promise<OrderSample>;
  deleteOrderSample(id: number): Promise<boolean>;
  
  // Order Trims methods
  getOrderTrims(orderId: number): Promise<OrderTrim[]>;
  createOrderTrim(data: InsertOrderTrim): Promise<OrderTrim>;
  updateOrderTrim(id: number, data: Partial<InsertOrderTrim>): Promise<OrderTrim>;
  deleteOrderTrim(id: number): Promise<boolean>;
  
  // Order Amendment methods
  getOrderAmendments(orderId: number, tenantId: number): Promise<OrderAmendment[]>;
  createOrderAmendment(data: InsertOrderAmendment): Promise<OrderAmendment>;
  updateOrderAmendment(id: number, tenantId: number, data: Partial<InsertOrderAmendment>): Promise<OrderAmendment>;
  getNextAmendmentNumber(orderId: number, tenantId: number): Promise<number>;

  // Time Action Plans methods
  getTimeActionPlanByOrderId(orderId: number): Promise<TimeActionPlan | undefined>;
  createTimeActionPlan(data: InsertTimeActionPlan): Promise<TimeActionPlan>;
  updateTimeActionPlan(id: number, data: Partial<InsertTimeActionPlan>): Promise<TimeActionPlan>;
  deleteTimeActionPlan(id: number): Promise<boolean>;
  
  // Time Action Milestones methods
  getTimeActionMilestones(planId: number): Promise<TimeActionMilestone[]>;
  createTimeActionMilestone(data: InsertTimeActionMilestone): Promise<TimeActionMilestone>;
  updateTimeActionMilestone(id: number, data: Partial<InsertTimeActionMilestone>): Promise<TimeActionMilestone>;
  deleteTimeActionMilestone(id: number): Promise<boolean>;
  
  // Customer Interactions methods
  getCustomerInteractionsByOrderId(orderId: number): Promise<CustomerInteraction[]>;
  createCustomerInteraction(data: InsertCustomerInteraction): Promise<CustomerInteraction>;
  updateCustomerInteraction(id: number, data: Partial<InsertCustomerInteraction>): Promise<CustomerInteraction>;
  deleteCustomerInteraction(id: number): Promise<boolean>;
  
  // CRM Activities methods
  getCrmActivitiesByCustomerId(customerId: number, tenantId: number): Promise<CrmActivity[]>;
  createCrmActivity(data: InsertCrmActivity): Promise<CrmActivity>;
  updateCrmActivity(id: number, tenantId: number, data: Partial<InsertCrmActivity>): Promise<CrmActivity>;
  deleteCrmActivity(id: number, tenantId: number): Promise<boolean>;
  
  // Trim Approvals methods
  getTrimApprovalsByOrderId(orderId: number, tenantId: number): Promise<TrimApproval[]>;
  createTrimApproval(data: InsertTrimApproval): Promise<TrimApproval>;
  updateTrimApproval(id: number, tenantId: number, data: Partial<InsertTrimApproval>): Promise<TrimApproval>;
  deleteTrimApproval(id: number, tenantId: number): Promise<boolean>;
  
  // Portal Activity Logs methods
  getPortalActivityLogsByPortalUserId(portalUserId: number, tenantId: number): Promise<PortalActivityLog[]>;
  createPortalActivityLog(data: InsertPortalActivityLog): Promise<PortalActivityLog>;
  
  // Customer Insights methods
  getCustomerInsightsByCustomerId(customerId: number, tenantId: number): Promise<CustomerInsight[]>;
  createCustomerInsight(data: InsertCustomerInsight): Promise<CustomerInsight>;
  
  // Communication Templates methods
  getCommunicationTemplates(tenantId: number, type?: string): Promise<CommunicationTemplate[]>;
  getCommunicationTemplateById(id: number, tenantId: number): Promise<CommunicationTemplate | undefined>;
  createCommunicationTemplate(data: InsertCommunicationTemplate): Promise<CommunicationTemplate>;
  updateCommunicationTemplate(id: number, tenantId: number, data: Partial<InsertCommunicationTemplate>): Promise<CommunicationTemplate>;
  deleteCommunicationTemplate(id: number, tenantId: number): Promise<boolean>;
  
  // Sample Development methods
  getAllSamples(tenantId: number, filters?: SampleFilters): Promise<SampleDevelopment[]>;
  getSampleById(id: number, tenantId: number): Promise<SampleDevelopment | undefined>;
  getSamplesByCustomerId(customerId: number, tenantId: number): Promise<SampleDevelopment[]>;
  getSamplesByInquiryId(inquiryId: number, tenantId: number): Promise<SampleDevelopment[]>;
  getSamplesByOrderId(orderId: number, tenantId: number): Promise<SampleDevelopment[]>;
  getSamplesByStyleName(styleName: string, tenantId: number): Promise<SampleDevelopment[]>;
  createSampleDevelopment(data: InsertSampleDevelopment): Promise<SampleDevelopment>;
  updateSampleDevelopment(id: number, data: Partial<InsertSampleDevelopment>): Promise<SampleDevelopment>;
  deleteSampleDevelopment(id: number): Promise<boolean>;
  
  // Sample Materials methods
  getSampleMaterials(sampleId: number): Promise<SampleMaterial[]>;
  createSampleMaterial(data: InsertSampleMaterial): Promise<SampleMaterial>;
  updateSampleMaterial(id: number, data: Partial<InsertSampleMaterial>): Promise<SampleMaterial>;
  deleteSampleMaterial(id: number): Promise<boolean>;
  
  // Sample Approval methods
  getSampleApprovalsBySampleId(sampleId: number, tenantId: number): Promise<SampleApproval[]>;
  getSampleApprovalById(id: number, tenantId: number): Promise<SampleApproval | undefined>;
  createSampleApproval(data: InsertSampleApproval): Promise<SampleApproval>;
  updateSampleApproval(id: number, tenantId: number, data: Partial<InsertSampleApproval>): Promise<SampleApproval>;
  
  // Buyer Portal User methods
  getBuyerPortalUsersByCustomerId(customerId: number, tenantId: number): Promise<BuyerPortalUser[]>;
  getBuyerPortalUserById(id: number, tenantId: number): Promise<BuyerPortalUser | undefined>;
  createBuyerPortalUser(data: InsertBuyerPortalUser): Promise<BuyerPortalUser>;
  updateBuyerPortalUser(id: number, tenantId: number, data: Partial<InsertBuyerPortalUser>): Promise<BuyerPortalUser>;
  deleteBuyerPortalUser(id: number, tenantId: number): Promise<boolean>;
}

// Import storage implementations
import { DatabaseStorage } from "./storage.impl";
import { MemStorage } from "./memStorage";

// Choose which storage implementation to use
// We're switching to database storage for production readiness
const useMemoryStorage = false; // Previously was forced to true

console.log(`Using ${useMemoryStorage ? 'memory' : 'database'} storage implementation`);

// Export the selected storage instance
export const storage = useMemoryStorage ? new MemStorage() : new DatabaseStorage();