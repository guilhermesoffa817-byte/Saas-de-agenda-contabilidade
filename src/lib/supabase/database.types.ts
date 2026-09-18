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
          asaas_customer_id: string | null;
          asaas_subscription_id: string | null;
          billing_cycle: string | null;
          pending_plan: string | null;
          referred_by_accountant: string | null;
          past_due_since: string | null;
          canceled_at: string | null;
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
          asaas_customer_id?: string | null;
          asaas_subscription_id?: string | null;
          billing_cycle?: string | null;
          pending_plan?: string | null;
          referred_by_accountant?: string | null;
          past_due_since?: string | null;
          canceled_at?: string | null;
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
          asaas_customer_id?: string | null;
          asaas_subscription_id?: string | null;
          billing_cycle?: string | null;
          pending_plan?: string | null;
          referred_by_accountant?: string | null;
          past_due_since?: string | null;
          canceled_at?: string | null;
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
          ical_token: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id?: string | null;
          name: string;
          color?: string;
          active?: boolean;
          ical_token?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string | null;
          name?: string;
          color?: string;
          active?: boolean;
          ical_token?: string;
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
      accounts: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          type: string;
          accounting_code: string | null;
          active: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          type?: string;
          accounting_code?: string | null;
          active?: boolean;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          type?: string;
          accounting_code?: string | null;
          active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "accounts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          kind: Database["public"]["Enums"]["tx_kind"];
          report_group: string;
          deductible_hint: boolean;
          accounting_code: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          kind: Database["public"]["Enums"]["tx_kind"];
          report_group?: string;
          deductible_hint?: boolean;
          accounting_code?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          kind?: Database["public"]["Enums"]["tx_kind"];
          report_group?: string;
          deductible_hint?: boolean;
          accounting_code?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "categories_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      document_requests: {
        Row: {
          id: string;
          organization_id: string;
          transaction_id: string | null;
          requested_by: string | null;
          message: string;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          transaction_id?: string | null;
          requested_by?: string | null;
          message: string;
          resolved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          transaction_id?: string | null;
          requested_by?: string | null;
          message?: string;
          resolved_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      export_templates: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          columns: string[];
          separator: string;
          date_format: string;
          decimal_comma: boolean;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name?: string;
          columns?: string[];
          separator?: string;
          date_format?: string;
          decimal_comma?: boolean;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          columns?: string[];
          separator?: string;
          date_format?: string;
          decimal_comma?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "export_templates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      monthly_closings: {
        Row: {
          id: string;
          organization_id: string;
          month: string;
          closed_at: string;
          closed_by: string | null;
          reopened_at: string | null;
          totals: Json;
          package_path: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          month: string;
          closed_at?: string;
          closed_by?: string | null;
          reopened_at?: string | null;
          totals?: Json;
          package_path?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          month?: string;
          closed_at?: string;
          closed_by?: string | null;
          reopened_at?: string | null;
          totals?: Json;
          package_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "monthly_closings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          id: string;
          organization_id: string;
          kind: Database["public"]["Enums"]["tx_kind"];
          status: Database["public"]["Enums"]["tx_status"];
          description: string;
          amount_cents: number;
          competence_date: string;
          due_date: string | null;
          paid_at: string | null;
          payment_method: Database["public"]["Enums"]["payment_method"] | null;
          category_id: string | null;
          account_id: string | null;
          appointment_id: string | null;
          client_id: string | null;
          payer_type: string | null;
          revenue_type: string;
          nota_fiscal_emitida: boolean;
          receita_saude_emitido: boolean;
          attachment_path: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          kind: Database["public"]["Enums"]["tx_kind"];
          status?: Database["public"]["Enums"]["tx_status"];
          description: string;
          amount_cents: number;
          competence_date: string;
          due_date?: string | null;
          paid_at?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          category_id?: string | null;
          account_id?: string | null;
          appointment_id?: string | null;
          client_id?: string | null;
          payer_type?: string | null;
          revenue_type?: string;
          nota_fiscal_emitida?: boolean;
          receita_saude_emitido?: boolean;
          attachment_path?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          kind?: Database["public"]["Enums"]["tx_kind"];
          status?: Database["public"]["Enums"]["tx_status"];
          description?: string;
          amount_cents?: number;
          competence_date?: string;
          due_date?: string | null;
          paid_at?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          category_id?: string | null;
          account_id?: string | null;
          appointment_id?: string | null;
          client_id?: string | null;
          payer_type?: string | null;
          revenue_type?: string;
          nota_fiscal_emitida?: boolean;
          receita_saude_emitido?: boolean;
          attachment_path?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: true;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_events: {
        Row: {
          id: string;
          type: string;
          payload: Json;
          received_at: string;
        };
        Insert: {
          id: string;
          type: string;
          payload: Json;
          received_at?: string;
        };
        Update: {
          id?: string;
          type?: string;
          payload?: Json;
          received_at?: string;
        };
        Relationships: [];
      };
      booking_attempts: {
        Row: {
          id: number;
          organization_id: string | null;
          ip_hash: string;
          phone_e164: string | null;
          sucesso: boolean;
          created_at: string;
        };
        Insert: {
          id?: never;
          organization_id?: string | null;
          ip_hash: string;
          phone_e164?: string | null;
          sucesso?: boolean;
          created_at?: string;
        };
        Update: {
          id?: never;
          organization_id?: string | null;
          ip_hash?: string;
          phone_e164?: string | null;
          sucesso?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booking_attempts_organization_id_fkey";
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
      auth_attempts: {
        Row: {
          id: number;
          kind: string;
          email_hash: string | null;
          ip_hash: string | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          kind: string;
          email_hash?: string | null;
          ip_hash?: string | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          kind?: string;
          email_hash?: string | null;
          ip_hash?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      message_logs: {
        Row: {
          id: number;
          organization_id: string;
          appointment_id: string | null;
          channel: string;
          template: string;
          provider_message_id: string | null;
          status: string;
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          organization_id: string;
          appointment_id?: string | null;
          channel?: string;
          template: string;
          provider_message_id?: string | null;
          status?: string;
          error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          organization_id?: string;
          appointment_id?: string | null;
          channel?: string;
          template?: string;
          provider_message_id?: string | null;
          status?: string;
          error?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      service_tax_codes: {
        Row: {
          service_id: string;
          organization_id: string;
          lc116_code: string | null;
          city_service_code: string | null;
          cnae: string | null;
          description: string | null;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          service_id: string;
          organization_id: string;
          lc116_code?: string | null;
          city_service_code?: string | null;
          cnae?: string | null;
          description?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          service_id?: string;
          organization_id?: string;
          lc116_code?: string | null;
          city_service_code?: string | null;
          cnae?: string | null;
          description?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          organization_id: string;
          transaction_id: string;
          provider: string;
          provider_invoice_id: string | null;
          status: string;
          numero: string | null;
          codigo_verificacao: string | null;
          xml_path: string | null;
          pdf_path: string | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          transaction_id: string;
          provider: string;
          provider_invoice_id?: string | null;
          status?: string;
          numero?: string | null;
          codigo_verificacao?: string | null;
          xml_path?: string | null;
          pdf_path?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          transaction_id?: string;
          provider?: string;
          provider_invoice_id?: string | null;
          status?: string;
          numero?: string | null;
          codigo_verificacao?: string | null;
          xml_path?: string | null;
          pdf_path?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      clientes_para_contabilidade: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          document: string | null;
          payer_type: string;
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
    };
    Functions: {
      accept_invite: {
        Args: { p_token: string };
        Returns: string;
      };
      gerar_token_ical: {
        Args: { p_profissional: string };
        Returns: string;
      };
      registrar_tentativa: {
        Args: { p_kind: string; p_email_hash: string; p_ip_hash: string };
        Returns: boolean;
      };
      limpar_tentativas_de_conta: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      anonimizar_cliente: {
        Args: { p_cliente: string };
        Returns: string;
      };
      registrar_leitura_de_anotacao: {
        Args: { p_cliente: string };
        Returns: undefined;
      };
      aplicar_resultado_da_nota: {
        Args: {
          p_provedor: string;
          p_id_no_provedor: string;
          p_status: string;
          p_numero?: string | null;
          p_codigo?: string | null;
          p_xml?: string | null;
          p_pdf?: string | null;
          p_erro?: string | null;
        };
        Returns: string | null;
      };
      concluir_atendimento: {
        Args: {
          p_appointment: string;
          p_metodo: Database["public"]["Enums"]["payment_method"];
          p_valor_cents: number;
          p_conta: string | null;
        };
        Returns: string;
      };
      aplicar_status_de_cobranca: {
        Args: { p_assinatura: string; p_status: string };
        Returns: string | null;
      };
      definir_codigo_contabil: {
        Args: { p_categoria: string; p_codigo: string };
        Returns: undefined;
      };
      fechar_mes: {
        Args: { p_org: string; p_mes: string };
        Returns: Database["public"]["Tables"]["monthly_closings"]["Row"];
      };
      reabrir_mes: {
        Args: { p_org: string; p_mes: string };
        Returns: undefined;
      };
      limpar_tentativas_antigas: {
        Args: Record<string, never>;
        Returns: number;
      };
      marcar_falta: {
        Args: { p_appointment: string };
        Returns: undefined;
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
      payment_method:
        | "pix"
        | "dinheiro"
        | "cartao_credito"
        | "cartao_debito"
        | "boleto"
        | "transferencia"
        | "outro";
      tax_regime: "pf_autonomo" | "mei" | "simples_nacional" | "outro";
      tx_kind: "receita" | "despesa";
      tx_status: "pendente" | "pago" | "cancelado";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
