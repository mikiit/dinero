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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          space_id: string | null
          archived_at: string | null
          color: string | null
          created_at: string
          credit_limit: number | null
          currency: string
          due_day: number | null
          icon: string | null
          id: string
          include_in_net_worth: boolean
          name: string
          opening_balance: number
          sort_order: number
          statement_day: number | null
          type: string
          user_id: string
        }
        Insert: {
          space_id?: string | null
          archived_at?: string | null
          color?: string | null
          created_at?: string
          credit_limit?: number | null
          currency?: string
          due_day?: number | null
          icon?: string | null
          id?: string
          include_in_net_worth?: boolean
          name: string
          opening_balance?: number
          sort_order?: number
          statement_day?: number | null
          type: string
          user_id: string
        }
        Update: {
          space_id?: string | null
          archived_at?: string | null
          color?: string | null
          created_at?: string
          credit_limit?: number | null
          currency?: string
          due_day?: number | null
          icon?: string | null
          id?: string
          include_in_net_worth?: boolean
          name?: string
          opening_balance?: number
          sort_order?: number
          statement_day?: number | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          currency: string
          space_id: string | null
          amount: number
          category_id: string
          created_at: string
          id: string
          period_month: string
          user_id: string
        }
        Insert: {
          currency?: string
          space_id?: string | null
          amount: number
          category_id: string
          created_at?: string
          id?: string
          period_month: string
          user_id: string
        }
        Update: {
          currency?: string
          space_id?: string | null
          amount?: number
          category_id?: string
          created_at?: string
          id?: string
          period_month?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          space_id: string | null
          archived_at: string | null
          color: string | null
          created_at: string
          icon: string | null
          id: string
          kind: string
          name: string
          parent_id: string | null
          sort_order: number
          user_id: string
        }
        Insert: {
          space_id?: string | null
          archived_at?: string | null
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          kind: string
          name: string
          parent_id?: string | null
          sort_order?: number
          user_id: string
        }
        Update: {
          space_id?: string | null
          archived_at?: string | null
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          kind?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          base_currency: string
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          base_currency?: string
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      recurring_rules: {
        Row: {
          space_id: string | null
          auto_post: boolean
          created_at: string
          day_of_month: number | null
          deleted_at: string | null
          end_on: string | null
          frequency: string
          id: string
          interval: number
          next_run_on: string
          paused_at: string | null
          template: Json
          user_id: string
        }
        Insert: {
          space_id?: string | null
          auto_post?: boolean
          created_at?: string
          day_of_month?: number | null
          deleted_at?: string | null
          end_on?: string | null
          frequency: string
          id?: string
          interval?: number
          next_run_on: string
          paused_at?: string | null
          template: Json
          user_id: string
        }
        Update: {
          space_id?: string | null
          auto_post?: boolean
          created_at?: string
          day_of_month?: number | null
          deleted_at?: string | null
          end_on?: string | null
          frequency?: string
          id?: string
          interval?: number
          next_run_on?: string
          paused_at?: string | null
          template?: Json
          user_id?: string
        }
        Relationships: []
      }
      space_invites: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          max_uses: number
          revoked_at: string | null
          role: string
          space_id: string
          token_hash: string
          used_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          expires_at: string
          id?: string
          max_uses?: number
          revoked_at?: string | null
          role: string
          space_id: string
          token_hash: string
          used_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          max_uses?: number
          revoked_at?: string | null
          role?: string
          space_id?: string
          token_hash?: string
          used_count?: number
        }
        Relationships: []
      }
      space_members: {
        Row: {
          created_at: string
          role: string
          space_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          space_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          space_id?: string
          user_id?: string
        }
        Relationships: []
      }
      spaces: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          space_id: string | null
          account_id: string
          amount: number
          category_id: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          fx_rate: number | null
          id: string
          merchant: string | null
          note: string | null
          occurred_on: string
          receipt_url: string | null
          recurring_id: string | null
          tags: string[] | null
          to_account_id: string | null
          to_amount: number | null
          type: string
          user_id: string
        }
        Insert: {
          space_id?: string | null
          account_id: string
          amount: number
          category_id?: string | null
          created_at?: string
          currency: string
          deleted_at?: string | null
          fx_rate?: number | null
          id?: string
          merchant?: string | null
          note?: string | null
          occurred_on: string
          receipt_url?: string | null
          recurring_id?: string | null
          tags?: string[] | null
          to_account_id?: string | null
          to_amount?: number | null
          type: string
          user_id: string
        }
        Update: {
          space_id?: string | null
          account_id?: string
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          fx_rate?: number | null
          id?: string
          merchant?: string | null
          note?: string | null
          occurred_on?: string
          receipt_url?: string | null
          recurring_id?: string | null
          tags?: string[] | null
          to_account_id?: string | null
          to_amount?: number | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transactions_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      account_balances: {
        Row: {
          account_id: string | null
          balance: number | null
          space_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
      monthly_summary: {
        Row: {
          currency: string | null
          expense: number | null
          income: number | null
          month: string | null
          space_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_space_invite: {
        Args: { invite_token: string }
        Returns: string
      }
      can_access_receipt_folder: {
        Args: { folder: string; for_write: boolean }
        Returns: boolean
      }
      create_space: {
        Args: { space_name: string }
        Returns: string
      }
      create_space_invite: {
        Args: {
          invite_role: string
          sid: string
          uses?: number
          valid_hours?: number
        }
        Returns: string
      }
      list_space_members: {
        Args: { sid: string }
        Returns: {
          email: string
          is_you: boolean
          role: string
          user_id: string
        }[]
      }
      space_role: {
        Args: { sid: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
