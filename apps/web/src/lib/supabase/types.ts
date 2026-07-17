export type UserRole = 'ADMIN' | 'EDITOR' | 'STAFF' | 'SELLER' | 'BARTENDER' | 'VIP_GUEST' | 'GUEST'
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'ARCHIVED'
export type TicketTier = 'EARLY_BIRD' | 'GENERAL' | 'LATE' | 'DOOR' | 'VIP' | 'FREE'
export type OrderStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'REFUNDED' | 'PARTIALLY_REFUNDED'
export type DrinkOrderStatus = 'PENDING' | 'IN_PROGRESS' | 'FULFILLED' | 'CANCELLED'
export type PaymentMethod = 'ONLINE' | 'CASH' | 'CARD_TERMINAL' | 'TAP_TO_PAY'
export type DrinkCategory = 'COCKTAIL' | 'BEER' | 'WINE' | 'SPIRIT' | 'SOFT_DRINK' | 'SHOT' | 'OTHER'

export interface Database {
  public: {
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      user_role: UserRole
      event_status: EventStatus
      ticket_tier: TicketTier
      order_status: OrderStatus
      drink_order_status: DrinkOrderStatus
      payment_method: PaymentMethod
      drink_category: DrinkCategory
    }
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          name: string
          phone: string | null
          role: UserRole
          avatar_url: string | null
          stripe_customer_id: string | null
          loyalty_discount: boolean
          vip_notes: string | null
          billing_name: string | null
          billing_address: string | null
          billing_city: string | null
          billing_postal_code: string | null
          billing_country: string | null
          onboarded_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      events: {
        Row: {
          id: string
          slug: string
          name: string
          description: string | null
          cover_image_url: string | null
          banner_image_url: string | null
          home_cover_image_url: string | null
          start_date: string
          end_date: string | null
          venue: string | null
          address: string | null
          capacity: number
          status: EventStatus
          tax_rate: number
          created_by_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['events']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['events']['Insert']>
      }
      ticket_types: {
        Row: {
          id: string
          event_id: string
          name: string
          description: string | null
          image_url: string | null
          price: number
          quantity: number
          sold: number
          tier: TicketTier
          max_per_order: number
          sale_starts_at: string | null
          sale_ends_at: string | null
          is_bundle: boolean
          bundle_size: number | null
          entries_per_ticket: number
          is_door_ticket: boolean
          is_vip_ticket: boolean
          sale_enabled: boolean
          sale_price: number | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['ticket_types']['Row'], 'id' | 'sold' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['ticket_types']['Insert']>
      }
      promo_codes: {
        Row: {
          id: string
          event_id: string | null
          code: string
          discount_type: 'percent' | 'fixed'
          discount_value: number
          usage_limit: number | null
          used_count: number
          expires_at: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['promo_codes']['Row'], 'id' | 'used_count' | 'created_at'>
        Update: Partial<Database['public']['Tables']['promo_codes']['Insert']>
      }
      orders: {
        Row: {
          id: string
          user_id: string | null
          guest_email: string | null
          guest_name: string | null
          event_id: string
          stripe_payment_intent_id: string | null
          stripe_checkout_session_id: string | null
          subtotal: number
          discount_amount: number
          tax_amount: number
          total: number
          currency: string
          status: OrderStatus
          payment_method: PaymentMethod
          promo_code_id: string | null
          seller_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['orders']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['orders']['Insert']>
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          ticket_type_id: string
          quantity: number
          unit_price: number
          total: number
        }
        Insert: Omit<Database['public']['Tables']['order_items']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['order_items']['Insert']>
      }
      tickets: {
        Row: {
          id: string
          order_id: string
          order_item_id: string
          event_id: string | null
          ticket_type_id: string | null
          ticket_name: string | null
          tier: TicketTier
          status: 'VALID' | 'USED' | 'CANCELLED' | 'REFUNDED'
          qr_code: string
          used_at: string | null
          wallet_pass_id: string | null
          wallet_pass_url: string | null
          holder_name: string | null
          holder_email: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['tickets']['Row'], 'id' | 'qr_code' | 'created_at'>
        Update: Partial<Database['public']['Tables']['tickets']['Insert']>
      }
      check_ins: {
        Row: {
          id: string
          ticket_id: string
          event_id: string
          checked_in_by: string
          checked_at: string
        }
        Insert: Omit<Database['public']['Tables']['check_ins']['Row'], 'id' | 'checked_at'>
        Update: Partial<Database['public']['Tables']['check_ins']['Insert']>
      }
      drinks: {
        Row: {
          id: string
          name: string
          description: string | null
          category: DrinkCategory
          image_url: string | null
          price: number
          sale_enabled: boolean
          sale_price: number | null
          available: boolean
          sort_order: number
          allergens: string[]
          is_popular: boolean
          order_count: number
          category_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['drinks']['Row'], 'id' | 'order_count' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['drinks']['Insert']>
      }
      drink_orders: {
        Row: {
          id: string
          user_id: string | null
          guest_name: string | null
          qr_token: string
          qr_expires_at: string
          status: DrinkOrderStatus
          is_vip: boolean
          paid_online: boolean
          stripe_payment_intent_id: string | null
          total: number
          event_id: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['drink_orders']['Row'], 'id' | 'qr_token' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['drink_orders']['Insert']>
      }
      drink_order_items: {
        Row: {
          id: string
          drink_order_id: string
          drink_id: string
          quantity: number
          unit_price: number
          notes: string | null
          fulfilled_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['drink_order_items']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['drink_order_items']['Insert']>
      }
      drink_categories: {
        Row: {
          id: string
          name: string
          name_hu: string | null
          emoji: string
          color: string
          sort_order: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['drink_categories']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['drink_categories']['Insert']>
      }
      waitlist_entries: {
        Row: {
          id: string
          event_id: string
          email: string
          name: string | null
          notified: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['waitlist_entries']['Row'], 'id' | 'notified' | 'created_at'>
        Update: Partial<Database['public']['Tables']['waitlist_entries']['Insert']>
      }
      invoices: {
        Row: {
          id: string
          order_id: string
          number: string
          pdf_url: string | null
          issued_at: string
        }
        Insert: Omit<Database['public']['Tables']['invoices']['Row'], 'id' | 'issued_at'>
        Update: Partial<Database['public']['Tables']['invoices']['Insert']>
      }
      seller_sessions: {
        Row: {
          id: string
          seller_id: string
          event_id: string | null
          started_at: string
          ended_at: string | null
          total_sold: number
          total_revenue: number
        }
        Insert: Omit<Database['public']['Tables']['seller_sessions']['Row'], 'id' | 'started_at' | 'total_sold' | 'total_revenue'>
        Update: Partial<Database['public']['Tables']['seller_sessions']['Insert']>
      }
    }
  }
}

// Convenience row types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Event = Database['public']['Tables']['events']['Row']
export type TicketType = Database['public']['Tables']['ticket_types']['Row']
export type Order = Database['public']['Tables']['orders']['Row']
export type OrderItem = Database['public']['Tables']['order_items']['Row']
export type Ticket = Database['public']['Tables']['tickets']['Row']
export type CheckIn = Database['public']['Tables']['check_ins']['Row']
export type Drink = Database['public']['Tables']['drinks']['Row']
export type DrinkOrder = Database['public']['Tables']['drink_orders']['Row']
export type DrinkOrderItem = Database['public']['Tables']['drink_order_items']['Row']
export type PromoCode = Database['public']['Tables']['promo_codes']['Row']
export type DrinkCategoryRow = Database['public']['Tables']['drink_categories']['Row']
