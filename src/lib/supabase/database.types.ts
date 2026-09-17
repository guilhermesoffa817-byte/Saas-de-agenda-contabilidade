/**
 * Tipos do banco no formato do gerador do Supabase.
 *
 * Quando o projeto da nuvem estiver ligado (`npx supabase link`), regere com:
 *   npm run db:types
 * Até lá este arquivo acompanha as migrações de supabase/migrations à mão.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          segment: string;
          tax_regime: Database["public"]["Enums"]["tax_regime"];
          document: string | null;
          opened_on: string | null;
          timezone: string;
          city: string | null;
          state: string | null;
          pix_key: string | null;
          plan: string;
          subscription_status: string;
          trial_ends_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          segment?: string;
          tax_regime?: Database["public"]["Enums"]["tax_regime"];
          document?: string | null;
          opened_on?: string | null;
          timezone?: string;
          city?: string | null;
          state?: string | null;
          pix_key?: string | null;
          plan?: string;
          subscription_status?: string;
          trial_ends_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          segment?: string;
          tax_regime?: Database["public"]["Enums"]["tax_regime"];
          document?: string | null;
          opened_on?: string | null;
          timezone?: string;
          city?: string | null;
          state?: string | null;
          pix_key?: string | null;
          plan?: string;
          subscription_status?: string;
          trial_ends_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          organization_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["member_role"];
          display_name: string | null;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["member_role"];
          display_name?: string | null;
          created_at?: string;
        };
        Update: {
          organization_id?: string;
          user_id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          display_name?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_invites: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role: Database["public"]["Enums"]["member_role"];
          token: string;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          role: Database["public"]["Enums"]["member_role"];
          token?: string;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          role?: Database["public"]["Enums"]["member_role"];
          token?: string;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_invites_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: number;
          organization_id: string;
          user_id: string | null;
          action: string;
          entity: string | null;
          entity_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: never;
          organization_id: string;
          user_id?: string | null;
          action: string;
          entity?: string | null;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: never;
          organization_id?: string;
          user_id?: string | null;
          action?: string;
          entity?: string | null;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      professionals: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string | null;
          name: string;
          color: string;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id?: string | null;
          name: string;
          color?: string;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string | null;
          name?: string;
          color?: string;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "professionals_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          duration_min: number;
          buffer_min: number;
          price_cents: number;
          bookable_online: boolean;
          active: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          duration_min: number;
          buffer_min?: number;
          price_cents: number;
          bookable_online?: boolean;
          active?: boolean;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          duration_min?: number;
          buffer_min?: number;
          price_cents?: number;
          bookable_online?: boolean;
          active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "services_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          phone_e164: string | null;
          email: string | null;
          document: string | null;
          payer_type: string;
          whatsapp_opt_in: boolean;
          whatsapp_opt_in_at: string | null;
          notes: string | null;
          no_show_count: number;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          phone_e164?: string | null;
          email?: string | null;
          document?: string | null;
          payer_type?: string;
          whatsapp_opt_in?: boolean;
          whatsapp_opt_in_at?: string | null;
          notes?: string | null;
          no_show_count?: number;
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          phone_e164?: string | null;
          email?: string | null;
          document?: string | null;
          payer_type?: string;
          whatsapp_opt_in?: boolean;
          whatsapp_opt_in_at?: string | null;
          notes?: string | null;
          no_show_count?: number;
          created_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      working_hours: {
        Row: {
          id: string;
          organization_id: string;
          professional_id: string;
          weekday: number;
          start_time: string;
          end_time: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          professional_id: string;
          weekday: number;
          start_time: string;
          end_time: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          professional_id?: string;
          weekday?: number;
          start_time?: string;
          end_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "working_hours_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id"];
          },
        ];
      };
      time_off: {
        Row: {
          id: string;
          organization_id: string;
          professional_id: string;
          starts_at: string;
          ends_at: string;
          reason: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          professional_id: string;
          starts_at: string;
          ends_at: string;
          reason?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          professional_id?: string;
          starts_at?: string;
          ends_at?: string;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "time_off_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          id: string;
          organization_id: string;
          professional_id: string;
          client_id: string;
          service_id: string;
          starts_at: string;
          ends_at: string;
          status: Database["public"]["Enums"]["appointment_status"];
          price_cents: number;
          source: string;
          confirmed_at: string | null;
          reminder_sent_at: string | null;
          cancel_reason: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          professional_id: string;
          client_id: string;
          service_id: string;
          starts_at: string;
          ends_at: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          price_cents: number;
          source?: string;
          confirmed_at?: string | null;
          reminder_sent_at?: string | null;
          cancel_reason?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          professional_id?: string;
          client_id?: string;
          service_id?: string;
          starts_at?: string;
          ends_at?: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          price_cents?: number;
          source?: string;
          confirmed_at?: string | null;
          reminder_sent_at?: string | null;
          cancel_reason?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      accept_invite: {
        Args: { p_token: string };
        Returns: string;
      };
      create_organization: {
        Args: {
          p_name: string;
          p_slug: string;
          p_segment: string;
          p_tax_regime: Database["public"]["Enums"]["tax_regime"];
          p_timezone: string;
        };
        Returns: string;
      };
    };
    Enums: {
      appointment_status: "agendado" | "confirmado" | "concluido" | "faltou" | "cancelado";
      member_role: "dono" | "profissional" | "recepcao" | "contador";
      tax_regime: "pf_autonomo" | "mei" | "simples_nacional" | "outro";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
