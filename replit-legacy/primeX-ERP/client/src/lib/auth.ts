import { jwtDecode } from 'jwt-decode';

interface JwtPayload {
  userId: number;
  username: string;
  tenantId: number;
  role: string;
  exp: number;
}

export function getTokenFromCookie(): string | null {
  const cookies = document.cookie.split(';');
  for (let i = 0; i < cookies.length; i++) {
    const cookie = cookies[i].trim();
    if (cookie.startsWith('token=')) {
      return cookie.substring('token='.length, cookie.length);
    }
  }
  return null;
}

export function isTokenValid(token: string): boolean {
  try {
    const decoded = jwtDecode<JwtPayload>(token);
    const currentTime = Date.now() / 1000;
    
    return decoded.exp > currentTime;
  } catch (error) {
    return false;
  }
}

export function hasPermission(requiredRole: string, userRole: string): boolean {
  const roleHierarchy = {
    'admin': 4,
    'manager': 3,
    'user': 2,
    'viewer': 1
  };
  
  const userRoleLevel = roleHierarchy[userRole as keyof typeof roleHierarchy] || 0;
  const requiredRoleLevel = roleHierarchy[requiredRole as keyof typeof roleHierarchy] || 0;
  
  return userRoleLevel >= requiredRoleLevel;
}

export function canAccessResource(resourceOwnerId: number, currentUserId: number, userRole: string): boolean {
  return resourceOwnerId === currentUserId || hasPermission('admin', userRole);
}
