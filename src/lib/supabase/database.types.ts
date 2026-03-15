export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.4";
  };
  public: {
    Tables: {
      billing_customers: {
        Row: {
          created_at: string;
          id: string;
          livemode: boolean;
          metadata: Json;
          stripe_customer_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          livemode: boolean;
          metadata?: Json;
          stripe_customer_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          livemode?: boolean;
          metadata?: Json;
          stripe_customer_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_customers_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "studio_accounts";
            referencedColumns: ["user_id"];
          },
        ];
      };
      credit_ledger: {
        Row: {
          balance_after: number;
          created_at: string;
          delta_credits: number;
          id: string;
          idempotency_key: string | null;
          metadata: Json;
          reason: string;
          related_run_id: string | null;
          source_event_id: string | null;
          user_id: string;
        };
        Insert: {
          balance_after: number;
          created_at?: string;
          delta_credits: number;
          id?: string;
          idempotency_key?: string | null;
          metadata?: Json;
          reason: string;
          related_run_id?: string | null;
          source_event_id?: string | null;
          user_id: string;
        };
        Update: {
          balance_after?: number;
          created_at?: string;
          delta_credits?: number;
          id?: string;
          idempotency_key?: string | null;
          metadata?: Json;
          reason?: string;
          related_run_id?: string | null;
          source_event_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credit_ledger_related_run_id_fkey";
            columns: ["related_run_id"];
            isOneToOne: false;
            referencedRelation: "generation_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_ledger_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "studio_accounts";
            referencedColumns: ["user_id"];
          },
        ];
      };
      credit_packs: {
        Row: {
          created_at: string;
          credits: number;
          currency: string;
          display_order: number;
          id: string;
          is_active: boolean;
          metadata: Json;
          name: string;
          price_cents: number;
          slug: string;
          stripe_price_id_live: string | null;
          stripe_price_id_test: string | null;
          stripe_product_id_live: string | null;
          stripe_product_id_test: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          credits: number;
          currency?: string;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          metadata?: Json;
          name: string;
          price_cents: number;
          slug: string;
          stripe_price_id_live?: string | null;
          stripe_price_id_test?: string | null;
          stripe_product_id_live?: string | null;
          stripe_product_id_test?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          credits?: number;
          currency?: string;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          metadata?: Json;
          name?: string;
          price_cents?: number;
          slug?: string;
          stripe_price_id_live?: string | null;
          stripe_price_id_test?: string | null;
          stripe_product_id_live?: string | null;
          stripe_product_id_test?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      credit_purchases: {
        Row: {
          amount_cents: number;
          checkout_request_id: string | null;
          created_at: string;
          credit_pack_id: string;
          credited_at: string | null;
          credits_amount: number;
          currency: string;
          fulfilled_ledger_entry_id: string | null;
          id: string;
          livemode: boolean;
          metadata: Json;
          quantity: number;
          refund_ledger_entry_id: string | null;
          refunded_amount_cents: number;
          refunded_credits: number;
          refunded_at: string | null;
          status: string;
          stripe_charge_id: string | null;
          stripe_checkout_url: string | null;
          stripe_checkout_session_id: string | null;
          stripe_customer_id: string | null;
          stripe_payment_intent_id: string | null;
          stripe_refund_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount_cents: number;
          checkout_request_id?: string | null;
          created_at?: string;
          credit_pack_id: string;
          credited_at?: string | null;
          credits_amount: number;
          currency?: string;
          fulfilled_ledger_entry_id?: string | null;
          id?: string;
          livemode: boolean;
          metadata?: Json;
          quantity?: number;
          refund_ledger_entry_id?: string | null;
          refunded_amount_cents?: number;
          refunded_credits?: number;
          refunded_at?: string | null;
          status: string;
          stripe_charge_id?: string | null;
          stripe_checkout_url?: string | null;
          stripe_checkout_session_id?: string | null;
          stripe_customer_id?: string | null;
          stripe_payment_intent_id?: string | null;
          stripe_refund_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount_cents?: number;
          checkout_request_id?: string | null;
          created_at?: string;
          credit_pack_id?: string;
          credited_at?: string | null;
          credits_amount?: number;
          currency?: string;
          fulfilled_ledger_entry_id?: string | null;
          id?: string;
          livemode?: boolean;
          metadata?: Json;
          quantity?: number;
          refund_ledger_entry_id?: string | null;
          refunded_amount_cents?: number;
          refunded_credits?: number;
          refunded_at?: string | null;
          status?: string;
          stripe_charge_id?: string | null;
          stripe_checkout_url?: string | null;
          stripe_checkout_session_id?: string | null;
          stripe_customer_id?: string | null;
          stripe_payment_intent_id?: string | null;
          stripe_refund_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credit_purchases_credit_pack_id_fkey";
            columns: ["credit_pack_id"];
            isOneToOne: false;
            referencedRelation: "credit_packs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_purchases_fulfilled_ledger_entry_id_fkey";
            columns: ["fulfilled_ledger_entry_id"];
            isOneToOne: false;
            referencedRelation: "credit_ledger";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_purchases_refund_ledger_entry_id_fkey";
            columns: ["refund_ledger_entry_id"];
            isOneToOne: false;
            referencedRelation: "credit_ledger";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_purchases_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "studio_accounts";
            referencedColumns: ["user_id"];
          },
        ];
      };
      feedback_submissions: {
        Row: {
          created_at: string;
          id: string;
          message: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      folders: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          sort_order: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          sort_order?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "folders_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "studio_accounts";
            referencedColumns: ["user_id"];
          },
        ];
      };
      generation_run_inputs: {
        Row: {
          created_at: string;
          id: string;
          input_role: string;
          library_item_id: string | null;
          position: number;
          run_file_id: string | null;
          run_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          input_role: string;
          library_item_id?: string | null;
          position?: number;
          run_file_id?: string | null;
          run_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          input_role?: string;
          library_item_id?: string | null;
          position?: number;
          run_file_id?: string | null;
          run_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "generation_run_inputs_library_item_id_fkey";
            columns: ["library_item_id"];
            isOneToOne: false;
            referencedRelation: "library_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_run_inputs_run_file_id_fkey";
            columns: ["run_file_id"];
            isOneToOne: false;
            referencedRelation: "run_files";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_run_inputs_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "generation_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_run_inputs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "studio_accounts";
            referencedColumns: ["user_id"];
          },
        ];
      };
      generation_runs: {
        Row: {
          actual_cost_usd: number | null;
          actual_credits: number | null;
          can_cancel: boolean;
          cancelled_at: string | null;
          completed_at: string | null;
          created_at: string;
          deleted_at: string | null;
          dispatch_attempt_count: number;
          dispatch_lease_expires_at: string | null;
          draft_snapshot: Json;
          error_message: string | null;
          estimated_cost_usd: number | null;
          estimated_credits: number | null;
          failed_at: string | null;
          folder_id: string | null;
          id: string;
          input_payload: Json;
          input_settings: Json;
          kind: string;
          model_id: string;
          model_name: string;
          output_asset_id: string | null;
          output_text: string | null;
          preview_url: string | null;
          pricing_snapshot: Json;
          prompt: string;
          provider: string;
          provider_request_id: string | null;
          provider_status: string | null;
          queue_entered_at: string;
          request_mode: string;
          started_at: string | null;
          status: string;
          summary: string;
          updated_at: string;
          usage_snapshot: Json;
          user_id: string;
        };
        Insert: {
          actual_cost_usd?: number | null;
          actual_credits?: number | null;
          can_cancel?: boolean;
          cancelled_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          dispatch_attempt_count?: number;
          dispatch_lease_expires_at?: string | null;
          draft_snapshot?: Json;
          error_message?: string | null;
          estimated_cost_usd?: number | null;
          estimated_credits?: number | null;
          failed_at?: string | null;
          folder_id?: string | null;
          id?: string;
          input_payload?: Json;
          input_settings?: Json;
          kind: string;
          model_id: string;
          model_name: string;
          output_asset_id?: string | null;
          output_text?: string | null;
          preview_url?: string | null;
          pricing_snapshot?: Json;
          prompt?: string;
          provider?: string;
          provider_request_id?: string | null;
          provider_status?: string | null;
          queue_entered_at?: string;
          request_mode: string;
          started_at?: string | null;
          status: string;
          summary?: string;
          updated_at?: string;
          usage_snapshot?: Json;
          user_id: string;
        };
        Update: {
          actual_cost_usd?: number | null;
          actual_credits?: number | null;
          can_cancel?: boolean;
          cancelled_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          dispatch_attempt_count?: number;
          dispatch_lease_expires_at?: string | null;
          draft_snapshot?: Json;
          error_message?: string | null;
          estimated_cost_usd?: number | null;
          estimated_credits?: number | null;
          failed_at?: string | null;
          folder_id?: string | null;
          id?: string;
          input_payload?: Json;
          input_settings?: Json;
          kind?: string;
          model_id?: string;
          model_name?: string;
          output_asset_id?: string | null;
          output_text?: string | null;
          preview_url?: string | null;
          pricing_snapshot?: Json;
          prompt?: string;
          provider?: string;
          provider_request_id?: string | null;
          provider_status?: string | null;
          queue_entered_at?: string;
          request_mode?: string;
          started_at?: string | null;
          status?: string;
          summary?: string;
          updated_at?: string;
          usage_snapshot?: Json;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "generation_runs_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_runs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "studio_accounts";
            referencedColumns: ["user_id"];
          },
        ];
      };
      library_items: {
        Row: {
          aspect_ratio_label: string | null;
          byte_size: number | null;
          content_text: string | null;
          created_at: string;
          error_message: string | null;
          file_name: string | null;
          folder_id: string | null;
          has_alpha: boolean;
          id: string;
          kind: string;
          media_duration_seconds: number | null;
          media_height: number | null;
          media_width: number | null;
          meta: string;
          metadata: Json;
          mime_type: string | null;
          model_id: string | null;
          prompt: string;
          provider: string;
          role: string;
          run_file_id: string | null;
          run_id: string | null;
          source: string;
          source_run_id: string | null;
          status: string;
          thumbnail_file_id: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          aspect_ratio_label?: string | null;
          byte_size?: number | null;
          content_text?: string | null;
          created_at?: string;
          error_message?: string | null;
          file_name?: string | null;
          folder_id?: string | null;
          has_alpha?: boolean;
          id?: string;
          kind: string;
          media_duration_seconds?: number | null;
          media_height?: number | null;
          media_width?: number | null;
          meta?: string;
          metadata?: Json;
          mime_type?: string | null;
          model_id?: string | null;
          prompt?: string;
          provider?: string;
          role: string;
          run_file_id?: string | null;
          run_id?: string | null;
          source: string;
          source_run_id?: string | null;
          status?: string;
          thumbnail_file_id?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          aspect_ratio_label?: string | null;
          byte_size?: number | null;
          content_text?: string | null;
          created_at?: string;
          error_message?: string | null;
          file_name?: string | null;
          folder_id?: string | null;
          has_alpha?: boolean;
          id?: string;
          kind?: string;
          media_duration_seconds?: number | null;
          media_height?: number | null;
          media_width?: number | null;
          meta?: string;
          metadata?: Json;
          mime_type?: string | null;
          model_id?: string | null;
          prompt?: string;
          provider?: string;
          role?: string;
          run_file_id?: string | null;
          run_id?: string | null;
          source?: string;
          source_run_id?: string | null;
          status?: string;
          thumbnail_file_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "library_items_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "library_items_run_file_id_fkey";
            columns: ["run_file_id"];
            isOneToOne: false;
            referencedRelation: "run_files";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "library_items_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "generation_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "library_items_source_run_id_fkey";
            columns: ["source_run_id"];
            isOneToOne: false;
            referencedRelation: "generation_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "library_items_thumbnail_file_id_fkey";
            columns: ["thumbnail_file_id"];
            isOneToOne: false;
            referencedRelation: "run_files";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "library_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "studio_accounts";
            referencedColumns: ["user_id"];
          },
        ];
      };
      run_files: {
        Row: {
          aspect_ratio_label: string | null;
          created_at: string;
          file_name: string | null;
          file_role: string;
          file_size_bytes: number | null;
          has_alpha: boolean;
          id: string;
          media_duration_seconds: number | null;
          media_height: number | null;
          media_width: number | null;
          metadata: Json;
          mime_type: string | null;
          run_id: string | null;
          source_type: string;
          storage_bucket: string;
          storage_path: string;
          user_id: string;
        };
        Insert: {
          aspect_ratio_label?: string | null;
          created_at?: string;
          file_name?: string | null;
          file_role: string;
          file_size_bytes?: number | null;
          has_alpha?: boolean;
          id?: string;
          media_duration_seconds?: number | null;
          media_height?: number | null;
          media_width?: number | null;
          metadata?: Json;
          mime_type?: string | null;
          run_id?: string | null;
          source_type: string;
          storage_bucket: string;
          storage_path: string;
          user_id: string;
        };
        Update: {
          aspect_ratio_label?: string | null;
          created_at?: string;
          file_name?: string | null;
          file_role?: string;
          file_size_bytes?: number | null;
          has_alpha?: boolean;
          id?: string;
          media_duration_seconds?: number | null;
          media_height?: number | null;
          media_width?: number | null;
          metadata?: Json;
          mime_type?: string | null;
          run_id?: string | null;
          source_type?: string;
          storage_bucket?: string;
          storage_path?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "run_files_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "generation_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "run_files_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "studio_accounts";
            referencedColumns: ["user_id"];
          },
        ];
      };
      stripe_webhook_events: {
        Row: {
          created_at: string;
          error_message: string | null;
          event_type: string;
          id: string;
          livemode: boolean;
          payload: Json;
          processed_at: string | null;
          status: string;
          stripe_event_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          error_message?: string | null;
          event_type: string;
          id?: string;
          livemode: boolean;
          payload?: Json;
          processed_at?: string | null;
          status: string;
          stripe_event_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          error_message?: string | null;
          event_type?: string;
          id?: string;
          livemode?: boolean;
          payload?: Json;
          processed_at?: string | null;
          status?: string;
          stripe_event_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      studio_accounts: {
        Row: {
          active_credit_pack: number | null;
          avatar_label: string;
          avatar_url: string | null;
          created_at: string;
          credit_balance: number;
          display_name: string;
          enabled_model_ids: string[];
          gallery_size_level: number;
          revision: number;
          selected_model_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active_credit_pack?: number | null;
          avatar_label?: string;
          avatar_url?: string | null;
          created_at?: string;
          credit_balance?: number;
          display_name?: string;
          enabled_model_ids?: string[];
          gallery_size_level?: number;
          revision?: number;
          selected_model_id?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active_credit_pack?: number | null;
          avatar_label?: string;
          avatar_url?: string | null;
          created_at?: string;
          credit_balance?: number;
          display_name?: string;
          enabled_model_ids?: string[];
          gallery_size_level?: number;
          revision?: number;
          selected_model_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      studio_system_config: {
        Row: {
          created_at: string;
          id: boolean;
          local_concurrency_limit: number;
          max_active_jobs_per_user: number;
          provider_slot_limit: number;
          rotation_slice_ms: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: boolean;
          local_concurrency_limit?: number;
          max_active_jobs_per_user?: number;
          provider_slot_limit?: number;
          rotation_slice_ms?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: boolean;
          local_concurrency_limit?: number;
          max_active_jobs_per_user?: number;
          provider_slot_limit?: number;
          rotation_slice_ms?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apply_tryplayground_credit_ledger_entry: {
        Args: {
          p_active_credit_pack?: number;
          p_allow_negative_balance?: boolean;
          p_delta_credits: number;
          p_idempotency_key?: string;
          p_metadata?: Json;
          p_reason: string;
          p_related_run_id?: string;
          p_source_event_id?: string;
          p_user_id: string;
        };
        Returns: {
          balance_after: number;
          created_at: string;
          delta_credits: number;
          id: string;
          idempotency_key: string | null;
          metadata: Json;
          reason: string;
          related_run_id: string | null;
          source_event_id: string | null;
          user_id: string;
        };
      };
      bump_studio_account_revision: {
        Args: { target_user_id: string };
        Returns: undefined;
      };
      fulfill_tryplayground_credit_purchase: {
        Args: {
          p_metadata?: Json;
          p_purchase_id: string;
          p_source_event_id?: string;
          p_stripe_charge_id?: string;
          p_stripe_checkout_session_id?: string;
          p_stripe_customer_id?: string;
          p_stripe_payment_intent_id?: string;
        };
        Returns: {
          amount_cents: number;
          created_at: string;
          credit_pack_id: string;
          credited_at: string | null;
          credits_amount: number;
          currency: string;
          fulfilled_ledger_entry_id: string | null;
          id: string;
          livemode: boolean;
          metadata: Json;
          quantity: number;
          refund_ledger_entry_id: string | null;
          refunded_at: string | null;
          status: string;
          stripe_charge_id: string | null;
          stripe_checkout_session_id: string | null;
          stripe_customer_id: string | null;
          stripe_payment_intent_id: string | null;
          stripe_refund_id: string | null;
          updated_at: string;
          user_id: string;
        };
      };
      get_tryplayground_active_hosted_user_count: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
