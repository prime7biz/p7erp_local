import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "./db";
import { rateLimit } from "./middleware/rateLimitMiddleware";
import { 
  tenants, users, roles, userRoles, subscriptions, subscriptionPlans,
  emailVerificationTokens, tenantSettings,
  tenantRegistrationSchema, loginSchema,
  type TenantRegistration, type LoginCredentials
} from "../shared/schema";
import { eq, and, or, ilike } from "drizzle-orm";
import crypto from "crypto";
import { sendRegistrationConfirmation, sendEmailVerification, isEmailConfigured } from "./services/emailService";
import { getJwtSecret } from "./utils/jwtSecret";
import { logAudit } from "./services/auditService";
import { getAuthCookieOptions, getClearCookieOptions } from "./utils/cookies";

const router = express.Router();

const failedLoginTracker = new Map<string, { count: number; firstAttempt: number }>();

function trackFailedLogin(ip: string): { blocked: boolean; count: number } {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const entry = failedLoginTracker.get(ip);
  if (entry && (now - entry.firstAttempt) > windowMs) {
    failedLoginTracker.delete(ip);
  }
  const current = failedLoginTracker.get(ip);
  if (current) {
    current.count++;
    return { blocked: current.count >= 5, count: current.count };
  } else {
    failedLoginTracker.set(ip, { count: 1, firstAttempt: now });
    return { blocked: false, count: 1 };
  }
}

function clearFailedLogins(ip: string) {
  failedLoginTracker.delete(ip);
}

function getFailedAttemptCount(ip: string): number {
  const entry = failedLoginTracker.get(ip);
  if (!entry) return 0;
  if ((Date.now() - entry.firstAttempt) > 15 * 60 * 1000) {
    failedLoginTracker.delete(ip);
    return 0;
  }
  return entry.count;
}

async function generateCompanyCode(companyName: string): Promise<string> {
  const letters = companyName.replace(/[^a-zA-Z]/g, '').toUpperCase();
  const prefix = letters.substring(0, Math.min(5, Math.max(3, letters.length)));
  
  for (let i = 0; i < 10; i++) {
    const digits = String(Math.floor(1000 + Math.random() * 9000));
    const code = prefix + digits;
    const existing = await db.select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.companyCode, code))
      .limit(1);
    if (existing.length === 0) return code;
  }
  throw new Error("Failed to generate unique company code after 10 attempts");
}

router.get("/subscription-plans", async (req, res) => {
  try {
    const plans = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true));
    res.json(plans);
  } catch (error) {
    console.error("Error fetching subscription plans:", error);
    res.status(500).json({ message: "Failed to fetch subscription plans" });
  }
});

