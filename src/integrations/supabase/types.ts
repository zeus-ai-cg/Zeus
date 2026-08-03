export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      achievements: {
        Row: {
          code: string;
          earned_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          code: string;
          earned_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          code?: string;
          earned_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      credit_ledger: {
        Row: {
          action: string;
          created_at: string;
          credits: number;
          id: string;
          meta: Json;
          user_id: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          credits: number;
          id?: string;
          meta?: Json;
          user_id: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          credits?: number;
          id?: string;
          meta?: Json;
          user_id?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          created_at: string;
          id: string;
          parts: Json;
          role: string;
          thread_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          parts: Json;
          role: string;
          thread_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          parts?: Json;
          role?: string;
          thread_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "threads";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          active_model_id: string;
          active_model_provider: string;
          age: number | null;
          avatar_url: string | null;
          coding_style: string;
          created_at: string;
          creativity_level: string;
          display_name: string | null;
          engineer_free_project_used: boolean;
          favorite_language: string | null;
          full_name: string | null;
          id: string;
          last_active_date: string | null;
          learning_mode: string;
          lemonsqueezy_customer_id: string | null;
          lemonsqueezy_next_renewal_at: string | null;
          lemonsqueezy_order_id: string | null;
          lemonsqueezy_renewal_status: string | null;
          lemonsqueezy_subscription_id: string | null;
          nationality: string | null;
          onboarding_completed: boolean;
          plan: string;
          pro_requests_used: number;
          pro_usage_reset_at: string;
          questions_used: number;
          response_length: string;
          score: number;
          streak_days: number;
          usage_reset_at: string;
        };
        Insert: {
          active_model_id?: string;
          active_model_provider?: string;
          age?: number | null;
          avatar_url?: string | null;
          coding_style?: string;
          created_at?: string;
          creativity_level?: string;
          display_name?: string | null;
          engineer_free_project_used?: boolean;
          favorite_language?: string | null;
          full_name?: string | null;
          id: string;
          last_active_date?: string | null;
          learning_mode?: string;
          lemonsqueezy_customer_id?: string | null;
          lemonsqueezy_next_renewal_at?: string | null;
          lemonsqueezy_order_id?: string | null;
          lemonsqueezy_renewal_status?: string | null;
          lemonsqueezy_subscription_id?: string | null;
          nationality?: string | null;
          onboarding_completed?: boolean;
          plan?: string;
          pro_requests_used?: number;
          pro_usage_reset_at?: string;
          questions_used?: number;
          response_length?: string;
          score?: number;
          streak_days?: number;
          usage_reset_at?: string;
        };
        Update: {
          active_model_id?: string;
          active_model_provider?: string;
          age?: number | null;
          avatar_url?: string | null;
          coding_style?: string;
          created_at?: string;
          creativity_level?: string;
          display_name?: string | null;
          engineer_free_project_used?: boolean;
          favorite_language?: string | null;
          full_name?: string | null;
          id?: string;
          last_active_date?: string | null;
          learning_mode?: string;
          lemonsqueezy_customer_id?: string | null;
          lemonsqueezy_next_renewal_at?: string | null;
          lemonsqueezy_order_id?: string | null;
          lemonsqueezy_renewal_status?: string | null;
          lemonsqueezy_subscription_id?: string | null;
          nationality?: string | null;
          onboarding_completed?: boolean;
          plan?: string;
          pro_requests_used?: number;
          pro_usage_reset_at?: string;
          questions_used?: number;
          response_length?: string;
          score?: number;
          streak_days?: number;
          usage_reset_at?: string;
        };
        Relationships: [];
      };
      project_contexts: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          project_name: string;
          token: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          project_name?: string;
          token: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          project_name?: string;
          token?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      saved_snippets: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          language: string;
          title: string;
          user_id: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          language?: string;
          title?: string;
          user_id: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          language?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      threads: {
        Row: {
          created_at: string;
          id: string;
          title: string;
          updated_at: string;
          user_id: string;
          workspace_project_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          title?: string;
          updated_at?: string;
          user_id: string;
          workspace_project_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
          workspace_project_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "threads_workspace_project_id_fkey";
            columns: ["workspace_project_id"];
            isOneToOne: false;
            referencedRelation: "workspace_projects";
            referencedColumns: ["id"];
          },
        ];
      };
      user_api_keys: {
        Row: {
          created_at: string;
          encrypted_key: string;
          id: string;
          last_four: string;
          provider: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          encrypted_key: string;
          id?: string;
          last_four: string;
          provider: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          encrypted_key?: string;
          id?: string;
          last_four?: string;
          provider?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      workspace_modifications: {
        Row: {
          applied_at: string | null;
          created_at: string;
          files: Json;
          id: string;
          instructions: string;
          project_id: string;
          status: string;
          summary: string;
          user_id: string;
        };
        Insert: {
          applied_at?: string | null;
          created_at?: string;
          files?: Json;
          id?: string;
          instructions: string;
          project_id: string;
          status?: string;
          summary?: string;
          user_id: string;
        };
        Update: {
          applied_at?: string | null;
          created_at?: string;
          files?: Json;
          id?: string;
          instructions?: string;
          project_id?: string;
          status?: string;
          summary?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_modifications_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "workspace_projects";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_project_files: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          path: string;
          project_id: string;
          size: number;
        };
        Insert: {
          content?: string;
          created_at?: string;
          id?: string;
          path: string;
          project_id: string;
          size?: number;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          path?: string;
          project_id?: string;
          size?: number;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_project_files_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "workspace_projects";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_projects: {
        Row: {
          created_at: string;
          dependencies: Json;
          file_count: number;
          folder_tree: Json;
          framework: string | null;
          health_score: Json | null;
          id: string;
          ignore_patterns: string | null;
          name: string;
          notes: string | null;
          pinned: boolean;
          primary_language: string | null;
          project_map: Json | null;
          total_bytes: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          dependencies?: Json;
          file_count?: number;
          folder_tree?: Json;
          framework?: string | null;
          health_score?: Json | null;
          id?: string;
          ignore_patterns?: string | null;
          name?: string;
          notes?: string | null;
          pinned?: boolean;
          primary_language?: string | null;
          project_map?: Json | null;
          total_bytes?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          dependencies?: Json;
          file_count?: number;
          folder_tree?: Json;
          framework?: string | null;
          health_score?: Json | null;
          id?: string;
          ignore_patterns?: string | null;
          name?: string;
          notes?: string | null;
          pinned?: boolean;
          primary_language?: string | null;
          project_map?: Json | null;
          total_bytes?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      increment_usage: {
        Args: { p_user_id: string };
        Returns: {
          plan: string;
          questions_used: number;
          usage_reset_at: string;
          pro_requests_used: number;
          pro_usage_reset_at: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
