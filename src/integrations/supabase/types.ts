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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_impersonation_log: {
        Row: {
          admin_id: string
          ended_at: string | null
          id: string
          started_at: string
          target_user_id: string
          user_agent: string | null
        }
        Insert: {
          admin_id: string
          ended_at?: string | null
          id?: string
          started_at?: string
          target_user_id: string
          user_agent?: string | null
        }
        Update: {
          admin_id?: string
          ended_at?: string | null
          id?: string
          started_at?: string
          target_user_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      anti_block_alerts: {
        Row: {
          alert_type: string
          category: string | null
          conversation_id: string | null
          created_at: string
          excerpt: string | null
          id: string
          metadata: Json | null
          pattern: string | null
          phone: string | null
          resolved: boolean
          severity: string | null
          user_id: string
          whatsapp_account_id: string | null
        }
        Insert: {
          alert_type: string
          category?: string | null
          conversation_id?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          metadata?: Json | null
          pattern?: string | null
          phone?: string | null
          resolved?: boolean
          severity?: string | null
          user_id: string
          whatsapp_account_id?: string | null
        }
        Update: {
          alert_type?: string
          category?: string | null
          conversation_id?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          metadata?: Json | null
          pattern?: string | null
          phone?: string | null
          resolved?: boolean
          severity?: string | null
          user_id?: string
          whatsapp_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anti_block_alerts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anti_block_alerts_whatsapp_account_id_fkey"
            columns: ["whatsapp_account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      appointment_notification_settings: {
        Row: {
          created_at: string
          notify_on_create: boolean
          notify_phone: string | null
          reminder_enabled: boolean
          reminder_minutes: number
          timezone_offset_minutes: number
          updated_at: string
          user_id: string
          whatsapp_account_id: string | null
        }
        Insert: {
          created_at?: string
          notify_on_create?: boolean
          notify_phone?: string | null
          reminder_enabled?: boolean
          reminder_minutes?: number
          timezone_offset_minutes?: number
          updated_at?: string
          user_id: string
          whatsapp_account_id?: string | null
        }
        Update: {
          created_at?: string
          notify_on_create?: boolean
          notify_phone?: string | null
          reminder_enabled?: boolean
          reminder_minutes?: number
          timezone_offset_minutes?: number
          updated_at?: string
          user_id?: string
          whatsapp_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_notification_settings_whatsapp_account_id_fkey"
            columns: ["whatsapp_account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_date: string | null
          appointment_time: string | null
          birth_date: string | null
          conversation_id: string | null
          created_at: string
          created_notified_at: string | null
          customer_name: string | null
          customer_phone: string | null
          google_event_id: string | null
          google_event_link: string | null
          google_sync_error: string | null
          google_sync_status: string | null
          id: string
          notes: string | null
          reminder_sent_at: string | null
          status: string
          updated_at: string
          user_id: string
          whatsapp_account_id: string | null
        }
        Insert: {
          appointment_date?: string | null
          appointment_time?: string | null
          birth_date?: string | null
          conversation_id?: string | null
          created_at?: string
          created_notified_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          google_event_id?: string | null
          google_event_link?: string | null
          google_sync_error?: string | null
          google_sync_status?: string | null
          id?: string
          notes?: string | null
          reminder_sent_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          whatsapp_account_id?: string | null
        }
        Update: {
          appointment_date?: string | null
          appointment_time?: string | null
          birth_date?: string | null
          conversation_id?: string | null
          created_at?: string
          created_notified_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          google_event_id?: string | null
          google_event_link?: string | null
          google_sync_error?: string | null
          google_sync_status?: string | null
          id?: string
          notes?: string | null
          reminder_sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          whatsapp_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_whatsapp_account_id_fkey"
            columns: ["whatsapp_account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bold_payments: {
        Row: {
          amount: number
          bold_transaction_id: string | null
          created_at: string
          currency: string
          event_type: string | null
          id: string
          metadata: Json | null
          plan: string | null
          user_id: string
        }
        Insert: {
          amount: number
          bold_transaction_id?: string | null
          created_at?: string
          currency?: string
          event_type?: string | null
          id?: string
          metadata?: Json | null
          plan?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          bold_transaction_id?: string | null
          created_at?: string
          currency?: string
          event_type?: string | null
          id?: string
          metadata?: Json | null
          plan?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chatbot_configs: {
        Row: {
          agent_user_id: string | null
          ai_greeting: string | null
          ai_system_prompt: string | null
          auto_end_on_leaf: boolean
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
          agent_user_id?: string | null
          ai_greeting?: string | null
          ai_system_prompt?: string | null
          auto_end_on_leaf?: boolean
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
          agent_user_id?: string | null
          ai_greeting?: string | null
          ai_system_prompt?: string | null
          auto_end_on_leaf?: boolean
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
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_consents: {
        Row: {
          accepted_auto_reply: boolean
          accepted_read_messages: boolean
          accepted_terms: boolean
          confirmed_at: string | null
          created_at: string
          id: string
          ip_address: string | null
          otp_attempts: number
          otp_code: string | null
          otp_sent_at: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
          whatsapp_account_id: string
        }
        Insert: {
          accepted_auto_reply?: boolean
          accepted_read_messages?: boolean
          accepted_terms?: boolean
          confirmed_at?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          otp_attempts?: number
          otp_code?: string | null
          otp_sent_at?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
          whatsapp_account_id: string
        }
        Update: {
          accepted_auto_reply?: boolean
          accepted_read_messages?: boolean
          accepted_terms?: boolean
          confirmed_at?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          otp_attempts?: number
          otp_code?: string | null
          otp_sent_at?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
          whatsapp_account_id?: string
        }
        Relationships: []
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
          appointment_settings: Json | null
          button_options: Json | null
          chatbot_config_id: string
          content: string
          created_at: string
          id: string
          interactive_type: string
          media_type: string | null
          media_url: string | null
          next_node_id: string | null
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
          appointment_settings?: Json | null
          button_options?: Json | null
          chatbot_config_id: string
          content: string
          created_at?: string
          id?: string
          interactive_type?: string
          media_type?: string | null
          media_url?: string | null
          next_node_id?: string | null
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
          appointment_settings?: Json | null
          button_options?: Json | null
          chatbot_config_id?: string
          content?: string
          created_at?: string
          id?: string
          interactive_type?: string
          media_type?: string | null
          media_url?: string | null
          next_node_id?: string | null
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
            foreignKeyName: "chatbot_flow_nodes_next_node_id_fkey"
            columns: ["next_node_id"]
            isOneToOne: false
            referencedRelation: "chatbot_flow_nodes"
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
      chatbot_knowledge_base: {
        Row: {
          category: string | null
          chatbot_config_id: string
          content: string
          created_at: string
          id: string
          is_active: boolean
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          chatbot_config_id: string
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          chatbot_config_id?: string
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_knowledge_base_chatbot_config_id_fkey"
            columns: ["chatbot_config_id"]
            isOneToOne: false
            referencedRelation: "chatbot_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      conversation_tags: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          tag_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          tag_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_tags_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "contact_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          blocked_at: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string
          customer_profile_pic: string | null
          id: string
          is_archived: boolean
          last_message_at: string
          platform: string
          platform_account_id: string | null
          unread_count: number
          updated_at: string
          whatsapp_account_id: string
        }
        Insert: {
          assigned_to?: string | null
          blocked_at?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone: string
          customer_profile_pic?: string | null
          id?: string
          is_archived?: boolean
          last_message_at?: string
          platform?: string
          platform_account_id?: string | null
          unread_count?: number
          updated_at?: string
          whatsapp_account_id: string
        }
        Update: {
          assigned_to?: string | null
          blocked_at?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string
          customer_profile_pic?: string | null
          id?: string
          is_archived?: boolean
          last_message_at?: string
          platform?: string
          platform_account_id?: string | null
          unread_count?: number
          updated_at?: string
          whatsapp_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_platform_account_id_fkey"
            columns: ["platform_account_id"]
            isOneToOne: false
            referencedRelation: "platform_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_whatsapp_account_id_fkey"
            columns: ["whatsapp_account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_packages: {
        Row: {
          created_at: string
          credits: number
          extra_messages: number
          id: string
          is_active: boolean
          is_popular: boolean
          name: string
          package_type: string
          price_cop: number
          price_usd: number | null
        }
        Insert: {
          created_at?: string
          credits: number
          extra_messages?: number
          id?: string
          is_active?: boolean
          is_popular?: boolean
          name: string
          package_type?: string
          price_cop: number
          price_usd?: number | null
        }
        Update: {
          created_at?: string
          credits?: number
          extra_messages?: number
          id?: string
          is_active?: boolean
          is_popular?: boolean
          name?: string
          package_type?: string
          price_cop?: number
          price_usd?: number | null
        }
        Relationships: []
      }
      credit_purchases: {
        Row: {
          amount: number
          created_at: string
          credits: number
          currency: string
          id: string
          package_id: string | null
          payment_method: string | null
          payment_reference: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          credits: number
          currency?: string
          id?: string
          package_id?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          credits?: number
          currency?: string
          id?: string
          package_id?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_purchases_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "credit_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_usage: {
        Row: {
          created_at: string
          credits_used: number
          description: string | null
          id: string
          metadata: Json | null
          service_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_used: number
          description?: string | null
          id?: string
          metadata?: Json | null
          service_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_used?: number
          description?: string | null
          id?: string
          metadata?: Json | null
          service_type?: string
          user_id?: string
        }
        Relationships: []
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
      migrated_users: {
        Row: {
          email: string
          id: string
          linked_at: string | null
          migrated_at: string | null
          new_user_id: string | null
          old_user_id: string
        }
        Insert: {
          email: string
          id?: string
          linked_at?: string | null
          migrated_at?: string | null
          new_user_id?: string | null
          old_user_id: string
        }
        Update: {
          email?: string
          id?: string
          linked_at?: string | null
          migrated_at?: string | null
          new_user_id?: string | null
          old_user_id?: string
        }
        Relationships: []
      }
      monthly_message_usage: {
        Row: {
          created_at: string
          extra_messages_purchased: number
          id: string
          messages_sent: number
          period_month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          extra_messages_purchased?: number
          id?: string
          messages_sent?: number
          period_month: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          extra_messages_purchased?: number
          id?: string
          messages_sent?: number
          period_month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      native_push_tokens: {
        Row: {
          created_at: string
          device_name: string | null
          id: string
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      number_pricing_config: {
        Row: {
          fixed_fee_cop: number
          flat_price_activation_cop: number | null
          flat_price_rent_cop: number | null
          id: string
          markup_percent: number
          min_price_cop: number
          singleton: boolean
          updated_at: string
          usd_to_cop: number
        }
        Insert: {
          fixed_fee_cop?: number
          flat_price_activation_cop?: number | null
          flat_price_rent_cop?: number | null
          id?: string
          markup_percent?: number
          min_price_cop?: number
          singleton?: boolean
          updated_at?: string
          usd_to_cop?: number
        }
        Update: {
          fixed_fee_cop?: number
          flat_price_activation_cop?: number | null
          flat_price_rent_cop?: number | null
          id?: string
          markup_percent?: number
          min_price_cop?: number
          singleton?: boolean
          updated_at?: string
          usd_to_cop?: number
        }
        Relationships: []
      }
      outbound_content_rules: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          is_regex: boolean
          pattern: string
          severity: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_regex?: boolean
          pattern: string
          severity?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_regex?: boolean
          pattern?: string
          severity?: string
        }
        Relationships: []
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
      platform_accounts: {
        Row: {
          account_name: string | null
          created_at: string
          id: string
          instagram_account_id: string | null
          is_active: boolean
          notify_enabled: boolean
          notify_phone: string | null
          notify_whatsapp_account_id: string | null
          page_access_token: string | null
          page_id: string | null
          platform: string
          tiktok_access_token: string | null
          tiktok_open_id: string | null
          updated_at: string
          user_id: string
          webhook_verify_token: string | null
        }
        Insert: {
          account_name?: string | null
          created_at?: string
          id?: string
          instagram_account_id?: string | null
          is_active?: boolean
          notify_enabled?: boolean
          notify_phone?: string | null
          notify_whatsapp_account_id?: string | null
          page_access_token?: string | null
          page_id?: string | null
          platform: string
          tiktok_access_token?: string | null
          tiktok_open_id?: string | null
          updated_at?: string
          user_id: string
          webhook_verify_token?: string | null
        }
        Update: {
          account_name?: string | null
          created_at?: string
          id?: string
          instagram_account_id?: string | null
          is_active?: boolean
          notify_enabled?: boolean
          notify_phone?: string | null
          notify_whatsapp_account_id?: string | null
          page_access_token?: string | null
          page_id?: string | null
          platform?: string
          tiktok_access_token?: string | null
          tiktok_open_id?: string | null
          updated_at?: string
          user_id?: string
          webhook_verify_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_accounts_notify_whatsapp_account_id_fkey"
            columns: ["notify_whatsapp_account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
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
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      push_verifications: {
        Row: {
          ack_at: string | null
          endpoint: string
          sent_at: string
          token: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          ack_at?: string | null
          endpoint: string
          sent_at?: string
          token?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          ack_at?: string | null
          endpoint?: string
          sent_at?: string
          token?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      renewal_reminders: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          id: string
          payment_url: string | null
          phone: string
          plan: string | null
          reference: string | null
          status: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          payment_url?: string | null
          phone: string
          plan?: string | null
          reference?: string | null
          status?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          payment_url?: string | null
          phone?: string
          plan?: string | null
          reference?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      round_robin_settings: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          include_owner: boolean
          last_agent_user_id: string | null
          last_assigned_at: string | null
          owner_id: string
          updated_at: string
          whatsapp_account_id: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          include_owner?: boolean
          last_agent_user_id?: string | null
          last_assigned_at?: string | null
          owner_id: string
          updated_at?: string
          whatsapp_account_id?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          include_owner?: boolean
          last_agent_user_id?: string | null
          last_assigned_at?: string | null
          owner_id?: string
          updated_at?: string
          whatsapp_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "round_robin_settings_whatsapp_account_id_fkey"
            columns: ["whatsapp_account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_messages: {
        Row: {
          account_id: string
          bot_node_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          media_type: string | null
          media_url: string | null
          message: string | null
          recipient_names: string[] | null
          recipient_phones: string[]
          results: Json | null
          scheduled_at: string
          status: string
          user_id: string
        }
        Insert: {
          account_id: string
          bot_node_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          message?: string | null
          recipient_names?: string[] | null
          recipient_phones?: string[]
          results?: Json | null
          scheduled_at: string
          status?: string
          user_id: string
        }
        Update: {
          account_id?: string
          bot_node_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          message?: string | null
          recipient_names?: string[] | null
          recipient_phones?: string[]
          results?: Json | null
          scheduled_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_bot_node_id_fkey"
            columns: ["bot_node_id"]
            isOneToOne: false
            referencedRelation: "chatbot_flow_nodes"
            referencedColumns: ["id"]
          },
        ]
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
      team_agents: {
        Row: {
          agent_email: string
          agent_name: string | null
          agent_user_id: string
          color: string
          created_at: string
          id: string
          is_active: boolean
          owner_id: string
          permissions: Json
          round_robin_enabled: boolean
          team_id: string | null
          team_role: string
          updated_at: string
          whatsapp_account_id: string | null
        }
        Insert: {
          agent_email: string
          agent_name?: string | null
          agent_user_id: string
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          owner_id: string
          permissions?: Json
          round_robin_enabled?: boolean
          team_id?: string | null
          team_role?: string
          updated_at?: string
          whatsapp_account_id?: string | null
        }
        Update: {
          agent_email?: string
          agent_name?: string | null
          agent_user_id?: string
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          owner_id?: string
          permissions?: Json
          round_robin_enabled?: boolean
          team_id?: string | null
          team_role?: string
          updated_at?: string
          whatsapp_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_agents_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_agents_whatsapp_account_id_fkey"
            columns: ["whatsapp_account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
          whatsapp_account_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
          whatsapp_account_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
          whatsapp_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_whatsapp_account_id_fkey"
            columns: ["whatsapp_account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_lead_routes: {
        Row: {
          created_at: string
          form_id: string
          id: string
          template_language: string
          template_name: string
          updated_at: string
          user_id: string
          whatsapp_account_id: string
        }
        Insert: {
          created_at?: string
          form_id: string
          id?: string
          template_language?: string
          template_name?: string
          updated_at?: string
          user_id: string
          whatsapp_account_id: string
        }
        Update: {
          created_at?: string
          form_id?: string
          id?: string
          template_language?: string
          template_name?: string
          updated_at?: string
          user_id?: string
          whatsapp_account_id?: string
        }
        Relationships: []
      }
      tiktok_leads: {
        Row: {
          conversation_id: string | null
          created_at: string
          email: string | null
          form_id: string | null
          full_name: string | null
          id: string
          lead_id: string | null
          phone: string
          raw_payload: Json | null
          template_sent_at: string | null
          template_status: string | null
          updated_at: string
          user_id: string
          whatsapp_account_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          email?: string | null
          form_id?: string | null
          full_name?: string | null
          id?: string
          lead_id?: string | null
          phone: string
          raw_payload?: Json | null
          template_sent_at?: string | null
          template_status?: string | null
          updated_at?: string
          user_id: string
          whatsapp_account_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          email?: string | null
          form_id?: string | null
          full_name?: string | null
          id?: string
          lead_id?: string | null
          phone?: string
          raw_payload?: Json | null
          template_sent_at?: string | null
          template_status?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_account_id?: string
        }
        Relationships: []
      }
      trial_nudges: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          has_whatsapp: boolean
          id: string
          nudge_day: number
          status: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          error?: string | null
          has_whatsapp?: boolean
          id?: string
          nudge_day: number
          status?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          has_whatsapp?: boolean
          id?: string
          nudge_day?: number
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      trial_phone_history: {
        Row: {
          created_at: string
          first_used_at: string
          first_user_id: string
          id: string
          last_attempt_at: string | null
          last_attempt_user_id: string | null
          phone_normalized: string
          phone_number: string
          reuse_count: number
        }
        Insert: {
          created_at?: string
          first_used_at?: string
          first_user_id: string
          id?: string
          last_attempt_at?: string | null
          last_attempt_user_id?: string | null
          phone_normalized: string
          phone_number: string
          reuse_count?: number
        }
        Update: {
          created_at?: string
          first_used_at?: string
          first_user_id?: string
          id?: string
          last_attempt_at?: string | null
          last_attempt_user_id?: string | null
          phone_normalized?: string
          phone_number?: string
          reuse_count?: number
        }
        Relationships: []
      }
      user_api_keys: {
        Row: {
          api_key: string
          created_at: string
          id: string
          is_active: boolean | null
          provider: string
          updated_at: string
          user_id: string
          voice_model_id: string | null
          voice_name: string | null
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          provider: string
          updated_at?: string
          user_id: string
          voice_model_id?: string | null
          voice_name?: string | null
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          provider?: string
          updated_at?: string
          user_id?: string
          voice_model_id?: string | null
          voice_name?: string | null
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          balance: number
          created_at: string
          id: string
          total_consumed: number
          total_purchased: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          total_consumed?: number
          total_purchased?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          total_consumed?: number
          total_purchased?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_limit_overrides: {
        Row: {
          created_at: string
          max_agents: number | null
          max_messages: number | null
          max_whatsapp_accounts: number | null
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          max_agents?: number | null
          max_messages?: number | null
          max_whatsapp_accounts?: number | null
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          max_agents?: number | null
          max_messages?: number | null
          max_whatsapp_accounts?: number | null
          note?: string | null
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
      user_voice_clones: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          provider: string
          updated_at: string
          user_id: string
          voice_model_id: string
          voice_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          provider?: string
          updated_at?: string
          user_id: string
          voice_model_id: string
          voice_name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          provider?: string
          updated_at?: string
          user_id?: string
          voice_model_id?: string
          voice_name?: string
        }
        Relationships: []
      }
      virtual_number_orders: {
        Row: {
          cost: number | null
          country: string
          country_code: string | null
          created_at: string
          days: number | null
          error: string | null
          expires_at: string | null
          id: string
          mode: string
          operator: string | null
          paid_at: string | null
          payment_reference: string | null
          payment_status: string
          phone_number: string | null
          price_cop: number | null
          provider: string
          provider_cost_usd: number | null
          provider_order_id: string | null
          raw: Json | null
          service: string
          sms_code: string | null
          sms_text: string | null
          status: string
          updated_at: string
          user_id: string
          whatsapp_account_id: string | null
        }
        Insert: {
          cost?: number | null
          country: string
          country_code?: string | null
          created_at?: string
          days?: number | null
          error?: string | null
          expires_at?: string | null
          id?: string
          mode?: string
          operator?: string | null
          paid_at?: string | null
          payment_reference?: string | null
          payment_status?: string
          phone_number?: string | null
          price_cop?: number | null
          provider?: string
          provider_cost_usd?: number | null
          provider_order_id?: string | null
          raw?: Json | null
          service?: string
          sms_code?: string | null
          sms_text?: string | null
          status?: string
          updated_at?: string
          user_id: string
          whatsapp_account_id?: string | null
        }
        Update: {
          cost?: number | null
          country?: string
          country_code?: string | null
          created_at?: string
          days?: number | null
          error?: string | null
          expires_at?: string | null
          id?: string
          mode?: string
          operator?: string | null
          paid_at?: string | null
          payment_reference?: string | null
          payment_status?: string
          phone_number?: string | null
          price_cop?: number | null
          provider?: string
          provider_cost_usd?: number | null
          provider_order_id?: string | null
          raw?: Json | null
          service?: string
          sms_code?: string | null
          sms_text?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          whatsapp_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "virtual_number_orders_whatsapp_account_id_fkey"
            columns: ["whatsapp_account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_accounts: {
        Row: {
          access_token: string
          ai_agent_enabled: boolean
          ai_agent_prompt: string | null
          ai_sanitize_enabled: boolean
          business_account_id: string
          connection_type: string | null
          created_at: string
          display_name: string | null
          external_api_key: string | null
          external_instance_id: string | null
          external_service_url: string | null
          id: string
          is_active: boolean
          phone_number: string
          phone_number_id: string
          quality_last_checked_at: string | null
          quality_pause_reason: string | null
          quality_paused: boolean
          quality_rating: string | null
          sensitive_niche_mode: boolean
          updated_at: string
          user_id: string
          warmup_started_at: string | null
          webhook_verify_token: string | null
        }
        Insert: {
          access_token: string
          ai_agent_enabled?: boolean
          ai_agent_prompt?: string | null
          ai_sanitize_enabled?: boolean
          business_account_id: string
          connection_type?: string | null
          created_at?: string
          display_name?: string | null
          external_api_key?: string | null
          external_instance_id?: string | null
          external_service_url?: string | null
          id?: string
          is_active?: boolean
          phone_number: string
          phone_number_id: string
          quality_last_checked_at?: string | null
          quality_pause_reason?: string | null
          quality_paused?: boolean
          quality_rating?: string | null
          sensitive_niche_mode?: boolean
          updated_at?: string
          user_id: string
          warmup_started_at?: string | null
          webhook_verify_token?: string | null
        }
        Update: {
          access_token?: string
          ai_agent_enabled?: boolean
          ai_agent_prompt?: string | null
          ai_sanitize_enabled?: boolean
          business_account_id?: string
          connection_type?: string | null
          created_at?: string
          display_name?: string | null
          external_api_key?: string | null
          external_instance_id?: string | null
          external_service_url?: string | null
          id?: string
          is_active?: boolean
          phone_number?: string
          phone_number_id?: string
          quality_last_checked_at?: string | null
          quality_pause_reason?: string | null
          quality_paused?: boolean
          quality_rating?: string | null
          sensitive_niche_mode?: boolean
          updated_at?: string
          user_id?: string
          warmup_started_at?: string | null
          webhook_verify_token?: string | null
        }
        Relationships: []
      }
      whatsapp_button_clicks: {
        Row: {
          created_at: string
          device: string | null
          id: string
          page_path: string | null
          phone_number: string | null
          referrer: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device?: string | null
          id?: string
          page_path?: string | null
          phone_number?: string | null
          referrer?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device?: string | null
          id?: string
          page_path?: string | null
          phone_number?: string | null
          referrer?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      whatsapp_quality_alerts: {
        Row: {
          created_at: string
          id: string
          new_rating: string
          old_rating: string | null
          paused: boolean
          phone_number: string | null
          reason: string | null
          resolved: boolean
          user_id: string
          whatsapp_account_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          new_rating: string
          old_rating?: string | null
          paused?: boolean
          phone_number?: string | null
          reason?: string | null
          resolved?: boolean
          user_id: string
          whatsapp_account_id: string
        }
        Update: {
          created_at?: string
          id?: string
          new_rating?: string
          old_rating?: string | null
          paused?: boolean
          phone_number?: string | null
          reason?: string | null
          resolved?: boolean
          user_id?: string
          whatsapp_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_quality_alerts_whatsapp_account_id_fkey"
            columns: ["whatsapp_account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_reassignment_log: {
        Row: {
          created_at: string
          id: string
          new_user_id: string
          performed_by: string
          phone_number: string | null
          previous_user_id: string | null
          reason: string | null
          whatsapp_account_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          new_user_id: string
          performed_by: string
          phone_number?: string | null
          previous_user_id?: string | null
          reason?: string | null
          whatsapp_account_id: string
        }
        Update: {
          created_at?: string
          id?: string
          new_user_id?: string
          performed_by?: string
          phone_number?: string | null
          previous_user_id?: string | null
          reason?: string | null
          whatsapp_account_id?: string
        }
        Relationships: []
      }
      whatsapp_token_audit: {
        Row: {
          business_account_id: string | null
          checked_at: string
          created_at: string
          error_code: number | null
          error_message: string | null
          error_subcode: number | null
          id: string
          notified_at: string | null
          phone_number: string | null
          phone_number_id: string | null
          token_alive: boolean
          updated_at: string
          user_id: string
          webhook_subscribed: boolean | null
          whatsapp_account_id: string
        }
        Insert: {
          business_account_id?: string | null
          checked_at?: string
          created_at?: string
          error_code?: number | null
          error_message?: string | null
          error_subcode?: number | null
          id?: string
          notified_at?: string | null
          phone_number?: string | null
          phone_number_id?: string | null
          token_alive?: boolean
          updated_at?: string
          user_id: string
          webhook_subscribed?: boolean | null
          whatsapp_account_id: string
        }
        Update: {
          business_account_id?: string | null
          checked_at?: string
          created_at?: string
          error_code?: number | null
          error_message?: string | null
          error_subcode?: number | null
          id?: string
          notified_at?: string | null
          phone_number?: string | null
          phone_number_id?: string | null
          token_alive?: boolean
          updated_at?: string
          user_id?: string
          webhook_subscribed?: boolean | null
          whatsapp_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_token_audit_whatsapp_account_id_fkey"
            columns: ["whatsapp_account_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_credits: {
        Args: { p_credits: number; p_user_id: string }
        Returns: undefined
      }
      add_extra_messages: {
        Args: { _amount: number; _user_id: string }
        Returns: undefined
      }
      approve_credit_purchase: {
        Args: { p_purchase_id: string }
        Returns: Json
      }
      assign_conversation: {
        Args: { p_agent_user_id: string; p_conversation_id: string }
        Returns: undefined
      }
      can_edit_owner_chatbot: { Args: { account_id: string }; Returns: boolean }
      can_manage_chatbot_account: {
        Args: { account_id: string }
        Returns: boolean
      }
      can_manage_chatbot_config: {
        Args: { config_id: string }
        Returns: boolean
      }
      check_message_limit: { Args: { _user_id: string }; Returns: Json }
      clone_chatbot_to_account: {
        Args: {
          p_source_config_id: string
          p_target_whatsapp_account_id: string
        }
        Returns: string
      }
      deduct_credits: {
        Args: {
          p_credits: number
          p_description?: string
          p_metadata?: Json
          p_service_type: string
          p_user_id: string
        }
        Returns: boolean
      }
      effective_chatbot_config: {
        Args: { p_account: string; p_assigned_to: string }
        Returns: {
          agent_user_id: string
          ai_greeting: string
          ai_system_prompt: string
          auto_end_on_leaf: boolean
          escalation_keywords: string[]
          fallback_message: string
          id: string
          is_enabled: boolean
          mode: string
          name: string
          welcome_message: string
          whatsapp_account_id: string
        }[]
      }
      get_agent_limit: { Args: { _user_id: string }; Returns: number }
      get_conversation_previews: {
        Args: { _conv_ids: string[] }
        Returns: {
          content: string
          conversation_id: string
          created_at: string
          direction: string
          media_url: string
          message_type: string
        }[]
      }
      get_message_limit: { Args: { _user_id: string }; Returns: number }
      get_my_message_usage: {
        Args: never
        Returns: {
          base_limit: number
          extra_messages: number
          messages_sent: number
          percentage: number
          period_month: string
          total_limit: number
        }[]
      }
      get_my_owner_id: { Args: never; Returns: string }
      get_team_role: { Args: { _user_id: string }; Returns: string }
      get_whatsapp_account_limit: {
        Args: { _user_id: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_outbound_message: { Args: { _user_id: string }; Returns: Json }
      is_agent_of: { Args: { _owner_id: string }; Returns: boolean }
      is_conversation_blocked: { Args: { conv_id: string }; Returns: boolean }
      normalize_phone: { Args: { p: string }; Returns: string }
      round_robin_assign: {
        Args: { _conversation_id: string }
        Returns: string
      }
      team_member_can_write: { Args: { _user_id: string }; Returns: boolean }
      user_owns_chatbot_config: {
        Args: { config_id: string }
        Returns: boolean
      }
      user_owns_conversation: { Args: { conv_id: string }; Returns: boolean }
      user_owns_conversation_tag: { Args: { tag_id: string }; Returns: boolean }
      user_owns_platform_account: {
        Args: { account_id: string }
        Returns: boolean
      }
      user_owns_whatsapp_account: {
        Args: { account_id: string }
        Returns: boolean
      }
      verify_cron_secret: { Args: { _secret: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      subscription_plan:
        | "starter"
        | "professional"
        | "enterprise"
        | "esoterico_pro"
        | "esoterico_rental"
        | "emprendedor"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      subscription_plan: [
        "starter",
        "professional",
        "enterprise",
        "esoterico_pro",
        "esoterico_rental",
        "emprendedor",
      ],
      subscription_status: ["active", "canceled", "past_due", "trialing"],
    },
  },
} as const
