export type UserRole =
  | "ADMIN"
  | "EDITOR"
  | "STAFF"
  | "SELLER"
  | "BARTENDER"
  | "VIP_GUEST"
  | "GUEST";

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  ADMIN: 7,
  EDITOR: 6,
  STAFF: 5,
  SELLER: 4,
  BARTENDER: 3,
  VIP_GUEST: 2,
  GUEST: 1,
};

export const DASHBOARD_ROLES: UserRole[] = [
  "ADMIN",
  "EDITOR",
  "STAFF",
  "SELLER",
  "BARTENDER",
];

export const CHECKIN_ROLES: UserRole[] = ["ADMIN", "EDITOR", "STAFF"];
export const BAR_ROLES: UserRole[] = ["ADMIN", "EDITOR", "STAFF", "BARTENDER"];
export const SELLER_ROLES: UserRole[] = ["ADMIN", "EDITOR", "SELLER"];
export const EVENT_MANAGE_ROLES: UserRole[] = ["ADMIN", "EDITOR"];

export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function canAccess(userRole: UserRole, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(userRole);
}
