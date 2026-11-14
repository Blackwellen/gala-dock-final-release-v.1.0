-- Q63 follow-up: search_rank() as an inlinable SQL expression. The 202611146631 version (CTE + sub-select + SET search_path) could
-- not be inlined, so every candidate row paid a function call: the admin user branch for a common word ("gala", ~700 users) took
-- 55 ms. Same ranking: exact 1.0 > prefix 0.9 > word prefix 0.8 > substring 0.7 > every word present (any order) 0.65 > fuzzy.
-- Not SECURITY DEFINER, no SET clause and STABLE (array_to_string is stable; any of these blocks inlining); every non-catalog
-- function is schema-qualified.
create or replace function public.search_rank(p_text text, p_q text) returns real
language sql stable parallel safe as $$
  select (case
    when btrim(coalesce(p_q, '')) = '' or coalesce(p_text, '') = '' then 0
    when lower(p_text) = lower(btrim(p_q)) then 1.0
    when strpos(lower(p_text), lower(btrim(p_q))) = 1 then 0.9
    when strpos(lower(p_text), ' ' || lower(btrim(p_q))) > 0 or strpos(lower(p_text), '-' || lower(btrim(p_q))) > 0 then 0.8
    when strpos(lower(p_text), lower(btrim(p_q))) > 0 then 0.7
    when lower(p_text) ~ ('^(?=.*' || array_to_string(regexp_split_to_array(regexp_replace(lower(btrim(p_q)), '([^[:alnum:][:space:]])', '\\\1', 'g'), '\s+'), ')(?=.*') || ')') then 0.65
    else 0.6 * greatest(public.word_similarity(lower(btrim(p_q)), lower(p_text)), public.similarity(lower(btrim(p_q)), lower(p_text))) end)::real
$$;
