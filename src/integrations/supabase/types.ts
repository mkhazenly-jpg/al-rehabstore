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
      app_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      assignment_batches: {
        Row: {
          assignment_id: string
          created_at: string
          id: string
          quantity: number
          stock_addition_id: string
          unit_price: number
        }
        Insert: {
          assignment_id: string
          created_at?: string
          id?: string
          quantity: number
          stock_addition_id: string
          unit_price?: number
        }
        Update: {
          assignment_id?: string
          created_at?: string
          id?: string
          quantity?: number
          stock_addition_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "assignment_batches_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_batches_stock_addition_id_fkey"
            columns: ["stock_addition_id"]
            isOneToOne: false
            referencedRelation: "stock_additions"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          assignment_date: string
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          quantity_assigned: number
          return_date: string | null
          status: Database["public"]["Enums"]["assignment_status"]
          stock_item_id: string
          unit_price_at_assignment: number
          updated_at: string
        }
        Insert: {
          assignment_date?: string
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          quantity_assigned?: number
          return_date?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          stock_item_id: string
          unit_price_at_assignment?: number
          updated_at?: string
        }
        Update: {
          assignment_date?: string
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          quantity_assigned?: number
          return_date?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          stock_item_id?: string
          unit_price_at_assignment?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_logs: {
        Row: {
          created_at: string
          deleted_old: number | null
          elapsed_ms: number | null
          error_message: string | null
          file_id: string | null
          file_name: string | null
          id: string
          kind: string
          size_bytes: number | null
          status: string
          triggered_by: string | null
          triggered_by_user: string | null
          web_view_link: string | null
        }
        Insert: {
          created_at?: string
          deleted_old?: number | null
          elapsed_ms?: number | null
          error_message?: string | null
          file_id?: string | null
          file_name?: string | null
          id?: string
          kind?: string
          size_bytes?: number | null
          status: string
          triggered_by?: string | null
          triggered_by_user?: string | null
          web_view_link?: string | null
        }
        Update: {
          created_at?: string
          deleted_old?: number | null
          elapsed_ms?: number | null
          error_message?: string | null
          file_id?: string | null
          file_name?: string | null
          id?: string
          kind?: string
          size_bytes?: number | null
          status?: string
          triggered_by?: string | null
          triggered_by_user?: string | null
          web_view_link?: string | null
        }
        Relationships: []
      }
      employee_violations: {
        Row: {
          action_taken: Database["public"]["Enums"]["violation_action"]
          created_at: string
          created_by: string | null
          daily_wage: number
          deduction_amount: number
          employee_id: string
          id: string
          notes: string | null
          updated_at: string
          violation_date: string
          violation_description: string
          violation_location: string | null
        }
        Insert: {
          action_taken?: Database["public"]["Enums"]["violation_action"]
          created_at?: string
          created_by?: string | null
          daily_wage?: number
          deduction_amount?: number
          employee_id: string
          id?: string
          notes?: string | null
          updated_at?: string
          violation_date?: string
          violation_description: string
          violation_location?: string | null
        }
        Update: {
          action_taken?: Database["public"]["Enums"]["violation_action"]
          created_at?: string
          created_by?: string | null
          daily_wage?: number
          deduction_amount?: number
          employee_id?: string
          id?: string
          notes?: string | null
          updated_at?: string
          violation_date?: string
          violation_description?: string
          violation_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_violations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          department: string | null
          emergency_contact: string | null
          hire_date: string
          id: string
          job_title: string | null
          location: string | null
          mobile: string | null
          name: string
          notes: string | null
          shift: string | null
          status: Database["public"]["Enums"]["employee_status"]
          termination_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          emergency_contact?: string | null
          hire_date?: string
          id?: string
          job_title?: string | null
          location?: string | null
          mobile?: string | null
          name: string
          notes?: string | null
          shift?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          termination_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string | null
          emergency_contact?: string | null
          hire_date?: string
          id?: string
          job_title?: string | null
          location?: string | null
          mobile?: string | null
          name?: string
          notes?: string | null
          shift?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          termination_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_approved: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_approved?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_approved?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stock_additions: {
        Row: {
          added_at: string
          added_by: string | null
          id: string
          notes: string | null
          quantity_added: number
          remaining_quantity: number
          stock_item_id: string
          unit_price_at_addition: number
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          id?: string
          notes?: string | null
          quantity_added?: number
          remaining_quantity?: number
          stock_item_id: string
          unit_price_at_addition?: number
        }
        Update: {
          added_at?: string
          added_by?: string | null
          id?: string
          notes?: string | null
          quantity_added?: number
          remaining_quantity?: number
          stock_item_id?: string
          unit_price_at_addition?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_additions_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          added_date: string
          category: string
          created_by: string | null
          id: string
          last_updated: string
          name: string
          quantity_in_stock: number
          size: string
          unit: string
          unit_price: number
        }
        Insert: {
          added_date?: string
          category: string
          created_by?: string | null
          id?: string
          last_updated?: string
          name: string
          quantity_in_stock?: number
          size?: string
          unit?: string
          unit_price?: number
        }
        Update: {
          added_date?: string
          category?: string
          created_by?: string | null
          id?: string
          last_updated?: string
          name?: string
          quantity_in_stock?: number
          size?: string
          unit?: string
          unit_price?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      violation_notifications: {
        Row: {
          attempt_count: number
          channel: string
          created_at: string
          employee_id: string
          error_message: string | null
          id: string
          message_sid: string | null
          sent_at: string | null
          status: string
          to_number: string | null
          triggered_by: string | null
          updated_at: string
          violation_id: string
        }
        Insert: {
          attempt_count?: number
          channel?: string
          created_at?: string
          employee_id: string
          error_message?: string | null
          id?: string
          message_sid?: string | null
          sent_at?: string | null
          status?: string
          to_number?: string | null
          triggered_by?: string | null
          updated_at?: string
          violation_id: string
        }
        Update: {
          attempt_count?: number
          channel?: string
          created_at?: string
          employee_id?: string
          error_message?: string | null
          id?: string
          message_sid?: string | null
          sent_at?: string | null
          status?: string
          to_number?: string | null
          triggered_by?: string | null
          updated_at?: string
          violation_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_assignment: {
        Args: { _assignment_id: string }
        Returns: undefined
      }
      assign_with_fifo: { Args: { _assignment_id: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
      mark_as_replaced: { Args: { _assignment_id: string }; Returns: undefined }
      return_assignment: {
        Args: { _assignment_id: string }
        Returns: undefined
      }
      return_with_fifo: { Args: { _assignment_id: string }; Returns: undefined }
      wipe_all_data: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "staff"
      assignment_status:
        | "pending"
        | "approved"
        | "returned"
        | "damaged"
        | "lost"
        | "replaced"
      employee_status: "active" | "resigned" | "terminated" | "archived"
      violation_action:
        | "warning"
        | "deduction"
        | "suspension"
        | "termination"
        | "verbal_warning"
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
      app_role: ["admin", "staff"],
      assignment_status: [
        "pending",
        "approved",
        "returned",
        "damaged",
        "lost",
        "replaced",
      ],
      employee_status: ["active", "resigned", "terminated", "archived"],
      violation_action: [
        "warning",
        "deduction",
        "suspension",
        "termination",
        "verbal_warning",
      ],
    },
  },
} as const
