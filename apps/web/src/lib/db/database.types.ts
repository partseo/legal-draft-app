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
      case_files: {
        Row: {
          case_id: string
          created_at: string
          created_by_run: string | null
          filename: string
          id: string
          kind: Database["public"]["Enums"]["file_kind"]
          storage_path: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by_run?: string | null
          filename: string
          id?: string
          kind: Database["public"]["Enums"]["file_kind"]
          storage_path: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by_run?: string | null
          filename?: string
          id?: string
          kind?: Database["public"]["Enums"]["file_kind"]
          storage_path?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "case_files_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_files_created_by_run_fkey"
            columns: ["created_by_run"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          assignee: string | null
          created_at: string
          created_by: string
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee?: string | null
          created_at?: string
          created_by: string
          id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee?: string | null
          created_at?: string
          created_by?: string
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_assignee_fkey"
            columns: ["assignee"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoints: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["checkpoint_type"]
          payload: Json
          responded_at: string | null
          responded_by: string | null
          response: Json | null
          run_id: string
          status: Database["public"]["Enums"]["checkpoint_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["checkpoint_type"]
          payload: Json
          responded_at?: string | null
          responded_by?: string | null
          response?: Json | null
          run_id: string
          status?: Database["public"]["Enums"]["checkpoint_status"]
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["checkpoint_type"]
          payload?: Json
          responded_at?: string | null
          responded_by?: string | null
          response?: Json | null
          run_id?: string
          status?: Database["public"]["Enums"]["checkpoint_status"]
        }
        Relationships: [
          {
            foreignKeyName: "checkpoints_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoints_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      reviews: {
        Row: {
          created_at: string
          decision: Database["public"]["Enums"]["review_decision"]
          id: string
          note: string | null
          reviewer: string
          round_id: string
          stage: Database["public"]["Enums"]["run_stage"]
        }
        Insert: {
          created_at?: string
          decision: Database["public"]["Enums"]["review_decision"]
          id?: string
          note?: string | null
          reviewer: string
          round_id: string
          stage: Database["public"]["Enums"]["run_stage"]
        }
        Update: {
          created_at?: string
          decision?: Database["public"]["Enums"]["review_decision"]
          id?: string
          note?: string | null
          reviewer?: string
          round_id?: string
          stage?: Database["public"]["Enums"]["run_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "reviews_reviewer_fkey"
            columns: ["reviewer"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          case_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["round_kind"]
          seq: number
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["round_kind"]
          seq: number
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["round_kind"]
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "rounds_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          agent_session_id: string | null
          cost_usd: number
          error: string | null
          finished_at: string | null
          id: string
          input_tokens: number
          instruction: string | null
          output_tokens: number
          round_id: string
          stage: Database["public"]["Enums"]["run_stage"]
          started_at: string
          started_by: string
          status: Database["public"]["Enums"]["run_status"]
        }
        Insert: {
          agent_session_id?: string | null
          cost_usd?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          input_tokens?: number
          instruction?: string | null
          output_tokens?: number
          round_id: string
          stage: Database["public"]["Enums"]["run_stage"]
          started_at?: string
          started_by: string
          status?: Database["public"]["Enums"]["run_status"]
        }
        Update: {
          agent_session_id?: string | null
          cost_usd?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          input_tokens?: number
          instruction?: string | null
          output_tokens?: number
          round_id?: string
          stage?: Database["public"]["Enums"]["run_stage"]
          started_at?: string
          started_by?: string
          status?: Database["public"]["Enums"]["run_status"]
        }
        Relationships: [
          {
            foreignKeyName: "runs_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      checkpoint_status: "대기" | "응답됨"
      checkpoint_type: "쟁점승인" | "질문"
      file_kind:
        | "입력"
        | "사건컨텍스트"
        | "리서치"
        | "서면"
        | "검증보고"
        | "context_json"
      review_decision: "승인" | "수정지시"
      round_kind: "소장" | "준비서면"
      run_stage: "intake" | "research" | "draft" | "verify"
      run_status:
        | "running"
        | "waiting_checkpoint"
        | "succeeded"
        | "failed"
        | "canceled"
      user_role: "admin" | "member"
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
    Enums: {
      checkpoint_status: ["대기", "응답됨"],
      checkpoint_type: ["쟁점승인", "질문"],
      file_kind: [
        "입력",
        "사건컨텍스트",
        "리서치",
        "서면",
        "검증보고",
        "context_json",
      ],
      review_decision: ["승인", "수정지시"],
      round_kind: ["소장", "준비서면"],
      run_stage: ["intake", "research", "draft", "verify"],
      run_status: [
        "running",
        "waiting_checkpoint",
        "succeeded",
        "failed",
        "canceled",
      ],
      user_role: ["admin", "member"],
    },
  },
} as const
