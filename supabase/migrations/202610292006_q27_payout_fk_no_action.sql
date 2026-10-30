-- Q27 follow-up: the payout links use NO ACTION (checked at statement end) instead of RESTRICT, so cascades that remove a promoter
-- (event deletion → promoters → payouts + sales in one statement) are not refused mid-cascade. A payout that still has sales linked
-- outside such a cascade is still refused.
alter table public.promoter_sales drop constraint if exists promoter_sales_payout_fk;
alter table public.promoter_sales add constraint promoter_sales_payout_fk foreign key (payout_id) references public.promoter_payouts(id);
alter table public.promoter_sales drop constraint if exists promoter_sales_clawback_payout_fk;
alter table public.promoter_sales add constraint promoter_sales_clawback_payout_fk foreign key (clawback_payout_id) references public.promoter_payouts(id);
