// Generated from the live schema of project ojrkuvtsreamgymkulwj.
// Regenerate after any migration; do not hand-edit.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      chat_messages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          read_at: string | null;
          sender_id: string;
          thread_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          sender_id: string;
          thread_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          sender_id?: string;
          thread_id?: string;
        };
        Relationships: [];
      };
      chat_threads: {
        Row: {
          assignment_id: string | null;
          created_at: string;
          id: string;
          last_message_at: string;
          spec_point_id: string | null;
          student_id: string;
          subject: string;
        };
        Insert: {
          assignment_id?: string | null;
          created_at?: string;
          id?: string;
          last_message_at?: string;
          spec_point_id?: string | null;
          student_id: string;
          subject?: string;
        };
        Update: {
          assignment_id?: string | null;
          created_at?: string;
          id?: string;
          last_message_at?: string;
          spec_point_id?: string | null;
          student_id?: string;
          subject?: string;
        };
        Relationships: [];
      };
      homework_answers: {
        Row: {
          answer_text: string | null;
          awarded_marks: number | null;
          id: string;
          marker_comment: string | null;
          question_id: string;
          submission_id: string;
        };
        Insert: {
          answer_text?: string | null;
          awarded_marks?: number | null;
          id?: string;
          marker_comment?: string | null;
          question_id: string;
          submission_id: string;
        };
        Update: {
          answer_text?: string | null;
          awarded_marks?: number | null;
          id?: string;
          marker_comment?: string | null;
          question_id?: string;
          submission_id?: string;
        };
        Relationships: [];
      };
      homework_assignments: {
        Row: {
          assigned_at: string;
          assigned_by: string;
          due_at: string | null;
          id: string;
          note: string | null;
          resource_id: string;
          status: Database["public"]["Enums"]["assignment_status"];
          student_id: string;
        };
        Insert: {
          assigned_at?: string;
          assigned_by: string;
          due_at?: string | null;
          id?: string;
          note?: string | null;
          resource_id: string;
          status?: Database["public"]["Enums"]["assignment_status"];
          student_id: string;
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string;
          due_at?: string | null;
          id?: string;
          note?: string | null;
          resource_id?: string;
          status?: Database["public"]["Enums"]["assignment_status"];
          student_id?: string;
        };
        Relationships: [];
      };
      homework_questions: {
        Row: {
          id: string;
          marks: number;
          model_answer: string | null;
          prompt: string;
          resource_id: string;
          sort_order: number;
          spec_point_id: string | null;
        };
        Insert: {
          id?: string;
          marks?: number;
          model_answer?: string | null;
          prompt: string;
          resource_id: string;
          sort_order?: number;
          spec_point_id?: string | null;
        };
        Update: {
          id?: string;
          marks?: number;
          model_answer?: string | null;
          prompt?: string;
          resource_id?: string;
          sort_order?: number;
          spec_point_id?: string | null;
        };
        Relationships: [];
      };
      homework_submissions: {
        Row: {
          acknowledged_at: string | null;
          assignment_id: string;
          feedback: string | null;
          files: Json;
          files_deleted_at: string | null;
          grade: string | null;
          graded_at: string | null;
          graded_by: string | null;
          id: string;
          notes: string | null;
          score_pct: number | null;
          student_id: string;
          submitted_at: string;
        };
        Insert: {
          acknowledged_at?: string | null;
          assignment_id: string;
          feedback?: string | null;
          files?: Json;
          files_deleted_at?: string | null;
          grade?: string | null;
          graded_at?: string | null;
          graded_by?: string | null;
          id?: string;
          notes?: string | null;
          score_pct?: number | null;
          student_id: string;
          submitted_at?: string;
        };
        Update: {
          acknowledged_at?: string | null;
          assignment_id?: string;
          feedback?: string | null;
          files?: Json;
          files_deleted_at?: string | null;
          grade?: string | null;
          graded_at?: string | null;
          graded_by?: string | null;
          id?: string;
          notes?: string | null;
          score_pct?: number | null;
          student_id?: string;
          submitted_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          confidence_seeded_at: string | null;
          created_at: string;
          display_name: string;
          email: string | null;
          id: string;
          last_seen_at: string | null;
          level: Database["public"]["Enums"]["level"] | null;
          source: Database["public"]["Enums"]["student_source"];
        };
        Insert: {
          confidence_seeded_at?: string | null;
          created_at?: string;
          display_name?: string;
          email?: string | null;
          id: string;
          last_seen_at?: string | null;
          level?: Database["public"]["Enums"]["level"] | null;
          source?: Database["public"]["Enums"]["student_source"];
        };
        Update: {
          confidence_seeded_at?: string | null;
          created_at?: string;
          display_name?: string;
          email?: string | null;
          id?: string;
          last_seen_at?: string | null;
          level?: Database["public"]["Enums"]["level"] | null;
          source?: Database["public"]["Enums"]["student_source"];
        };
        Relationships: [];
      };
      resource_spec_points: {
        Row: { resource_id: string; spec_point_id: string };
        Insert: { resource_id: string; spec_point_id: string };
        Update: { resource_id?: string; spec_point_id?: string };
        Relationships: [];
      };
      resources: {
        Row: {
          board: Database["public"]["Enums"]["board"] | null;
          created_at: string;
          created_by: string;
          description: string | null;
          duration_seconds: number | null;
          file_mime: string | null;
          file_name: string | null;
          file_path: string | null;
          file_size: number | null;
          id: string;
          instructions: string | null;
          kind: Database["public"]["Enums"]["resource_kind"];
          level: Database["public"]["Enums"]["level"];
          mark_scheme_name: string | null;
          mark_scheme_path: string | null;
          subject: Database["public"]["Enums"]["subject"];
          title: string;
          video_url: string | null;
        };
        Insert: {
          board?: Database["public"]["Enums"]["board"] | null;
          created_at?: string;
          created_by: string;
          description?: string | null;
          duration_seconds?: number | null;
          file_mime?: string | null;
          file_name?: string | null;
          file_path?: string | null;
          file_size?: number | null;
          id?: string;
          instructions?: string | null;
          kind: Database["public"]["Enums"]["resource_kind"];
          level: Database["public"]["Enums"]["level"];
          mark_scheme_name?: string | null;
          mark_scheme_path?: string | null;
          subject: Database["public"]["Enums"]["subject"];
          title: string;
          video_url?: string | null;
        };
        Update: {
          board?: Database["public"]["Enums"]["board"] | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          duration_seconds?: number | null;
          file_mime?: string | null;
          file_name?: string | null;
          file_path?: string | null;
          file_size?: number | null;
          id?: string;
          instructions?: string | null;
          kind?: Database["public"]["Enums"]["resource_kind"];
          level?: Database["public"]["Enums"]["level"];
          mark_scheme_name?: string | null;
          mark_scheme_path?: string | null;
          subject?: Database["public"]["Enums"]["subject"];
          title?: string;
          video_url?: string | null;
        };
        Relationships: [];
      };
      spec_points: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          sort_order: number;
          title: string;
          topic_id: string;
          video_url: string | null;
          weight: number;
        };
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          sort_order?: number;
          title: string;
          topic_id: string;
          video_url?: string | null;
          weight?: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          sort_order?: number;
          title?: string;
          topic_id?: string;
          video_url?: string | null;
          weight?: number;
        };
        Relationships: [];
      };
      stripe_customers: {
        Row: { created_at: string; customer_id: string; student_id: string };
        Insert: { created_at?: string; customer_id: string; student_id: string };
        Update: { created_at?: string; customer_id?: string; student_id?: string };
        Relationships: [];
      };
      student_enrolments: {
        Row: {
          board: Database["public"]["Enums"]["board"];
          created_at: string;
          current_grade: string | null;
          exam_date: string | null;
          id: string;
          previous_grade: string | null;
          student_id: string;
          subject: Database["public"]["Enums"]["subject"];
          syllabus: string;
          target_grade: string | null;
        };
        Insert: {
          board: Database["public"]["Enums"]["board"];
          created_at?: string;
          current_grade?: string | null;
          exam_date?: string | null;
          id?: string;
          previous_grade?: string | null;
          student_id: string;
          subject: Database["public"]["Enums"]["subject"];
          syllabus?: string;
          target_grade?: string | null;
        };
        Update: {
          board?: Database["public"]["Enums"]["board"];
          created_at?: string;
          current_grade?: string | null;
          exam_date?: string | null;
          id?: string;
          previous_grade?: string | null;
          student_id?: string;
          subject?: Database["public"]["Enums"]["subject"];
          syllabus?: string;
          target_grade?: string | null;
        };
        Relationships: [];
      };
      student_program_plan: {
        Row: {
          acknowledged_at: string | null;
          pacing: Json;
          program_start: string;
          student_id: string;
          subject: Database["public"]["Enums"]["subject"];
          updated_at: string;
        };
        Insert: {
          acknowledged_at?: string | null;
          pacing?: Json;
          program_start?: string;
          student_id: string;
          subject: Database["public"]["Enums"]["subject"];
          updated_at?: string;
        };
        Update: {
          acknowledged_at?: string | null;
          pacing?: Json;
          program_start?: string;
          student_id?: string;
          subject?: Database["public"]["Enums"]["subject"];
          updated_at?: string;
        };
        Relationships: [];
      };
      student_spec_point_confidence: {
        Row: {
          confidence: number;
          source: string;
          spec_point_id: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          confidence: number;
          source?: string;
          spec_point_id: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          confidence?: number;
          source?: string;
          spec_point_id?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      student_spec_point_reviews: {
        Row: {
          id: string;
          rating: number;
          reviewed_at: string;
          score_pct: number | null;
          source: string;
          source_id: string | null;
          spec_point_id: string;
          student_id: string;
        };
        Insert: {
          id?: string;
          rating: number;
          reviewed_at?: string;
          score_pct?: number | null;
          source: string;
          source_id?: string | null;
          spec_point_id: string;
          student_id: string;
        };
        Update: {
          id?: string;
          rating?: number;
          reviewed_at?: string;
          score_pct?: number | null;
          source?: string;
          source_id?: string | null;
          spec_point_id?: string;
          student_id?: string;
        };
        Relationships: [];
      };
      student_spec_point_schedule: {
        Row: {
          card: Json;
          due: string;
          last_review: string | null;
          spec_point_id: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          card: Json;
          due: string;
          last_review?: string | null;
          spec_point_id: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          card?: Json;
          due?: string;
          last_review?: string | null;
          spec_point_id?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      student_topic_confidence: {
        Row: {
          confidence: number;
          sort_index: number;
          student_id: string;
          topic_id: string;
          updated_at: string;
        };
        Insert: {
          confidence: number;
          sort_index?: number;
          student_id: string;
          topic_id: string;
          updated_at?: string;
        };
        Update: {
          confidence?: number;
          sort_index?: number;
          student_id?: string;
          topic_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      student_tutor_notes: {
        Row: { notes: string; student_id: string; updated_at: string };
        Insert: { notes?: string; student_id: string; updated_at?: string };
        Update: { notes?: string; student_id?: string; updated_at?: string };
        Relationships: [];
      };
      student_week_notes: {
        Row: {
          completed: boolean;
          student_comment: string;
          student_id: string;
          subject: Database["public"]["Enums"]["subject"];
          tutor_comment: string;
          updated_at: string;
          week_start: string;
        };
        Insert: {
          completed?: boolean;
          student_comment?: string;
          student_id: string;
          subject: Database["public"]["Enums"]["subject"];
          tutor_comment?: string;
          updated_at?: string;
          week_start: string;
        };
        Update: {
          completed?: boolean;
          student_comment?: string;
          student_id?: string;
          subject?: Database["public"]["Enums"]["subject"];
          tutor_comment?: string;
          updated_at?: string;
          week_start?: string;
        };
        Relationships: [];
      };
      student_weekly_plan_points: {
        Row: {
          lane: string;
          origin: string;
          plan_id: string;
          sort_order: number;
          spec_point_id: string;
        };
        Insert: {
          lane?: string;
          origin?: string;
          plan_id: string;
          sort_order?: number;
          spec_point_id: string;
        };
        Update: {
          lane?: string;
          origin?: string;
          plan_id?: string;
          sort_order?: number;
          spec_point_id?: string;
        };
        Relationships: [];
      };
      student_weekly_plans: {
        Row: {
          board: Database["public"]["Enums"]["board"];
          created_at: string;
          id: string;
          level: Database["public"]["Enums"]["level"];
          source: string;
          student_id: string;
          subject: Database["public"]["Enums"]["subject"];
          week_start: string;
        };
        Insert: {
          board: Database["public"]["Enums"]["board"];
          created_at?: string;
          id?: string;
          level: Database["public"]["Enums"]["level"];
          source?: string;
          student_id: string;
          subject: Database["public"]["Enums"]["subject"];
          week_start: string;
        };
        Update: {
          board?: Database["public"]["Enums"]["board"];
          created_at?: string;
          id?: string;
          level?: Database["public"]["Enums"]["level"];
          source?: string;
          student_id?: string;
          subject?: Database["public"]["Enums"]["subject"];
          week_start?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean;
          created_at: string;
          current_period_end: string | null;
          id: string;
          status: string;
          stripe_subscription_id: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          status: string;
          stripe_subscription_id: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          status?: string;
          stripe_subscription_id?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      topics: {
        Row: {
          board: Database["public"]["Enums"]["board"];
          created_at: string;
          id: string;
          level: Database["public"]["Enums"]["level"];
          sort_order: number;
          syllabus: string;
          subject: Database["public"]["Enums"]["subject"];
          title: string;
        };
        Insert: {
          board: Database["public"]["Enums"]["board"];
          created_at?: string;
          id?: string;
          level: Database["public"]["Enums"]["level"];
          sort_order?: number;
          syllabus?: string;
          subject: Database["public"]["Enums"]["subject"];
          title: string;
        };
        Update: {
          board?: Database["public"]["Enums"]["board"];
          created_at?: string;
          id?: string;
          level?: Database["public"]["Enums"]["level"];
          sort_order?: number;
          syllabus?: string;
          subject?: Database["public"]["Enums"]["subject"];
          title?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: { role: Database["public"]["Enums"]["app_role"]; user_id: string };
        Insert: { role: Database["public"]["Enums"]["app_role"]; user_id: string };
        Update: { role?: Database["public"]["Enums"]["app_role"]; user_id?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      record_reviews_atomic: { Args: { _reviews: Json }; Returns: string[] };
      set_week_note: {
        Args: {
          _student_id: string;
          _subject: Database["public"]["Enums"]["subject"];
          _week_start: string;
          _completed?: boolean | null;
          _comment?: string | null;
        };
        Returns: undefined;
      };
      viewer_has_content_access: { Args: never; Returns: boolean };
    };
    Enums: {
      app_role: "student" | "tutor";
      assignment_status: "assigned" | "submitted" | "marked";
      board: "edexcel" | "aqa" | "ocr";
      level: "gcse" | "igcse" | "alevel";
      resource_kind: "homework" | "video" | "download";
      student_source: "independent" | "dulwich" | "ivy" | "bonas" | "referral" | "other";
      subject: "biology" | "chemistry" | "physics";
    };
    CompositeTypes: Record<string, never>;
  };
};

type DefaultSchema = Database["public"];

export type Tables<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Update"];
export type Enums<T extends keyof DefaultSchema["Enums"]> = DefaultSchema["Enums"][T];
