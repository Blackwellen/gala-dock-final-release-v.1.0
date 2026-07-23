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
      account_deletion_requests: {
        Row: {
          cancelled_at: string | null
          id: string
          processed_at: string | null
          reason: string | null
          requested_at: string
          scheduled_for: string
          status: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          id?: string
          processed_at?: string | null
          reason?: string | null
          requested_at?: string
          scheduled_for?: string
          status?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          id?: string
          processed_at?: string | null
          reason?: string | null
          requested_at?: string
          scheduled_for?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      affiliate_accounts: {
        Row: {
          created_at: string
          default_currency: string
          id: string
          last_owner_notification_kind: string | null
          last_owner_notified_at: string | null
          min_payout_currency: string
          notes_internal: string | null
          override_rate_pct: number
          parent_account_id: string | null
          payout_method: Database["public"]["Enums"]["affiliate_payout_method"]
          payout_threshold_cents: number
          recruit_code: string | null
          status: Database["public"]["Enums"]["affiliate_account_status"]
          stripe_connect_account_id: string | null
          stripe_connect_charges_enabled: boolean
          stripe_connect_details_submitted: boolean
          stripe_connect_payouts_enabled: boolean
          stripe_connect_synced_at: string | null
          terms_accepted_at: string | null
          terms_version: string | null
          tier: number
          updated_at: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          default_currency?: string
          id?: string
          last_owner_notification_kind?: string | null
          last_owner_notified_at?: string | null
          min_payout_currency?: string
          notes_internal?: string | null
          override_rate_pct?: number
          parent_account_id?: string | null
          payout_method?: Database["public"]["Enums"]["affiliate_payout_method"]
          payout_threshold_cents?: number
          recruit_code?: string | null
          status?: Database["public"]["Enums"]["affiliate_account_status"]
          stripe_connect_account_id?: string | null
          stripe_connect_charges_enabled?: boolean
          stripe_connect_details_submitted?: boolean
          stripe_connect_payouts_enabled?: boolean
          stripe_connect_synced_at?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          tier?: number
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          default_currency?: string
          id?: string
          last_owner_notification_kind?: string | null
          last_owner_notified_at?: string | null
          min_payout_currency?: string
          notes_internal?: string | null
          override_rate_pct?: number
          parent_account_id?: string | null
          payout_method?: Database["public"]["Enums"]["affiliate_payout_method"]
          payout_threshold_cents?: number
          recruit_code?: string | null
          status?: Database["public"]["Enums"]["affiliate_account_status"]
          stripe_connect_account_id?: string | null
          stripe_connect_charges_enabled?: boolean
          stripe_connect_details_submitted?: boolean
          stripe_connect_payouts_enabled?: boolean
          stripe_connect_synced_at?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          tier?: number
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "affiliate_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "affiliate_conversions_quarantined"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "affiliate_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_clicks: {
        Row: {
          country_iso2: string | null
          dedupe_key: string | null
          fingerprint_hash: string | null
          id: string
          ip_hash: string
          is_bot: boolean
          link_id: string
          referer_host: string | null
          ts: string
          ua_hash: string
          window_bucket: number
        }
        Insert: {
          country_iso2?: string | null
          dedupe_key?: string | null
          fingerprint_hash?: string | null
          id?: string
          ip_hash: string
          is_bot?: boolean
          link_id: string
          referer_host?: string | null
          ts?: string
          ua_hash: string
          window_bucket: number
        }
        Update: {
          country_iso2?: string | null
          dedupe_key?: string | null
          fingerprint_hash?: string | null
          id?: string
          ip_hash?: string
          is_bot?: boolean
          link_id?: string
          referer_host?: string | null
          ts?: string
          ua_hash?: string
          window_bucket?: number
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_clicks_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "affiliate_links"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_conversions: {
        Row: {
          account_id: string
          attributed_at: string
          attribution_event: Database["public"]["Enums"]["affiliate_attribution_event"]
          commission_amount_cents: number
          commission_rate_pct: number
          commission_window_ends_at: string
          created_at: string
          currency: string
          id: string
          invoice_amount_cents: number
          link_id: string
          referred_workspace_id: string
          status: Database["public"]["Enums"]["affiliate_conversion_status"]
          stripe_customer_id: string | null
          stripe_invoice_id: string | null
          stripe_subscription_id: string | null
        }
        Insert: {
          account_id: string
          attributed_at?: string
          attribution_event: Database["public"]["Enums"]["affiliate_attribution_event"]
          commission_amount_cents?: number
          commission_rate_pct?: number
          commission_window_ends_at: string
          created_at?: string
          currency?: string
          id?: string
          invoice_amount_cents?: number
          link_id: string
          referred_workspace_id: string
          status?: Database["public"]["Enums"]["affiliate_conversion_status"]
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_subscription_id?: string | null
        }
        Update: {
          account_id?: string
          attributed_at?: string
          attribution_event?: Database["public"]["Enums"]["affiliate_attribution_event"]
          commission_amount_cents?: number
          commission_rate_pct?: number
          commission_window_ends_at?: string
          created_at?: string
          currency?: string
          id?: string
          invoice_amount_cents?: number
          link_id?: string
          referred_workspace_id?: string
          status?: Database["public"]["Enums"]["affiliate_conversion_status"]
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_conversions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "affiliate_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_conversions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "affiliate_conversions_quarantined"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "affiliate_conversions_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "affiliate_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_conversions_referred_workspace_id_fkey"
            columns: ["referred_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_links: {
        Row: {
          account_id: string
          active: boolean
          archived_at: string | null
          code: string
          created_at: string
          id: string
          label: string
          landing_path: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          account_id: string
          active?: boolean
          archived_at?: string | null
          code: string
          created_at?: string
          id?: string
          label?: string
          landing_path?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          account_id?: string
          active?: boolean
          archived_at?: string | null
          code?: string
          created_at?: string
          id?: string
          label?: string
          landing_path?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_links_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "affiliate_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_links_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "affiliate_conversions_quarantined"
            referencedColumns: ["account_id"]
          },
        ]
      }
      affiliate_overrides: {
        Row: {
          amount_cents: number
          child_account_id: string
          created_at: string
          currency: string
          id: string
          override_rate_pct: number
          parent_account_id: string
          source_conversion_id: string
          status: string
        }
        Insert: {
          amount_cents?: number
          child_account_id: string
          created_at?: string
          currency?: string
          id?: string
          override_rate_pct?: number
          parent_account_id: string
          source_conversion_id: string
          status?: string
        }
        Update: {
          amount_cents?: number
          child_account_id?: string
          created_at?: string
          currency?: string
          id?: string
          override_rate_pct?: number
          parent_account_id?: string
          source_conversion_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_overrides_child_account_id_fkey"
            columns: ["child_account_id"]
            isOneToOne: false
            referencedRelation: "affiliate_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_overrides_child_account_id_fkey"
            columns: ["child_account_id"]
            isOneToOne: false
            referencedRelation: "affiliate_conversions_quarantined"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "affiliate_overrides_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "affiliate_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_overrides_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "affiliate_conversions_quarantined"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "affiliate_overrides_source_conversion_id_fkey"
            columns: ["source_conversion_id"]
            isOneToOne: false
            referencedRelation: "affiliate_conversions"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_payouts: {
        Row: {
          account_id: string
          adjustments_cents: number
          approved_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          gross_commission_cents: number
          id: string
          net_commission_cents: number
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["affiliate_payout_status"]
          stripe_transfer_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          adjustments_cents?: number
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          gross_commission_cents?: number
          id?: string
          net_commission_cents?: number
          notes?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["affiliate_payout_status"]
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          adjustments_cents?: number
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          gross_commission_cents?: number
          id?: string
          net_commission_cents?: number
          notes?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["affiliate_payout_status"]
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payouts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "affiliate_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_payouts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "affiliate_conversions_quarantined"
            referencedColumns: ["account_id"]
          },
        ]
      }
      affiliate_tax_forms: {
        Row: {
          account_id: string
          country_iso2: string
          created_at: string
          file_path: string | null
          form_type: Database["public"]["Enums"]["affiliate_tax_form_type"]
          id: string
          legal_name: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          status: Database["public"]["Enums"]["affiliate_tax_form_status"]
          submitted_by: string
          tax_id_hash: string
          updated_at: string
        }
        Insert: {
          account_id: string
          country_iso2: string
          created_at?: string
          file_path?: string | null
          form_type: Database["public"]["Enums"]["affiliate_tax_form_type"]
          id?: string
          legal_name: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: Database["public"]["Enums"]["affiliate_tax_form_status"]
          submitted_by: string
          tax_id_hash: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          country_iso2?: string
          created_at?: string
          file_path?: string | null
          form_type?: Database["public"]["Enums"]["affiliate_tax_form_type"]
          id?: string
          legal_name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: Database["public"]["Enums"]["affiliate_tax_form_status"]
          submitted_by?: string
          tax_id_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_tax_forms_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "affiliate_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_tax_forms_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "affiliate_conversions_quarantined"
            referencedColumns: ["account_id"]
          },
        ]
      }
      ai_audit: {
        Row: {
          action: Database["public"]["Enums"]["ai_audit_action"]
          actor_user_id: string | null
          draft_id: string | null
          email_sent_at: string | null
          id: string
          meta: Json | null
          prompt_id: string | null
          ts: string
          workspace_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["ai_audit_action"]
          actor_user_id?: string | null
          draft_id?: string | null
          email_sent_at?: string | null
          id?: string
          meta?: Json | null
          prompt_id?: string | null
          ts?: string
          workspace_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["ai_audit_action"]
          actor_user_id?: string | null
          draft_id?: string | null
          email_sent_at?: string | null
          id?: string
          meta?: Json | null
          prompt_id?: string | null
          ts?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_audit_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_budgets: {
        Row: {
          alert_thresholds_pct: number[]
          hard_block: boolean
          monthly_cost_cents_cap: number
          plan_default: boolean
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          alert_thresholds_pct?: number[]
          hard_block?: boolean
          monthly_cost_cents_cap: number
          plan_default?: boolean
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          alert_thresholds_pct?: number[]
          hard_block?: boolean
          monthly_cost_cents_cap?: number
          plan_default?: boolean
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_budgets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_drafts: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          cost_cents_estimated: number
          created_at: string
          edited_text: string | null
          id: string
          input_tokens: number
          model: string
          output_json: Json | null
          output_text: string
          output_tokens: number
          pricing_version: number
          prompt_id: string
          status: Database["public"]["Enums"]["ai_draft_status"]
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          cost_cents_estimated: number
          created_at?: string
          edited_text?: string | null
          id?: string
          input_tokens: number
          model: string
          output_json?: Json | null
          output_text: string
          output_tokens: number
          pricing_version: number
          prompt_id: string
          status?: Database["public"]["Enums"]["ai_draft_status"]
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          cost_cents_estimated?: number
          created_at?: string
          edited_text?: string | null
          id?: string
          input_tokens?: number
          model?: string
          output_json?: Json | null
          output_text?: string
          output_tokens?: number
          pricing_version?: number
          prompt_id?: string
          status?: Database["public"]["Enums"]["ai_draft_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_drafts_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "ai_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompts: {
        Row: {
          created_at: string
          created_by: string
          entity_id: string | null
          entity_kind: string | null
          id: string
          input_payload: Json
          prompt_template_version: number
          surface: Database["public"]["Enums"]["ai_surface"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          entity_id?: string | null
          entity_kind?: string | null
          id?: string
          input_payload: Json
          prompt_template_version: number
          surface: Database["public"]["Enums"]["ai_surface"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          entity_id?: string | null
          entity_kind?: string | null
          id?: string
          input_payload?: Json
          prompt_template_version?: number
          surface?: Database["public"]["Enums"]["ai_surface"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_ledger: {
        Row: {
          call_count: number
          cost_cents: number
          created_at: string
          id: string
          input_tokens: number
          last_call_at: string | null
          output_tokens: number
          period_yyyymm: number
          surface: Database["public"]["Enums"]["ai_surface"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          call_count?: number
          cost_cents?: number
          created_at?: string
          id?: string
          input_tokens?: number
          last_call_at?: string | null
          output_tokens?: number
          period_yyyymm: number
          surface: Database["public"]["Enums"]["ai_surface"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          call_count?: number
          cost_cents?: number
          created_at?: string
          id?: string
          input_tokens?: number
          last_call_at?: string | null
          output_tokens?: number
          period_yyyymm?: number
          surface?: Database["public"]["Enums"]["ai_surface"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_daily_rollup: {
        Row: {
          active_subs: number
          arr_cents: number
          canceled_subs: number
          churned_subs: number
          computed_at: string
          day: string
          invoices_paid_cents: number
          invoices_paid_count: number
          mrr_cents: number
          new_paid_subs: number
          past_due_subs: number
          plan_mix: Json
          signups_count: number
          trialing_subs: number
          workspaces_activated: number
          workspaces_created: number
        }
        Insert: {
          active_subs?: number
          arr_cents?: number
          canceled_subs?: number
          churned_subs?: number
          computed_at?: string
          day: string
          invoices_paid_cents?: number
          invoices_paid_count?: number
          mrr_cents?: number
          new_paid_subs?: number
          past_due_subs?: number
          plan_mix?: Json
          signups_count?: number
          trialing_subs?: number
          workspaces_activated?: number
          workspaces_created?: number
        }
        Update: {
          active_subs?: number
          arr_cents?: number
          canceled_subs?: number
          churned_subs?: number
          computed_at?: string
          day?: string
          invoices_paid_cents?: number
          invoices_paid_count?: number
          mrr_cents?: number
          new_paid_subs?: number
          past_due_subs?: number
          plan_mix?: Json
          signups_count?: number
          trialing_subs?: number
          workspaces_activated?: number
          workspaces_created?: number
        }
        Relationships: []
      }
      approval_comments: {
        Row: {
          approval_id: string
          author_id: string | null
          body: string
          created_at: string
          id: string
          workspace_id: string
        }
        Insert: {
          approval_id: string
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          workspace_id: string
        }
        Update: {
          approval_id?: string
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_comments_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_decisions: {
        Row: {
          approval_id: string
          decided_at: string
          decision: string
          id: string
          ip_hash: string | null
          meta: Json
          reason: string | null
          signature: string | null
          token_id: string | null
          ua_hash: string | null
          workspace_id: string
        }
        Insert: {
          approval_id: string
          decided_at?: string
          decision: string
          id?: string
          ip_hash?: string | null
          meta?: Json
          reason?: string | null
          signature?: string | null
          token_id?: string | null
          ua_hash?: string | null
          workspace_id: string
        }
        Update: {
          approval_id?: string
          decided_at?: string
          decision?: string
          id?: string
          ip_hash?: string | null
          meta?: Json
          reason?: string | null
          signature?: string | null
          token_id?: string | null
          ua_hash?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_decisions_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_decisions_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "portal_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          after_state: Json | null
          automation_id: string | null
          before_state: Json | null
          decided_at: string | null
          decided_by: string | null
          due_at: string | null
          id: string
          module: string
          priority: string
          reason: string | null
          request_type: string
          reviewer_id: string | null
          run_id: string | null
          status: string
          submitted_at: string
          submitted_by: string | null
          trigger_context: Json
          workspace_id: string
        }
        Insert: {
          after_state?: Json | null
          automation_id?: string | null
          before_state?: Json | null
          decided_at?: string | null
          decided_by?: string | null
          due_at?: string | null
          id?: string
          module?: string
          priority?: string
          reason?: string | null
          request_type: string
          reviewer_id?: string | null
          run_id?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          trigger_context?: Json
          workspace_id: string
        }
        Update: {
          after_state?: Json | null
          automation_id?: string | null
          before_state?: Json | null
          decided_at?: string | null
          decided_by?: string | null
          due_at?: string | null
          id?: string
          module?: string
          priority?: string
          reason?: string | null
          request_type?: string
          reviewer_id?: string | null
          run_id?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          trigger_context?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "smart_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "smart_rule_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          approval_number: string | null
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_reason: string | null
          decided_signature: string | null
          due_at: string | null
          id: string
          meta: Json
          requester_email: string | null
          requester_name: string | null
          require_signature: boolean
          signer_name: string | null
          status: string
          subject: string
          summary: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          approval_number?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_reason?: string | null
          decided_signature?: string | null
          due_at?: string | null
          id?: string
          meta?: Json
          requester_email?: string | null
          requester_name?: string | null
          require_signature?: boolean
          signer_name?: string | null
          status?: string
          subject: string
          summary?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          approval_number?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_reason?: string | null
          decided_signature?: string | null
          due_at?: string | null
          id?: string
          meta?: Json
          requester_email?: string | null
          requester_name?: string | null
          require_signature?: boolean
          signer_name?: string | null
          status?: string
          subject?: string
          summary?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          entity_id: string | null
          entity_type: string | null
          id: number
          ip: unknown
          meta: Json | null
          ts: string
          user_agent_hash: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: number
          ip?: unknown
          meta?: Json | null
          ts?: string
          user_agent_hash?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: number
          ip?: unknown
          meta?: Json | null
          ts?: string
          user_agent_hash?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_sessions: {
        Row: {
          created_at: string
          created_via: string
          device_fingerprint_hash: string
          device_label: string | null
          id: string
          ip_hash: string | null
          last_seen_at: string
          revoked_at: string | null
          revoked_reason: string | null
          user_agent_hash: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_via: string
          device_fingerprint_hash: string
          device_label?: string | null
          id?: string
          ip_hash?: string | null
          last_seen_at?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          user_agent_hash?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_via?: string
          device_fingerprint_hash?: string
          device_label?: string | null
          id?: string
          ip_hash?: string | null
          last_seen_at?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          user_agent_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      automation_error_incidents: {
        Row: {
          automation_id: string | null
          fingerprint: string
          first_seen_at: string
          id: string
          impact: string
          last_seen_at: string
          message: string | null
          module: string
          node_id: string | null
          node_type: string | null
          occurrences: number
          owner_id: string | null
          payload_preview: Json | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          stack_trace: string | null
          status: string
          suggested_fix: string | null
          title: string
          workspace_id: string
        }
        Insert: {
          automation_id?: string | null
          fingerprint: string
          first_seen_at?: string
          id?: string
          impact?: string
          last_seen_at?: string
          message?: string | null
          module?: string
          node_id?: string | null
          node_type?: string | null
          occurrences?: number
          owner_id?: string | null
          payload_preview?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          stack_trace?: string | null
          status?: string
          suggested_fix?: string | null
          title: string
          workspace_id: string
        }
        Update: {
          automation_id?: string | null
          fingerprint?: string
          first_seen_at?: string
          id?: string
          impact?: string
          last_seen_at?: string
          message?: string | null
          module?: string
          node_id?: string | null
          node_type?: string | null
          occurrences?: number
          owner_id?: string | null
          payload_preview?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          stack_trace?: string | null
          status?: string
          suggested_fix?: string | null
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_error_incidents_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "smart_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_error_incidents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_error_occurrences: {
        Row: {
          id: string
          incident_id: string
          message: string | null
          occurred_at: string
          run_id: string | null
          workspace_id: string
        }
        Insert: {
          id?: string
          incident_id: string
          message?: string | null
          occurred_at?: string
          run_id?: string | null
          workspace_id: string
        }
        Update: {
          id?: string
          incident_id?: string
          message?: string | null
          occurred_at?: string
          run_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_error_occurrences_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "automation_error_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_error_occurrences_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "smart_rule_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_error_occurrences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_recipe_favourites: {
        Row: {
          created_at: string
          id: string
          recipe_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          recipe_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          recipe_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_recipe_favourites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_recipe_usage: {
        Row: {
          actor_id: string | null
          automation_id: string | null
          created_at: string
          id: string
          recipe_id: string
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          automation_id?: string | null
          created_at?: string
          id?: string
          recipe_id: string
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          automation_id?: string | null
          created_at?: string
          id?: string
          recipe_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_recipe_usage_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "smart_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_recipe_usage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_usage_events: {
        Row: {
          automation_id: string | null
          created_at: string
          id: string
          kind: string
          module: string
          quantity: number
          workspace_id: string
        }
        Insert: {
          automation_id?: string | null
          created_at?: string
          id?: string
          kind: string
          module?: string
          quantity?: number
          workspace_id: string
        }
        Update: {
          automation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          module?: string
          quantity?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_usage_events_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "smart_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_usage_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          automation_id: string
          change_summary: string | null
          checksum: string | null
          created_at: string
          created_by: string | null
          definition_json: Json
          id: string
          published_at: string | null
          published_by: string | null
          schema_version: number
          status: string
          version_number: number
          workspace_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          automation_id: string
          change_summary?: string | null
          checksum?: string | null
          created_at?: string
          created_by?: string | null
          definition_json?: Json
          id?: string
          published_at?: string | null
          published_by?: string | null
          schema_version?: number
          status?: string
          version_number: number
          workspace_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          automation_id?: string
          change_summary?: string | null
          checksum?: string | null
          created_at?: string
          created_by?: string | null
          definition_json?: Json
          id?: string
          published_at?: string | null
          published_by?: string | null
          schema_version?: number
          status?: string
          version_number?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_versions_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "smart_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_addons: {
        Row: {
          code: string
          created_at: string
          description: string
          display_name: string
          monthly_price_cents: number
          most_popular: boolean
          requires_plan: Database["public"]["Enums"]["app_plan"] | null
          sort_rank: number
          stripe_price_monthly_id: string | null
          stripe_price_yearly_id: string | null
          updated_at: string
          yearly_price_cents: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string
          display_name: string
          monthly_price_cents?: number
          most_popular?: boolean
          requires_plan?: Database["public"]["Enums"]["app_plan"] | null
          sort_rank?: number
          stripe_price_monthly_id?: string | null
          stripe_price_yearly_id?: string | null
          updated_at?: string
          yearly_price_cents?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          display_name?: string
          monthly_price_cents?: number
          most_popular?: boolean
          requires_plan?: Database["public"]["Enums"]["app_plan"] | null
          sort_rank?: number
          stripe_price_monthly_id?: string | null
          stripe_price_yearly_id?: string | null
          updated_at?: string
          yearly_price_cents?: number
        }
        Relationships: []
      }
      billing_cancellation_surveys: {
        Row: {
          comment: string | null
          created_at: string
          effective_at: string | null
          id: string
          plan_at_cancel: string
          reason: string
          requested_by: string
          status: string
          stripe_subscription_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          effective_at?: string | null
          id?: string
          plan_at_cancel: string
          reason: string
          requested_by: string
          status?: string
          stripe_subscription_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          effective_at?: string | null
          id?: string
          plan_at_cancel?: string
          reason?: string
          requested_by?: string
          status?: string
          stripe_subscription_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_cancellation_surveys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          id: string
          payload: Json
          processed_at: string
          stripe_event_id: string
          type: string
          workspace_id: string | null
        }
        Insert: {
          id?: string
          payload?: Json
          processed_at?: string
          stripe_event_id: string
          type: string
          workspace_id?: string | null
        }
        Update: {
          id?: string
          payload?: Json
          processed_at?: string
          stripe_event_id?: string
          type?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      billing_invoices: {
        Row: {
          amount_due_cents: number
          amount_paid_cents: number
          attempt_count: number
          created_at: string
          currency: string
          hosted_invoice_url: string | null
          id: string
          invoice_pdf_url: string | null
          number: string | null
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          status: string
          stripe_customer_id: string | null
          stripe_invoice_id: string
          stripe_subscription_id: string | null
          updated_at: string
          voided_at: string | null
          workspace_id: string
        }
        Insert: {
          amount_due_cents?: number
          amount_paid_cents?: number
          attempt_count?: number
          created_at?: string
          currency?: string
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf_url?: string | null
          number?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status: string
          stripe_customer_id?: string | null
          stripe_invoice_id: string
          stripe_subscription_id?: string | null
          updated_at?: string
          voided_at?: string | null
          workspace_id: string
        }
        Update: {
          amount_due_cents?: number
          amount_paid_cents?: number
          attempt_count?: number
          created_at?: string
          currency?: string
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf_url?: string | null
          number?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_invoice_id?: string
          stripe_subscription_id?: string | null
          updated_at?: string
          voided_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plans: {
        Row: {
          code: Database["public"]["Enums"]["app_plan"]
          created_at: string
          description: string | null
          display_name: string
          limits_jsonb: Json
          monthly_price_cents: number
          stripe_price_monthly_id: string | null
          stripe_price_yearly_id: string | null
          tier_rank: number
          updated_at: string
          yearly_price_cents: number
        }
        Insert: {
          code: Database["public"]["Enums"]["app_plan"]
          created_at?: string
          description?: string | null
          display_name: string
          limits_jsonb?: Json
          monthly_price_cents?: number
          stripe_price_monthly_id?: string | null
          stripe_price_yearly_id?: string | null
          tier_rank: number
          updated_at?: string
          yearly_price_cents?: number
        }
        Update: {
          code?: Database["public"]["Enums"]["app_plan"]
          created_at?: string
          description?: string | null
          display_name?: string
          limits_jsonb?: Json
          monthly_price_cents?: number
          stripe_price_monthly_id?: string | null
          stripe_price_yearly_id?: string | null
          tier_rank?: number
          updated_at?: string
          yearly_price_cents?: number
        }
        Relationships: []
      }
      billing_subscriptions: {
        Row: {
          address_city: string | null
          address_country: string | null
          address_line1: string | null
          address_line2: string | null
          address_postal_code: string | null
          address_state: string | null
          address_synced_at: string | null
          affiliate_link_code: string | null
          cancel_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          past_due_since: string | null
          pending_plan_change_id: string | null
          plan: Database["public"]["Enums"]["app_plan"]
          read_only_since: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tax_id_type: string | null
          tax_id_value: string | null
          trial_end: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          address_city?: string | null
          address_country?: string | null
          address_line1?: string | null
          address_line2?: string | null
          address_postal_code?: string | null
          address_state?: string | null
          address_synced_at?: string | null
          affiliate_link_code?: string | null
          cancel_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          past_due_since?: string | null
          pending_plan_change_id?: string | null
          plan?: Database["public"]["Enums"]["app_plan"]
          read_only_since?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tax_id_type?: string | null
          tax_id_value?: string | null
          trial_end?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          address_city?: string | null
          address_country?: string | null
          address_line1?: string | null
          address_line2?: string | null
          address_postal_code?: string | null
          address_state?: string | null
          address_synced_at?: string | null
          affiliate_link_code?: string | null
          cancel_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          past_due_since?: string | null
          pending_plan_change_id?: string | null
          plan?: Database["public"]["Enums"]["app_plan"]
          read_only_since?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tax_id_type?: string | null
          tax_id_value?: string | null
          trial_end?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_subscriptions_pending_plan_change_id_fkey"
            columns: ["pending_plan_change_id"]
            isOneToOne: false
            referencedRelation: "pending_plan_changes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      branding_drafts: {
        Row: {
          created_at: string
          payload: Json
          updated_at: string
          updated_by_user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          payload?: Json
          updated_at?: string
          updated_by_user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          payload?: Json
          updated_at?: string
          updated_by_user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branding_drafts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          logo_asset_id: string | null
          name: string
          primary_color: string | null
          slug: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          logo_asset_id?: string | null
          name: string
          primary_color?: string | null
          slug: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          logo_asset_id?: string | null
          name?: string
          primary_color?: string | null
          slug?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_logo_asset_id_fkey"
            columns: ["logo_asset_id"]
            isOneToOne: false
            referencedRelation: "library_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brands_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brief_acknowledgements: {
        Row: {
          ack_at: string
          brief_id: string
          id: string
          ip_hash: string | null
          meta: Json
          signature: string
          token_id: string | null
          ua_hash: string | null
          workspace_id: string
        }
        Insert: {
          ack_at?: string
          brief_id: string
          id?: string
          ip_hash?: string | null
          meta?: Json
          signature: string
          token_id?: string | null
          ua_hash?: string | null
          workspace_id: string
        }
        Update: {
          ack_at?: string
          brief_id?: string
          id?: string
          ip_hash?: string | null
          meta?: Json
          signature?: string
          token_id?: string | null
          ua_hash?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brief_acknowledgements_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brief_acknowledgements_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "portal_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      brief_comments: {
        Row: {
          author_name: string | null
          body: string
          brief_id: string
          created_at: string
          id: string
          ip_hash: string | null
          meta: Json
          token_id: string | null
          ua_hash: string | null
          workspace_id: string
        }
        Insert: {
          author_name?: string | null
          body: string
          brief_id: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          meta?: Json
          token_id?: string | null
          ua_hash?: string | null
          workspace_id: string
        }
        Update: {
          author_name?: string | null
          body?: string
          brief_id?: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          meta?: Json
          token_id?: string | null
          ua_hash?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brief_comments_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brief_comments_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "portal_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      briefs: {
        Row: {
          acknowledger_name: string | null
          brief_number: string | null
          client_email: string | null
          client_name: string | null
          content: Json
          created_at: string
          created_by: string | null
          due_at: string | null
          id: string
          meta: Json
          require_acknowledgement: boolean
          status: string
          summary: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          acknowledger_name?: string | null
          brief_number?: string | null
          client_email?: string | null
          client_name?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          meta?: Json
          require_acknowledgement?: boolean
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          acknowledger_name?: string | null
          brief_number?: string | null
          client_email?: string | null
          client_name?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          meta?: Json
          require_acknowledgement?: boolean
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      calendar_share_tokens: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          label: string | null
          last_used_at: string | null
          revoked_at: string | null
          scope: string[]
          token: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          label?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          scope?: string[]
          token: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          label?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          scope?: string[]
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_share_tokens_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      certification_types: {
        Row: {
          created_at: string
          id: string
          issuer: string | null
          name: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          issuer?: string | null
          name: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          issuer?: string | null
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certification_types_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_notifications: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          kind: string
          message_id: string
          read_at: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          kind: string
          message_id: string
          read_at?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          kind?: string
          message_id?: string
          read_at?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          company: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          event_count: number
          id: string
          last_event_at: string | null
          name: string
          notes: string | null
          phone: string | null
          tags: string[]
          total_revenue_cents: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          event_count?: number
          id?: string
          last_event_at?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          tags?: string[]
          total_revenue_cents?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          event_count?: number
          id?: string
          last_event_at?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          tags?: string[]
          total_revenue_cents?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          attachments: Json
          body: string
          comm_type: string
          created_at: string
          created_by: string | null
          direction: string
          event_id: string | null
          id: string
          is_read: boolean
          lead_id: string | null
          participant_email: string | null
          participant_name: string | null
          participant_phone: string | null
          subject: string | null
          thread_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attachments?: Json
          body: string
          comm_type?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          event_id?: string | null
          id?: string
          is_read?: boolean
          lead_id?: string | null
          participant_email?: string | null
          participant_name?: string | null
          participant_phone?: string | null
          subject?: string | null
          thread_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attachments?: Json
          body?: string
          comm_type?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          event_id?: string | null
          id?: string
          is_read?: boolean
          lead_id?: string | null
          participant_email?: string | null
          participant_name?: string | null
          participant_phone?: string | null
          subject?: string | null
          thread_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_portal_tokens: {
        Row: {
          consent_id: string | null
          created_at: string
          expires_at: string
          id: string
          recipient_email: string | null
          revoked_at: string | null
          scope: string
          token_hash: string
          updated_at: string
          used_at: string | null
          workspace_id: string
        }
        Insert: {
          consent_id?: string | null
          created_at?: string
          expires_at: string
          id?: string
          recipient_email?: string | null
          revoked_at?: string | null
          scope?: string
          token_hash: string
          updated_at?: string
          used_at?: string | null
          workspace_id: string
        }
        Update: {
          consent_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          recipient_email?: string | null
          revoked_at?: string | null
          scope?: string
          token_hash?: string
          updated_at?: string
          used_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_portal_tokens_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_requests: {
        Row: {
          created_at: string
          email: string
          handled_at: string | null
          handled_by: string | null
          id: string
          ip_hash: string | null
          message: string
          name: string
          organisation: string | null
          source: string
          status: string
          topic: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          ip_hash?: string | null
          message: string
          name: string
          organisation?: string | null
          source?: string
          status?: string
          topic: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          ip_hash?: string | null
          message?: string
          name?: string
          organisation?: string | null
          source?: string
          status?: string
          topic?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          added_by: string | null
          archived_at: string | null
          can_post: boolean
          conversation_id: string
          external_contact_email: string | null
          external_contact_name: string | null
          id: string
          joined_at: string
          last_read_at: string | null
          last_read_message_id: string | null
          left_at: string | null
          muted_until: string | null
          participant_kind: string
          pinned_at: string | null
          removed_at: string | null
          role: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          added_by?: string | null
          archived_at?: string | null
          can_post?: boolean
          conversation_id: string
          external_contact_email?: string | null
          external_contact_name?: string | null
          id?: string
          joined_at?: string
          last_read_at?: string | null
          last_read_message_id?: string | null
          left_at?: string | null
          muted_until?: string | null
          participant_kind?: string
          pinned_at?: string | null
          removed_at?: string | null
          role?: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          added_by?: string | null
          archived_at?: string | null
          can_post?: boolean
          conversation_id?: string
          external_contact_email?: string | null
          external_contact_name?: string | null
          id?: string
          joined_at?: string
          last_read_at?: string | null
          last_read_message_id?: string | null
          left_at?: string | null
          muted_until?: string | null
          participant_kind?: string
          pinned_at?: string | null
          removed_at?: string | null
          role?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          archived_at: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          event_id: string | null
          external_org_name: string | null
          id: string
          invoice_id: string | null
          last_message_at: string | null
          lead_id: string | null
          proposal_id: string | null
          rfq_id: string | null
          supplier_id: string | null
          task_id: string | null
          title: string | null
          type: string
          updated_at: string
          venue_id: string | null
          visibility: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          external_org_name?: string | null
          id?: string
          invoice_id?: string | null
          last_message_at?: string | null
          lead_id?: string | null
          proposal_id?: string | null
          rfq_id?: string | null
          supplier_id?: string | null
          task_id?: string | null
          title?: string | null
          type?: string
          updated_at?: string
          venue_id?: string | null
          visibility?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          external_org_name?: string | null
          id?: string
          invoice_id?: string | null
          last_message_at?: string | null
          lead_id?: string | null
          proposal_id?: string | null
          rfq_id?: string | null
          supplier_id?: string | null
          task_id?: string | null
          title?: string | null
          type?: string
          updated_at?: string
          venue_id?: string | null
          visibility?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "event_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "event_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          billing_address: Json | null
          billing_name: string | null
          company_name: string | null
          created_at: string
          customer_type: string | null
          email: string | null
          event_preferences: Json
          full_name: string | null
          id: string
          job_title: string | null
          marketing_consent: boolean
          notification_preferences: Json
          onboarding_completed_at: string | null
          phone: string | null
          preferred_contact_method: string | null
          sms_consent: boolean
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_address?: Json | null
          billing_name?: string | null
          company_name?: string | null
          created_at?: string
          customer_type?: string | null
          email?: string | null
          event_preferences?: Json
          full_name?: string | null
          id?: string
          job_title?: string | null
          marketing_consent?: boolean
          notification_preferences?: Json
          onboarding_completed_at?: string | null
          phone?: string | null
          preferred_contact_method?: string | null
          sms_consent?: boolean
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_address?: Json | null
          billing_name?: string | null
          company_name?: string | null
          created_at?: string
          customer_type?: string | null
          email?: string | null
          event_preferences?: Json
          full_name?: string | null
          id?: string
          job_title?: string | null
          marketing_consent?: boolean
          notification_preferences?: Json
          onboarding_completed_at?: string | null
          phone?: string | null
          preferred_contact_method?: string | null
          sms_consent?: boolean
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      data_export_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          expires_at: string | null
          id: string
          r2_key: string | null
          requested_by: string
          status: Database["public"]["Enums"]["data_export_status"]
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          expires_at?: string | null
          id?: string
          r2_key?: string | null
          requested_by: string
          status?: Database["public"]["Enums"]["data_export_status"]
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          expires_at?: string | null
          id?: string
          r2_key?: string | null
          requested_by?: string
          status?: Database["public"]["Enums"]["data_export_status"]
          workspace_id?: string
        }
        Relationships: []
      }
      data_subject_consents: {
        Row: {
          created_at: string
          id: string
          ip_hash: string | null
          policy_version: string | null
          preferences: Json
          recorded_at: string
          subject_email: string
          subject_name: string | null
          token_hash: string
          updated_at: string
          user_agent: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_hash?: string | null
          policy_version?: string | null
          preferences?: Json
          recorded_at?: string
          subject_email: string
          subject_name?: string | null
          token_hash: string
          updated_at?: string
          user_agent?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_hash?: string | null
          policy_version?: string | null
          preferences?: Json
          recorded_at?: string
          subject_email?: string
          subject_name?: string | null
          token_hash?: string
          updated_at?: string
          user_agent?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_subject_consents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      dunning_events: {
        Row: {
          created_at: string
          created_on: string
          id: string
          kind: Database["public"]["Enums"]["dunning_event_kind"]
          metadata: Json
          sent_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_on?: string
          id?: string
          kind: Database["public"]["Enums"]["dunning_event_kind"]
          metadata?: Json
          sent_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_on?: string
          id?: string
          kind?: Database["public"]["Enums"]["dunning_event_kind"]
          metadata?: Json
          sent_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dunning_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_domains: {
        Row: {
          created_at: string
          created_by_user_id: string
          domain: string
          id: string
          last_checked_at: string | null
          status: Database["public"]["Enums"]["email_domain_status"]
          updated_at: string
          verification_token: string
          verified_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          domain: string
          id?: string
          last_checked_at?: string | null
          status?: Database["public"]["Enums"]["email_domain_status"]
          updated_at?: string
          verification_token?: string
          verified_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          domain?: string
          id?: string
          last_checked_at?: string | null
          status?: Database["public"]["Enums"]["email_domain_status"]
          updated_at?: string
          verification_token?: string
          verified_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_domains_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          bounce_type: string | null
          created_at: string
          email_hash: string
          event_type: string
          id: string
          payload: Json
          provider_event_id: string
          received_at: string
          resend_message_id: string | null
          template_key: string | null
        }
        Insert: {
          bounce_type?: string | null
          created_at?: string
          email_hash: string
          event_type: string
          id?: string
          payload?: Json
          provider_event_id: string
          received_at?: string
          resend_message_id?: string | null
          template_key?: string | null
        }
        Update: {
          bounce_type?: string | null
          created_at?: string
          email_hash?: string
          event_type?: string
          id?: string
          payload?: Json
          provider_event_id?: string
          received_at?: string
          resend_message_id?: string | null
          template_key?: string | null
        }
        Relationships: []
      }
      email_messages: {
        Row: {
          body_html: string | null
          body_text: string | null
          created_at: string
          folder_kind: Database["public"]["Enums"]["email_folder_kind"]
          has_attachments: boolean
          id: string
          is_draft: boolean
          is_starred: boolean
          is_unread: boolean
          mailbox_id: string
          provider_message_id: string
          raw_headers: Json | null
          received_at: string
          search_tsv: unknown
          sent_at: string | null
          snippet: string | null
          subject: string | null
          thread_id: string
          updated_at: string
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          folder_kind?: Database["public"]["Enums"]["email_folder_kind"]
          has_attachments?: boolean
          id?: string
          is_draft?: boolean
          is_starred?: boolean
          is_unread?: boolean
          mailbox_id: string
          provider_message_id: string
          raw_headers?: Json | null
          received_at?: string
          search_tsv?: unknown
          sent_at?: string | null
          snippet?: string | null
          subject?: string | null
          thread_id: string
          updated_at?: string
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          folder_kind?: Database["public"]["Enums"]["email_folder_kind"]
          has_attachments?: boolean
          id?: string
          is_draft?: boolean
          is_starred?: boolean
          is_unread?: boolean
          mailbox_id?: string
          provider_message_id?: string
          raw_headers?: Json | null
          received_at?: string
          search_tsv?: unknown
          sent_at?: string | null
          snippet?: string | null
          subject?: string | null
          thread_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          error: string | null
          id: string
          mailbox_id: string
          message_id: string | null
          sent_at: string
          status: Database["public"]["Enums"]["email_send_status"]
          user_id: string
        }
        Insert: {
          error?: string | null
          id?: string
          mailbox_id: string
          message_id?: string | null
          sent_at?: string
          status: Database["public"]["Enums"]["email_send_status"]
          user_id: string
        }
        Update: {
          error?: string | null
          id?: string
          mailbox_id?: string
          message_id?: string | null
          sent_at?: string
          status?: Database["public"]["Enums"]["email_send_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_send_log_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppression_events: {
        Row: {
          actor_user_id: string | null
          email_hash: string
          event_type: string
          id: string
          notes: string | null
          occurred_at: string
          origin_event_id: string | null
          reason: string | null
          source: string | null
        }
        Insert: {
          actor_user_id?: string | null
          email_hash: string
          event_type: string
          id?: string
          notes?: string | null
          occurred_at?: string
          origin_event_id?: string | null
          reason?: string | null
          source?: string | null
        }
        Update: {
          actor_user_id?: string | null
          email_hash?: string
          event_type?: string
          id?: string
          notes?: string | null
          occurred_at?: string
          origin_event_id?: string | null
          reason?: string | null
          source?: string | null
        }
        Relationships: []
      }
      email_suppressions: {
        Row: {
          created_at: string
          email_hash: string
          id: string
          last_attempt_at: string | null
          notes: string | null
          origin_event_id: string | null
          reason: string
          source: string
          suppressed_at: string
          unsuppressed_at: string | null
          unsuppressed_by_user_id: string | null
          unsuppressed_reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_hash: string
          id?: string
          last_attempt_at?: string | null
          notes?: string | null
          origin_event_id?: string | null
          reason: string
          source: string
          suppressed_at?: string
          unsuppressed_at?: string | null
          unsuppressed_by_user_id?: string | null
          unsuppressed_reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_hash?: string
          id?: string
          last_attempt_at?: string | null
          notes?: string | null
          origin_event_id?: string | null
          reason?: string
          source?: string
          suppressed_at?: string
          unsuppressed_at?: string | null
          unsuppressed_by_user_id?: string | null
          unsuppressed_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      email_verifications: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          token: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          token: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      event_accessibility: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          event_id: string
          id: string
          need: string
          notes: string | null
          provision: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id: string
          id?: string
          need?: string
          notes?: string | null
          provision?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id?: string
          id?: string
          need?: string
          notes?: string | null
          provision?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_accessibility_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_accessibility_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_accessibility_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_act_sets: {
        Row: {
          act_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          ends_at: string
          event_id: string
          id: string
          label: string | null
          notes: string | null
          room_id: string | null
          soundcheck_at: string | null
          starts_at: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          act_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_at: string
          event_id: string
          id?: string
          label?: string | null
          notes?: string | null
          room_id?: string | null
          soundcheck_at?: string | null
          starts_at: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          act_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_at?: string
          event_id?: string
          id?: string
          label?: string | null
          notes?: string | null
          room_id?: string | null
          soundcheck_at?: string | null
          starts_at?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_act_sets_act_id_fkey"
            columns: ["act_id"]
            isOneToOne: false
            referencedRelation: "event_acts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_act_sets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_act_sets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_act_sets_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "event_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_act_sets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_activity: {
        Row: {
          action: string
          action_type: string | null
          actor_id: string | null
          actor_name: string | null
          actor_user_id: string | null
          created_at: string
          description: string | null
          entity_id: string | null
          entity_label: string | null
          entity_type: string | null
          event_id: string
          id: string
          metadata: Json
          note: string | null
          resource_id: string | null
          resource_type: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          action_type?: string | null
          actor_id?: string | null
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          event_id: string
          id?: string
          metadata?: Json
          note?: string | null
          resource_id?: string | null
          resource_type?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          action_type?: string | null
          actor_id?: string | null
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          event_id?: string
          id?: string
          metadata?: Json
          note?: string | null
          resource_id?: string | null
          resource_type?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_activity_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_activity_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_activity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_acts: {
        Row: {
          contact: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          event_id: string
          fee_cents: number
          fee_type: string
          id: string
          kind: string
          name: string
          rider_notes: string | null
          supplier_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id: string
          fee_cents?: number
          fee_type?: string
          id?: string
          kind?: string
          name: string
          rider_notes?: string | null
          supplier_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id?: string
          fee_cents?: number
          fee_type?: string
          id?: string
          kind?: string
          name?: string
          rider_notes?: string | null
          supplier_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_acts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_acts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_acts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_bar_terms: {
        Row: {
          bar_deposit_cents: number
          bar_manager_contact_id: string | null
          bar_revenue_share_pct: number
          created_at: string
          created_by: string | null
          event_id: string
          guarantee_cents: number
          id: string
          min_spend_cents: number
          notes: string | null
          settled: boolean
          settlement_cents: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          bar_deposit_cents?: number
          bar_manager_contact_id?: string | null
          bar_revenue_share_pct?: number
          created_at?: string
          created_by?: string | null
          event_id: string
          guarantee_cents?: number
          id?: string
          min_spend_cents?: number
          notes?: string | null
          settled?: boolean
          settlement_cents?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          bar_deposit_cents?: number
          bar_manager_contact_id?: string | null
          bar_revenue_share_pct?: number
          created_at?: string
          created_by?: string | null
          event_id?: string
          guarantee_cents?: number
          id?: string
          min_spend_cents?: number
          notes?: string | null
          settled?: boolean
          settlement_cents?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_bar_terms_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_bar_terms_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_bar_terms_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_budget_lines: {
        Row: {
          category: string
          created_at: string
          currency: string
          description: string | null
          event_id: string
          id: string
          position: number
          quantity: number
          source_id: string | null
          source_kind: string | null
          status: Database["public"]["Enums"]["event_budget_line_status"]
          supplier_ref: string | null
          unit_cost_cents: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          category: string
          created_at?: string
          currency: string
          description?: string | null
          event_id: string
          id?: string
          position?: number
          quantity?: number
          source_id?: string | null
          source_kind?: string | null
          status?: Database["public"]["Enums"]["event_budget_line_status"]
          supplier_ref?: string | null
          unit_cost_cents?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          category?: string
          created_at?: string
          currency?: string
          description?: string | null
          event_id?: string
          id?: string
          position?: number
          quantity?: number
          source_id?: string | null
          source_kind?: string | null
          status?: Database["public"]["Enums"]["event_budget_line_status"]
          supplier_ref?: string | null
          unit_cost_cents?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_budget_lines_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_budget_lines_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_budget_lines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_comms: {
        Row: {
          body_preview: string | null
          channel: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          direction: string
          event_id: string
          id: string
          recipient_name: string | null
          recipient_type: string | null
          sent_at: string | null
          status: string
          subject: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body_preview?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          direction?: string
          event_id: string
          id?: string
          recipient_name?: string | null
          recipient_type?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body_preview?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          direction?: string
          event_id?: string
          id?: string
          recipient_name?: string | null
          recipient_type?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_comms_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_comms_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_comms_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_comms_channels: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          event_id: string
          id: string
          kind: string
          name: string
          notes: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id: string
          id?: string
          kind?: string
          name: string
          notes?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id?: string
          id?: string
          kind?: string
          name?: string
          notes?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_comms_channels_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_comms_channels_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_comms_channels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_contingency_plans: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          event_id: string
          id: string
          owner_name: string | null
          plan: string | null
          scenario: string
          trigger: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id: string
          id?: string
          owner_name?: string | null
          plan?: string | null
          scenario: string
          trigger?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id?: string
          id?: string
          owner_name?: string | null
          plan?: string | null
          scenario?: string
          trigger?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_contingency_plans_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_contingency_plans_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_contingency_plans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_contracts: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_path: string | null
          event_id: string | null
          id: string
          kind: string
          party_name: string | null
          proposal_id: string | null
          signature_ip_hash: string | null
          signed_at: string | null
          signed_by_name: string | null
          status: string
          terms: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_path?: string | null
          event_id?: string | null
          id?: string
          kind?: string
          party_name?: string | null
          proposal_id?: string | null
          signature_ip_hash?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          status?: string
          terms?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_path?: string | null
          event_id?: string | null
          id?: string
          kind?: string
          party_name?: string | null
          proposal_id?: string | null
          signature_ip_hash?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          status?: string
          terms?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_contracts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_contracts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_contracts_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_contracts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_deposit_payments: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          currency: string
          deposit_id: string
          id: string
          method: string | null
          note: string | null
          paid_at: string
          receipt_storage_key: string | null
          workspace_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          deposit_id: string
          id?: string
          method?: string | null
          note?: string | null
          paid_at?: string
          receipt_storage_key?: string | null
          workspace_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          deposit_id?: string
          id?: string
          method?: string | null
          note?: string | null
          paid_at?: string
          receipt_storage_key?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_deposit_payments_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "event_deposits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_deposit_payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_deposits: {
        Row: {
          amount_cents: number
          client_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          due_date: string | null
          event_id: string
          id: string
          kind: string
          label: string
          notes: string | null
          owner_id: string | null
          paid_at: string | null
          paid_cents: number
          proof_path: string | null
          refundable: boolean
          status: string
          supplier_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount_cents?: number
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          due_date?: string | null
          event_id: string
          id?: string
          kind?: string
          label: string
          notes?: string | null
          owner_id?: string | null
          paid_at?: string | null
          paid_cents?: number
          proof_path?: string | null
          refundable?: boolean
          status?: string
          supplier_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount_cents?: number
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          due_date?: string | null
          event_id?: string
          id?: string
          kind?: string
          label?: string
          notes?: string | null
          owner_id?: string | null
          paid_at?: string | null
          paid_cents?: number
          proof_path?: string | null
          refundable?: boolean
          status?: string
          supplier_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_deposits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_deposits_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_deposits_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_deposits_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_deposits_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_deposits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_documents: {
        Row: {
          category: string | null
          created_at: string
          deleted_at: string | null
          event_id: string
          file_size_bytes: number | null
          file_type: string | null
          id: string
          name: string
          storage_path: string | null
          updated_at: string
          uploaded_by: string | null
          uploaded_by_name: string | null
          workspace_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          event_id: string
          file_size_bytes?: number | null
          file_type?: string | null
          id?: string
          name: string
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
          workspace_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          event_id?: string
          file_size_bytes?: number | null
          file_type?: string | null
          id?: string
          name?: string
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_documents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_documents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_drafts: {
        Row: {
          cover_path: string | null
          created_at: string
          created_by: string
          id: string
          payload: Json
          step: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cover_path?: string | null
          created_at?: string
          created_by: string
          id?: string
          payload?: Json
          step?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cover_path?: string | null
          created_at?: string
          created_by?: string
          id?: string
          payload?: Json
          step?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      event_drinks_packages: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          event_id: string
          id: string
          kind: string
          min_spend_cents: number
          name: string
          notes: string | null
          price_per_head_cents: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          event_id: string
          id?: string
          kind?: string
          min_spend_cents?: number
          name: string
          notes?: string | null
          price_per_head_cents?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          event_id?: string
          id?: string
          kind?: string
          min_spend_cents?: number
          name?: string
          notes?: string | null
          price_per_head_cents?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_drinks_packages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_drinks_packages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_drinks_packages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_expense_payments: {
        Row: {
          amount_cents: number
          batch_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          expense_id: string
          id: string
          method: string | null
          paid_at: string
          remittance_storage_key: string | null
          workspace_id: string
        }
        Insert: {
          amount_cents?: number
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expense_id: string
          id?: string
          method?: string | null
          paid_at?: string
          remittance_storage_key?: string | null
          workspace_id: string
        }
        Update: {
          amount_cents?: number
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expense_id?: string
          id?: string
          method?: string | null
          paid_at?: string
          remittance_storage_key?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_expense_payments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "event_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_expense_payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_expenses: {
        Row: {
          amount_cents: number
          approval_status: string
          bill_number: string | null
          category: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string
          due_date: string | null
          event_id: string
          expense_date: string | null
          id: string
          owner_id: string | null
          paid_cents: number
          payment_status: string
          receipt_storage_key: string | null
          status: string
          supplier_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount_cents?: number
          approval_status?: string
          bill_number?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description: string
          due_date?: string | null
          event_id: string
          expense_date?: string | null
          id?: string
          owner_id?: string | null
          paid_cents?: number
          payment_status?: string
          receipt_storage_key?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount_cents?: number
          approval_status?: string
          bill_number?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string
          due_date?: string | null
          event_id?: string
          expense_date?: string | null
          id?: string
          owner_id?: string | null
          paid_cents?: number
          payment_status?: string
          receipt_storage_key?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_expenses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_expenses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_expenses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_feedback: {
        Row: {
          comment: string | null
          created_at: string
          event_id: string
          id: string
          rating: number | null
          source: string
          workspace_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          event_id: string
          id?: string
          rating?: number | null
          source?: string
          workspace_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          event_id?: string
          id?: string
          rating?: number | null
          source?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_feedback_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_feedback_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_feedback_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_files: {
        Row: {
          caption: string | null
          created_at: string
          event_id: string
          filename: string
          id: string
          mime_type: string | null
          size_bytes: number
          storage_key: string
          tags: string[]
          updated_at: string
          uploaded_by: string | null
          workspace_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          event_id: string
          filename: string
          id?: string
          mime_type?: string | null
          size_bytes?: number
          storage_key: string
          tags?: string[]
          updated_at?: string
          uploaded_by?: string | null
          workspace_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          event_id?: string
          filename?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number
          storage_key?: string
          tags?: string[]
          updated_at?: string
          uploaded_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_files_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_files_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_files_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_floor_plans: {
        Row: {
          canvas_height: number
          canvas_json: Json
          canvas_width: number
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          is_primary: boolean
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          canvas_height?: number
          canvas_json?: Json
          canvas_width?: number
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          is_primary?: boolean
          name?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          canvas_height?: number
          canvas_json?: Json
          canvas_width?: number
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          is_primary?: boolean
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_floor_plans_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_floor_plans_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_floor_plans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_guests: {
        Row: {
          accessibility_needs: string | null
          attendance_mode: string | null
          check_in_status: string | null
          check_in_token: string | null
          checked_in_at: string | null
          company: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dietary_notes: string | null
          dietary_requirements: string | null
          email: string | null
          event_id: string
          first_name: string
          full_name: string | null
          guest_type: string
          id: string
          imported_at: string | null
          last_name: string
          meal_choice: string | null
          notes: string | null
          phone: string | null
          plus_one_name: string | null
          rsvp_status: string
          seat_number: string | null
          segment: string | null
          table_number: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accessibility_needs?: string | null
          attendance_mode?: string | null
          check_in_status?: string | null
          check_in_token?: string | null
          checked_in_at?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dietary_notes?: string | null
          dietary_requirements?: string | null
          email?: string | null
          event_id: string
          first_name: string
          full_name?: string | null
          guest_type?: string
          id?: string
          imported_at?: string | null
          last_name: string
          meal_choice?: string | null
          notes?: string | null
          phone?: string | null
          plus_one_name?: string | null
          rsvp_status?: string
          seat_number?: string | null
          segment?: string | null
          table_number?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accessibility_needs?: string | null
          attendance_mode?: string | null
          check_in_status?: string | null
          check_in_token?: string | null
          checked_in_at?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dietary_notes?: string | null
          dietary_requirements?: string | null
          email?: string | null
          event_id?: string
          first_name?: string
          full_name?: string | null
          guest_type?: string
          id?: string
          imported_at?: string | null
          last_name?: string
          meal_choice?: string | null
          notes?: string | null
          phone?: string | null
          plus_one_name?: string | null
          rsvp_status?: string
          seat_number?: string | null
          segment?: string | null
          table_number?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_guests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_guests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_guests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_incidents: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          event_id: string
          evidence_path: string | null
          id: string
          occurred_at: string
          owner_name: string | null
          severity: string
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          event_id: string
          evidence_path?: string | null
          id?: string
          occurred_at?: string
          owner_name?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          event_id?: string
          evidence_path?: string | null
          id?: string
          occurred_at?: string
          owner_name?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_incidents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_incidents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_incidents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_inventory_items: {
        Row: {
          assigned: number
          category: string
          created_at: string
          created_by: string | null
          damaged: number
          deleted_at: string | null
          event_id: string
          id: string
          lost: number
          name: string
          notes: string | null
          quantity: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned?: number
          category?: string
          created_at?: string
          created_by?: string | null
          damaged?: number
          deleted_at?: string | null
          event_id: string
          id?: string
          lost?: number
          name: string
          notes?: string | null
          quantity?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned?: number
          category?: string
          created_at?: string
          created_by?: string | null
          damaged?: number
          deleted_at?: string | null
          event_id?: string
          id?: string
          lost?: number
          name?: string
          notes?: string | null
          quantity?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_inventory_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_inventory_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_inventory_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_invoices: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          due_date: string | null
          event_id: string
          id: string
          invoice_number: string | null
          notes: string | null
          status: string
          supplier_name: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          event_id: string
          id?: string
          invoice_number?: string | null
          notes?: string | null
          status?: string
          supplier_name?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          event_id?: string
          id?: string
          invoice_number?: string | null
          notes?: string | null
          status?: string
          supplier_name?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_invoices_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invoices_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_licenses: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          event_id: string
          evidence_path: string | null
          expiry_date: string | null
          id: string
          kind: string
          reference: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id: string
          evidence_path?: string | null
          expiry_date?: string | null
          id?: string
          kind?: string
          reference?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id?: string
          evidence_path?: string | null
          expiry_date?: string | null
          id?: string
          kind?: string
          reference?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_licenses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_licenses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_licenses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_logistics: {
        Row: {
          access_time: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          event_id: string
          id: string
          item_type: string
          notes: string | null
          quantity: number | null
          scheduled_date: string | null
          status: string
          supplier_name: string | null
          title: string
          updated_at: string
          workspace_id: string
          zone: string | null
        }
        Insert: {
          access_time?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id: string
          id?: string
          item_type?: string
          notes?: string | null
          quantity?: number | null
          scheduled_date?: string | null
          status?: string
          supplier_name?: string | null
          title: string
          updated_at?: string
          workspace_id: string
          zone?: string | null
        }
        Update: {
          access_time?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id?: string
          id?: string
          item_type?: string
          notes?: string | null
          quantity?: number | null
          scheduled_date?: string | null
          status?: string
          supplier_name?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_logistics_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_logistics_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_logistics_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_menu_items: {
        Row: {
          allergens: string | null
          course: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          description: string | null
          dietary: string | null
          event_id: string
          id: string
          name: string
          package: string | null
          price_cents: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          allergens?: string | null
          course?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          description?: string | null
          dietary?: string | null
          event_id: string
          id?: string
          name: string
          package?: string | null
          price_cents?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          allergens?: string | null
          course?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          description?: string | null
          dietary?: string | null
          event_id?: string
          id?: string
          name?: string
          package?: string | null
          price_cents?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_menu_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_menu_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_menu_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_mood_boards: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          notes: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          notes?: string | null
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          notes?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_mood_boards_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_mood_boards_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_mood_boards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_passes: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          event_id: string
          holder_name: string
          id: string
          kind: string
          scanned_at: string | null
          updated_at: string
          workspace_id: string
          zones: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id: string
          holder_name: string
          id?: string
          kind?: string
          scanned_at?: string | null
          updated_at?: string
          workspace_id: string
          zones?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id?: string
          holder_name?: string
          id?: string
          kind?: string
          scanned_at?: string | null
          updated_at?: string
          workspace_id?: string
          zones?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_passes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_passes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_passes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_playbooks: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          deleted_at: string | null
          event_type: string | null
          id: string
          name: string
          source_event_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          deleted_at?: string | null
          event_type?: string | null
          id?: string
          name: string
          source_event_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          deleted_at?: string | null
          event_type?: string | null
          id?: string
          name?: string
          source_event_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_playbooks_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_playbooks_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_playbooks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_public_pages: {
        Row: {
          accessibility_features: Json
          address_line1: string | null
          age_restriction: string | null
          category: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          doors_at: string | null
          ends_at: string | null
          event_id: string
          event_type: string | null
          faqs: Json
          gallery_paths: Json
          headline: string | null
          hero_path: string | null
          id: string
          latitude: number | null
          lineup: Json
          longitude: number | null
          organiser_name: string | null
          policies: Json
          promoted: boolean
          published: boolean
          schedule: Json
          seo_description: string | null
          seo_title: string | null
          slug: string
          starts_at: string | null
          summary: string | null
          updated_at: string
          venue_name: string | null
          workspace_id: string
        }
        Insert: {
          accessibility_features?: Json
          address_line1?: string | null
          age_restriction?: string | null
          category?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          doors_at?: string | null
          ends_at?: string | null
          event_id: string
          event_type?: string | null
          faqs?: Json
          gallery_paths?: Json
          headline?: string | null
          hero_path?: string | null
          id?: string
          latitude?: number | null
          lineup?: Json
          longitude?: number | null
          organiser_name?: string | null
          policies?: Json
          promoted?: boolean
          published?: boolean
          schedule?: Json
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          starts_at?: string | null
          summary?: string | null
          updated_at?: string
          venue_name?: string | null
          workspace_id: string
        }
        Update: {
          accessibility_features?: Json
          address_line1?: string | null
          age_restriction?: string | null
          category?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          doors_at?: string | null
          ends_at?: string | null
          event_id?: string
          event_type?: string | null
          faqs?: Json
          gallery_paths?: Json
          headline?: string | null
          hero_path?: string | null
          id?: string
          latitude?: number | null
          lineup?: Json
          longitude?: number | null
          organiser_name?: string | null
          policies?: Json
          promoted?: boolean
          published?: boolean
          schedule?: Json
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          starts_at?: string | null
          summary?: string | null
          updated_at?: string
          venue_name?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_public_pages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_public_pages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_public_pages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_purchase_orders: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          delivery_window: string | null
          event_id: string
          id: string
          notes: string | null
          reference: string | null
          status: string
          supplier_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          delivery_window?: string | null
          event_id: string
          id?: string
          notes?: string | null
          reference?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          delivery_window?: string | null
          event_id?: string
          id?: string
          notes?: string | null
          reference?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_purchase_orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_purchase_orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_purchase_orders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          created_at: string
          email: string | null
          event_id: string
          id: string
          name: string
          status: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          event_id: string
          id?: string
          name: string
          status?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          event_id?: string
          id?: string
          name?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_risks: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          due_date: string | null
          event_id: string
          evidence_path: string | null
          id: string
          impact: number
          likelihood: number
          mitigation: string | null
          owner_name: string | null
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          event_id: string
          evidence_path?: string | null
          id?: string
          impact?: number
          likelihood?: number
          mitigation?: string | null
          owner_name?: string | null
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          event_id?: string
          evidence_path?: string | null
          id?: string
          impact?: number
          likelihood?: number
          mitigation?: string | null
          owner_name?: string | null
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_risks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_risks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_risks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rooms: {
        Row: {
          capacity: number | null
          created_at: string
          event_id: string
          id: string
          is_primary: boolean
          layout_mode: string | null
          name: string | null
          notes: string | null
          position: number
          room_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          event_id: string
          id?: string
          is_primary?: boolean
          layout_mode?: string | null
          name?: string | null
          notes?: string | null
          position?: number
          room_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          event_id?: string
          id?: string
          is_primary?: boolean
          layout_mode?: string | null
          name?: string | null
          notes?: string | null
          position?: number
          room_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rooms_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rooms_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rooms_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_run_sheet_items: {
        Row: {
          assignee_id: string | null
          created_at: string
          deleted_at: string | null
          department: string | null
          duration_minutes: number | null
          end_time: string | null
          event_id: string
          id: string
          lane: Database["public"]["Enums"]["run_sheet_lane"] | null
          notes: string | null
          position: number
          section: string | null
          start_time: string | null
          starts_at: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          event_id: string
          id?: string
          lane?: Database["public"]["Enums"]["run_sheet_lane"] | null
          notes?: string | null
          position?: number
          section?: string | null
          start_time?: string | null
          starts_at?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          event_id?: string
          id?: string
          lane?: Database["public"]["Enums"]["run_sheet_lane"] | null
          notes?: string | null
          position?: number
          section?: string | null
          start_time?: string | null
          starts_at?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_run_sheet_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_run_sheet_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      event_settlement_lines: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          kind: string
          label: string
          party_name: string | null
          settlement_id: string
          workspace_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          id?: string
          kind?: string
          label: string
          party_name?: string | null
          settlement_id: string
          workspace_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          kind?: string
          label?: string
          party_name?: string | null
          settlement_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_settlement_lines_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "event_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_settlement_lines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_settlements: {
        Row: {
          created_at: string
          created_by: string | null
          deposits_returned_cents: number
          deposits_withheld_cents: number
          event_id: string
          gross_revenue_cents: number
          id: string
          net_profit_cents: number
          settled_at: string | null
          statement_path: string | null
          status: string
          total_costs_cents: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deposits_returned_cents?: number
          deposits_withheld_cents?: number
          event_id: string
          gross_revenue_cents?: number
          id?: string
          net_profit_cents?: number
          settled_at?: string | null
          statement_path?: string | null
          status?: string
          total_costs_cents?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deposits_returned_cents?: number
          deposits_withheld_cents?: number
          event_id?: string
          gross_revenue_cents?: number
          id?: string
          net_profit_cents?: number
          settled_at?: string | null
          statement_path?: string | null
          status?: string
          total_costs_cents?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_settlements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_settlements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_settlements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_splits: {
        Row: {
          applies_to: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          event_id: string
          fixed_cents: number
          id: string
          kind: string
          notes: string | null
          party_name: string
          pct: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          applies_to?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id: string
          fixed_cents?: number
          id?: string
          kind?: string
          notes?: string | null
          party_name: string
          pct?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          applies_to?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id?: string
          fixed_cents?: number
          id?: string
          kind?: string
          notes?: string | null
          party_name?: string
          pct?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_splits_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_splits_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_splits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_staff_assignments: {
        Row: {
          call_time: string | null
          created_at: string
          created_by: string | null
          end_time: string | null
          event_id: string
          id: string
          notes: string | null
          role: string | null
          staff_name: string | null
          status: string
          updated_at: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          call_time?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          event_id: string
          id?: string
          notes?: string | null
          role?: string | null
          staff_name?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          call_time?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          event_id?: string
          id?: string
          notes?: string | null
          role?: string | null
          staff_name?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_staff_assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_staff_assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_staff_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_suppliers: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contract_value_cents: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          event_id: string
          id: string
          notes: string | null
          role: string | null
          role_on_event: string | null
          status: Database["public"]["Enums"]["event_supplier_status"]
          supplier_id: string
          supplier_name: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_value_cents?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id: string
          id?: string
          notes?: string | null
          role?: string | null
          role_on_event?: string | null
          status?: Database["public"]["Enums"]["event_supplier_status"]
          supplier_id: string
          supplier_name?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_value_cents?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id?: string
          id?: string
          notes?: string | null
          role?: string | null
          role_on_event?: string | null
          status?: Database["public"]["Enums"]["event_supplier_status"]
          supplier_id?: string
          supplier_name?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_suppliers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_suppliers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_suppliers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tables: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          event_id: string
          id: string
          kind: string
          name: string
          pos_x: number | null
          pos_y: number | null
          room_id: string | null
          seats: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id: string
          id?: string
          kind?: string
          name: string
          pos_x?: number | null
          pos_y?: number | null
          room_id?: string | null
          seats?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_id?: string
          id?: string
          kind?: string
          name?: string
          pos_x?: number | null
          pos_y?: number | null
          room_id?: string | null
          seats?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_tables_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tables_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tables_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "event_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tables_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tasks: {
        Row: {
          archived_at: string | null
          assignee_user_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          department: string | null
          description: string | null
          due_at: string | null
          due_date: string | null
          event_id: string
          id: string
          notes: string | null
          position: number
          priority: string | null
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          assignee_user_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          department?: string | null
          description?: string | null
          due_at?: string | null
          due_date?: string | null
          event_id: string
          id?: string
          notes?: string | null
          position?: number
          priority?: string | null
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          assignee_user_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          department?: string | null
          description?: string | null
          due_at?: string | null
          due_date?: string | null
          event_id?: string
          id?: string
          notes?: string | null
          position?: number
          priority?: string | null
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      event_templates: {
        Row: {
          active: boolean
          created_at: string
          default_payload: Json
          description: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_payload?: Json
          description: string
          id: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_payload?: Json
          description?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      event_theme_plans: {
        Row: {
          created_at: string
          created_by: string | null
          decor_budget_cents: number
          decor_supplier: string | null
          deleted_at: string | null
          event_id: string
          id: string
          moodboard_path: string | null
          notes: string | null
          palette: string | null
          room_id: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          decor_budget_cents?: number
          decor_supplier?: string | null
          deleted_at?: string | null
          event_id: string
          id?: string
          moodboard_path?: string | null
          notes?: string | null
          palette?: string | null
          room_id?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          decor_budget_cents?: number
          decor_supplier?: string | null
          deleted_at?: string | null
          event_id?: string
          id?: string
          moodboard_path?: string | null
          notes?: string | null
          palette?: string | null
          room_id?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_theme_plans_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_theme_plans_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_theme_plans_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "event_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_theme_plans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_transactions: {
        Row: {
          amount_cents: number
          category: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          event_id: string
          id: string
          payment_status: string | null
          reference: string | null
          status: string | null
          supplier_name: string | null
          transaction_date: string | null
          transaction_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount_cents?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          event_id: string
          id?: string
          payment_status?: string | null
          reference?: string | null
          status?: string | null
          supplier_name?: string | null
          transaction_date?: string | null
          transaction_type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount_cents?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          event_id?: string
          id?: string
          payment_status?: string | null
          reference?: string | null
          status?: string | null
          supplier_name?: string | null
          transaction_date?: string | null
          transaction_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_transactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_transactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_type_templates: {
        Row: {
          created_at: string
          data: Json
          event_type_id: string
          id: string
          kind: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          data?: Json
          event_type_id: string
          id?: string
          kind: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          event_type_id?: string
          id?: string
          kind?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_type_templates_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "event_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_type_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_types: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_default: boolean
          key: string
          name: string
          sort: number
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean
          key: string
          name: string
          sort?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean
          key?: string
          name?: string
          sort?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_types_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_venues: {
        Row: {
          created_at: string
          event_id: string
          id: string
          is_primary: boolean
          notes: string | null
          position: number
          updated_at: string
          venue_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          position?: number
          updated_at?: string
          venue_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          position?: number
          updated_at?: string
          venue_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_venues_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_venues_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_venues_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_venues_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_waitlist: {
        Row: {
          created_at: string
          email: string | null
          event_id: string
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          event_id: string
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          event_id?: string
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_waitlist_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_waitlist_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_waitlist_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_zones: {
        Row: {
          capacity: number | null
          created_at: string
          created_by: string | null
          current_occupancy: number | null
          deleted_at: string | null
          event_id: string
          id: string
          name: string
          notes: string | null
          status: string
          updated_at: string
          workspace_id: string
          zone_type: string | null
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          current_occupancy?: number | null
          deleted_at?: string | null
          event_id: string
          id?: string
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
          zone_type?: string | null
        }
        Update: {
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          current_occupancy?: number | null
          deleted_at?: string | null
          event_id?: string
          id?: string
          name?: string
          notes?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
          zone_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_zones_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_zones_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_zones_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          brief_notes: string | null
          budget_cents: number
          cancelled_at: string | null
          capacity_online: number | null
          client_company: string | null
          client_email: string | null
          client_id: string | null
          client_name: string | null
          client_phone: string | null
          completed_at: string | null
          confirmed_at: string | null
          cover_image_url: string | null
          cover_path: string | null
          created_at: string
          created_by: string
          currency: string | null
          deleted_at: string | null
          description: string | null
          end_at: string | null
          event_format: string | null
          event_type: string | null
          flagged: boolean
          flagged_at: string | null
          flagged_by: string | null
          flagged_reason: string | null
          floor_plan_url: string | null
          guest_count_day: number
          guest_count_evening: number
          id: string
          internal_notes: string | null
          is_hybrid: boolean | null
          is_public: boolean | null
          is_ticketed: boolean | null
          is_vip: boolean | null
          layout_mode: string | null
          location: string | null
          loss_reason: string | null
          name: string
          next_action: string | null
          next_action_due: string | null
          objectives: string | null
          owner_user_id: string | null
          pipeline_notes: string | null
          quote_value_cents: number | null
          readiness_score: number | null
          risk_level: string | null
          slug: string | null
          start_at: string | null
          status: string
          tags: string[] | null
          template_id: string | null
          updated_at: string
          venue_address_snapshot: string | null
          venue_capacity_snapshot: number | null
          venue_id: string | null
          venue_name_snapshot: string | null
          venue_snapshot_at: string | null
          workspace_id: string
        }
        Insert: {
          brief_notes?: string | null
          budget_cents?: number
          cancelled_at?: string | null
          capacity_online?: number | null
          client_company?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name?: string | null
          client_phone?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          cover_image_url?: string | null
          cover_path?: string | null
          created_at?: string
          created_by: string
          currency?: string | null
          deleted_at?: string | null
          description?: string | null
          end_at?: string | null
          event_format?: string | null
          event_type?: string | null
          flagged?: boolean
          flagged_at?: string | null
          flagged_by?: string | null
          flagged_reason?: string | null
          floor_plan_url?: string | null
          guest_count_day?: number
          guest_count_evening?: number
          id?: string
          internal_notes?: string | null
          is_hybrid?: boolean | null
          is_public?: boolean | null
          is_ticketed?: boolean | null
          is_vip?: boolean | null
          layout_mode?: string | null
          location?: string | null
          loss_reason?: string | null
          name: string
          next_action?: string | null
          next_action_due?: string | null
          objectives?: string | null
          owner_user_id?: string | null
          pipeline_notes?: string | null
          quote_value_cents?: number | null
          readiness_score?: number | null
          risk_level?: string | null
          slug?: string | null
          start_at?: string | null
          status?: string
          tags?: string[] | null
          template_id?: string | null
          updated_at?: string
          venue_address_snapshot?: string | null
          venue_capacity_snapshot?: number | null
          venue_id?: string | null
          venue_name_snapshot?: string | null
          venue_snapshot_at?: string | null
          workspace_id: string
        }
        Update: {
          brief_notes?: string | null
          budget_cents?: number
          cancelled_at?: string | null
          capacity_online?: number | null
          client_company?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name?: string | null
          client_phone?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          cover_image_url?: string | null
          cover_path?: string | null
          created_at?: string
          created_by?: string
          currency?: string | null
          deleted_at?: string | null
          description?: string | null
          end_at?: string | null
          event_format?: string | null
          event_type?: string | null
          flagged?: boolean
          flagged_at?: string | null
          flagged_by?: string | null
          flagged_reason?: string | null
          floor_plan_url?: string | null
          guest_count_day?: number
          guest_count_evening?: number
          id?: string
          internal_notes?: string | null
          is_hybrid?: boolean | null
          is_public?: boolean | null
          is_ticketed?: boolean | null
          is_vip?: boolean | null
          layout_mode?: string | null
          location?: string | null
          loss_reason?: string | null
          name?: string
          next_action?: string | null
          next_action_due?: string | null
          objectives?: string | null
          owner_user_id?: string | null
          pipeline_notes?: string | null
          quote_value_cents?: number | null
          readiness_score?: number | null
          risk_level?: string | null
          slug?: string | null
          start_at?: string | null
          status?: string
          tags?: string[] | null
          template_id?: string | null
          updated_at?: string
          venue_address_snapshot?: string | null
          venue_capacity_snapshot?: number | null
          venue_id?: string | null
          venue_name_snapshot?: string | null
          venue_snapshot_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "event_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          enabled: boolean
          key: string
          notes: string | null
          rollout_pct: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          key: string
          notes?: string | null
          rollout_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          key?: string
          notes?: string | null
          rollout_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      finance_activity_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          event_id: string | null
          id: string
          metadata: Json
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          event_id?: string | null
          id?: string
          metadata?: Json
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_id?: string | null
          id?: string
          metadata?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_activity_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_activity_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_activity_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      form_fields: {
        Row: {
          field_type: string
          form_id: string
          id: string
          label: string
          options: Json
          placeholder: string | null
          required: boolean
          settings: Json
          sort_order: number
          workspace_id: string
        }
        Insert: {
          field_type: string
          form_id: string
          id?: string
          label: string
          options?: Json
          placeholder?: string | null
          required?: boolean
          settings?: Json
          sort_order?: number
          workspace_id: string
        }
        Update: {
          field_type?: string
          form_id?: string
          id?: string
          label?: string
          options?: Json
          placeholder?: string | null
          required?: boolean
          settings?: Json
          sort_order?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_fields_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          created_at: string
          created_lead_id: string | null
          data: Json
          form_id: string
          id: string
          ip_address: string | null
          submitter_email: string | null
          submitter_name: string | null
          user_agent: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_lead_id?: string | null
          data?: Json
          form_id: string
          id?: string
          ip_address?: string | null
          submitter_email?: string | null
          submitter_name?: string | null
          user_agent?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_lead_id?: string | null
          data?: Json
          form_id?: string
          id?: string
          ip_address?: string | null
          submitter_email?: string | null
          submitter_name?: string | null
          user_agent?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_created_lead_id_fkey"
            columns: ["created_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          event_id: string | null
          form_type: string
          id: string
          settings: Json
          share_token: string | null
          status: string
          submission_count: number
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          event_id?: string | null
          form_type?: string
          id?: string
          settings?: Json
          share_token?: string | null
          status?: string
          submission_count?: number
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          event_id?: string | null
          form_type?: string
          id?: string
          settings?: Json
          share_token?: string | null
          status?: string
          submission_count?: number
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      founder_entitlements: {
        Row: {
          affiliate_admin: boolean
          created_at: string
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          id: string
          reason: string | null
          revoked_at: string | null
          top_plan_free: boolean
          unlimited_ai: boolean
          unlimited_automation: boolean
          unlimited_storage: boolean
          unlimited_workspaces: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          affiliate_admin?: boolean
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          reason?: string | null
          revoked_at?: string | null
          top_plan_free?: boolean
          unlimited_ai?: boolean
          unlimited_automation?: boolean
          unlimited_storage?: boolean
          unlimited_workspaces?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          affiliate_admin?: boolean
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          reason?: string | null
          revoked_at?: string | null
          top_plan_free?: boolean
          unlimited_ai?: boolean
          unlimited_automation?: boolean
          unlimited_storage?: boolean
          unlimited_workspaces?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      incident_updates: {
        Row: {
          body: string
          created_at: string
          id: string
          incident_id: string
          status: string
          ts: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          incident_id: string
          status: string
          ts?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          incident_id?: string
          status?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_updates_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          body_md: string
          components: string[]
          created_at: string
          ended_at: string | null
          id: string
          severity: string
          started_at: string
          title: string
          updated_at: string
        }
        Insert: {
          body_md?: string
          components?: string[]
          created_at?: string
          ended_at?: string | null
          id?: string
          severity: string
          started_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          body_md?: string
          components?: string[]
          created_at?: string
          ended_at?: string | null
          id?: string
          severity?: string
          started_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      insight_user_state: {
        Row: {
          acted_at: string
          insight_id: string
          snooze_until: string | null
          status: string
          user_id: string
        }
        Insert: {
          acted_at?: string
          insight_id: string
          snooze_until?: string | null
          status?: string
          user_id: string
        }
        Update: {
          acted_at?: string
          insight_id?: string
          snooze_until?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insight_user_state_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "insights"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          author_user_id: string | null
          category: Database["public"]["Enums"]["insight_category"]
          created_at: string
          delta: string | null
          entity_id: string | null
          entity_type: string | null
          evidence: Json
          expires_at: string | null
          id: string
          impact: Database["public"]["Enums"]["insight_impact"]
          metric_label: string | null
          metric_value: string | null
          narrative: string
          period: string | null
          produced_at: string
          source: string
          source_key: string | null
          spark: number[]
          title: string
          trend: Database["public"]["Enums"]["insight_trend"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          author_user_id?: string | null
          category: Database["public"]["Enums"]["insight_category"]
          created_at?: string
          delta?: string | null
          entity_id?: string | null
          entity_type?: string | null
          evidence?: Json
          expires_at?: string | null
          id?: string
          impact?: Database["public"]["Enums"]["insight_impact"]
          metric_label?: string | null
          metric_value?: string | null
          narrative: string
          period?: string | null
          produced_at?: string
          source?: string
          source_key?: string | null
          spark?: number[]
          title: string
          trend?: Database["public"]["Enums"]["insight_trend"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          author_user_id?: string | null
          category?: Database["public"]["Enums"]["insight_category"]
          created_at?: string
          delta?: string | null
          entity_id?: string | null
          entity_type?: string | null
          evidence?: Json
          expires_at?: string | null
          id?: string
          impact?: Database["public"]["Enums"]["insight_impact"]
          metric_label?: string | null
          metric_value?: string | null
          narrative?: string
          period?: string | null
          produced_at?: string
          source?: string
          source_key?: string | null
          spark?: number[]
          title?: string
          trend?: Database["public"]["Enums"]["insight_trend"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      integration_connections: {
        Row: {
          config: Json
          connect_type: string
          connected_at: string | null
          connected_by: string | null
          created_at: string
          environment: string
          id: string
          last_sync_at: string | null
          provider: string
          secret_last4: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          config?: Json
          connect_type?: string
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          environment?: string
          id?: string
          last_sync_at?: string | null
          provider: string
          secret_last4?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          config?: Json
          connect_type?: string
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          environment?: string
          id?: string
          last_sync_at?: string | null
          provider?: string
          secret_last4?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_webhook_deliveries: {
        Row: {
          attempt: number
          created_at: string
          event_type: string
          id: string
          payload: Json
          response_code: number | null
          status: string
          webhook_id: string
          workspace_id: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          response_code?: number | null
          status?: string
          webhook_id: string
          workspace_id: string
        }
        Update: {
          attempt?: number
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          response_code?: number | null
          status?: string
          webhook_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "integration_webhooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_webhook_deliveries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_webhooks: {
        Row: {
          connection_id: string | null
          created_at: string
          created_by: string | null
          direction: string
          endpoint_url: string | null
          id: string
          retry_policy: Json
          secret_hash: string | null
          status: string
          subscribed_events: string[]
          token: string | null
          workspace_id: string
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          direction: string
          endpoint_url?: string | null
          id?: string
          retry_policy?: Json
          secret_hash?: string | null
          status?: string
          subscribed_events?: string[]
          token?: string | null
          workspace_id: string
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          endpoint_url?: string | null
          id?: string
          retry_policy?: Json
          secret_hash?: string | null
          status?: string
          subscribed_events?: string[]
          token?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_webhooks_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_webhooks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_files: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          invoice_id: string
          mime_type: string | null
          name: string
          size_bytes: number | null
          storage_key: string
          uploaded_by_contact_id: string | null
          uploaded_by_type: string
          uploaded_by_user_id: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          invoice_id: string
          mime_type?: string | null
          name: string
          size_bytes?: number | null
          storage_key: string
          uploaded_by_contact_id?: string | null
          uploaded_by_type?: string
          uploaded_by_user_id?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          invoice_id?: string
          mime_type?: string | null
          name?: string
          size_bytes?: number | null
          storage_key?: string
          uploaded_by_contact_id?: string | null
          uploaded_by_type?: string
          uploaded_by_user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_files_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_files_uploaded_by_contact_id_fkey"
            columns: ["uploaded_by_contact_id"]
            isOneToOne: false
            referencedRelation: "supplier_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_files_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          position: number
          quantity: number
          tax_rate_bps: number
          unit_cost_cents: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          position?: number
          quantity?: number
          tax_rate_bps?: number
          unit_cost_cents?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          position?: number
          quantity?: number
          tax_rate_bps?: number
          unit_cost_cents?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          catalog_item_id: string | null
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_total_cents: number
          qty_x100: number
          sort_order: number
          tax_pct_x100: number
          unit_price_cents: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          catalog_item_id?: string | null
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          line_total_cents?: number
          qty_x100?: number
          sort_order?: number
          tax_pct_x100?: number
          unit_price_cents?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          catalog_item_id?: string | null
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_total_cents?: number
          qty_x100?: number
          sort_order?: number
          tax_pct_x100?: number
          unit_price_cents?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payment_schedules: {
        Row: {
          amount_cents: number
          created_at: string
          due_date: string
          id: string
          invoice_id: string
          label: string
          notes: string | null
          paid_at: string | null
          percentage: number | null
          sort_order: number
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          due_date: string
          id?: string
          invoice_id: string
          label: string
          notes?: string | null
          paid_at?: string | null
          percentage?: number | null
          sort_order?: number
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          due_date?: string
          id?: string
          invoice_id?: string
          label?: string
          notes?: string | null
          paid_at?: string | null
          percentage?: number | null
          sort_order?: number
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payment_schedules_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_schedules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          invoice_id: string
          method: string | null
          paid_at: string | null
          payer_email: string | null
          raw_event_id: string | null
          receipt_sent_at: string | null
          refund_reason: string | null
          refund_receipt_sent_at: string | null
          status: string
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency: string
          id?: string
          invoice_id: string
          method?: string | null
          paid_at?: string | null
          payer_email?: string | null
          raw_event_id?: string | null
          receipt_sent_at?: string | null
          refund_reason?: string | null
          refund_receipt_sent_at?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string
          method?: string | null
          paid_at?: string | null
          payer_email?: string | null
          raw_event_id?: string | null
          receipt_sent_at?: string | null
          refund_reason?: string | null
          refund_receipt_sent_at?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_portal_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          fail_count: number
          id: string
          invoice_id: string
          last_receipt_resend_at: string | null
          last_used_at: string | null
          locked_until: string | null
          receipt_resend_count: number
          recipient_email: string
          revoke_reason: string | null
          revoked_at: string | null
          scope: string
          token_hash: string
          used_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          fail_count?: number
          id?: string
          invoice_id: string
          last_receipt_resend_at?: string | null
          last_used_at?: string | null
          locked_until?: string | null
          receipt_resend_count?: number
          recipient_email: string
          revoke_reason?: string | null
          revoked_at?: string | null
          scope?: string
          token_hash: string
          used_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          fail_count?: number
          id?: string
          invoice_id?: string
          last_receipt_resend_at?: string | null
          last_used_at?: string | null
          locked_until?: string | null
          receipt_resend_count?: number
          recipient_email?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          scope?: string
          token_hash?: string
          used_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_portal_tokens_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_portal_tokens_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reminder_settings: {
        Row: {
          channel: string
          created_at: string
          daily_cap: number
          enabled: boolean
          post_due_days: number[]
          pre_due_days: number[]
          quiet_weekends: boolean
          send_at_due: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          daily_cap?: number
          enabled?: boolean
          post_due_days?: number[]
          pre_due_days?: number[]
          quiet_weekends?: boolean
          send_at_due?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          daily_cap?: number
          enabled?: boolean
          post_due_days?: number[]
          pre_due_days?: number[]
          quiet_weekends?: boolean
          send_at_due?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reminder_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reminders: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          invoice_id: string
          kind: Database["public"]["Enums"]["invoice_reminder_kind"]
          message_id: string | null
          recipient_email: string | null
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_reminder_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          invoice_id: string
          kind: Database["public"]["Enums"]["invoice_reminder_kind"]
          message_id?: string | null
          recipient_email?: string | null
          scheduled_for: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_reminder_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          invoice_id?: string
          kind?: Database["public"]["Enums"]["invoice_reminder_kind"]
          message_id?: string | null
          recipient_email?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_reminder_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_reminders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          archived_at: string | null
          client_email: string | null
          client_name: string | null
          created_at: string
          created_by: string | null
          currency: string
          due_on: string | null
          event_id: string | null
          id: string
          invoice_number: string
          issued_on: string | null
          locked_at: string | null
          notes: string | null
          paid_cents: number
          payment_received_at: string | null
          pdf_version: number
          quote_id: string | null
          reference: string | null
          reminder_sent_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          stripe_account_id: string | null
          stripe_payment_link_url: string | null
          subtotal_cents: number
          supplier_id: string | null
          tax_cents: number
          total_cents: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          client_email?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_on?: string | null
          event_id?: string | null
          id?: string
          invoice_number: string
          issued_on?: string | null
          locked_at?: string | null
          notes?: string | null
          paid_cents?: number
          payment_received_at?: string | null
          pdf_version?: number
          quote_id?: string | null
          reference?: string | null
          reminder_sent_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_account_id?: string | null
          stripe_payment_link_url?: string | null
          subtotal_cents?: number
          supplier_id?: string | null
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          client_email?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_on?: string | null
          event_id?: string | null
          id?: string
          invoice_number?: string
          issued_on?: string | null
          locked_at?: string | null
          notes?: string | null
          paid_cents?: number
          payment_received_at?: string | null
          pdf_version?: number
          quote_id?: string | null
          reference?: string | null
          reminder_sent_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_account_id?: string | null
          stripe_payment_link_url?: string | null
          subtotal_cents?: number
          supplier_id?: string | null
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: string | null
          id: string
          lead_id: string
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          lead_id: string
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          lead_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          accessibility_notes: string | null
          additional_requirements: string | null
          alcohol_bar: boolean
          alt_email: string | null
          alt_phone: string | null
          assigned_to: string | null
          budget_estimate_cents: number | null
          budget_max_cents: number | null
          budget_min_cents: number | null
          campaign: string | null
          city: string | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          company_name: string | null
          contact_timezone: string | null
          converted_event_id: string | null
          cover_image_url: string | null
          cover_theme: string | null
          created_at: string
          created_by: string | null
          currency: string
          date_flexibility: string | null
          decision_maker: boolean
          deleted_at: string | null
          enquiry_channel: string | null
          event_date: string | null
          event_format: string | null
          event_location: string | null
          event_purpose: string | null
          event_type: string | null
          follow_up_cadence: string | null
          guest_count_estimate: number | null
          id: string
          internal_comments: string | null
          is_draft: boolean
          is_international: boolean
          job_title: string | null
          landing_page: string | null
          lead_score: number | null
          lead_score_breakdown: Json
          lead_temperature: string | null
          lead_title: string | null
          licensing_notes: string | null
          lost_reason: string | null
          marketing_consent: boolean
          minors_present: boolean
          multi_room: boolean
          next_actions: Json
          notes: string | null
          preferred_contact_method: string | null
          preferred_contact_time: string | null
          priority: string
          probability_pct: number | null
          qualification: Json
          reference_links: Json
          referrer: string | null
          remote_platform: string | null
          response_due_date: string | null
          response_sla_hours: number | null
          source: string | null
          stage: string
          tags: string[]
          ticketing_type: string | null
          title: string
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          venue_types: string[]
          wizard_step: string
          workspace_id: string
        }
        Insert: {
          accessibility_notes?: string | null
          additional_requirements?: string | null
          alcohol_bar?: boolean
          alt_email?: string | null
          alt_phone?: string | null
          assigned_to?: string | null
          budget_estimate_cents?: number | null
          budget_max_cents?: number | null
          budget_min_cents?: number | null
          campaign?: string | null
          city?: string | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          company_name?: string | null
          contact_timezone?: string | null
          converted_event_id?: string | null
          cover_image_url?: string | null
          cover_theme?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          date_flexibility?: string | null
          decision_maker?: boolean
          deleted_at?: string | null
          enquiry_channel?: string | null
          event_date?: string | null
          event_format?: string | null
          event_location?: string | null
          event_purpose?: string | null
          event_type?: string | null
          follow_up_cadence?: string | null
          guest_count_estimate?: number | null
          id?: string
          internal_comments?: string | null
          is_draft?: boolean
          is_international?: boolean
          job_title?: string | null
          landing_page?: string | null
          lead_score?: number | null
          lead_score_breakdown?: Json
          lead_temperature?: string | null
          lead_title?: string | null
          licensing_notes?: string | null
          lost_reason?: string | null
          marketing_consent?: boolean
          minors_present?: boolean
          multi_room?: boolean
          next_actions?: Json
          notes?: string | null
          preferred_contact_method?: string | null
          preferred_contact_time?: string | null
          priority?: string
          probability_pct?: number | null
          qualification?: Json
          reference_links?: Json
          referrer?: string | null
          remote_platform?: string | null
          response_due_date?: string | null
          response_sla_hours?: number | null
          source?: string | null
          stage?: string
          tags?: string[]
          ticketing_type?: string | null
          title: string
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          venue_types?: string[]
          wizard_step?: string
          workspace_id: string
        }
        Update: {
          accessibility_notes?: string | null
          additional_requirements?: string | null
          alcohol_bar?: boolean
          alt_email?: string | null
          alt_phone?: string | null
          assigned_to?: string | null
          budget_estimate_cents?: number | null
          budget_max_cents?: number | null
          budget_min_cents?: number | null
          campaign?: string | null
          city?: string | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          company_name?: string | null
          contact_timezone?: string | null
          converted_event_id?: string | null
          cover_image_url?: string | null
          cover_theme?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          date_flexibility?: string | null
          decision_maker?: boolean
          deleted_at?: string | null
          enquiry_channel?: string | null
          event_date?: string | null
          event_format?: string | null
          event_location?: string | null
          event_purpose?: string | null
          event_type?: string | null
          follow_up_cadence?: string | null
          guest_count_estimate?: number | null
          id?: string
          internal_comments?: string | null
          is_draft?: boolean
          is_international?: boolean
          job_title?: string | null
          landing_page?: string | null
          lead_score?: number | null
          lead_score_breakdown?: Json
          lead_temperature?: string | null
          lead_title?: string | null
          licensing_notes?: string | null
          lost_reason?: string | null
          marketing_consent?: boolean
          minors_present?: boolean
          multi_room?: boolean
          next_actions?: Json
          notes?: string | null
          preferred_contact_method?: string | null
          preferred_contact_time?: string | null
          priority?: string
          probability_pct?: number | null
          qualification?: Json
          reference_links?: Json
          referrer?: string | null
          remote_platform?: string | null
          response_due_date?: string | null
          response_sla_hours?: number | null
          source?: string | null
          stage?: string
          tags?: string[]
          ticketing_type?: string | null
          title?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          venue_types?: string[]
          wizard_step?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_converted_event_id_fkey"
            columns: ["converted_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_event_id_fkey"
            columns: ["converted_event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      library_asset_links: {
        Row: {
          asset_id: string
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          relation: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          relation?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          relation?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_asset_links_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "library_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      library_assets: {
        Row: {
          approval_status: string
          brand_id: string | null
          collection_id: string | null
          cover_storage_path: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          duration_seconds: number | null
          entity_id: string | null
          entity_type: string | null
          height: number | null
          id: string
          kind: Database["public"]["Enums"]["library_asset_kind"]
          last_used_at: string | null
          locked_at: string | null
          locked_by_user_id: string | null
          metadata: Json
          mime: string | null
          owner_user_id: string | null
          page_count: number | null
          pinned_at: string | null
          sha256: string | null
          size_bytes: number
          storage_path: string | null
          tags: string[]
          title: string
          updated_at: string
          use_count: number
          visibility: Database["public"]["Enums"]["library_visibility"]
          width: number | null
          workspace_id: string
        }
        Insert: {
          approval_status?: string
          brand_id?: string | null
          collection_id?: string | null
          cover_storage_path?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration_seconds?: number | null
          entity_id?: string | null
          entity_type?: string | null
          height?: number | null
          id?: string
          kind: Database["public"]["Enums"]["library_asset_kind"]
          last_used_at?: string | null
          locked_at?: string | null
          locked_by_user_id?: string | null
          metadata?: Json
          mime?: string | null
          owner_user_id?: string | null
          page_count?: number | null
          pinned_at?: string | null
          sha256?: string | null
          size_bytes?: number
          storage_path?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          use_count?: number
          visibility?: Database["public"]["Enums"]["library_visibility"]
          width?: number | null
          workspace_id: string
        }
        Update: {
          approval_status?: string
          brand_id?: string | null
          collection_id?: string | null
          cover_storage_path?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration_seconds?: number | null
          entity_id?: string | null
          entity_type?: string | null
          height?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["library_asset_kind"]
          last_used_at?: string | null
          locked_at?: string | null
          locked_by_user_id?: string | null
          metadata?: Json
          mime?: string | null
          owner_user_id?: string | null
          page_count?: number | null
          pinned_at?: string | null
          sha256?: string | null
          size_bytes?: number
          storage_path?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          use_count?: number
          visibility?: Database["public"]["Enums"]["library_visibility"]
          width?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_assets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_assets_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "library_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      library_collection_members: {
        Row: {
          added_at: string
          added_by: string | null
          asset_id: string
          collection_id: string
          position: number
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          asset_id: string
          collection_id: string
          position?: number
        }
        Update: {
          added_at?: string
          added_by?: string | null
          asset_id?: string
          collection_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "library_collection_members_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "library_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_collection_members_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "library_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      library_collections: {
        Row: {
          audience: string | null
          auto_filter: Json
          cover_storage_path: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_smart: boolean
          kind: Database["public"]["Enums"]["library_collection_kind"]
          name: string
          slug: string
          updated_at: string
          visibility: Database["public"]["Enums"]["library_visibility"]
          workspace_id: string
        }
        Insert: {
          audience?: string | null
          auto_filter?: Json
          cover_storage_path?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_smart?: boolean
          kind?: Database["public"]["Enums"]["library_collection_kind"]
          name: string
          slug: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["library_visibility"]
          workspace_id: string
        }
        Update: {
          audience?: string | null
          auto_filter?: Json
          cover_storage_path?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_smart?: boolean
          kind?: Database["public"]["Enums"]["library_collection_kind"]
          name?: string
          slug?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["library_visibility"]
          workspace_id?: string
        }
        Relationships: []
      }
      library_settings: {
        Row: {
          allowed_mime: string[]
          created_at: string
          default_visibility: Database["public"]["Enums"]["library_visibility"]
          notify_on_expire: boolean
          notify_on_share: boolean
          retention_days: number
          storage_quota_bytes: number
          updated_at: string
          watermark_enabled: boolean
          watermark_text: string | null
          workspace_id: string
        }
        Insert: {
          allowed_mime?: string[]
          created_at?: string
          default_visibility?: Database["public"]["Enums"]["library_visibility"]
          notify_on_expire?: boolean
          notify_on_share?: boolean
          retention_days?: number
          storage_quota_bytes?: number
          updated_at?: string
          watermark_enabled?: boolean
          watermark_text?: string | null
          workspace_id: string
        }
        Update: {
          allowed_mime?: string[]
          created_at?: string
          default_visibility?: Database["public"]["Enums"]["library_visibility"]
          notify_on_expire?: boolean
          notify_on_share?: boolean
          retention_days?: number
          storage_quota_bytes?: number
          updated_at?: string
          watermark_enabled?: boolean
          watermark_text?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      library_share_links: {
        Row: {
          asset_id: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          max_uses: number | null
          password_hash: string | null
          revoked_at: string | null
          scope: Database["public"]["Enums"]["library_share_scope"]
          token: string
          use_count: number
        }
        Insert: {
          asset_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          password_hash?: string | null
          revoked_at?: string | null
          scope?: Database["public"]["Enums"]["library_share_scope"]
          token: string
          use_count?: number
        }
        Update: {
          asset_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          password_hash?: string | null
          revoked_at?: string | null
          scope?: Database["public"]["Enums"]["library_share_scope"]
          token?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "library_share_links_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "library_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      library_versions: {
        Row: {
          asset_id: string
          author_user_id: string | null
          created_at: string
          id: string
          note: string | null
          sha256: string | null
          size_bytes: number
          storage_path: string
          version: number
        }
        Insert: {
          asset_id: string
          author_user_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          sha256?: string | null
          size_bytes?: number
          storage_path: string
          version: number
        }
        Update: {
          asset_id?: string
          author_user_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          sha256?: string | null
          size_bytes?: number
          storage_path?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "library_versions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "library_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_booking_milestones: {
        Row: {
          amount_cents: number
          booking_id: string
          created_at: string
          due_date: string | null
          id: string
          label: string
          released_at: string | null
          sequence: number
          status: string
        }
        Insert: {
          amount_cents: number
          booking_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          label: string
          released_at?: string | null
          sequence: number
          status?: string
        }
        Update: {
          amount_cents?: number
          booking_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          label?: string
          released_at?: string | null
          sequence?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_booking_milestones_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "marketplace_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_bookings: {
        Row: {
          booking_date: string
          buyer_admin_fee_bps: number
          buyer_admin_fee_cents: number | null
          buyer_customer_id: string | null
          buyer_total_cents: number | null
          buyer_workspace_id: string | null
          created_at: string
          currency: string
          event_id: string | null
          id: string
          listing_id: string
          marketplace_event_id: string | null
          price_cents: number
          status: string
          stripe_payment_intent_id: string | null
          stripe_transfer_id: string | null
          supplier_commission_bps: number
          supplier_payout_cents: number | null
          supplier_workspace_id: string
          updated_at: string
        }
        Insert: {
          booking_date: string
          buyer_admin_fee_bps?: number
          buyer_admin_fee_cents?: number | null
          buyer_customer_id?: string | null
          buyer_total_cents?: number | null
          buyer_workspace_id?: string | null
          created_at?: string
          currency?: string
          event_id?: string | null
          id?: string
          listing_id: string
          marketplace_event_id?: string | null
          price_cents?: number
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_transfer_id?: string | null
          supplier_commission_bps?: number
          supplier_payout_cents?: number | null
          supplier_workspace_id: string
          updated_at?: string
        }
        Update: {
          booking_date?: string
          buyer_admin_fee_bps?: number
          buyer_admin_fee_cents?: number | null
          buyer_customer_id?: string | null
          buyer_total_cents?: number | null
          buyer_workspace_id?: string | null
          created_at?: string
          currency?: string
          event_id?: string | null
          id?: string
          listing_id?: string
          marketplace_event_id?: string | null
          price_cents?: number
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_transfer_id?: string | null
          supplier_commission_bps?: number
          supplier_payout_cents?: number | null
          supplier_workspace_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_bookings_buyer_customer_id_fkey"
            columns: ["buyer_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_bookings_buyer_workspace_id_fkey"
            columns: ["buyer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_bookings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_bookings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_bookings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_bookings_marketplace_event_id_fkey"
            columns: ["marketplace_event_id"]
            isOneToOne: false
            referencedRelation: "marketplace_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_bookings_supplier_workspace_id_fkey"
            columns: ["supplier_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_comparison_items: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_comparison_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_comparison_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_enquiries: {
        Row: {
          buyer_workspace_id: string
          created_at: string
          created_by: string
          event_date: string | null
          event_id: string | null
          event_type: string | null
          guest_count: number | null
          id: string
          listing_id: string
          message: string
          status: string
          supplier_workspace_id: string
          updated_at: string
        }
        Insert: {
          buyer_workspace_id: string
          created_at?: string
          created_by: string
          event_date?: string | null
          event_id?: string | null
          event_type?: string | null
          guest_count?: number | null
          id?: string
          listing_id: string
          message: string
          status?: string
          supplier_workspace_id: string
          updated_at?: string
        }
        Update: {
          buyer_workspace_id?: string
          created_at?: string
          created_by?: string
          event_date?: string | null
          event_id?: string | null
          event_type?: string | null
          guest_count?: number | null
          id?: string
          listing_id?: string
          message?: string
          status?: string
          supplier_workspace_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_enquiries_buyer_workspace_id_fkey"
            columns: ["buyer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_enquiries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_enquiries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_enquiries_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_enquiries_supplier_workspace_id_fkey"
            columns: ["supplier_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_enquiry_messages: {
        Row: {
          body: string
          created_at: string
          enquiry_id: string
          id: string
          sender_user_id: string
          sender_workspace_id: string
        }
        Insert: {
          body: string
          created_at?: string
          enquiry_id: string
          id?: string
          sender_user_id: string
          sender_workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string
          enquiry_id?: string
          id?: string
          sender_user_id?: string
          sender_workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_enquiry_messages_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "marketplace_enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_enquiry_messages_sender_workspace_id_fkey"
            columns: ["sender_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_event_items: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          listing_id: string
          marketplace_event_id: string
          price_cents: number
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          listing_id: string
          marketplace_event_id: string
          price_cents?: number
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          listing_id?: string
          marketplace_event_id?: string
          price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_event_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_event_items_marketplace_event_id_fkey"
            columns: ["marketplace_event_id"]
            isOneToOne: false
            referencedRelation: "marketplace_events"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_events: {
        Row: {
          budget_cents: number | null
          created_at: string
          customer_id: string | null
          event_date: string | null
          event_type: string
          guest_count: number | null
          guest_email: string | null
          guest_name: string | null
          id: string
          postcode: string | null
          status: string
          stripe_session_id: string | null
          updated_at: string
        }
        Insert: {
          budget_cents?: number | null
          created_at?: string
          customer_id?: string | null
          event_date?: string | null
          event_type: string
          guest_count?: number | null
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          postcode?: string | null
          status?: string
          stripe_session_id?: string | null
          updated_at?: string
        }
        Update: {
          budget_cents?: number | null
          created_at?: string
          customer_id?: string | null
          event_date?: string | null
          event_type?: string
          guest_count?: number | null
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          postcode?: string | null
          status?: string
          stripe_session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_favourites: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_favourites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_favourites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listing_availability: {
        Row: {
          booking_id: string | null
          created_at: string
          date: string
          id: string
          listing_id: string
          status: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          date: string
          id?: string
          listing_id: string
          status?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          date?: string
          id?: string
          listing_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listing_availability_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          accessible: boolean | null
          category: string
          compliance_grade: string | null
          cover_image_url: string | null
          coverage_regions: string[]
          created_at: string
          currency: string
          description: string | null
          featured: boolean
          gallery: Json
          id: string
          lead_time_label: string | null
          preferred: boolean
          price_from_cents: number
          price_unit: string
          rating_avg: number | null
          rating_count: number
          response_rate: number | null
          response_time_label: string | null
          seated_capacity: number | null
          slug: string | null
          standing_capacity: number | null
          status: string
          tags: string[]
          title: string
          top_rated: boolean
          updated_at: string
          verified: boolean
          workspace_id: string
        }
        Insert: {
          accessible?: boolean | null
          category: string
          compliance_grade?: string | null
          cover_image_url?: string | null
          coverage_regions?: string[]
          created_at?: string
          currency?: string
          description?: string | null
          featured?: boolean
          gallery?: Json
          id?: string
          lead_time_label?: string | null
          preferred?: boolean
          price_from_cents?: number
          price_unit?: string
          rating_avg?: number | null
          rating_count?: number
          response_rate?: number | null
          response_time_label?: string | null
          seated_capacity?: number | null
          slug?: string | null
          standing_capacity?: number | null
          status?: string
          tags?: string[]
          title: string
          top_rated?: boolean
          updated_at?: string
          verified?: boolean
          workspace_id: string
        }
        Update: {
          accessible?: boolean | null
          category?: string
          compliance_grade?: string | null
          cover_image_url?: string | null
          coverage_regions?: string[]
          created_at?: string
          currency?: string
          description?: string | null
          featured?: boolean
          gallery?: Json
          id?: string
          lead_time_label?: string | null
          preferred?: boolean
          price_from_cents?: number
          price_unit?: string
          rating_avg?: number | null
          rating_count?: number
          response_rate?: number | null
          response_time_label?: string | null
          seated_capacity?: number | null
          slug?: string | null
          standing_capacity?: number | null
          status?: string
          tags?: string[]
          title?: string
          top_rated?: boolean
          updated_at?: string
          verified?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_quote_line_items: {
        Row: {
          id: string
          label: string
          quantity: number
          quote_id: string
          sort_order: number
          total_cents: number
          unit_price_cents: number
        }
        Insert: {
          id?: string
          label: string
          quantity?: number
          quote_id: string
          sort_order?: number
          total_cents: number
          unit_price_cents: number
        }
        Update: {
          id?: string
          label?: string
          quantity?: number
          quote_id?: string
          sort_order?: number
          total_cents?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_quote_line_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "marketplace_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_quote_requests: {
        Row: {
          buyer_workspace_id: string
          created_at: string
          created_by: string
          event_date: string | null
          event_id: string | null
          id: string
          listing_id: string
          requirements: string | null
          status: string
          supplier_workspace_id: string
          updated_at: string
        }
        Insert: {
          buyer_workspace_id: string
          created_at?: string
          created_by: string
          event_date?: string | null
          event_id?: string | null
          id?: string
          listing_id: string
          requirements?: string | null
          status?: string
          supplier_workspace_id: string
          updated_at?: string
        }
        Update: {
          buyer_workspace_id?: string
          created_at?: string
          created_by?: string
          event_date?: string | null
          event_id?: string | null
          id?: string
          listing_id?: string
          requirements?: string | null
          status?: string
          supplier_workspace_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_quote_requests_buyer_workspace_id_fkey"
            columns: ["buyer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_quote_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_quote_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_quote_requests_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_quote_requests_supplier_workspace_id_fkey"
            columns: ["supplier_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_quotes: {
        Row: {
          created_at: string
          created_by: string
          currency: string
          fees_cents: number
          id: string
          notes: string | null
          quote_request_id: string
          status: string
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          currency?: string
          fees_cents?: number
          id?: string
          notes?: string | null
          quote_request_id: string
          status?: string
          subtotal_cents: number
          tax_cents?: number
          total_cents: number
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          currency?: string
          fees_cents?: number
          id?: string
          notes?: string | null
          quote_request_id?: string
          status?: string
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_quotes_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "marketplace_quote_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_recently_viewed: {
        Row: {
          id: string
          listing_id: string
          user_id: string
          viewed_at: string
          workspace_id: string
        }
        Insert: {
          id?: string
          listing_id: string
          user_id: string
          viewed_at?: string
          workspace_id: string
        }
        Update: {
          id?: string
          listing_id?: string
          user_id?: string
          viewed_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_recently_viewed_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_recently_viewed_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_review_responses: {
        Row: {
          body: string
          created_at: string
          id: string
          responder_user_id: string
          responder_workspace_id: string
          review_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          responder_user_id: string
          responder_workspace_id: string
          review_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          responder_user_id?: string
          responder_workspace_id?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_review_responses_responder_workspace_id_fkey"
            columns: ["responder_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_review_responses_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "marketplace_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_reviews: {
        Row: {
          body: string | null
          booking_id: string
          communication_rating: number | null
          created_at: string
          id: string
          listing_id: string
          professionalism_rating: number | null
          quality_rating: number | null
          rating: number
          reliability_rating: number | null
          reviewer_user_id: string
          reviewer_workspace_id: string
          value_rating: number | null
        }
        Insert: {
          body?: string | null
          booking_id: string
          communication_rating?: number | null
          created_at?: string
          id?: string
          listing_id: string
          professionalism_rating?: number | null
          quality_rating?: number | null
          rating: number
          reliability_rating?: number | null
          reviewer_user_id: string
          reviewer_workspace_id: string
          value_rating?: number | null
        }
        Update: {
          body?: string | null
          booking_id?: string
          communication_rating?: number | null
          created_at?: string
          id?: string
          listing_id?: string
          professionalism_rating?: number | null
          quality_rating?: number | null
          rating?: number
          reliability_rating?: number | null
          reviewer_user_id?: string
          reviewer_workspace_id?: string
          value_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "marketplace_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_reviews_reviewer_workspace_id_fkey"
            columns: ["reviewer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_saved_searches: {
        Row: {
          created_at: string
          id: string
          name: string
          query: Json
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          query?: Json
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          query?: Json
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_saved_searches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          archived_at: string | null
          conversation_id: string
          created_at: string
          height: number | null
          id: string
          message_id: string
          mime_type: string
          original_file_name: string
          r2_key: string
          size_bytes: number
          uploaded_by: string | null
          width: number | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          conversation_id: string
          created_at?: string
          height?: number | null
          id?: string
          message_id: string
          mime_type: string
          original_file_name: string
          r2_key: string
          size_bytes: number
          uploaded_by?: string | null
          width?: number | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          conversation_id?: string
          created_at?: string
          height?: number | null
          id?: string
          message_id?: string
          mime_type?: string
          original_file_name?: string
          r2_key?: string
          size_bytes?: number
          uploaded_by?: string | null
          width?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      message_mentions: {
        Row: {
          created_at: string
          id: string
          mentioned_user_id: string
          message_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mentioned_user_id: string
          message_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mentioned_user_id?: string
          message_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_mentions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_mentions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          body_format: string
          conversation_id: string
          created_at: string
          edited_at: string | null
          id: string
          pinned_at: string | null
          pinned_by: string | null
          reply_to_message_id: string | null
          sender_name: string | null
          sender_type: string
          sender_user_id: string | null
          status: string
          updated_at: string
          visibility: string
          withdrawn_at: string | null
          workspace_id: string
        }
        Insert: {
          body: string
          body_format?: string
          conversation_id: string
          created_at?: string
          edited_at?: string | null
          id?: string
          pinned_at?: string | null
          pinned_by?: string | null
          reply_to_message_id?: string | null
          sender_name?: string | null
          sender_type?: string
          sender_user_id?: string | null
          status?: string
          updated_at?: string
          visibility?: string
          withdrawn_at?: string | null
          workspace_id: string
        }
        Update: {
          body?: string
          body_format?: string
          conversation_id?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          pinned_at?: string | null
          pinned_by?: string | null
          reply_to_message_id?: string | null
          sender_name?: string | null
          sender_type?: string
          sender_user_id?: string | null
          status?: string
          updated_at?: string
          visibility?: string
          withdrawn_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_policies: {
        Row: {
          created_at: string
          enforcement: Database["public"]["Enums"]["mfa_enforcement"]
          grace_days: number
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          enforcement: Database["public"]["Enums"]["mfa_enforcement"]
          grace_days?: number
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          enforcement?: Database["public"]["Enums"]["mfa_enforcement"]
          grace_days?: number
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      mood_board_items: {
        Row: {
          caption: string | null
          color_hex: string | null
          created_at: string
          id: string
          mood_board_id: string
          sort_order: number
          storage_key: string | null
          workspace_id: string
        }
        Insert: {
          caption?: string | null
          color_hex?: string | null
          created_at?: string
          id?: string
          mood_board_id: string
          sort_order?: number
          storage_key?: string | null
          workspace_id: string
        }
        Update: {
          caption?: string | null
          color_hex?: string | null
          created_at?: string
          id?: string
          mood_board_id?: string
          sort_order?: number
          storage_key?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mood_board_items_mood_board_id_fkey"
            columns: ["mood_board_id"]
            isOneToOne: false
            referencedRelation: "event_mood_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mood_board_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          category: string
          created_at: string
          id: string
          link: string | null
          metadata: Json
          read_at: string | null
          severity: string
          title: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          body?: string | null
          category: string
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json
          read_at?: string | null
          severity?: string
          title: string
          user_id: string
          workspace_id: string
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json
          read_at?: string | null
          severity?: string
          title?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      numbering_settings: {
        Row: {
          created_at: string
          invoice_last_reset_period: string | null
          invoice_next_seq: number
          invoice_pad: number
          invoice_prefix: string
          invoice_reset: string
          quote_last_reset_period: string | null
          quote_next_seq: number
          quote_pad: number
          quote_prefix: string
          quote_reset: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          invoice_last_reset_period?: string | null
          invoice_next_seq?: number
          invoice_pad?: number
          invoice_prefix?: string
          invoice_reset?: string
          quote_last_reset_period?: string | null
          quote_next_seq?: number
          quote_pad?: number
          quote_prefix?: string
          quote_reset?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          invoice_last_reset_period?: string | null
          invoice_next_seq?: number
          invoice_pad?: number
          invoice_prefix?: string
          invoice_reset?: string
          quote_last_reset_period?: string | null
          quote_next_seq?: number
          quote_pad?: number
          quote_prefix?: string
          quote_reset?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      onboarding_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          meta: Json
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          meta?: Json
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          meta?: Json
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_session_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          session_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          session_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_session_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "onboarding_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_sessions: {
        Row: {
          completed_at: string | null
          completed_steps: string[]
          current_step: string | null
          draft: Json
          id: string
          portal_type: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
          workspace_draft_id: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_steps?: string[]
          current_step?: string | null
          draft?: Json
          id?: string
          portal_type: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
          workspace_draft_id?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_steps?: string[]
          current_step?: string | null
          draft?: Json
          id?: string
          portal_type?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
          workspace_draft_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_sessions_workspace_draft_id_fkey"
            columns: ["workspace_draft_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_exports: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          id: string
          pay_period_end: string
          pay_period_start: string
          status: string
          storage_key: string | null
          timesheet_ids: string[]
          total_cents: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          pay_period_end: string
          pay_period_start: string
          status?: string
          storage_key?: string | null
          timesheet_ids?: string[]
          total_cents?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          pay_period_end?: string
          pay_period_start?: string
          status?: string
          storage_key?: string | null
          timesheet_ids?: string[]
          total_cents?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_exports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_plan_changes: {
        Row: {
          applied_at: string | null
          created_at: string
          created_by: string | null
          effective_at: string
          id: string
          new_plan_code: Database["public"]["Enums"]["app_plan"]
          reason: string | null
          workspace_id: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          created_by?: string | null
          effective_at: string
          id?: string
          new_plan_code: Database["public"]["Enums"]["app_plan"]
          reason?: string | null
          workspace_id: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          created_by?: string | null
          effective_at?: string
          id?: string
          new_plan_code?: Database["public"]["Enums"]["app_plan"]
          reason?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_plan_changes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admin_audit: {
        Row: {
          action: string
          actor_user_id: string | null
          id: number
          ip: unknown
          meta: Json
          target_id: string | null
          target_type: string | null
          ts: string
          user_agent_hash: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          id?: number
          ip?: unknown
          meta?: Json
          target_id?: string | null
          target_type?: string | null
          ts?: string
          user_agent_hash?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          id?: number
          ip?: unknown
          meta?: Json
          target_id?: string | null
          target_type?: string | null
          ts?: string
          user_agent_hash?: string | null
        }
        Relationships: []
      }
      platform_admin_not_before: {
        Row: {
          not_before: string
          reason: string | null
          set_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          not_before?: string
          reason?: string | null
          set_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          not_before?: string
          reason?: string | null
          set_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      portal_file_acks: {
        Row: {
          ack_kind: string
          actor_email: string | null
          actor_name: string | null
          bundle_id: string
          created_at: string
          file_id: string | null
          id: string
          ip_hash: string | null
          token_id: string
          ua_hash: string | null
          workspace_id: string
        }
        Insert: {
          ack_kind?: string
          actor_email?: string | null
          actor_name?: string | null
          bundle_id: string
          created_at?: string
          file_id?: string | null
          id?: string
          ip_hash?: string | null
          token_id: string
          ua_hash?: string | null
          workspace_id: string
        }
        Update: {
          ack_kind?: string
          actor_email?: string | null
          actor_name?: string | null
          bundle_id?: string
          created_at?: string
          file_id?: string | null
          id?: string
          ip_hash?: string | null
          token_id?: string
          ua_hash?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_file_acks_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "portal_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_links: {
        Row: {
          created_at: string
          created_by: string
          event_id: string | null
          expires_at: string
          id: string
          kind: string
          last_viewed_at: string | null
          revoked_at: string | null
          token_hash: string
          updated_at: string
          view_count: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          event_id?: string | null
          expires_at: string
          id?: string
          kind?: string
          last_viewed_at?: string | null
          revoked_at?: string | null
          token_hash: string
          updated_at?: string
          view_count?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          event_id?: string | null
          expires_at?: string
          id?: string
          kind?: string
          last_viewed_at?: string | null
          revoked_at?: string | null
          token_hash?: string
          updated_at?: string
          view_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_rate_limits: {
        Row: {
          blocked_until: string | null
          created_at: string
          hit_count: number
          id: string
          ip_hash: string | null
          route: string
          token_hash: string
          updated_at: string
          window_start: string
        }
        Insert: {
          blocked_until?: string | null
          created_at?: string
          hit_count?: number
          id?: string
          ip_hash?: string | null
          route: string
          token_hash: string
          updated_at?: string
          window_start?: string
        }
        Update: {
          blocked_until?: string | null
          created_at?: string
          hit_count?: number
          id?: string
          ip_hash?: string | null
          route?: string
          token_hash?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      portal_token_revocations: {
        Row: {
          reason: string | null
          revoked_at: string
          revoked_by: string | null
          token_hash: string
        }
        Insert: {
          reason?: string | null
          revoked_at?: string
          revoked_by?: string | null
          token_hash: string
        }
        Update: {
          reason?: string | null
          revoked_at?: string
          revoked_by?: string | null
          token_hash?: string
        }
        Relationships: []
      }
      portal_token_uses: {
        Row: {
          action: string
          actor_user_id: string | null
          at: string
          id: string
          ip_hash: string | null
          meta: Json
          scope: string
          token_id: string
          ua_hash: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          at?: string
          id?: string
          ip_hash?: string | null
          meta?: Json
          scope: string
          token_id: string
          ua_hash?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          at?: string
          id?: string
          ip_hash?: string | null
          meta?: Json
          scope?: string
          token_id?: string
          ua_hash?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_token_uses_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "portal_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_tokens: {
        Row: {
          audience: string
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          expires_at: string | null
          id: string
          ip_last: unknown
          last_viewed_at: string | null
          revoked_at: string | null
          token_hash: string
          view_count: number
          workspace_id: string
        }
        Insert: {
          audience?: string
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          expires_at?: string | null
          id?: string
          ip_last?: unknown
          last_viewed_at?: string | null
          revoked_at?: string | null
          token_hash: string
          view_count?: number
          workspace_id: string
        }
        Update: {
          audience?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          expires_at?: string | null
          id?: string
          ip_last?: unknown
          last_viewed_at?: string | null
          revoked_at?: string | null
          token_hash?: string
          view_count?: number
          workspace_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_workspace_id: string | null
          avatar_file_id: string | null
          created_at: string
          display_name: string | null
          locale: string
          onboarding_state: Json
          prefer_otp: boolean
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_workspace_id?: string | null
          avatar_file_id?: string | null
          created_at?: string
          display_name?: string | null
          locale?: string
          onboarding_state?: Json
          prefer_otp?: boolean
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_workspace_id?: string | null
          avatar_file_id?: string | null
          created_at?: string
          display_name?: string | null
          locale?: string
          onboarding_state?: Json
          prefer_otp?: boolean
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_workspace_id_fkey"
            columns: ["active_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          proposal_id: string
          quantity: number
          sort_order: number
          total_cents: number | null
          unit_price_cents: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          proposal_id: string
          quantity?: number
          sort_order?: number
          total_cents?: number | null
          unit_price_cents?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          proposal_id?: string
          quantity?: number
          sort_order?: number
          total_cents?: number | null
          unit_price_cents?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_line_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_line_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          client_email: string | null
          client_name: string
          converted_invoice_id: string | null
          cover_image_url: string | null
          cover_theme: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          deposit_pct: number | null
          event_date: string | null
          event_id: string | null
          event_location: string | null
          event_type: string | null
          guest_count: number | null
          id: string
          intro_text: string | null
          lead_id: string | null
          margin_pct: number | null
          next_action_due: string | null
          next_action_label: string | null
          owner_id: string | null
          share_token: string | null
          signed_at: string | null
          signed_by_email: string | null
          signed_by_name: string | null
          signed_ip: string | null
          status: string
          terms_text: string | null
          title: string
          total_cents: number
          updated_at: string
          valid_until: string | null
          version: number
          viewed_at: string | null
          workspace_id: string
        }
        Insert: {
          client_email?: string | null
          client_name: string
          converted_invoice_id?: string | null
          cover_image_url?: string | null
          cover_theme?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deposit_pct?: number | null
          event_date?: string | null
          event_id?: string | null
          event_location?: string | null
          event_type?: string | null
          guest_count?: number | null
          id?: string
          intro_text?: string | null
          lead_id?: string | null
          margin_pct?: number | null
          next_action_due?: string | null
          next_action_label?: string | null
          owner_id?: string | null
          share_token?: string | null
          signed_at?: string | null
          signed_by_email?: string | null
          signed_by_name?: string | null
          signed_ip?: string | null
          status?: string
          terms_text?: string | null
          title: string
          total_cents?: number
          updated_at?: string
          valid_until?: string | null
          version?: number
          viewed_at?: string | null
          workspace_id: string
        }
        Update: {
          client_email?: string | null
          client_name?: string
          converted_invoice_id?: string | null
          cover_image_url?: string | null
          cover_theme?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deposit_pct?: number | null
          event_date?: string | null
          event_id?: string | null
          event_location?: string | null
          event_type?: string | null
          guest_count?: number | null
          id?: string
          intro_text?: string | null
          lead_id?: string | null
          margin_pct?: number | null
          next_action_due?: string | null
          next_action_label?: string | null
          owner_id?: string | null
          share_token?: string | null
          signed_at?: string | null
          signed_by_email?: string | null
          signed_by_name?: string | null
          signed_ip?: string | null
          status?: string
          terms_text?: string | null
          title?: string
          total_cents?: number
          updated_at?: string
          valid_until?: string | null
          version?: number
          viewed_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_converted_invoice_id_fkey"
            columns: ["converted_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_decisions: {
        Row: {
          decided_at: string
          decision: string
          id: string
          ip_hash: string | null
          meta: Json
          quote_id: string
          reason: string | null
          token_id: string | null
          ua_hash: string | null
          workspace_id: string
        }
        Insert: {
          decided_at?: string
          decision: string
          id?: string
          ip_hash?: string | null
          meta?: Json
          quote_id: string
          reason?: string | null
          token_id?: string | null
          ua_hash?: string | null
          workspace_id: string
        }
        Update: {
          decided_at?: string
          decision?: string
          id?: string
          ip_hash?: string | null
          meta?: Json
          quote_id?: string
          reason?: string | null
          token_id?: string | null
          ua_hash?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_decisions_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_decisions_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "portal_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_files: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          mime_type: string | null
          name: string
          quote_id: string
          size_bytes: number | null
          storage_key: string
          uploaded_by_contact_id: string | null
          uploaded_by_type: string
          uploaded_by_user_id: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          mime_type?: string | null
          name: string
          quote_id: string
          size_bytes?: number | null
          storage_key: string
          uploaded_by_contact_id?: string | null
          uploaded_by_type?: string
          uploaded_by_user_id?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          mime_type?: string | null
          name?: string
          quote_id?: string
          size_bytes?: number | null
          storage_key?: string
          uploaded_by_contact_id?: string | null
          uploaded_by_type?: string
          uploaded_by_user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_files_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_files_uploaded_by_contact_id_fkey"
            columns: ["uploaded_by_contact_id"]
            isOneToOne: false
            referencedRelation: "supplier_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_files_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_lines: {
        Row: {
          catalog_item_id: string | null
          created_at: string
          description: string
          id: string
          line_total_cents: number
          qty_x100: number
          quote_id: string
          sort_order: number
          tax_pct_x100: number
          unit_price_cents: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          catalog_item_id?: string | null
          created_at?: string
          description: string
          id?: string
          line_total_cents?: number
          qty_x100?: number
          quote_id: string
          sort_order?: number
          tax_pct_x100?: number
          unit_price_cents?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          catalog_item_id?: string | null
          created_at?: string
          description?: string
          id?: string
          line_total_cents?: number
          qty_x100?: number
          quote_id?: string
          sort_order?: number
          tax_pct_x100?: number
          unit_price_cents?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_lines_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_lines_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_lines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_messages: {
        Row: {
          author_contact_id: string | null
          author_type: string
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          quote_id: string
          workspace_id: string
        }
        Insert: {
          author_contact_id?: string | null
          author_type: string
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          quote_id: string
          workspace_id: string
        }
        Update: {
          author_contact_id?: string | null
          author_type?: string
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          quote_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_messages_author_contact_id_fkey"
            columns: ["author_contact_id"]
            isOneToOne: false
            referencedRelation: "supplier_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_messages_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          archived_at: string | null
          code: string
          created_at: string
          created_by: string | null
          currency: string
          deadline: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          event_id: string | null
          id: string
          locked_at: string | null
          notes: string | null
          pdf_version: number
          received_at: string | null
          rejected_at: string | null
          scope: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal_cents: number
          supersedes_id: string | null
          supplier_id: string
          tax_cents: number
          title: string | null
          total_cents: number
          updated_at: string
          valid_days: number
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          archived_at?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deadline?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          event_id?: string | null
          id?: string
          locked_at?: string | null
          notes?: string | null
          pdf_version?: number
          received_at?: string | null
          rejected_at?: string | null
          scope?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal_cents?: number
          supersedes_id?: string | null
          supplier_id: string
          tax_cents?: number
          title?: string | null
          total_cents?: number
          updated_at?: string
          valid_days?: number
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          archived_at?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deadline?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          event_id?: string | null
          id?: string
          locked_at?: string | null
          notes?: string | null
          pdf_version?: number
          received_at?: string | null
          rejected_at?: string | null
          scope?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal_cents?: number
          supersedes_id?: string | null
          supplier_id?: string
          tax_cents?: number
          title?: string | null
          total_cents?: number
          updated_at?: string
          valid_days?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      release_scorecard_runs: {
        Row: {
          actor_user_id: string
          gates: Json
          id: string
          run_at: string
          sbom_sha: string | null
          signed_pdf_r2_key: string | null
          summary: Json
        }
        Insert: {
          actor_user_id: string
          gates: Json
          id?: string
          run_at?: string
          sbom_sha?: string | null
          signed_pdf_r2_key?: string | null
          summary: Json
        }
        Update: {
          actor_user_id?: string
          gates?: Json
          id?: string
          run_at?: string
          sbom_sha?: string | null
          signed_pdf_r2_key?: string | null
          summary?: Json
        }
        Relationships: []
      }
      rfq_activity: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          rfq_id: string
          subject: Json | null
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          rfq_id: string
          subject?: Json | null
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          rfq_id?: string
          subject?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_activity_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_activity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_awards: {
        Row: {
          award_reason: string | null
          awarded_at: string
          awarded_by: string | null
          booking_committed_at: string | null
          created_at: string
          event_supplier_id: string | null
          id: string
          rfq_id: string
          rfq_response_id: string | null
          savings_cents: number | null
          supplier_id: string
          workspace_id: string
        }
        Insert: {
          award_reason?: string | null
          awarded_at?: string
          awarded_by?: string | null
          booking_committed_at?: string | null
          created_at?: string
          event_supplier_id?: string | null
          id?: string
          rfq_id: string
          rfq_response_id?: string | null
          savings_cents?: number | null
          supplier_id: string
          workspace_id: string
        }
        Update: {
          award_reason?: string | null
          awarded_at?: string
          awarded_by?: string | null
          booking_committed_at?: string | null
          created_at?: string
          event_supplier_id?: string | null
          id?: string
          rfq_id?: string
          rfq_response_id?: string | null
          savings_cents?: number | null
          supplier_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_awards_event_supplier_id_fkey"
            columns: ["event_supplier_id"]
            isOneToOne: false
            referencedRelation: "event_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_awards_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_awards_rfq_response_id_fkey"
            columns: ["rfq_response_id"]
            isOneToOne: false
            referencedRelation: "rfq_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_awards_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_awards_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_awards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_recipients: {
        Row: {
          created_at: string
          declined_reason: string | null
          id: string
          invited_at: string
          notes: string | null
          quote_amount_cents: number | null
          responded_at: string | null
          rfq_id: string
          status: string
          supplier_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          declined_reason?: string | null
          id?: string
          invited_at?: string
          notes?: string | null
          quote_amount_cents?: number | null
          responded_at?: string | null
          rfq_id: string
          status?: string
          supplier_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          declined_reason?: string | null
          id?: string
          invited_at?: string
          notes?: string | null
          quote_amount_cents?: number | null
          responded_at?: string | null
          rfq_id?: string
          status?: string
          supplier_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_recipients_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_recipients_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_recipients_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_recipients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_response_line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          quantity: number
          rfq_response_id: string
          sort_order: number
          unit_price_cents: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          quantity?: number
          rfq_response_id: string
          sort_order?: number
          unit_price_cents?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          quantity?: number
          rfq_response_id?: string
          sort_order?: number
          unit_price_cents?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_response_line_items_rfq_response_id_fkey"
            columns: ["rfq_response_id"]
            isOneToOne: false
            referencedRelation: "rfq_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_response_line_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_responses: {
        Row: {
          assumptions: string | null
          created_at: string
          currency: string
          exclusions: string | null
          id: string
          lead_time_days: number | null
          notes: string | null
          rfq_id: string
          status: string
          submitted_at: string | null
          supplier_id: string
          total_amount_cents: number | null
          updated_at: string
          valid_until: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          assumptions?: string | null
          created_at?: string
          currency?: string
          exclusions?: string | null
          id?: string
          lead_time_days?: number | null
          notes?: string | null
          rfq_id: string
          status?: string
          submitted_at?: string | null
          supplier_id: string
          total_amount_cents?: number | null
          updated_at?: string
          valid_until?: string | null
          version?: number
          workspace_id: string
        }
        Update: {
          assumptions?: string | null
          created_at?: string
          currency?: string
          exclusions?: string | null
          id?: string
          lead_time_days?: number | null
          notes?: string | null
          rfq_id?: string
          status?: string
          submitted_at?: string | null
          supplier_id?: string
          total_amount_cents?: number | null
          updated_at?: string
          valid_until?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_responses_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_responses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_responses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_responses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: string | null
          id: string
          rfq_id: string
          to_status: string
          workspace_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          rfq_id: string
          to_status: string
          workspace_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          rfq_id?: string
          to_status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_status_history_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_status_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rfqs: {
        Row: {
          awarded_at: string | null
          awarded_supplier_id: string | null
          budget_high_cents: number | null
          budget_low_cents: number | null
          category: string | null
          clarification_deadline: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          due_date: string | null
          evaluation_criteria: Json | null
          event_id: string | null
          id: string
          response_deadline: string | null
          scope: string | null
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          awarded_at?: string | null
          awarded_supplier_id?: string | null
          budget_high_cents?: number | null
          budget_low_cents?: number | null
          category?: string | null
          clarification_deadline?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          due_date?: string | null
          evaluation_criteria?: Json | null
          event_id?: string | null
          id?: string
          response_deadline?: string | null
          scope?: string | null
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          awarded_at?: string | null
          awarded_supplier_id?: string | null
          budget_high_cents?: number | null
          budget_low_cents?: number | null
          category?: string | null
          clarification_deadline?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          due_date?: string | null
          evaluation_criteria?: Json | null
          event_id?: string | null
          id?: string
          response_deadline?: string | null
          scope?: string | null
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfqs_awarded_supplier_id_fkey"
            columns: ["awarded_supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_awarded_supplier_id_fkey"
            columns: ["awarded_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      secret_rotation_log: {
        Row: {
          created_at: string
          id: number
          note: string | null
          rotated_at: string
          rotated_by: string | null
          secret_name: string
          trigger: string
        }
        Insert: {
          created_at?: string
          id?: number
          note?: string | null
          rotated_at?: string
          rotated_by?: string | null
          secret_name: string
          trigger?: string
        }
        Update: {
          created_at?: string
          id?: number
          note?: string | null
          rotated_at?: string
          rotated_by?: string | null
          secret_name?: string
          trigger?: string
        }
        Relationships: []
      }
      security_probe_runs: {
        Row: {
          created_at: string
          duration_ms: number
          failures: Json
          id: string
          probe_kind: string
          run_at: string
          sha: string | null
          total_checks: number
          triggered_by: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number
          failures?: Json
          id?: string
          probe_kind?: string
          run_at?: string
          sha?: string | null
          total_checks?: number
          triggered_by?: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          failures?: Json
          id?: string
          probe_kind?: string
          run_at?: string
          sha?: string | null
          total_checks?: number
          triggered_by?: string
        }
        Relationships: []
      }
      service_catalog: {
        Row: {
          archived_at: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          default_currency: string
          default_qty_x100: number
          default_tax_pct_x100: number
          default_unit_price_cents: number
          description: string | null
          id: string
          name: string
          unit_label: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          default_currency?: string
          default_qty_x100?: number
          default_tax_pct_x100?: number
          default_unit_price_cents?: number
          description?: string | null
          id?: string
          name: string
          unit_label?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          default_currency?: string
          default_qty_x100?: number
          default_tax_pct_x100?: number
          default_unit_price_cents?: number
          description?: string | null
          id?: string
          name?: string
          unit_label?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_catalog_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "supplier_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_catalog_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skills_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_rule_actions_log: {
        Row: {
          action_kind: Database["public"]["Enums"]["smart_rule_action"]
          duration_ms: number | null
          entity_id: string
          entity_kind: string
          error_text: string | null
          id: string
          node_id: string | null
          node_type: string | null
          payload_summary: Json
          rule_id: string
          run_id: string
          started_at: string
          step_index: number
          success: boolean
          ts: string
          workspace_id: string | null
        }
        Insert: {
          action_kind: Database["public"]["Enums"]["smart_rule_action"]
          duration_ms?: number | null
          entity_id: string
          entity_kind: string
          error_text?: string | null
          id?: string
          node_id?: string | null
          node_type?: string | null
          payload_summary?: Json
          rule_id: string
          run_id: string
          started_at?: string
          step_index?: number
          success: boolean
          ts?: string
          workspace_id?: string | null
        }
        Update: {
          action_kind?: Database["public"]["Enums"]["smart_rule_action"]
          duration_ms?: number | null
          entity_id?: string
          entity_kind?: string
          error_text?: string | null
          id?: string
          node_id?: string | null
          node_type?: string | null
          payload_summary?: Json
          rule_id?: string
          run_id?: string
          started_at?: string
          step_index?: number
          success?: boolean
          ts?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "smart_rule_actions_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "smart_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_rule_actions_log_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "smart_rule_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_rule_actions_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_rule_runs: {
        Row: {
          duration_ms: number
          environment: string
          error_text: string | null
          fired_count: number
          id: string
          initiated_by: string | null
          matched_count: number
          mode: Database["public"]["Enums"]["smart_rule_run_mode"]
          payload: Json
          replay_of_run_id: string | null
          retry_of_run_id: string | null
          rule_id: string
          skipped_dedupe_count: number
          started_at: string
          status: Database["public"]["Enums"]["smart_rule_run_status"]
          trigger_source: string
          ts: string
          workspace_id: string | null
        }
        Insert: {
          duration_ms?: number
          environment?: string
          error_text?: string | null
          fired_count?: number
          id?: string
          initiated_by?: string | null
          matched_count?: number
          mode: Database["public"]["Enums"]["smart_rule_run_mode"]
          payload?: Json
          replay_of_run_id?: string | null
          retry_of_run_id?: string | null
          rule_id: string
          skipped_dedupe_count?: number
          started_at?: string
          status: Database["public"]["Enums"]["smart_rule_run_status"]
          trigger_source?: string
          ts?: string
          workspace_id?: string | null
        }
        Update: {
          duration_ms?: number
          environment?: string
          error_text?: string | null
          fired_count?: number
          id?: string
          initiated_by?: string | null
          matched_count?: number
          mode?: Database["public"]["Enums"]["smart_rule_run_mode"]
          payload?: Json
          replay_of_run_id?: string | null
          retry_of_run_id?: string | null
          rule_id?: string
          skipped_dedupe_count?: number
          started_at?: string
          status?: Database["public"]["Enums"]["smart_rule_run_status"]
          trigger_source?: string
          ts?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "smart_rule_runs_replay_of_run_id_fkey"
            columns: ["replay_of_run_id"]
            isOneToOne: false
            referencedRelation: "smart_rule_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_rule_runs_retry_of_run_id_fkey"
            columns: ["retry_of_run_id"]
            isOneToOne: false
            referencedRelation: "smart_rule_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_rule_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "smart_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_rule_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_rules: {
        Row: {
          action_kind: Database["public"]["Enums"]["smart_rule_action"]
          action_params: Json
          active_version_id: string | null
          archived_at: string | null
          complexity: string
          conditions: Json
          created_at: string
          created_by: string
          definition_json: Json
          deleted_at: string | null
          description: string | null
          draft_definition_json: Json | null
          draft_version_id: string | null
          dry_run: boolean
          enabled: boolean
          environment: string
          fire_count: number
          id: string
          last_evaluated_at: string | null
          last_fired_at: string | null
          module: string
          name: string
          owner_user_id: string
          recipe_id: string | null
          status: string
          tags: string[]
          trigger_kind: Database["public"]["Enums"]["smart_rule_trigger"]
          trigger_params: Json
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          action_kind: Database["public"]["Enums"]["smart_rule_action"]
          action_params?: Json
          active_version_id?: string | null
          archived_at?: string | null
          complexity?: string
          conditions?: Json
          created_at?: string
          created_by: string
          definition_json?: Json
          deleted_at?: string | null
          description?: string | null
          draft_definition_json?: Json | null
          draft_version_id?: string | null
          dry_run?: boolean
          enabled?: boolean
          environment?: string
          fire_count?: number
          id?: string
          last_evaluated_at?: string | null
          last_fired_at?: string | null
          module?: string
          name: string
          owner_user_id: string
          recipe_id?: string | null
          status?: string
          tags?: string[]
          trigger_kind: Database["public"]["Enums"]["smart_rule_trigger"]
          trigger_params?: Json
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          action_kind?: Database["public"]["Enums"]["smart_rule_action"]
          action_params?: Json
          active_version_id?: string | null
          archived_at?: string | null
          complexity?: string
          conditions?: Json
          created_at?: string
          created_by?: string
          definition_json?: Json
          deleted_at?: string | null
          description?: string | null
          draft_definition_json?: Json | null
          draft_version_id?: string | null
          dry_run?: boolean
          enabled?: boolean
          environment?: string
          fire_count?: number
          id?: string
          last_evaluated_at?: string | null
          last_fired_at?: string | null
          module?: string
          name?: string
          owner_user_id?: string
          recipe_id?: string | null
          status?: string
          tags?: string[]
          trigger_kind?: Database["public"]["Enums"]["smart_rule_trigger"]
          trigger_params?: Json
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "smart_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      staffing_request_candidates: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          request_id: string
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          request_id: string
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          request_id?: string
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staffing_request_candidates_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "staffing_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_request_candidates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      staffing_requests: {
        Row: {
          assigned_lead_id: string | null
          budget_cents: number | null
          created_at: string
          created_by: string | null
          currency: string
          end_at: string | null
          event_id: string
          id: string
          location: string | null
          notes: string | null
          quantity_filled: number
          quantity_required: number
          role_id: string | null
          role_label: string
          start_at: string | null
          status: string
          updated_at: string
          urgency: string
          workspace_id: string
        }
        Insert: {
          assigned_lead_id?: string | null
          budget_cents?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          end_at?: string | null
          event_id: string
          id?: string
          location?: string | null
          notes?: string | null
          quantity_filled?: number
          quantity_required?: number
          role_id?: string | null
          role_label: string
          start_at?: string | null
          status?: string
          updated_at?: string
          urgency?: string
          workspace_id: string
        }
        Update: {
          assigned_lead_id?: string | null
          budget_cents?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          end_at?: string | null
          event_id?: string
          id?: string
          location?: string | null
          notes?: string | null
          quantity_filled?: number
          quantity_required?: number
          role_id?: string | null
          role_label?: string
          start_at?: string | null
          status?: string
          updated_at?: string
          urgency?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staffing_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_requests_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "staffing_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      staffing_roles: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staffing_roles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "team_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_roles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_bucket_usage: {
        Row: {
          created_at: string
          last_sampled_at: string | null
          object_count: number
          plan_quota_bytes: number
          updated_at: string
          used_bytes: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          last_sampled_at?: string | null
          object_count?: number
          plan_quota_bytes?: number
          updated_at?: string
          used_bytes?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          last_sampled_at?: string | null
          object_count?: number
          plan_quota_bytes?: number
          updated_at?: string
          used_bytes?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_bucket_usage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_lifecycle_runs: {
        Row: {
          errors: number
          finished_at: string | null
          id: string
          notes: string | null
          purged_previews: number
          scanned_bytes: number
          scanned_objects: number
          started_at: string
          status: Database["public"]["Enums"]["storage_lifecycle_status"]
          swept_soft_deleted: number
          took_ms: number | null
          triggered_by: string
          triggered_by_user_id: string | null
          workspaces_synced: number
        }
        Insert: {
          errors?: number
          finished_at?: string | null
          id?: string
          notes?: string | null
          purged_previews?: number
          scanned_bytes?: number
          scanned_objects?: number
          started_at?: string
          status?: Database["public"]["Enums"]["storage_lifecycle_status"]
          swept_soft_deleted?: number
          took_ms?: number | null
          triggered_by: string
          triggered_by_user_id?: string | null
          workspaces_synced?: number
        }
        Update: {
          errors?: number
          finished_at?: string | null
          id?: string
          notes?: string | null
          purged_previews?: number
          scanned_bytes?: number
          scanned_objects?: number
          started_at?: string
          status?: Database["public"]["Enums"]["storage_lifecycle_status"]
          swept_soft_deleted?: number
          took_ms?: number | null
          triggered_by?: string
          triggered_by_user_id?: string | null
          workspaces_synced?: number
        }
        Relationships: []
      }
      storage_quota_notifications: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          notified_at: string
          pct_at_send: number
          recipient_email_hash: string
          resend_id: string | null
          status: string
          threshold_pct: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          notified_at?: string
          pct_at_send: number
          recipient_email_hash: string
          resend_id?: string | null
          status?: string
          threshold_pct: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          notified_at?: string
          pct_at_send?: number
          recipient_email_hash?: string
          resend_id?: string | null
          status?: string
          threshold_pct?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_quota_notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_quota_overrides: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          override_bytes: number
          reason: string
          revoked_at: string | null
          revoked_by_user_id: string | null
          revoked_reason: string | null
          set_by_user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          override_bytes: number
          reason: string
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          revoked_reason?: string | null
          set_by_user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          override_bytes?: number
          reason?: string
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          revoked_reason?: string | null
          set_by_user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_quota_overrides_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_reconciliation_drifts: {
        Row: {
          actual: Json | null
          created_at: string
          drift_type: string
          expected: Json | null
          id: string
          notes: string | null
          replayed_at: string | null
          resolved_at: string | null
          run_id: string
          stripe_object_id: string
          stripe_object_type: string
          workspace_id: string | null
        }
        Insert: {
          actual?: Json | null
          created_at?: string
          drift_type: string
          expected?: Json | null
          id?: string
          notes?: string | null
          replayed_at?: string | null
          resolved_at?: string | null
          run_id: string
          stripe_object_id: string
          stripe_object_type: string
          workspace_id?: string | null
        }
        Update: {
          actual?: Json | null
          created_at?: string
          drift_type?: string
          expected?: Json | null
          id?: string
          notes?: string | null
          replayed_at?: string | null
          resolved_at?: string | null
          run_id?: string
          stripe_object_id?: string
          stripe_object_type?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_reconciliation_drifts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "stripe_reconciliation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_reconciliation_runs: {
        Row: {
          auto_fixed_count: number
          created_at: string
          drift_count: number
          error_count: number
          finished_at: string | null
          id: string
          notes: string | null
          scanned_count: number
          started_at: string
          status: string
          took_ms: number | null
          triggered_by: string
          triggered_by_user_id: string | null
        }
        Insert: {
          auto_fixed_count?: number
          created_at?: string
          drift_count?: number
          error_count?: number
          finished_at?: string | null
          id?: string
          notes?: string | null
          scanned_count?: number
          started_at?: string
          status?: string
          took_ms?: number | null
          triggered_by?: string
          triggered_by_user_id?: string | null
        }
        Update: {
          auto_fixed_count?: number
          created_at?: string
          drift_count?: number
          error_count?: number
          finished_at?: string | null
          id?: string
          notes?: string | null
          scanned_count?: number
          started_at?: string
          status?: string
          took_ms?: number | null
          triggered_by?: string
          triggered_by_user_id?: string | null
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          created_at: string
          error: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          stripe_account_id: string | null
          stripe_event_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          stripe_account_id?: string | null
          stripe_event_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          stripe_account_id?: string | null
          stripe_event_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_webhook_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_addons: {
        Row: {
          addon_code: string
          billing_cycle: string
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_item_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          addon_code: string
          billing_cycle?: string
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_item_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          addon_code?: string
          billing_cycle?: string
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_item_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_addons_addon_code_fkey"
            columns: ["addon_code"]
            isOneToOne: false
            referencedRelation: "billing_addons"
            referencedColumns: ["code"]
          },
        ]
      }
      supplier_activity: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          diff: Json | null
          id: string
          subject: Json | null
          supplier_id: string
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          id?: string
          subject?: Json | null
          supplier_id: string
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          id?: string
          subject?: Json | null
          supplier_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_activity_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_activity_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_activity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_archives: {
        Row: {
          archived_at: string
          archived_by: string | null
          can_be_restored: boolean
          created_at: string
          id: string
          legal_hold: boolean
          previous_category_id: string | null
          previous_tier: string | null
          reason: string
          reason_detail: string | null
          restored_at: string | null
          restored_by: string | null
          retention_until: string | null
          supplier_id: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string
          archived_by?: string | null
          can_be_restored?: boolean
          created_at?: string
          id?: string
          legal_hold?: boolean
          previous_category_id?: string | null
          previous_tier?: string | null
          reason: string
          reason_detail?: string | null
          restored_at?: string | null
          restored_by?: string | null
          retention_until?: string | null
          supplier_id: string
          workspace_id: string
        }
        Update: {
          archived_at?: string
          archived_by?: string | null
          can_be_restored?: boolean
          created_at?: string
          id?: string
          legal_hold?: boolean
          previous_category_id?: string | null
          previous_tier?: string | null
          reason?: string
          reason_detail?: string | null
          restored_at?: string | null
          restored_by?: string | null
          retention_until?: string | null
          supplier_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_archives_previous_category_id_fkey"
            columns: ["previous_category_id"]
            isOneToOne: false
            referencedRelation: "supplier_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_archives_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_archives_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_archives_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_blocked_dates: {
        Row: {
          blocked_date: string
          created_at: string
          id: string
          reason: string | null
          supplier_id: string
          workspace_id: string
        }
        Insert: {
          blocked_date: string
          created_at?: string
          id?: string
          reason?: string | null
          supplier_id: string
          workspace_id: string
        }
        Update: {
          blocked_date?: string
          created_at?: string
          id?: string
          reason?: string | null
          supplier_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_blocked_dates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_blocked_dates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_blocked_dates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_compliance_outreach: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          document_type: string | null
          id: string
          note: string | null
          sent_at: string | null
          status: string
          supplier_id: string
          workspace_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          created_by?: string | null
          document_type?: string | null
          id?: string
          note?: string | null
          sent_at?: string | null
          status?: string
          supplier_id: string
          workspace_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          document_type?: string | null
          id?: string
          note?: string | null
          sent_at?: string | null
          status?: string
          supplier_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_compliance_outreach_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_compliance_outreach_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_compliance_outreach_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          phone: string | null
          role: string | null
          supplier_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          phone?: string | null
          role?: string | null
          supplier_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          phone?: string | null
          role?: string | null
          supplier_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contacts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contacts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contracts: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: string | null
          expires_at: string | null
          id: string
          signed_at: string | null
          status: string
          storage_key: string | null
          supplier_id: string
          title: string
          updated_at: string
          value_cents: number | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          expires_at?: string | null
          id?: string
          signed_at?: string | null
          status?: string
          storage_key?: string | null
          supplier_id: string
          title: string
          updated_at?: string
          value_cents?: number | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          expires_at?: string | null
          id?: string
          signed_at?: string | null
          status?: string
          storage_key?: string | null
          supplier_id?: string
          title?: string
          updated_at?: string
          value_cents?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contracts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contracts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contracts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contracts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contracts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_document_requirements: {
        Row: {
          category_id: string | null
          created_at: string
          default_risk_level: string
          document_type: string
          id: string
          is_required: boolean
          workspace_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          default_risk_level?: string
          document_type: string
          id?: string
          is_required?: boolean
          workspace_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          default_risk_level?: string
          document_type?: string
          id?: string
          is_required?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_document_requirements_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "supplier_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_document_requirements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_files: {
        Row: {
          archived_at: string | null
          created_at: string
          document_type: string | null
          due_date: string | null
          expires_at: string | null
          filename: string
          id: string
          issue_date: string | null
          issuing_body: string | null
          kind: Database["public"]["Enums"]["supplier_file_kind"]
          library_asset_id: string | null
          mime_type: string | null
          notes: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          risk_level: string | null
          size_bytes: number | null
          storage_path: string
          supplier_id: string
          updated_at: string
          uploaded_by: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          document_type?: string | null
          due_date?: string | null
          expires_at?: string | null
          filename: string
          id?: string
          issue_date?: string | null
          issuing_body?: string | null
          kind?: Database["public"]["Enums"]["supplier_file_kind"]
          library_asset_id?: string | null
          mime_type?: string | null
          notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string | null
          size_bytes?: number | null
          storage_path: string
          supplier_id: string
          updated_at?: string
          uploaded_by?: string | null
          version?: number
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          document_type?: string | null
          due_date?: string | null
          expires_at?: string | null
          filename?: string
          id?: string
          issue_date?: string | null
          issuing_body?: string | null
          kind?: Database["public"]["Enums"]["supplier_file_kind"]
          library_asset_id?: string | null
          mime_type?: string | null
          notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string | null
          size_bytes?: number | null
          storage_path?: string
          supplier_id?: string
          updated_at?: string
          uploaded_by?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_files_library_asset_id_fkey"
            columns: ["library_asset_id"]
            isOneToOne: false
            referencedRelation: "library_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_files_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_files_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_files_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_imports: {
        Row: {
          applied_at: string | null
          created_at: string
          created_by: string | null
          dry_run: boolean
          errors: Json
          filename: string | null
          id: string
          inserted_ids: string[]
          inserted_rows: number
          invalid_rows: number
          kind: Database["public"]["Enums"]["supplier_import_kind"]
          rolled_back_at: string | null
          skipped_rows: number
          status: Database["public"]["Enums"]["supplier_import_status"]
          summary: Json
          total_rows: number
          updated_at: string
          updated_rows: number
          valid_rows: number
          workspace_id: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          created_by?: string | null
          dry_run?: boolean
          errors?: Json
          filename?: string | null
          id?: string
          inserted_ids?: string[]
          inserted_rows?: number
          invalid_rows?: number
          kind?: Database["public"]["Enums"]["supplier_import_kind"]
          rolled_back_at?: string | null
          skipped_rows?: number
          status?: Database["public"]["Enums"]["supplier_import_status"]
          summary?: Json
          total_rows?: number
          updated_at?: string
          updated_rows?: number
          valid_rows?: number
          workspace_id: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          created_by?: string | null
          dry_run?: boolean
          errors?: Json
          filename?: string | null
          id?: string
          inserted_ids?: string[]
          inserted_rows?: number
          invalid_rows?: number
          kind?: Database["public"]["Enums"]["supplier_import_kind"]
          rolled_back_at?: string | null
          skipped_rows?: number
          status?: Database["public"]["Enums"]["supplier_import_status"]
          summary?: Json
          total_rows?: number
          updated_at?: string
          updated_rows?: number
          valid_rows?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_imports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_pauses: {
        Row: {
          created_at: string
          id: string
          note: string | null
          paused_at: string
          paused_by: string | null
          reactivated_at: string | null
          reactivated_by: string | null
          reactivation_note: string | null
          reason: string
          reason_detail: string | null
          supplier_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          paused_at?: string
          paused_by?: string | null
          reactivated_at?: string | null
          reactivated_by?: string | null
          reactivation_note?: string | null
          reason: string
          reason_detail?: string | null
          supplier_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          paused_at?: string
          paused_by?: string | null
          reactivated_at?: string | null
          reactivated_by?: string | null
          reactivation_note?: string | null
          reason?: string
          reason_detail?: string | null
          supplier_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_pauses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_pauses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_pauses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payment_batches: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          id: string
          reference: string
          status: string
          total_cents: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          reference: string
          status?: string
          total_cents?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          reference?: string
          status?: string
          total_cents?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payment_batches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_portal_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          fail_count: number
          id: string
          last_used_at: string | null
          locked_until: string | null
          quote_id: string
          recipient_email: string
          revoke_reason: string | null
          revoked_at: string | null
          scope: string
          token_hash: string
          used_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          fail_count?: number
          id?: string
          last_used_at?: string | null
          locked_until?: string | null
          quote_id: string
          recipient_email: string
          revoke_reason?: string | null
          revoked_at?: string | null
          scope?: string
          token_hash: string
          used_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          fail_count?: number
          id?: string
          last_used_at?: string | null
          locked_until?: string | null
          quote_id?: string
          recipient_email?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          scope?: string
          token_hash?: string
          used_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_portal_tokens_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_portal_tokens_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_rate_cards: {
        Row: {
          created_at: string
          currency: string
          id: string
          item_name: string
          notes: string | null
          sort_order: number
          supplier_id: string
          unit: string | null
          unit_price_cents: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          item_name: string
          notes?: string | null
          sort_order?: number
          supplier_id: string
          unit?: string | null
          unit_price_cents?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          item_name?: string
          notes?: string | null
          sort_order?: number
          supplier_id?: string
          unit?: string | null
          unit_price_cents?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_rate_cards_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_rate_cards_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_rate_cards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_ratings: {
        Row: {
          created_at: string
          event_id: string | null
          id: string
          rated_by: string | null
          rating: number
          review: string | null
          supplier_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          id?: string
          rated_by?: string | null
          rating: number
          review?: string | null
          supplier_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          id?: string
          rated_by?: string | null
          rating?: number
          review?: string | null
          supplier_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_ratings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ratings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ratings_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ratings_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ratings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_saved_views: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          is_shared: boolean
          name: string
          query: string
          sort: number
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          is_shared?: boolean
          name: string
          query: string
          sort?: number
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          is_shared?: boolean
          name?: string
          query?: string
          sort?: number
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      supplier_stars: {
        Row: {
          created_at: string
          id: string
          supplier_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          supplier_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          supplier_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_stars_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_stars_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_stars_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          archived_at: string | null
          bank_account_verified: boolean
          category_id: string | null
          coverage_regions: string[]
          created_at: string
          created_by: string | null
          default_currency: string | null
          deleted_at: string | null
          flagged: boolean
          flagged_at: string | null
          flagged_by: string | null
          flagged_reason: string | null
          id: string
          insurance_expiry: string | null
          insurance_policy_number: string | null
          last_used_at: string | null
          logo_path: string | null
          name: string
          notes: string | null
          onboarding_completed_at: string | null
          payment_terms_days: number
          preferred_contact_id: string | null
          primary_email: string | null
          primary_phone: string | null
          rating_internal: number | null
          status: Database["public"]["Enums"]["supplier_status"]
          tags: string[]
          tier: string | null
          trading_name: string | null
          updated_at: string
          vat_number: string | null
          website: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          bank_account_verified?: boolean
          category_id?: string | null
          coverage_regions?: string[]
          created_at?: string
          created_by?: string | null
          default_currency?: string | null
          deleted_at?: string | null
          flagged?: boolean
          flagged_at?: string | null
          flagged_by?: string | null
          flagged_reason?: string | null
          id?: string
          insurance_expiry?: string | null
          insurance_policy_number?: string | null
          last_used_at?: string | null
          logo_path?: string | null
          name: string
          notes?: string | null
          onboarding_completed_at?: string | null
          payment_terms_days?: number
          preferred_contact_id?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          rating_internal?: number | null
          status?: Database["public"]["Enums"]["supplier_status"]
          tags?: string[]
          tier?: string | null
          trading_name?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          bank_account_verified?: boolean
          category_id?: string | null
          coverage_regions?: string[]
          created_at?: string
          created_by?: string | null
          default_currency?: string | null
          deleted_at?: string | null
          flagged?: boolean
          flagged_at?: string | null
          flagged_by?: string | null
          flagged_reason?: string | null
          id?: string
          insurance_expiry?: string | null
          insurance_policy_number?: string | null
          last_used_at?: string | null
          logo_path?: string | null
          name?: string
          notes?: string | null
          onboarding_completed_at?: string | null
          payment_terms_days?: number
          preferred_contact_id?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          rating_internal?: number | null
          status?: Database["public"]["Enums"]["supplier_status"]
          tags?: string[]
          tier?: string | null
          trading_name?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "supplier_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_activity: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          meta: Json
          task_id: string
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          meta?: Json
          task_id: string
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          meta?: Json
          task_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_activity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          mime: string
          size_bytes: number
          storage_path: string
          task_id: string
          uploaded_by: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          mime: string
          size_bytes: number
          storage_path: string
          task_id: string
          uploaded_by: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          mime?: string
          size_bytes?: number
          storage_path?: string
          task_id?: string
          uploaded_by?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_checklist_items: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          is_done: boolean
          sort: number
          task_id: string
          title: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_done?: boolean
          sort?: number
          task_id: string
          title: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_done?: boolean
          sort?: number
          task_id?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_checklist_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_checklist_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comment_mentions: {
        Row: {
          comment_id: string
          notified_at: string | null
          user_id: string
        }
        Insert: {
          comment_id: string
          notified_at?: string | null
          user_id: string
        }
        Update: {
          comment_id?: string
          notified_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "task_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string
          body_html: string | null
          body_md: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          task_id: string
        }
        Insert: {
          author_id: string
          body_html?: string | null
          body_md: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string
          body_html?: string | null
          body_md?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          created_at: string
          created_by: string | null
          depends_on_task_id: string
          kind: Database["public"]["Enums"]["task_dep_kind"]
          task_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          depends_on_task_id: string
          kind?: Database["public"]["Enums"]["task_dep_kind"]
          task_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          depends_on_task_id?: string
          kind?: Database["public"]["Enums"]["task_dep_kind"]
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_lists: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          kind: Database["public"]["Enums"]["task_list_kind"]
          name: string
          sort: number
          supplier_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["task_list_kind"]
          name: string
          sort?: number
          supplier_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["task_list_kind"]
          name?: string
          sort?: number
          supplier_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_lists_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_lists_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_lists_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_lists_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_lists_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: string | null
          id: string
          task_id: string
          to_status: string
          was_overdue: boolean
          workspace_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          task_id: string
          to_status: string
          was_overdue?: boolean
          workspace_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          task_id?: string
          to_status?: string
          was_overdue?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_status_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_status_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_template_items: {
        Row: {
          category: string | null
          description: string | null
          id: string
          list_name: string
          offset_days: number
          parent_item_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          sla_hours: number | null
          template_id: string
          title: string
        }
        Insert: {
          category?: string | null
          description?: string | null
          id?: string
          list_name: string
          offset_days?: number
          parent_item_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          sla_hours?: number | null
          template_id: string
          title: string
        }
        Update: {
          category?: string | null
          description?: string | null
          id?: string
          list_name?: string
          offset_days?: number
          parent_item_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          sla_hours?: number | null
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_template_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "task_template_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      task_template_usage: {
        Row: {
          action: string
          actor_id: string | null
          applied_to_event_id: string | null
          applied_to_supplier_id: string | null
          created_at: string
          id: string
          tasks_created: number
          template_id: string
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          applied_to_event_id?: string | null
          applied_to_supplier_id?: string | null
          created_at?: string
          id?: string
          tasks_created?: number
          template_id: string
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          applied_to_event_id?: string | null
          applied_to_supplier_id?: string | null
          created_at?: string
          id?: string
          tasks_created?: number
          template_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_template_usage_applied_to_event_id_fkey"
            columns: ["applied_to_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_template_usage_applied_to_event_id_fkey"
            columns: ["applied_to_event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_template_usage_applied_to_supplier_id_fkey"
            columns: ["applied_to_supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_template_usage_applied_to_supplier_id_fkey"
            columns: ["applied_to_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_template_usage_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_template_usage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          automation_ready: boolean
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          icon: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
          use_case: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          automation_ready?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
          use_case?: string | null
          version?: number
          workspace_id: string
        }
        Update: {
          automation_ready?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
          use_case?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_watchers: {
        Row: {
          created_at: string
          id: string
          task_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          task_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_watchers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_watchers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          archived_at: string | null
          blocked_reason: string | null
          category: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          description: string | null
          due_at: string | null
          event_id: string | null
          id: string
          is_milestone: boolean
          list_id: string
          milestone_label: string | null
          next_action: string | null
          original_due_at: string | null
          parent_task_id: string | null
          phase: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          recurring_parent_task_id: string | null
          recurring_rule: Json | null
          reschedule_count: number
          sla_hours: number | null
          source: string
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          supplier_id: string | null
          template_id: string | null
          timezone: string
          title: string
          updated_at: string
          venue_id: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          blocked_reason?: string | null
          category?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_at?: string | null
          event_id?: string | null
          id?: string
          is_milestone?: boolean
          list_id: string
          milestone_label?: string | null
          next_action?: string | null
          original_due_at?: string | null
          parent_task_id?: string | null
          phase?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          recurring_parent_task_id?: string | null
          recurring_rule?: Json | null
          reschedule_count?: number
          sla_hours?: number | null
          source?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          supplier_id?: string | null
          template_id?: string | null
          timezone?: string
          title: string
          updated_at?: string
          venue_id?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          blocked_reason?: string | null
          category?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          event_id?: string | null
          id?: string
          is_milestone?: boolean
          list_id?: string
          milestone_label?: string | null
          next_action?: string | null
          original_due_at?: string | null
          parent_task_id?: string | null
          phase?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          recurring_parent_task_id?: string | null
          recurring_rule?: Json | null
          reschedule_count?: number
          sla_hours?: number | null
          source?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          supplier_id?: string | null
          template_id?: string | null
          timezone?: string
          title?: string
          updated_at?: string
          venue_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "task_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_recurring_parent_task_id_fkey"
            columns: ["recurring_parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          country: string | null
          created_at: string
          id: string
          is_archived: boolean
          is_default: boolean
          label: string
          rate_x100: number
          region: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          is_default?: boolean
          label: string
          rate_x100: number
          region?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          is_default?: boolean
          label?: string
          rate_x100?: number
          region?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      team_availability_blocks: {
        Row: {
          block_type: string
          created_at: string
          end_at: string
          id: string
          reason: string | null
          start_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          block_type?: string
          created_at?: string
          end_at: string
          id?: string
          reason?: string | null
          start_at: string
          user_id: string
          workspace_id: string
        }
        Update: {
          block_type?: string
          created_at?: string
          end_at?: string
          id?: string
          reason?: string | null
          start_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_availability_blocks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      team_departments: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_departments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      team_member_certifications: {
        Row: {
          certification_type_id: string
          created_at: string
          document_file_id: string | null
          expires_at: string | null
          id: string
          issued_at: string | null
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          certification_type_id: string
          created_at?: string
          document_file_id?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          certification_type_id?: string
          created_at?: string
          document_file_id?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_member_certifications_certification_type_id_fkey"
            columns: ["certification_type_id"]
            isOneToOne: false
            referencedRelation: "certification_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_certifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      team_member_profiles: {
        Row: {
          avatar_file_id: string | null
          bio: string | null
          created_at: string
          currency: string
          day_rate_cents: number | null
          department_id: string | null
          employment_type: string
          home_location: string | null
          hour_rate_cents: number | null
          member_code: string | null
          overtime_rate_cents: number | null
          phone: string | null
          primary_role_id: string | null
          rates_visible_to: string
          rating: number | null
          standard_weekly_hours: number
          travel_radius_miles: number | null
          updated_at: string
          user_id: string
          willing_to_travel: boolean
          workspace_id: string
        }
        Insert: {
          avatar_file_id?: string | null
          bio?: string | null
          created_at?: string
          currency?: string
          day_rate_cents?: number | null
          department_id?: string | null
          employment_type?: string
          home_location?: string | null
          hour_rate_cents?: number | null
          member_code?: string | null
          overtime_rate_cents?: number | null
          phone?: string | null
          primary_role_id?: string | null
          rates_visible_to?: string
          rating?: number | null
          standard_weekly_hours?: number
          travel_radius_miles?: number | null
          updated_at?: string
          user_id: string
          willing_to_travel?: boolean
          workspace_id: string
        }
        Update: {
          avatar_file_id?: string | null
          bio?: string | null
          created_at?: string
          currency?: string
          day_rate_cents?: number | null
          department_id?: string | null
          employment_type?: string
          home_location?: string | null
          hour_rate_cents?: number | null
          member_code?: string | null
          overtime_rate_cents?: number | null
          phone?: string | null
          primary_role_id?: string | null
          rates_visible_to?: string
          rating?: number | null
          standard_weekly_hours?: number
          travel_radius_miles?: number | null
          updated_at?: string
          user_id?: string
          willing_to_travel?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_member_profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "team_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_profiles_primary_role_id_fkey"
            columns: ["primary_role_id"]
            isOneToOne: false
            referencedRelation: "staffing_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      team_member_regions: {
        Row: {
          created_at: string
          id: string
          region_name: string
          tier: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          region_name: string
          tier?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          region_name?: string
          tier?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_member_regions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      team_member_skills: {
        Row: {
          created_at: string
          id: string
          proficiency: string
          skill_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          proficiency?: string
          skill_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          proficiency?: string
          skill_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_member_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_skills_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      team_session_revocations: {
        Row: {
          id: string
          notes: string | null
          reason: string
          revoked_at: string
          revoked_by: string | null
          target_user_id: string
          workspace_id: string
        }
        Insert: {
          id?: string
          notes?: string | null
          reason?: string
          revoked_at?: string
          revoked_by?: string | null
          target_user_id: string
          workspace_id: string
        }
        Update: {
          id?: string
          notes?: string | null
          reason?: string
          revoked_at?: string
          revoked_by?: string | null
          target_user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_session_revocations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_orders: {
        Row: {
          amount_cents: number
          billing_address: Json | null
          buyer_email: string | null
          buyer_name: string | null
          buyer_phone: string | null
          channel: string
          created_at: string
          currency: string
          customer_id: string | null
          delivery_method: string
          discount_cents: number
          event_id: string
          fee_cents: number
          fee_cents_computed: number
          id: string
          marketing_opt_in: boolean
          order_reference: string | null
          promo_code_id: string | null
          quantity: number
          refunded_cents: number
          status: string
          stripe_session_id: string | null
          ticket_type_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount_cents?: number
          billing_address?: Json | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          channel?: string
          created_at?: string
          currency?: string
          customer_id?: string | null
          delivery_method?: string
          discount_cents?: number
          event_id: string
          fee_cents?: number
          fee_cents_computed?: number
          id?: string
          marketing_opt_in?: boolean
          order_reference?: string | null
          promo_code_id?: string | null
          quantity?: number
          refunded_cents?: number
          status?: string
          stripe_session_id?: string | null
          ticket_type_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount_cents?: number
          billing_address?: Json | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          channel?: string
          created_at?: string
          currency?: string
          customer_id?: string | null
          delivery_method?: string
          discount_cents?: number
          event_id?: string
          fee_cents?: number
          fee_cents_computed?: number
          id?: string
          marketing_opt_in?: boolean
          order_reference?: string | null
          promo_code_id?: string | null
          quantity?: number
          refunded_cents?: number
          status?: string
          stripe_session_id?: string | null
          ticket_type_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_orders_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_orders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_promo_codes: {
        Row: {
          active: boolean
          amount_off_cents: number | null
          code: string
          created_at: string
          ends_at: string | null
          event_id: string | null
          id: string
          max_redemptions: number | null
          percent_off: number | null
          redeemed_count: number
          starts_at: string | null
          workspace_id: string
        }
        Insert: {
          active?: boolean
          amount_off_cents?: number | null
          code: string
          created_at?: string
          ends_at?: string | null
          event_id?: string | null
          id?: string
          max_redemptions?: number | null
          percent_off?: number | null
          redeemed_count?: number
          starts_at?: string | null
          workspace_id: string
        }
        Update: {
          active?: boolean
          amount_off_cents?: number | null
          code?: string
          created_at?: string
          ends_at?: string | null
          event_id?: string | null
          id?: string
          max_redemptions?: number | null
          percent_off?: number | null
          redeemed_count?: number
          starts_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_promo_codes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_promo_codes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_promo_codes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_types: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          description: string | null
          event_id: string
          id: string
          name: string
          price_cents: number
          quantity: number | null
          sales_end: string | null
          sales_start: string | null
          sold: number
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          description?: string | null
          event_id: string
          id?: string
          name: string
          price_cents?: number
          quantity?: number | null
          sales_end?: string | null
          sales_start?: string | null
          sold?: number
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          description?: string | null
          event_id?: string
          id?: string
          name?: string
          price_cents?: number
          quantity?: number | null
          sales_end?: string | null
          sales_start?: string | null
          sold?: number
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_types_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_types_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_types_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheets: {
        Row: {
          actual_hours: number
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          department: string
          event_id: string
          hourly_rate_cents: number
          id: string
          notes: string | null
          overtime_hours: number
          overtime_rate_cents: number
          pay_period_end: string
          pay_period_start: string
          role: string | null
          scheduled_hours: number
          staff_assignment_id: string | null
          team_member_id: string | null
          team_member_name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          actual_hours?: number
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          department?: string
          event_id: string
          hourly_rate_cents?: number
          id?: string
          notes?: string | null
          overtime_hours?: number
          overtime_rate_cents?: number
          pay_period_end: string
          pay_period_start: string
          role?: string | null
          scheduled_hours?: number
          staff_assignment_id?: string | null
          team_member_id?: string | null
          team_member_name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          actual_hours?: number
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          department?: string
          event_id?: string
          hourly_rate_cents?: number
          id?: string
          notes?: string | null
          overtime_hours?: number
          overtime_rate_cents?: number
          pay_period_end?: string
          pay_period_start?: string
          role?: string | null
          scheduled_hours?: number
          staff_assignment_id?: string | null
          team_member_id?: string | null
          team_member_name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_staff_assignment_id_fkey"
            columns: ["staff_assignment_id"]
            isOneToOne: false
            referencedRelation: "event_staff_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          category: string
          channel: string
          created_at: string
          enabled: boolean
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          channel: string
          created_at?: string
          enabled?: boolean
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          channel?: string
          created_at?: string
          enabled?: boolean
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_status: {
        Row: {
          changed_at: string
          changed_by: string | null
          created_at: string
          reason: string | null
          status: Database["public"]["Enums"]["user_account_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          created_at?: string
          reason?: string | null
          status?: Database["public"]["Enums"]["user_account_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          created_at?: string
          reason?: string | null
          status?: Database["public"]["Enums"]["user_account_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      venue_access_details: {
        Row: {
          access_hours: string | null
          accessible_parking: boolean | null
          accessible_toilets: boolean | null
          coach_parking: string | null
          dock_leveller: boolean | null
          event_entrance: string | null
          hearing_loop: boolean | null
          id: string
          loading_access_hours: string | null
          loading_bay: string | null
          loading_bay_height_m: number | null
          local_area_notes: string | null
          logistics_reminders: Json
          main_entrance: string | null
          nearby_hotels: Json
          nearest_car_park: string | null
          nearest_station: string | null
          on_site_parking: string | null
          passenger_lifts: number | null
          secondary_entrance: string | null
          security_process: string | null
          service_lift: boolean | null
          step_free_access: boolean | null
          supplier_entrance: string | null
          travel_times: Json
          updated_at: string
          vehicle_restrictions: string | null
          venue_id: string
          workspace_id: string
        }
        Insert: {
          access_hours?: string | null
          accessible_parking?: boolean | null
          accessible_toilets?: boolean | null
          coach_parking?: string | null
          dock_leveller?: boolean | null
          event_entrance?: string | null
          hearing_loop?: boolean | null
          id?: string
          loading_access_hours?: string | null
          loading_bay?: string | null
          loading_bay_height_m?: number | null
          local_area_notes?: string | null
          logistics_reminders?: Json
          main_entrance?: string | null
          nearby_hotels?: Json
          nearest_car_park?: string | null
          nearest_station?: string | null
          on_site_parking?: string | null
          passenger_lifts?: number | null
          secondary_entrance?: string | null
          security_process?: string | null
          service_lift?: boolean | null
          step_free_access?: boolean | null
          supplier_entrance?: string | null
          travel_times?: Json
          updated_at?: string
          vehicle_restrictions?: string | null
          venue_id: string
          workspace_id: string
        }
        Update: {
          access_hours?: string | null
          accessible_parking?: boolean | null
          accessible_toilets?: boolean | null
          coach_parking?: string | null
          dock_leveller?: boolean | null
          event_entrance?: string | null
          hearing_loop?: boolean | null
          id?: string
          loading_access_hours?: string | null
          loading_bay?: string | null
          loading_bay_height_m?: number | null
          local_area_notes?: string | null
          logistics_reminders?: Json
          main_entrance?: string | null
          nearby_hotels?: Json
          nearest_car_park?: string | null
          nearest_station?: string | null
          on_site_parking?: string | null
          passenger_lifts?: number | null
          secondary_entrance?: string | null
          security_process?: string | null
          service_lift?: boolean | null
          step_free_access?: boolean | null
          supplier_entrance?: string | null
          travel_times?: Json
          updated_at?: string
          vehicle_restrictions?: string | null
          venue_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_access_details_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_access_details_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_activity_log: {
        Row: {
          activity_type: string
          actor_id: string | null
          created_at: string
          description: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_internal: boolean
          metadata: Json
          outcome: string | null
          source: string | null
          title: string
          venue_id: string
          workspace_id: string
        }
        Insert: {
          activity_type: string
          actor_id?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_internal?: boolean
          metadata?: Json
          outcome?: string | null
          source?: string | null
          title: string
          venue_id: string
          workspace_id: string
        }
        Update: {
          activity_type?: string
          actor_id?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_internal?: boolean
          metadata?: Json
          outcome?: string | null
          source?: string | null
          title?: string
          venue_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_activity_log_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_activity_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_attachments: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          is_cover: boolean
          kind: Database["public"]["Enums"]["venue_attachment_kind"]
          mime: string | null
          position: number
          size_bytes: number | null
          storage_path: string
          title: string | null
          updated_at: string
          uploaded_by: string | null
          venue_id: string
          workspace_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          is_cover?: boolean
          kind?: Database["public"]["Enums"]["venue_attachment_kind"]
          mime?: string | null
          position?: number
          size_bytes?: number | null
          storage_path: string
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
          venue_id: string
          workspace_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          is_cover?: boolean
          kind?: Database["public"]["Enums"]["venue_attachment_kind"]
          mime?: string | null
          position?: number
          size_bytes?: number | null
          storage_path?: string
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
          venue_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_attachments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_booking_fb_selections: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          package_id: string
          quantity: number
          workspace_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          package_id: string
          quantity?: number
          workspace_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          package_id?: string
          quantity?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_booking_fb_selections_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "venue_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_booking_fb_selections_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "venue_fb_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_booking_fb_selections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_bookings: {
        Row: {
          client_email: string | null
          client_name: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          end_at: string | null
          event_id: string | null
          headcount: number | null
          id: string
          notes: string | null
          space_id: string | null
          start_at: string | null
          status: string
          total_cents: number
          updated_at: string
          venue_id: string
          workspace_id: string
        }
        Insert: {
          client_email?: string | null
          client_name: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          end_at?: string | null
          event_id?: string | null
          headcount?: number | null
          id?: string
          notes?: string | null
          space_id?: string | null
          start_at?: string | null
          status?: string
          total_cents?: number
          updated_at?: string
          venue_id: string
          workspace_id: string
        }
        Update: {
          client_email?: string | null
          client_name?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          end_at?: string | null
          event_id?: string | null
          headcount?: number | null
          id?: string
          notes?: string | null
          space_id?: string | null
          start_at?: string | null
          status?: string
          total_cents?: number
          updated_at?: string
          venue_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_bookings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_bookings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_bookings_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "venue_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_bookings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_categories: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          position: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          position?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          position?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_commercial_terms: {
        Row: {
          auto_renewal: boolean
          bar_deposit_cents: number | null
          cancellation_terms: Json
          contract_effective_date: string | null
          contract_expiry_date: string | null
          contract_signed_date: string | null
          contract_status: string
          corkage_policy: string | null
          currency: string
          day_rate_cents: number | null
          deposit_refundable: boolean
          evening_rate_cents: number | null
          fb_minimum_cents: number | null
          fb_minimum_per_head_cents: number | null
          final_balance_days: number | null
          half_day_rate_cents: number | null
          hire_rate_from_cents: number | null
          hourly_rate_cents: number | null
          id: string
          min_hire_hours: number | null
          min_spend_weekday_cents: number | null
          min_spend_weekend_cents: number | null
          negotiation_notes: string | null
          next_review_date: string | null
          notice_period_days: number | null
          payment_terms_days: number | null
          security_deposit_cents: number | null
          service_charge_pct: number | null
          standard_deposit_pct: number | null
          supplier_restrictions: Json
          updated_at: string
          vat_treatment: string | null
          venue_id: string
          weekend_rate_cents: number | null
          workspace_id: string
        }
        Insert: {
          auto_renewal?: boolean
          bar_deposit_cents?: number | null
          cancellation_terms?: Json
          contract_effective_date?: string | null
          contract_expiry_date?: string | null
          contract_signed_date?: string | null
          contract_status?: string
          corkage_policy?: string | null
          currency?: string
          day_rate_cents?: number | null
          deposit_refundable?: boolean
          evening_rate_cents?: number | null
          fb_minimum_cents?: number | null
          fb_minimum_per_head_cents?: number | null
          final_balance_days?: number | null
          half_day_rate_cents?: number | null
          hire_rate_from_cents?: number | null
          hourly_rate_cents?: number | null
          id?: string
          min_hire_hours?: number | null
          min_spend_weekday_cents?: number | null
          min_spend_weekend_cents?: number | null
          negotiation_notes?: string | null
          next_review_date?: string | null
          notice_period_days?: number | null
          payment_terms_days?: number | null
          security_deposit_cents?: number | null
          service_charge_pct?: number | null
          standard_deposit_pct?: number | null
          supplier_restrictions?: Json
          updated_at?: string
          vat_treatment?: string | null
          venue_id: string
          weekend_rate_cents?: number | null
          workspace_id: string
        }
        Update: {
          auto_renewal?: boolean
          bar_deposit_cents?: number | null
          cancellation_terms?: Json
          contract_effective_date?: string | null
          contract_expiry_date?: string | null
          contract_signed_date?: string | null
          contract_status?: string
          corkage_policy?: string | null
          currency?: string
          day_rate_cents?: number | null
          deposit_refundable?: boolean
          evening_rate_cents?: number | null
          fb_minimum_cents?: number | null
          fb_minimum_per_head_cents?: number | null
          final_balance_days?: number | null
          half_day_rate_cents?: number | null
          hire_rate_from_cents?: number | null
          hourly_rate_cents?: number | null
          id?: string
          min_hire_hours?: number | null
          min_spend_weekday_cents?: number | null
          min_spend_weekend_cents?: number | null
          negotiation_notes?: string | null
          next_review_date?: string | null
          notice_period_days?: number | null
          payment_terms_days?: number | null
          security_deposit_cents?: number | null
          service_charge_pct?: number | null
          standard_deposit_pct?: number | null
          supplier_restrictions?: Json
          updated_at?: string
          vat_treatment?: string | null
          venue_id?: string
          weekend_rate_cents?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_commercial_terms_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_commercial_terms_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_commercial_transactions: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          currency: string
          due_date: string | null
          id: string
          notes: string | null
          paid_status: string
          related_event_id: string | null
          related_proposal_id: string | null
          transaction_type: string
          venue_id: string
          workspace_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_status?: string
          related_event_id?: string | null
          related_proposal_id?: string | null
          transaction_type: string
          venue_id: string
          workspace_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_status?: string
          related_event_id?: string | null
          related_proposal_id?: string | null
          transaction_type?: string
          venue_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_commercial_transactions_related_event_id_fkey"
            columns: ["related_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_commercial_transactions_related_event_id_fkey"
            columns: ["related_event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_commercial_transactions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_commercial_transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_contacts: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_primary: boolean
          name: string
          phone: string | null
          role: string | null
          updated_at: string
          venue_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          phone?: string | null
          role?: string | null
          updated_at?: string
          venue_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          phone?: string | null
          role?: string | null
          updated_at?: string
          venue_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_contacts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_documents: {
        Row: {
          category: string | null
          checksum: string | null
          created_at: string
          doc_type: string
          expiry_date: string | null
          file_size_bytes: number | null
          filename: string
          id: string
          is_current: boolean
          parent_document_id: string | null
          r2_key: string | null
          status: string
          storage_key: string
          uploaded_by: string | null
          venue_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          category?: string | null
          checksum?: string | null
          created_at?: string
          doc_type: string
          expiry_date?: string | null
          file_size_bytes?: number | null
          filename: string
          id?: string
          is_current?: boolean
          parent_document_id?: string | null
          r2_key?: string | null
          status?: string
          storage_key: string
          uploaded_by?: string | null
          venue_id: string
          version?: number
          workspace_id: string
        }
        Update: {
          category?: string | null
          checksum?: string | null
          created_at?: string
          doc_type?: string
          expiry_date?: string | null
          file_size_bytes?: number | null
          filename?: string
          id?: string
          is_current?: boolean
          parent_document_id?: string | null
          r2_key?: string | null
          status?: string
          storage_key?: string
          uploaded_by?: string | null
          venue_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_documents_parent_document_id_fkey"
            columns: ["parent_document_id"]
            isOneToOne: false
            referencedRelation: "venue_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_documents_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_fb_packages: {
        Row: {
          created_at: string
          description: string | null
          id: string
          min_headcount: number | null
          name: string
          per_head_cents: number
          sort_order: number
          venue_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          min_headcount?: number | null
          name: string
          per_head_cents?: number
          sort_order?: number
          venue_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          min_headcount?: number | null
          name?: string
          per_head_cents?: number
          sort_order?: number
          venue_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_fb_packages_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_fb_packages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_holds: {
        Row: {
          confirmation_reference: string | null
          created_at: string
          created_by: string | null
          deposit_cents: number | null
          end_at: string | null
          event_id: string | null
          expiry_date: string | null
          fee_cents: number | null
          hold_type: string
          id: string
          notes: string | null
          space_id: string | null
          start_at: string | null
          status: string
          updated_at: string
          venue_contact_id: string | null
          venue_id: string
          workspace_id: string
        }
        Insert: {
          confirmation_reference?: string | null
          created_at?: string
          created_by?: string | null
          deposit_cents?: number | null
          end_at?: string | null
          event_id?: string | null
          expiry_date?: string | null
          fee_cents?: number | null
          hold_type?: string
          id?: string
          notes?: string | null
          space_id?: string | null
          start_at?: string | null
          status?: string
          updated_at?: string
          venue_contact_id?: string | null
          venue_id: string
          workspace_id: string
        }
        Update: {
          confirmation_reference?: string | null
          created_at?: string
          created_by?: string | null
          deposit_cents?: number | null
          end_at?: string | null
          event_id?: string | null
          expiry_date?: string | null
          fee_cents?: number | null
          hold_type?: string
          id?: string
          notes?: string | null
          space_id?: string | null
          start_at?: string | null
          status?: string
          updated_at?: string
          venue_contact_id?: string | null
          venue_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_holds_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_holds_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_holds_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "venue_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_holds_venue_contact_id_fkey"
            columns: ["venue_contact_id"]
            isOneToOne: false
            referencedRelation: "venue_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_holds_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_holds_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_media: {
        Row: {
          alt_text: string | null
          caption: string | null
          category: string
          created_at: string
          created_by: string | null
          id: string
          is_cover: boolean
          r2_key: string
          sort_order: number
          space_id: string | null
          venue_id: string
          workspace_id: string
        }
        Insert: {
          alt_text?: string | null
          caption?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_cover?: boolean
          r2_key: string
          sort_order?: number
          space_id?: string | null
          venue_id: string
          workspace_id: string
        }
        Update: {
          alt_text?: string | null
          caption?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_cover?: boolean
          r2_key?: string
          sort_order?: number
          space_id?: string | null
          venue_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_media_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "venue_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_media_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_media_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_pinned: boolean
          note_type: string
          related_event_id: string | null
          reminder_date: string | null
          tags: Json
          updated_at: string
          venue_id: string
          workspace_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_pinned?: boolean
          note_type?: string
          related_event_id?: string | null
          reminder_date?: string | null
          tags?: Json
          updated_at?: string
          venue_id: string
          workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_pinned?: boolean
          note_type?: string
          related_event_id?: string | null
          reminder_date?: string | null
          tags?: Json
          updated_at?: string
          venue_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_notes_related_event_id_fkey"
            columns: ["related_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_notes_related_event_id_fkey"
            columns: ["related_event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_notes_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_room_blocks: {
        Row: {
          attrition_terms: string | null
          booking_code: string | null
          booking_link: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          deposit_cents: number | null
          end_date: string | null
          event_id: string | null
          id: string
          nightly_rate_cents: number | null
          notes: string | null
          num_rooms: number
          release_date: string | null
          room_type: string | null
          start_date: string | null
          status: string
          venue_id: string
          workspace_id: string
        }
        Insert: {
          attrition_terms?: string | null
          booking_code?: string | null
          booking_link?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deposit_cents?: number | null
          end_date?: string | null
          event_id?: string | null
          id?: string
          nightly_rate_cents?: number | null
          notes?: string | null
          num_rooms?: number
          release_date?: string | null
          room_type?: string | null
          start_date?: string | null
          status?: string
          venue_id: string
          workspace_id: string
        }
        Update: {
          attrition_terms?: string | null
          booking_code?: string | null
          booking_link?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deposit_cents?: number | null
          end_date?: string | null
          event_id?: string | null
          id?: string
          nightly_rate_cents?: number | null
          notes?: string | null
          num_rooms?: number
          release_date?: string | null
          room_type?: string | null
          start_date?: string | null
          status?: string
          venue_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_room_blocks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "venue_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_room_blocks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_room_blocks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_room_blocks_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_room_blocks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_site_maps: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean
          kind: string
          label: string | null
          r2_key: string
          venue_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          kind?: string
          label?: string | null
          r2_key: string
          venue_id: string
          version?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          kind?: string
          label?: string | null
          r2_key?: string
          venue_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_site_maps_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_site_maps_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_spaces: {
        Row: {
          accessibility: string | null
          amenities: Json
          area_sqm: number | null
          av_readiness: string | null
          banquet_capacity: number | null
          boardroom_capacity: number | null
          cabaret_capacity: number | null
          capacity_seated: number | null
          capacity_standing: number | null
          ceiling_height_m: number | null
          classroom_capacity: number | null
          cover_media_id: string | null
          created_at: string
          description: string | null
          dimensions: string | null
          hire_fee_cents: number | null
          id: string
          name: string
          preferred_uses: Json
          reception_capacity: number | null
          restrictions: string | null
          sort_order: number
          space_type: string | null
          theatre_capacity: number | null
          updated_at: string
          venue_id: string
          workspace_id: string
        }
        Insert: {
          accessibility?: string | null
          amenities?: Json
          area_sqm?: number | null
          av_readiness?: string | null
          banquet_capacity?: number | null
          boardroom_capacity?: number | null
          cabaret_capacity?: number | null
          capacity_seated?: number | null
          capacity_standing?: number | null
          ceiling_height_m?: number | null
          classroom_capacity?: number | null
          cover_media_id?: string | null
          created_at?: string
          description?: string | null
          dimensions?: string | null
          hire_fee_cents?: number | null
          id?: string
          name: string
          preferred_uses?: Json
          reception_capacity?: number | null
          restrictions?: string | null
          sort_order?: number
          space_type?: string | null
          theatre_capacity?: number | null
          updated_at?: string
          venue_id: string
          workspace_id: string
        }
        Update: {
          accessibility?: string | null
          amenities?: Json
          area_sqm?: number | null
          av_readiness?: string | null
          banquet_capacity?: number | null
          boardroom_capacity?: number | null
          cabaret_capacity?: number | null
          capacity_seated?: number | null
          capacity_standing?: number | null
          ceiling_height_m?: number | null
          classroom_capacity?: number | null
          cover_media_id?: string | null
          created_at?: string
          description?: string | null
          dimensions?: string | null
          hire_fee_cents?: number | null
          id?: string
          name?: string
          preferred_uses?: Json
          reception_capacity?: number | null
          restrictions?: string | null
          sort_order?: number
          space_type?: string | null
          theatre_capacity?: number | null
          updated_at?: string
          venue_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_spaces_cover_media_fk"
            columns: ["cover_media_id"]
            isOneToOne: false
            referencedRelation: "venue_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_spaces_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_spaces_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_staff_assignments: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          notes: string | null
          role: string | null
          shift_end: string | null
          shift_start: string | null
          staff_name: string
          venue_id: string
          workspace_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          role?: string | null
          shift_end?: string | null
          shift_start?: string | null
          staff_name: string
          venue_id: string
          workspace_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          role?: string | null
          shift_end?: string | null
          shift_start?: string | null
          staff_name?: string
          venue_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_staff_assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "venue_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_staff_assignments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_staff_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          accessibility_features: Json
          address: string | null
          address_line1: string | null
          address_line2: string | null
          avg_spend_cents: number | null
          best_fit_event_types: Json
          capacity: number | null
          category_id: string | null
          city: string | null
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          country_code: string | null
          cover_attachment_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          is_preferred: boolean
          is_verified: boolean
          last_used_at: string | null
          latitude: number | null
          longitude: number | null
          merged_into_id: string | null
          name: string
          notes: string | null
          postal_code: string | null
          preferred_by: string | null
          preferred_reason: string | null
          preferred_since: string | null
          rating: number | null
          region: string | null
          relationship_owner_id: string | null
          response_time_hours: number | null
          review_date: string | null
          slug: string | null
          status: string
          suitability_score: number | null
          timezone: string | null
          updated_at: string
          website: string | null
          what3words: string | null
          workspace_id: string
        }
        Insert: {
          accessibility_features?: Json
          address?: string | null
          address_line1?: string | null
          address_line2?: string | null
          avg_spend_cents?: number | null
          best_fit_event_types?: Json
          capacity?: number | null
          category_id?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          country_code?: string | null
          cover_attachment_id?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          is_preferred?: boolean
          is_verified?: boolean
          last_used_at?: string | null
          latitude?: number | null
          longitude?: number | null
          merged_into_id?: string | null
          name: string
          notes?: string | null
          postal_code?: string | null
          preferred_by?: string | null
          preferred_reason?: string | null
          preferred_since?: string | null
          rating?: number | null
          region?: string | null
          relationship_owner_id?: string | null
          response_time_hours?: number | null
          review_date?: string | null
          slug?: string | null
          status?: string
          suitability_score?: number | null
          timezone?: string | null
          updated_at?: string
          website?: string | null
          what3words?: string | null
          workspace_id: string
        }
        Update: {
          accessibility_features?: Json
          address?: string | null
          address_line1?: string | null
          address_line2?: string | null
          avg_spend_cents?: number | null
          best_fit_event_types?: Json
          capacity?: number | null
          category_id?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          country_code?: string | null
          cover_attachment_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          is_preferred?: boolean
          is_verified?: boolean
          last_used_at?: string | null
          latitude?: number | null
          longitude?: number | null
          merged_into_id?: string | null
          name?: string
          notes?: string | null
          postal_code?: string | null
          preferred_by?: string | null
          preferred_reason?: string | null
          preferred_since?: string | null
          rating?: number | null
          region?: string | null
          relationship_owner_id?: string | null
          response_time_hours?: number | null
          review_date?: string | null
          slug?: string | null
          status?: string
          suitability_score?: number | null
          timezone?: string | null
          updated_at?: string
          website?: string | null
          what3words?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venues_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "venue_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venues_cover_attachment_id_fkey"
            columns: ["cover_attachment_id"]
            isOneToOne: false
            referencedRelation: "venue_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venues_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venues_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_ai_settings: {
        Row: {
          created_at: string
          kill_switch: boolean
          model: string
          monthly_budget_usd: number
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          kill_switch?: boolean
          model?: string
          monthly_budget_usd?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          kill_switch?: boolean
          model?: string
          monthly_budget_usd?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_ai_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_deletion_otps: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          user_id: string
          verified_at: string | null
          workspace_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          user_id: string
          verified_at?: string | null
          workspace_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          user_id?: string
          verified_at?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_deletion_requests: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          confirmation_token: string
          error_message: string | null
          otp_verified_at: string | null
          purge_attempts: number
          purge_started_at: string | null
          purged_at: string | null
          requested_at: string
          requested_by: string
          status: Database["public"]["Enums"]["workspace_deletion_status"]
          undo_deadline: string
          workspace_id: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          confirmation_token: string
          error_message?: string | null
          otp_verified_at?: string | null
          purge_attempts?: number
          purge_started_at?: string | null
          purged_at?: string | null
          requested_at?: string
          requested_by: string
          status?: Database["public"]["Enums"]["workspace_deletion_status"]
          undo_deadline: string
          workspace_id: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          confirmation_token?: string
          error_message?: string | null
          otp_verified_at?: string | null
          purge_attempts?: number
          purge_started_at?: string | null
          purged_at?: string | null
          requested_at?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["workspace_deletion_status"]
          undo_deadline?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_demo_events: {
        Row: {
          action: string
          actor_user_id: string | null
          id: string
          metadata: Json
          occurred_at: string
          workspace_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          workspace_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_demo_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_demo_seed_index: {
        Row: {
          created_at: string
          id: string
          row_id: string
          table_name: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          row_id: string
          table_name: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          row_id?: string
          table_name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_demo_seed_index_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_demo_state: {
        Row: {
          created_at: string
          expires_at: string | null
          last_purged_at: string | null
          loaded_at: string | null
          status: Database["public"]["Enums"]["demo_state_status"]
          total_rows: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          last_purged_at?: string | null
          loaded_at?: string | null
          status?: Database["public"]["Enums"]["demo_state_status"]
          total_rows?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          last_purged_at?: string | null
          loaded_at?: string | null
          status?: Database["public"]["Enums"]["demo_state_status"]
          total_rows?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_demo_state_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_integrations: {
        Row: {
          connected_by: string | null
          created_at: string
          credentials_vault_ref: string | null
          id: string
          last_synced_at: string | null
          provider: string
          scopes: string[]
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          connected_by?: string | null
          created_at?: string
          credentials_vault_ref?: string | null
          id?: string
          last_synced_at?: string | null
          provider: string
          scopes?: string[]
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          connected_by?: string | null
          created_at?: string
          credentials_vault_ref?: string | null
          id?: string
          last_synced_at?: string | null
          provider?: string
          scopes?: string[]
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          last_sent_at: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          send_count: number
          token_hash: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          send_count?: number
          token_hash: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          send_count?: number
          token_hash?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          invited_by: string | null
          joined_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_notification_defaults: {
        Row: {
          category: string
          channel: string
          created_at: string
          enabled: boolean
          locked_by_admin: boolean
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          category: string
          channel: string
          created_at?: string
          enabled?: boolean
          locked_by_admin?: boolean
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          category?: string
          channel?: string
          created_at?: string
          enabled?: boolean
          locked_by_admin?: boolean
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_settings: {
        Row: {
          calendar_layers: string[]
          calendar_timezone: string
          chat_allow_dms: boolean
          chat_allow_public_create: boolean
          chat_default_notify: string
          chat_retention_days: number | null
          chat_show_archived: boolean
          created_at: string
          default_calendar_view: string
          default_currency: string
          default_payment_terms_days: number
          default_tax_rate_pct: number
          email_default_mailbox_id: string | null
          email_remote_images_default: string
          email_retention_days: number | null
          email_send_rate_per_hour_mailbox: number
          email_send_rate_per_hour_workspace: number
          email_signature_html: string | null
          event_number_prefix: string
          id: string
          invoice_prefix: string
          quote_prefix: string
          updated_at: string
          week_start: number
          workspace_id: string
        }
        Insert: {
          calendar_layers?: string[]
          calendar_timezone?: string
          chat_allow_dms?: boolean
          chat_allow_public_create?: boolean
          chat_default_notify?: string
          chat_retention_days?: number | null
          chat_show_archived?: boolean
          created_at?: string
          default_calendar_view?: string
          default_currency?: string
          default_payment_terms_days?: number
          default_tax_rate_pct?: number
          email_default_mailbox_id?: string | null
          email_remote_images_default?: string
          email_retention_days?: number | null
          email_send_rate_per_hour_mailbox?: number
          email_send_rate_per_hour_workspace?: number
          email_signature_html?: string | null
          event_number_prefix?: string
          id?: string
          invoice_prefix?: string
          quote_prefix?: string
          updated_at?: string
          week_start?: number
          workspace_id: string
        }
        Update: {
          calendar_layers?: string[]
          calendar_timezone?: string
          chat_allow_dms?: boolean
          chat_allow_public_create?: boolean
          chat_default_notify?: string
          chat_retention_days?: number | null
          chat_show_archived?: boolean
          created_at?: string
          default_calendar_view?: string
          default_currency?: string
          default_payment_terms_days?: number
          default_tax_rate_pct?: number
          email_default_mailbox_id?: string | null
          email_remote_images_default?: string
          email_retention_days?: number | null
          email_send_rate_per_hour_mailbox?: number
          email_send_rate_per_hour_workspace?: number
          email_signature_html?: string | null
          event_number_prefix?: string
          id?: string
          invoice_prefix?: string
          quote_prefix?: string
          updated_at?: string
          week_start?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_usage: {
        Row: {
          id: string
          metric: Database["public"]["Enums"]["usage_metric"]
          period_yyyymm: string
          updated_at: string
          value: number
          workspace_id: string
        }
        Insert: {
          id?: string
          metric: Database["public"]["Enums"]["usage_metric"]
          period_yyyymm: string
          updated_at?: string
          value?: number
          workspace_id: string
        }
        Update: {
          id?: string
          metric?: Database["public"]["Enums"]["usage_metric"]
          period_yyyymm?: string
          updated_at?: string
          value?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_usage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          activated_at: string | null
          branding: Json
          country: string
          created_at: string
          currency: string
          deleted_at: string | null
          id: string
          locale: string
          marketplace_admin_fee_bps: number | null
          marketplace_commission_bps: number | null
          name: string
          owner_user_id: string
          plan: string
          release_stage: string
          slug: string
          stripe_billing_account_id: string | null
          stripe_billing_charges_enabled: boolean
          stripe_billing_details_submitted: boolean
          stripe_billing_synced_at: string | null
          stripe_connect_account_id: string | null
          stripe_connect_charges_enabled: boolean
          stripe_connect_details_submitted: boolean
          stripe_connect_payouts_enabled: boolean
          stripe_connect_synced_at: string | null
          suspended_at: string | null
          suspended_by: string | null
          suspended_reason: string | null
          timezone: string
          trial_ends_at: string | null
          updated_at: string
          workspace_type: string
        }
        Insert: {
          activated_at?: string | null
          branding?: Json
          country?: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          locale?: string
          marketplace_admin_fee_bps?: number | null
          marketplace_commission_bps?: number | null
          name: string
          owner_user_id: string
          plan?: string
          release_stage?: string
          slug: string
          stripe_billing_account_id?: string | null
          stripe_billing_charges_enabled?: boolean
          stripe_billing_details_submitted?: boolean
          stripe_billing_synced_at?: string | null
          stripe_connect_account_id?: string | null
          stripe_connect_charges_enabled?: boolean
          stripe_connect_details_submitted?: boolean
          stripe_connect_payouts_enabled?: boolean
          stripe_connect_synced_at?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
          workspace_type?: string
        }
        Update: {
          activated_at?: string | null
          branding?: Json
          country?: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          locale?: string
          marketplace_admin_fee_bps?: number | null
          marketplace_commission_bps?: number | null
          name?: string
          owner_user_id?: string
          plan?: string
          release_stage?: string
          slug?: string
          stripe_billing_account_id?: string | null
          stripe_billing_charges_enabled?: boolean
          stripe_billing_details_submitted?: boolean
          stripe_billing_synced_at?: string | null
          stripe_connect_account_id?: string | null
          stripe_connect_charges_enabled?: boolean
          stripe_connect_details_submitted?: boolean
          stripe_connect_payouts_enabled?: boolean
          stripe_connect_synced_at?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
          workspace_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      affiliate_conversions_quarantined: {
        Row: {
          account_id: string | null
          account_status_at_event: string | null
          account_status_now:
            | Database["public"]["Enums"]["affiliate_account_status"]
            | null
          amount_cents: number | null
          attribution_event: string | null
          audit_id: number | null
          currency: string | null
          ref_code: string | null
          skipped_at: string | null
          source: string | null
          stripe_checkout_session_id: string | null
          stripe_invoice_id: string | null
          workspace_id: string | null
          workspace_name: string | null
          workspace_slug: string | null
        }
        Relationships: []
      }
      events_with_stats: {
        Row: {
          budget_cents: number | null
          client_company: string | null
          client_email: string | null
          client_id: string | null
          client_name: string | null
          client_phone: string | null
          completed_at: string | null
          confirmed_at: string | null
          cover_path: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          done_tasks: number | null
          end_at: string | null
          event_type: string | null
          flagged: boolean | null
          flagged_at: string | null
          flagged_by: string | null
          flagged_reason: string | null
          guest_count_day: number | null
          guest_count_evening: number | null
          id: string | null
          internal_notes: string | null
          location: string | null
          name: string | null
          owner_user_id: string | null
          pipeline_notes: string | null
          risk_level: string | null
          slug: string | null
          start_at: string | null
          status: string | null
          supplier_count: number | null
          template_id: string | null
          total_invoiced_cents: number | null
          total_paid_cents: number | null
          total_tasks: number | null
          updated_at: string | null
          venue_address_snapshot: string | null
          venue_capacity_snapshot: number | null
          venue_id: string | null
          venue_name_snapshot: string | null
          venue_snapshot_at: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "event_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      pg_audit_rls_coverage: {
        Row: {
          has_delete_policy: boolean | null
          has_insert_policy: boolean | null
          has_select_policy: boolean | null
          has_update_policy: boolean | null
          issue: string | null
          rls_enabled: boolean | null
          table_name: unknown
        }
        Relationships: []
      }
      supplier_health: {
        Row: {
          accepted_quotes: number | null
          bank_account_verified: boolean | null
          category_id: string | null
          created_at: string | null
          event_count: number | null
          id: string | null
          insurance_expired: boolean | null
          insurance_expiring_soon: boolean | null
          insurance_expiry: string | null
          last_used_at: string | null
          name: string | null
          onboarding_complete: boolean | null
          quote_count: number | null
          status: Database["public"]["Enums"]["supplier_status"] | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "supplier_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_finance_summary: {
        Row: {
          draft_count: number | null
          outstanding_cents: number | null
          overdue_cents: number | null
          overdue_count: number | null
          paid_count: number | null
          sent_count: number | null
          total_invoiced_cents: number | null
          total_invoices: number | null
          total_paid_cents: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_workspace_invitation_by_token: {
        Args: { _token_hash: string }
        Returns: {
          role: Database["public"]["Enums"]["workspace_role"]
          workspace_id: string
        }[]
      }
      admin_approve_affiliate_payout: {
        Args: { _note?: string; _payout_id: string }
        Returns: {
          account_id: string
          adjustments_cents: number
          approved_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          gross_commission_cents: number
          id: string
          net_commission_cents: number
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["affiliate_payout_status"]
          stripe_transfer_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "affiliate_payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_bump_not_before: {
        Args: { _reason?: string; _user_id: string }
        Returns: string
      }
      admin_calendar_browse: {
        Args: {
          _from: string
          _limit?: number
          _offset?: number
          _search?: string
          _to: string
        }
        Returns: {
          deep_link: string
          ends_at: string
          id: string
          kind: string
          owner_id: string
          starts_at: string
          status: string
          title: string
          total_count: number
          workspace_id: string
          workspace_name: string
        }[]
      }
      admin_chat_browse: {
        Args: {
          _include_archived?: boolean
          _kind?: string
          _limit?: number
          _offset?: number
          _search?: string
          _workspace_id?: string
        }
        Returns: {
          channel_id: string
          created_at: string
          is_archived: boolean
          kind: string
          last_activity: string
          member_count: number
          message_count: number
          name: string
          slug: string
          total_count: number
          workspace_id: string
          workspace_name: string
        }[]
      }
      admin_event_detail: {
        Args: { _id: string }
        Returns: {
          created_at: string
          deleted_at: string
          description: string
          end_at: string
          flagged: boolean
          flagged_at: string
          flagged_by: string
          flagged_reason: string
          id: string
          linked_suppliers_count: number
          location: string
          name: string
          slug: string
          start_at: string
          status: string
          updated_at: string
          venue_address_snapshot: string
          venue_capacity_snapshot: number
          venue_id: string
          venue_live_address: string
          venue_live_capacity: number
          venue_live_name: string
          venue_name_snapshot: string
          venue_snapshot_at: string
          workspace_id: string
          workspace_name: string
          workspace_slug: string
        }[]
      }
      admin_event_refresh_venue_snapshot: {
        Args: { _event_id: string }
        Returns: {
          event_id: string
          venue_address_snapshot: string
          venue_capacity_snapshot: number
          venue_id: string
          venue_name_snapshot: string
          venue_snapshot_at: string
        }[]
      }
      admin_events_browse: {
        Args: {
          _date_from?: string
          _date_to?: string
          _flagged_only?: boolean
          _include_deleted?: boolean
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string
          _venue_id?: string
          _workspace_id?: string
        }
        Returns: {
          created_at: string
          deleted_at: string
          end_at: string
          flagged: boolean
          flagged_reason: string
          id: string
          name: string
          start_at: string
          status: string
          total_count: number
          venue_id: string
          venue_name_snapshot: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      admin_library_browse: {
        Args: {
          _include_deleted?: boolean
          _kind?: string
          _limit?: number
          _offset?: number
          _search?: string
          _visibility?: string
        }
        Returns: {
          created_at: string
          deleted_at: string
          id: string
          kind: string
          locked_at: string
          mime: string
          pinned_at: string
          size_bytes: number
          tags: string[]
          title: string
          total_count: number
          updated_at: string
          use_count: number
          visibility: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      admin_reject_affiliate_payout: {
        Args: { _payout_id: string; _reason: string }
        Returns: {
          account_id: string
          adjustments_cents: number
          approved_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          gross_commission_cents: number
          id: string
          net_commission_cents: number
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["affiliate_payout_status"]
          stripe_transfer_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "affiliate_payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_session_is_fresh: {
        Args: {
          _iat_epoch_seconds: number
          _max_age_seconds?: number
          _user_id: string
        }
        Returns: boolean
      }
      admin_settings_overview: { Args: never; Returns: Json }
      admin_supplier_detail: {
        Args: { _id: string }
        Returns: {
          category_id: string
          category_name: string
          created_at: string
          deleted_at: string
          flagged: boolean
          flagged_at: string
          flagged_by: string
          flagged_reason: string
          id: string
          linked_events_count: number
          name: string
          notes: string
          primary_email: string
          primary_phone: string
          rating_internal: number
          status: string
          updated_at: string
          website: string
          workspace_id: string
          workspace_name: string
          workspace_slug: string
        }[]
      }
      admin_suppliers_browse: {
        Args: {
          _flagged_only?: boolean
          _include_deleted?: boolean
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string
        }
        Returns: {
          category_id: string
          category_name: string
          created_at: string
          deleted_at: string
          flagged: boolean
          flagged_reason: string
          id: string
          name: string
          primary_email: string
          rating_internal: number
          status: string
          total_count: number
          workspace_id: string
          workspace_name: string
        }[]
      }
      admin_tasks_browse: {
        Args: {
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string
        }
        Returns: {
          created_at: string
          due_at: string
          id: string
          list_id: string
          list_name: string
          priority: string
          status: string
          title: string
          total_count: number
          workspace_id: string
          workspace_name: string
        }[]
      }
      admin_venue_detail: {
        Args: { _id: string }
        Returns: {
          address: string
          address_line1: string
          address_line2: string
          capacity: number
          city: string
          contact_email: string
          contact_phone: string
          country: string
          country_code: string
          created_at: string
          deleted_at: string
          events_count: number
          id: string
          latitude: number
          longitude: number
          merged_into_id: string
          merged_into_name: string
          name: string
          notes: string
          postal_code: string
          region: string
          slug: string
          status: string
          timezone: string
          updated_at: string
          website: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      admin_venues_browse: {
        Args: {
          _city?: string
          _country_code?: string
          _include_deleted?: boolean
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string
        }
        Returns: {
          capacity: number
          city: string
          country: string
          country_code: string
          created_at: string
          deleted_at: string
          events_count: number
          id: string
          name: string
          slug: string
          status: string
          total_count: number
          workspace_id: string
          workspace_name: string
        }[]
      }
      ai_audit_append: {
        Args: {
          _action: Database["public"]["Enums"]["ai_audit_action"]
          _draft_id?: string
          _meta?: Json
          _prompt_id?: string
          _workspace_id: string
        }
        Returns: string
      }
      ai_audit_mark_email_sent: { Args: { _id: string }; Returns: undefined }
      ai_budget_reconcile: {
        Args: {
          _actual_cents: number
          _estimated_cents: number
          _input_tokens: number
          _ledger_id: string
          _output_tokens: number
        }
        Returns: undefined
      }
      ai_budget_refund: {
        Args: { _estimated_cents: number; _ledger_id: string }
        Returns: undefined
      }
      ai_budget_reserve: {
        Args: {
          _estimated_cents: number
          _surface: Database["public"]["Enums"]["ai_surface"]
          _workspace_id: string
        }
        Returns: {
          alert_threshold_pct: number
          blocked: boolean
          cap_cents: number
          ledger_id: string
          spent_cents_after: number
        }[]
      }
      apply_approval_decision: {
        Args: {
          p_approval_id: string
          p_decision: string
          p_ip_hash: string
          p_meta?: Json
          p_reason: string
          p_signature: string
          p_token_id: string
          p_ua_hash: string
        }
        Returns: {
          decided_at: string
          decision: string
          status: string
        }[]
      }
      apply_brief_acknowledgement: {
        Args: {
          p_brief_id: string
          p_ip_hash: string
          p_meta?: Json
          p_signature: string
          p_token_id: string
          p_ua_hash: string
        }
        Returns: {
          ack_at: string
          status: string
        }[]
      }
      apply_brief_comment: {
        Args: {
          p_author_name: string
          p_body: string
          p_brief_id: string
          p_ip_hash: string
          p_meta?: Json
          p_token_id: string
          p_ua_hash: string
        }
        Returns: {
          created_at: string
          id: string
          status: string
        }[]
      }
      apply_invoice_payment: {
        Args: {
          p_amount_cents: number
          p_invoice_id: string
          p_method?: string
          p_paid_at?: string
          p_payer_email?: string
          p_reference?: string
        }
        Returns: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          invoice_id: string
          method: string | null
          paid_at: string | null
          payer_email: string | null
          raw_event_id: string | null
          receipt_sent_at: string | null
          refund_reason: string | null
          refund_receipt_sent_at: string | null
          status: string
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "invoice_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_rfp_decision: {
        Args: { p_decision: string; p_reason?: string; p_response_id: string }
        Returns: Json
      }
      audit_log_append: {
        Args: {
          _action: string
          _after?: Json
          _before?: Json
          _entity_id?: string
          _entity_type?: string
          _ip?: unknown
          _meta?: Json
          _user_agent_hash?: string
          _workspace_id: string
        }
        Returns: number
      }
      calendar_range: {
        Args: {
          _from: string
          _layers?: string[]
          _to: string
          _workspace_id: string
        }
        Returns: {
          deep_link: string
          ends_at: string
          event_id: string
          id: string
          kind: string
          owner_id: string
          priority: string
          starts_at: string
          status: string
          supplier_id: string
          title: string
          tone: string
          venue_name: string
        }[]
      }
      calendar_resolve_token: {
        Args: { _token: string }
        Returns: {
          scope: string[]
          workspace_id: string
        }[]
      }
      can_read_channel: {
        Args: { _channel_id: string; _user_id: string }
        Returns: boolean
      }
      cascade_delete_workspace: {
        Args: { _workspace_id: string }
        Returns: Json
      }
      chat_add_member: {
        Args: { _channel_id: string; _user_id: string }
        Returns: undefined
      }
      chat_archive_channel: {
        Args: { _channel_id: string }
        Returns: undefined
      }
      chat_leave_channel: { Args: { _channel_id: string }; Returns: undefined }
      chat_mark_channel_read: {
        Args: { _channel_id: string }
        Returns: undefined
      }
      chat_open_dm: {
        Args: { _other_user: string; _workspace_id: string }
        Returns: string
      }
      chat_post_message: {
        Args: {
          _body_md: string
          _channel_id: string
          _mentions?: string[]
          _parent_message_id?: string
        }
        Returns: string
      }
      chat_prune_expired_messages: {
        Args: { _workspace_id: string }
        Returns: number
      }
      chat_remove_member: {
        Args: { _channel_id: string; _user_id: string }
        Returns: undefined
      }
      chat_restore_channel: {
        Args: { _channel_id: string }
        Returns: undefined
      }
      chat_save_workspace_settings: {
        Args: {
          _allow_dms: boolean
          _allow_public_create: boolean
          _default_notify: string
          _retention_days: number
          _show_archived: boolean
          _workspace_id: string
        }
        Returns: undefined
      }
      chat_search: {
        Args: {
          _channel_id?: string
          _limit?: number
          _offset?: number
          _q: string
          _workspace_id: string
        }
        Returns: {
          author_id: string
          body_md: string
          channel_id: string
          created_at: string
          id: string
          rank: number
          workspace_id: string
        }[]
      }
      chat_search_v2: {
        Args: {
          _channel_id?: string
          _limit?: number
          _offset?: number
          _q: string
          _workspace_id: string
        }
        Returns: {
          author_id: string
          body_md: string
          channel_id: string
          created_at: string
          id: string
          rank: number
          total_count: number
          workspace_id: string
        }[]
      }
      chat_set_member_role: {
        Args: { _channel_id: string; _role: string; _user_id: string }
        Returns: undefined
      }
      chat_toggle_reaction: {
        Args: { _emoji: string; _message_id: string }
        Returns: boolean
      }
      chat_unread_summary: {
        Args: never
        Returns: {
          channel_id: string
          last_message_at: string
          mention_count: number
          unread_count: number
        }[]
      }
      chat_update_channel: {
        Args: {
          _channel_id: string
          _kind: string
          _name: string
          _retention_days: number
          _topic: string
        }
        Returns: undefined
      }
      compute_analytics_rollup: {
        Args: { _day: string }
        Returns: {
          active_subs: number
          arr_cents: number
          canceled_subs: number
          churned_subs: number
          computed_at: string
          day: string
          invoices_paid_cents: number
          invoices_paid_count: number
          mrr_cents: number
          new_paid_subs: number
          past_due_subs: number
          plan_mix: Json
          signups_count: number
          trialing_subs: number
          workspaces_activated: number
          workspaces_created: number
        }
        SetofOptions: {
          from: "*"
          to: "analytics_daily_rollup"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      compute_workspace_activation: {
        Args: { _workspace_id: string }
        Returns: Json
      }
      count_workspace_seat_usage: {
        Args: { _workspace_id: string }
        Returns: number
      }
      create_event_from_template: {
        Args: { _overrides?: Json; _template_id: string; _workspace_id: string }
        Returns: string
      }
      create_workspace_for_current_user: {
        Args: {
          _branding?: Json
          _currency?: string
          _name: string
          _slug: string
          _timezone?: string
        }
        Returns: {
          currency: string
          id: string
          name: string
          slug: string
          timezone: string
        }[]
      }
      current_workspace_id: { Args: never; Returns: string }
      email_cancel_queued: { Args: { p_send_log_id: string }; Returns: Json }
      email_enqueue_send: { Args: { p_draft_id: string }; Returns: Json }
      email_prune_expired_messages: {
        Args: { _workspace_id: string }
        Returns: number
      }
      email_retry_failed: { Args: { p_send_log_id: string }; Returns: Json }
      email_save_workspace_settings: {
        Args: {
          _default_mailbox_id: string
          _remote_images_default: string
          _retention_days: number
          _send_rate_per_hour_mailbox: number
          _send_rate_per_hour_workspace: number
          _signature_html: string
          _workspace_id: string
        }
        Returns: undefined
      }
      get_plan_limit: {
        Args: {
          _metric: Database["public"]["Enums"]["usage_metric"]
          _plan: Database["public"]["Enums"]["app_plan"]
        }
        Returns: number
      }
      get_workspace_usage: {
        Args: {
          _metric: Database["public"]["Enums"]["usage_metric"]
          _workspace_id: string
        }
        Returns: number
      }
      has_addon: {
        Args: { _code: string; _workspace_id: string }
        Returns: boolean
      }
      has_plan: {
        Args: {
          _min_plan: Database["public"]["Enums"]["app_plan"]
          _workspace_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_workspace_role: {
        Args: {
          _roles: Database["public"]["Enums"]["workspace_role"][]
          _workspace_id: string
        }
        Returns: boolean
      }
      invoice_transition: {
        Args: {
          p_id: string
          p_reason?: string
          p_to: Database["public"]["Enums"]["invoice_status"]
        }
        Returns: {
          archived_at: string | null
          client_email: string | null
          client_name: string | null
          created_at: string
          created_by: string | null
          currency: string
          due_on: string | null
          event_id: string | null
          id: string
          invoice_number: string
          issued_on: string | null
          locked_at: string | null
          notes: string | null
          paid_cents: number
          payment_received_at: string | null
          pdf_version: number
          quote_id: string | null
          reference: string | null
          reminder_sent_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          stripe_account_id: string | null
          stripe_payment_link_url: string | null
          subtotal_cents: number
          supplier_id: string | null
          tax_cents: number
          total_cents: number
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      invoice_update_safe: {
        Args: { p_expected_updated_at: string; p_id: string; p_patch: Json }
        Returns: {
          archived_at: string | null
          client_email: string | null
          client_name: string | null
          created_at: string
          created_by: string | null
          currency: string
          due_on: string | null
          event_id: string | null
          id: string
          invoice_number: string
          issued_on: string | null
          locked_at: string | null
          notes: string | null
          paid_cents: number
          payment_received_at: string | null
          pdf_version: number
          quote_id: string | null
          reference: string | null
          reminder_sent_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          stripe_account_id: string | null
          stripe_payment_link_url: string | null
          subtotal_cents: number
          supplier_id: string | null
          tax_cents: number
          total_cents: number
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      invoices_due_for_reminders: {
        Args: { p_workspace_id: string }
        Returns: {
          due_on: string
          invoice_id: string
          invoice_number: string
          kind: Database["public"]["Enums"]["invoice_reminder_kind"]
          paid_cents: number
          scheduled_for: string
          status: Database["public"]["Enums"]["invoice_status"]
          supplier_id: string
          total_cents: number
          workspace_id: string
        }[]
      }
      is_channel_admin: {
        Args: { _channel_id: string; _user_id: string }
        Returns: boolean
      }
      is_channel_member: {
        Args: { _channel_id: string; _user_id: string }
        Returns: boolean
      }
      is_conversation_admin: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_founder: { Args: { _user_id: string }; Returns: boolean }
      is_internal_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_mailbox_member: { Args: { _mailbox_id: string }; Returns: boolean }
      is_platform_admin: { Args: { _uid: string }; Returns: boolean }
      is_user_active: { Args: { _uid: string }; Returns: boolean }
      is_workspace_admin: { Args: { _workspace_id: string }; Returns: boolean }
      is_workspace_member: { Args: { _workspace_id: string }; Returns: boolean }
      is_workspace_slug_available: { Args: { _slug: string }; Returns: boolean }
      library_asset_lock: { Args: { _asset_id: string }; Returns: undefined }
      library_asset_unlock: { Args: { _asset_id: string }; Returns: undefined }
      library_asset_version_create: {
        Args: {
          _asset_id: string
          _mime?: string
          _note?: string
          _sha256?: string
          _size_bytes: number
          _storage_path: string
        }
        Returns: string
      }
      library_asset_version_restore: {
        Args: { _version_id: string }
        Returns: string
      }
      library_increment_use: { Args: { _asset_id: string }; Returns: undefined }
      library_purge_expired_share_links: { Args: never; Returns: number }
      library_recompute_usage: {
        Args: { _workspace_id: string }
        Returns: number
      }
      library_restore_asset: { Args: { _asset_id: string }; Returns: undefined }
      library_share_link_create: {
        Args: {
          _asset_id: string
          _expires_at?: string
          _max_uses?: number
          _scope?: Database["public"]["Enums"]["library_share_scope"]
        }
        Returns: string
      }
      library_share_link_resolve_public: {
        Args: { _token: string }
        Returns: {
          asset_id: string
          link_id: string
          mime_type: string
          ok: boolean
          reason: string
          scope: Database["public"]["Enums"]["library_share_scope"]
          size_bytes: number
          storage_path: string
          title: string
        }[]
      }
      library_share_link_revoke: {
        Args: { _link_id: string }
        Returns: undefined
      }
      library_soft_delete_asset: {
        Args: { _asset_id: string }
        Returns: undefined
      }
      library_workspace_usage: {
        Args: { _workspace_id: string }
        Returns: number
      }
      log_insight_action: {
        Args: { _action: string; _insight_id: string; _meta?: Json }
        Returns: undefined
      }
      log_library_action: {
        Args: { _action: string; _asset_id: string; _meta?: Json }
        Returns: undefined
      }
      mark_affiliate_payout_sent: {
        Args: { _payout_id: string; _stripe_transfer_id: string }
        Returns: undefined
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_notifications_read: { Args: { _ids: string[] }; Returns: number }
      mark_workspace_activated: {
        Args: { _workspace_id: string }
        Returns: Json
      }
      next_invoice_number: { Args: { p_workspace_id: string }; Returns: string }
      next_quote_number: { Args: { p_workspace_id: string }; Returns: string }
      portal_rate_limit_check: {
        Args: {
          p_max_hits?: number
          p_route: string
          p_token_hash: string
          p_window_seconds?: number
        }
        Returns: {
          allowed: boolean
          retry_after_seconds: number
        }[]
      }
      portal_rate_limit_count: {
        Args: {
          p_action: string
          p_ip_hash: string
          p_token_id: string
          p_window_secs: number
        }
        Returns: number
      }
      portal_resolve_token: { Args: { p_token: string }; Returns: Json }
      portal_token_consume: {
        Args: { p_kind: string; p_token_hash: string }
        Returns: {
          consumed: boolean
          resource_id: string
          status: string
          workspace_id: string
        }[]
      }
      portal_token_resolve: {
        Args: { p_kind: string; p_token_hash: string }
        Returns: {
          audience: string
          expires_at: string
          recipient: string
          resource_id: string
          scope: string
          status: string
          workspace_id: string
        }[]
      }
      promote_affiliate_pending_conversions: { Args: never; Returns: number }
      quote_apply_decision: {
        Args: {
          p_decision: string
          p_ip_hash: string
          p_meta?: Json
          p_quote_id: string
          p_reason: string
          p_token_id: string
          p_ua_hash: string
        }
        Returns: {
          decided_at: string
          decision: string
          status: string
        }[]
      }
      quote_supersede: {
        Args: { p_id: string; p_reason?: string }
        Returns: {
          accepted_at: string | null
          archived_at: string | null
          code: string
          created_at: string
          created_by: string | null
          currency: string
          deadline: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          event_id: string | null
          id: string
          locked_at: string | null
          notes: string | null
          pdf_version: number
          received_at: string | null
          rejected_at: string | null
          scope: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal_cents: number
          supersedes_id: string | null
          supplier_id: string
          tax_cents: number
          title: string | null
          total_cents: number
          updated_at: string
          valid_days: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      quote_transition: {
        Args: { p_id: string; p_reason?: string; p_to: string }
        Returns: {
          accepted_at: string | null
          archived_at: string | null
          code: string
          created_at: string
          created_by: string | null
          currency: string
          deadline: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          event_id: string | null
          id: string
          locked_at: string | null
          notes: string | null
          pdf_version: number
          received_at: string | null
          rejected_at: string | null
          scope: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal_cents: number
          supersedes_id: string | null
          supplier_id: string
          tax_cents: number
          title: string | null
          total_cents: number
          updated_at: string
          valid_days: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      quote_update_safe: {
        Args: { p_expected_updated_at: string; p_id: string; p_patch: Json }
        Returns: {
          accepted_at: string | null
          archived_at: string | null
          code: string
          created_at: string
          created_by: string | null
          currency: string
          deadline: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          event_id: string | null
          id: string
          locked_at: string | null
          notes: string | null
          pdf_version: number
          received_at: string | null
          rejected_at: string | null
          scope: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal_cents: number
          supersedes_id: string | null
          supplier_id: string
          tax_cents: number
          title: string | null
          total_cents: number
          updated_at: string
          valid_days: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_affiliate_click: {
        Args: {
          _country: string
          _ip_hex: string
          _is_bot: boolean
          _link_id: string
          _referer_host: string
          _ua_hex: string
          _window_bucket: number
        }
        Returns: boolean
      }
      record_affiliate_conversion: {
        Args: {
          _attribution_event: Database["public"]["Enums"]["affiliate_attribution_event"]
          _currency: string
          _invoice_amount_cents: number
          _link_code: string
          _referred_workspace_id: string
          _stripe_customer_id: string
          _stripe_invoice_id: string
          _stripe_subscription_id: string
        }
        Returns: string
      }
      record_invoice_reminder: {
        Args: {
          p_channel?: string
          p_error?: string
          p_invoice_id: string
          p_kind: Database["public"]["Enums"]["invoice_reminder_kind"]
          p_message_id?: string
          p_recipient_email?: string
          p_scheduled_for?: string
          p_status?: Database["public"]["Enums"]["invoice_reminder_status"]
        }
        Returns: {
          channel: string
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          invoice_id: string
          kind: Database["public"]["Enums"]["invoice_reminder_kind"]
          message_id: string | null
          recipient_email: string | null
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_reminder_status"]
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "invoice_reminders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_security_probe_run: {
        Args: {
          _duration_ms: number
          _failures: Json
          _probe_kind: string
          _sha: string
          _total_checks: number
          _triggered_by: string
        }
        Returns: string
      }
      refund_invoice_payment: {
        Args: {
          p_amount_cents: number
          p_payment_id: string
          p_reason?: string
        }
        Returns: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          invoice_id: string
          method: string | null
          paid_at: string | null
          payer_email: string | null
          raw_event_id: string | null
          receipt_sent_at: string | null
          refund_reason: string | null
          refund_receipt_sent_at: string | null
          status: string
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "invoice_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_affiliate_payout: {
        Args: { _account_id: string; _requested_by: string }
        Returns: string
      }
      set_invoice_payment_link: {
        Args: {
          p_invoice_id: string
          p_payment_link_url: string
          p_stripe_account_id?: string
        }
        Returns: {
          archived_at: string | null
          client_email: string | null
          client_name: string | null
          created_at: string
          created_by: string | null
          currency: string
          due_on: string | null
          event_id: string | null
          id: string
          invoice_number: string
          issued_on: string | null
          locked_at: string | null
          notes: string | null
          paid_cents: number
          payment_received_at: string | null
          pdf_version: number
          quote_id: string | null
          reference: string | null
          reminder_sent_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          stripe_account_id: string | null
          stripe_payment_link_url: string | null
          subtotal_cents: number
          supplier_id: string | null
          tax_cents: number
          total_cents: number
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_workspace_stripe_connect_account: {
        Args: {
          p_account_id: string
          p_charges_enabled?: boolean
          p_details_submitted?: boolean
          p_payouts_enabled?: boolean
          p_workspace_id: string
        }
        Returns: {
          activated_at: string | null
          branding: Json
          country: string
          created_at: string
          currency: string
          deleted_at: string | null
          id: string
          locale: string
          marketplace_admin_fee_bps: number | null
          marketplace_commission_bps: number | null
          name: string
          owner_user_id: string
          plan: string
          release_stage: string
          slug: string
          stripe_billing_account_id: string | null
          stripe_billing_charges_enabled: boolean
          stripe_billing_details_submitted: boolean
          stripe_billing_synced_at: string | null
          stripe_connect_account_id: string | null
          stripe_connect_charges_enabled: boolean
          stripe_connect_details_submitted: boolean
          stripe_connect_payouts_enabled: boolean
          stripe_connect_synced_at: string | null
          suspended_at: string | null
          suspended_by: string | null
          suspended_reason: string | null
          timezone: string
          trial_ends_at: string | null
          updated_at: string
          workspace_type: string
        }
        SetofOptions: {
          from: "*"
          to: "workspaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_workspace_type: {
        Args: { _workspace_id: string; _workspace_type: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      smart_rule_cap: { Args: { _workspace_id: string }; Returns: number }
      suppliers_kpis: {
        Args: { p_workspace_id: string }
        Returns: {
          active_count: number
          archived_count: number
          avg_rating: number
          created_series: number[]
          paused_count: number
          rated_count: number
          total_count: number
        }[]
      }
      tasks_active_count: { Args: { _workspace_id: string }; Returns: number }
      tasks_kpis: { Args: { _workspace_id: string }; Returns: Json }
      tasks_list_for_workspace: {
        Args: {
          _dir?: string
          _due?: string
          _limit?: number
          _list_id?: string
          _mine?: boolean
          _offset?: number
          _priority?: string
          _search?: string
          _sort?: string
          _status?: string
          _workspace_id: string
        }
        Returns: {
          archived_at: string
          created_by: string
          due_at: string
          event_id: string
          id: string
          list_id: string
          parent_task_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["task_status"]
          supplier_id: string
          title: string
          total: number
          workspace_id: string
        }[]
      }
      team_invite_create: {
        Args: {
          _email: string
          _role: Database["public"]["Enums"]["workspace_role"]
          _token_hash: string
          _ttl_hours?: number
          _workspace_id: string
        }
        Returns: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          last_sent_at: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          send_count: number
          token_hash: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      team_invite_resend: {
        Args: {
          _invite_id: string
          _new_token_hash: string
          _ttl_hours?: number
          _workspace_id: string
        }
        Returns: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          last_sent_at: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          send_count: number
          token_hash: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      team_invite_revoke: {
        Args: { _invite_id: string; _workspace_id: string }
        Returns: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          last_sent_at: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          send_count: number
          token_hash: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      team_member_leave: {
        Args: { _workspace_id: string }
        Returns: {
          created_at: string
          deleted_at: string | null
          id: string
          invited_by: string | null
          joined_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      team_member_remove: {
        Args: { _member_id: string; _workspace_id: string }
        Returns: {
          created_at: string
          deleted_at: string | null
          id: string
          invited_by: string | null
          joined_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      team_member_set_role: {
        Args: {
          _member_id: string
          _new_role: Database["public"]["Enums"]["workspace_role"]
          _workspace_id: string
        }
        Returns: {
          created_at: string
          deleted_at: string | null
          id: string
          invited_by: string | null
          joined_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      team_seat_limit: { Args: { _workspace_id: string }; Returns: number }
      team_seat_usage: {
        Args: { _workspace_id: string }
        Returns: {
          active_members: number
          last_invite_at: string
          pending_invites: number
        }[]
      }
      team_session_revocation_record: {
        Args: {
          _notes?: string
          _reason?: string
          _target_user_id: string
          _workspace_id: string
        }
        Returns: string
      }
      team_transfer_ownership: {
        Args: { _new_owner_user_id: string; _workspace_id: string }
        Returns: undefined
      }
      touch_auth_session: {
        Args: {
          _created_via: string
          _device_fingerprint_hash: string
          _device_label: string
          _ip_hash: string
          _user_agent_hash: string
        }
        Returns: string
      }
      venues_active_count: { Args: { workspace_uuid: string }; Returns: number }
      venues_kpis: {
        Args: { workspace_uuid: string }
        Returns: {
          avg_capacity: number
          cities: number
          primary_set: number
          total: number
          upcoming_90d: number
          util_pct: number
        }[]
      }
    }
    Enums: {
      affiliate_account_status: "draft" | "active" | "suspended" | "closed"
      affiliate_attribution_event:
        | "signup"
        | "first_paid_invoice"
        | "renewal_invoice"
      affiliate_conversion_status: "pending" | "approved" | "reversed" | "paid"
      affiliate_payout_method: "stripe_connect" | "manual_bank" | "paused"
      affiliate_payout_status:
        | "draft"
        | "requested"
        | "approved"
        | "sent"
        | "paid"
        | "failed"
      affiliate_tax_form_status: "submitted" | "verified" | "rejected"
      affiliate_tax_form_type: "w9" | "w8ben" | "w8bene" | "eu_vat" | "other"
      ai_audit_action:
        | "draft_created"
        | "draft_applied"
        | "draft_discarded"
        | "draft_edited"
        | "budget_changed"
        | "usage_alert_sent"
        | "budget_blocked"
        | "call_failed"
        | "monthly_rollover"
      ai_draft_status: "draft" | "applied" | "discarded" | "edited_and_applied"
      ai_surface:
        | "brief_draft"
        | "run_sheet_summary"
        | "task_breakdown"
        | "supplier_blurb"
        | "quote_blurb"
        | "email_draft"
        | "meeting_notes"
      app_plan: "trial" | "free" | "starter" | "pro" | "business" | "enterprise"
      app_role: "admin" | "moderator" | "user"
      attachment_av_status: "pending" | "clean" | "infected" | "error"
      channel_kind: "public" | "private" | "dm"
      data_export_status:
        | "queued"
        | "running"
        | "ready"
        | "delivered"
        | "failed"
      demo_state_status: "none" | "active" | "expired"
      dunning_event_kind:
        | "past_due_day_0"
        | "past_due_day_2"
        | "past_due_day_4"
        | "past_due_day_6"
        | "unpaid_day_7"
        | "canceled_day_14"
        | "recovered"
      email_domain_status: "unverified" | "verifying" | "verified" | "failed"
      email_folder_kind:
        | "inbox"
        | "sent"
        | "drafts"
        | "trash"
        | "spam"
        | "archive"
        | "custom"
      email_provider: "gmail" | "outlook"
      email_recipient_kind: "to" | "cc" | "bcc" | "from" | "reply_to"
      email_send_status: "queued" | "sent" | "failed" | "rate_limited"
      event_budget_line_status: "planned" | "committed" | "paid"
      event_performer_status: "pending" | "confirmed" | "declined" | "cancelled"
      event_supplier_status:
        | "shortlisted"
        | "contacted"
        | "confirmed"
        | "declined"
        | "cancelled"
      insight_category:
        | "revenue"
        | "operations"
        | "clients"
        | "suppliers"
        | "team"
      insight_impact: "high" | "medium" | "low"
      insight_trend: "up" | "down" | "flat"
      invoice_reminder_kind: "pre_due" | "at_due" | "post_due" | "manual"
      invoice_reminder_status: "queued" | "sent" | "failed" | "skipped"
      invoice_status: "draft" | "sent" | "partial" | "paid" | "overdue" | "void"
      library_asset_kind:
        | "template"
        | "asset"
        | "snippet"
        | "checklist"
        | "email"
        | "playbook"
        | "menu"
        | "poster"
        | "flyer"
        | "signage"
        | "presentation"
        | "floorplan"
        | "contract"
        | "invoice_template"
        | "rider"
        | "video"
        | "audio"
        | "image"
        | "document"
        | "archive"
      library_collection_kind:
        | "event_pack"
        | "client_pack"
        | "supplier_pack"
        | "venue_pack"
        | "brand_kit"
        | "season"
        | "campaign"
        | "custom"
      library_share_scope: "view" | "download"
      library_visibility: "workspace" | "restricted" | "link" | "public_token"
      mailbox_member_role: "owner" | "member"
      mailbox_status: "pending" | "active" | "error" | "disconnected"
      menu_course:
        | "starter"
        | "main"
        | "dessert"
        | "drink"
        | "side"
        | "canape"
        | "other"
      menu_kind:
        | "breakfast"
        | "lunch"
        | "dinner"
        | "buffet"
        | "canape"
        | "other"
      mfa_enforcement: "required" | "grace" | "optional"
      performer_kind:
        | "band"
        | "dj"
        | "speaker"
        | "comedian"
        | "dancer"
        | "host"
        | "other"
      quote_status:
        | "draft"
        | "rfp_sent"
        | "viewed"
        | "received"
        | "revised"
        | "accepted"
        | "rejected"
        | "changes_requested"
        | "expired"
        | "withdrawn"
      run_sheet_lane:
        | "tech"
        | "foh"
        | "talent"
        | "comms"
        | "security"
        | "catering"
        | "other"
      site_point_kind:
        | "entrance"
        | "exit"
        | "restroom"
        | "first_aid"
        | "info"
        | "water"
        | "atm"
        | "security"
        | "parking"
        | "stage"
        | "other"
      site_zone_kind:
        | "stage"
        | "bar"
        | "food"
        | "vip"
        | "parking"
        | "camping"
        | "medical"
        | "backstage"
        | "entrance"
        | "merchandise"
        | "other"
      smart_rule_action:
        | "send_email"
        | "create_task"
        | "notify_user"
        | "set_tag"
        | "webhook_internal_only"
      smart_rule_run_mode: "live" | "dry" | "manual_test"
      smart_rule_run_status:
        | "success"
        | "partial"
        | "failed"
        | "queued"
        | "running"
        | "waiting_approval"
        | "cancelled"
        | "skipped"
      smart_rule_trigger:
        | "invoice_overdue"
        | "quote_unread_after"
        | "task_due_in"
        | "event_stage_changed"
        | "supplier_no_reply"
        | "file_uploaded"
        | "nightly_cron"
      storage_lifecycle_status: "running" | "success" | "partial" | "failed"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
        | "unpaid"
      supplier_file_kind: "logo" | "contract" | "cert" | "tnc" | "other"
      supplier_import_kind: "import" | "export"
      supplier_import_status:
        | "pending"
        | "preview"
        | "applied"
        | "rolled_back"
        | "failed"
        | "cancelled"
      supplier_status: "active" | "paused" | "archived" | "suspended_by_admin"
      task_dep_kind: "blocks" | "relates"
      task_list_kind: "event" | "workspace" | "supplier_followup"
      task_priority: "p1" | "p2" | "p3" | "p4"
      task_status:
        | "backlog"
        | "todo"
        | "in_progress"
        | "blocked"
        | "done"
        | "cancelled"
        | "review"
      usage_metric:
        | "event_count"
        | "supplier_count"
        | "storage_bytes"
        | "portal_send_count"
        | "smart_rule_count"
        | "ai_call_count"
        | "api_key_count"
        | "smart_rule_runs"
        | "ai_burst_tokens"
        | "supplier_imports"
        | "data_export_count"
        | "email_send_count"
        | "dunning_pause_count"
      user_account_status: "active" | "suspended" | "deleted"
      venue_attachment_kind:
        | "photo"
        | "floorplan"
        | "capacity_cert"
        | "risk_assessment"
        | "other"
      workspace_deletion_status:
        | "pending"
        | "cancelled"
        | "purging"
        | "purged"
        | "failed"
      workspace_role: "owner" | "admin" | "manager" | "member"
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
      affiliate_account_status: ["draft", "active", "suspended", "closed"],
      affiliate_attribution_event: [
        "signup",
        "first_paid_invoice",
        "renewal_invoice",
      ],
      affiliate_conversion_status: ["pending", "approved", "reversed", "paid"],
      affiliate_payout_method: ["stripe_connect", "manual_bank", "paused"],
      affiliate_payout_status: [
        "draft",
        "requested",
        "approved",
        "sent",
        "paid",
        "failed",
      ],
      affiliate_tax_form_status: ["submitted", "verified", "rejected"],
      affiliate_tax_form_type: ["w9", "w8ben", "w8bene", "eu_vat", "other"],
      ai_audit_action: [
        "draft_created",
        "draft_applied",
        "draft_discarded",
        "draft_edited",
        "budget_changed",
        "usage_alert_sent",
        "budget_blocked",
        "call_failed",
        "monthly_rollover",
      ],
      ai_draft_status: ["draft", "applied", "discarded", "edited_and_applied"],
      ai_surface: [
        "brief_draft",
        "run_sheet_summary",
        "task_breakdown",
        "supplier_blurb",
        "quote_blurb",
        "email_draft",
        "meeting_notes",
      ],
      app_plan: ["trial", "free", "starter", "pro", "business", "enterprise"],
      app_role: ["admin", "moderator", "user"],
      attachment_av_status: ["pending", "clean", "infected", "error"],
      channel_kind: ["public", "private", "dm"],
      data_export_status: ["queued", "running", "ready", "delivered", "failed"],
      demo_state_status: ["none", "active", "expired"],
      dunning_event_kind: [
        "past_due_day_0",
        "past_due_day_2",
        "past_due_day_4",
        "past_due_day_6",
        "unpaid_day_7",
        "canceled_day_14",
        "recovered",
      ],
      email_domain_status: ["unverified", "verifying", "verified", "failed"],
      email_folder_kind: [
        "inbox",
        "sent",
        "drafts",
        "trash",
        "spam",
        "archive",
        "custom",
      ],
      email_provider: ["gmail", "outlook"],
      email_recipient_kind: ["to", "cc", "bcc", "from", "reply_to"],
      email_send_status: ["queued", "sent", "failed", "rate_limited"],
      event_budget_line_status: ["planned", "committed", "paid"],
      event_performer_status: ["pending", "confirmed", "declined", "cancelled"],
      event_supplier_status: [
        "shortlisted",
        "contacted",
        "confirmed",
        "declined",
        "cancelled",
      ],
      insight_category: [
        "revenue",
        "operations",
        "clients",
        "suppliers",
        "team",
      ],
      insight_impact: ["high", "medium", "low"],
      insight_trend: ["up", "down", "flat"],
      invoice_reminder_kind: ["pre_due", "at_due", "post_due", "manual"],
      invoice_reminder_status: ["queued", "sent", "failed", "skipped"],
      invoice_status: ["draft", "sent", "partial", "paid", "overdue", "void"],
      library_asset_kind: [
        "template",
        "asset",
        "snippet",
        "checklist",
        "email",
        "playbook",
        "menu",
        "poster",
        "flyer",
        "signage",
        "presentation",
        "floorplan",
        "contract",
        "invoice_template",
        "rider",
        "video",
        "audio",
        "image",
        "document",
        "archive",
      ],
      library_collection_kind: [
        "event_pack",
        "client_pack",
        "supplier_pack",
        "venue_pack",
        "brand_kit",
        "season",
        "campaign",
        "custom",
      ],
      library_share_scope: ["view", "download"],
      library_visibility: ["workspace", "restricted", "link", "public_token"],
      mailbox_member_role: ["owner", "member"],
      mailbox_status: ["pending", "active", "error", "disconnected"],
      menu_course: [
        "starter",
        "main",
        "dessert",
        "drink",
        "side",
        "canape",
        "other",
      ],
      menu_kind: ["breakfast", "lunch", "dinner", "buffet", "canape", "other"],
      mfa_enforcement: ["required", "grace", "optional"],
      performer_kind: [
        "band",
        "dj",
        "speaker",
        "comedian",
        "dancer",
        "host",
        "other",
      ],
      quote_status: [
        "draft",
        "rfp_sent",
        "viewed",
        "received",
        "revised",
        "accepted",
        "rejected",
        "changes_requested",
        "expired",
        "withdrawn",
      ],
      run_sheet_lane: [
        "tech",
        "foh",
        "talent",
        "comms",
        "security",
        "catering",
        "other",
      ],
      site_point_kind: [
        "entrance",
        "exit",
        "restroom",
        "first_aid",
        "info",
        "water",
        "atm",
        "security",
        "parking",
        "stage",
        "other",
      ],
      site_zone_kind: [
        "stage",
        "bar",
        "food",
        "vip",
        "parking",
        "camping",
        "medical",
        "backstage",
        "entrance",
        "merchandise",
        "other",
      ],
      smart_rule_action: [
        "send_email",
        "create_task",
        "notify_user",
        "set_tag",
        "webhook_internal_only",
      ],
      smart_rule_run_mode: ["live", "dry", "manual_test"],
      smart_rule_run_status: [
        "success",
        "partial",
        "failed",
        "queued",
        "running",
        "waiting_approval",
        "cancelled",
        "skipped",
      ],
      smart_rule_trigger: [
        "invoice_overdue",
        "quote_unread_after",
        "task_due_in",
        "event_stage_changed",
        "supplier_no_reply",
        "file_uploaded",
        "nightly_cron",
      ],
      storage_lifecycle_status: ["running", "success", "partial", "failed"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
        "unpaid",
      ],
      supplier_file_kind: ["logo", "contract", "cert", "tnc", "other"],
      supplier_import_kind: ["import", "export"],
      supplier_import_status: [
        "pending",
        "preview",
        "applied",
        "rolled_back",
        "failed",
        "cancelled",
      ],
      supplier_status: ["active", "paused", "archived", "suspended_by_admin"],
      task_dep_kind: ["blocks", "relates"],
      task_list_kind: ["event", "workspace", "supplier_followup"],
      task_priority: ["p1", "p2", "p3", "p4"],
      task_status: [
        "backlog",
        "todo",
        "in_progress",
        "blocked",
        "done",
        "cancelled",
        "review",
      ],
      usage_metric: [
        "event_count",
        "supplier_count",
        "storage_bytes",
        "portal_send_count",
        "smart_rule_count",
        "ai_call_count",
        "api_key_count",
        "smart_rule_runs",
        "ai_burst_tokens",
        "supplier_imports",
        "data_export_count",
        "email_send_count",
        "dunning_pause_count",
      ],
      user_account_status: ["active", "suspended", "deleted"],
      venue_attachment_kind: [
        "photo",
        "floorplan",
        "capacity_cert",
        "risk_assessment",
        "other",
      ],
      workspace_deletion_status: [
        "pending",
        "cancelled",
        "purging",
        "purged",
        "failed",
      ],
      workspace_role: ["owner", "admin", "manager", "member"],
    },
  },
} as const
