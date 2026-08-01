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
  public: {
    Tables: {
      hand_reviews: {
        Row: {
          analysis_version: number
          created_at: string
          focus_area: string
          focus_decision_sequence: number
          hand_grade: string
          hand_id: string
          id: string
          review: Json
          updated_at: string
          user_id: string
          verified_analysis: Json
        }
        Insert: {
          analysis_version?: number
          created_at?: string
          focus_area: string
          focus_decision_sequence: number
          hand_grade: string
          hand_id: string
          id?: string
          review: Json
          updated_at?: string
          user_id?: string
          verified_analysis: Json
        }
        Update: {
          analysis_version?: number
          created_at?: string
          focus_area?: string
          focus_decision_sequence?: number
          hand_grade?: string
          hand_id?: string
          id?: string
          review?: Json
          updated_at?: string
          user_id?: string
          verified_analysis?: Json
        }
        Relationships: [
          {
            foreignKeyName: "hand_reviews_hand_owner_fk"
            columns: ["hand_id", "user_id"]
            isOneToOne: false
            referencedRelation: "practice_hands"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      learning_progress: {
        Row: {
          activity_id: string
          activity_type: string
          attempts: number
          best_score: number | null
          completed_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_id: string
          activity_type: string
          attempts?: number
          best_score?: number | null
          completed_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          activity_id?: string
          activity_type?: string
          attempts?: number
          best_score?: number | null
          completed_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      practice_hands: {
        Row: {
          client_id: string
          completed_at: string
          created_at: string
          game_state: Json
          hand_number: number
          id: string
          outcome_winner: string
          pot_won: number
          session_id: string
          showdown: boolean
          user_id: string
        }
        Insert: {
          client_id: string
          completed_at?: string
          created_at?: string
          game_state: Json
          hand_number: number
          id?: string
          outcome_winner: string
          pot_won: number
          session_id: string
          showdown: boolean
          user_id?: string
        }
        Update: {
          client_id?: string
          completed_at?: string
          created_at?: string
          game_state?: Json
          hand_number?: number
          id?: string
          outcome_winner?: string
          pot_won?: number
          session_id?: string
          showdown?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_hands_session_owner_fk"
            columns: ["session_id", "user_id"]
            isOneToOne: false
            referencedRelation: "practice_sessions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      practice_sessions: {
        Row: {
          ai_difficulty: string
          client_id: string
          coach_enabled: boolean
          created_at: string
          ended_at: string | null
          id: string
          last_played_at: string
          mode: string
          started_at: string
          user_id: string
        }
        Insert: {
          ai_difficulty?: string
          client_id: string
          coach_enabled?: boolean
          created_at?: string
          ended_at?: string | null
          id?: string
          last_played_at?: string
          mode?: string
          started_at?: string
          user_id?: string
        }
        Update: {
          ai_difficulty?: string
          client_id?: string
          coach_enabled?: boolean
          created_at?: string
          ended_at?: string | null
          id?: string
          last_played_at?: string
          mode?: string
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
