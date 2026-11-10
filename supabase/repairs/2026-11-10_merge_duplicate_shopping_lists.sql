-- ==============================================================================
-- Merge duplicate "Shopping List" notes in the Household notebook into the one
-- the editor shows (id cf69a977-..., created Fri Nov 6, 12:15 PM).
--
-- 1. (Optional) see what exists first — run just this SELECT:
--
--    SELECT p.id, p.title, p.created_at, n.title AS notebook, s.title AS section,
--           p.deleted_at, p.document_state->'texts' AS texts
--    FROM public.pages p
--    JOIN public.sections s ON s.id = p.section_id
--    JOIN public.notebooks n ON n.id = s.notebook_id
--    WHERE lower(btrim(p.title)) = 'shopping list'
--    ORDER BY p.created_at;
--
-- 2. Run the DO block below. For every other non-deleted note titled
--    "Shopping List" in the same notebook:
--      - each list line not already on the main note is added to its checklist
--        (keeping checked state and addedBy/addedByOwner);
--      - the duplicate is moved to Trash (deleted_at = now()), so it can be
--        restored from the app's Trash if needed.
--    Hand-typed cards on the main note are never modified.
--    Safe to run more than once (later runs find nothing to merge).
-- ==============================================================================
DO $$
DECLARE
  v_main_id    UUID := 'cf69a977-a2f9-487d-bb64-d0909e6aa3fc';
  v_notebook   UUID;
  v_doc        JSONB;
  v_texts      JSONB;
  v_card       INT := -1;
  v_len        INT;
  v_i          INT;
  v_max_y      NUMERIC := 280;
  v_keys       TEXT[] := ARRAY[]::TEXT[];
  v_dup        RECORD;
  v_line       RECORD;
  v_meta       JSONB;
  v_merged     INT := 0;
  v_dups       INT := 0;
  v_now        TIMESTAMPTZ := NOW();
BEGIN
  SELECT p.document_state, s.notebook_id INTO v_doc, v_notebook
  FROM public.pages p JOIN public.sections s ON s.id = p.section_id
  WHERE p.id = v_main_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE NOTICE 'Main Shopping List % not found - nothing to do', v_main_id;
    RETURN;
  END IF;

  v_doc   := COALESCE(v_doc, '{}'::jsonb);
  v_texts := COALESCE(v_doc->'texts', '[]'::jsonb);
  v_len   := jsonb_array_length(v_texts);

  FOR v_i IN 0 .. v_len - 1 LOOP
    IF v_card = -1 AND jsonb_typeof(v_texts->v_i->'itemsMeta') = 'array' THEN
      v_card := v_i;
    END IF;
    v_max_y := GREATEST(v_max_y, COALESCE((v_texts->v_i->>'y')::numeric, 0) + 120);
  END LOOP;

  -- Items already on the main note (any card, checked or not)
  SELECT COALESCE(array_agg(DISTINCT k), ARRAY[]::TEXT[]) INTO v_keys
  FROM (
    SELECT lower(btrim(regexp_replace(regexp_replace(line, '<[^>]+>', '', 'g'),
                 '^\s*([-*•]\s*)?(\[[ xX]?\]\s*)?', ''))) AS k
    FROM jsonb_array_elements(v_texts) AS t,
         regexp_split_to_table(regexp_replace(COALESCE(t->>'content', ''),
           '</(p|li|div|h[1-6])>|<br\s*/?>', E'\n', 'gi'), E'\n') AS line
  ) x WHERE k <> '';

  FOR v_dup IN
    SELECT p.id, p.created_at, p.document_state
    FROM public.pages p
    JOIN public.sections s ON s.id = p.section_id
    WHERE s.notebook_id = v_notebook
      AND p.id <> v_main_id
      AND p.deleted_at IS NULL
      AND lower(btrim(p.title)) = 'shopping list'
    ORDER BY p.created_at
  LOOP
    v_dups := v_dups + 1;
    RAISE NOTICE 'Merging duplicate Shopping List % (created %)', v_dup.id, v_dup.created_at;

    FOR v_line IN
      SELECT t.ord AS card_ord, l.ord AS line_ord, t.card,
             (regexp_match(regexp_replace(l.line, '<[^>]+>', '', 'g'),
                           '^\s*(?:[-*•]\s*)?(?:\[([ xX]?)\]\s*)?(.*)$')) AS m
      FROM jsonb_array_elements(COALESCE(v_dup.document_state->'texts', '[]'::jsonb)) WITH ORDINALITY AS t(card, ord),
           regexp_split_to_table(regexp_replace(COALESCE(t.card->>'content', ''),
             '</(p|li|div|h[1-6])>|<br\s*/?>', E'\n', 'gi'), E'\n') WITH ORDINALITY AS l(line, ord)
      ORDER BY t.ord, l.ord
    LOOP
      CONTINUE WHEN v_line.m IS NULL OR btrim(COALESCE(v_line.m[2], '')) = '';
      CONTINUE WHEN lower(btrim(v_line.m[2])) = ANY(v_keys);

      -- Create a checklist card on the main note the first time we need one
      IF v_card = -1 THEN
        v_texts := v_texts || jsonb_build_array(jsonb_build_object(
          'id', gen_random_uuid(), 'x', 64,
          'y', CASE WHEN v_len = 0 THEN 280 ELSE v_max_y END,
          'width', 480, 'content', '', 'itemsMeta', '[]'::jsonb, 'checklist', true));
        v_card := v_len;
      END IF;

      SELECT e INTO v_meta
      FROM jsonb_array_elements(COALESCE(v_line.card->'itemsMeta', '[]'::jsonb)) AS e
      WHERE lower(btrim(e->>'text')) = lower(btrim(v_line.m[2]))
      LIMIT 1;

      v_texts := jsonb_set(v_texts, ARRAY[v_card::text, 'content'], to_jsonb(
        COALESCE(v_texts->v_card->>'content', '') || '<p>- ' ||
        CASE WHEN lower(COALESCE(v_line.m[1], '')) = 'x' THEN '[x] ' ELSE '[ ] ' END ||
        btrim(v_line.m[2]) || '</p>'));
      v_texts := jsonb_set(v_texts, ARRAY[v_card::text, 'itemsMeta'],
        COALESCE(v_texts->v_card->'itemsMeta', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'text', btrim(v_line.m[2]),
          'addedBy', v_meta->'addedBy',
          'addedByOwner', COALESCE((v_meta->>'addedByOwner')::boolean, true))));
      v_keys := v_keys || lower(btrim(v_line.m[2]));
      v_merged := v_merged + 1;
    END LOOP;

    UPDATE public.pages SET deleted_at = v_now WHERE id = v_dup.id;
  END LOOP;

  IF v_dups = 0 THEN
    RAISE NOTICE 'No duplicate Shopping List notes found - nothing to merge';
    RETURN;
  END IF;

  v_doc := jsonb_set(v_doc, '{texts}', v_texts)
        || jsonb_build_object(
             '_updatedAt', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
             '_clientUpdatedAt', floor(extract(epoch FROM v_now) * 1000));
  UPDATE public.pages SET document_state = v_doc WHERE id = v_main_id;
  RAISE NOTICE 'Merged % item(s) from % duplicate(s) into the main Shopping List; duplicates moved to Trash', v_merged, v_dups;
END;
$$;