router.post("/register", rateLimit({ windowMs: 60 * 60 * 1000, maxRequests: 5, message: "Too many registration attempts. Please try again later." }), async (req, res) => {
  try {
    const validatedData = tenantRegistrationSchema.parse(req.body);
    
    const existingUser = await db.select()
      .from(users)
      .where(or(
        eq(users.username, validatedData.username),
        eq(users.email, validatedData.email)
      ))
      .limit(1);
    
    if (existingUser.length > 0) {
      return res.status(400).json({ message: "Username or email already exists" });
    }
    
    const companyCode = await generateCompanyCode(validatedData.companyName);
    const domain = validatedData.companyName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    let selectedPlan: any = null;
    if (validatedData.planId) {
      const [plan] = await db.select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, validatedData.planId))
        .limit(1);
      selectedPlan = plan || null;
    }
    if (!selectedPlan) {
      const [trialPlan] = await db.select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.name, "trial"))
        .limit(1);
      selectedPlan = trialPlan || null;
    }

    const [ownerRole] = await db.select()
      .from(roles)
      .where(eq(roles.name, "owner"))
      .limit(1);
    
    if (!ownerRole) {
      return res.status(500).json({ message: "Owner role not found. Please run setup script." });
    }
    
    const result = await db.transaction(async (tx) => {
      const [newTenant] = await tx.insert(tenants).values({
        name: validatedData.companyName,
        domain,
        companyCode,
        status: "PENDING",
        isActive: true,
        businessType: validatedData.businessType || "both"
      }).returning();
      
      if (selectedPlan) {
        const startDate = new Date();
        const endDate = new Date();
        if (selectedPlan.name === "trial") {
          endDate.setFullYear(endDate.getFullYear() + 100);
        } else {
          endDate.setMonth(startDate.getMonth() + 1);
        }
        await tx.insert(subscriptions).values({
          tenantId: newTenant.id,
          plan: selectedPlan.name,
          status: selectedPlan.name === "trial" ? "trial" : "active",
          startDate,
          endDate
        });
      }
      
      const hashedPassword = await bcrypt.hash(validatedData.password, 10);
      
      const [newUser] = await tx.insert(users).values({
        username: validatedData.username,
        email: validatedData.email,
        password: hashedPassword,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        tenantId: newTenant.id,
        roleId: ownerRole.id,
        phone: validatedData.phone,
        isActive: true,
        isSuperUser: true,
        emailVerified: false
      }).returning();
      
      await tx.insert(userRoles).values({
        userId: newUser.id,
        roleId: ownerRole.id,
        tenantId: newTenant.id,
        isPrimary: true,
        assignedBy: newUser.id,
      });

      const addressParts = [validatedData.companyAddress, validatedData.country].filter(Boolean);
      await tx.insert(tenantSettings).values({
        tenantId: newTenant.id,
        companyName: validatedData.companyName,
        companyPhone: validatedData.phone,
        companyAddress: addressParts.length > 0 ? addressParts.join(", ") : null,
        companyEmail: validatedData.email,
        baseCurrency: validatedData.baseCurrency || "BDT",
        localCurrency: validatedData.baseCurrency || "BDT",
        displayCurrency: validatedData.baseCurrency || "BDT",
        fiscalYearStart: validatedData.fiscalYearStart || "January",
        timeZone: validatedData.timeZone || "Asia/Dhaka",
      });
      
      return { tenant: newTenant, user: newUser };
    });

    logAudit({ tenantId: result.tenant.id, entityType: 'user', entityId: result.user.id, action: 'CREATE', performedBy: result.user.id, newValues: { username: result.user.username, email: result.user.email }, ipAddress: req.ip });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const ownerName = `${validatedData.firstName} ${validatedData.lastName}`;

    try {
      await sendRegistrationConfirmation(validatedData.email, {
        companyName: validatedData.companyName,
        companyCode,
        ownerName
      });
    } catch (emailErr) {
      console.error("Failed to send registration confirmation email");
    }

    try {
      const verificationToken = jwt.sign(
        { userId: result.user.id, email: validatedData.email, type: "email_verification" },
        getJwtSecret(),
        { expiresIn: "24h" }
      );
      const verificationUrl = `${baseUrl}/api/public/verify-email?token=${verificationToken}`;

      await db.insert(emailVerificationTokens).values({
        userId: result.user.id,
        token: verificationToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        used: false
      });

      await sendEmailVerification(validatedData.email, {
        name: ownerName,
        verificationUrl
      });
    } catch (emailErr) {
      console.error("Failed to send email verification");
    }

    res.status(201).json({
      message: "Registration submitted. Your company is pending approval by PrimeX Platform Admin.",
      companyCode,
      status: "PENDING"
    });
    
  } catch (error: any) {
    console.error("Registration error");
    
    if (error.name === "ZodError") {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: error.errors 
      });
    }
    
    res.status(500).json({ message: "Registration failed" });
  }
});

