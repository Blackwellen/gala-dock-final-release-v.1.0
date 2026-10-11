-- Price book aligned to the configured deployments (AGENT_MODEL_MINI=gpt-5.4-mini, AGENT_MODEL_NANO=gpt-5.4-nano). Third-party list-price
-- trackers, 11 Oct 2026 (Azure's own page showed no figures): mini $0.75 in / $4.50 out; nano $0.20 in / $0.02 cached / $1.25 out.
-- Mini cached rate assumed at 10% of input. Still source='estimate' until the Azure contract price book is entered.
update public.ai_model_prices set input_per_mtok = 0.75, cached_input_per_mtok = 0.075, output_per_mtok = 4.50, updated_at = now() where model = 'standard';
update public.ai_model_prices set input_per_mtok = 0.20, cached_input_per_mtok = 0.02, output_per_mtok = 1.25, updated_at = now() where model = 'fast';
