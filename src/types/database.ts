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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_money_requests: {
        Row: {
          amount: number
          case_id: string | null
          created_at: string
          currency: string
          decided_reason: string | null
          id: string
          kind: string
          partner_id: string | null
          processor: string
          processor_ref: string | null
          reason: string
          requested_by: string | null
          requested_by_name: string
          status: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          case_id?: string | null
          created_at?: string
          currency?: string
          decided_reason?: string | null
          id?: string
          kind: string
          partner_id?: string | null
          processor?: string
          processor_ref?: string | null
          reason: string
          requested_by?: string | null
          requested_by_name?: string
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          case_id?: string | null
          created_at?: string
          currency?: string
          decided_reason?: string | null
          id?: string
          kind?: string
          partner_id?: string | null
          processor?: string
          processor_ref?: string | null
          reason?: string
          requested_by?: string | null
          requested_by_name?: string
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_money_requests_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "support_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_money_requests_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_money_requests_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notes: {
        Row: {
          author_id: string | null
          author_name: string
          body: string
          created_at: string
          entity_id: string
          entity_type: string
          id: number
        }
        Insert: {
          author_id?: string | null
          author_name?: string
          body: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: never
        }
        Update: {
          author_id?: string | null
          author_name?: string
          body?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: never
        }
        Relationships: []
      }
      admin_record_notes: {
        Row: {
          author_id: string | null
          author_name: string
          body: string
          created_at: string
          id: number
          subject_id: string
          subject_type: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string
          body: string
          created_at?: string
          id?: never
          subject_id: string
          subject_type: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          body?: string
          created_at?: string
          id?: never
          subject_id?: string
          subject_type?: string
        }
        Relationships: []
      }
      agent_approvals: {
        Row: {
          action: string
          affected_ref: string | null
          alternatives: Json
          amount: number | null
          batch_key: string | null
          confidence: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          detail: string
          edited_payload: Json | null
          event_id: string | null
          executed_at: string | null
          expires_at: string | null
          id: string
          impact: string
          payload: Json
          previous_state: Json | null
          proposed_state: Json | null
          reason: string | null
          requested_by: string | null
          result: string | null
          risk: number | null
          run_id: string | null
          status: string
          step_id: string | null
          title: string
          tool_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          affected_ref?: string | null
          alternatives?: Json
          amount?: number | null
          batch_key?: string | null
          confidence?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          detail?: string
          edited_payload?: Json | null
          event_id?: string | null
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          impact?: string
          payload?: Json
          previous_state?: Json | null
          proposed_state?: Json | null
          reason?: string | null
          requested_by?: string | null
          result?: string | null
          risk?: number | null
          run_id?: string | null
          status?: string
          step_id?: string | null
          title: string
          tool_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          affected_ref?: string | null
          alternatives?: Json
          amount?: number | null
          batch_key?: string | null
          confidence?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          detail?: string
          edited_payload?: Json | null
          event_id?: string | null
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          impact?: string
          payload?: Json
          previous_state?: Json | null
          proposed_state?: Json | null
          reason?: string | null
          requested_by?: string | null
          result?: string | null
          risk?: number | null
          run_id?: string | null
          status?: string
          step_id?: string | null
          title?: string
          tool_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_approvals_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_approvals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_approvals_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "agent_run_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_approvals_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "agent_tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_approvals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_artifacts: {
        Row: {
          created_at: string
          data: Json
          id: string
          kind: string
          link: string | null
          ref_id: string | null
          ref_type: string | null
          run_id: string
          step_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          kind: string
          link?: string | null
          ref_id?: string | null
          ref_type?: string | null
          run_id: string
          step_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          link?: string | null
          ref_id?: string | null
          ref_type?: string | null
          run_id?: string
          step_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_artifacts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_artifacts_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "agent_run_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_policies: {
        Row: {
          allowed_tools: string[] | null
          approval_expiry_hours: number
          auto_tools: string[]
          autopilot_rules: Json
          booking_authority_minor: number
          communication: Json
          daily_spend_cap_minor: number
          discount_authority_pct: number
          escalation_user_ids: string[]
          max_parallel_runs: number
          max_run_minutes: number
          min_confidence: number
          mode: string
          monthly_spend_cap_minor: number
          quiet_hours: Json
          refund_threshold_minor: number
          retention_days: number
          ticket_price_tolerance_pct: number
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          allowed_tools?: string[] | null
          approval_expiry_hours?: number
          auto_tools?: string[]
          autopilot_rules?: Json
          booking_authority_minor?: number
          communication?: Json
          daily_spend_cap_minor?: number
          discount_authority_pct?: number
          escalation_user_ids?: string[]
          max_parallel_runs?: number
          max_run_minutes?: number
          min_confidence?: number
          mode?: string
          monthly_spend_cap_minor?: number
          quiet_hours?: Json
          refund_threshold_minor?: number
          retention_days?: number
          ticket_price_tolerance_pct?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          allowed_tools?: string[] | null
          approval_expiry_hours?: number
          auto_tools?: string[]
          autopilot_rules?: Json
          booking_authority_minor?: number
          communication?: Json
          daily_spend_cap_minor?: number
          discount_authority_pct?: number
          escalation_user_ids?: string[]
          max_parallel_runs?: number
          max_run_minutes?: number
          min_confidence?: number
          mode?: string
          monthly_spend_cap_minor?: number
          quiet_hours?: Json
          refund_threshold_minor?: number
          retention_days?: number
          ticket_price_tolerance_pct?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_policies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_routines: {
        Row: {
          actions: Json
          approval_policy: string
          compiled_at: string | null
          conditions: Json
          created_at: string
          detail: string
          enabled: boolean
          failures: number
          id: string
          last_event: Json | null
          last_result: string
          last_run_at: string | null
          limits: Json
          next_run_at: string | null
          owner_id: string | null
          schedule: string
          suggested: boolean
          title: string
          trigger: Json | null
          workspace_id: string
        }
        Insert: {
          actions?: Json
          approval_policy?: string
          compiled_at?: string | null
          conditions?: Json
          created_at?: string
          detail?: string
          enabled?: boolean
          failures?: number
          id?: string
          last_event?: Json | null
          last_result?: string
          last_run_at?: string | null
          limits?: Json
          next_run_at?: string | null
          owner_id?: string | null
          schedule: string
          suggested?: boolean
          title: string
          trigger?: Json | null
          workspace_id: string
        }
        Update: {
          actions?: Json
          approval_policy?: string
          compiled_at?: string | null
          conditions?: Json
          created_at?: string
          detail?: string
          enabled?: boolean
          failures?: number
          id?: string
          last_event?: Json | null
          last_result?: string
          last_run_at?: string | null
          limits?: Json
          next_run_at?: string | null
          owner_id?: string | null
          schedule?: string
          suggested?: boolean
          title?: string
          trigger?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_routines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_run_steps: {
        Row: {
          approval_id: string | null
          attempt: number
          decision: string | null
          error: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          input: Json
          output: Json | null
          reason: string
          run_id: string
          seq: number
          started_at: string | null
          status: string
          tool_id: string | null
        }
        Insert: {
          approval_id?: string | null
          attempt?: number
          decision?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key: string
          input?: Json
          output?: Json | null
          reason?: string
          run_id: string
          seq: number
          started_at?: string | null
          status?: string
          tool_id?: string | null
        }
        Update: {
          approval_id?: string | null
          attempt?: number
          decision?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          input?: Json
          output?: Json | null
          reason?: string
          run_id?: string
          seq?: number
          started_at?: string | null
          status?: string
          tool_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_run_steps_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "agent_tools"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_name: string
          batch: Json | null
          changes: Json
          cost_cents: number
          created_at: string
          current_step: number
          errors: Json
          event_id: string | null
          financial_exposure_minor: number
          finished_at: string | null
          goal: string
          id: string
          idempotency_key: string | null
          interpretation: Json
          lease_until: string | null
          mission: string | null
          mode: string
          next_wake_at: string | null
          plan: Json
          progress: number
          quality: string
          reference: string | null
          result: string
          retries: number
          routine_id: string | null
          run_type: string
          scope: string[]
          started_at: string | null
          status: string
          summary: string | null
          surface: string
          tokens: number
          triggered_by: string
          updated_at: string
          user_id: string
          waiting_reason: string
          workspace_id: string | null
        }
        Insert: {
          agent_name?: string
          batch?: Json | null
          changes?: Json
          cost_cents?: number
          created_at?: string
          current_step?: number
          errors?: Json
          event_id?: string | null
          financial_exposure_minor?: number
          finished_at?: string | null
          goal: string
          id?: string
          idempotency_key?: string | null
          interpretation?: Json
          lease_until?: string | null
          mission?: string | null
          mode?: string
          next_wake_at?: string | null
          plan?: Json
          progress?: number
          quality?: string
          reference?: string | null
          result?: string
          retries?: number
          routine_id?: string | null
          run_type?: string
          scope?: string[]
          started_at?: string | null
          status?: string
          summary?: string | null
          surface?: string
          tokens?: number
          triggered_by?: string
          updated_at?: string
          user_id: string
          waiting_reason?: string
          workspace_id?: string | null
        }
        Update: {
          agent_name?: string
          batch?: Json | null
          changes?: Json
          cost_cents?: number
          created_at?: string
          current_step?: number
          errors?: Json
          event_id?: string | null
          financial_exposure_minor?: number
          finished_at?: string | null
          goal?: string
          id?: string
          idempotency_key?: string | null
          interpretation?: Json
          lease_until?: string | null
          mission?: string | null
          mode?: string
          next_wake_at?: string | null
          plan?: Json
          progress?: number
          quality?: string
          reference?: string | null
          result?: string
          retries?: number
          routine_id?: string | null
          run_type?: string
          scope?: string[]
          started_at?: string | null
          status?: string
          summary?: string | null
          surface?: string
          tokens?: number
          triggered_by?: string
          updated_at?: string
          user_id?: string
          waiting_reason?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "agent_routines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tools: {
        Row: {
          approval_note: string
          description: string
          id: string
          idempotent: boolean
          mutation: boolean
          permission: string
          retries: number
          reversible: boolean
          risk: number
          surface: string
          timeout_ms: number
          title: string
          version: number
        }
        Insert: {
          approval_note?: string
          description: string
          id: string
          idempotent: boolean
          mutation: boolean
          permission: string
          retries: number
          reversible: boolean
          risk: number
          surface: string
          timeout_ms: number
          title: string
          version: number
        }
        Update: {
          approval_note?: string
          description?: string
          id?: string
          idempotent?: boolean
          mutation?: boolean
          permission?: string
          retries?: number
          reversible?: boolean
          risk?: number
          surface?: string
          timeout_ms?: number
          title?: string
          version?: number
        }
        Relationships: []
      }
      agent_waits: {
        Row: {
          created_at: string
          id: string
          kind: string
          ref_id: string | null
          run_id: string
          satisfied_at: string | null
          until_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          ref_id?: string | null
          run_id: string
          satisfied_at?: string | null
          until_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          ref_id?: string | null
          run_id?: string
          satisfied_at?: string | null
          until_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_waits_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_watches: {
        Row: {
          backoff_factor: number
          check_every_minutes: number
          checks: number
          condition: Json
          created_at: string
          expires_at: string
          id: string
          input: Json
          last_checked_at: string | null
          last_error: string | null
          last_value: Json | null
          max_checks: number
          next_check_at: string
          status: string
          title: string
          tool_id: string
          triggered_at: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          backoff_factor?: number
          check_every_minutes?: number
          checks?: number
          condition: Json
          created_at?: string
          expires_at: string
          id?: string
          input?: Json
          last_checked_at?: string | null
          last_error?: string | null
          last_value?: Json | null
          max_checks?: number
          next_check_at?: string
          status?: string
          title: string
          tool_id: string
          triggered_at?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          backoff_factor?: number
          check_every_minutes?: number
          checks?: number
          condition?: Json
          created_at?: string
          expires_at?: string
          id?: string
          input?: Json
          last_checked_at?: string | null
          last_error?: string | null
          last_value?: Json | null
          max_checks?: number
          next_check_at?: string
          status?: string
          title?: string
          tool_id?: string
          triggered_at?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_watches_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "agent_tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_watches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_budgets: {
        Row: {
          allow_overage: boolean
          daily_limit: number | null
          deep_allowed: boolean
          hard_cap: boolean
          monthly_allowance: number | null
          overage_limit: number
          per_run_limit: number
          soft_caps: number[]
          tool_limits: Json
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          allow_overage?: boolean
          daily_limit?: number | null
          deep_allowed?: boolean
          hard_cap?: boolean
          monthly_allowance?: number | null
          overage_limit?: number
          per_run_limit?: number
          soft_caps?: number[]
          tool_limits?: Json
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          allow_overage?: boolean
          daily_limit?: number | null
          deep_allowed?: boolean
          hard_cap?: boolean
          monthly_allowance?: number | null
          overage_limit?: number
          per_run_limit?: number
          soft_caps?: number[]
          tool_limits?: Json
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
      ai_credit_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          credits: number
          expires_at: string | null
          id: string
          kind: string
          pack_id: string | null
          payment_ref: string | null
          reference: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credits: number
          expires_at?: string | null
          id?: string
          kind: string
          pack_id?: string | null
          payment_ref?: string | null
          reference?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credits?: number
          expires_at?: string | null
          id?: string
          kind?: string
          pack_id?: string | null
          payment_ref?: string | null
          reference?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_credit_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_model_prices: {
        Row: {
          cached_input_per_mtok: number
          currency: string
          fx_to_gbp: number
          input_per_mtok: number
          model: string
          output_per_mtok: number
          provider: string
          source: string
          tier: string
          updated_at: string
        }
        Insert: {
          cached_input_per_mtok?: number
          currency?: string
          fx_to_gbp?: number
          input_per_mtok: number
          model: string
          output_per_mtok: number
          provider?: string
          source?: string
          tier: string
          updated_at?: string
        }
        Update: {
          cached_input_per_mtok?: number
          currency?: string
          fx_to_gbp?: number
          input_per_mtok?: number
          model?: string
          output_per_mtok?: number
          provider?: string
          source?: string
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_events: {
        Row: {
          cached_tokens: number
          cost_gbp_minor: number
          created_at: string
          credits: number
          from_allowance: number
          from_balance: number
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          overage: number
          provider_cost: number
          provider_currency: string
          purpose: string
          run_id: string | null
          tier: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          cached_tokens?: number
          cost_gbp_minor?: number
          created_at?: string
          credits?: number
          from_allowance?: number
          from_balance?: number
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          overage?: number
          provider_cost?: number
          provider_currency?: string
          purpose: string
          run_id?: string | null
          tier: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          cached_tokens?: number
          cost_gbp_minor?: number
          created_at?: string
          credits?: number
          from_allowance?: number
          from_balance?: number
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          overage?: number
          provider_cost?: number
          provider_currency?: string
          purpose?: string
          run_id?: string | null
          tier?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_daily: {
        Row: {
          day: string
          dim: string
          metric: string
          value: number
        }
        Insert: {
          day: string
          dim?: string
          metric: string
          value?: number
        }
        Update: {
          day?: string
          dim?: string
          metric?: string
          value?: number
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          acts_as: string
          created_at: string
          expires_at: string | null
          id: string
          key_hash: string
          last_used_at: string | null
          last_used_ip: string | null
          name: string
          prefix: string
          revoked_at: string | null
          revoked_by: string | null
          scopes: string[]
          workspace_id: string
        }
        Insert: {
          acts_as: string
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash: string
          last_used_at?: string | null
          last_used_ip?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          revoked_by?: string | null
          scopes: string[]
          workspace_id: string
        }
        Update: {
          acts_as?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash?: string
          last_used_at?: string | null
          last_used_ip?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          revoked_by?: string | null
          scopes?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      api_requests: {
        Row: {
          channel: string
          created_at: string
          duration_ms: number | null
          id: string
          idempotency_key: string | null
          key_id: string | null
          method: string
          path: string
          request_id: string
          response: Json | null
          status: number
          tool: string | null
          workspace_id: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          idempotency_key?: string | null
          key_id?: string | null
          method: string
          path: string
          request_id: string
          response?: Json | null
          status: number
          tool?: string | null
          workspace_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          idempotency_key?: string | null
          key_id?: string | null
          method?: string
          path?: string
          request_id?: string
          response?: Json | null
          status?: number
          tool?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_requests_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          agent_run_id: string | null
          correlation_id: string | null
          created_at: string
          event: string
          id: number
          metadata: Json
          workspace_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          agent_run_id?: string | null
          correlation_id?: string | null
          created_at?: string
          event: string
          id?: never
          metadata?: Json
          workspace_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          agent_run_id?: string | null
          correlation_id?: string | null
          created_at?: string
          event?: string
          id?: never
          metadata?: Json
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_blocks: {
        Row: {
          created_at: string
          created_by: string | null
          crew_id: string | null
          ends_at: string
          id: string
          kind: string
          listing_id: string | null
          note: string
          space_id: string | null
          starts_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          ends_at: string
          id?: string
          kind: string
          listing_id?: string | null
          note?: string
          space_id?: string | null
          starts_at: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          ends_at?: string
          id?: string
          kind?: string
          listing_id?: string | null
          note?: string
          space_id?: string | null
          starts_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_blocks_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_blocks_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_blocks_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_blocks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_jurisdiction_rules: {
        Row: {
          active: boolean
          country: string
          id: string
          latest_service: string | null
          licence_label: string
          min_age: number
          notes: string
          region: string | null
        }
        Insert: {
          active?: boolean
          country: string
          id?: string
          latest_service?: string | null
          licence_label: string
          min_age: number
          notes?: string
          region?: string | null
        }
        Update: {
          active?: boolean
          country?: string
          id?: string
          latest_service?: string | null
          licence_label?: string
          min_age?: number
          notes?: string
          region?: string | null
        }
        Relationships: []
      }
      bar_packages: {
        Row: {
          corkage_per_bottle: number | null
          created_at: string
          deposit_pct: number
          description: string
          equipment: Json
          glassware: boolean
          hours_from: string | null
          hours_to: string | null
          id: string
          licensing: Json
          listing_id: string | null
          min_spend: number | null
          model: string
          name: string
          per_person: number | null
          price: number | null
          setup_minutes: number
          staffing: string
          status: string
          token_price: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          corkage_per_bottle?: number | null
          created_at?: string
          deposit_pct?: number
          description?: string
          equipment?: Json
          glassware?: boolean
          hours_from?: string | null
          hours_to?: string | null
          id?: string
          licensing?: Json
          listing_id?: string | null
          min_spend?: number | null
          model: string
          name: string
          per_person?: number | null
          price?: number | null
          setup_minutes?: number
          staffing?: string
          status?: string
          token_price?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          corkage_per_bottle?: number | null
          created_at?: string
          deposit_pct?: number
          description?: string
          equipment?: Json
          glassware?: boolean
          hours_from?: string | null
          hours_to?: string | null
          id?: string
          licensing?: Json
          listing_id?: string | null
          min_spend?: number | null
          model?: string
          name?: string
          per_person?: number | null
          price?: number | null
          setup_minutes?: number
          staffing?: string
          status?: string
          token_price?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bar_packages_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_packages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_cancellations: {
        Row: {
          build_item_id: string
          calculation: Json
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          event_id: string
          id: string
          item_status_before: string
          kind: string
          party: string
          policy_snapshot: Json
          reason: string
          refund_error: string | null
          refund_status: string
          refunded_minor: number
          requested_by: string | null
          requires_review: boolean
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          build_item_id: string
          calculation: Json
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          event_id: string
          id?: string
          item_status_before: string
          kind: string
          party: string
          policy_snapshot: Json
          reason: string
          refund_error?: string | null
          refund_status?: string
          refunded_minor?: number
          requested_by?: string | null
          requires_review?: boolean
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          build_item_id?: string
          calculation?: Json
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          event_id?: string
          id?: string
          item_status_before?: string
          kind?: string
          party?: string
          policy_snapshot?: Json
          reason?: string
          refund_error?: string | null
          refund_status?: string
          refunded_minor?: number
          requested_by?: string | null
          requires_review?: boolean
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_cancellations_build_item_id_fkey"
            columns: ["build_item_id"]
            isOneToOne: false
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_cancellations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_cancellations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_dispute_entries: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          dispute_id: string
          files: Json
          id: string
          internal: boolean
          kind: string
          party: string
        }
        Insert: {
          author_id?: string | null
          body?: string
          created_at?: string
          dispute_id: string
          files?: Json
          id?: string
          internal?: boolean
          kind: string
          party: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          dispute_id?: string
          files?: Json
          id?: string
          internal?: boolean
          kind?: string
          party?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_dispute_entries_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "booking_disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_disputes: {
        Row: {
          amount_claimed: number | null
          assignee_id: string | null
          build_item_id: string
          created_at: string
          customer_accepted_at: string | null
          event_id: string
          id: string
          item_status_at_open: string
          opened_by: string | null
          opened_by_party: string
          payment_snapshot: Json
          provider_accepted_at: string | null
          provider_job_id: string | null
          reason: string
          reference: string
          resolution: Json | null
          resolved_at: string | null
          response_due_at: string
          status: string
          summary: string
          terms_snapshot: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount_claimed?: number | null
          assignee_id?: string | null
          build_item_id: string
          created_at?: string
          customer_accepted_at?: string | null
          event_id: string
          id?: string
          item_status_at_open: string
          opened_by?: string | null
          opened_by_party: string
          payment_snapshot?: Json
          provider_accepted_at?: string | null
          provider_job_id?: string | null
          reason: string
          reference?: string
          resolution?: Json | null
          resolved_at?: string | null
          response_due_at?: string
          status?: string
          summary: string
          terms_snapshot?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount_claimed?: number | null
          assignee_id?: string | null
          build_item_id?: string
          created_at?: string
          customer_accepted_at?: string | null
          event_id?: string
          id?: string
          item_status_at_open?: string
          opened_by?: string | null
          opened_by_party?: string
          payment_snapshot?: Json
          provider_accepted_at?: string | null
          provider_job_id?: string | null
          reason?: string
          reference?: string
          resolution?: Json | null
          resolved_at?: string | null
          response_due_at?: string
          status?: string
          summary?: string
          terms_snapshot?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_disputes_build_item_id_fkey"
            columns: ["build_item_id"]
            isOneToOne: false
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_disputes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_disputes_provider_job_id_fkey"
            columns: ["provider_job_id"]
            isOneToOne: false
            referencedRelation: "provider_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_disputes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      boost_products: {
        Row: {
          active: boolean
          currency: string
          description: string
          duration_days: number
          key: string
          label: string
          placement: string
          price_minor: number
          sort: number
        }
        Insert: {
          active?: boolean
          currency?: string
          description?: string
          duration_days: number
          key: string
          label: string
          placement: string
          price_minor: number
          sort?: number
        }
        Update: {
          active?: boolean
          currency?: string
          description?: string
          duration_days?: number
          key?: string
          label?: string
          placement?: string
          price_minor?: number
          sort?: number
        }
        Relationships: []
      }
      brand_kits: {
        Row: {
          colors: Json
          fonts: Json
          logos: Json
          sponsor_marks: Json
          tokens: Json
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          colors?: Json
          fonts?: Json
          logos?: Json
          sponsor_marks?: Json
          tokens?: Json
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          colors?: Json
          fonts?: Json
          logos?: Json
          sponsor_marks?: Json
          tokens?: Json
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_kits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      break_glass_access_log: {
        Row: {
          admin_id: string
          closed_at: string | null
          conversation_id: string
          grant_id: string
          id: string
          last_seen_at: string
          opened_at: string
        }
        Insert: {
          admin_id: string
          closed_at?: string | null
          conversation_id: string
          grant_id: string
          id?: string
          last_seen_at?: string
          opened_at?: string
        }
        Update: {
          admin_id?: string
          closed_at?: string | null
          conversation_id?: string
          grant_id?: string
          id?: string
          last_seen_at?: string
          opened_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "break_glass_access_log_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_glass_access_log_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "break_glass_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      break_glass_grants: {
        Row: {
          affected_user_ids: string[]
          approver_id: string | null
          case_id: string
          case_reference: string
          case_type: string
          closed_at: string | null
          conversation_ids: string[]
          created_at: string
          decided_at: string | null
          decision_note: string | null
          duration_minutes: number
          expires_at: string | null
          id: string
          justification: string
          notified_at: string | null
          notify_affected: boolean | null
          notify_withheld_reason: string | null
          reason: string
          requester_id: string
          requires_approval: boolean
          starts_at: string | null
          status: string
        }
        Insert: {
          affected_user_ids?: string[]
          approver_id?: string | null
          case_id: string
          case_reference?: string
          case_type: string
          closed_at?: string | null
          conversation_ids?: string[]
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          duration_minutes?: number
          expires_at?: string | null
          id?: string
          justification: string
          notified_at?: string | null
          notify_affected?: boolean | null
          notify_withheld_reason?: string | null
          reason: string
          requester_id: string
          requires_approval?: boolean
          starts_at?: string | null
          status?: string
        }
        Update: {
          affected_user_ids?: string[]
          approver_id?: string | null
          case_id?: string
          case_reference?: string
          case_type?: string
          closed_at?: string | null
          conversation_ids?: string[]
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          duration_minutes?: number
          expires_at?: string | null
          id?: string
          justification?: string
          notified_at?: string | null
          notify_affected?: boolean | null
          notify_withheld_reason?: string | null
          reason?: string
          requester_id?: string
          requires_approval?: boolean
          starts_at?: string | null
          status?: string
        }
        Relationships: []
      }
      build_items: {
        Row: {
          amount: number | null
          category: string
          created_at: string
          deposit: number
          event_id: string
          hold_expires_at: string | null
          id: string
          image: string
          listing_id: string | null
          notes: string
          package: string
          price_basis: string
          quote: Json
          request_id: string | null
          responded_at: string | null
          response_deadline: string | null
          response_reminders: number
          response_status: string | null
          role: string
          scope: string
          sent_at: string | null
          sort: number
          status: string
          status_before_hold: string | null
          terms_snapshot: Json | null
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          category: string
          created_at?: string
          deposit?: number
          event_id: string
          hold_expires_at?: string | null
          id?: string
          image?: string
          listing_id?: string | null
          notes?: string
          package?: string
          price_basis?: string
          quote?: Json
          request_id?: string | null
          responded_at?: string | null
          response_deadline?: string | null
          response_reminders?: number
          response_status?: string | null
          role?: string
          scope?: string
          sent_at?: string | null
          sort?: number
          status?: string
          status_before_hold?: string | null
          terms_snapshot?: Json | null
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          category?: string
          created_at?: string
          deposit?: number
          event_id?: string
          hold_expires_at?: string | null
          id?: string
          image?: string
          listing_id?: string | null
          notes?: string
          package?: string
          price_basis?: string
          quote?: Json
          request_id?: string | null
          responded_at?: string | null
          response_deadline?: string | null
          response_reminders?: number
          response_status?: string | null
          role?: string
          scope?: string
          sent_at?: string | null
          sort?: number
          status?: string
          status_before_hold?: string | null
          terms_snapshot?: Json | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "build_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "build_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "build_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "provider_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_busy_blocks: {
        Row: {
          connection_id: string
          ends_at: string
          id: number
          starts_at: string
          user_id: string
        }
        Insert: {
          connection_id: string
          ends_at: string
          id?: never
          starts_at: string
          user_id: string
        }
        Update: {
          connection_id?: string
          ends_at?: string
          id?: never
          starts_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_busy_blocks_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "calendar_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_connections: {
        Row: {
          account_email: string | null
          calendar_id: string | null
          created_at: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          provider: string
          status: string
          token_enc: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_email?: string | null
          calendar_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider: string
          status?: string
          token_enc: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_email?: string | null
          calendar_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider?: string
          status?: string
          token_enc?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_entries: {
        Row: {
          detail: string
          ends_at: string | null
          event_id: string | null
          id: string
          layer: string
          owner_id: string | null
          starts_at: string
          title: string
          workspace_id: string | null
        }
        Insert: {
          detail?: string
          ends_at?: string | null
          event_id?: string | null
          id?: string
          layer?: string
          owner_id?: string | null
          starts_at: string
          title: string
          workspace_id?: string | null
        }
        Update: {
          detail?: string
          ends_at?: string | null
          event_id?: string | null
          id?: string
          layer?: string
          owner_id?: string | null
          starts_at?: string
          title?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_sync_links: {
        Row: {
          connection_id: string
          content_hash: string
          external_id: string
          source_uid: string
        }
        Insert: {
          connection_id: string
          content_hash: string
          external_id: string
          source_uid: string
        }
        Update: {
          connection_id?: string
          content_hash?: string
          external_id?: string
          source_uid?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_sync_links_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "calendar_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      catering_selections: {
        Row: {
          build_item_id: string
          created_at: string
          dietary_counts: Json
          equipment: string
          event_id: string
          final_numbers_due: string | null
          guest_count: number
          id: string
          items: Json
          menu_id: string
          notes: string
          price_snapshot: Json
          service_at: string | null
          serving_style: string | null
          staffing: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          build_item_id: string
          created_at?: string
          dietary_counts?: Json
          equipment?: string
          event_id: string
          final_numbers_due?: string | null
          guest_count: number
          id?: string
          items?: Json
          menu_id: string
          notes?: string
          price_snapshot?: Json
          service_at?: string | null
          serving_style?: string | null
          staffing?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          build_item_id?: string
          created_at?: string
          dietary_counts?: Json
          equipment?: string
          event_id?: string
          final_numbers_due?: string | null
          guest_count?: number
          id?: string
          items?: Json
          menu_id?: string
          notes?: string
          price_snapshot?: Json
          service_at?: string | null
          serving_style?: string | null
          staffing?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catering_selections_build_item_id_fkey"
            columns: ["build_item_id"]
            isOneToOne: true
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catering_selections_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catering_selections_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
        ]
      }
      check_ins: {
        Row: {
          created_at: string
          credential: string | null
          device: string | null
          event_id: string
          gate: string | null
          id: number
          offline_at: string | null
          result: string
          scanned_by: string | null
          ticket_id: string | null
        }
        Insert: {
          created_at?: string
          credential?: string | null
          device?: string | null
          event_id: string
          gate?: string | null
          id?: never
          offline_at?: string | null
          result: string
          scanned_by?: string | null
          ticket_id?: string | null
        }
        Update: {
          created_at?: string
          credential?: string | null
          device?: string | null
          event_id?: string
          gate?: string | null
          id?: never
          offline_at?: string | null
          result?: string
          scanned_by?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_orders: {
        Row: {
          amount: number
          buyer_id: string | null
          commission: number
          created_at: string
          currency: string
          event_id: string
          fee: number
          kind: string
          lines: Json
          order_ref: string
          ref_code: string | null
          refund_error: string | null
          refund_reason: string | null
          refund_status: string
          refunded_at: string | null
          status: string
          stripe_session: string | null
          token: string
          updated_at: string
        }
        Insert: {
          amount: number
          buyer_id?: string | null
          commission?: number
          created_at?: string
          currency?: string
          event_id: string
          fee?: number
          kind?: string
          lines?: Json
          order_ref: string
          ref_code?: string | null
          refund_error?: string | null
          refund_reason?: string | null
          refund_status?: string
          refunded_at?: string | null
          status?: string
          stripe_session?: string | null
          token: string
          updated_at?: string
        }
        Update: {
          amount?: number
          buyer_id?: string | null
          commission?: number
          created_at?: string
          currency?: string
          event_id?: string
          fee?: number
          kind?: string
          lines?: Json
          order_ref?: string
          ref_code?: string | null
          refund_error?: string | null
          refund_reason?: string | null
          refund_status?: string
          refunded_at?: string | null
          status?: string
          stripe_session?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          active: boolean
          category: string | null
          country: string | null
          created_at: string
          created_by: string | null
          fixed_minor: number
          id: string
          name: string
          partner_id: string | null
          plan: string | null
          priority: number
          promotion_code: string | null
          rate_bps: number
          valid_from: string | null
          valid_to: string | null
          workspace_id: string | null
        }
        Insert: {
          active?: boolean
          category?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          fixed_minor?: number
          id?: string
          name: string
          partner_id?: string | null
          plan?: string | null
          priority?: number
          promotion_code?: string | null
          rate_bps: number
          valid_from?: string | null
          valid_to?: string | null
          workspace_id?: string | null
        }
        Update: {
          active?: boolean
          category?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          fixed_minor?: number
          id?: string
          name?: string
          partner_id?: string | null
          plan?: string | null
          priority?: number
          promotion_code?: string | null
          rate_bps?: number
          valid_from?: string | null
          valid_to?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conditional_holds: {
        Row: {
          blocking_level: string
          build_item_id: string
          closed_reason: string | null
          conditions: string
          created_at: string
          currency: string
          dependency_state: string
          depends_on_item_id: string | null
          ends_at: string | null
          event_id: string
          expires_at: string | null
          held_quantity: number | null
          id: string
          listing_id: string
          price: number | null
          provider_note: string
          requested_by: string | null
          requested_hours: number
          responded_at: string | null
          responded_by: string | null
          source: string
          space_id: string | null
          starts_at: string | null
          status: string
          updated_at: string
          window_end: string | null
          window_start: string | null
          workspace_id: string
        }
        Insert: {
          blocking_level?: string
          build_item_id: string
          closed_reason?: string | null
          conditions?: string
          created_at?: string
          currency?: string
          dependency_state?: string
          depends_on_item_id?: string | null
          ends_at?: string | null
          event_id: string
          expires_at?: string | null
          held_quantity?: number | null
          id?: string
          listing_id: string
          price?: number | null
          provider_note?: string
          requested_by?: string | null
          requested_hours: number
          responded_at?: string | null
          responded_by?: string | null
          source?: string
          space_id?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
          window_end?: string | null
          window_start?: string | null
          workspace_id: string
        }
        Update: {
          blocking_level?: string
          build_item_id?: string
          closed_reason?: string | null
          conditions?: string
          created_at?: string
          currency?: string
          dependency_state?: string
          depends_on_item_id?: string | null
          ends_at?: string | null
          event_id?: string
          expires_at?: string | null
          held_quantity?: number | null
          id?: string
          listing_id?: string
          price?: number | null
          provider_note?: string
          requested_by?: string | null
          requested_hours?: number
          responded_at?: string | null
          responded_by?: string | null
          source?: string
          space_id?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
          window_end?: string | null
          window_start?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conditional_holds_build_item_id_fkey"
            columns: ["build_item_id"]
            isOneToOne: false
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conditional_holds_depends_on_item_id_fkey"
            columns: ["depends_on_item_id"]
            isOneToOne: false
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conditional_holds_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conditional_holds_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conditional_holds_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conditional_holds_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      connect_accounts: {
        Row: {
          account_type: string
          card_payments_capability: string
          charges_enabled: boolean
          country: string | null
          default_currency: string | null
          details_submitted: boolean
          disabled_reason: string | null
          last_event_at: string | null
          payouts_enabled: boolean
          requirements_currently_due: string[]
          requirements_eventually_due: string[]
          requirements_past_due: string[]
          stripe_account_id: string
          transfers_capability: string
          updated_at: string
          verification_state: string
          workspace_id: string
        }
        Insert: {
          account_type?: string
          card_payments_capability?: string
          charges_enabled?: boolean
          country?: string | null
          default_currency?: string | null
          details_submitted?: boolean
          disabled_reason?: string | null
          last_event_at?: string | null
          payouts_enabled?: boolean
          requirements_currently_due?: string[]
          requirements_eventually_due?: string[]
          requirements_past_due?: string[]
          stripe_account_id: string
          transfers_capability?: string
          updated_at?: string
          verification_state?: string
          workspace_id: string
        }
        Update: {
          account_type?: string
          card_payments_capability?: string
          charges_enabled?: boolean
          country?: string | null
          default_currency?: string | null
          details_submitted?: boolean
          disabled_reason?: string | null
          last_event_at?: string | null
          payouts_enabled?: boolean
          requirements_currently_due?: string[]
          requirements_eventually_due?: string[]
          requirements_past_due?: string[]
          stripe_account_id?: string
          transfers_capability?: string
          updated_at?: string
          verification_state?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connect_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          attachments: Json
          body: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          sender_id: string | null
          sender_name: string
          sender_workspace_id: string | null
        }
        Insert: {
          attachments?: Json
          body?: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          sender_id?: string | null
          sender_name?: string
          sender_workspace_id?: string | null
        }
        Update: {
          attachments?: Json
          body?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          sender_id?: string | null
          sender_name?: string
          sender_workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_sender_workspace_id_fkey"
            columns: ["sender_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          label: string
          last_read_at: string | null
          left_at: string | null
          muted: boolean
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          label?: string
          last_read_at?: string | null
          left_at?: string | null
          muted?: boolean
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          label?: string
          last_read_at?: string | null
          left_at?: string | null
          muted?: boolean
          user_id?: string | null
          workspace_id?: string | null
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
          build_item_id: string | null
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          kind: string
          last_message_at: string
          last_message_preview: string
          listing_id: string | null
          subject: string
        }
        Insert: {
          build_item_id?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          kind?: string
          last_message_at?: string
          last_message_preview?: string
          listing_id?: string | null
          subject?: string
        }
        Update: {
          build_item_id?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          kind?: string
          last_message_at?: string
          last_message_preview?: string
          listing_id?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_build_item_id_fkey"
            columns: ["build_item_id"]
            isOneToOne: false
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      credential_requirements: {
        Row: {
          capability: string | null
          category: string | null
          country: string | null
          credential_key: string
          gates_marketplace: boolean
          id: string
          requirement: string
        }
        Insert: {
          capability?: string | null
          category?: string | null
          country?: string | null
          credential_key: string
          gates_marketplace?: boolean
          id?: string
          requirement: string
        }
        Update: {
          capability?: string | null
          category?: string | null
          country?: string | null
          credential_key?: string
          gates_marketplace?: boolean
          id?: string
          requirement?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_requirements_credential_key_fkey"
            columns: ["credential_key"]
            isOneToOne: false
            referencedRelation: "credential_types"
            referencedColumns: ["key"]
          },
        ]
      }
      credential_types: {
        Row: {
          description: string
          expires: boolean
          key: string
          label: string
          verification_method: string
        }
        Insert: {
          description?: string
          expires?: boolean
          key: string
          label: string
          verification_method?: string
        }
        Update: {
          description?: string
          expires?: boolean
          key?: string
          label?: string
          verification_method?: string
        }
        Relationships: []
      }
      credit_packs: {
        Row: {
          active: boolean
          created_at: string
          credits: number
          currency: string
          expiry_days: number | null
          id: string
          name: string
          price_minor: number
          target_margin_bps: number
          vat_treatment: string
          workspace_kinds: string[]
          worst_case_cost_minor: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          credits: number
          currency?: string
          expiry_days?: number | null
          id?: string
          name: string
          price_minor: number
          target_margin_bps: number
          vat_treatment?: string
          workspace_kinds?: string[]
          worst_case_cost_minor: number
        }
        Update: {
          active?: boolean
          created_at?: string
          credits?: number
          currency?: string
          expiry_days?: number | null
          id?: string
          name?: string
          price_minor?: number
          target_margin_bps?: number
          vat_treatment?: string
          workspace_kinds?: string[]
          worst_case_cost_minor?: number
        }
        Relationships: []
      }
      crew_members: {
        Row: {
          avatar: string
          bio: string
          created_at: string
          day_rate: number | null
          details: Json
          email: string
          id: string
          location: string
          member_type: string
          name: string
          phone: string
          role: string
          skills: string[]
          status: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          avatar?: string
          bio?: string
          created_at?: string
          day_rate?: number | null
          details?: Json
          email?: string
          id?: string
          location?: string
          member_type?: string
          name: string
          phone?: string
          role: string
          skills?: string[]
          status?: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          avatar?: string
          bio?: string
          created_at?: string
          day_rate?: number | null
          details?: Json
          email?: string
          id?: string
          location?: string
          member_type?: string
          name?: string
          phone?: string
          role?: string
          skills?: string[]
          status?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      db_backup_runs: {
        Row: {
          attempts: number
          bytes: number | null
          error: string | null
          finished_at: string | null
          rows: number | null
          run_date: string
          started_at: string
          status: string
          tables: number | null
        }
        Insert: {
          attempts?: number
          bytes?: number | null
          error?: string | null
          finished_at?: string | null
          rows?: number | null
          run_date: string
          started_at?: string
          status?: string
          tables?: number | null
        }
        Update: {
          attempts?: number
          bytes?: number | null
          error?: string | null
          finished_at?: string | null
          rows?: number | null
          run_date?: string
          started_at?: string
          status?: string
          tables?: number | null
        }
        Relationships: []
      }
      db_backup_tables: {
        Row: {
          bytes: number
          rows: number
          run_date: string
          schema_name: string
          table_name: string
          uploaded_at: string
        }
        Insert: {
          bytes: number
          rows: number
          run_date: string
          schema_name: string
          table_name: string
          uploaded_at?: string
        }
        Update: {
          bytes?: number
          rows?: number
          run_date?: string
          schema_name?: string
          table_name?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "db_backup_tables_run_date_fkey"
            columns: ["run_date"]
            isOneToOne: false
            referencedRelation: "db_backup_runs"
            referencedColumns: ["run_date"]
          },
        ]
      }
      design_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          design_id: string
          id: string
          layer_id: string | null
          page_id: string | null
          parent_id: string | null
          resolved: boolean
          x: number | null
          y: number | null
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          design_id: string
          id?: string
          layer_id?: string | null
          page_id?: string | null
          parent_id?: string | null
          resolved?: boolean
          x?: number | null
          y?: number | null
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          design_id?: string
          id?: string
          layer_id?: string | null
          page_id?: string | null
          parent_id?: string | null
          resolved?: boolean
          x?: number | null
          y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "design_comments_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "design_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      design_shares: {
        Row: {
          created_at: string
          created_by: string | null
          design_id: string
          expires_at: string | null
          id: string
          link_token_hash: string | null
          permission: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          design_id: string
          expires_at?: string | null
          id?: string
          link_token_hash?: string | null
          permission: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          design_id?: string
          expires_at?: string | null
          id?: string
          link_token_hash?: string | null
          permission?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "design_shares_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
        ]
      }
      design_templates: {
        Row: {
          category: string
          created_at: string
          description: string
          document: Json
          event_type: string | null
          height: number
          id: string
          link_token_hash: string | null
          owner_id: string | null
          placeholders: string[]
          preview: string | null
          save_count: number
          source_design_id: string | null
          status: string
          tags: string[]
          title: string
          usage_count: number
          visibility: string
          width: number
          workspace_id: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string
          document: Json
          event_type?: string | null
          height: number
          id?: string
          link_token_hash?: string | null
          owner_id?: string | null
          placeholders?: string[]
          preview?: string | null
          save_count?: number
          source_design_id?: string | null
          status?: string
          tags?: string[]
          title: string
          usage_count?: number
          visibility?: string
          width: number
          workspace_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          document?: Json
          event_type?: string | null
          height?: number
          id?: string
          link_token_hash?: string | null
          owner_id?: string | null
          placeholders?: string[]
          preview?: string | null
          save_count?: number
          source_design_id?: string | null
          status?: string
          tags?: string[]
          title?: string
          usage_count?: number
          visibility?: string
          width?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "design_templates_source_design_id_fkey"
            columns: ["source_design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      design_versions: {
        Row: {
          auto: boolean
          created_at: string
          created_by: string | null
          design_id: string
          document: Json
          label: string
          version: number
        }
        Insert: {
          auto?: boolean
          created_at?: string
          created_by?: string | null
          design_id: string
          document: Json
          label?: string
          version: number
        }
        Update: {
          auto?: boolean
          created_at?: string
          created_by?: string | null
          design_id?: string
          document?: Json
          label?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "design_versions_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
        ]
      }
      designs: {
        Row: {
          agent_run_id: string | null
          created_at: string
          deleted_at: string | null
          document: Json
          event_id: string | null
          id: string
          kind: string
          owner_id: string
          source: string
          status: string
          template_id: string | null
          thumbnail: string | null
          title: string
          updated_at: string
          version: number
          workspace_id: string | null
        }
        Insert: {
          agent_run_id?: string | null
          created_at?: string
          deleted_at?: string | null
          document: Json
          event_id?: string | null
          id?: string
          kind?: string
          owner_id: string
          source?: string
          status?: string
          template_id?: string | null
          thumbnail?: string | null
          title?: string
          updated_at?: string
          version?: number
          workspace_id?: string | null
        }
        Update: {
          agent_run_id?: string | null
          created_at?: string
          deleted_at?: string | null
          document?: Json
          event_id?: string | null
          id?: string
          kind?: string
          owner_id?: string
          source?: string
          status?: string
          template_id?: string | null
          thumbnail?: string | null
          title?: string
          updated_at?: string
          version?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "designs_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_codes: {
        Row: {
          amount: number
          code: string
          event_id: string
          id: string
          kind: string
          max_uses: number | null
          status: string
          used: number
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          amount: number
          code: string
          event_id: string
          id?: string
          kind?: string
          max_uses?: number | null
          status?: string
          used?: number
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          amount?: number
          code?: string
          event_id?: string
          id?: string
          kind?: string
          max_uses?: number | null
          status?: string
          used?: number
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discount_codes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          attempts: number
          body: string
          category: string
          created_at: string
          id: string
          last_error: string | null
          lease_until: string | null
          link: string | null
          notification_id: string | null
          provider_id: string | null
          sent_at: string | null
          status: string
          subject: string
          to_email: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          body: string
          category: string
          created_at?: string
          id?: string
          last_error?: string | null
          lease_until?: string | null
          link?: string | null
          notification_id?: string | null
          provider_id?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          to_email: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          body?: string
          category?: string
          created_at?: string
          id?: string
          last_error?: string | null
          lease_until?: string | null
          link?: string | null
          notification_id?: string | null
          provider_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          to_email?: string
          user_id?: string | null
        }
        Relationships: []
      }
      emergency_candidates: {
        Row: {
          accepted_at: string | null
          build_item_id: string | null
          delivered_at: string
          distance_km: number | null
          eta_minutes: number | null
          id: string
          listing_id: string | null
          note: string
          opened_at: string | null
          quote_amount: number | null
          request_id: string
          responded_at: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          build_item_id?: string | null
          delivered_at?: string
          distance_km?: number | null
          eta_minutes?: number | null
          id?: string
          listing_id?: string | null
          note?: string
          opened_at?: string | null
          quote_amount?: number | null
          request_id: string
          responded_at?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          build_item_id?: string | null
          delivered_at?: string
          distance_km?: number | null
          eta_minutes?: number | null
          id?: string
          listing_id?: string | null
          note?: string
          opened_at?: string | null
          quote_amount?: number | null
          request_id?: string
          responded_at?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_candidates_build_item_id_fkey"
            columns: ["build_item_id"]
            isOneToOne: false
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_candidates_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_candidates_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "emergency_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_candidates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_provider_profiles: {
        Row: {
          available_now: boolean
          available_until: string | null
          base_lat: number | null
          base_lng: number | null
          categories: string[]
          enabled: boolean
          radius_km: number
          rate_notes: string
          response_minutes: number
          surcharge_pct: number
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          available_now?: boolean
          available_until?: string | null
          base_lat?: number | null
          base_lng?: number | null
          categories?: string[]
          enabled?: boolean
          radius_km?: number
          rate_notes?: string
          response_minutes?: number
          surcharge_pct?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          available_now?: boolean
          available_until?: string | null
          base_lat?: number | null
          base_lng?: number | null
          categories?: string[]
          enabled?: boolean
          radius_km?: number
          rate_notes?: string
          response_minutes?: number
          surcharge_pct?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_provider_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_requests: {
        Row: {
          budget_max: number | null
          category: string
          created_at: string
          created_by: string | null
          currency: string
          event_id: string
          failure_reason: string
          filled_candidate_id: string | null
          id: string
          lat: number | null
          lng: number | null
          location: string
          original_item_id: string | null
          pool_size: number
          reference: string
          required_arrival: string
          scope: string
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          budget_max?: number | null
          category: string
          created_at?: string
          created_by?: string | null
          currency?: string
          event_id: string
          failure_reason?: string
          filled_candidate_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location?: string
          original_item_id?: string | null
          pool_size?: number
          reference?: string
          required_arrival: string
          scope?: string
          severity: string
          status?: string
          updated_at?: string
        }
        Update: {
          budget_max?: number | null
          category?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          event_id?: string
          failure_reason?: string
          filled_candidate_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location?: string
          original_item_id?: string | null
          pool_size?: number
          reference?: string
          required_arrival?: string
          scope?: string
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_requests_original_item_id_fkey"
            columns: ["original_item_id"]
            isOneToOne: false
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiries: {
        Row: {
          created_at: string
          details: Json
          event_date: string | null
          id: string
          listing_key: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          event_date?: string | null
          id?: string
          listing_key: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          event_date?: string | null
          id?: string
          listing_key?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      event_cancellations: {
        Row: {
          cancelled_by: string | null
          created_at: string
          event_id: string
          orders_refunded: number
          reason: string
          tickets_voided: number
        }
        Insert: {
          cancelled_by?: string | null
          created_at?: string
          event_id: string
          orders_refunded?: number
          reason: string
          tickets_voided?: number
        }
        Update: {
          cancelled_by?: string | null
          created_at?: string
          event_id?: string
          orders_refunded?: number
          reason?: string
          tickets_voided?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_cancellations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_metrics_daily: {
        Row: {
          day: string
          event_id: string
          page_views: number
          sources: Json
          unique_visitors: number
        }
        Insert: {
          day: string
          event_id: string
          page_views?: number
          sources?: Json
          unique_visitors?: number
        }
        Update: {
          day?: string
          event_id?: string
          page_views?: number
          sources?: Json
          unique_visitors?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_metrics_daily_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_order_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          content: Json
          created_at: string
          created_by: string | null
          financial: Json
          note: string
          order_id: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          content: Json
          created_at?: string
          created_by?: string | null
          financial?: Json
          note?: string
          order_id: string
          version: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          financial?: Json
          note?: string
          order_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_order_versions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "event_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      event_orders: {
        Row: {
          approved_version: number | null
          build_item_id: string | null
          created_at: string
          created_by: string | null
          current_version: number
          event_id: string | null
          id: string
          provider_job_id: string | null
          reference: string
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          approved_version?: number | null
          build_item_id?: string | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          event_id?: string | null
          id?: string
          provider_job_id?: string | null
          reference?: string
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          approved_version?: number | null
          build_item_id?: string | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          event_id?: string | null
          id?: string
          provider_job_id?: string | null
          reference?: string
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_orders_build_item_id_fkey"
            columns: ["build_item_id"]
            isOneToOne: false
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_orders_provider_job_id_fkey"
            columns: ["provider_job_id"]
            isOneToOne: false
            referencedRelation: "provider_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_orders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_seats: {
        Row: {
          accessible: boolean
          event_id: string
          hold_expires_at: string | null
          hold_token: string | null
          kind: string
          label: string
          seat_key: string
          section: string
          status: string
          ticket_id: string | null
          tier_id: string | null
          updated_at: string
        }
        Insert: {
          accessible?: boolean
          event_id: string
          hold_expires_at?: string | null
          hold_token?: string | null
          kind?: string
          label?: string
          seat_key: string
          section?: string
          status?: string
          ticket_id?: string | null
          tier_id?: string | null
          updated_at?: string
        }
        Update: {
          accessible?: boolean
          event_id?: string
          hold_expires_at?: string | null
          hold_token?: string | null
          kind?: string
          label?: string
          seat_key?: string
          section?: string
          status?: string
          ticket_id?: string | null
          tier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_seats_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_seats_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_seats_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      event_templates: {
        Row: {
          created_at: string
          description: string
          event_types: string[]
          id: string
          modules: Json
          name: string
          source_event_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          event_types?: string[]
          id?: string
          modules?: Json
          name: string
          source_event_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string
          event_types?: string[]
          id?: string
          modules?: Json
          name?: string
          source_event_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_templates_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_virtual: {
        Row: {
          capacity: number | null
          closes_minutes_after: number
          event_id: string
          external_id: string | null
          format: string
          host_notes: string | null
          host_url: string | null
          join_url: string | null
          opens_minutes_before: number
          provider: string
          recording_url: string | null
          replay_available: boolean
          replay_until: string | null
          session_id: string | null
          ticket_required: boolean
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          capacity?: number | null
          closes_minutes_after?: number
          event_id: string
          external_id?: string | null
          format?: string
          host_notes?: string | null
          host_url?: string | null
          join_url?: string | null
          opens_minutes_before?: number
          provider?: string
          recording_url?: string | null
          replay_available?: boolean
          replay_until?: string | null
          session_id?: string | null
          ticket_required?: boolean
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          capacity?: number | null
          closes_minutes_after?: number
          event_id?: string
          external_id?: string | null
          format?: string
          host_notes?: string | null
          host_url?: string | null
          join_url?: string | null
          opens_minutes_before?: number
          provider?: string
          recording_url?: string | null
          replay_available?: boolean
          replay_until?: string | null
          session_id?: string | null
          ticket_required?: boolean
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_virtual_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          adults: number | null
          budget_total: number | null
          capacity: number | null
          children: number | null
          city: string
          client_name: string
          cover_image: string
          created_at: string
          currency: string
          description: string
          ends_at: string | null
          event_type: string
          flexible_dates: boolean
          goal: string
          guest_count: number
          id: string
          lead_id: string | null
          location: string
          management: string
          name: string
          owner_id: string
          priorities: string[]
          revenue_goal: number | null
          settings: Json
          slug: string | null
          starts_at: string | null
          status: string
          tags: string[]
          target_profit: number | null
          timezone: string
          updated_at: string
          venue_listing_id: string | null
          venue_name: string
          visibility: string
          workspace_id: string | null
        }
        Insert: {
          adults?: number | null
          budget_total?: number | null
          capacity?: number | null
          children?: number | null
          city?: string
          client_name?: string
          cover_image?: string
          created_at?: string
          currency?: string
          description?: string
          ends_at?: string | null
          event_type?: string
          flexible_dates?: boolean
          goal?: string
          guest_count?: number
          id?: string
          lead_id?: string | null
          location?: string
          management?: string
          name: string
          owner_id: string
          priorities?: string[]
          revenue_goal?: number | null
          settings?: Json
          slug?: string | null
          starts_at?: string | null
          status?: string
          tags?: string[]
          target_profit?: number | null
          timezone?: string
          updated_at?: string
          venue_listing_id?: string | null
          venue_name?: string
          visibility?: string
          workspace_id?: string | null
        }
        Update: {
          adults?: number | null
          budget_total?: number | null
          capacity?: number | null
          children?: number | null
          city?: string
          client_name?: string
          cover_image?: string
          created_at?: string
          currency?: string
          description?: string
          ends_at?: string | null
          event_type?: string
          flexible_dates?: boolean
          goal?: string
          guest_count?: number
          id?: string
          lead_id?: string | null
          location?: string
          management?: string
          name?: string
          owner_id?: string
          priorities?: string[]
          revenue_goal?: number | null
          settings?: Json
          slug?: string | null
          starts_at?: string | null
          status?: string
          tags?: string[]
          target_profit?: number | null
          timezone?: string
          updated_at?: string
          venue_listing_id?: string | null
          venue_name?: string
          visibility?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_venue_listing_id_fkey"
            columns: ["venue_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      guests: {
        Row: {
          checked_in_at: string | null
          dietary: string
          email: string
          event_id: string
          group_name: string
          id: string
          invited_at: string | null
          name: string
          phone: string
          plus_one: boolean
          status: string
          tickets: number
        }
        Insert: {
          checked_in_at?: string | null
          dietary?: string
          email?: string
          event_id: string
          group_name?: string
          id?: string
          invited_at?: string | null
          name: string
          phone?: string
          plus_one?: boolean
          status?: string
          tickets?: number
        }
        Update: {
          checked_in_at?: string | null
          dietary?: string
          email?: string
          event_id?: string
          group_name?: string
          id?: string
          invited_at?: string | null
          name?: string
          phone?: string
          plus_one?: boolean
          status?: string
          tickets?: number
        }
        Relationships: [
          {
            foreignKeyName: "guests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          created_at: string
          detail: string
          event_id: string
          id: string
          reported_by: string | null
          severity: string
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          detail?: string
          event_id: string
          id?: string
          reported_by?: string | null
          severity?: string
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          detail?: string
          event_id?: string
          id?: string
          reported_by?: string | null
          severity?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          category: string
          id: string
          logo: string
          metrics: Json
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          category?: string
          id?: string
          logo?: string
          metrics?: Json
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          id?: string
          logo?: string
          metrics?: Json
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoice_events: {
        Row: {
          created_at: string
          detail: string
          event: string
          id: number
          invoice_id: string
        }
        Insert: {
          created_at?: string
          detail?: string
          event: string
          id?: never
          invoice_id: string
        }
        Update: {
          created_at?: string
          detail?: string
          event?: string
          id?: never
          invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_installments: {
        Row: {
          amount: number
          due_date: string
          id: string
          invoice_id: string
          label: string
          status: string
        }
        Insert: {
          amount: number
          due_date: string
          id?: string
          invoice_id: string
          label: string
          status?: string
        }
        Update: {
          amount?: number
          due_date?: string
          id?: string
          invoice_id?: string
          label?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_installments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          description: string
          detail: string
          id: string
          invoice_id: string
          quantity: number
          sort: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          description: string
          detail?: string
          id?: string
          invoice_id: string
          quantity?: number
          sort?: number
          tax_rate?: number
          unit_price: number
        }
        Update: {
          description?: string
          detail?: string
          id?: string
          invoice_id?: string
          quantity?: number
          sort?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          client_address: string
          client_email: string
          client_name: string
          contact_name: string
          created_at: string
          currency: string
          due_date: string | null
          event_id: string | null
          id: string
          issue_date: string
          issued_at: string | null
          notes: string
          number: string
          payment_token: string | null
          reference: string
          status: string
          subtotal: number
          tax: number
          total: number
          workspace_id: string
        }
        Insert: {
          amount_paid?: number
          client_address?: string
          client_email?: string
          client_name: string
          contact_name?: string
          created_at?: string
          currency?: string
          due_date?: string | null
          event_id?: string | null
          id?: string
          issue_date?: string
          issued_at?: string | null
          notes?: string
          number: string
          payment_token?: string | null
          reference?: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          workspace_id: string
        }
        Update: {
          amount_paid?: number
          client_address?: string
          client_email?: string
          client_name?: string
          contact_name?: string
          created_at?: string
          currency?: string
          due_date?: string | null
          event_id?: string | null
          id?: string
          issue_date?: string
          issued_at?: string | null
          notes?: string
          number?: string
          payment_token?: string | null
          reference?: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
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
            foreignKeyName: "invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      launch_queue: {
        Row: {
          admitted_at: string | null
          event_id: string
          joined_at: string
          position: number
          token_hash: string
          used_at: string | null
          user_id: string | null
        }
        Insert: {
          admitted_at?: string | null
          event_id: string
          joined_at?: string
          position?: never
          token_hash: string
          used_at?: string | null
          user_id?: string | null
        }
        Update: {
          admitted_at?: string | null
          event_id?: string
          joined_at?: string
          position?: never
          token_hash?: string
          used_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "launch_queue_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          actor_id: string | null
          actor_name: string
          created_at: string
          detail: string
          id: string
          kind: string
          lead_id: string
          title: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          detail?: string
          id?: string
          kind?: string
          lead_id: string
          title: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          detail?: string
          id?: string
          kind?: string
          lead_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          budget: string
          client_name: string
          contact_email: string
          contact_name: string
          contact_phone: string
          created_at: string
          details: Json
          event_id: string | null
          event_type: string
          expected_date: string | null
          guests: string
          id: string
          location: string
          name: string
          next_action: string
          next_action_at: string | null
          owner_name: string
          probability: number
          reference: string
          source: string
          stage: string
          tags: string[]
          value: number
          workspace_id: string
        }
        Insert: {
          budget?: string
          client_name: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          created_at?: string
          details?: Json
          event_id?: string | null
          event_type?: string
          expected_date?: string | null
          guests?: string
          id?: string
          location?: string
          name: string
          next_action?: string
          next_action_at?: string | null
          owner_name?: string
          probability?: number
          reference: string
          source?: string
          stage?: string
          tags?: string[]
          value?: number
          workspace_id: string
        }
        Update: {
          budget?: string
          client_name?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          created_at?: string
          details?: Json
          event_id?: string | null
          event_type?: string
          expected_date?: string | null
          guests?: string
          id?: string
          location?: string
          name?: string
          next_action?: string
          next_action_at?: string | null
          owner_name?: string
          probability?: number
          reference?: string
          source?: string
          stage?: string
          tags?: string[]
          value?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
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
      ledger_entries: {
        Row: {
          account: string
          amount_minor: number
          created_at: string
          id: number
          party_id: string | null
          party_type: string | null
          transaction_id: string
        }
        Insert: {
          account: string
          amount_minor: number
          created_at?: string
          id?: never
          party_id?: string | null
          party_type?: string | null
          transaction_id: string
        }
        Update: {
          account?: string
          amount_minor?: number
          created_at?: string
          id?: never
          party_id?: string | null
          party_type?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_transactions: {
        Row: {
          actor_type: string
          currency: string
          description: string
          event_id: string | null
          id: string
          idempotency_key: string
          kind: string
          posted_at: string
          source_id: string | null
          source_type: string | null
          stripe_ref: string | null
          workspace_id: string | null
        }
        Insert: {
          actor_type?: string
          currency: string
          description?: string
          event_id?: string | null
          id?: string
          idempotency_key: string
          kind: string
          posted_at?: string
          source_id?: string | null
          source_type?: string | null
          stripe_ref?: string | null
          workspace_id?: string | null
        }
        Update: {
          actor_type?: string
          currency?: string
          description?: string
          event_id?: string | null
          id?: string
          idempotency_key?: string
          kind?: string
          posted_at?: string
          source_id?: string | null
          source_type?: string | null
          stripe_ref?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_transactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          badge: string | null
          booking_mode: string
          capacity_max: number | null
          capacity_min: number | null
          category: string
          city: string
          created_at: string
          description: string
          details: Json
          emergency_supply: boolean
          enquiry_count: number
          gallery: string[]
          id: string
          image: string
          instant_book: boolean
          kind: string
          lat: number | null
          lng: number | null
          location: string
          name: string
          paused_at: string | null
          price_from: number | null
          price_unit: string
          published: boolean
          rating: number
          response_hours: number
          review_count: number
          review_status: string
          slug: string | null
          sponsored: boolean
          tags: string[]
          updated_at: string
          verified: boolean
          views: number
          workspace_id: string
        }
        Insert: {
          badge?: string | null
          booking_mode?: string
          capacity_max?: number | null
          capacity_min?: number | null
          category?: string
          city?: string
          created_at?: string
          description?: string
          details?: Json
          emergency_supply?: boolean
          enquiry_count?: number
          gallery?: string[]
          id?: string
          image?: string
          instant_book?: boolean
          kind: string
          lat?: number | null
          lng?: number | null
          location?: string
          name: string
          paused_at?: string | null
          price_from?: number | null
          price_unit?: string
          published?: boolean
          rating?: number
          response_hours?: number
          review_count?: number
          review_status?: string
          slug?: string | null
          sponsored?: boolean
          tags?: string[]
          updated_at?: string
          verified?: boolean
          views?: number
          workspace_id: string
        }
        Update: {
          badge?: string | null
          booking_mode?: string
          capacity_max?: number | null
          capacity_min?: number | null
          category?: string
          city?: string
          created_at?: string
          description?: string
          details?: Json
          emergency_supply?: boolean
          enquiry_count?: number
          gallery?: string[]
          id?: string
          image?: string
          instant_book?: boolean
          kind?: string
          lat?: number | null
          lng?: number | null
          location?: string
          name?: string
          paused_at?: string | null
          price_from?: number | null
          price_unit?: string
          published?: boolean
          rating?: number
          response_hours?: number
          review_count?: number
          review_status?: string
          slug?: string | null
          sponsored?: boolean
          tags?: string[]
          updated_at?: string
          verified?: boolean
          views?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_windows: {
        Row: {
          audience: string
          bypass_roles: string[]
          created_at: string
          created_by: string | null
          dismissible: boolean
          end_note: string | null
          ended_at: string | null
          ended_by: string | null
          ends_at: string | null
          expected_restore: string | null
          id: string
          level: number
          message: string
          modules: string[]
          reference: string
          severity: string
          starts_at: string
          status_url: string | null
          title: string
        }
        Insert: {
          audience?: string
          bypass_roles?: string[]
          created_at?: string
          created_by?: string | null
          dismissible?: boolean
          end_note?: string | null
          ended_at?: string | null
          ended_by?: string | null
          ends_at?: string | null
          expected_restore?: string | null
          id?: string
          level: number
          message?: string
          modules?: string[]
          reference?: string
          severity?: string
          starts_at?: string
          status_url?: string | null
          title: string
        }
        Update: {
          audience?: string
          bypass_roles?: string[]
          created_at?: string
          created_by?: string | null
          dismissible?: boolean
          end_note?: string | null
          ended_at?: string | null
          ended_by?: string | null
          ends_at?: string | null
          expected_restore?: string | null
          id?: string
          level?: number
          message?: string
          modules?: string[]
          reference?: string
          severity?: string
          starts_at?: string
          status_url?: string | null
          title?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          created_at: string
          data: Json
          event_id: string | null
          format: string
          id: string
          kind: string
          rights: string
          status: string
          title: string
          url: string
          version: number
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          data?: Json
          event_id?: string | null
          format?: string
          id?: string
          kind?: string
          rights?: string
          status?: string
          title: string
          url?: string
          version?: number
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          event_id?: string | null
          format?: string
          id?: string
          kind?: string
          rights?: string
          status?: string
          title?: string
          url?: string
          version?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          add_ons: Json
          allergen_note: string
          allergens: string[]
          available: boolean
          description: string
          dietary: string[]
          id: string
          menu_id: string
          name: string
          price: number | null
          section_id: string | null
          sort: number
          unit: string
          variations: Json
        }
        Insert: {
          add_ons?: Json
          allergen_note?: string
          allergens?: string[]
          available?: boolean
          description?: string
          dietary?: string[]
          id?: string
          menu_id: string
          name: string
          price?: number | null
          section_id?: string | null
          sort?: number
          unit?: string
          variations?: Json
        }
        Update: {
          add_ons?: Json
          allergen_note?: string
          allergens?: string[]
          available?: boolean
          description?: string
          dietary?: string[]
          id?: string
          menu_id?: string
          name?: string
          price?: number | null
          section_id?: string | null
          sort?: number
          unit?: string
          variations?: Json
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "menu_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_sections: {
        Row: {
          choose_max: number | null
          choose_min: number | null
          id: string
          menu_id: string
          name: string
          sort: number
        }
        Insert: {
          choose_max?: number | null
          choose_min?: number | null
          id?: string
          menu_id: string
          name: string
          sort?: number
        }
        Update: {
          choose_max?: number | null
          choose_min?: number | null
          id?: string
          menu_id?: string
          name?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_sections_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
        ]
      }
      menus: {
        Row: {
          created_at: string
          description: string
          final_numbers_days: number
          id: string
          kind: string
          listing_id: string | null
          max_guests: number | null
          min_guests: number | null
          name: string
          prep_requirements: string
          price: number | null
          pricing: string
          service_window_minutes: number | null
          serving_style: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          final_numbers_days?: number
          id?: string
          kind?: string
          listing_id?: string | null
          max_guests?: number | null
          min_guests?: number | null
          name: string
          prep_requirements?: string
          price?: number | null
          pricing?: string
          service_window_minutes?: number | null
          serving_style?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string
          final_numbers_days?: number
          id?: string
          kind?: string
          listing_id?: string | null
          max_guests?: number | null
          min_guests?: number | null
          name?: string
          prep_requirements?: string
          price?: number | null
          pricing?: string
          service_window_minutes?: number | null
          serving_style?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menus_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menus_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json
          body: string
          created_at: string
          from_provider: boolean
          id: string
          read_at: string | null
          sender_id: string | null
          sender_name: string
          thread_id: string
        }
        Insert: {
          attachments?: Json
          body: string
          created_at?: string
          from_provider?: boolean
          id?: string
          read_at?: string | null
          sender_id?: string | null
          sender_name: string
          thread_id: string
        }
        Update: {
          attachments?: Json
          body?: string
          created_at?: string
          from_provider?: boolean
          id?: string
          read_at?: string | null
          sender_id?: string | null
          sender_name?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          link: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          kind: string
          link?: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          link?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      packages: {
        Row: {
          add_ons: Json
          base_price: number
          booking_mode: string
          created_at: string
          currency: string
          deposit_pct: number
          description: string
          details: Json
          duration_hours: number | null
          id: string
          image: string
          inclusions: Json
          listing_id: string
          max_guests: number | null
          min_guests: number | null
          name: string
          price_basis: string
          space_ids: string[]
          status: string
          workspace_id: string
        }
        Insert: {
          add_ons?: Json
          base_price?: number
          booking_mode?: string
          created_at?: string
          currency?: string
          deposit_pct?: number
          description?: string
          details?: Json
          duration_hours?: number | null
          id?: string
          image?: string
          inclusions?: Json
          listing_id: string
          max_guests?: number | null
          min_guests?: number | null
          name: string
          price_basis?: string
          space_ids?: string[]
          status?: string
          workspace_id: string
        }
        Update: {
          add_ons?: Json
          base_price?: number
          booking_mode?: string
          created_at?: string
          currency?: string
          deposit_pct?: number
          description?: string
          details?: Json
          duration_hours?: number | null
          id?: string
          image?: string
          inclusions?: Json
          listing_id?: string
          max_guests?: number | null
          min_guests?: number | null
          name?: string
          price_basis?: string
          space_ids?: string[]
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packages_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_content: {
        Row: {
          clicks: number
          created_at: string
          id: string
          image: string
          kind: string
          partner_id: string
          signups: number
          title: string
        }
        Insert: {
          clicks?: number
          created_at?: string
          id?: string
          image?: string
          kind?: string
          partner_id: string
          signups?: number
          title: string
        }
        Update: {
          clicks?: number
          created_at?: string
          id?: string
          image?: string
          kind?: string
          partner_id?: string
          signups?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_content_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_earnings: {
        Row: {
          commission: number
          eligible_revenue: number
          id: string
          occurred_at: string
          partner_id: string
          referral_id: string | null
          statement_id: string | null
          status: string
        }
        Insert: {
          commission: number
          eligible_revenue: number
          id?: string
          occurred_at: string
          partner_id: string
          referral_id?: string | null
          statement_id?: string | null
          status?: string
        }
        Update: {
          commission?: number
          eligible_revenue?: number
          id?: string
          occurred_at?: string
          partner_id?: string
          referral_id?: string | null
          statement_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_earnings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_earnings_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "partner_referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_earnings_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "partner_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_referrals: {
        Row: {
          activated_at: string | null
          id: string
          kind: string
          name: string
          partner_id: string
          signed_up_at: string
          status: string
          workspace_id: string | null
        }
        Insert: {
          activated_at?: string | null
          id?: string
          kind: string
          name: string
          partner_id: string
          signed_up_at?: string
          status?: string
          workspace_id?: string | null
        }
        Update: {
          activated_at?: string | null
          id?: string
          kind?: string
          name?: string
          partner_id?: string
          signed_up_at?: string
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_referrals_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_referrals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_statements: {
        Row: {
          commission: number
          eligible_revenue: number
          id: string
          paid_at: string | null
          partner_id: string
          payout_due: string | null
          period_start: string
          reference: string | null
          status: string
        }
        Insert: {
          commission?: number
          eligible_revenue?: number
          id?: string
          paid_at?: string | null
          partner_id: string
          payout_due?: string | null
          period_start: string
          reference?: string | null
          status?: string
        }
        Update: {
          commission?: number
          eligible_revenue?: number
          id?: string
          paid_at?: string | null
          partner_id?: string
          payout_due?: string | null
          period_start?: string
          reference?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_statements_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          commission_basis: string
          commission_bps: number
          created_at: string
          details: Json
          earned: number
          eligible_revenue: number
          grade: number
          id: string
          kind: string
          logo: string
          name: string
          paid: number
          quality_score: number | null
          rate_locked: boolean
          referral_code: string | null
          referrals: number
          status: string
          user_id: string | null
        }
        Insert: {
          commission_basis?: string
          commission_bps?: number
          created_at?: string
          details?: Json
          earned?: number
          eligible_revenue?: number
          grade?: number
          id?: string
          kind: string
          logo?: string
          name: string
          paid?: number
          quality_score?: number | null
          rate_locked?: boolean
          referral_code?: string | null
          referrals?: number
          status?: string
          user_id?: string | null
        }
        Update: {
          commission_basis?: string
          commission_bps?: number
          created_at?: string
          details?: Json
          earned?: number
          eligible_revenue?: number
          grade?: number
          id?: string
          kind?: string
          logo?: string
          name?: string
          paid?: number
          quality_score?: number | null
          rate_locked?: boolean
          referral_code?: string | null
          referrals?: number
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      payment_orders: {
        Row: {
          amount_minor: number
          build_item_id: string | null
          commission: Json
          created_at: string
          currency: string
          customer_fee_minor: number
          description: string
          event_id: string | null
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          kind: string
          livemode: boolean | null
          payee_workspace_id: string | null
          payer_id: string | null
          platform_fee_minor: number
          protected: boolean
          reference: string
          refunded_minor: number
          release_eligible_at: string | null
          released_at: string | null
          standby_id: string | null
          status: string
          strategy: string
          stripe_charge: string | null
          stripe_checkout_session: string | null
          stripe_payment_intent: string | null
          stripe_transfer: string | null
          transferred_minor: number
          updated_at: string
        }
        Insert: {
          amount_minor: number
          build_item_id?: string | null
          commission?: Json
          created_at?: string
          currency?: string
          customer_fee_minor?: number
          description: string
          event_id?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          kind: string
          livemode?: boolean | null
          payee_workspace_id?: string | null
          payer_id?: string | null
          platform_fee_minor?: number
          protected?: boolean
          reference?: string
          refunded_minor?: number
          release_eligible_at?: string | null
          released_at?: string | null
          standby_id?: string | null
          status?: string
          strategy?: string
          stripe_charge?: string | null
          stripe_checkout_session?: string | null
          stripe_payment_intent?: string | null
          stripe_transfer?: string | null
          transferred_minor?: number
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          build_item_id?: string | null
          commission?: Json
          created_at?: string
          currency?: string
          customer_fee_minor?: number
          description?: string
          event_id?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          kind?: string
          livemode?: boolean | null
          payee_workspace_id?: string | null
          payer_id?: string | null
          platform_fee_minor?: number
          protected?: boolean
          reference?: string
          refunded_minor?: number
          release_eligible_at?: string | null
          released_at?: string | null
          standby_id?: string | null
          status?: string
          strategy?: string
          stripe_charge?: string | null
          stripe_checkout_session?: string | null
          stripe_payment_intent?: string | null
          stripe_transfer?: string | null
          transferred_minor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_orders_build_item_id_fkey"
            columns: ["build_item_id"]
            isOneToOne: false
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_payee_workspace_id_fkey"
            columns: ["payee_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_standby_id_fkey"
            columns: ["standby_id"]
            isOneToOne: false
            referencedRelation: "standby_commitments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          build_item_id: string | null
          created_at: string
          due_at: string | null
          event_id: string
          id: string
          kind: string
          paid_at: string | null
          payee: string
          refundable: boolean
          status: string
          stripe_payment_intent: string | null
        }
        Insert: {
          amount: number
          build_item_id?: string | null
          created_at?: string
          due_at?: string | null
          event_id: string
          id?: string
          kind: string
          paid_at?: string | null
          payee: string
          refundable?: boolean
          status?: string
          stripe_payment_intent?: string | null
        }
        Update: {
          amount?: number
          build_item_id?: string | null
          created_at?: string
          due_at?: string | null
          event_id?: string
          id?: string
          kind?: string
          paid_at?: string | null
          payee?: string
          refundable?: boolean
          status?: string
          stripe_payment_intent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_build_item_id_fkey"
            columns: ["build_item_id"]
            isOneToOne: false
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_entitlements: {
        Row: {
          capability: string
          kind: string
          plan: string
          updated_at: string
          value: Json
        }
        Insert: {
          capability: string
          kind: string
          plan: string
          updated_at?: string
          value: Json
        }
        Update: {
          capability?: string
          kind?: string
          plan?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          permissions: string[]
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          permissions?: string[]
          title?: string
          user_id: string
        }
        Update: {
          created_at?: string
          permissions?: string[]
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_charges: {
        Row: {
          amount: number
          created_at: string
          currency: string
          description: string
          event_id: string | null
          id: string
          kind: string
          metadata: Json
          settled_at: string | null
          status: string
          workspace_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          description: string
          event_id?: string | null
          id?: string
          kind: string
          metadata?: Json
          settled_at?: string | null
          status?: string
          workspace_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          description?: string
          event_id?: string | null
          id?: string
          kind?: string
          metadata?: Json
          settled_at?: string | null
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_charges_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_charges_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          approved_by: string | null
          change_reason: string
          created_at: string
          created_by: string | null
          effective_at: string | null
          id: string
          release: string | null
          section: string
          status: string
          summary: string
          value: Json
          version: number
        }
        Insert: {
          approved_by?: string | null
          change_reason?: string
          created_at?: string
          created_by?: string | null
          effective_at?: string | null
          id?: string
          release?: string | null
          section: string
          status?: string
          summary?: string
          value?: Json
          version: number
        }
        Update: {
          approved_by?: string | null
          change_reason?: string
          created_at?: string
          created_by?: string | null
          effective_at?: string | null
          id?: string
          release?: string | null
          section?: string
          status?: string
          summary?: string
          value?: Json
          version?: number
        }
        Relationships: []
      }
      portal_approvals: {
        Row: {
          amount: number | null
          build_item_id: string | null
          created_by: string | null
          decided_at: string | null
          decided_link: string | null
          decided_name: string | null
          decision_note: string
          detail: string
          due_at: string | null
          event_id: string
          id: string
          image: string
          items_count: number | null
          kind: string
          status: string
          submitted_at: string
          supplier: string
          title: string
        }
        Insert: {
          amount?: number | null
          build_item_id?: string | null
          created_by?: string | null
          decided_at?: string | null
          decided_link?: string | null
          decided_name?: string | null
          decision_note?: string
          detail?: string
          due_at?: string | null
          event_id: string
          id?: string
          image?: string
          items_count?: number | null
          kind?: string
          status?: string
          submitted_at?: string
          supplier?: string
          title: string
        }
        Update: {
          amount?: number | null
          build_item_id?: string | null
          created_by?: string | null
          decided_at?: string | null
          decided_link?: string | null
          decided_name?: string | null
          decision_note?: string
          detail?: string
          due_at?: string | null
          event_id?: string
          id?: string
          image?: string
          items_count?: number | null
          kind?: string
          status?: string
          submitted_at?: string
          supplier?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_approvals_build_item_id_fkey"
            columns: ["build_item_id"]
            isOneToOne: false
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_approvals_decided_link_fkey"
            columns: ["decided_link"]
            isOneToOne: false
            referencedRelation: "portal_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_approvals_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_documents: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          mime: string
          size_bytes: number | null
          tag: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          mime?: string
          size_bytes?: number | null
          tag?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          mime?: string
          size_bytes?: number | null
          tag?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_documents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_links: {
        Row: {
          client_email: string
          client_name: string
          created_at: string
          created_by: string | null
          event_id: string
          expires_at: string
          id: string
          last_opened_at: string | null
          open_count: number
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
        }
        Insert: {
          client_email?: string
          client_name: string
          created_at?: string
          created_by?: string | null
          event_id: string
          expires_at: string
          id?: string
          last_opened_at?: string | null
          open_count?: number
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
        }
        Update: {
          client_email?: string
          client_name?: string
          created_at?: string
          created_by?: string | null
          event_id?: string
          expires_at?: string
          id?: string
          last_opened_at?: string | null
          open_count?: number
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_messages: {
        Row: {
          author_avatar: string
          author_id: string | null
          author_name: string
          body: string
          created_at: string
          event_id: string
          from_client: boolean
          id: string
          link_id: string | null
          read_at: string | null
        }
        Insert: {
          author_avatar?: string
          author_id?: string | null
          author_name: string
          body: string
          created_at?: string
          event_id: string
          from_client?: boolean
          id?: string
          link_id?: string | null
          read_at?: string | null
        }
        Update: {
          author_avatar?: string
          author_id?: string | null
          author_name?: string
          body?: string
          created_at?: string
          event_id?: string
          from_client?: boolean
          id?: string
          link_id?: string | null
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_messages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
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
      privacy_requests: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          detail: string
          due_at: string
          extended_reason: string | null
          id: string
          kind: string
          outcome: string | null
          received_at: string
          reference: string
          refusal_reason: string | null
          requester_email: string
          status: string
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          detail?: string
          due_at?: string
          extended_reason?: string | null
          id?: string
          kind: string
          outcome?: string | null
          received_at?: string
          reference?: string
          refusal_reason?: string | null
          requester_email: string
          status?: string
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          detail?: string
          due_at?: string
          extended_reason?: string | null
          id?: string
          kind?: string
          outcome?: string | null
          received_at?: string
          reference?: string
          refusal_reason?: string | null
          requester_email?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string
          bio: string
          calendar_token: string | null
          country: string
          created_at: string
          currency: string
          date_of_birth: string | null
          deleted_at: string | null
          deletion_requested_at: string | null
          full_name: string
          home_area: string
          id: string
          identity_verified: boolean
          interests: string[]
          language: string
          last_active_at: string | null
          last_workspace_id: string | null
          marketing_opt_in: boolean
          marketing_opt_in_at: string | null
          notifications: Json
          onboarding_complete: boolean
          phone: string | null
          status: string
          stripe_customer_id: string | null
          terms_accepted_at: string | null
          terms_version: string | null
        }
        Insert: {
          avatar_url?: string
          bio?: string
          calendar_token?: string | null
          country?: string
          created_at?: string
          currency?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          deletion_requested_at?: string | null
          full_name?: string
          home_area?: string
          id: string
          identity_verified?: boolean
          interests?: string[]
          language?: string
          last_active_at?: string | null
          last_workspace_id?: string | null
          marketing_opt_in?: boolean
          marketing_opt_in_at?: string | null
          notifications?: Json
          onboarding_complete?: boolean
          phone?: string | null
          status?: string
          stripe_customer_id?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
        }
        Update: {
          avatar_url?: string
          bio?: string
          calendar_token?: string | null
          country?: string
          created_at?: string
          currency?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          deletion_requested_at?: string | null
          full_name?: string
          home_area?: string
          id?: string
          identity_verified?: boolean
          interests?: string[]
          language?: string
          last_active_at?: string | null
          last_workspace_id?: string | null
          marketing_opt_in?: boolean
          marketing_opt_in_at?: string | null
          notifications?: Json
          onboarding_complete?: boolean
          phone?: string | null
          status?: string
          stripe_customer_id?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_last_workspace_id_fkey"
            columns: ["last_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      programme_items: {
        Row: {
          area: string
          detail: string
          duration_minutes: number
          event_id: string
          id: string
          image: string
          kind: string
          owner_name: string
          starts_at: string
          status: string
          title: string
        }
        Insert: {
          area?: string
          detail?: string
          duration_minutes?: number
          event_id: string
          id?: string
          image?: string
          kind?: string
          owner_name?: string
          starts_at: string
          status?: string
          title: string
        }
        Update: {
          area?: string
          detail?: string
          duration_minutes?: number
          event_id?: string
          id?: string
          image?: string
          kind?: string
          owner_name?: string
          starts_at?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "programme_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      promoter_assets: {
        Row: {
          caption: string
          created_at: string
          event_id: string
          id: string
          image: string
          kind: string
          sort: number
          title: string
          url: string
        }
        Insert: {
          caption?: string
          created_at?: string
          event_id: string
          id?: string
          image?: string
          kind?: string
          sort?: number
          title: string
          url?: string
        }
        Update: {
          caption?: string
          created_at?: string
          event_id?: string
          id?: string
          image?: string
          kind?: string
          sort?: number
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "promoter_assets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      promoter_clicks: {
        Row: {
          asset_id: string | null
          channel: string
          created_at: string
          id: number
          promoter_id: string
          visitor_hash: string
        }
        Insert: {
          asset_id?: string | null
          channel?: string
          created_at?: string
          id?: never
          promoter_id: string
          visitor_hash: string
        }
        Update: {
          asset_id?: string | null
          channel?: string
          created_at?: string
          id?: never
          promoter_id?: string
          visitor_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "promoter_clicks_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "promoter_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promoter_clicks_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "promoters"
            referencedColumns: ["id"]
          },
        ]
      }
      promoter_payouts: {
        Row: {
          amount: number
          created_at: string
          id: string
          paid_at: string | null
          promoter_id: string
          reference: string | null
          scheduled_for: string
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          paid_at?: string | null
          promoter_id: string
          reference?: string | null
          scheduled_for: string
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          promoter_id?: string
          reference?: string | null
          scheduled_for?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "promoter_payouts_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "promoters"
            referencedColumns: ["id"]
          },
        ]
      }
      promoter_sales: {
        Row: {
          amount: number
          asset_id: string | null
          channel: string
          commission: number
          event_id: string
          id: string
          order_ref: string | null
          payout_id: string | null
          promoter_id: string
          quantity: number
          sold_at: string
          status: string
          tier_id: string | null
          tier_name: string
        }
        Insert: {
          amount: number
          asset_id?: string | null
          channel?: string
          commission: number
          event_id: string
          id?: string
          order_ref?: string | null
          payout_id?: string | null
          promoter_id: string
          quantity: number
          sold_at?: string
          status?: string
          tier_id?: string | null
          tier_name: string
        }
        Update: {
          amount?: number
          asset_id?: string | null
          channel?: string
          commission?: number
          event_id?: string
          id?: string
          order_ref?: string | null
          payout_id?: string | null
          promoter_id?: string
          quantity?: number
          sold_at?: string
          status?: string
          tier_id?: string | null
          tier_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "promoter_sales_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "promoter_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promoter_sales_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promoter_sales_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "promoters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promoter_sales_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      promoters: {
        Row: {
          clicks: number
          code: string
          commission_pct: number
          created_at: string
          email: string
          event_id: string
          id: string
          name: string
          payout_method: string | null
          revenue: number
          status: string
          ticket_allocation: number | null
          tickets_sold: number
          user_id: string | null
        }
        Insert: {
          clicks?: number
          code: string
          commission_pct?: number
          created_at?: string
          email?: string
          event_id: string
          id?: string
          name: string
          payout_method?: string | null
          revenue?: number
          status?: string
          ticket_allocation?: number | null
          tickets_sold?: number
          user_id?: string | null
        }
        Update: {
          clicks?: number
          code?: string
          commission_pct?: number
          created_at?: string
          email?: string
          event_id?: string
          id?: string
          name?: string
          payout_method?: string | null
          revenue?: number
          status?: string
          ticket_allocation?: number | null
          tickets_sold?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promoters_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_boosts: {
        Row: {
          amount_minor: number
          clicks: number
          created_at: string
          created_by: string | null
          currency: string
          ends_at: string
          event_id: string
          id: string
          impressions: number
          payment_order_id: string | null
          placement: string
          product_key: string
          starts_at: string
          status: string
          targeting: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount_minor: number
          clicks?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          ends_at: string
          event_id: string
          id?: string
          impressions?: number
          payment_order_id?: string | null
          placement: string
          product_key: string
          starts_at: string
          status?: string
          targeting?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount_minor?: number
          clicks?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          ends_at?: string
          event_id?: string
          id?: string
          impressions?: number
          payment_order_id?: string | null
          placement?: string
          product_key?: string
          starts_at?: string
          status?: string
          targeting?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_boosts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_boosts_payment_order_id_fkey"
            columns: ["payment_order_id"]
            isOneToOne: false
            referencedRelation: "payment_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_boosts_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "boost_products"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "promotion_boosts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          audience: string
          channel: string
          content: string
          cost: number
          est_reach: string
          event_id: string
          id: string
          metrics: Json
          scheduled_at: string | null
          sponsored: boolean
          status: string
          title: string
        }
        Insert: {
          audience?: string
          channel: string
          content?: string
          cost?: number
          est_reach?: string
          event_id: string
          id?: string
          metrics?: Json
          scheduled_at?: string | null
          sponsored?: boolean
          status?: string
          title: string
        }
        Update: {
          audience?: string
          channel?: string
          content?: string
          cost?: number
          est_reach?: string
          event_id?: string
          id?: string
          metrics?: Json
          scheduled_at?: string | null
          sponsored?: boolean
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_versions: {
        Row: {
          id: string
          issued_at: string
          issued_by: string | null
          proposal_id: string
          snapshot: Json
          version: number
        }
        Insert: {
          id?: string
          issued_at?: string
          issued_by?: string | null
          proposal_id: string
          snapshot: Json
          version: number
        }
        Update: {
          id?: string
          issued_at?: string
          issued_by?: string | null
          proposal_id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_versions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          acceptance: Json | null
          accepted_at: string | null
          client_name: string
          content: Json
          created_at: string
          deposit_pct: number
          deposit_status: string
          event_id: string | null
          id: string
          lead_id: string | null
          number: string
          share_token: string | null
          signature_status: string
          status: string
          subtotal: number
          tax: number
          title: string
          total: number
          valid_until: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          acceptance?: Json | null
          accepted_at?: string | null
          client_name: string
          content?: Json
          created_at?: string
          deposit_pct?: number
          deposit_status?: string
          event_id?: string | null
          id?: string
          lead_id?: string | null
          number: string
          share_token?: string | null
          signature_status?: string
          status?: string
          subtotal?: number
          tax?: number
          title: string
          total?: number
          valid_until?: string | null
          version?: number
          workspace_id: string
        }
        Update: {
          acceptance?: Json | null
          accepted_at?: string | null
          client_name?: string
          content?: Json
          created_at?: string
          deposit_pct?: number
          deposit_status?: string
          event_id?: string | null
          id?: string
          lead_id?: string | null
          number?: string
          share_token?: string | null
          signature_status?: string
          status?: string
          subtotal?: number
          tax?: number
          title?: string
          total?: number
          valid_until?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
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
      provider_checkins: {
        Row: {
          arrived_at: string | null
          build_item_id: string
          eta: string | null
          event_id: string
          expected_at: string | null
          id: string
          note: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          arrived_at?: string | null
          build_item_id: string
          eta?: string | null
          event_id: string
          expected_at?: string | null
          id?: string
          note?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          arrived_at?: string | null
          build_item_id?: string
          eta?: string | null
          event_id?: string
          expected_at?: string | null
          id?: string
          note?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_checkins_build_item_id_fkey"
            columns: ["build_item_id"]
            isOneToOne: true
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_checkins_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_documents: {
        Row: {
          created_at: string
          credential_key: string
          effective_from: string | null
          expires_on: string | null
          file_name: string
          file_path: string
          id: string
          issuing_organisation: string | null
          reference: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          uploaded_by: string | null
          verification_method: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          credential_key: string
          effective_from?: string | null
          expires_on?: string | null
          file_name?: string
          file_path: string
          id?: string
          issuing_organisation?: string | null
          reference?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          uploaded_by?: string | null
          verification_method?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          credential_key?: string
          effective_from?: string | null
          expires_on?: string | null
          file_name?: string
          file_path?: string
          id?: string
          issuing_organisation?: string | null
          reference?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          uploaded_by?: string | null
          verification_method?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_documents_credential_key_fkey"
            columns: ["credential_key"]
            isOneToOne: false
            referencedRelation: "credential_types"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "provider_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_jobs: {
        Row: {
          build_item_id: string | null
          client_email: string
          client_name: string
          client_org: string
          commercial_snapshot: Json
          created_at: string
          created_by: string | null
          currency: string
          details: Json
          ends_at: string
          event_id: string | null
          event_name: string
          event_type: string
          guests: number | null
          id: string
          image: string
          layout: string
          listing_id: string | null
          location: string
          mode: string
          net_payout: number
          next_action: string
          next_action_due: string | null
          package_id: string | null
          paid_amount: number
          payment_status: string
          platform_fee: number
          reference: string
          role: string
          source: string
          space_id: string | null
          starts_at: string
          status: string
          value: number
          workspace_id: string
        }
        Insert: {
          build_item_id?: string | null
          client_email?: string
          client_name: string
          client_org?: string
          commercial_snapshot?: Json
          created_at?: string
          created_by?: string | null
          currency?: string
          details?: Json
          ends_at: string
          event_id?: string | null
          event_name: string
          event_type?: string
          guests?: number | null
          id?: string
          image?: string
          layout?: string
          listing_id?: string | null
          location?: string
          mode?: string
          net_payout?: number
          next_action?: string
          next_action_due?: string | null
          package_id?: string | null
          paid_amount?: number
          payment_status?: string
          platform_fee?: number
          reference: string
          role?: string
          source?: string
          space_id?: string | null
          starts_at: string
          status?: string
          value?: number
          workspace_id: string
        }
        Update: {
          build_item_id?: string | null
          client_email?: string
          client_name?: string
          client_org?: string
          commercial_snapshot?: Json
          created_at?: string
          created_by?: string | null
          currency?: string
          details?: Json
          ends_at?: string
          event_id?: string | null
          event_name?: string
          event_type?: string
          guests?: number | null
          id?: string
          image?: string
          layout?: string
          listing_id?: string | null
          location?: string
          mode?: string
          net_payout?: number
          next_action?: string
          next_action_due?: string | null
          package_id?: string | null
          paid_amount?: number
          payment_status?: string
          platform_fee?: number
          reference?: string
          role?: string
          source?: string
          space_id?: string | null
          starts_at?: string
          status?: string
          value?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_jobs_build_item_id_fkey"
            columns: ["build_item_id"]
            isOneToOne: true
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_jobs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_jobs_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_jobs_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_jobs_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_quotes: {
        Row: {
          build_item_id: string
          created_at: string
          created_by: string | null
          currency: string
          deposit_pct: number
          id: string
          items: Json
          message: string
          reference: string
          sent_at: string | null
          status: string
          subtotal: number
          tax: number
          terms: Json
          total: number
          valid_until: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          build_item_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deposit_pct?: number
          id?: string
          items?: Json
          message?: string
          reference: string
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax?: number
          terms?: Json
          total?: number
          valid_until?: string | null
          version: number
          workspace_id: string
        }
        Update: {
          build_item_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deposit_pct?: number
          id?: string
          items?: Json
          message?: string
          reference?: string
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax?: number
          terms?: Json
          total?: number
          valid_until?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_quotes_build_item_id_fkey"
            columns: ["build_item_id"]
            isOneToOne: false
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_quotes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_requests: {
        Row: {
          budget_max: number | null
          budget_min: number | null
          category: string
          created_at: string
          created_by: string
          emergency: boolean
          event_id: string
          hold_hours: number | null
          hold_strategy: string
          id: string
          reference: string | null
          requirements: Json
          response_deadline: string | null
          response_hours: number
          scope: string
          status: string
          title: string
        }
        Insert: {
          budget_max?: number | null
          budget_min?: number | null
          category: string
          created_at?: string
          created_by: string
          emergency?: boolean
          event_id: string
          hold_hours?: number | null
          hold_strategy?: string
          id?: string
          reference?: string | null
          requirements?: Json
          response_deadline?: string | null
          response_hours?: number
          scope?: string
          status?: string
          title: string
        }
        Update: {
          budget_max?: number | null
          budget_min?: number | null
          category?: string
          created_at?: string
          created_by?: string
          emergency?: boolean
          event_id?: string
          hold_hours?: number | null
          hold_strategy?: string
          id?: string
          reference?: string | null
          requirements?: Json
          response_deadline?: string | null
          response_hours?: number
          scope?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits?: number
          key: string
          window_start?: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      recently_viewed: {
        Row: {
          item_key: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          item_key: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          item_key?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: []
      }
      reliability_metrics: {
        Row: {
          bookings_completed: number
          bookings_confirmed: number
          computed_at: string
          disputes: number
          median_response_minutes: number | null
          no_shows: number
          provider_cancellations: number
          quotes_sent: number
          requests_received: number
          requests_responded: number
          verified_rating: number | null
          verified_reviews: number
          window_days: number
          workspace_id: string
        }
        Insert: {
          bookings_completed?: number
          bookings_confirmed?: number
          computed_at?: string
          disputes?: number
          median_response_minutes?: number | null
          no_shows?: number
          provider_cancellations?: number
          quotes_sent?: number
          requests_received?: number
          requests_responded?: number
          verified_rating?: number | null
          verified_reviews?: number
          window_days?: number
          workspace_id: string
        }
        Update: {
          bookings_completed?: number
          bookings_confirmed?: number
          computed_at?: string
          disputes?: number
          median_response_minutes?: number | null
          no_shows?: number
          provider_cancellations?: number
          quotes_sent?: number
          requests_received?: number
          requests_responded?: number
          verified_rating?: number | null
          verified_reviews?: number
          window_days?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reliability_metrics_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      resale_holds: {
        Row: {
          expires_at: string
          ticket_id: string
          token: string
        }
        Insert: {
          expires_at: string
          ticket_id: string
          token: string
        }
        Update: {
          expires_at?: string
          ticket_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "resale_holds_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      resale_payouts: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_ref: string
          seller_id: string | null
          status: string
          ticket_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_ref: string
          seller_id?: string | null
          status?: string
          ticket_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_ref?: string
          seller_id?: string | null
          status?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resale_payouts_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string
          build_item_id: string | null
          created_at: string
          id: string
          listing_id: string | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          photos: string[]
          provider_response: string | null
          rating: number
          ratings: Json
          responded_at: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          body?: string
          build_item_id?: string | null
          created_at?: string
          id?: string
          listing_id?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          photos?: string[]
          provider_response?: string | null
          rating: number
          ratings?: Json
          responded_at?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          body?: string
          build_item_id?: string | null
          created_at?: string
          id?: string
          listing_id?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          photos?: string[]
          provider_response?: string | null
          rating?: number
          ratings?: Json
          responded_at?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_build_item_id_fkey"
            columns: ["build_item_id"]
            isOneToOne: true
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission: string
          role: string
          workspace_kind: string
        }
        Insert: {
          permission: string
          role: string
          workspace_kind: string
        }
        Update: {
          permission?: string
          role?: string
          workspace_kind?: string
        }
        Relationships: []
      }
      saved_items: {
        Row: {
          created_at: string
          item_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          item_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          item_key?: string
          user_id?: string
        }
        Relationships: []
      }
      shifts: {
        Row: {
          crew_id: string | null
          ends_at: string
          event_id: string | null
          headcount: number
          id: string
          job_id: string | null
          location: string
          role: string
          starts_at: string
          status: string
          title: string
          workspace_id: string
        }
        Insert: {
          crew_id?: string | null
          ends_at: string
          event_id?: string | null
          headcount?: number
          id?: string
          job_id?: string | null
          location?: string
          role: string
          starts_at: string
          status?: string
          title?: string
          workspace_id: string
        }
        Update: {
          crew_id?: string | null
          ends_at?: string
          event_id?: string | null
          headcount?: number
          id?: string
          job_id?: string | null
          location?: string
          role?: string
          starts_at?: string
          status?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "provider_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_links: {
        Row: {
          created_at: string
          kind: string
          space_a: string
          space_b: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          kind: string
          space_a: string
          space_b: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          kind?: string
          space_a?: string
          space_b?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_links_space_a_fkey"
            columns: ["space_a"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_links_space_b_fkey"
            columns: ["space_b"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          amenities: string[]
          area_sqm: number | null
          capacity_seated: number | null
          capacity_standing: number | null
          created_at: string
          details: Json
          exclusive_group: string | null
          id: string
          image: string
          indoor: boolean
          layouts: Json
          min_hours: number
          name: string
          rate_hourly: number | null
          status: string
          turnaround_minutes: number
          venue_id: string
          workspace_id: string
        }
        Insert: {
          amenities?: string[]
          area_sqm?: number | null
          capacity_seated?: number | null
          capacity_standing?: number | null
          created_at?: string
          details?: Json
          exclusive_group?: string | null
          id?: string
          image?: string
          indoor?: boolean
          layouts?: Json
          min_hours?: number
          name: string
          rate_hourly?: number | null
          status?: string
          turnaround_minutes?: number
          venue_id: string
          workspace_id: string
        }
        Update: {
          amenities?: string[]
          area_sqm?: number | null
          capacity_seated?: number | null
          capacity_standing?: number | null
          created_at?: string
          details?: Json
          exclusive_group?: string | null
          id?: string
          image?: string
          indoor?: boolean
          layouts?: Json
          min_hours?: number
          name?: string
          rate_hourly?: number | null
          status?: string
          turnaround_minutes?: number
          venue_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spaces_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spaces_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      standby_commitments: {
        Row: {
          activated_at: string | null
          activation_price: number | null
          activation_reason: string | null
          build_item_id: string
          cancellation_terms: string
          created_at: string
          currency: string
          event_id: string
          expires_at: string | null
          fee_payment_ref: string | null
          fee_status: string
          id: string
          listing_id: string
          organizer_note: string
          primary_item_id: string | null
          requested_by: string | null
          standby_fee: number | null
          status: string
          updated_at: string
          window_end: string
          window_start: string
          workspace_id: string
        }
        Insert: {
          activated_at?: string | null
          activation_price?: number | null
          activation_reason?: string | null
          build_item_id: string
          cancellation_terms?: string
          created_at?: string
          currency?: string
          event_id: string
          expires_at?: string | null
          fee_payment_ref?: string | null
          fee_status?: string
          id?: string
          listing_id: string
          organizer_note?: string
          primary_item_id?: string | null
          requested_by?: string | null
          standby_fee?: number | null
          status?: string
          updated_at?: string
          window_end: string
          window_start: string
          workspace_id: string
        }
        Update: {
          activated_at?: string | null
          activation_price?: number | null
          activation_reason?: string | null
          build_item_id?: string
          cancellation_terms?: string
          created_at?: string
          currency?: string
          event_id?: string
          expires_at?: string | null
          fee_payment_ref?: string | null
          fee_status?: string
          id?: string
          listing_id?: string
          organizer_note?: string
          primary_item_id?: string | null
          requested_by?: string | null
          standby_fee?: number | null
          status?: string
          updated_at?: string
          window_end?: string
          window_start?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "standby_commitments_build_item_id_fkey"
            columns: ["build_item_id"]
            isOneToOne: false
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standby_commitments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standby_commitments_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standby_commitments_primary_item_id_fkey"
            columns: ["primary_item_id"]
            isOneToOne: false
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standby_commitments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      state_machines: {
        Row: {
          column_name: string
          initial_states: string[]
          machine: string
          mode: string
          table_name: string
          terminal_states: string[]
        }
        Insert: {
          column_name: string
          initial_states?: string[]
          machine: string
          mode: string
          table_name: string
          terminal_states?: string[]
        }
        Update: {
          column_name?: string
          initial_states?: string[]
          machine?: string
          mode?: string
          table_name?: string
          terminal_states?: string[]
        }
        Relationships: []
      }
      state_transitions: {
        Row: {
          from_state: string
          machine: string
          to_state: string
        }
        Insert: {
          from_state: string
          machine: string
          to_state: string
        }
        Update: {
          from_state?: string
          machine?: string
          to_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "state_transitions_machine_fkey"
            columns: ["machine"]
            isOneToOne: false
            referencedRelation: "state_machines"
            referencedColumns: ["machine"]
          },
        ]
      }
      state_violations: {
        Row: {
          actor_id: string | null
          from_state: string | null
          id: number
          machine: string
          occurred_at: string
          row_id: string | null
          table_name: string
          to_state: string | null
        }
        Insert: {
          actor_id?: string | null
          from_state?: string | null
          id?: never
          machine: string
          occurred_at?: string
          row_id?: string | null
          table_name: string
          to_state?: string | null
        }
        Update: {
          actor_id?: string | null
          from_state?: string | null
          id?: never
          machine?: string
          occurred_at?: string
          row_id?: string | null
          table_name?: string
          to_state?: string | null
        }
        Relationships: []
      }
      storage_attribution: {
        Row: {
          bucket: string
          created_at: string
          name: string
          scan_detail: string | null
          scan_status: string
          scanned_at: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          bucket: string
          created_at?: string
          name: string
          scan_detail?: string | null
          scan_status?: string
          scanned_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          bucket?: string
          created_at?: string
          name?: string
          scan_detail?: string | null
          scan_status?: string
          scanned_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storage_attribution_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_backups: {
        Row: {
          backed_up_at: string
          bucket: string
          name: string
          object_updated_at: string | null
          r2_etag: string | null
          size: number | null
          source_deleted_at: string | null
        }
        Insert: {
          backed_up_at?: string
          bucket: string
          name: string
          object_updated_at?: string | null
          r2_etag?: string | null
          size?: number | null
          source_deleted_at?: string | null
        }
        Update: {
          backed_up_at?: string
          bucket?: string
          name?: string
          object_updated_at?: string | null
          r2_etag?: string | null
          size?: number | null
          source_deleted_at?: string | null
        }
        Relationships: []
      }
      stripe_disputes: {
        Row: {
          amount_minor: number
          build_item_id: string | null
          charge_id: string | null
          created_at: string
          currency: string
          event_id: string | null
          evidence_due_by: string | null
          evidence_submitted_at: string | null
          is_charge_refundable: boolean | null
          livemode: boolean
          order_ref: string | null
          outcome: string | null
          payment_intent_id: string | null
          reason: string | null
          status: string
          stripe_dispute_id: string
          updated_at: string
        }
        Insert: {
          amount_minor: number
          build_item_id?: string | null
          charge_id?: string | null
          created_at?: string
          currency: string
          event_id?: string | null
          evidence_due_by?: string | null
          evidence_submitted_at?: string | null
          is_charge_refundable?: boolean | null
          livemode?: boolean
          order_ref?: string | null
          outcome?: string | null
          payment_intent_id?: string | null
          reason?: string | null
          status: string
          stripe_dispute_id: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          build_item_id?: string | null
          charge_id?: string | null
          created_at?: string
          currency?: string
          event_id?: string | null
          evidence_due_by?: string | null
          evidence_submitted_at?: string | null
          is_charge_refundable?: boolean | null
          livemode?: boolean
          order_ref?: string | null
          outcome?: string | null
          payment_intent_id?: string | null
          reason?: string | null
          status?: string
          stripe_dispute_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_disputes_build_item_id_fkey"
            columns: ["build_item_id"]
            isOneToOne: false
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_disputes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      support_cases: {
        Row: {
          amount: number | null
          assignee_id: string | null
          assignee_name: string
          category: string
          created_at: string
          id: string
          outcome: string | null
          priority: string
          reference: string
          related: Json
          requester_id: string | null
          requester_name: string
          resolution_reason: string | null
          resolved_at: string | null
          sla_due_at: string | null
          status: string
          subject: string
          workspace_id: string | null
        }
        Insert: {
          amount?: number | null
          assignee_id?: string | null
          assignee_name?: string
          category: string
          created_at?: string
          id?: string
          outcome?: string | null
          priority?: string
          reference: string
          related?: Json
          requester_id?: string | null
          requester_name?: string
          resolution_reason?: string | null
          resolved_at?: string | null
          sla_due_at?: string | null
          status?: string
          subject: string
          workspace_id?: string | null
        }
        Update: {
          amount?: number | null
          assignee_id?: string | null
          assignee_name?: string
          category?: string
          created_at?: string
          id?: string
          outcome?: string | null
          priority?: string
          reference?: string
          related?: Json
          requester_id?: string | null
          requester_name?: string
          resolution_reason?: string | null
          resolved_at?: string | null
          sla_due_at?: string | null
          status?: string
          subject?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_cases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          author: string
          author_id: string | null
          body: string
          case_id: string
          created_at: string
          id: number
          internal: boolean
          role: string
        }
        Insert: {
          author: string
          author_id?: string | null
          body: string
          case_id: string
          created_at?: string
          id?: never
          internal?: boolean
          role?: string
        }
        Update: {
          author?: string
          author_id?: string | null
          body?: string
          case_id?: string
          created_at?: string
          id?: never
          internal?: boolean
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "support_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_name: string
          category: string
          created_at: string
          detail: string
          due_at: string | null
          event_id: string | null
          id: string
          milestone: boolean
          owner_id: string | null
          priority: string
          status: string
          title: string
          workspace_id: string | null
        }
        Insert: {
          assignee_name?: string
          category?: string
          created_at?: string
          detail?: string
          due_at?: string | null
          event_id?: string | null
          id?: string
          milestone?: boolean
          owner_id?: string | null
          priority?: string
          status?: string
          title: string
          workspace_id?: string | null
        }
        Update: {
          assignee_name?: string
          category?: string
          created_at?: string
          detail?: string
          due_at?: string | null
          event_id?: string | null
          id?: string
          milestone?: boolean
          owner_id?: string | null
          priority?: string
          status?: string
          title?: string
          workspace_id?: string | null
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
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      template_creator_restrictions: {
        Row: {
          created_at: string
          created_by: string | null
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      template_reports: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          detail: string
          id: string
          reason: string
          reporter_id: string | null
          status: string
          template_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          detail?: string
          id?: string
          reason: string
          reporter_id?: string | null
          status?: string
          template_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          detail?: string
          id?: string
          reason?: string
          reporter_id?: string | null
          status?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_reports_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "design_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_saves: {
        Row: {
          created_at: string
          template_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          template_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_saves_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "design_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          build_item_id: string | null
          event_id: string
          id: string
          image: string
          kind: string
          listing_id: string | null
          response_due_at: string | null
          subtitle: string
          title: string
          updated_at: string
        }
        Insert: {
          build_item_id?: string | null
          event_id: string
          id?: string
          image?: string
          kind?: string
          listing_id?: string | null
          response_due_at?: string | null
          subtitle?: string
          title: string
          updated_at?: string
        }
        Update: {
          build_item_id?: string | null
          event_id?: string
          id?: string
          image?: string
          kind?: string
          listing_id?: string | null
          response_due_at?: string | null
          subtitle?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "threads_build_item_id_fkey"
            columns: ["build_item_id"]
            isOneToOne: false
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_holds: {
        Row: {
          created_at: string
          event_id: string
          expires_at: string
          qty: number
          tier_id: string
          token: string
        }
        Insert: {
          created_at?: string
          event_id: string
          expires_at: string
          qty: number
          tier_id: string
          token: string
        }
        Update: {
          created_at?: string
          event_id?: string
          expires_at?: string
          qty?: number
          tier_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_holds_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_holds_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_tiers: {
        Row: {
          after_tier: string | null
          allocation: string
          badge: string | null
          color: string
          description: string
          event_id: string
          held: number
          id: string
          image: string | null
          kind: string
          name: string
          order_limit: number
          price: number
          quantity: number
          release_name: string
          sale_end: string | null
          sale_start: string | null
          sold: number
          sort: number
          status: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          after_tier?: string | null
          allocation?: string
          badge?: string | null
          color?: string
          description?: string
          event_id: string
          held?: number
          id?: string
          image?: string | null
          kind?: string
          name: string
          order_limit?: number
          price?: number
          quantity: number
          release_name?: string
          sale_end?: string | null
          sale_start?: string | null
          sold?: number
          sort?: number
          status?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          after_tier?: string | null
          allocation?: string
          badge?: string | null
          color?: string
          description?: string
          event_id?: string
          held?: number
          id?: string
          image?: string | null
          kind?: string
          name?: string
          order_limit?: number
          price?: number
          quantity?: number
          release_name?: string
          sale_end?: string | null
          sale_start?: string | null
          sold?: number
          sort?: number
          status?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_tiers_after_tier_fkey"
            columns: ["after_tier"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_transfers: {
        Row: {
          created_at: string
          decided_at: string | null
          expires_at: string
          from_user: string
          id: string
          new_ticket_id: string | null
          status: string
          ticket_id: string
          to_email: string
          to_name: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          expires_at?: string
          from_user: string
          id?: string
          new_ticket_id?: string | null
          status?: string
          ticket_id: string
          to_email: string
          to_name?: string
          token_hash: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          expires_at?: string
          from_user?: string
          id?: string
          new_ticket_id?: string | null
          status?: string
          ticket_id?: string
          to_email?: string
          to_name?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_transfers_new_ticket_id_fkey"
            columns: ["new_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_transfers_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_waitlist: {
        Row: {
          accessibility_needs: string | null
          created_at: string
          event_id: string
          id: string
          notified_at: string | null
          offer_expires_at: string | null
          offer_tier_id: string | null
          quantity: number
          status: string
          tier_id: string | null
          user_id: string
        }
        Insert: {
          accessibility_needs?: string | null
          created_at?: string
          event_id: string
          id?: string
          notified_at?: string | null
          offer_expires_at?: string | null
          offer_tier_id?: string | null
          quantity?: number
          status?: string
          tier_id?: string | null
          user_id: string
        }
        Update: {
          accessibility_needs?: string | null
          created_at?: string
          event_id?: string
          id?: string
          notified_at?: string | null
          offer_expires_at?: string | null
          offer_tier_id?: string | null
          quantity?: number
          status?: string
          tier_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_waitlist_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_waitlist_offer_tier_id_fkey"
            columns: ["offer_tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_waitlist_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          attendee_email: string
          attendee_name: string
          checked_in_at: string | null
          code: string
          created_at: string
          event_id: string
          holder_id: string | null
          id: string
          order_ref: string
          price_paid: number
          qr_nonce: string
          replaced_by: string | null
          seat: string | null
          status: string
          tier_id: string
        }
        Insert: {
          attendee_email?: string
          attendee_name?: string
          checked_in_at?: string | null
          code: string
          created_at?: string
          event_id: string
          holder_id?: string | null
          id?: string
          order_ref: string
          price_paid?: number
          qr_nonce?: string
          replaced_by?: string | null
          seat?: string | null
          status?: string
          tier_id: string
        }
        Update: {
          attendee_email?: string
          attendee_name?: string
          checked_in_at?: string | null
          code?: string
          created_at?: string
          event_id?: string
          holder_id?: string | null
          id?: string
          order_ref?: string
          price_paid?: number
          qr_nonce?: string
          replaced_by?: string | null
          seat?: string | null
          status?: string
          tier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category: string
          counterparty: string
          created_at: string
          currency: string
          description: string
          details: Json
          event_id: string | null
          fee_amount: number
          id: string
          kind: string
          net_amount: number | null
          occurred_at: string
          source: string
          source_id: string | null
          source_type: string
          status: string
          stripe_ref: string | null
          workspace_id: string | null
        }
        Insert: {
          amount: number
          category?: string
          counterparty?: string
          created_at?: string
          currency?: string
          description: string
          details?: Json
          event_id?: string | null
          fee_amount?: number
          id?: string
          kind: string
          net_amount?: number | null
          occurred_at?: string
          source?: string
          source_id?: string | null
          source_type?: string
          status?: string
          stripe_ref?: string | null
          workspace_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          counterparty?: string
          created_at?: string
          currency?: string
          description?: string
          details?: Json
          event_id?: string | null
          fee_amount?: number
          id?: string
          kind?: string
          net_amount?: number | null
          occurred_at?: string
          source?: string
          source_id?: string | null
          source_type?: string
          status?: string
          stripe_ref?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      trust_cases: {
        Row: {
          assignee_id: string | null
          assignee_name: string
          category: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision: string | null
          evidence: Json
          id: string
          queue: string
          reason: string
          reference: string
          related: Json
          risk_score: number
          status: string
          subject_id: string | null
          subject_name: string
          subject_type: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          assignee_name?: string
          category?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          evidence?: Json
          id?: string
          queue: string
          reason: string
          reference: string
          related?: Json
          risk_score?: number
          status?: string
          subject_id?: string | null
          subject_name: string
          subject_type: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          assignee_name?: string
          category?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          evidence?: Json
          id?: string
          queue?: string
          reason?: string
          reference?: string
          related?: Json
          risk_score?: number
          status?: string
          subject_id?: string | null
          subject_name?: string
          subject_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      uploaded_fonts: {
        Row: {
          created_at: string
          created_by: string | null
          family: string
          id: string
          licence_acknowledged: boolean
          path: string
          style: string
          weight: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          family: string
          id?: string
          licence_acknowledged: boolean
          path: string
          style?: string
          weight?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          family?: string
          id?: string
          licence_acknowledged?: boolean
          path?: string
          style?: string
          weight?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uploaded_fonts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_tasks: {
        Row: {
          complete: boolean
          created_at: string
          id: string
          title: string
          user_id: string
        }
        Insert: {
          complete?: boolean
          created_at?: string
          id?: string
          title: string
          user_id: string
        }
        Update: {
          complete?: boolean
          created_at?: string
          id?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      user_tours: {
        Row: {
          status: string
          step: number
          tour_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          status?: string
          step?: number
          tour_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          status?: string
          step?: number
          tour_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      venue_alternatives: {
        Row: {
          build_item_id: string
          created_at: string
          created_by: string | null
          decided_at: string | null
          ends_at: string | null
          event_id: string
          id: string
          kind: string
          note: string
          price: number | null
          space_id: string | null
          starts_at: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          build_item_id: string
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          ends_at?: string | null
          event_id: string
          id?: string
          kind: string
          note?: string
          price?: number | null
          space_id?: string | null
          starts_at?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          build_item_id?: string
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          ends_at?: string | null
          event_id?: string
          id?: string
          kind?: string
          note?: string
          price?: number | null
          space_id?: string | null
          starts_at?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_alternatives_build_item_id_fkey"
            columns: ["build_item_id"]
            isOneToOne: false
            referencedRelation: "build_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_alternatives_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_alternatives_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_alternatives_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_maps: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          overlay: Json
          status: string
          structure: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          overlay?: Json
          status?: string
          structure?: Json
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          overlay?: Json
          status?: string
          structure?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "venue_maps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_rate_cards: {
        Row: {
          active: boolean
          amount: number
          bar_min: number | null
          catering_min: number | null
          created_at: string
          days_of_week: number[]
          fees: Json
          id: string
          min_hours: number | null
          min_spend: number | null
          model: string
          name: string
          peak: boolean
          per_person: number | null
          priority: number
          season_from: string | null
          season_to: string | null
          space_id: string | null
          time_from: string | null
          time_to: string | null
          updated_at: string
          venue_id: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          amount?: number
          bar_min?: number | null
          catering_min?: number | null
          created_at?: string
          days_of_week?: number[]
          fees?: Json
          id?: string
          min_hours?: number | null
          min_spend?: number | null
          model: string
          name: string
          peak?: boolean
          per_person?: number | null
          priority?: number
          season_from?: string | null
          season_to?: string | null
          space_id?: string | null
          time_from?: string | null
          time_to?: string | null
          updated_at?: string
          venue_id: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          amount?: number
          bar_min?: number | null
          catering_min?: number | null
          created_at?: string
          days_of_week?: number[]
          fees?: Json
          id?: string
          min_hours?: number | null
          min_spend?: number | null
          model?: string
          name?: string
          peak?: boolean
          per_person?: number | null
          priority?: number
          season_from?: string | null
          season_to?: string | null
          space_id?: string | null
          time_from?: string | null
          time_to?: string | null
          updated_at?: string
          venue_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_rate_cards_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_rate_cards_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_rate_cards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_structures: {
        Row: {
          created_at: string
          created_by: string | null
          elements: Json
          id: string
          published_at: string | null
          status: string
          venue_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          elements?: Json
          id?: string
          published_at?: string | null
          status?: string
          venue_id: string
          version: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          elements?: Json
          id?: string
          published_at?: string | null
          status?: string
          venue_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_structures_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_structures_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_records: {
        Row: {
          created_at: string
          decided_by: string | null
          evidence: Json
          id: string
          kind: string
          scope: string
          status: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          decided_by?: string | null
          evidence?: Json
          id?: string
          kind: string
          scope: string
          status: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          decided_by?: string | null
          evidence?: Json
          id?: string
          kind?: string
          scope?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          endpoint_id: string
          event_id: string
          event_type: string
          id: string
          lease_until: string | null
          next_attempt_at: string
          payload: Json
          response_snippet: string | null
          response_status: number | null
          status: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id: string
          event_id: string
          event_type: string
          id?: string
          lease_until?: string | null
          next_attempt_at?: string
          payload: Json
          response_snippet?: string | null
          response_status?: number | null
          status?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id?: string
          event_id?: string
          event_type?: string
          id?: string
          lease_until?: string | null
          next_attempt_at?: string
          payload?: Json
          response_snippet?: string | null
          response_status?: number | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          consecutive_failures: number
          created_at: string
          created_by: string | null
          description: string
          disabled_reason: string | null
          events: string[]
          first_failure_at: string | null
          id: string
          secret: string
          status: string
          url: string
          workspace_id: string
        }
        Insert: {
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          description?: string
          disabled_reason?: string | null
          events: string[]
          first_failure_at?: string | null
          id?: string
          secret: string
          status?: string
          url: string
          workspace_id: string
        }
        Update: {
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          description?: string
          disabled_reason?: string | null
          events?: string[]
          first_failure_at?: string | null
          id?: string
          secret?: string
          status?: string
          url?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          attempts: number
          correlation_id: string | null
          error: string | null
          event_type: string
          external_id: string
          id: number
          livemode: boolean | null
          processed_at: string | null
          provider: string
          received_at: string
          status: string
        }
        Insert: {
          attempts?: number
          correlation_id?: string | null
          error?: string | null
          event_type: string
          external_id: string
          id?: never
          livemode?: boolean | null
          processed_at?: string | null
          provider: string
          received_at?: string
          status?: string
        }
        Update: {
          attempts?: number
          correlation_id?: string | null
          error?: string | null
          event_type?: string
          external_id?: string
          id?: never
          livemode?: boolean | null
          processed_at?: string | null
          provider?: string
          received_at?: string
          status?: string
        }
        Relationships: []
      }
      workspace_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          declined_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          revoked_at: string | null
          role: string
          token_hash: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          declined_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role?: string
          token_hash: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          declined_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role?: string
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
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
          role: string
          status: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          status?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: string
          status?: string
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
      workspaces: {
        Row: {
          capabilities: string[]
          commission_bps: number
          commission_custom: boolean
          cover_image: string
          created_at: string
          id: string
          kind: string
          name: string
          onboarding_complete: boolean
          onboarding_step: string
          owner_id: string
          payout_status: string
          plan: string
          settings: Json
          status: string
          stripe_account_id: string | null
          verification_status: string
        }
        Insert: {
          capabilities?: string[]
          commission_bps?: number
          commission_custom?: boolean
          cover_image?: string
          created_at?: string
          id?: string
          kind: string
          name: string
          onboarding_complete?: boolean
          onboarding_step?: string
          owner_id: string
          payout_status?: string
          plan?: string
          settings?: Json
          status?: string
          stripe_account_id?: string | null
          verification_status?: string
        }
        Update: {
          capabilities?: string[]
          commission_bps?: number
          commission_custom?: boolean
          cover_image?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
          onboarding_complete?: boolean
          onboarding_step?: string
          owner_id?: string
          payout_status?: string
          plan?: string
          settings?: Json
          status?: string
          stripe_account_id?: string | null
          verification_status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_dispute_resolution: {
        Args: { p_dispute: string }
        Returns: string
      }
      accept_emergency_candidate: {
        Args: { p_candidate: string }
        Returns: string
      }
      accept_proposal: {
        Args: {
          p_email: string
          p_name: string
          p_token: string
          p_version: number
        }
        Returns: string
      }
      accept_standby: { Args: { p_standby: string }; Returns: string }
      accept_ticket_transfer: {
        Args: { p_token_hash: string }
        Returns: string
      }
      activate_standby: {
        Args: { p_reason: string; p_standby: string }
        Returns: undefined
      }
      active_boosts: {
        Args: {
          p_category?: string
          p_city?: string
          p_limit?: number
          p_placement: string
        }
        Returns: {
          boost_id: string
          event_id: string
          placement: string
        }[]
      }
      add_design_comment: {
        Args: {
          p_body: string
          p_design: string
          p_layer?: string
          p_page?: string
          p_parent?: string
          p_x?: number
          p_y?: number
        }
        Returns: string
      }
      add_dispute_entry: {
        Args: {
          p_body: string
          p_dispute: string
          p_files?: Json
          p_kind: string
        }
        Returns: undefined
      }
      admin_actor_name: { Args: never; Returns: string }
      admin_add_note: {
        Args: { p_body: string; p_entity: string; p_entity_type: string }
        Returns: number
      }
      admin_add_record_note: {
        Args: { p_body: string; p_subject: string; p_subject_type: string }
        Returns: number
      }
      admin_assign_case: { Args: { p_case: string }; Returns: undefined }
      admin_assign_trust: { Args: { p_case: string }; Returns: undefined }
      admin_break_glass_report: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      admin_cancel_money_request: {
        Args: { p_reason: string; p_request: string }
        Returns: undefined
      }
      admin_case_conversations: {
        Args: { p_case: string; p_case_type: string }
        Returns: Json
      }
      admin_close_break_glass: {
        Args: { p_grant: string; p_notify: boolean; p_withheld_reason?: string }
        Returns: undefined
      }
      admin_create_support_case: {
        Args: {
          p_body: string
          p_category: string
          p_priority: string
          p_related?: Json
          p_requester: string
          p_subject: string
        }
        Returns: string
      }
      admin_create_trust_case: {
        Args: {
          p_category: string
          p_queue: string
          p_reason: string
          p_risk: number
          p_subject_name: string
          p_subject_type: string
        }
        Returns: string
      }
      admin_cron_job_status: {
        Args: never
        Returns: {
          active: boolean
          failures_24h: number
          job: string
          last_run: string
          last_status: string
          schedule: string
        }[]
      }
      admin_decide_agent_approval: {
        Args: { p_approval: string; p_approve: boolean }
        Returns: undefined
      }
      admin_decide_break_glass: {
        Args: { p_approve: boolean; p_grant: string; p_note: string }
        Returns: undefined
      }
      admin_decide_trust: {
        Args: { p_case: string; p_decision: string; p_reason: string }
        Returns: undefined
      }
      admin_discard_setting_draft: {
        Args: { p_reason: string; p_section: string }
        Returns: undefined
      }
      admin_dispute_update: {
        Args: {
          p_dispute: string
          p_note: string
          p_resolution?: Json
          p_status: string
        }
        Returns: undefined
      }
      admin_event_metrics: {
        Args: { p_days?: number }
        Returns: {
          capacity: number
          event_id: string
          flags: number
          gross: number
          gross_window: number
          max_risk: number
          orders: number
          providers: number
          providers_confirmed: number
          refunded: number
          scan_anomalies: number
          scans: number
          sold: number
          sold_window: number
          tier_status: string
          used: number
        }[]
      }
      admin_grant_conversations: { Args: { p_grant: string }; Returns: Json }
      admin_grant_credits: {
        Args: {
          p_credits: number
          p_expires?: string
          p_kind: string
          p_reference: string
          p_workspace: string
        }
        Returns: undefined
      }
      admin_listing_metrics: {
        Args: { p_days?: number }
        Returns: {
          cancelled: number
          confirmed: number
          decided: number
          listing_id: string
          open_flags: number
          requests: number
          requests_prev: number
          responded: number
          revenue: number
        }[]
      }
      admin_open_conversation: {
        Args: { p_conv: string; p_grant: string }
        Returns: Json
      }
      admin_overview: { Args: { p_days?: number }; Returns: Json }
      admin_publish_setting: {
        Args: {
          p_effective?: string
          p_reason: string
          p_section: string
          p_value: Json
        }
        Returns: number
      }
      admin_publish_setting_draft: {
        Args: { p_reason: string; p_section: string }
        Returns: string
      }
      admin_reply_case: {
        Args: { p_body: string; p_case: string; p_internal: boolean }
        Returns: undefined
      }
      admin_request_break_glass: {
        Args: {
          p_case: string
          p_case_type: string
          p_conversations: string[]
          p_justification: string
          p_minutes?: number
          p_reason: string
        }
        Returns: Json
      }
      admin_request_money: {
        Args: {
          p_amount: number
          p_case: string
          p_kind: string
          p_partner: string
          p_reason: string
          p_transaction: string
        }
        Returns: string
      }
      admin_request_trust_evidence: {
        Args: { p_case: string; p_reason: string }
        Returns: undefined
      }
      admin_require: {
        Args: { p_perm: string; p_reason: string }
        Returns: undefined
      }
      admin_review_listing: {
        Args: { p_decision: string; p_listing: string; p_reason: string }
        Returns: undefined
      }
      admin_revoke_sessions: {
        Args: { p_reason: string; p_user: string }
        Returns: number
      }
      admin_rollback_setting: {
        Args: { p_reason: string; p_section: string; p_version: number }
        Returns: number
      }
      admin_save_setting_draft: {
        Args: { p_section: string; p_summary?: string; p_value: Json }
        Returns: number
      }
      admin_set_event_featured: {
        Args: { p_event: string; p_featured: boolean; p_reason: string }
        Returns: undefined
      }
      admin_set_event_restriction: {
        Args: { p_event: string; p_reason: string; p_restrict: boolean }
        Returns: string
      }
      admin_set_integration: {
        Args: { p_enabled: boolean; p_id: string; p_reason: string }
        Returns: undefined
      }
      admin_set_partner_status: {
        Args: { p_partner: string; p_reason: string; p_status: string }
        Returns: undefined
      }
      admin_set_partner_terms: {
        Args: { p_commission_bps: number; p_partner: string; p_reason: string }
        Returns: undefined
      }
      admin_set_ticket_sales: {
        Args: { p_event: string; p_pause: boolean; p_reason: string }
        Returns: number
      }
      admin_set_user_status: {
        Args: { p_reason: string; p_status: string; p_user: string }
        Returns: undefined
      }
      admin_set_workspace_commission: {
        Args: { p_bps: number; p_reason: string; p_ws: string }
        Returns: undefined
      }
      admin_set_workspace_plan: {
        Args: { p_plan: string; p_reason: string; p_ws: string }
        Returns: undefined
      }
      admin_set_workspace_status: {
        Args: { p_reason: string; p_status: string; p_ws: string }
        Returns: undefined
      }
      admin_ticket_counts: { Args: { p_status: string }; Returns: boolean }
      admin_ticket_daily: {
        Args: { p_days?: number; p_event?: string }
        Returns: {
          anomalies: number
          day: string
          refunded: number
          revenue: number
          scans: number
          sold: number
        }[]
      }
      admin_touch_conversation: {
        Args: { p_close?: boolean; p_log: string }
        Returns: undefined
      }
      admin_update_case: {
        Args: {
          p_case: string
          p_outcome?: string
          p_reason: string
          p_status: string
        }
        Returns: undefined
      }
      admin_user_directory: {
        Args: {
          p_filter?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
        }
        Returns: {
          account_type: string
          avatar_url: string
          created_at: string
          email: string
          events: number
          full_name: string
          id: string
          identity_verified: boolean
          last_active_at: string
          open_cases: number
          status: string
          tickets: number
          total_count: number
          trust_flag: string
          upcoming_events: number
          used_tickets: number
          workspace_name: string
          workspaces: number
        }[]
      }
      admin_user_identity: { Args: { p_user: string }; Returns: Json }
      admin_user_stats: { Args: never; Returns: Json }
      admin_workspace_daily: {
        Args: { p_days?: number; p_ws: string }
        Returns: {
          day: string
          other: number
          services: number
          ticket_count: number
          tickets: number
        }[]
      }
      admin_workspace_metrics: {
        Args: { p_days?: number }
        Returns: {
          events: number
          fees: number
          gmv: number
          gmv_prev: number
          last_activity: string
          max_risk: number
          members: number
          open_cases: number
          open_flags: number
          services_booked: number
          services_prev: number
          tickets: number
          tickets_prev: number
          upcoming_events: number
          workspace_id: string
        }[]
      }
      agent_action_allowed: { Args: { p_action: string }; Returns: boolean }
      agent_control_run: {
        Args: { p_action: string; p_run: string }
        Returns: undefined
      }
      agent_invoke: {
        Args: {
          p_actor: string
          p_args: Json
          p_tool: string
          p_workspace: string
        }
        Returns: Json
      }
      agent_invoke_ext: {
        Args: { p_args: Json; p_tool: string; p_workspace: string }
        Returns: Json
      }
      agent_propose_action: {
        Args: {
          p_action: string
          p_amount: number
          p_detail: string
          p_impact: string
          p_payload: Json
          p_run: string
          p_title: string
          p_ws: string
        }
        Returns: string
      }
      agent_record_result: {
        Args: { p_approval: string; p_result: string }
        Returns: undefined
      }
      agent_retention_purge: { Args: never; Returns: Json }
      ai_credit_status: { Args: { p_workspace: string }; Returns: Json }
      ai_preflight: {
        Args: {
          p_estimate: number
          p_run: string
          p_tier: string
          p_workspace: string
        }
        Returns: undefined
      }
      apply_cancellation: {
        Args: { p_cancellation: string }
        Returns: undefined
      }
      approve_event_order: {
        Args: { p_order: string; p_version: number }
        Returns: undefined
      }
      assert_writable: { Args: { p_module: string }; Returns: undefined }
      attribute_referral: { Args: { p_order_ref: string }; Returns: number }
      bg_expire: { Args: never; Returns: undefined }
      bg_purge: { Args: never; Returns: number }
      bg_step_up_ok: { Args: never; Returns: boolean }
      booking_admin_fee_minor: {
        Args: { p_amount_minor: number }
        Returns: number
      }
      boost_lifecycle: { Args: never; Returns: number }
      calendar_feed: {
        Args: { p_token: string }
        Returns: {
          ends_at: string
          kind: string
          location: string
          starts_at: string
          title: string
          uid: string
        }[]
      }
      calendar_feed_for_user: {
        Args: { p_user: string }
        Returns: {
          ends_at: string
          kind: string
          location: string
          starts_at: string
          title: string
          uid: string
        }[]
      }
      can_access_conversation: { Args: { p_conv: string }; Returns: boolean }
      can_access_emergency_request: {
        Args: { p_request: string }
        Returns: boolean
      }
      can_access_event: { Args: { target: string }; Returns: boolean }
      can_edit_event: { Args: { target: string }; Returns: boolean }
      can_manage_promoter: { Args: { p_promoter: string }; Returns: boolean }
      can_read_media_path: { Args: { p_path: string }; Returns: boolean }
      can_see_agent_run: { Args: { p_run: string }; Returns: boolean }
      can_see_event_money: { Args: { target: string }; Returns: boolean }
      can_write_listing_media: {
        Args: { object_name: string }
        Returns: boolean
      }
      cancel_agent_watch: { Args: { p_watch: string }; Returns: undefined }
      cancel_emergency_request: {
        Args: { p_request: string }
        Returns: undefined
      }
      cancel_event_with_refunds: {
        Args: { p_event: string; p_reason: string }
        Returns: Json
      }
      cancel_ticket_transfer: {
        Args: { p_transfer: string }
        Returns: undefined
      }
      cancellation_quote: {
        Args: { p_at?: string; p_item: string; p_kind: string; p_party: string }
        Returns: Json
      }
      cancellation_refund_progress: {
        Args: {
          p_cancellation: string
          p_error: string
          p_refunded_minor: number
          p_status: string
        }
        Returns: undefined
      }
      catering_price: {
        Args: { p_guests: number; p_items: Json; p_menu: string }
        Returns: Json
      }
      check_in_ticket: {
        Args: { p_code: string; p_event: string; p_nonce?: string }
        Returns: Json
      }
      checkout_holds: {
        Args: { p_event: string; p_token: string }
        Returns: Json
      }
      claim_agent_runs: {
        Args: { p_lease_seconds?: number; p_limit?: number }
        Returns: {
          agent_name: string
          batch: Json | null
          changes: Json
          cost_cents: number
          created_at: string
          current_step: number
          errors: Json
          event_id: string | null
          financial_exposure_minor: number
          finished_at: string | null
          goal: string
          id: string
          idempotency_key: string | null
          interpretation: Json
          lease_until: string | null
          mission: string | null
          mode: string
          next_wake_at: string | null
          plan: Json
          progress: number
          quality: string
          reference: string | null
          result: string
          retries: number
          routine_id: string | null
          run_type: string
          scope: string[]
          started_at: string | null
          status: string
          summary: string | null
          surface: string
          tokens: number
          triggered_by: string
          updated_at: string
          user_id: string
          waiting_reason: string
          workspace_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "agent_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_email_batch: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          body: string
          category: string
          created_at: string
          id: string
          last_error: string | null
          lease_until: string | null
          link: string | null
          notification_id: string | null
          provider_id: string | null
          sent_at: string | null
          status: string
          subject: string
          to_email: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "email_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_ticket_refunds: {
        Args: { p_limit?: number }
        Returns: {
          amount: number
          buyer_id: string | null
          commission: number
          created_at: string
          currency: string
          event_id: string
          fee: number
          kind: string
          lines: Json
          order_ref: string
          ref_code: string | null
          refund_error: string | null
          refund_reason: string | null
          refund_status: string
          refunded_at: string | null
          status: string
          stripe_session: string | null
          token: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "checkout_orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_waitlist_offer: {
        Args: { p_offer: string; p_token: string }
        Returns: Json
      }
      claim_webhook_batch: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          delivery_id: string
          endpoint_id: string
          event_id: string
          event_type: string
          payload: Json
          secret: string
          url: string
        }[]
      }
      claim_webhook_event: {
        Args: {
          p_external_id: string
          p_livemode: boolean
          p_provider: string
          p_type: string
        }
        Returns: boolean
      }
      commerce_setting: { Args: { p_key: string }; Returns: Json }
      complete_customer_onboarding: { Args: never; Returns: undefined }
      complete_workspace_onboarding: {
        Args: { p_workspace: string }
        Returns: undefined
      }
      create_agent_watch: {
        Args: {
          p_condition: Json
          p_every: number
          p_expires: string
          p_input: Json
          p_title: string
          p_tool: string
          p_workspace: string
        }
        Returns: string
      }
      create_api_key: {
        Args: {
          p_expires: string
          p_hash: string
          p_name: string
          p_prefix: string
          p_scopes: string[]
          p_workspace: string
        }
        Returns: string
      }
      create_boost_payment_order: {
        Args: { p_boost: string }
        Returns: {
          amount_minor: number
          build_item_id: string | null
          commission: Json
          created_at: string
          currency: string
          customer_fee_minor: number
          description: string
          event_id: string | null
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          kind: string
          livemode: boolean | null
          payee_workspace_id: string | null
          payer_id: string | null
          platform_fee_minor: number
          protected: boolean
          reference: string
          refunded_minor: number
          release_eligible_at: string | null
          released_at: string | null
          standby_id: string | null
          status: string
          strategy: string
          stripe_charge: string | null
          stripe_checkout_session: string | null
          stripe_payment_intent: string | null
          stripe_transfer: string | null
          transferred_minor: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payment_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_demo_workspace: { Args: { p_persona: string }; Returns: string }
      create_design: {
        Args: {
          p_document: Json
          p_event: string
          p_link_hash?: string
          p_source?: string
          p_template?: string
          p_title: string
          p_workspace: string
        }
        Returns: string
      }
      create_emergency_request: {
        Args: { p: Json; p_event: string }
        Returns: string
      }
      create_payment_order: {
        Args: { p_item?: string; p_kind: string; p_standby?: string }
        Returns: {
          amount_minor: number
          build_item_id: string | null
          commission: Json
          created_at: string
          currency: string
          customer_fee_minor: number
          description: string
          event_id: string | null
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          kind: string
          livemode: boolean | null
          payee_workspace_id: string | null
          payer_id: string | null
          platform_fee_minor: number
          protected: boolean
          reference: string
          refunded_minor: number
          release_eligible_at: string | null
          released_at: string | null
          standby_id: string | null
          status: string
          strategy: string
          stripe_charge: string | null
          stripe_checkout_session: string | null
          stripe_payment_intent: string | null
          stripe_transfer: string | null
          transferred_minor: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payment_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_promotion_boost: {
        Args: {
          p_event: string
          p_product: string
          p_starts_at?: string
          p_targeting?: Json
        }
        Returns: string
      }
      create_webhook_endpoint: {
        Args: {
          p_description: string
          p_events: string[]
          p_secret: string
          p_url: string
          p_workspace: string
        }
        Returns: string
      }
      credit_invoice: { Args: { p_invoice: string }; Returns: undefined }
      cron_job_status: {
        Args: never
        Returns: {
          active: boolean
          failures_24h: number
          job: string
          last_run: string
          last_status: string
          schedule: string
        }[]
      }
      customer_accept_quote: {
        Args: { p_item: string; p_payment_ref: string }
        Returns: undefined
      }
      customer_save_booking: {
        Args: {
          p_item: string
          p_option: string
          p_requirements: Json
          p_submit: boolean
        }
        Returns: string
      }
      decide_agent_approval: {
        Args: { p_approval: string; p_approve: boolean; p_edited?: Json }
        Returns: {
          action: string
          affected_ref: string | null
          alternatives: Json
          amount: number | null
          batch_key: string | null
          confidence: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          detail: string
          edited_payload: Json | null
          event_id: string | null
          executed_at: string | null
          expires_at: string | null
          id: string
          impact: string
          payload: Json
          previous_state: Json | null
          proposed_state: Json | null
          reason: string | null
          requested_by: string | null
          result: string | null
          risk: number | null
          run_id: string | null
          status: string
          step_id: string | null
          title: string
          tool_id: string | null
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "agent_approvals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decide_cancellation: {
        Args: {
          p_accept: boolean
          p_cancellation: string
          p_note?: string
          p_refund?: number
        }
        Returns: undefined
      }
      decide_venue_alternative: {
        Args: { p_accept: boolean; p_alt: string }
        Returns: undefined
      }
      delete_demo_workspace: {
        Args: { p_workspace: string }
        Returns: undefined
      }
      delete_design_comment: { Args: { p_comment: string }; Returns: undefined }
      delete_my_review: { Args: { p_review: string }; Returns: undefined }
      deletion_blockers: {
        Args: { p_user?: string }
        Returns: {
          code: string
          detail: string
        }[]
      }
      design_access: { Args: { p_design: string }; Returns: string }
      disconnect_my_calendar: {
        Args: { p_provider: string }
        Returns: undefined
      }
      dispatch_db_backup: { Args: never; Returns: number }
      dispatch_worker: { Args: { p_path: string }; Returns: number }
      dispute_party: {
        Args: { d: Database["public"]["Tables"]["booking_disputes"]["Row"] }
        Returns: string
      }
      due_deletions: {
        Args: never
        Returns: {
          requested_at: string
          user_id: string
        }[]
      }
      earth: { Args: never; Returns: number }
      email_category: {
        Args: { p_kind: string }
        Returns: {
          category: string
          mandatory: boolean
        }[]
      }
      emergency_match: {
        Args: { p_limit?: number; p_request: string }
        Returns: {
          distance_km: number
          listing_id: string
          workspace_id: string
        }[]
      }
      end_maintenance: {
        Args: { p_note: string; p_window: string }
        Returns: undefined
      }
      ensure_invoice_token: { Args: { p_invoice: string }; Returns: string }
      entitlement: {
        Args: { p_capability: string; p_workspace: string }
        Returns: Json
      }
      erase_user_data: { Args: { p_user: string }; Returns: Json }
      event_activity: {
        Args: { p_event: string; p_limit?: number }
        Returns: {
          actor: string
          created_at: string
          event: string
          id: number
          text: string
        }[]
      }
      event_break_even: {
        Args: { p_event: string; p_extra_costs?: number; p_fee_pct?: number }
        Returns: Json
      }
      event_build_budget: { Args: { p_event: string }; Returns: Json }
      event_feasibility: { Args: { p_event: string }; Returns: Json }
      event_launch_state: { Args: { p_event: string }; Returns: string }
      event_path: {
        Args: { p_event: string; p_id: string; p_kind: string }
        Returns: string
      }
      event_readiness: { Args: { p_event: string }; Returns: Json }
      event_virtual_public: { Args: { p_event: string }; Returns: Json }
      expire_checkout_holds: { Args: never; Returns: number }
      expire_provider_documents: { Args: never; Returns: number }
      expire_seat_holds: { Args: { p_event?: string }; Returns: number }
      expire_stale_items: { Args: never; Returns: number }
      finish_webhook_delivery: {
        Args: {
          p_delivery: string
          p_ok: boolean
          p_snippet: string
          p_status: number
        }
        Returns: undefined
      }
      finish_webhook_event: {
        Args: {
          p_error?: string
          p_external_id: string
          p_provider: string
          p_status: string
        }
        Returns: undefined
      }
      global_search: {
        Args: {
          p_lat?: number
          p_limit?: number
          p_lng?: number
          p_q: string
          p_radius_km?: number
          p_workspace?: string
        }
        Returns: {
          id: string
          kind: string
          link: string
          score: number
          subtitle: string
          title: string
        }[]
      }
      has_admin_permission: { Args: { p: string }; Returns: boolean }
      has_capability: {
        Args: { p_capability: string; p_workspace: string }
        Returns: boolean
      }
      has_permission: {
        Args: { p_permission: string; p_workspace: string }
        Returns: boolean
      }
      has_workspace_role: {
        Args: { roles: string[]; target: string }
        Returns: boolean
      }
      hit_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      hold_resale: {
        Args: { p_event: string; p_tickets: string[]; p_token: string }
        Returns: Json
      }
      hold_seats: {
        Args: { p_event: string; p_keys: string[]; p_token: string }
        Returns: Json
      }
      hold_tickets: {
        Args: { p_event: string; p_items: Json; p_token: string }
        Returns: Json
      }
      holds_ticket_for: { Args: { p_event: string }; Returns: boolean }
      invite_preview: {
        Args: { p_token_hash: string }
        Returns: {
          expires_at: string
          invited_by_name: string
          role: string
          state: string
          workspace_kind: string
          workspace_name: string
        }[]
      }
      invoice_by_token: {
        Args: { p_token: string }
        Returns: {
          amount_paid: number
          client_name: string
          currency: string
          due_date: string
          event_name: string
          id: string
          number: string
          status: string
          total: number
          workspace_name: string
        }[]
      }
      invoice_reminder: { Args: { p_invoice: string }; Returns: undefined }
      is_emergency_candidate: { Args: { p_request: string }; Returns: boolean }
      is_event_promoter: { Args: { p_event: string }; Returns: boolean }
      is_listing_provider: { Args: { p_listing: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_provider_for_event: { Args: { p_event: string }; Returns: boolean }
      is_workspace_member: { Args: { target: string }; Returns: boolean }
      is_workspace_owner: { Args: { target: string }; Returns: boolean }
      issue_checkout: {
        Args: {
          p_attendee: string
          p_holder: string
          p_order_ref: string
          p_token: string
        }
        Returns: number
      }
      issue_invoice: { Args: { p_invoice: string }; Returns: undefined }
      issue_proposal: { Args: { p_proposal: string }; Returns: number }
      issue_resale: {
        Args: {
          p_attendee: string
          p_holder: string
          p_order_ref: string
          p_token: string
        }
        Returns: number
      }
      issue_seated_tickets: {
        Args: {
          p_attendee: string
          p_holder: string
          p_order_ref: string
          p_token: string
        }
        Returns: {
          attendee_email: string
          attendee_name: string
          checked_in_at: string | null
          code: string
          created_at: string
          event_id: string
          holder_id: string | null
          id: string
          order_ref: string
          price_paid: number
          qr_nonce: string
          replaced_by: string | null
          seat: string | null
          status: string
          tier_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      issue_tickets: {
        Args: {
          p_attendee: string
          p_holder: string
          p_order_ref: string
          p_quantity: number
          p_tier: string
        }
        Returns: {
          attendee_email: string
          attendee_name: string
          checked_in_at: string | null
          code: string
          created_at: string
          event_id: string
          holder_id: string | null
          id: string
          order_ref: string
          price_paid: number
          qr_nonce: string
          replaced_by: string | null
          seat: string | null
          status: string
          tier_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      join_waitlist: {
        Args: { p_event: string; p_qty: number; p_tier: string }
        Returns: string
      }
      list_ticket_for_resale: {
        Args: { p_cancel?: boolean; p_ticket: string }
        Returns: string
      }
      listing_availability: {
        Args: { p_end: string; p_listing: string; p_start: string }
        Returns: string
      }
      listing_readiness: { Args: { p_listing: string }; Returns: Json }
      listing_workspace: { Args: { p_listing: string }; Returns: string }
      log_auth_event: { Args: { p_event: string }; Returns: undefined }
      maintenance_level: { Args: { p_module: string }; Returns: number }
      maintenance_state: {
        Args: never
        Returns: {
          audience: string
          bypass_roles: string[]
          dismissible: boolean
          ends_at: string
          expected_restore: string
          id: string
          level: number
          message: string
          modules: string[]
          reference: string
          severity: string
          starts_at: string
          status_url: string
          title: string
        }[]
      }
      mark_conversation_read: { Args: { p_conv: string }; Returns: undefined }
      mark_proposal_converted: {
        Args: { p_event: string; p_proposal: string }
        Returns: undefined
      }
      mark_proposal_viewed: { Args: { p_token: string }; Returns: undefined }
      marketplace_sweep: { Args: never; Returns: Json }
      may_contact: {
        Args: { p_target: string; p_type: string }
        Returns: boolean
      }
      mfa_required: {
        Args: { p_policy: string; p_role: string }
        Returns: boolean
      }
      moderate_review: {
        Args: { p_reason: string; p_review: string; p_status: string }
        Returns: undefined
      }
      moderate_template: {
        Args: { p_action: string; p_note: string; p_template: string }
        Returns: undefined
      }
      my_calendar_connections: {
        Args: never
        Returns: {
          account_email: string
          last_error: string
          last_synced_at: string
          provider: string
          status: string
        }[]
      }
      my_contacts: {
        Args: { p_workspace?: string }
        Returns: {
          context: string
          id: string
          kind: string
          label: string
        }[]
      }
      my_conversations: {
        Args: { p_limit?: number; p_workspace?: string }
        Returns: {
          counterpart: string
          event_id: string
          id: string
          kind: string
          last_message_at: string
          last_message_preview: string
          listing_id: string
          subject: string
          unread: boolean
        }[]
      }
      my_pending_invites: {
        Args: never
        Returns: {
          expires_at: string
          id: string
          role: string
          workspace_kind: string
          workspace_name: string
        }[]
      }
      my_recovery_code_count: { Args: never; Returns: number }
      my_sessions: {
        Args: never
        Returns: {
          aal: string
          created_at: string
          current: boolean
          id: string
          ip: string
          last_active: string
          user_agent: string
        }[]
      }
      my_storage_usage: { Args: { p_workspace?: string }; Returns: Json }
      my_workspace_access: {
        Args: never
        Returns: {
          id: string
          kind: string
          member_status: string
          name: string
          onboarding_complete: boolean
          role: string
          workspace_status: string
        }[]
      }
      notify_event: {
        Args: {
          p_body: string
          p_event: string
          p_kind: string
          p_link?: string
          p_title: string
        }
        Returns: undefined
      }
      notify_waitlists: { Args: never; Returns: number }
      notify_workspace: {
        Args: {
          p_body: string
          p_kind: string
          p_link: string
          p_roles: string[]
          p_title: string
          p_ws: string
        }
        Returns: undefined
      }
      offer_ticket_transfer: {
        Args: {
          p_email: string
          p_name: string
          p_ticket: string
          p_token_hash: string
        }
        Returns: string
      }
      open_booking_dispute: {
        Args: {
          p_amount?: number
          p_item: string
          p_reason: string
          p_summary: string
        }
        Returns: string
      }
      organizer_save_event_plan: {
        Args: {
          p_event: string
          p_overlay: Json
          p_publish: boolean
          p_seats: Json
          p_structure: Json
        }
        Returns: number
      }
      owns_partner: { Args: { p_partner: string }; Returns: boolean }
      owns_promoter: { Args: { p_promoter: string }; Returns: boolean }
      partner_apply_grade: { Args: { p_partner: string }; Returns: undefined }
      partner_contact_support: {
        Args: { p_body: string; p_subject: string }
        Returns: string
      }
      partner_grade_for: { Args: { p_active: number }; Returns: number }
      payment_order_disputed: {
        Args: { p_open: boolean; p_pi: string }
        Returns: undefined
      }
      payment_order_failed: {
        Args: { p_reason: string; p_ref: string }
        Returns: undefined
      }
      payment_order_pending: {
        Args: { p_ref: string; p_session: string }
        Returns: undefined
      }
      payment_order_refunded: {
        Args: { p_pi: string; p_refunded_minor: number }
        Returns: undefined
      }
      payment_order_succeeded: {
        Args: {
          p_amount_minor: number
          p_charge: string
          p_livemode: boolean
          p_pi: string
          p_ref: string
        }
        Returns: string
      }
      payment_order_transferred: {
        Args: { p_amount_minor: number; p_ref: string; p_transfer: string }
        Returns: undefined
      }
      payment_release_scan: { Args: never; Returns: number }
      payout_eligible: { Args: { p_workspace: string }; Returns: boolean }
      plan_catalog: { Args: never; Returns: Json }
      plan_commission_bps: { Args: { p_plan: string }; Returns: number }
      portal_comment: {
        Args: { p_body: string; p_token_hash: string }
        Returns: string
      }
      portal_decide: {
        Args: {
          p_approval: string
          p_decision: string
          p_note?: string
          p_token_hash: string
        }
        Returns: string
      }
      portal_document: {
        Args: { p_document: string; p_token_hash: string }
        Returns: {
          body: string
          mime: string
          title: string
        }[]
      }
      portal_issue_link: {
        Args: {
          p_client_email?: string
          p_client_name: string
          p_event: string
          p_valid_days?: number
        }
        Returns: {
          expires_at: string
          link_id: string
          token: string
        }[]
      }
      portal_link_for: {
        Args: { p_token_hash: string }
        Returns: {
          client_email: string
          client_name: string
          created_at: string
          created_by: string | null
          event_id: string
          expires_at: string
          id: string
          last_opened_at: string | null
          open_count: number
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
        }
        SetofOptions: {
          from: "*"
          to: "portal_links"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      portal_revoke_link: { Args: { p_link: string }; Returns: undefined }
      portal_view: { Args: { p_token_hash: string }; Returns: Json }
      post_ledger_transaction: {
        Args: {
          p_actor_type?: string
          p_currency: string
          p_description?: string
          p_event?: string
          p_idempotency_key: string
          p_kind: string
          p_lines: Json
          p_source_id?: string
          p_source_type?: string
          p_stripe_ref?: string
          p_workspace?: string
        }
        Returns: string
      }
      post_message: {
        Args: {
          p_as_workspace?: string
          p_attachments?: Json
          p_body: string
          p_conv: string
        }
        Returns: string
      }
      promoter_click_stats: {
        Args: { p_promoter: string; p_since: string }
        Returns: {
          asset_id: string
          channel: string
          clicks: number
          day: string
        }[]
      }
      promoter_leaderboard: {
        Args: { p_promoter: string }
        Returns: {
          is_you: boolean
          name: string
          rank: number
          tickets_sold: number
        }[]
      }
      promoter_set_payout_method: {
        Args: { p_method: string; p_promoter: string }
        Returns: undefined
      }
      promoter_track_click: {
        Args: {
          p_asset?: string
          p_channel?: string
          p_code: string
          p_visitor: string
        }
        Returns: {
          code: string
          counted: boolean
          slug: string
        }[]
      }
      proposal_by_token: { Args: { p_token: string }; Returns: Json }
      provider_assign_crew: {
        Args: { p_crew: string; p_job: string; p_role: string }
        Returns: string
      }
      provider_create_booking: {
        Args: { p: Json; p_ws: string }
        Returns: string
      }
      provider_decline_standby: {
        Args: { p_reason?: string; p_standby: string }
        Returns: undefined
      }
      provider_emergency_respond: {
        Args: {
          p_action: string
          p_candidate: string
          p_eta?: number
          p_note?: string
          p_quote?: number
        }
        Returns: undefined
      }
      provider_issue_quote: {
        Args: {
          p_deposit_pct: number
          p_item: string
          p_items: Json
          p_message: string
          p_send: boolean
          p_tax_bps: number
          p_terms: Json
          p_valid_days: number
        }
        Returns: string
      }
      provider_job_transition: {
        Args: { p_job: string; p_reason?: string; p_to: string }
        Returns: undefined
      }
      provider_mark_thread_read: { Args: { p_thread: string }; Returns: number }
      provider_offer_standby: {
        Args: {
          p_activation_price: number
          p_fee: number
          p_standby: string
          p_terms: string
          p_valid_hours: number
        }
        Returns: undefined
      }
      provider_pause_listing: {
        Args: { p_listing: string; p_pause: boolean }
        Returns: undefined
      }
      provider_release_hold: { Args: { p_item: string }; Returns: undefined }
      provider_request_availability: {
        Args: {
          p_crew: string
          p_ends: string
          p_note: string
          p_starts: string
          p_ws: string
        }
        Returns: string
      }
      provider_respond: {
        Args: { p_item: string; p_note?: string; p_response: string }
        Returns: string
      }
      provider_respond_hold: {
        Args: {
          p_accept: boolean
          p_hold: string
          p_hours?: number
          p_note?: string
        }
        Returns: string
      }
      provider_save_crew: {
        Args: { p: Json; p_crew: string; p_ws: string }
        Returns: string
      }
      provider_save_listing: {
        Args: { p: Json; p_listing: string; p_ws: string }
        Returns: string
      }
      provider_save_package: {
        Args: { p: Json; p_package: string; p_ws: string }
        Returns: string
      }
      provider_save_quote_draft: {
        Args: {
          p_deposit_pct: number
          p_item: string
          p_items: Json
          p_message: string
          p_quote: string
          p_tax_bps: number
          p_terms: Json
          p_valid_days: number
        }
        Returns: string
      }
      provider_save_settings: {
        Args: { p: Json; p_ws: string }
        Returns: undefined
      }
      provider_save_space: {
        Args: { p: Json; p_space: string; p_venue: string; p_ws: string }
        Returns: string
      }
      provider_save_structure: {
        Args: {
          p_elements: Json
          p_publish: boolean
          p_venue: string
          p_ws: string
        }
        Returns: number
      }
      provider_send_message: {
        Args: { p_body: string; p_thread: string }
        Returns: string
      }
      provider_send_quote: { Args: { p_quote: string }; Returns: string }
      provider_set_availability: {
        Args: {
          p_crew?: string
          p_ends: string
          p_kind: string
          p_listing?: string
          p_note?: string
          p_space?: string
          p_starts: string
          p_ws: string
        }
        Returns: string
      }
      provider_set_crew_status: {
        Args: { p_crew: string; p_status: string; p_ws: string }
        Returns: undefined
      }
      provider_set_space_links: {
        Args: {
          p_exclusive: string[]
          p_linked: string[]
          p_space: string
          p_ws: string
        }
        Returns: undefined
      }
      provider_toggle_routine: {
        Args: { p_enabled: boolean; p_routine: string }
        Returns: undefined
      }
      provider_withdraw_quote: { Args: { p_quote: string }; Returns: undefined }
      public_event_plan: { Args: { p_event: string }; Returns: Json }
      public_organizer: {
        Args: { p_event: string }
        Returns: {
          cover_image: string
          events_count: number
          followers: number
          name: string
          verified: boolean
        }[]
      }
      public_workspace: {
        Args: { p_workspace: string }
        Returns: {
          cover_image: string
          created_at: string
          events_count: number
          id: string
          name: string
          upcoming: number
          verified: boolean
        }[]
      }
      publish_listing: { Args: { p_listing: string }; Returns: Json }
      publish_template: {
        Args: {
          p_category: string
          p_description: string
          p_design: string
          p_link_hash?: string
          p_tags: string[]
          p_title: string
          p_visibility: string
        }
        Returns: string
      }
      queue_admit_check: {
        Args: { p_consume?: boolean; p_event: string; p_token_hash: string }
        Returns: boolean
      }
      queue_join: {
        Args: { p_event: string; p_token_hash: string }
        Returns: Json
      }
      queue_status: {
        Args: { p_event: string; p_token_hash: string }
        Returns: Json
      }
      quote_totals: {
        Args: { p_discount?: number; p_items: Json; p_tax_bps: number }
        Returns: {
          subtotal: number
          tax: number
          total: number
        }[]
      }
      rank_venues_for_event: {
        Args: { p_event: string; p_limit?: number }
        Returns: Json
      }
      recompute_reliability: {
        Args: { p_workspace: string }
        Returns: undefined
      }
      record_ai_usage: {
        Args: {
          p_cached: number
          p_input: number
          p_model: string
          p_output: number
          p_purpose: string
          p_run: string
          p_user: string
          p_workspace: string
        }
        Returns: Json
      }
      record_boost_event: {
        Args: { p_boost: string; p_kind: string }
        Returns: undefined
      }
      record_invoice_payment: {
        Args: {
          p_amount: number
          p_invoice: string
          p_method: string
          p_ref: string
        }
        Returns: undefined
      }
      release_checkout: { Args: { p_token: string }; Returns: number }
      release_conditional_hold: {
        Args: { p_hold: string; p_reason?: string }
        Returns: undefined
      }
      release_resale_holds: { Args: { p_token: string }; Returns: number }
      release_seat_holds: { Args: { p_token: string }; Returns: number }
      release_standby: { Args: { p_standby: string }; Returns: undefined }
      reliability_band: { Args: { p_workspace: string }; Returns: string }
      remember_workspace: { Args: { p_workspace: string }; Returns: undefined }
      replay_webhook_delivery: {
        Args: { p_delivery: string }
        Returns: undefined
      }
      report_template: {
        Args: { p_detail: string; p_reason: string; p_template: string }
        Returns: undefined
      }
      request_account_deletion: {
        Args: { p_cancel: boolean }
        Returns: undefined
      }
      request_cancellation: {
        Args: {
          p_item: string
          p_kind: string
          p_party: string
          p_reason: string
        }
        Returns: string
      }
      request_conditional_hold: {
        Args: {
          p_conditions?: string
          p_depends_on?: string
          p_hours: number
          p_item: string
        }
        Returns: string
      }
      request_standby: {
        Args: {
          p_item: string
          p_note?: string
          p_primary: string
          p_window_end: string
          p_window_start: string
        }
        Returns: string
      }
      require_provider_role: {
        Args: { p_roles: string[]; p_ws: string }
        Returns: undefined
      }
      resale_holds_for: { Args: { p_token: string }; Returns: Json }
      resale_listings: { Args: { p_event: string }; Returns: Json }
      reset_demo_workspace: { Args: { p_workspace: string }; Returns: string }
      resolve_api_key: {
        Args: { p_hash: string; p_ip: string }
        Returns: {
          acts_as: string
          key_id: string
          prefix: string
          scopes: string[]
          workspace_id: string
        }[]
      }
      resolve_commission: {
        Args: {
          p_category?: string
          p_country?: string
          p_promotion?: string
          p_workspace: string
        }
        Returns: Json
      }
      resolve_design_comment: {
        Args: { p_comment: string; p_resolved: boolean }
        Returns: undefined
      }
      respond_to_invite: {
        Args: { p_accept: boolean; p_invite_id: string; p_token_hash: string }
        Returns: Json
      }
      respond_to_review: {
        Args: { p_body: string; p_review: string }
        Returns: undefined
      }
      restore_design_version: {
        Args: { p_design: string; p_version: number }
        Returns: number
      }
      retention_purge_security_logs: { Args: never; Returns: Json }
      review_provider_document: {
        Args: { p_document: string; p_reason?: string; p_status: string }
        Returns: undefined
      }
      revise_proposal: { Args: { p_proposal: string }; Returns: undefined }
      revoke_api_key: { Args: { p_key: string }; Returns: undefined }
      revoke_other_sessions: { Args: never; Returns: number }
      rotate_calendar_token: { Args: never; Returns: string }
      save_brand_kit: {
        Args: {
          p_colors: Json
          p_fonts: Json
          p_logos: Json
          p_workspace: string
        }
        Returns: undefined
      }
      save_catering_selection: {
        Args: {
          p_accept_change?: boolean
          p_dietary: Json
          p_equipment: string
          p_guests: number
          p_item: string
          p_items: Json
          p_menu: string
          p_notes: string
          p_service_at: string
          p_staffing: string
          p_style: string
          p_submit: boolean
        }
        Returns: Json
      }
      save_design: {
        Args: {
          p_design: string
          p_document: Json
          p_expected_version: number
          p_label?: string
          p_title?: string
        }
        Returns: number
      }
      save_emergency_profile: {
        Args: { p: Json; p_ws: string }
        Returns: undefined
      }
      save_event_order: {
        Args: {
          p_content: Json
          p_financial: Json
          p_job: string
          p_note: string
          p_send: boolean
        }
        Returns: string
      }
      save_event_virtual: {
        Args: { p: Json; p_event: string }
        Returns: undefined
      }
      scan_candidates: {
        Args: { p_limit?: number }
        Returns: {
          bucket: string
          mimetype: string
          name: string
          size: number
          user_id: string
          workspace_id: string
        }[]
      }
      scan_lookup: {
        Args: { p_event: string; p_query: string }
        Returns: {
          attendee: string
          checked_in_at: string
          code: string
          email: string
          seat: string
          status: string
          ticket_id: string
          tier: string
        }[]
      }
      scan_manifest: {
        Args: { p_event: string }
        Returns: {
          attendee: string
          checked_in_at: string
          code: string
          seat: string
          status: string
          ticket_id: string
          tier: string
        }[]
      }
      scan_ticket: {
        Args: {
          p_code: string
          p_credential: string
          p_device?: string
          p_event: string
          p_gate?: string
          p_nonce: string
          p_offline_at?: string
          p_ticket: string
        }
        Returns: Json
      }
      seed_backfill_tickets: { Args: { p_days?: number }; Returns: number }
      seed_shift_event: {
        Args: { p_days: number; p_slug: string }
        Returns: undefined
      }
      set_ai_budget: {
        Args: { p: Json; p_workspace: string }
        Returns: undefined
      }
      set_member_role: {
        Args: { p_role: string; p_user: string; p_ws: string }
        Returns: undefined
      }
      set_my_avatar: { Args: { p_url: string }; Returns: undefined }
      set_provider_checkin: {
        Args: {
          p_eta?: string
          p_item: string
          p_note?: string
          p_status: string
        }
        Returns: undefined
      }
      set_webhook_endpoint_status: {
        Args: { p_endpoint: string; p_status: string }
        Returns: undefined
      }
      set_workspace_mfa_policy: {
        Args: { p_policy: string; p_workspace: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      space_conflicts: {
        Args: {
          p_ends: string
          p_exclude_item?: string
          p_space: string
          p_starts: string
        }
        Returns: {
          ends_at: string
          level: string
          reason: string
          ref_id: string
          starts_at: string
        }[]
      }
      start_agent_run: {
        Args: {
          p_constraints: Json
          p_goal: string
          p_idempotency: string
          p_surface: string
          p_tools: string[]
          p_ws: string
        }
        Returns: string
      }
      start_conversation: {
        Args: {
          p_as_workspace?: string
          p_body: string
          p_event?: string
          p_item?: string
          p_kind: string
          p_listing?: string
          p_subject: string
          p_to: string
          p_to_type: string
        }
        Returns: string
      }
      start_maintenance: { Args: { p: Json }; Returns: string }
      storage_backup_candidates: {
        Args: { p_limit?: number }
        Returns: {
          bucket: string
          mimetype: string
          name: string
          size: number
          updated_at: string
        }[]
      }
      storage_backup_expired: {
        Args: { p_limit?: number }
        Returns: {
          bucket: string
          name: string
        }[]
      }
      storage_owner_of: {
        Args: { p_bucket: string; p_name: string; p_uploader: string }
        Returns: {
          user_id: string
          workspace_id: string
        }[]
      }
      storage_usage: {
        Args: { p_user?: string; p_workspace: string }
        Returns: Json
      }
      storage_usage_internal: {
        Args: { p_user?: string; p_workspace: string }
        Returns: Json
      }
      submit_privacy_request: {
        Args: { p_detail: string; p_kind: string }
        Returns: string
      }
      submit_review: {
        Args: {
          p_body: string
          p_item: string
          p_photos: string[]
          p_rating: number
          p_ratings: Json
        }
        Returns: string
      }
      suggest_seating: {
        Args: {
          p_event: string
          p_include_pending?: boolean
          p_table_size?: number
        }
        Returns: Json
      }
      team_conflicts: {
        Args: { p_from?: string; p_to?: string; p_workspace: string }
        Returns: {
          crew_id: string
          event_id: string
          kind: string
          message: string
          other_id: string
          severity: string
          shift_id: string
        }[]
      }
      template_by_link: {
        Args: { p_link_hash: string }
        Returns: {
          category: string
          description: string
          document: Json
          height: number
          id: string
          title: string
          width: number
        }[]
      }
      template_usable: {
        Args: { p_link_hash?: string; p_template: string }
        Returns: boolean
      }
      test_webhook_endpoint: { Args: { p_endpoint: string }; Returns: string }
      ticket_fee_config: { Args: never; Returns: Json }
      ticket_sales_series: {
        Args: { p_days?: number; p_event: string }
        Returns: {
          day: string
          gross: number
          tickets: number
        }[]
      }
      transfer_ticket: {
        Args: { p_email: string; p_name: string; p_ticket: string }
        Returns: string
      }
      transition_build_item: {
        Args: { p_hold_hours?: number; p_item: string; p_to: string }
        Returns: {
          amount: number | null
          category: string
          created_at: string
          deposit: number
          event_id: string
          hold_expires_at: string | null
          id: string
          image: string
          listing_id: string | null
          notes: string
          package: string
          price_basis: string
          quote: Json
          request_id: string | null
          responded_at: string | null
          response_deadline: string | null
          response_reminders: number
          response_status: string | null
          role: string
          scope: string
          sent_at: string | null
          sort: number
          status: string
          status_before_hold: string | null
          terms_snapshot: Json | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "build_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_my_profile: { Args: { p: Json }; Returns: undefined }
      update_privacy_request: {
        Args: {
          p_extend?: boolean
          p_id: string
          p_note: string
          p_status: string
        }
        Returns: undefined
      }
      update_ticket_attendee: {
        Args: { p_email: string; p_name: string; p_ticket: string }
        Returns: undefined
      }
      update_workspace_settings: {
        Args: { p: Json; p_ws: string }
        Returns: undefined
      }
      upgrade_event_to_professional: {
        Args: { p_event: string; p_workspace: string }
        Returns: undefined
      }
      venue_offer_alternative: {
        Args: {
          p_ends: string
          p_item: string
          p_kind: string
          p_note: string
          p_price: number
          p_space: string
          p_starts: string
        }
        Returns: string
      }
      venue_place_hold: {
        Args: {
          p_blocking: string
          p_ends: string
          p_hours: number
          p_item: string
          p_note?: string
          p_space: string
          p_starts: string
        }
        Returns: string
      }
      venue_quote: {
        Args: {
          p_ends: string
          p_guests: number
          p_space: string
          p_starts: string
        }
        Returns: Json
      }
      virtual_join: { Args: { p_ticket: string }; Returns: Json }
      waitlist_offer_for: { Args: { p_offer: string }; Returns: Json }
      webhook_event_type: { Args: { p_audit: string }; Returns: string }
      withdraw_proposal: { Args: { p_proposal: string }; Returns: undefined }
      workspace_credential_status: {
        Args: { p_workspace: string }
        Returns: {
          credential_key: string
          expires_on: string
          gates_marketplace: boolean
          label: string
          requirement: string
          status: string
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