router.post("/login", rateLimit({ windowMs: 15 * 60 * 1000, maxRequests: 10, message: "Too many login attempts. Please try again later." }), async (req, res) => {
  try {
    const validatedData = loginSchema.parse(req.body);
    
    const [tenant] = await db.select()
      .from(tenants)
      .where(ilike(tenants.companyCode, validatedData.companyCode))
      .limit(1);
    
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    if (getFailedAttemptCount(clientIp) >= 5) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (!tenant) {
      const failResult = trackFailedLogin(clientIp);
      logAudit({ tenantId: 0, entityType: 'security', entityId: 0, action: 'FAILED_LOGIN', performedBy: 0, newValues: { username: validatedData.username, companyCode: validatedData.companyCode, reason: 'invalid_company_code', failedAttempts: failResult.count }, ipAddress: clientIp, userAgent });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (tenant.status === "PENDING") {
      return res.status(403).json({ 
        message: "Your company is pending approval by PrimeX Platform Admin.", 
        statusCode: "PENDING" 
      });
    }
    if (tenant.status === "REJECTED") {
      return res.status(403).json({ 
        message: "Your company registration was rejected.", 
        statusCode: "REJECTED" 
      });
    }
    if (tenant.status === "SUSPENDED") {
      return res.status(403).json({ 
        message: "Your company has been suspended. Please contact support.", 
        statusCode: "SUSPENDED" 
      });
    }
    
    const [user] = await db.select()
      .from(users)
      .where(
        and(
          eq(users.tenantId, tenant.id),
          eq(users.username, validatedData.username)
        )
      )
      .limit(1);
    
    if (!user) {
      const failResult = trackFailedLogin(clientIp);
      logAudit({ tenantId: tenant.id, entityType: 'security', entityId: 0, action: 'FAILED_LOGIN', performedBy: 0, newValues: { username: validatedData.username, reason: 'user_not_found', failedAttempts: failResult.count }, ipAddress: clientIp, userAgent });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.isActive) {
      const failResult = trackFailedLogin(clientIp);
      logAudit({ tenantId: tenant.id, entityType: 'security', entityId: user.id, action: 'FAILED_LOGIN', performedBy: user.id, newValues: { username: validatedData.username, reason: 'account_disabled', failedAttempts: failResult.count }, ipAddress: clientIp, userAgent });
      return res.status(401).json({ message: "Invalid credentials" });
    }
    
    const isValidPassword = await bcrypt.compare(validatedData.password, user.password);
    if (!isValidPassword) {
      const failResult = trackFailedLogin(clientIp);
      logAudit({ tenantId: tenant.id, entityType: 'security', entityId: user.id, action: 'FAILED_LOGIN', performedBy: user.id, newValues: { username: validatedData.username, reason: 'wrong_password', failedAttempts: failResult.count }, ipAddress: clientIp, userAgent });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    clearFailedLogins(clientIp);

    const previousLoginIp = user.lastLoginIp;
    if (previousLoginIp && previousLoginIp !== clientIp) {
      logAudit({ tenantId: tenant.id, entityType: 'security', entityId: user.id, action: 'CONCURRENT_SESSION_DETECTED', performedBy: user.id, newValues: { previousIp: previousLoginIp, currentIp: clientIp, username: user.username }, ipAddress: clientIp, userAgent });
    }
    
    await db.update(users)
      .set({ lastLogin: new Date(), lastLoginIp: clientIp })
      .where(eq(users.id, user.id));
    
    logAudit({ tenantId: tenant.id, entityType: 'session', entityId: user.id, action: 'LOGIN', performedBy: user.id, newValues: { username: user.username }, ipAddress: clientIp, userAgent });
    
    const token = jwt.sign(
      { 
        userId: user.id, 
        tenantId: user.tenantId,
        roleId: user.roleId,
        isSuperUser: user.isSuperUser
      },
      getJwtSecret(),
      { expiresIn: "8h" }
    );
    
    res.cookie("token", token, getAuthCookieOptions());
    
    if (req.get('host')?.includes('replit.dev')) {
      res.header('Access-Control-Allow-Credentials', 'true');
    }
    
    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        tenantId: user.tenantId,
        roleId: user.roleId,
        isSuperUser: user.isSuperUser,
        tenant: {
          id: tenant.id,
          name: tenant.name,
          domain: tenant.domain,
          companyCode: tenant.companyCode
        }
      }
    });
    
  } catch (error: any) {
    console.error("Login error");
    
    if (error.name === "ZodError") {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: error.errors 
      });
    }
    
    res.status(500).json({ message: "Login failed" });
  }
});

