import { Router } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "../db";
import { users, emailVerificationTokens, passwordResetTokens } from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import { sendEmailVerification, sendPasswordReset, isEmailConfigured } from "../services/emailService";
import { rateLimit } from "../middleware/rateLimitMiddleware";
import { getVerificationDetails } from "../services/verificationService";

const router = Router();

/**
 * POST /send-verification
 * Send email verification link to user
 */
router.post("/send-verification", rateLimit({ windowMs: 60 * 60 * 1000, maxRequests: 3, message: "Too many verification requests." }), async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Email is required" });
    }

    // Find user by email
    const [user] = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      return res.json({ message: "If that email exists, a verification link has been sent." });
    }

    // Generate unique token
    const token = crypto.randomUUID();

    // Calculate expiration time (24 hours from now)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Store token in database
    await db.insert(emailVerificationTokens).values({
      userId: user.id,
      token,
      expiresAt,
      used: false
    });

    // Build verification URL
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const verificationUrl = `${baseUrl}/verify-email?token=${token}`;

    // Send verification email
    const emailResult = await sendEmailVerification(user.email, {
      name: user.firstName || user.username,
      verificationUrl
    });

    if (!emailResult.success) {
      console.error("Failed to send verification email:", emailResult.error);
      return res.status(500).json({ 
        message: "Failed to send verification email",
        error: emailResult.error 
      });
    }

    res.json({
      message: "If that email exists, a verification link has been sent."
    });

  } catch (error) {
    console.error("Error in /send-verification:", error);
    res.json({ message: "If that email exists, a verification link has been sent." });
  }
});

/**
 * GET /verify-email
 * Verify email using token from query parameter
 */
router.get("/verify-email", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== "string") {
      return res.status(400).json({ message: "Token is required" });
    }

    // Find token in database
    const [verificationToken] = await db.select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.token, token))
      .limit(1);

    if (!verificationToken) {
      return res.status(404).json({ message: "Invalid or expired token" });
    }

    // Check if token is expired
    if (new Date() > verificationToken.expiresAt) {
      return res.status(400).json({ 
        message: "Token has expired",
        expired: true 
      });
    }

    // Check if token has already been used
    if (verificationToken.used) {
      return res.status(400).json({ 
        message: "Token has already been used" 
      });
    }

    // Mark token as used
    await db.update(emailVerificationTokens)
      .set({ used: true })
      .where(eq(emailVerificationTokens.id, verificationToken.id));

    // Update user's emailVerified status
    await db.update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, verificationToken.userId));

    res.json({
      message: "Email verified successfully",
      success: true,
      redirect: "/login"
    });

  } catch (error) {
    console.error("Error in /verify-email:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ 
      message: "Failed to verify email",
      error: errorMessage 
    });
  }
});

/**
 * POST /forgot-password
 * Request password reset link
 * Always returns success to prevent email enumeration
 */
router.post("/forgot-password", rateLimit({ windowMs: 60 * 60 * 1000, maxRequests: 5, message: "Too many password reset requests." }), async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== "string") {
      // Return success even for invalid input to prevent enumeration
      return res.json({
        message: "If an account exists with this email, a password reset link will be sent"
      });
    }

    // Find user by email (but don't reveal if found)
    const [user] = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (user) {
      try {
        // Generate reset token
        const token = crypto.randomUUID();

        // Calculate expiration time (1 hour from now)
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        // Store token in database
        await db.insert(passwordResetTokens).values({
          userId: user.id,
          token,
          expiresAt,
          used: false
        });

        // Build reset URL
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const resetUrl = `${baseUrl}/reset-password?token=${token}`;

        // Send reset email
        await sendPasswordReset(user.email, {
          name: user.firstName || user.username,
          resetUrl
        });

        console.log("Password reset email sent");
      } catch (emailError) {
        console.error("Failed to send password reset email:", emailError);
        // Still return success to not reveal if email exists
      }
    }

    // Always return success message
    res.json({
      message: "If an account exists with this email, a password reset link will be sent"
    });

  } catch (error) {
    console.error("Error in /forgot-password:", error);
    // Return generic success to prevent enumeration attacks
    res.json({
      message: "If an account exists with this email, a password reset link will be sent"
    });
  }
});

/**
 * POST /reset-password
 * Reset user password with valid token
 */
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || typeof token !== "string") {
      return res.status(400).json({ message: "Token is required" });
    }

    if (!password || typeof password !== "string") {
      return res.status(400).json({ message: "Password is required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters long" });
    }

    // Find token in database
    const [resetToken] = await db.select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .limit(1);

    if (!resetToken) {
      return res.status(404).json({ message: "Invalid or expired token" });
    }

    // Check if token is expired
    if (new Date() > resetToken.expiresAt) {
      return res.status(400).json({ 
        message: "Token has expired",
        expired: true 
      });
    }

    // Check if token has already been used
    if (resetToken.used) {
      return res.status(400).json({ 
        message: "Token has already been used" 
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user's password
    await db.update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, resetToken.userId));

    // Mark token as used
    await db.update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.id, resetToken.id));

    res.json({
      message: "Password reset successfully",
      success: true,
      redirect: "/login"
    });

  } catch (error) {
    console.error("Error in /reset-password:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ 
      message: "Failed to reset password",
      error: errorMessage 
    });
  }
});

router.get("/verify/:code", async (req, res) => {
  try {
    const { code } = req.params;
    if (!code || typeof code !== "string" || code.length > 64) {
      return res.status(400).json({ valid: false, message: "Invalid verification code" });
    }

    const result = await getVerificationDetails(code);
    if (!result) {
      return res.status(404).json({ valid: false, message: "Document not found or code is invalid" });
    }

    return res.json(result);
  } catch (error) {
    console.error("Error verifying document:", error);
    return res.status(500).json({ valid: false, message: "Verification failed" });
  }
});

export default router;
