import { db } from '../server/db.ts';
import { 
  tenants, users, roles, departments, customers, inquiries, 
  items, itemCategories, itemSubcategories,
  warehouses, itemStock, tasks,
  subscriptions, subscriptionPlans
} from '../shared/schema.ts';
import bcrypt from 'bcrypt';

const DEMO_TENANT_ID = 2;

async function seedDemoData() {
  console.log('🌱 Starting demo data seeding...');
  
  try {
    // 1. Create Demo Tenant
    console.log('Creating demo tenant...');
    const [demoTenant] = await db.insert(tenants).values({
      id: DEMO_TENANT_ID,
      name: 'Demo Garments Manufacturing Ltd.',
      domain: 'demo.primex.com',
      logo: '/images/demo-logo.png',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    
    // 2. Create Subscription Plans
    console.log('Creating subscription plans...');
    const planData = [
      {
        id: 1,
        name: 'Basic',
        price: 15000, // 1500 BDT * 10 users
        currency: 'BDT',
        interval: 'monthly',
        maxUsers: 10,
        features: ['Basic ERP', 'Customer Management', 'Basic Reports'],
        isActive: true
      },
      {
        id: 2,
        name: 'Business',
        price: 30000, // 1500 BDT * 20 users
        currency: 'BDT',
        interval: 'monthly',
        maxUsers: 20,
        features: ['Advanced ERP', 'Production Management', 'Advanced Reports', 'AI Insights'],
        isActive: true
      },
      {
        id: 3,
        name: 'Professional',
        price: 75000, // 1500 BDT * 50 users
        currency: 'BDT',
        interval: 'monthly',
        maxUsers: 50,
        features: ['Full ERP Suite', 'Advanced Analytics', 'API Access', 'Priority Support'],
        isActive: true
      },
      {
        id: 4,
        name: 'Enterprise',
        price: 150000, // 1500 BDT * 100 users
        currency: 'BDT',
        interval: 'monthly',
        maxUsers: 100,
        features: ['Enterprise ERP', 'Custom Features', 'Dedicated Support', 'White Label'],
        isActive: true
      }
    ];
    
    await db.insert(subscriptionPlans).values(planData);
    
    // 3. Create Demo Subscription
    console.log('Creating demo subscription...');
    await db.insert(subscriptions).values({
      tenantId: DEMO_TENANT_ID,
      plan: 'Business',
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    // 4. Create Roles
    console.log('Creating roles...');
    const roleData = [
      { id: 1, name: 'Super Admin', permissions: ['*'], tenantId: DEMO_TENANT_ID },
      { id: 2, name: 'Admin', permissions: ['read', 'write', 'delete'], tenantId: DEMO_TENANT_ID },
      { id: 3, name: 'Manager', permissions: ['read', 'write'], tenantId: DEMO_TENANT_ID },
      { id: 4, name: 'Employee', permissions: ['read'], tenantId: DEMO_TENANT_ID },
      { id: 5, name: 'Accountant', permissions: ['read', 'write'], tenantId: DEMO_TENANT_ID }
    ];
    
    await db.insert(roles).values(roleData);
    
    // 5. Create Departments
    console.log('Creating departments...');
    const departmentData = [
      { id: 1, name: 'Administration', description: 'General Administration', tenantId: DEMO_TENANT_ID },
      { id: 2, name: 'Production', description: 'Manufacturing and Production', tenantId: DEMO_TENANT_ID },
      { id: 3, name: 'Commercial', description: 'Sales and Marketing', tenantId: DEMO_TENANT_ID },
      { id: 4, name: 'Accounts', description: 'Finance and Accounting', tenantId: DEMO_TENANT_ID },
      { id: 5, name: 'Human Resources', description: 'HR Management', tenantId: DEMO_TENANT_ID },
      { id: 6, name: 'Quality Control', description: 'Quality Assurance', tenantId: DEMO_TENANT_ID }
    ];
    
    await db.insert(departments).values(departmentData);
    
    // 6. Create Demo Users
    console.log('Creating demo users...');
    const hashedPassword = await bcrypt.hash('demo123', 10);
    const userData = [
      {
        id: 2,
        username: 'demo_admin',
        email: 'admin@demo.primex.com',
        password: hashedPassword,
        firstName: 'Demo',
        lastName: 'Admin',
        tenantId: DEMO_TENANT_ID,
        roleId: 1,
        departmentId: 1,
        isActive: true,
        isSuperUser: true
      },
      {
        id: 3,
        username: 'john_manager',
        email: 'john@demo.primex.com',
        password: hashedPassword,
        firstName: 'John',
        lastName: 'Manager',
        tenantId: DEMO_TENANT_ID,
        roleId: 3,
        departmentId: 2,
        isActive: true,
        isSuperUser: false
      },
      {
        id: 4,
        username: 'sarah_accountant',
        email: 'sarah@demo.primex.com',
        password: hashedPassword,
        firstName: 'Sarah',
        lastName: 'Ahmed',
        tenantId: DEMO_TENANT_ID,
        roleId: 5,
        departmentId: 4,
        isActive: true,
        isSuperUser: false
      }
    ];
    
    await db.insert(users).values(userData);
    
    // Skip currencies for now
    
    // 8. Create Item Categories
    console.log('Creating item categories...');
    const categoryData = [
      { id: 1, name: 'Fabrics', description: 'All types of fabrics', tenantId: DEMO_TENANT_ID },
      { id: 2, name: 'Trims', description: 'Buttons, zippers, labels', tenantId: DEMO_TENANT_ID },
      { id: 3, name: 'Accessories', description: 'Hangers, bags, packaging', tenantId: DEMO_TENANT_ID },
      { id: 4, name: 'Threads', description: 'Sewing threads', tenantId: DEMO_TENANT_ID }
    ];
    
    await db.insert(itemCategories).values(categoryData);
    
    // 9. Create Item Subcategories
    console.log('Creating item subcategories...');
    const subcategoryData = [
      { id: 1, name: 'Cotton', categoryId: 1, tenantId: DEMO_TENANT_ID },
      { id: 2, name: 'Polyester', categoryId: 1, tenantId: DEMO_TENANT_ID },
      { id: 3, name: 'Buttons', categoryId: 2, tenantId: DEMO_TENANT_ID },
      { id: 4, name: 'Zippers', categoryId: 2, tenantId: DEMO_TENANT_ID },
      { id: 5, name: 'Labels', categoryId: 2, tenantId: DEMO_TENANT_ID },
      { id: 6, name: 'Polyester Thread', categoryId: 4, tenantId: DEMO_TENANT_ID }
    ];
    
    await db.insert(itemSubcategories).values(subcategoryData);
    
    // 10. Create Items
    console.log('Creating items...');
    const itemData = [
      {
        id: 1,
        itemCode: 'FAB-001',
        name: 'Cotton Single Jersey 180gsm',
        description: '100% Cotton Single Jersey Knit Fabric',
        categoryId: 1,
        subcategoryId: 1,
        unitPrice: 320.00,
        currency: 'BDT',
        minStockLevel: 500,
        maxStockLevel: 2000,
        tenantId: DEMO_TENANT_ID
      },
      {
        id: 2,
        itemCode: 'FAB-002',
        name: 'Polyester French Terry 280gsm',
        description: '100% Polyester French Terry Fabric',
        categoryId: 1,
        subcategoryId: 2,
        unitPrice: 420.00,
        currency: 'BDT',
        minStockLevel: 300,
        maxStockLevel: 1500,
        tenantId: DEMO_TENANT_ID
      },
      {
        id: 3,
        itemCode: 'BTN-001',
        name: 'Plastic Button 15mm',
        description: '2-hole plastic button',
        categoryId: 2,
        subcategoryId: 3,
        unitPrice: 2.50,
        currency: 'BDT',
        minStockLevel: 10000,
        maxStockLevel: 50000,
        tenantId: DEMO_TENANT_ID
      },
      {
        id: 4,
        itemCode: 'ZIP-001',
        name: 'Metal Zipper 5inch',
        description: 'Metal zipper with brass teeth',
        categoryId: 2,
        subcategoryId: 4,
        unitPrice: 15.00,
        currency: 'BDT',
        minStockLevel: 1000,
        maxStockLevel: 5000,
        tenantId: DEMO_TENANT_ID
      },
      {
        id: 5,
        itemCode: 'THR-001',
        name: 'Polyester Thread 40/2',
        description: '40/2 Polyester sewing thread',
        categoryId: 4,
        subcategoryId: 6,
        unitPrice: 180.00,
        currency: 'BDT',
        minStockLevel: 100,
        maxStockLevel: 500,
        tenantId: DEMO_TENANT_ID
      }
    ];
    
    await db.insert(items).values(itemData);
    
    // 11. Create Warehouses
    console.log('Creating warehouses...');
    const warehouseData = [
      {
        id: 1,
        name: 'Main Warehouse',
        location: 'Dhaka',
        address: '123 Industrial Area, Dhaka',
        managerId: 2,
        tenantId: DEMO_TENANT_ID
      },
      {
        id: 2,
        name: 'Fabric Storage',
        location: 'Gazipur',
        address: '456 Textile Zone, Gazipur',
        managerId: 3,
        tenantId: DEMO_TENANT_ID
      }
    ];
    
    await db.insert(warehouses).values(warehouseData);
    
    // 12. Create Stock Records
    console.log('Creating stock records...');
    const stockData = [
      { itemId: 1, warehouseId: 1, quantity: 1200, reservedQuantity: 200, tenantId: DEMO_TENANT_ID },
      { itemId: 2, warehouseId: 1, quantity: 800, reservedQuantity: 100, tenantId: DEMO_TENANT_ID },
      { itemId: 3, warehouseId: 2, quantity: 25000, reservedQuantity: 5000, tenantId: DEMO_TENANT_ID },
      { itemId: 4, warehouseId: 2, quantity: 3000, reservedQuantity: 500, tenantId: DEMO_TENANT_ID },
      { itemId: 5, warehouseId: 1, quantity: 250, reservedQuantity: 50, tenantId: DEMO_TENANT_ID }
    ];
    
    await db.insert(itemStock).values(stockData);
    
    // 13. Create Customers
    console.log('Creating customers...');
    const customerData = [
      {
        id: 1,
        customerCode: 'CUST-001',
        name: 'Global Fashion Inc.',
        type: 'buyer',
        email: 'orders@globalfashion.com',
        phone: '+1-555-0123',
        address: '123 Fashion Ave, New York, NY 10001',
        country: 'USA',
        paymentTerms: 'Net 30',
        creditLimit: 500000,
        tenantId: DEMO_TENANT_ID
      },
      {
        id: 2,
        customerCode: 'CUST-002',
        name: 'European Textiles Ltd.',
        type: 'buyer',
        email: 'procurement@europetextiles.com',
        phone: '+44-20-7946-0958',
        address: '456 Textile Street, London, UK',
        country: 'UK',
        paymentTerms: 'Net 45',
        creditLimit: 750000,
        tenantId: DEMO_TENANT_ID
      },
      {
        id: 3,
        customerCode: 'CUST-003',
        name: 'Asian Apparel Co.',
        type: 'buyer',
        email: 'orders@asianapparel.com',
        phone: '+81-3-1234-5678',
        address: '789 Fashion District, Tokyo, Japan',
        country: 'Japan',
        paymentTerms: 'Net 60',
        creditLimit: 1000000,
        tenantId: DEMO_TENANT_ID
      }
    ];
    
    await db.insert(customers).values(customerData);
    
    // 14. Create Inquiries
    console.log('Creating inquiries...');
    const inquiryData = [
      {
        id: 1,
        inquiryId: 'INQ-2025-001',
        customerId: 1,
        styleName: 'Basic T-Shirt',
        inquiryType: 'quotation',
        department: 'Mens',
        projectedQuantity: 5000,
        projectedDeliveryDate: new Date('2025-08-15'),
        targetPrice: '4.50',
        materialComposition: '100% Cotton Single Jersey',
        sizeRange: 'S-XXL',
        colorOptions: ['White', 'Black', 'Navy'],
        countryOfOrigin: 'Bangladesh',
        incoterms: 'FOB',
        status: 'new',
        tenantId: DEMO_TENANT_ID
      },
      {
        id: 2,
        inquiryId: 'INQ-2025-002',
        customerId: 2,
        styleName: 'Polo Shirt',
        inquiryType: 'quotation',
        department: 'Mens',
        projectedQuantity: 3000,
        projectedDeliveryDate: new Date('2025-09-01'),
        targetPrice: '6.75',
        materialComposition: '65% Cotton 35% Polyester Pique',
        sizeRange: 'XS-XL',
        colorOptions: ['White', 'Navy', 'Red'],
        countryOfOrigin: 'Bangladesh',
        incoterms: 'CIF',
        status: 'in_progress',
        tenantId: DEMO_TENANT_ID
      },
      {
        id: 3,
        inquiryId: 'INQ-2025-003',
        customerId: 3,
        styleName: 'Hoodie',
        inquiryType: 'quotation',
        department: 'Mens',
        projectedQuantity: 2000,
        projectedDeliveryDate: new Date('2025-10-15'),
        targetPrice: '12.00',
        materialComposition: '80% Cotton 20% Polyester French Terry',
        sizeRange: 'S-XXL',
        colorOptions: ['Gray', 'Black', 'Navy'],
        countryOfOrigin: 'Bangladesh',
        incoterms: 'FOB',
        status: 'quoted',
        tenantId: DEMO_TENANT_ID
      }
    ];
    
    await db.insert(inquiries).values(inquiryData);
    
    // 15. Create Employees
    console.log('Creating employees...');
    const employeeData = [
      {
        id: 1,
        employeeId: 'EMP-001',
        userId: 2,
        firstName: 'Demo',
        lastName: 'Admin',
        email: 'admin@demo.primex.com',
        phone: '+880-1700-123456',
        address: 'Dhaka, Bangladesh',
        departmentId: 1,
        designation: 'Administrator',
        joiningDate: new Date('2025-01-01'),
        salary: 80000,
        isActive: true,
        tenantId: DEMO_TENANT_ID
      },
      {
        id: 2,
        employeeId: 'EMP-002',
        userId: 3,
        firstName: 'John',
        lastName: 'Manager',
        email: 'john@demo.primex.com',
        phone: '+880-1700-234567',
        address: 'Gazipur, Bangladesh',
        departmentId: 2,
        designation: 'Production Manager',
        joiningDate: new Date('2025-01-15'),
        salary: 60000,
        isActive: true,
        tenantId: DEMO_TENANT_ID
      },
      {
        id: 3,
        employeeId: 'EMP-003',
        userId: 4,
        firstName: 'Sarah',
        lastName: 'Ahmed',
        email: 'sarah@demo.primex.com',
        phone: '+880-1700-345678',
        address: 'Dhaka, Bangladesh',
        departmentId: 4,
        designation: 'Senior Accountant',
        joiningDate: new Date('2025-02-01'),
        salary: 45000,
        isActive: true,
        tenantId: DEMO_TENANT_ID
      }
    ];
    
    await db.insert(employees).values(employeeData);
    
    // 16. Create Production Lines
    console.log('Creating production lines...');
    const productionLineData = [
      {
        id: 1,
        name: 'Line A - Basic Tees',
        capacity: 1000,
        efficiency: 85.5,
        status: 'active',
        managerId: 2,
        tenantId: DEMO_TENANT_ID
      },
      {
        id: 2,
        name: 'Line B - Polo Shirts',
        capacity: 800,
        efficiency: 78.2,
        status: 'active',
        managerId: 2,
        tenantId: DEMO_TENANT_ID
      },
      {
        id: 3,
        name: 'Line C - Hoodies',
        capacity: 500,
        efficiency: 72.8,
        status: 'maintenance',
        managerId: 2,
        tenantId: DEMO_TENANT_ID
      }
    ];
    
    await db.insert(production_lines).values(productionLineData);
    
    // 17. Create Tasks
    console.log('Creating tasks...');
    const taskData = [
      {
        id: 1,
        title: 'Review INQ-2025-001 Quotation',
        description: 'Review and approve quotation for Global Fashion Inc.',
        assignedTo: 2,
        createdBy: 2,
        priority: 'high',
        status: 'pending',
        dueDate: new Date('2025-07-10'),
        tenantId: DEMO_TENANT_ID
      },
      {
        id: 2,
        title: 'Fabric Sourcing for Polo Shirts',
        description: 'Source pique fabric for European Textiles order',
        assignedTo: 3,
        createdBy: 2,
        priority: 'medium',
        status: 'in_progress',
        dueDate: new Date('2025-07-15'),
        tenantId: DEMO_TENANT_ID
      },
      {
        id: 3,
        title: 'Quality Check - Line A',
        description: 'Perform quality inspection on Line A production',
        assignedTo: 2,
        createdBy: 2,
        priority: 'high',
        status: 'completed',
        dueDate: new Date('2025-07-05'),
        tenantId: DEMO_TENANT_ID
      }
    ];
    
    await db.insert(tasks).values(taskData);
    
    // 18. Create Dashboard Metrics
    console.log('Creating dashboard metrics...');
    const dashboardData = [
      {
        id: 1,
        metricName: 'Total Orders',
        value: 15,
        previousValue: 12,
        changePercentage: 25.0,
        period: 'monthly',
        tenantId: DEMO_TENANT_ID
      },
      {
        id: 2,
        metricName: 'Revenue',
        value: 2500000,
        previousValue: 2100000,
        changePercentage: 19.0,
        period: 'monthly',
        tenantId: DEMO_TENANT_ID
      },
      {
        id: 3,
        metricName: 'Production Efficiency',
        value: 78.5,
        previousValue: 75.2,
        changePercentage: 4.4,
        period: 'weekly',
        tenantId: DEMO_TENANT_ID
      }
    ];
    
    await db.insert(dashboardMetrics).values(dashboardData);
    
    // 19. Create Notifications
    console.log('Creating notifications...');
    const notificationData = [
      {
        id: 1,
        title: 'New Inquiry Received',
        message: 'INQ-2025-001 from Global Fashion Inc. requires attention',
        type: 'inquiry',
        userId: 2,
        isRead: false,
        tenantId: DEMO_TENANT_ID
      },
      {
        id: 2,
        title: 'Low Stock Alert',
        message: 'Polyester Thread 40/2 is below minimum stock level',
        type: 'inventory',
        userId: 3,
        isRead: false,
        tenantId: DEMO_TENANT_ID
      },
      {
        id: 3,
        title: 'Production Line Maintenance',
        message: 'Line C requires scheduled maintenance',
        type: 'production',
        userId: 2,
        isRead: true,
        tenantId: DEMO_TENANT_ID
      }
    ];
    
    await db.insert(notifications).values(notificationData);
    
    console.log('✅ Demo data seeding completed successfully!');
    console.log(`
📊 Summary of created data:
- Demo Tenant: ${demoTenant.name}
- Users: 3
- Customers: 3
- Inquiries: 3
- Items: 5
- Employees: 3
- Production Lines: 3
- Tasks: 3
- Dashboard Metrics: 3
- Notifications: 3

🔑 Demo Login Credentials:
- Username: demo_admin
- Password: demo123
- Email: admin@demo.primex.com
    `);
    
  } catch (error) {
    console.error('❌ Error seeding demo data:', error);
    throw error;
  }
}

// Run the seeding
seedDemoData()
  .then(() => {
    console.log('Demo data seeding completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to seed demo data:', error);
    process.exit(1);
  });