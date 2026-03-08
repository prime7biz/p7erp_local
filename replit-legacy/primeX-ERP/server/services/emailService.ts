import { Resend } from 'resend';

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Email configuration
const FROM_EMAIL = 'noreply@prime7erp.com';
const FALLBACK_EMAIL = 'onboarding@resend.dev';
const BRAND_NAME = 'Prime7 ERP';
const ACCENT_COLOR = '#f97316';

/**
 * Check if email service is properly configured
 */
export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/**
 * Get the appropriate from email address
 */
function getFromEmail(): string {
  // For now, use the primary domain; in production, verify domain setup
  return FROM_EMAIL;
}

/**
 * Generic email sending function with error handling
 */
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isEmailConfigured()) {
      console.warn('[EMAIL] Email service not configured (RESEND_API_KEY missing)');
      return {
        success: false,
        error: 'Email service not configured',
      };
    }

    const response = await resend.emails.send({
      from: getFromEmail(),
      to,
      subject,
      html,
      text,
    });

    if (response.error) {
      console.error('[EMAIL] Failed to send email:', response.error);
      return {
        success: false,
        error: response.error.message || 'Failed to send email',
      };
    }

    console.log(`[EMAIL] Email sent successfully to ${to}`, { messageId: response.data?.id });
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[EMAIL] Error sending email:', errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Generate base email HTML template wrapper with consistent styling
 */
