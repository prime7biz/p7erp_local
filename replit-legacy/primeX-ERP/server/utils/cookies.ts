import { CookieOptions } from 'express';

export function getAuthCookieOptions(name: string = 'token'): CookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
  
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    ...(name === 'admin_token' ? { maxAge: 12 * 60 * 60 * 1000 } : {}),
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  };
}

export function getClearCookieOptions(name: string = 'token'): CookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
  
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  };
}
