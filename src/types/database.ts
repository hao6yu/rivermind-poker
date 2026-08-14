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
      daily_challenge_results: {
        Row: {
          attempts: number
          best_hands: number
          best_place: number
          best_score: number
          challenge_date: string
          challenge_version: number
          completed_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          best_hands: number
          best_place: number
          best_score: number
          challenge_date: string
          challenge_version?: number
          completed_at: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          attempts?: number
          best_hands?: number
          best_place?: number
          best_score?: number
          challenge_date?: string
          challenge_version?: number
          completed_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      beta_feedback: {
        Row: {
          app_version: string
          build_number: string | null
          category: string
          created_at: string
          diagnostic_version: number
          diagnostics: Json
          hand_client_id: string | null
          id: number
          message: string
          platform: string
          screen: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version: string
          build_number?: string | null
          category: string
          created_at?: string
          diagnostic_version?: number
          diagnostics?: Json
          hand_client_id?: string | null
          id?: never
          message: string
          platform: string
          screen: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          app_version?: string
          build_number?: string | null
          category?: string
          created_at?: string
          diagnostic_version?: number
          diagnostics?: Json
          hand_client_id?: string | null
          id?: never
          message?: string
          platform?: string
          screen?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coach_daily_usage: {
        Row: {
          created_at: string
          failure_count: number
          last_error_code: string | null
          last_latency_ms: number | null
          refunded_failure_count: number
          request_count: number
          success_count: number
          total_latency_ms: number
          updated_at: string
          usage_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          failure_count?: number
          last_error_code?: string | null
          last_latency_ms?: number | null
          refunded_failure_count?: number
          request_count?: number
          success_count?: number
          total_latency_ms?: number
          updated_at?: string
          usage_date?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          failure_count?: number
          last_error_code?: string | null
          last_latency_ms?: number | null
          refunded_failure_count?: number
          request_count?: number
          success_count?: number
          total_latency_ms?: number
          updated_at?: string
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
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
      multiplayer_actions: {
        Row: {
          action_sequence: number
          action_type: string
          amount: number
          created_at: string
          hand_number: number
          id: number
          player_id: string
          pot_after: number
          room_id: string
          session_number: number
          state_version: number
          street: string
        }
        Insert: {
          action_sequence: number
          action_type: string
          amount: number
          created_at?: string
          hand_number: number
          id?: never
          player_id: string
          pot_after: number
          room_id: string
          session_number?: number
          state_version: number
          street: string
        }
        Update: {
          action_sequence?: number
          action_type?: string
          amount?: number
          created_at?: string
          hand_number?: number
          id?: never
          player_id?: string
          pot_after?: number
          room_id?: string
          session_number?: number
          state_version?: number
          street?: string
        }
        Relationships: [
          {
            foreignKeyName: "multiplayer_actions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "multiplayer_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      multiplayer_rooms: {
        Row: {
          ai_difficulty: string
          big_blind_chips: number
          completion_reason: string | null
          created_at: string
          expires_at: string
          hand_number: number
          hand_target: string
          host_player_id: string | null
          id: string
          public_snapshot: Json
          seat_count: number
          session_number: number
          small_blind_chips: number
          starting_stack_chips: number
          state_version: number
          status: string
          turn_deadline_at: string | null
          turn_seconds: number
          updated_at: string
        }
        Insert: {
          ai_difficulty: string
          big_blind_chips: number
          completion_reason?: string | null
          created_at?: string
          expires_at: string
          hand_number?: number
          hand_target: string
          host_player_id?: string | null
          id: string
          public_snapshot?: Json
          seat_count: number
          session_number?: number
          small_blind_chips: number
          starting_stack_chips: number
          state_version?: number
          status?: string
          turn_deadline_at?: string | null
          turn_seconds: number
          updated_at?: string
        }
        Update: {
          ai_difficulty?: string
          big_blind_chips?: number
          completion_reason?: string | null
          created_at?: string
          expires_at?: string
          hand_number?: number
          hand_target?: string
          host_player_id?: string | null
          id?: string
          public_snapshot?: Json
          seat_count?: number
          session_number?: number
          small_blind_chips?: number
          starting_stack_chips?: number
          state_version?: number
          status?: string
          turn_deadline_at?: string | null
          turn_seconds?: number
          updated_at?: string
        }
        Relationships: []
      }
      multiplayer_seats: {
        Row: {
          ai_profile_id: string | null
          connection_state: string
          control_state: string
          display_name: string
          joined_at: string
          missed_turns: number
          occupant_kind: string
          player_id: string
          ready: boolean
          room_id: string
          seat_index: number
          stack_chips: number | null
          updated_at: string
        }
        Insert: {
          ai_profile_id?: string | null
          connection_state?: string
          control_state: string
          display_name: string
          joined_at: string
          missed_turns?: number
          occupant_kind: string
          player_id: string
          ready?: boolean
          room_id: string
          seat_index: number
          stack_chips?: number | null
          updated_at?: string
        }
        Update: {
          ai_profile_id?: string | null
          connection_state?: string
          control_state?: string
          display_name?: string
          joined_at?: string
          missed_turns?: number
          occupant_kind?: string
          player_id?: string
          ready?: boolean
          room_id?: string
          seat_index?: number
          stack_chips?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "multiplayer_seats_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "multiplayer_rooms"
            referencedColumns: ["id"]
          },
        ]
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
      claim_coach_review_slot: {
        Args: { p_user_id: string }
        Returns: {
          allowed: boolean
          remaining: number
          request_count: number
          resets_at: string
        }[]
      }
      multiplayer_claim_request_slot: {
        Args: {
          p_limit: number
          p_operation: string
          p_user_id: string
          p_window_seconds: number
        }
        Returns: boolean
      }
      multiplayer_commit_transition: {
        Args: {
          p_canonical_state: Json
          p_expected_version: number
          p_public_actions: Json
          p_public_snapshot: Json
          p_public_transition: Json
          p_room_id: string
        }
        Returns: number
      }
      multiplayer_commit_transition_v2: {
        Args: {
          p_canonical_state: Json
          p_expected_version: number
          p_hand_archives: Json
          p_public_actions: Json
          p_public_snapshot: Json
          p_public_transition: Json
          p_room_id: string
        }
        Returns: number
      }
      multiplayer_create_room: {
        Args: {
          p_canonical_state: Json
          p_config: Json
          p_expires_at: string
          p_host_display_name: string
          p_host_player_id: string
          p_host_seat: number
          p_host_user_id: string
          p_public_snapshot: Json
          p_room_code_hash: string
          p_room_id: string
        }
        Returns: Json
      }
      multiplayer_delete_hand_archives: {
        Args: { p_user_id: string }
        Returns: number
      }
      multiplayer_load_hand_archives: {
        Args: {
          p_limit?: number
          p_room_id?: string
          p_session_number?: number
          p_user_id: string
        }
        Returns: Json
      }
      multiplayer_load_joinable_room: {
        Args: { p_room_code_hash: string }
        Returns: Json
      }
      multiplayer_load_private_room: {
        Args: { p_room_id: string }
        Returns: Json
      }
      multiplayer_load_resumable_room: {
        Args: { p_user_id: string }
        Returns: Json
      }
      record_coach_review_result: {
        Args: {
          p_error_code?: string
          p_latency_ms: number
          p_succeeded: boolean
          p_user_id: string
        }
        Returns: boolean
      }
      release_coach_review_slot: {
        Args: {
          p_error_code?: string
          p_latency_ms: number
          p_user_id: string
        }
        Returns: {
          released: boolean
          remaining: number
          request_count: number
          resets_at: string
        }[]
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
  public: {
    Enums: {},
  },
} as const