function createEmailTemplate(
  title: string,
  content: string,
  primaryAction?: { text: string; url: string }
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333333;
      background-color: #f9fafb;
      margin: 0;
      padding: 0;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .email-header {
      background: linear-gradient(135deg, ${ACCENT_COLOR} 0%, #ea580c 100%);
      padding: 30px 20px;
      text-align: center;
      color: #ffffff;
    }
    .email-header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .email-header p {
      margin: 8px 0 0 0;
      font-size: 14px;
      opacity: 0.9;
    }
    .email-body {
      padding: 30px 20px;
    }
    .email-body h2 {
      color: #1f2937;
      font-size: 20px;
      font-weight: 600;
      margin-top: 0;
      margin-bottom: 16px;
    }
    .email-body p {
      margin: 0 0 16px 0;
      font-size: 14px;
      line-height: 1.6;
      color: #555555;
    }
    .content-section {
      margin-bottom: 24px;
    }
    .highlight-box {
      background-color: #f3f4f6;
      border-left: 4px solid ${ACCENT_COLOR};
      padding: 16px;
      margin: 16px 0;
      border-radius: 4px;
    }
    .highlight-box p {
      margin: 0;
      font-weight: 600;
      color: #1f2937;
    }
    .highlight-box .value {
      font-size: 18px;
      color: ${ACCENT_COLOR};
      word-break: break-all;
    }
    .primary-button {
      display: inline-block;
      background-color: ${ACCENT_COLOR};
      color: #ffffff;
      padding: 12px 24px;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      margin: 16px 0;
      transition: background-color 0.3s ease;
    }
    .primary-button:hover {
      background-color: #ea580c;
    }
    .secondary-button {
      display: inline-block;
      background-color: #e5e7eb;
      color: #1f2937;
      padding: 12px 24px;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      margin: 8px 8px 8px 0;
    }
    .status-badge {
      display: inline-block;
      background-color: #fef3c7;
      color: #92400e;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      margin: 8px 0;
    }
    .status-badge.approved {
      background-color: #d1fae5;
      color: #065f46;
    }
    .status-badge.rejected {
      background-color: #fee2e2;
      color: #7f1d1d;
    }
    .email-footer {
      background-color: #f9fafb;
      border-top: 1px solid #e5e7eb;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
    }
    .email-footer p {
      margin: 8px 0;
    }
    .divider {
      border-top: 1px solid #e5e7eb;
      margin: 24px 0;
    }
    ul {
      margin: 12px 0;
      padding-left: 20px;
    }
    ul li {
      margin: 8px 0;
      color: #555555;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1>${title}</h1>
      <p>${BRAND_NAME}</p>
    </div>
    <div class="email-body">
      ${content}
      ${
        primaryAction
          ? `<div style="text-align: center;">
        <a href="${primaryAction.url}" class="primary-button">${primaryAction.text}</a>
      </div>`
          : ''
      }
    </div>
    <div class="email-footer">
      <p>© ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.</p>
      <p>This is an automated message, please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text version of email
 */
function createEmailText(sections: string[]): string {
  return sections.join('\n\n').trim();
}

/**
 * Send registration confirmation email
 */
export async function sendRegistrationConfirmation(
  to: string,
  data: {
    companyName: string;
    companyCode: string;
    ownerName: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const html = createEmailTemplate(
      'Registration Received',
      `
<h2>Welcome, ${data.ownerName}!</h2>
<p>Thank you for registering <strong>${data.companyName}</strong> with ${BRAND_NAME}. We're excited to help you streamline your business operations.</p>

<div class="highlight-box">
  <p>Your Company Code:</p>
  <div class="value">${data.companyCode}</div>
</div>

<div class="content-section">
  <p><strong>What happens next?</strong></p>
  <p>Your registration is under review by our administrative team. Here's what you can expect:</p>
  <ul>
    <li>Our team will verify your company information (typically 1-2 business days)</li>
    <li>You'll receive an email notification once your account is approved</li>
    <li>After approval, you'll have full access to the ${BRAND_NAME} platform</li>
  </ul>
</div>

<div class="status-badge">Pending Approval</div>

<p>In the meantime, please save your company code above. You may need it for reference during the verification process.</p>

<p>If you have any questions, feel free to reach out to our support team.</p>

<p>Best regards,<br>The ${BRAND_NAME} Team</p>
      `
    );

    const text = createEmailText([
      'WELCOME TO PRIME7 ERP',
      `Hello ${data.ownerName},`,
      `Thank you for registering ${data.companyName} with ${BRAND_NAME}.`,
      `Your Company Code: ${data.companyCode}`,
      'Your registration is under review by our administrative team. We typically complete verification within 1-2 business days.',
      'You will receive an email notification once your account has been approved.',
      'If you have any questions, please contact our support team.',
      `Best regards,\nThe ${BRAND_NAME} Team`,
    ]);

    return sendEmail(
      to,
      'Registration Confirmation - Prime7 ERP',
      html,
      text
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[EMAIL] Error in sendRegistrationConfirmation:', errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send email verification email
 */
export async function sendEmailVerification(
  to: string,
  data: {
    name: string;
    verificationUrl: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const html = createEmailTemplate(
      'Verify Your Email',
      `
<h2>Hello ${data.name},</h2>
<p>To complete your registration and secure your ${BRAND_NAME} account, please verify your email address by clicking the button below.</p>

<p><strong>This link will expire in 24 hours.</strong></p>

<div class="highlight-box">
  <p>Click the link below to verify your email:</p>
  <p><a href="${data.verificationUrl}" style="word-break: break-all; color: ${ACCENT_COLOR}; text-decoration: underline;">${data.verificationUrl}</a></p>
</div>

<p>If the button above doesn't work, you can also copy and paste this link into your browser:</p>
<p style="background-color: #f3f4f6; padding: 12px; border-radius: 4px; word-break: break-all; font-size: 12px;">${data.verificationUrl}</p>

<p>If you didn't create this account, please ignore this email or contact our support team.</p>

<p>Best regards,<br>The ${BRAND_NAME} Team</p>
      `,
      { text: 'Verify Email', url: data.verificationUrl }
    );

    const text = createEmailText([
      'VERIFY YOUR EMAIL',
      `Hello ${data.name},`,
      'To complete your registration, please verify your email address.',
      `Verification Link: ${data.verificationUrl}`,
      'This link will expire in 24 hours.',
      'If you did not request this email, please ignore it.',
      `Best regards,\nThe ${BRAND_NAME} Team`,
    ]);

    return sendEmail(
      to,
      'Verify Your Email - Prime7 ERP',
      html,
      text
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[EMAIL] Error in sendEmailVerification:', errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordReset(
  to: string,
  data: {
    name: string;
    resetUrl: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const html = createEmailTemplate(
      'Reset Your Password',
      `
<h2>Hello ${data.name},</h2>
<p>We received a request to reset the password for your ${BRAND_NAME} account. Click the button below to create a new password.</p>

<p><strong>This link will expire in 1 hour.</strong></p>

<div class="content-section">
  <p>If you didn't request a password reset, you can safely ignore this email. Your account remains secure.</p>
</div>

<p>For security reasons, we never send passwords via email. The link below will allow you to create a new password:</p>

<p style="background-color: #f3f4f6; padding: 12px; border-radius: 4px; word-break: break-all; font-size: 12px;">${data.resetUrl}</p>

<p>If you have any trouble resetting your password, please contact our support team.</p>

<p>Best regards,<br>The ${BRAND_NAME} Team</p>
      `,
      { text: 'Reset Password', url: data.resetUrl }
    );

    const text = createEmailText([
      'PASSWORD RESET REQUEST',
      `Hello ${data.name},`,
      'We received a request to reset your password.',
      `Password Reset Link: ${data.resetUrl}`,
      'This link will expire in 1 hour.',
      'If you did not request this, please ignore this email and your password will remain unchanged.',
      `Best regards,\nThe ${BRAND_NAME} Team`,
    ]);

    return sendEmail(
      to,
      'Password Reset Request - Prime7 ERP',
      html,
      text
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[EMAIL] Error in sendPasswordReset:', errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send tenant approval notification email
 */
export async function sendApprovalNotification(
  to: string,
  data: {
    companyName: string;
    companyCode: string;
    ownerName: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const html = createEmailTemplate(
      'Account Approved!',
      `
<h2>Congratulations, ${data.ownerName}!</h2>
<p>Great news! Your account for <strong>${data.companyName}</strong> has been approved by our administrative team.</p>

<div class="highlight-box" style="background-color: #d1fae5; border-left-color: #10b981;">
  <p>Your Company Code:</p>
  <div class="value" style="color: #059669;">${data.companyCode}</div>
</div>

<div class="status-badge approved">Account Approved</div>

<div class="content-section">
  <p><strong>You're all set to get started!</strong></p>
  <p>Your ${BRAND_NAME} account is now fully active. You can now:</p>
  <ul>
    <li>Access all platform features and modules</li>
    <li>Manage your inventory, orders, and operations</li>
    <li>Generate reports and analytics</li>
    <li>Invite team members to collaborate</li>
  </ul>
</div>

<p>To get started, log in to your account using your registered credentials.</p>

<p>If you have any questions or need assistance, our support team is ready to help.</p>

<p>Welcome aboard!<br>The ${BRAND_NAME} Team</p>
      `
    );

    const text = createEmailText([
      'ACCOUNT APPROVED!',
      `Congratulations, ${data.ownerName}!`,
      `Your account for ${data.companyName} has been approved.`,
      `Your Company Code: ${data.companyCode}`,
      'You now have full access to the Prime7 ERP platform.',
      'Log in with your registered credentials to get started.',
      `Best regards,\nThe ${BRAND_NAME} Team`,
    ]);

    return sendEmail(
      to,
      'Account Approved - Prime7 ERP',
      html,
      text
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[EMAIL] Error in sendApprovalNotification:', errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send tenant rejection notification email
 */
export async function sendRejectionNotification(
  to: string,
  data: {
    companyName: string;
    ownerName: string;
    reason: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const html = createEmailTemplate(
      'Registration Status Update',
      `
<h2>Hello ${data.ownerName},</h2>
<p>Thank you for your interest in ${BRAND_NAME}. We have reviewed your registration for <strong>${data.companyName}</strong>.</p>

<div class="status-badge rejected">Registration Not Approved</div>

<div class="highlight-box" style="background-color: #fee2e2; border-left-color: #dc2626;">
  <p>Reason for review outcome:</p>
  <p style="margin: 8px 0 0 0; color: #7f1d1d; font-weight: normal;">${data.reason}</p>
</div>

<div class="content-section">
  <p><strong>What happens next?</strong></p>
  <p>We understand this may be disappointing. Here are your options:</p>
  <ul>
    <li><strong>Reapply:</strong> If you can address the concerns mentioned above, you may reapply with updated information</li>
    <li><strong>Contact Support:</strong> If you believe this decision was made in error, please reach out to our team</li>
    <li><strong>More Information:</strong> We're happy to provide additional details about the review process</li>
  </ul>
</div>

<p>Please feel free to contact our support team if you have any questions or would like to discuss this decision further.</p>

<p>We appreciate your understanding and remain open to reconsidering your application in the future.</p>

<p>Best regards,<br>The ${BRAND_NAME} Team</p>
      `
    );

    const text = createEmailText([
      'REGISTRATION STATUS UPDATE',
      `Hello ${data.ownerName},`,
      `Your registration for ${data.companyName} has been reviewed.`,
      `Reason: ${data.reason}`,
      'Unfortunately, your account has not been approved at this time.',
      'You may reapply in the future or contact our support team for more information.',
      `Best regards,\nThe ${BRAND_NAME} Team`,
    ]);

    return sendEmail(
      to,
      'Registration Status Update - Prime7 ERP',
      html,
      text
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[EMAIL] Error in sendRejectionNotification:', errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
