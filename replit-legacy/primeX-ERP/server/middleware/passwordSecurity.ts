import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { storage } from "../storage";

/**
 * Force password change for default accounts on first login
 */
export function enforcePasswordChange(req: Request, res: Response, next: NextFunction) {
  if (req.user && req.user.username === 'admin' && !req.user.lastPasswordChange) {
    return res.status(202).json({
      requiresPasswordChange: true,
      message: "You must change your password before continuing",
      code: "PASSWORD_CHANGE_REQUIRED"
    });
  }
  next();
}

/**
 * Validate password strength
 */
export function validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < 12) {
    errors.push("Password must be at least 12 characters long");
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  
  if (!/\d/.test(password)) {
    errors.push("Password must contain at least one number");
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>?]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }
  
  // Check for common passwords
  const commonPasswords = [
    'admin123', 'password', '123456', 'admin', 'password123',
    'qwerty', 'letmein', 'welcome', 'monkey', 'dragon'
  ];
  
  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push("Password is too common, please choose a stronger password");
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Password change middleware
 */
export function changePassword() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          error: "Current password and new password are required",
          code: "MISSING_PASSWORDS"
        });
      }
      
      // Validate current password
      const isCurrentValid = await bcrypt.compare(currentPassword, req.user!.password);
      if (!isCurrentValid) {
        return res.status(400).json({
          error: "Current password is incorrect",
          code: "INVALID_CURRENT_PASSWORD"
        });
      }
      
      // Validate new password strength
      const validation = validatePasswordStrength(newPassword);
      if (!validation.isValid) {
        return res.status(400).json({
          error: "Password does not meet security requirements",
          code: "WEAK_PASSWORD",
          details: validation.errors
        });
      }
      
      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      
      // Update password in database
      await storage.updateUserPassword(req.user!.id, hashedPassword);
      
      // Log password change
      console.log(`SECURITY: Password changed for user ${req.user!.id} from IP ${req.ip}`);
      
      res.json({
        success: true,
        message: "Password changed successfully"
      });
      
    } catch (error) {
      console.error("Password change error:", error);
      return res.status(500).json({
        error: "Failed to change password",
        code: "PASSWORD_CHANGE_ERROR"
      });
    }
  };
}

/**
 * Generate secure random password for new accounts
 */
export function generateSecurePassword(): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  let password = '';
  
  // Ensure at least one character from each category
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Fill remaining characters randomly
  const allChars = uppercase + lowercase + numbers + symbols;
  for (let i = 4; i < 16; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}