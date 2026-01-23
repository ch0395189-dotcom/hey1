export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      chatbot_configs: {
        Row: {
          ai_greeting: string | null
          ai_system_prompt: string | null
          created_at: string
          escalation_keywords: string[] | null
          fallback_message: string | null
          id: string
          is_enabled: boolean
          mode: string
          name: string
          updated_at: string
          welcome_message: string | null
          whatsapp_account_id: string
        }
        Insert: {
          ai_greeting?: string | null
          ai_system_prompt?: string | null
          created_at?: string
          escalation_keywords?: string[] | null
          fallback_message?: string | null
          id?: string
          is_enabled?: boolean
          mode?: string
          name?: string
          updated_at?: string
          welcome_message?: string | null
          whatsapp_account_id: string
        }
        Update: {
          ai_greeting?: string | null
          ai_system_prompt?: string | null
          created_at?: string
          escalation_keywords?: string[] | null
          fallback_message?: string | null
          id?: string
          is_enabled?: boolean
          mode?: string
          name?: string
          updated_at?: string
          welcome_message?: string | null
          whatsapp_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_configs_whatsapp_account_id_fkey"
            columns: ["whatsapp_account_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_conversation_state: {
        Row: {
          context: Json | null
          conversation_id: string
          created_at: string
          current_node_id: string | null
          escalated_at: string | null
          id: string
          is_bot_active: boolean
          updated_at: string
        }
        Insert: {
          context?: Json | null
          conversation_id: string
          created_at?: string
          current_node_id?: string | null
          escalated_at?: string | null
          id?: string
          is_bot_active?: boolean
          updated_at?: string
        }
        Update: {
          context?: Json | null
          conversation_id?: string
          created_at?: string
          current_node_id?: string | null
          escalated_at?: string | null
          id?: string
          is_bot_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_conversation_state_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_conversation_state_current_node_id_fkey"
            columns: ["current_node_id"]
            isOneToOne: false
            referencedRelation: "chatbot_flow_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_flow_nodes: {
        Row: {
          action_type: string | null
          chatbot_config_id: string
          content: string
          created_at: string
          id: string
          node_type: string
          parent_node_id: string | null
          position: number
          title: string
          trigger_type: string
          trigger_value: string | null
          updated_at: string
        }
        Insert: {
          action_type?: string | null
          chatbot_config_id: string
          content: string
          created_at?: string
          id?: string
          node_type?: string
          parent_node_id?: string | null
          position?: number
          title: string
          trigger_type?: string
          trigger_value?: string | null
          updated_at?: string
        }
        Update: {
          action_type?: string | null
          chatbot_config_id?: string
          content?: string
          created_at?: string
          id?: string
          node_type?: string
          parent_node_id?: string | null
          position?: number
          title?: string
          trigger_type?: string
          trigger_value?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_flow_nodes_chatbot_config_id_fkey"
            columns: ["chatbot_config_id"]
            isOneToOne: false
            referencedRelation: "chatbot_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_flow_nodes_parent_node_id_fkey"
            columns: ["parent_node_id"]
            isOneToOne: false
            referencedRelation: "chatbot_flow_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_keywords: {
        Row: {
          chatbot_config_id: string
          created_at: string
          id: string
          is_exact_match: boolean
          keyword: string
          priority: number
          response: string
        }
        Insert: {
          chatbot_config_id: string
          created_at?: string
          id?: string
          is_exact_match?: boolean
          keyword: string
          priority?: number
          response: string
        }
        Update: {
          chatbot_config_id?: string
          created_at?: string
          id?: string
          is_exact_match?: boolean
          keyword?: string
          priority?: number
          response?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_keywords_chatbot_config_id_fkey"
            columns: ["chatbot_config_id"]
            isOneToOne: false
            referencedRelation: "chatbot_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string
          customer_profile_pic: string | null
          id: string
          is_archived: boolean
          last_message_at: string
          unread_count: number
          updated_at: string
          whatsapp_account_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone: string
          customer_profile_pic?: string | null
          id?: string
          is_archived?: boolean
          last_message_at?: string
          unread_count?: number
          updated_at?: string
          whatsapp_account_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string
          customer_profile_pic?: string | null
          id?: string
          is_archived?: boolean
          last_message_at?: string
          unread_count?: number
          updated_at?: string
          whatsapp_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_whatsapp_account_id_fkey"
            columns: ["whatsapp_account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_payments: {
        Row: {
          admin_id: string
          amount: number
          created_at: string
          currency: string
          id: string
          notes: string | null
          payment_method: string | null
          reference: string | null
          user_id: string
        }
        Insert: {
          admin_id: string
          amount: number
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          reference?: string | null
          user_id: string
        }
        Update: {
          admin_id?: string
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          reference?: string | null
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          direction: string
          id: string
          media_url: string | null
          message_type: string
          status: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          direction: string
          id?: string
          media_url?: string | null
          message_type?: string
          status?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          media_url?: string | null
          message_type?: string
          status?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_alerts: {
        Row: {
          admin_id: string
          amount: number
          currency: string
          id: string
          message: string | null
          paid_at: string | null
          sent_at: string
          status: string
          user_id: string
        }
        Insert: {
          admin_id: string
          amount: number
          currency?: string
          id?: string
          message?: string | null
          paid_at?: string | null
          sent_at?: string
          status?: string
          user_id: string
        }
        Update: {
          admin_id?: string
          amount?: number
          currency?: string
          id?: string
          message?: string | null
          paid_at?: string | null
          sent_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan: Database["public"]["Enums"]["subscription_plan"]
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["subscription_plan"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["subscription_plan"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_accounts: {
        Row: {
          access_token: string
          business_account_id: string
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean
          phone_number: string
          phone_number_id: string
          updated_at: string
          user_id: string
          webhook_verify_token: string | null
        }
        Insert: {
          access_token: string
          business_account_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          phone_number: string
          phone_number_id: string
          updated_at?: string
          user_id: string
          webhook_verify_token?: string | null
        }
        Update: {
          access_token?: string
          business_account_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          phone_number?: string
          phone_number_id?: string
          updated_at?: string
          user_id?: string
          webhook_verify_token?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      user_owns_chatbot_config: {
        Args: { config_id: string }
        Returns: boolean
      }
      user_owns_conversation: { Args: { conv_id: string }; Returns: boolean }
      user_owns_whatsapp_account: {
        Args: { account_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      subscription_plan: "starter" | "professional" | "enterprise"
      subscription_status: "active" | "canceled" | "past_due" | "trialing"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      subscription_plan: ["starter", "professional", "enterprise"],
      subscription_status: ["active", "canceled", "past_due", "trialing"],
    },
  },
} as const
