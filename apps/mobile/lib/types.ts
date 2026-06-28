// Mirror of apps/web/src/lib/supabase/types.ts — keep in sync

export type UserRole = "ADMIN" | "EDITOR" | "STAFF" | "SELLER" | "BARTENDER" | "VIP_GUEST" | "GUEST";
export type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELLED" | "ARCHIVED";
export type TicketTier = "EARLY_BIRD" | "GENERAL" | "LATE" | "DOOR" | "VIP" | "FREE";
export type OrderStatus = "PENDING" | "PAID" | "CANCELLED" | "REFUNDED";
export type DrinkOrderStatus = "PENDING" | "IN_PROGRESS" | "FULFILLED" | "CANCELLED";
export type DrinkCategory = "COCKTAIL" | "BEER" | "WINE" | "SPIRIT" | "SOFT_DRINK" | "SHOT" | "OTHER";

export interface Profile {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
  avatar_url: string | null;
  loyalty_discount: boolean;
  vip_notes: string | null;
  wallet_token: string | null;
  display_id: string | null;
  billing_name: string | null;
  billing_address: string | null;
  billing_city: string | null;
  billing_postal_code: string | null;
  billing_country: string | null;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  start_date: string;
  end_date: string | null;
  venue: string | null;
  address: string | null;
  capacity: number;
  status: EventStatus;
  tax_rate: number;
  created_at: string;
}

export interface TicketType {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price: number;
  quantity: number;
  sold: number;
  tier: TicketTier;
  max_per_order: number;
  sale_enabled: boolean;
  sale_price: number | null;
  is_bundle: boolean;
  bundle_size: number | null;
  is_door_ticket: boolean;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
}

export interface Ticket {
  id: string;
  order_id: string;
  event_id: string | null;
  ticket_type_id: string | null;
  ticket_name: string | null;
  tier: TicketTier;
  status: "VALID" | "USED" | "CANCELLED" | "REFUNDED";
  qr_code: string;
  used_at: string | null;
  holder_name: string | null;
  holder_email: string | null;
  transferred_to_user_id: string | null;
  created_at: string;
}

export interface Drink {
  id: string;
  name: string;
  description: string | null;
  category: DrinkCategory;
  category_id: string | null;
  image_url: string | null;
  price: number;
  sale_enabled: boolean;
  sale_price: number | null;
  available: boolean;
  sort_order: number;
  allergens: string[];
  is_popular: boolean;
}

export interface DrinkCategoryRow {
  id: string;
  name: string;
  name_hu: string | null;
  emoji: string;
  color: string;
  sort_order: number;
}

export interface DrinkOrder {
  id: string;
  guest_name: string | null;
  qr_token: string;
  status: DrinkOrderStatus;
  is_vip: boolean;
  total: number;
  notes: string | null;
  created_at: string;
}

export interface DrinkOrderItem {
  id: string;
  drink_order_id: string;
  drink_id: string;
  quantity: number;
  unit_price: number;
  notes: string | null;
  fulfilled_at: string | null;
  drink?: Drink;
}
