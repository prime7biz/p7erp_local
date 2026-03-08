import { db } from '../server/db.ts';
import { 
  tenants, users, roles, departments, customers, inquiries, 
  subscriptions, subscriptionPlans
} from '../shared/schema.ts';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

async function seedSimpleData() {
  console.log('🌱 Starting simple demo data seeding...');
  
  try {
    // 1. Create Demo Tenant
    console.log('Creating demo tenant...');
    await db.insert(tenants).values({
      name: 'Demo Garments Manufacturing Ltd.',
      domain: 'demo.primex.com',
      logo: '/images/demo-logo.png',
      isActive: true
    });
    
    // Get the tenant ID
    const [demoTenant] = await db.select().from(tenants).where(eq(tenants.domain, 'demo.primex.com')).limit(1);
    const DEMO_TENANT_ID = demoTenant.id;
    
    // 2. Create Subscription Plans
    console.log('Creating subscription plans...');
    await db.insert(subscriptionPlans).values([
      {
        name: 'basic',
        displayName: 'Basic Plan',
        description: 'Perfect for small garment manufacturers',
        maxUsers: 10,
        pricePerUserPerMonth: 150000, // 1500 BDT in paisa
        trialDays: 14,
        features: ['Basic ERP', 'Customer Management', 'Basic Reports']
      },
      {
        name: 'business',
        displayName: 'Business Plan',
        description: 'Ideal for growing businesses',
        maxUsers: 20,
        pricePerUserPerMonth: 150000,
        trialDays: 14,
        features: ['Advanced ERP', 'Production Management', 'Advanced Reports', 'AI Insights']
      }
    ]);
    
    // 3. Create Demo Subscription
    console.log('Creating demo subscription...');
    await db.insert(subscriptions).values({
      tenantId: DEMO_TENANT_ID,
      plan: 'business',
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    });
    
    // 4. Create Roles
    console.log('Creating roles...');
    await db.insert(roles).values([
      { 
        name: 'superadmin', 
        displayName: 'Super Admin',
        description: 'Full system access',
        level: 1,
        tenantId: DEMO_TENANT_ID,
        permissions: ['*']
      },
      { 
        name: 'admin', 
        displayName: 'Admin',
        description: 'Administrative access',
        level: 2,
        tenantId: DEMO_TENANT_ID,
        permissions: ['read', 'write', 'delete']
      },
      { 
        name: 'manager', 
        displayName: 'Manager',
        description: 'Management level access',
        level: 3,
        tenantId: DEMO_TENANT_ID,
        permissions: ['read', 'write']
      }
    ]);
    
    // 5. Create Departments
    console.log('Creating departments...');
    await db.insert(departments).values([
      { name: 'Administration', description: 'General Administration', tenantId: DEMO_TENANT_ID },
      { name: 'Production', description: 'Manufacturing and Production', tenantId: DEMO_TENANT_ID },
      { name: 'Commercial', description: 'Sales and Marketing', tenantId: DEMO_TENANT_ID },
      { name: 'Accounts', description: 'Finance and Accounting', tenantId: DEMO_TENANT_ID }
    ]);
    
    // Get role and department IDs
    const [adminRole] = await db.select().from(roles).where({ name: 'admin', tenantId: DEMO_TENANT_ID }).limit(1);
    const [adminDept] = await db.select().from(departments).where({ name: 'Administration', tenantId: DEMO_TENANT_ID }).limit(1);
    
    // 6. Create Demo User
    console.log('Creating demo user...');
    const hashedPassword = await bcrypt.hash('demo123', 10);
    await db.insert(users).values({
      username: 'demo_admin',
      email: 'admin@demo.primex.com',
      password: hashedPassword,
      firstName: 'Demo',
      lastName: 'Admin',
      tenantId: DEMO_TENANT_ID,
      roleId: adminRole.id,
      departmentId: adminDept.id,
      isActive: true,
      isSuperUser: true
    });
    
    // 7. Create Sample Customers
    console.log('Creating customers...');
    await db.insert(customers).values([
      {
        tenantId: DEMO_TENANT_ID,
        customerId: 'CUST-001',
        customerName: 'Global Fashion Inc.',
        contactPerson: 'John Smith',
        email: 'orders@globalfashion.com',
        phone: '+1-555-0123',
        address: '123 Fashion Ave, New York, NY 10001',
        country: 'USA',
        paymentTerms: 'Net 30',
        creditLimit: '500000'
      },
      {
        tenantId: DEMO_TENANT_ID,
        customerId: 'CUST-002',
        customerName: 'European Textiles Ltd.',
        contactPerson: 'Sarah Wilson',
        email: 'procurement@europetextiles.com',
        phone: '+44-20-7946-0958',
        address: '456 Textile Street, London, UK',
        country: 'UK',
        paymentTerms: 'Net 45',
        creditLimit: '750000'
      }
    ]);
    
    // Get customer IDs
    const [customer1] = await db.select().from(customers).where({ customerId: 'CUST-001' }).limit(1);
    const [customer2] = await db.select().from(customers).where({ customerId: 'CUST-002' }).limit(1);
    
    // 8. Create Sample Inquiries
    console.log('Creating inquiries...');
    await db.insert(inquiries).values([
      {
        tenantId: DEMO_TENANT_ID,
        customerId: customer1.id,
        inquiryId: 'INQ-2025-001',
        styleName: 'Basic T-Shirt',
        inquiryType: 'quotation',
        department: 'Mens',
        projectedQuantity: 5000,
        projectedDeliveryDate: '2025-08-15',
        targetPrice: '4.50',
        materialComposition: '100% Cotton Single Jersey',
        sizeRange: 'S-XXL',
        colorOptions: ['White', 'Black', 'Navy'],
        countryOfOrigin: 'Bangladesh',
        incoterms: 'FOB',
        status: 'new'
      },
      {
        tenantId: DEMO_TENANT_ID,
        customerId: customer2.id,
        inquiryId: 'INQ-2025-002',
        styleName: 'Polo Shirt',
        inquiryType: 'quotation',
        department: 'Mens',
        projectedQuantity: 3000,
        projectedDeliveryDate: '2025-09-01',
        targetPrice: '6.75',
        materialComposition: '65% Cotton 35% Polyester Pique',
        sizeRange: 'XS-XL',
        colorOptions: ['White', 'Navy', 'Red'],
        countryOfOrigin: 'Bangladesh',
        incoterms: 'CIF',
        status: 'in_progress'
      }
    ]);
    
    console.log('✅ Simple demo data seeding completed successfully!');
    console.log(`
📊 Summary of created data:
- Demo Tenant: ${demoTenant.name}
- Users: 1
- Customers: 2
- Inquiries: 2

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
seedSimpleData()
  .then(() => {
    console.log('Demo data seeding completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to seed demo data:', error);
    process.exit(1);
  });