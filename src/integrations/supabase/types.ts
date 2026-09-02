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
      exports: {
        Row: {
          created_at: string
          error_message: string | null
          file_name: string | null
          file_path: string | null
          format: string
          id: string
          status: string
          tailored_resume_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          file_name?: string | null
          file_path?: string | null
          format?: string
          id?: string
          status?: string
          tailored_resume_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          file_name?: string | null
          file_path?: string | null
          format?: string
          id?: string
          status?: string
          tailored_resume_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exports_tailored_resume_id_fkey"
            columns: ["tailored_resume_id"]
            isOneToOne: false
            referencedRelation: "tailored_resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      job_requirements: {
        Row: {
          aliases: string[]
          canonical_skill: string | null
          created_at: string
          id: string
          importance: string | null
          job_id: string
          keywords: string[]
          related_skills: string[]
          requirement: string
          requirement_type: string | null
          sort_order: number
          user_id: string
        }
        Insert: {
          aliases?: string[]
          canonical_skill?: string | null
          created_at?: string
          id?: string
          importance?: string | null
          job_id: string
          keywords?: string[]
          related_skills?: string[]
          requirement: string
          requirement_type?: string | null
          sort_order?: number
          user_id: string
        }
        Update: {
          aliases?: string[]
          canonical_skill?: string | null
          created_at?: string
          id?: string
          importance?: string | null
          job_id?: string
          keywords?: string[]
          related_skills?: string[]
          requirement?: string
          requirement_type?: string | null
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_requirements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          analysis_status: string
          company: string | null
          created_at: string
          description: string | null
          employment_type: string | null
          error_message: string | null
          id: string
          keywords: string[]
          location: string | null
          raw_text: string | null
          seniority: string | null
          source_url: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_status?: string
          company?: string | null
          created_at?: string
          description?: string | null
          employment_type?: string | null
          error_message?: string | null
          id?: string
          keywords?: string[]
          location?: string | null
          raw_text?: string | null
          seniority?: string | null
          source_url?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_status?: string
          company?: string | null
          created_at?: string
          description?: string | null
          employment_type?: string | null
          error_message?: string | null
          id?: string
          keywords?: string[]
          location?: string | null
          raw_text?: string | null
          seniority?: string | null
          source_url?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      master_resumes: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          status: string
          summary: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      match_results: {
        Row: {
          coverage: string | null
          created_at: string
          id: string
          job_id: string
          job_requirement_id: string | null
          rationale: string | null
          resume_evidence_id: string | null
          score: number | null
          user_id: string
        }
        Insert: {
          coverage?: string | null
          created_at?: string
          id?: string
          job_id: string
          job_requirement_id?: string | null
          rationale?: string | null
          resume_evidence_id?: string | null
          score?: number | null
          user_id: string
        }
        Update: {
          coverage?: string | null
          created_at?: string
          id?: string
          job_id?: string
          job_requirement_id?: string | null
          rationale?: string | null
          resume_evidence_id?: string | null
          score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_results_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_job_requirement_id_fkey"
            columns: ["job_requirement_id"]
            isOneToOne: false
            referencedRelation: "job_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_resume_evidence_id_fkey"
            columns: ["resume_evidence_id"]
            isOneToOne: false
            referencedRelation: "resume_evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          github_url: string | null
          headline: string | null
          id: string
          linkedin_url: string | null
          location: string | null
          phone: string | null
          portfolio_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          github_url?: string | null
          headline?: string | null
          id: string
          linkedin_url?: string | null
          location?: string | null
          phone?: string | null
          portfolio_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          github_url?: string | null
          headline?: string | null
          id?: string
          linkedin_url?: string | null
          location?: string | null
          phone?: string | null
          portfolio_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      resume_evidence: {
        Row: {
          category: string
          content: string
          created_at: string
          end_date: string | null
          evidence_kind: string
          id: string
          location: string | null
          master_resume_id: string
          metrics: Json
          organization: string | null
          resume_import_id: string | null
          resume_item_bullet_id: string | null
          resume_item_id: string | null
          role: string | null
          skills: string[]
          sort_order: number
          source_page: number | null
          source_reference: string | null
          start_date: string | null
          title: string | null
          updated_at: string
          user_id: string
          verified: boolean
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          end_date?: string | null
          evidence_kind?: string
          id?: string
          location?: string | null
          master_resume_id: string
          metrics?: Json
          organization?: string | null
          resume_import_id?: string | null
          resume_item_bullet_id?: string | null
          resume_item_id?: string | null
          role?: string | null
          skills?: string[]
          sort_order?: number
          source_page?: number | null
          source_reference?: string | null
          start_date?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
          verified?: boolean
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          end_date?: string | null
          evidence_kind?: string
          id?: string
          location?: string | null
          master_resume_id?: string
          metrics?: Json
          organization?: string | null
          resume_import_id?: string | null
          resume_item_bullet_id?: string | null
          resume_item_id?: string | null
          role?: string | null
          skills?: string[]
          sort_order?: number
          source_page?: number | null
          source_reference?: string | null
          start_date?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "resume_evidence_master_resume_id_fkey"
            columns: ["master_resume_id"]
            isOneToOne: false
            referencedRelation: "master_resumes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_evidence_resume_import_id_fkey"
            columns: ["resume_import_id"]
            isOneToOne: false
            referencedRelation: "resume_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_evidence_resume_item_bullet_id_fkey"
            columns: ["resume_item_bullet_id"]
            isOneToOne: false
            referencedRelation: "resume_item_bullets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_evidence_resume_item_id_fkey"
            columns: ["resume_item_id"]
            isOneToOne: false
            referencedRelation: "resume_items"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_import_items: {
        Row: {
          bullets: Json
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          location: string | null
          merged_resume_item_id: string | null
          organization: string | null
          resume_import_id: string
          role: string | null
          section: string
          skills: string[]
          sort_order: number
          start_date: string | null
          status: string
          title: string | null
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          bullets?: Json
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          merged_resume_item_id?: string | null
          organization?: string | null
          resume_import_id: string
          role?: string | null
          section: string
          skills?: string[]
          sort_order?: number
          start_date?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          bullets?: Json
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          merged_resume_item_id?: string | null
          organization?: string | null
          resume_import_id?: string
          role?: string | null
          section?: string
          skills?: string[]
          sort_order?: number
          start_date?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_import_items_merged_resume_item_id_fkey"
            columns: ["merged_resume_item_id"]
            isOneToOne: false
            referencedRelation: "resume_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_import_items_resume_import_id_fkey"
            columns: ["resume_import_id"]
            isOneToOne: false
            referencedRelation: "resume_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_imports: {
        Row: {
          created_at: string
          error_message: string | null
          file_name: string
          file_path: string | null
          file_size: number | null
          id: string
          master_resume_id: string | null
          mime_type: string | null
          page_count: number | null
          parsed_at: string | null
          parsed_profile: Json
          parsed_summary: string | null
          profile_status: string
          raw_text: string | null
          status: string
          summary_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          file_name: string
          file_path?: string | null
          file_size?: number | null
          id?: string
          master_resume_id?: string | null
          mime_type?: string | null
          page_count?: number | null
          parsed_at?: string | null
          parsed_profile?: Json
          parsed_summary?: string | null
          profile_status?: string
          raw_text?: string | null
          status?: string
          summary_status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          file_name?: string
          file_path?: string | null
          file_size?: number | null
          id?: string
          master_resume_id?: string | null
          mime_type?: string | null
          page_count?: number | null
          parsed_at?: string | null
          parsed_profile?: Json
          parsed_summary?: string | null
          profile_status?: string
          raw_text?: string | null
          status?: string
          summary_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_imports_master_resume_id_fkey"
            columns: ["master_resume_id"]
            isOneToOne: false
            referencedRelation: "master_resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_item_bullets: {
        Row: {
          content: string
          created_at: string
          id: string
          resume_item_id: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          resume_item_id: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          resume_item_id?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_item_bullets_resume_item_id_fkey"
            columns: ["resume_item_id"]
            isOneToOne: false
            referencedRelation: "resume_items"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_items: {
        Row: {
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          location: string | null
          master_resume_id: string
          organization: string | null
          resume_import_id: string | null
          role: string | null
          section: string
          skills: string[]
          sort_order: number
          start_date: string | null
          title: string | null
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          master_resume_id: string
          organization?: string | null
          resume_import_id?: string | null
          role?: string | null
          section: string
          skills?: string[]
          sort_order?: number
          start_date?: string | null
          title?: string | null
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          master_resume_id?: string
          organization?: string | null
          resume_import_id?: string | null
          role?: string | null
          section?: string
          skills?: string[]
          sort_order?: number
          start_date?: string | null
          title?: string | null
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_items_master_resume_id_fkey"
            columns: ["master_resume_id"]
            isOneToOne: false
            referencedRelation: "master_resumes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_items_resume_import_id_fkey"
            columns: ["resume_import_id"]
            isOneToOne: false
            referencedRelation: "resume_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      tailored_resume_item_sources: {
        Row: {
          confidence: number | null
          created_at: string
          excerpt: string | null
          id: string
          resume_evidence_id: string
          support_type: string
          tailored_resume_item_id: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          excerpt?: string | null
          id?: string
          resume_evidence_id: string
          support_type?: string
          tailored_resume_item_id: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          excerpt?: string | null
          id?: string
          resume_evidence_id?: string
          support_type?: string
          tailored_resume_item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tailored_resume_item_sources_resume_evidence_id_fkey"
            columns: ["resume_evidence_id"]
            isOneToOne: false
            referencedRelation: "resume_evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tailored_resume_item_sources_tailored_resume_item_id_fkey"
            columns: ["tailored_resume_item_id"]
            isOneToOne: false
            referencedRelation: "tailored_resume_items"
            referencedColumns: ["id"]
          },
        ]
      }
      tailored_resume_items: {
        Row: {
          created_at: string
          heading: string | null
          id: string
          is_evidence_backed: boolean
          section: string
          sort_order: number
          statement: string
          tailored_resume_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          heading?: string | null
          id?: string
          is_evidence_backed?: boolean
          section: string
          sort_order?: number
          statement: string
          tailored_resume_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          heading?: string | null
          id?: string
          is_evidence_backed?: boolean
          section?: string
          sort_order?: number
          statement?: string
          tailored_resume_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tailored_resume_items_tailored_resume_id_fkey"
            columns: ["tailored_resume_id"]
            isOneToOne: false
            referencedRelation: "tailored_resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      tailored_resumes: {
        Row: {
          created_at: string
          evidence_coverage: number | null
          id: string
          job_id: string | null
          master_resume_id: string | null
          match_score: number | null
          notes: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          evidence_coverage?: number | null
          id?: string
          job_id?: string | null
          master_resume_id?: string | null
          match_score?: number | null
          notes?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          evidence_coverage?: number | null
          id?: string
          job_id?: string | null
          master_resume_id?: string | null
          match_score?: number | null
          notes?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tailored_resumes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tailored_resumes_master_resume_id_fkey"
            columns: ["master_resume_id"]
            isOneToOne: false
            referencedRelation: "master_resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      validation_results: {
        Row: {
          check_type: string
          created_at: string
          id: string
          message: string | null
          passed: boolean
          severity: string
          tailored_resume_id: string
          tailored_resume_item_id: string | null
          user_id: string
        }
        Insert: {
          check_type: string
          created_at?: string
          id?: string
          message?: string | null
          passed?: boolean
          severity?: string
          tailored_resume_id: string
          tailored_resume_item_id?: string | null
          user_id: string
        }
        Update: {
          check_type?: string
          created_at?: string
          id?: string
          message?: string | null
          passed?: boolean
          severity?: string
          tailored_resume_id?: string
          tailored_resume_item_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "validation_results_tailored_resume_id_fkey"
            columns: ["tailored_resume_id"]
            isOneToOne: false
            referencedRelation: "tailored_resumes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_results_tailored_resume_item_id_fkey"
            columns: ["tailored_resume_item_id"]
            isOneToOne: false
            referencedRelation: "tailored_resume_items"
            referencedColumns: ["id"]
          },
        ]
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
    Enums: {},
  },
} as const