router.post("/demo-login", async (req, res) => {
  try {
    let demoCompanyCode = "PRIM2535";
    
    const [demoTenant] = await db.select()
      .from(tenants)
      .where(eq(tenants.id, 1))
      .limit(1);
    
    if (demoTenant?.companyCode) {
      demoCompanyCode = demoTenant.companyCode;
    }

    const demoUserData = {
      id: 1,
      username: "admin",
      email: "admin@primexgarments.com",
      firstName: "Admin", 
      lastName: "User",
      tenantId: 1,
      roleId: 1,
      isSuperUser: true,
      tenantName: demoTenant?.name || "PrimeX Garments Ltd.",
      tenantDomain: demoTenant?.domain || "primexgarments"
    };

    const token = jwt.sign(
      { 
        userId: demoUserData.id, 
        tenantId: demoUserData.tenantId,
        roleId: demoUserData.roleId,
        isSuperUser: demoUserData.isSuperUser
      },
      getJwtSecret(),
      { expiresIn: "8h" }
    );

    res.cookie("token", token, getAuthCookieOptions());
    
    res.json({
      message: "Demo login successful",
      user: {
        id: demoUserData.id,
        username: demoUserData.username,
        email: demoUserData.email,
        firstName: demoUserData.firstName,
        lastName: demoUserData.lastName,
        tenantId: demoUserData.tenantId,
        roleId: demoUserData.roleId,
        isSuperUser: demoUserData.isSuperUser,
        tenant: {
          id: demoUserData.tenantId,
          name: demoUserData.tenantName,
          domain: demoUserData.tenantDomain,
          companyCode: demoCompanyCode
        }
      }
    });
    
  } catch (error) {
    console.error("Demo login error");
    res.status(500).json({ message: "Demo login failed" });
  }
});

router.get("/me", async (req, res) => {
  try {
    const token = req.cookies?.token;
    
    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    let decoded;
    try {
      decoded = jwt.verify(token, getJwtSecret()) as any;
    } catch (error: any) {
      return res.status(401).json({ message: "Invalid token" });
    }
    
    const [user] = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      tenantId: users.tenantId,
      roleId: users.roleId,
      isSuperUser: users.isSuperUser,
      tenantName: tenants.name,
      tenantDomain: tenants.domain,
      tenantCompanyCode: tenants.companyCode,
      tenantBusinessType: tenants.businessType,
    })
    .from(users)
    .innerJoin(tenants, eq(users.tenantId, tenants.id))
    .where(eq(users.id, decoded.userId))
    .limit(1);

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    const subResult = await db.select({
      status: subscriptions.status,
      endDate: subscriptions.endDate,
      planName: subscriptions.plan,
    })
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, user.tenantId))
    .limit(1);

    const sub = subResult[0] || null;

    let planInfo = null;
    if (sub) {
      const [plan] = await db.select({
        maxUsers: subscriptionPlans.maxUsers,
      })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.name, sub.planName))
      .limit(1);
      planInfo = plan || null;
    }

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      tenantId: user.tenantId,
      roleId: user.roleId,
      isSuperUser: user.isSuperUser,
      tenant: {
        id: user.tenantId,
        name: user.tenantName,
        domain: user.tenantDomain,
        companyCode: user.tenantCompanyCode,
        businessType: user.tenantBusinessType || 'both',
      },
      subscription: sub ? {
        status: sub.status,
        endDate: sub.endDate,
        planName: sub.planName,
        maxUsers: planInfo?.maxUsers ?? 10,
        currentUsers: 1,
      } : null,
    });
    
  } catch (error) {
    console.error("Get user error");
    res.status(401).json({ message: "Invalid token" });
  }
});

router.post("/logout", (req, res) => {
  try {
    const token = req.cookies?.token;
    if (token) {
      const decoded = jwt.verify(token, getJwtSecret()) as any;
      if (decoded?.userId && decoded?.tenantId) {
        logAudit({
          tenantId: decoded.tenantId,
          entityType: 'session',
          entityId: decoded.userId,
          action: 'LOGOUT',
          performedBy: decoded.userId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }
    }
  } catch (e) {
    console.error("Logout audit error:", e);
  }
  res.clearCookie("token", getClearCookieOptions());
  res.json({ message: "Logout successful" });
});

export default router;
