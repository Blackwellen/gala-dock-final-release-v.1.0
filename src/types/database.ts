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
      agent_approvals: {
        Row: {
          action: string
          amount: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          detail: string
          event_id: string | null
          expires_at: string | null
          id: string
          impact: string
          payload: Json
          run_id: string | null
          status: string
          title: string
          workspace_id: string | null
        }
        Insert: {
          action: string
          amount?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          detail?: string
          event_id?: string | null
          expires_at?: string | null
          id?: string
          impact?: string
          payload?: Json
          run_id?: string | null
          status?: string
          title: string
          workspace_id?: string | null
        }
        Update: {
          action?: string
          amount?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          detail?: string
          event_id?: string | null
          expires_at?: string | null
          id?: string
          impact?: string
          payload?: Json
          run_id?: string | null
          status?: string
          title?: string
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
            foreignKeyName: "agent_approvals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_routines: {
        Row: {
          approval_policy: string
          created_at: string
          detail: string
          enabled: boolean
          id: string
          last_result: string
          last_run_at: string | null
          next_run_at: string | null
          schedule: string
          suggested: boolean
          title: string
          workspace_id: string
        }
        Insert: {
          approval_policy?: string
          created_at?: string
          detail?: string
          enabled?: boolean
          id?: string
          last_result?: string
          last_run_at?: string | null
          next_run_at?: string | null
          schedule: string
          suggested?: boolean
          title: string
          workspace_id: string
        }
        Update: {
          approval_policy?: string
          created_at?: string
          detail?: string
          enabled?: boolean
          id?: string
          last_result?: string
          last_run_at?: string | null
          next_run_at?: string | null
          schedule?: string
          suggested?: boolean
          title?: string
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
      agent_runs: {
        Row: {
          changes: Json
          cost_cents: number
          created_at: string
          current_step: number
          errors: Json
          event_id: string | null
          finished_at: string | null
          goal: string
          id: string
          idempotency_key: string | null
          next_wake_at: string | null
          plan: Json
          progress: number
          result: string
          retries: number
          routine_id: string | null
          scope: string[]
          status: string
          surface: string
          updated_at: string
          user_id: string
          waiting_reason: string
          workspace_id: string | null
        }
        Insert: {
          changes?: Json
          cost_cents?: number
          created_at?: string
          current_step?: number
          errors?: Json
          event_id?: string | null
          finished_at?: string | null
          goal: string
          id?: string
          idempotency_key?: string | null
          next_wake_at?: string | null
          plan?: Json
          progress?: number
          result?: string
          retries?: number
          routine_id?: string | null
          scope?: string[]
          status?: string
          surface?: string
          updated_at?: string
          user_id: string
          waiting_reason?: string
          workspace_id?: string | null
        }
        Update: {
          changes?: Json
          cost_cents?: number
          created_at?: string
          current_step?: number
          errors?: Json
          event_id?: string | null
          finished_at?: string | null
          goal?: string
          id?: string
          idempotency_key?: string | null
          next_wake_at?: string | null
          plan?: Json
          progress?: number
          result?: string
          retries?: number
          routine_id?: string | null
          scope?: string[]
          status?: string
          surface?: string
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
      audit_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event: string
          id: number
          metadata: Json
          workspace_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event: string
          id?: never
          metadata?: Json
          workspace_id?: string | null
        }
        Update: {
          actor_id?: string | null
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
          response_deadline: string | null
          role: string
          scope: string
          sort: number
          status: string
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
          response_deadline?: string | null
          role?: string
          scope?: string
          sort?: number
          status?: string
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
          response_deadline?: string | null
          role?: string
          scope?: string
          sort?: number
          status?: string
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
      check_ins: {
        Row: {
          created_at: string
          event_id: string
          id: number
          result: string
          scanned_by: string | null
          ticket_id: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: never
          result: string
          scanned_by?: string | null
          ticket_id?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: never
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
      crew_members: {
        Row: {
          avatar: string
          bio: string
          created_at: string
          day_rate: number | null
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
      partners: {
        Row: {
          commission_basis: string
          commission_bps: number
          created_at: string
          details: Json
          earned: number
          eligible_revenue: number
          id: string
          kind: string
          logo: string
          name: string
          paid: number
          quality_score: number | null
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
          id?: string
          kind: string
          logo?: string
          name: string
          paid?: number
          quality_score?: number | null
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
          id?: string
          kind?: string
          logo?: string
          name?: string
          paid?: number
          quality_score?: number | null
          referral_code?: string | null
          referrals?: number
          status?: string
          user_id?: string | null
        }
        Relationships: []
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
      platform_settings: {
        Row: {
          approved_by: string | null
          change_reason: string
          created_at: string
          created_by: string | null
          effective_at: string | null
          id: string
          section: string
          status: string
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
          section: string
          status?: string
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
          section?: string
          status?: string
          value?: Json
          version?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string
          created_at: string
          currency: string
          full_name: string
          home_area: string
          id: string
          identity_verified: boolean
          interests: string[]
          last_active_at: string | null
          last_workspace_id: string | null
          marketing_opt_in: boolean
          marketing_opt_in_at: string | null
          notifications: Json
          onboarding_complete: boolean
          status: string
          terms_accepted_at: string | null
          terms_version: string | null
        }
        Insert: {
          avatar_url?: string
          created_at?: string
          currency?: string
          full_name?: string
          home_area?: string
          id: string
          identity_verified?: boolean
          interests?: string[]
          last_active_at?: string | null
          last_workspace_id?: string | null
          marketing_opt_in?: boolean
          marketing_opt_in_at?: string | null
          notifications?: Json
          onboarding_complete?: boolean
          status?: string
          terms_accepted_at?: string | null
          terms_version?: string | null
        }
        Update: {
          avatar_url?: string
          created_at?: string
          currency?: string
          full_name?: string
          home_area?: string
          id?: string
          identity_verified?: boolean
          interests?: string[]
          last_active_at?: string | null
          last_workspace_id?: string | null
          marketing_opt_in?: boolean
          marketing_opt_in_at?: string | null
          notifications?: Json
          onboarding_complete?: boolean
          status?: string
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
      promoters: {
        Row: {
          clicks: number
          code: string
          commission_pct: number
          event_id: string
          id: string
          name: string
          revenue: number
          status: string
          tickets_sold: number
        }
        Insert: {
          clicks?: number
          code: string
          commission_pct?: number
          event_id: string
          id?: string
          name: string
          revenue?: number
          status?: string
          tickets_sold?: number
        }
        Update: {
          clicks?: number
          code?: string
          commission_pct?: number
          event_id?: string
          id?: string
          name?: string
          revenue?: number
          status?: string
          tickets_sold?: number
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
      reviews: {
        Row: {
          body: string
          build_item_id: string | null
          created_at: string
          id: string
          listing_id: string | null
          rating: number
          ratings: Json
          status: string
          user_id: string
        }
        Insert: {
          body?: string
          build_item_id?: string | null
          created_at?: string
          id?: string
          listing_id?: string | null
          rating: number
          ratings?: Json
          status?: string
          user_id: string
        }
        Update: {
          body?: string
          build_item_id?: string | null
          created_at?: string
          id?: string
          listing_id?: string | null
          rating?: number
          ratings?: Json
          status?: string
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
        }
        Insert: {
          author: string
          author_id?: string | null
          body: string
          case_id: string
          created_at?: string
          id?: never
          internal?: boolean
        }
        Update: {
          author?: string
          author_id?: string | null
          body?: string
          case_id?: string
          created_at?: string
          id?: never
          internal?: boolean
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
      ticket_tiers: {
        Row: {
          allocation: string
          badge: string | null
          color: string
          description: string
          event_id: string
          held: number
          id: string
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
        }
        Insert: {
          allocation?: string
          badge?: string | null
          color?: string
          description?: string
          event_id: string
          held?: number
          id?: string
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
        }
        Update: {
          allocation?: string
          badge?: string | null
          color?: string
          description?: string
          event_id?: string
          held?: number
          id?: string
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
        }
        Relationships: [
          {
            foreignKeyName: "ticket_tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
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
          risk_score: number
          status: string
          subject_id: string | null
          subject_name: string
          subject_type: string
        }
        Insert: {
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
          risk_score?: number
          status?: string
          subject_id?: string | null
          subject_name: string
          subject_type: string
        }
        Update: {
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
          risk_score?: number
          status?: string
          subject_id?: string | null
          subject_name?: string
          subject_type?: string
        }
        Relationships: []
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
      accept_proposal: {
        Args: {
          p_email: string
          p_name: string
          p_token: string
          p_version: number
        }
        Returns: string
      }
      admin_assign_case: { Args: { p_case: string }; Returns: undefined }
      admin_decide_agent_approval: {
        Args: { p_approval: string; p_approve: boolean }
        Returns: undefined
      }
      admin_decide_trust: {
        Args: { p_case: string; p_decision: string; p_reason: string }
        Returns: undefined
      }
      admin_publish_setting: {
        Args: {
          p_effective?: string
          p_reason: string
          p_section: string
          p_value: Json
        }
        Returns: number
      }
      admin_reply_case: {
        Args: { p_body: string; p_case: string; p_internal: boolean }
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
      admin_set_integration: {
        Args: { p_enabled: boolean; p_id: string; p_reason: string }
        Returns: undefined
      }
      admin_set_partner_status: {
        Args: { p_partner: string; p_reason: string; p_status: string }
        Returns: undefined
      }
      admin_set_user_status: {
        Args: { p_reason: string; p_status: string; p_user: string }
        Returns: undefined
      }
      admin_set_workspace_status: {
        Args: { p_reason: string; p_status: string; p_ws: string }
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
      agent_control_run: {
        Args: { p_action: string; p_run: string }
        Returns: undefined
      }
      can_access_event: { Args: { target: string }; Returns: boolean }
      can_edit_event: { Args: { target: string }; Returns: boolean }
      can_see_event_money: { Args: { target: string }; Returns: boolean }
      can_write_listing_media: {
        Args: { object_name: string }
        Returns: boolean
      }
      check_in_ticket: {
        Args: { p_code: string; p_event: string; p_nonce?: string }
        Returns: Json
      }
      complete_customer_onboarding: { Args: never; Returns: undefined }
      complete_workspace_onboarding: {
        Args: { p_workspace: string }
        Returns: undefined
      }
      credit_invoice: { Args: { p_invoice: string }; Returns: undefined }
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
        Args: { p_approval: string; p_approve: boolean }
        Returns: {
          action: string
          amount: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          detail: string
          event_id: string | null
          expires_at: string | null
          id: string
          impact: string
          payload: Json
          run_id: string | null
          status: string
          title: string
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "agent_approvals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      event_readiness: { Args: { p_event: string }; Returns: Json }
      expire_seat_holds: { Args: { p_event?: string }; Returns: number }
      expire_stale_items: { Args: never; Returns: number }
      has_admin_permission: { Args: { p: string }; Returns: boolean }
      has_workspace_role: {
        Args: { roles: string[]; target: string }
        Returns: boolean
      }
      hit_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      hold_seats: {
        Args: { p_event: string; p_keys: string[]; p_token: string }
        Returns: Json
      }
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
      is_listing_provider: { Args: { p_listing: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_provider_for_event: { Args: { p_event: string }; Returns: boolean }
      is_workspace_member: { Args: { target: string }; Returns: boolean }
      is_workspace_owner: { Args: { target: string }; Returns: boolean }
      issue_invoice: { Args: { p_invoice: string }; Returns: undefined }
      issue_proposal: { Args: { p_proposal: string }; Returns: number }
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
      list_ticket_for_resale: {
        Args: { p_cancel?: boolean; p_ticket: string }
        Returns: string
      }
      listing_availability: {
        Args: { p_end: string; p_listing: string; p_start: string }
        Returns: string
      }
      listing_readiness: { Args: { p_listing: string }; Returns: Json }
      log_auth_event: { Args: { p_event: string }; Returns: undefined }
      mark_proposal_converted: {
        Args: { p_event: string; p_proposal: string }
        Returns: undefined
      }
      mark_proposal_viewed: { Args: { p_token: string }; Returns: undefined }
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
      proposal_by_token: { Args: { p_token: string }; Returns: Json }
      provider_assign_crew: {
        Args: { p_crew: string; p_job: string; p_role: string }
        Returns: string
      }
      provider_create_booking: {
        Args: { p: Json; p_ws: string }
        Returns: string
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
      provider_pause_listing: {
        Args: { p_listing: string; p_pause: boolean }
        Returns: undefined
      }
      provider_release_hold: { Args: { p_item: string }; Returns: undefined }
      provider_respond: {
        Args: { p_item: string; p_note?: string; p_response: string }
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
      provider_set_space_links: {
        Args: {
          p_exclusive: string[]
          p_linked: string[]
          p_space: string
          p_ws: string
        }
        Returns: undefined
      }
      provider_withdraw_quote: { Args: { p_quote: string }; Returns: undefined }
      publish_listing: { Args: { p_listing: string }; Returns: Json }
      quote_totals: {
        Args: { p_discount?: number; p_items: Json; p_tax_bps: number }
        Returns: {
          subtotal: number
          tax: number
          total: number
        }[]
      }
      release_seat_holds: { Args: { p_token: string }; Returns: number }
      remember_workspace: { Args: { p_workspace: string }; Returns: undefined }
      require_provider_role: {
        Args: { p_roles: string[]; p_ws: string }
        Returns: undefined
      }
      respond_to_invite: {
        Args: { p_accept: boolean; p_invite_id: string; p_token_hash: string }
        Returns: Json
      }
      revise_proposal: { Args: { p_proposal: string }; Returns: undefined }
      seed_backfill_tickets: { Args: { p_days?: number }; Returns: number }
      seed_shift_event: {
        Args: { p_days: number; p_slug: string }
        Returns: undefined
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
          response_deadline: string | null
          role: string
          scope: string
          sort: number
          status: string
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
      upgrade_event_to_professional: {
        Args: { p_event: string; p_workspace: string }
        Returns: undefined
      }
      withdraw_proposal: { Args: { p_proposal: string }; Returns: undefined }
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
