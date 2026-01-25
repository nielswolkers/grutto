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
      calendar_connections: {
        Row: {
          connected_at: string
          display_name: string | null
          ics_url: string
          id: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string
          display_name?: string | null
          ics_url: string
          id?: string
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string
          display_name?: string | null
          ics_url?: string
          id?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          all_day: boolean | null
          color: string
          created_at: string
          description: string | null
          end_time: string
          event_type: string
          id: string
          location: string | null
          reminder_minutes: number | null
          repeat_type: string | null
          start_time: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean | null
          color?: string
          created_at?: string
          description?: string | null
          end_time: string
          event_type?: string
          id?: string
          location?: string | null
          reminder_minutes?: number | null
          repeat_type?: string | null
          start_time: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_day?: boolean | null
          color?: string
          created_at?: string
          description?: string | null
          end_time?: string
          event_type?: string
          id?: string
          location?: string | null
          reminder_minutes?: number | null
          repeat_type?: string | null
          start_time?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      event_invitations: {
        Row: {
          created_at: string
          event_id: string
          id: string
          invitee_id: string
          inviter_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          invitee_id: string
          inviter_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_invitations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      file_shares: {
        Row: {
          file_id: string
          id: string
          shared_by_user_id: string
          shared_date: string
          shared_with_user_id: string
        }
        Insert: {
          file_id: string
          id?: string
          shared_by_user_id: string
          shared_date?: string
          shared_with_user_id: string
        }
        Update: {
          file_id?: string
          id?: string
          shared_by_user_id?: string
          shared_date?: string
          shared_with_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_shares_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          deleted_at: string | null
          deleted_by: string | null
          file_size: number
          file_type: string
          filename: string
          folder_id: string | null
          id: string
          is_favorite: boolean | null
          owner_id: string
          storage_url: string
          updated_at: string
          upload_date: string
        }
        Insert: {
          deleted_at?: string | null
          deleted_by?: string | null
          file_size: number
          file_type: string
          filename: string
          folder_id?: string | null
          id?: string
          is_favorite?: boolean | null
          owner_id: string
          storage_url: string
          updated_at?: string
          upload_date?: string
        }
        Update: {
          deleted_at?: string | null
          deleted_by?: string | null
          file_size?: number
          file_type?: string
          filename?: string
          folder_id?: string | null
          id?: string
          is_favorite?: boolean | null
          owner_id?: string
          storage_url?: string
          updated_at?: string
          upload_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          color: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          name: string
          owner_id: string
          parent_folder_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name: string
          owner_id: string
          parent_folder_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name?: string
          owner_id?: string
          parent_folder_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      google_calendar_connections: {
        Row: {
          access_token: string | null
          connected_at: string
          google_email: string | null
          google_name: string | null
          id: string
          refresh_token: string | null
          token_expiry: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          connected_at?: string
          google_email?: string | null
          google_name?: string | null
          id?: string
          refresh_token?: string | null
          token_expiry?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          connected_at?: string
          google_email?: string | null
          google_name?: string | null
          id?: string
          refresh_token?: string | null
          token_expiry?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      group_admin_requests: {
        Row: {
          created_at: string
          group_id: string
          id: string
          requester_id: string
          responded_at: string | null
          status: string
          target_admin_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          requester_id: string
          responded_at?: string | null
          status?: string
          target_admin_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          requester_id?: string
          responded_at?: string | null
          status?: string
          target_admin_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_admin_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_admins: {
        Row: {
          created_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_admins_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_first_visits: {
        Row: {
          group_id: string
          id: string
          user_id: string
          visited_at: string
        }
        Insert: {
          group_id: string
          id?: string
          user_id: string
          visited_at?: string
        }
        Update: {
          group_id?: string
          id?: string
          user_id?: string
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_first_visits_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_materials: {
        Row: {
          created_at: string
          file_size: number
          file_type: string
          filename: string
          group_id: string
          id: string
          storage_url: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_size: number
          file_type: string
          filename: string
          group_id: string
          id?: string
          storage_url: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_size?: number
          file_type?: string
          filename?: string
          group_id?: string
          id?: string
          storage_url?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_materials_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          invited_by: string
          request_type: string | null
          responded_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          invited_by: string
          request_type?: string | null
          responded_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          invited_by?: string
          request_type?: string | null
          responded_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_message_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          message_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          message_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          message_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_message_comments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "group_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          content: string | null
          created_at: string
          file_id: string | null
          file_name: string | null
          file_url: string | null
          group_id: string
          id: string
          image_url: string | null
          sender_id: string
          task_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          file_id?: string | null
          file_name?: string | null
          file_url?: string | null
          group_id: string
          id?: string
          image_url?: string | null
          sender_id: string
          task_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          file_id?: string | null
          file_name?: string | null
          file_url?: string | null
          group_id?: string
          id?: string
          image_url?: string | null
          sender_id?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content: string
          created_at: string
          folder_name: string | null
          id: string
          is_pinned: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          folder_name?: string | null
          id?: string
          is_pinned?: boolean
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          folder_name?: string | null
          id?: string
          is_pinned?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          file_id: string | null
          id: string
          message: string
          read_status: boolean | null
          recipient_id: string
          sender_id: string
          type: string
        }
        Insert: {
          created_at?: string
          file_id?: string | null
          id?: string
          message: string
          read_status?: boolean | null
          recipient_id: string
          sender_id: string
          type: string
        }
        Update: {
          created_at?: string
          file_id?: string | null
          id?: string
          message?: string
          read_status?: boolean | null
          recipient_id?: string
          sender_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          banner_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          full_name: string
          id: string
          study_goal_minutes: number
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          full_name: string
          id?: string
          study_goal_minutes?: number
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          full_name?: string
          id?: string
          study_goal_minutes?: number
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      publication_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          publication_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          publication_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          publication_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publication_comments_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "publications"
            referencedColumns: ["id"]
          },
        ]
      }
      publications: {
        Row: {
          content: string | null
          created_at: string
          file_name: string | null
          file_url: string | null
          id: string
          image_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          image_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          image_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      spotify_connections: {
        Row: {
          connected_at: string | null
          id: string
          spotify_display_name: string | null
          spotify_email: string | null
          spotify_refresh_token: string | null
          spotify_token: string | null
          spotify_user_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string | null
          id?: string
          spotify_display_name?: string | null
          spotify_email?: string | null
          spotify_refresh_token?: string | null
          spotify_token?: string | null
          spotify_user_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string | null
          id?: string
          spotify_display_name?: string | null
          spotify_email?: string | null
          spotify_refresh_token?: string | null
          spotify_token?: string | null
          spotify_user_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      study_groups: {
        Row: {
          avatar_url: string | null
          banner_url: string | null
          bio: string | null
          created_at: string
          id: string
          is_public: boolean | null
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          is_public?: boolean | null
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          is_public?: boolean | null
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      study_sessions: {
        Row: {
          created_at: string
          duration_minutes: number | null
          ended_at: string | null
          id: string
          is_active: boolean
          started_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          is_active?: boolean
          started_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          is_active?: boolean
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          add_to_calendar: boolean | null
          completed: boolean
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string
          due_time: string | null
          id: string
          priority: string
          repeat_end_date: string | null
          repeat_interval: number | null
          repeat_type: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          add_to_calendar?: boolean | null
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date: string
          due_time?: string | null
          id?: string
          priority?: string
          repeat_end_date?: string | null
          repeat_interval?: number | null
          repeat_type?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          add_to_calendar?: boolean | null
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string
          due_time?: string | null
          id?: string
          priority?: string
          repeat_end_date?: string | null
          repeat_interval?: number | null
          repeat_type?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_group_owner: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
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
