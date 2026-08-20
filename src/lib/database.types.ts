// Generated from the `contentadmin` Supabase project schema
// (supabase/migrations/0001_init.sql). Regenerate with the Supabase MCP's
// generate_typescript_types if the schema changes.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      channels: {
        Row: {
          id: string;
          name: string;
          sub: string | null;
          dot: string | null;
          cadence: string | null;
          youtube_channel_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          sub?: string | null;
          dot?: string | null;
          cadence?: string | null;
          youtube_channel_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["channels"]["Insert"]>;
        Relationships: [];
      };
      shorts: {
        Row: {
          id: string;
          channel_id: string;
          title: string;
          description: string;
          tags: string[];
          file_path: string | null;
          file_name: string | null;
          file_size_bytes: number | null;
          duration_seconds: number | null;
          status: string;
          slot_at: string | null;
          visibility: string;
          playlist: string | null;
          made_for_kids: boolean;
          allow_comments: boolean;
          trend_score: number | null;
          trend_note: string | null;
          metadata_source: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          channel_id: string;
          title?: string;
          description?: string;
          tags?: string[];
          file_path?: string | null;
          file_name?: string | null;
          file_size_bytes?: number | null;
          duration_seconds?: number | null;
          status?: string;
          slot_at?: string | null;
          visibility?: string;
          playlist?: string | null;
          made_for_kids?: boolean;
          allow_comments?: boolean;
          trend_score?: number | null;
          trend_note?: string | null;
          metadata_source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["shorts"]["Insert"]>;
        Relationships: [];
      };
      short_alt_titles: {
        Row: {
          id: string;
          short_id: string;
          text: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          short_id: string;
          text: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["short_alt_titles"]["Insert"]
        >;
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string;
          short_id: string;
          author: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          short_id: string;
          author: string;
          body: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reviews"]["Insert"]>;
        Relationships: [];
      };
      upload_runs: {
        Row: {
          id: string;
          short_id: string;
          state: string;
          progress_pct: number | null;
          attempted_at: string;
          error_message: string | null;
        };
        Insert: {
          id?: string;
          short_id: string;
          state: string;
          progress_pct?: number | null;
          attempted_at?: string;
          error_message?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["upload_runs"]["Insert"]>;
        Relationships: [];
      };
      import_batches: {
        Row: {
          id: string;
          channel_id: string | null;
          spread_days: number;
          ai_draft: boolean;
          send_for_review: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          channel_id?: string | null;
          spread_days?: number;
          ai_draft?: boolean;
          send_for_review?: boolean;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["import_batches"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

export type Channel = Database["public"]["Tables"]["channels"]["Row"];
export type Short = Database["public"]["Tables"]["shorts"]["Row"];
export type ShortAltTitle =
  Database["public"]["Tables"]["short_alt_titles"]["Row"];
export type Review = Database["public"]["Tables"]["reviews"]["Row"];
export type UploadRun = Database["public"]["Tables"]["upload_runs"]["Row"];
export type ImportBatch =
  Database["public"]["Tables"]["import_batches"]["Row"];

export type ShortStatus =
  | "draft"
  | "needs_review"
  | "approved"
  | "scheduled"
  | "live"
  | "failed";
