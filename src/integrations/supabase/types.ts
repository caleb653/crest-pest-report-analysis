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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      admin_sessions: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          is_valid: boolean | null
          session_token: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          is_valid?: boolean | null
          session_token: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          is_valid?: boolean | null
          session_token?: string
        }
        Relationships: []
      }
      fieldroutes_write_queue: {
        Row: {
          action: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          endpoint: string
          entity: string
          error: string | null
          id: string
          payload: Json
          requested_at: string
          requested_by: string | null
          result: Json | null
          status: string
          summary: string | null
        }
        Insert: {
          action: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          endpoint: string
          entity: string
          error?: string | null
          id?: string
          payload: Json
          requested_at?: string
          requested_by?: string | null
          result?: Json | null
          status?: string
          summary?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          endpoint?: string
          entity?: string
          error?: string | null
          id?: string
          payload?: Json
          requested_at?: string
          requested_by?: string | null
          result?: Json | null
          status?: string
          summary?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          notification_type: string
          recipient_name: string | null
          recipient_username: string | null
          related_message_id: string | null
          related_property_id: string | null
          related_request_id: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          notification_type?: string
          recipient_name?: string | null
          recipient_username?: string | null
          related_message_id?: string | null
          related_property_id?: string | null
          related_request_id?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          notification_type?: string
          recipient_name?: string | null
          recipient_username?: string | null
          related_message_id?: string | null
          related_property_id?: string | null
          related_request_id?: string | null
          title?: string
        }
        Relationships: []
      }
      portal_clients: {
        Row: {
          auto_generate_reports: boolean
          company: string | null
          created_at: string
          email: string | null
          fieldroutes_customer_id: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          auto_generate_reports?: boolean
          company?: string | null
          created_at?: string
          email?: string | null
          fieldroutes_customer_id?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          auto_generate_reports?: boolean
          company?: string | null
          created_at?: string
          email?: string | null
          fieldroutes_customer_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      portal_conditions: {
        Row: {
          action: string | null
          closed_at: string | null
          condition: string
          created_at: string
          detail: string | null
          id: string
          identified_at: string
          identified_by: string | null
          location: string
          photos: Json
          property_id: string
          resolution_note: string | null
          resolution_photos: Json
          responsibility: string
          service_id: string | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          action?: string | null
          closed_at?: string | null
          condition?: string
          created_at?: string
          detail?: string | null
          id?: string
          identified_at?: string
          identified_by?: string | null
          location?: string
          photos?: Json
          property_id: string
          resolution_note?: string | null
          resolution_photos?: Json
          responsibility?: string
          service_id?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          action?: string | null
          closed_at?: string | null
          condition?: string
          created_at?: string
          detail?: string | null
          id?: string
          identified_at?: string
          identified_by?: string | null
          location?: string
          photos?: Json
          property_id?: string
          resolution_note?: string | null
          resolution_photos?: Json
          responsibility?: string
          service_id?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_conditions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "portal_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_conditions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "portal_services"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_documents: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          file_name: string | null
          file_type: string | null
          file_url: string
          id: string
          property_id: string
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_type?: string | null
          file_url: string
          id?: string
          property_id: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string
          id?: string
          property_id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      portal_links: {
        Row: {
          assigned_property_ids: Json | null
          client_id: string
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          link_type: string
          token: string
          unit_number: string | null
          updated_at: string
        }
        Insert: {
          assigned_property_ids?: Json | null
          client_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          link_type?: string
          token?: string
          unit_number?: string | null
          updated_at?: string
        }
        Update: {
          assigned_property_ids?: Json | null
          client_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          link_type?: string
          token?: string
          unit_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "portal_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_messages: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          is_read: boolean
          link_id: string | null
          message: string
          property_name: string | null
          related_service_date: string | null
          related_unit: string | null
          sender_email: string | null
          sender_name: string
          sender_type: string
          subject: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link_id?: string | null
          message: string
          property_name?: string | null
          related_service_date?: string | null
          related_unit?: string | null
          sender_email?: string | null
          sender_name: string
          sender_type?: string
          subject: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link_id?: string | null
          message?: string
          property_name?: string | null
          related_service_date?: string | null
          related_unit?: string | null
          sender_email?: string | null
          sender_name?: string
          sender_type?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "portal_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_messages_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "portal_links"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_prep_sheets: {
        Row: {
          created_at: string
          description: string | null
          file_url: string | null
          id: string
          title: string
          treatment_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_url?: string | null
          id?: string
          title: string
          treatment_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_url?: string | null
          id?: string
          title?: string
          treatment_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      portal_properties: {
        Row: {
          address: string | null
          archived_at: string | null
          client_id: string
          created_at: string
          customer_preferences: Json | null
          equipment: Json | null
          id: string
          image_url: string | null
          map_data: Json | null
          map_image_url: string | null
          name: string
          notes: string | null
          owner_tech: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          client_id: string
          created_at?: string
          customer_preferences?: Json | null
          equipment?: Json | null
          id?: string
          image_url?: string | null
          map_data?: Json | null
          map_image_url?: string | null
          name: string
          notes?: string | null
          owner_tech?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          client_id?: string
          created_at?: string
          customer_preferences?: Json | null
          equipment?: Json | null
          id?: string
          image_url?: string | null
          map_data?: Json | null
          map_image_url?: string | null
          name?: string
          notes?: string | null
          owner_tech?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_properties_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "portal_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_quarterly_updates: {
        Row: {
          comment: string | null
          created_at: string
          file_name: string | null
          id: string
          property_id: string
          title: string | null
          updated_at: string
          uploaded_by: string | null
          video_url: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          property_id: string
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
          video_url?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          property_id?: string
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      portal_requests: {
        Row: {
          closed_at: string | null
          created_at: string
          crest_comments: Json
          description: string
          id: string
          link_id: string | null
          location_type: string | null
          occupancy_status: string | null
          pest_type: string | null
          photos: Json
          preferred_date: string | null
          prep_sheet_id: string | null
          property_id: string
          request_type: string
          resolved_service_id: string | null
          response_notes: string | null
          right_to_treat_requested: boolean
          right_to_treat_signature: string | null
          right_to_treat_signed_at: string | null
          right_to_treat_signer_name: string | null
          right_to_treat_token: string | null
          sighting_status: string | null
          status: string
          tenant_email: string | null
          tenant_email_sent_at: string | null
          unit_number: string | null
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          crest_comments?: Json
          description: string
          id?: string
          link_id?: string | null
          location_type?: string | null
          occupancy_status?: string | null
          pest_type?: string | null
          photos?: Json
          preferred_date?: string | null
          prep_sheet_id?: string | null
          property_id: string
          request_type?: string
          resolved_service_id?: string | null
          response_notes?: string | null
          right_to_treat_requested?: boolean
          right_to_treat_signature?: string | null
          right_to_treat_signed_at?: string | null
          right_to_treat_signer_name?: string | null
          right_to_treat_token?: string | null
          sighting_status?: string | null
          status?: string
          tenant_email?: string | null
          tenant_email_sent_at?: string | null
          unit_number?: string | null
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          crest_comments?: Json
          description?: string
          id?: string
          link_id?: string | null
          location_type?: string | null
          occupancy_status?: string | null
          pest_type?: string | null
          photos?: Json
          preferred_date?: string | null
          prep_sheet_id?: string | null
          property_id?: string
          request_type?: string
          resolved_service_id?: string | null
          response_notes?: string | null
          right_to_treat_requested?: boolean
          right_to_treat_signature?: string | null
          right_to_treat_signed_at?: string | null
          right_to_treat_signer_name?: string | null
          right_to_treat_token?: string | null
          sighting_status?: string | null
          status?: string
          tenant_email?: string | null
          tenant_email_sent_at?: string | null
          unit_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_requests_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "portal_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "portal_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_requests_resolved_service_id_fkey"
            columns: ["resolved_service_id"]
            isOneToOne: false
            referencedRelation: "portal_services"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_services: {
        Row: {
          appointment_service: string | null
          attachments: Json
          created_at: string
          findings: string | null
          follow_up_notes: string | null
          follow_up_recommended: boolean | null
          frequency_days: number | null
          id: string
          notes: string | null
          office_notes: string | null
          photos: Json | null
          prep_notes: string | null
          prep_required: boolean | null
          products_used: Json | null
          property_id: string
          report_data: Json | null
          scheduling_status: string | null
          service_date: string | null
          service_time: string | null
          service_type: string
          special_notes: string | null
          status: string
          summary: string | null
          technician: string | null
          unit_details: Json | null
          units_planned: Json | null
          updated_at: string
        }
        Insert: {
          appointment_service?: string | null
          attachments?: Json
          created_at?: string
          findings?: string | null
          follow_up_notes?: string | null
          follow_up_recommended?: boolean | null
          frequency_days?: number | null
          id?: string
          notes?: string | null
          office_notes?: string | null
          photos?: Json | null
          prep_notes?: string | null
          prep_required?: boolean | null
          products_used?: Json | null
          property_id: string
          report_data?: Json | null
          scheduling_status?: string | null
          service_date?: string | null
          service_time?: string | null
          service_type: string
          special_notes?: string | null
          status?: string
          summary?: string | null
          technician?: string | null
          unit_details?: Json | null
          units_planned?: Json | null
          updated_at?: string
        }
        Update: {
          appointment_service?: string | null
          attachments?: Json
          created_at?: string
          findings?: string | null
          follow_up_notes?: string | null
          follow_up_recommended?: boolean | null
          frequency_days?: number | null
          id?: string
          notes?: string | null
          office_notes?: string | null
          photos?: Json | null
          prep_notes?: string | null
          prep_required?: boolean | null
          products_used?: Json | null
          property_id?: string
          report_data?: Json | null
          scheduling_status?: string | null
          service_date?: string | null
          service_time?: string | null
          service_type?: string
          special_notes?: string | null
          status?: string
          summary?: string | null
          technician?: string | null
          unit_details?: Json | null
          units_planned?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_services_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "portal_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_survey_responses: {
        Row: {
          answers: Json
          created_at: string
          id: string
          property_id: string
          recipient_email: string | null
          respondent_name: string | null
          submitted_at: string | null
          survey_id: string
          token: string
          unit_number: string | null
        }
        Insert: {
          answers?: Json
          created_at?: string
          id?: string
          property_id: string
          recipient_email?: string | null
          respondent_name?: string | null
          submitted_at?: string | null
          survey_id: string
          token?: string
          unit_number?: string | null
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          property_id?: string
          recipient_email?: string | null
          respondent_name?: string | null
          submitted_at?: string | null
          survey_id?: string
          token?: string
          unit_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "portal_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_surveys: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          id: string
          intro: string | null
          property_id: string
          questions: Json
          recipient_emails: Json
          sent_at: string | null
          sent_count: number
          title: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          intro?: string | null
          property_id: string
          questions?: Json
          recipient_emails?: Json
          sent_at?: string | null
          sent_count?: number
          title?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          intro?: string | null
          property_id?: string
          questions?: Json
          recipient_emails?: Json
          sent_at?: string | null
          sent_count?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      regional_managers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          property_ids: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          property_ids?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          property_ids?: Json
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          address: string | null
          created_at: string | null
          created_by: string | null
          custom_map_url: string | null
          customer_email: string | null
          customer_key_areas: Json | null
          customer_name: string | null
          customer_phone: string | null
          customer_preferences: Json | null
          customer_signature: string | null
          equipment: Json | null
          fieldroutes_appointment_id: string | null
          fieldroutes_customer_id: string | null
          findings: Json | null
          id: string
          license_number: string | null
          map_data: Json | null
          map_url: string | null
          next_steps: Json | null
          notes: string | null
          products_used: Json | null
          property_images: Json | null
          recommendations: Json | null
          rendered_map_url: string | null
          report_title: string | null
          screenshots: Json | null
          sent_to_customer_at: string | null
          service_date: string | null
          services: Json | null
          target_pests: Json | null
          technician_name: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_map_url?: string | null
          customer_email?: string | null
          customer_key_areas?: Json | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_preferences?: Json | null
          customer_signature?: string | null
          equipment?: Json | null
          fieldroutes_appointment_id?: string | null
          fieldroutes_customer_id?: string | null
          findings?: Json | null
          id?: string
          license_number?: string | null
          map_data?: Json | null
          map_url?: string | null
          next_steps?: Json | null
          notes?: string | null
          products_used?: Json | null
          property_images?: Json | null
          recommendations?: Json | null
          rendered_map_url?: string | null
          report_title?: string | null
          screenshots?: Json | null
          sent_to_customer_at?: string | null
          service_date?: string | null
          services?: Json | null
          target_pests?: Json | null
          technician_name: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_map_url?: string | null
          customer_email?: string | null
          customer_key_areas?: Json | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_preferences?: Json | null
          customer_signature?: string | null
          equipment?: Json | null
          fieldroutes_appointment_id?: string | null
          fieldroutes_customer_id?: string | null
          findings?: Json | null
          id?: string
          license_number?: string | null
          map_data?: Json | null
          map_url?: string | null
          next_steps?: Json | null
          notes?: string | null
          products_used?: Json | null
          property_images?: Json | null
          recommendations?: Json | null
          rendered_map_url?: string | null
          report_title?: string | null
          screenshots?: Json | null
          sent_to_customer_at?: string | null
          service_date?: string | null
          services?: Json | null
          target_pests?: Json | null
          technician_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      scheduling_audit_log: {
        Row: {
          created_at: string
          error_code: string | null
          function_name: string
          id: string
          ip_address: string | null
          payload: Json | null
          staff_name: string | null
          success: boolean
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          function_name: string
          id?: string
          ip_address?: string | null
          payload?: Json | null
          staff_name?: string | null
          success: boolean
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          error_code?: string | null
          function_name?: string
          id?: string
          ip_address?: string | null
          payload?: Json | null
          staff_name?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      team_documents: {
        Row: {
          created_at: string
          document_type: string
          employee_name: string
          employee_printed_name: string | null
          employee_signature: string | null
          employee_signed_date: string | null
          form_data: Json | null
          form_date: string | null
          id: string
          job_title: string | null
          representative_name: string | null
          representative_signature: string | null
          representative_signed_date: string | null
          representative_title: string | null
          updated_at: string
          work_location: string | null
        }
        Insert: {
          created_at?: string
          document_type?: string
          employee_name: string
          employee_printed_name?: string | null
          employee_signature?: string | null
          employee_signed_date?: string | null
          form_data?: Json | null
          form_date?: string | null
          id?: string
          job_title?: string | null
          representative_name?: string | null
          representative_signature?: string | null
          representative_signed_date?: string | null
          representative_title?: string | null
          updated_at?: string
          work_location?: string | null
        }
        Update: {
          created_at?: string
          document_type?: string
          employee_name?: string
          employee_printed_name?: string | null
          employee_signature?: string | null
          employee_signed_date?: string | null
          form_data?: Json | null
          form_date?: string | null
          id?: string
          job_title?: string | null
          representative_name?: string | null
          representative_signature?: string | null
          representative_signed_date?: string | null
          representative_title?: string | null
          updated_at?: string
          work_location?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_reports_summary: {
        Args: never
        Returns: {
          address: string
          created_at: string
          customer_name: string
          has_signature: boolean
          id: string
          next_steps: Json
          notes_head: string
          report_format: string
          sent_to_customer_at: string
          services: Json
          technician_name: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "technician"
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
      app_role: ["admin", "technician"],
    },
  },
} as const
