import { db } from "../server/db";
import { subscriptionPlans, subscriptions, tenants, users, roles } from "../shared/schema";
import { eq } from "drizzle-orm";

async function setupSubscriptionPlans() {
  console.log("Setting up subscription plans...");

  // Create the subscription plans table if it doesn't exist
  try {
    // Insert the 4 subscription plans + trial
    const plans = [
      {
        name: "trial",
        displayName: "30-Day Trial",
        description: "Free trial for 30 days with full access",
        maxUsers: 5,
        pricePerUserPerMonth: 0, // Free trial
        trialDays: 30,
        features: ["All Features", "30-Day Trial", "5 Users", "Email Support"]
      },
      {
        name: "basic",
        displayName: "Basic Plan",
        description: "Perfect for small teams getting started",
        maxUsers: 10,
        pricePerUserPerMonth: 150000, // 1500 BDT in paisa
        trialDays: 0,
        features: ["Core ERP Features", "10 Users", "Basic Reports", "Email Support"]
      },
      {
        name: "business",
        displayName: "Business Plan",
        description: "Ideal for growing businesses",
        maxUsers: 20,
        pricePerUserPerMonth: 150000, // 1500 BDT in paisa
        trialDays: 0,
        features: ["All ERP Features", "20 Users", "Advanced Reports", "Priority Support", "API Access"]
      },
      {
        name: "premium",
        displayName: "Premium Plan",
        description: "For established businesses with advanced needs",
        maxUsers: 50,
        pricePerUserPerMonth: 150000, // 1500 BDT in paisa
        trialDays: 0,
        features: ["All Features", "50 Users", "Custom Reports", "24/7 Support", "API Access", "Integrations"]
      },
      {
        name: "enterprise",
        displayName: "Enterprise Plan",
        description: "For large organizations with unlimited needs",
        maxUsers: 999,
        pricePerUserPerMonth: 150000, // 1500 BDT in paisa
        trialDays: 0,
        features: ["All Features", "Unlimited Users", "Custom Development", "Dedicated Support", "On-premise Option"]
      }
    ];

    // Insert plans
    for (const plan of plans) {
      await db.insert(subscriptionPlans).values(plan).onConflictDoUpdate({
        target: subscriptionPlans.name,
        set: {
          displayName: plan.displayName,
          description: plan.description,
          maxUsers: plan.maxUsers,
          pricePerUserPerMonth: plan.pricePerUserPerMonth,
          trialDays: plan.trialDays,
          features: plan.features,
          updatedAt: new Date()
        }
      });
      console.log(`✓ Created/Updated plan: ${plan.displayName}`);
    }

    console.log("All subscription plans created successfully!");
    
  } catch (error) {
    console.error("Error setting up subscription plans:", error);
    throw error;
  }
}

async function setupDefaultRoles() {
  console.log("Setting up default roles...");

  const defaultRoles = [
    {
      name: "owner",
      displayName: "Owner",
      description: "Full system access and administrative privileges",
      level: 1,
      permissions: {
        all: true,
        users: { create: true, read: true, update: true, delete: true },
        settings: { create: true, read: true, update: true, delete: true },
        billing: { create: true, read: true, update: true, delete: true }
      }
    },
    {
      name: "admin",
      displayName: "Administrator",
      description: "Administrative access with user management",
      level: 2,
      permissions: {
        users: { create: true, read: true, update: true, delete: false },
        settings: { create: false, read: true, update: true, delete: false },
        modules: { create: true, read: true, update: true, delete: true }
      }
    },
    {
      name: "manager",
      displayName: "Manager",
      description: "Departmental management access",
      level: 3,
      permissions: {
        users: { create: false, read: true, update: false, delete: false },
        modules: { create: true, read: true, update: true, delete: false }
      }
    },
    {
      name: "employee",
      displayName: "Employee",
      description: "Standard user access",
      level: 4,
      permissions: {
        modules: { create: false, read: true, update: false, delete: false }
      }
    }
  ];

  for (const role of defaultRoles) {
    await db.insert(roles).values(role).onConflictDoUpdate({
      target: roles.name,
      set: {
        displayName: role.displayName,
        description: role.description,
        level: role.level,
        permissions: role.permissions,
        updatedAt: new Date()
      }
    });
    console.log(`✓ Created/Updated role: ${role.displayName}`);
  }

  console.log("All default roles created successfully!");
}

async function main() {
  try {
    await setupSubscriptionPlans();
    await setupDefaultRoles();
    console.log("Setup completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Setup failed:", error);
    process.exit(1);
  }
}

main();