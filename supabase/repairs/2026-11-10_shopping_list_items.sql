-- ==============================================================================
-- One-time repair: put the items Jarvis added on 2026-11-10 (n8n run #2341)
-- onto the Household "Shopping List" page, if they are not already there.
--
-- Safe to run more than once: an item that is already on the page (checked or
-- not) is left alone. Existing (hand-typed) cards are never modified; items are
-- added to the page's checklist card, or a new checklist card is created
-- below the existing content.
-- ==============================================================================
DO $$
DECLARE
  v_page_id  UUID := 'cf69a977-a2f9-487d-bb64-d0909e6aa3fc';
  v_items    TEXT[] := ARRAY['milk', 'sour cream'];
  v_added_by TEXT := 'Samuel';
  v_doc      JSONB;
  v_texts    JSONB;
  v_card     INT := -1;
  v_len      INT;
  v_i        INT;
  v_item     TEXT;
  v_exists   BOOLEAN;
  v_max_y    NUMERIC := 280;
  v_now      TIMESTAMPTZ := NOW();
BEGIN
  SELECT document_state INTO v_doc FROM public.pages WHERE id = v_page_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE NOTICE 'Shopping List page % not found - nothing to repair', v_page_id;
    RETURN;
  END IF;

  v_doc   := COALESCE(v_doc, '{}'::jsonb);
  v_texts := COALESCE(v_doc->'texts', '[]'::jsonb);
  v_len   := jsonb_array_length(v_texts);

  -- Find the checklist card (one that carries item metadata) and the lowest card
  FOR v_i IN 0 .. v_len - 1 LOOP
    IF v_card = -1 AND jsonb_typeof(v_texts->v_i->'itemsMeta') = 'array' THEN
      v_card := v_i;
    END IF;
    v_max_y := GREATEST(v_max_y, COALESCE((v_texts->v_i->>'y')::numeric, 0) + 120);
  END LOOP;

  IF v_card = -1 THEN
    v_texts := v_texts || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(),
      'x', 64,
      'y', CASE WHEN v_len = 0 THEN 280 ELSE v_max_y END,
      'width', 480,
      'content', '',
      'itemsMeta', '[]'::jsonb,
      'checklist', true
    ));
    v_card := v_len;
  END IF;

  FOREACH v_item IN ARRAY v_items LOOP
    -- Already on the page anywhere (checked or unchecked)?
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_texts) AS t,
           regexp_split_to_table(
             regexp_replace(COALESCE(t->>'content', ''), '</(p|li|div|h[1-6])>|<br\s*/?>', E'\n', 'gi'),
             E'\n'
           ) AS line
      WHERE lower(btrim(regexp_replace(
              regexp_replace(line, '<[^>]+>', '', 'g'),
              '^\s*([-*•]\s*)?(\[[ xX]?\]\s*)?', ''
            ))) = lower(v_item)
    ) INTO v_exists;

    IF NOT v_exists THEN
      v_texts := jsonb_set(
        v_texts,
        ARRAY[v_card::text, 'content'],
        to_jsonb(COALESCE(v_texts->v_card->>'content', '') || '<p>- [ ] ' || v_item || '</p>')
      );
      v_texts := jsonb_set(
        v_texts,
        ARRAY[v_card::text, 'itemsMeta'],
        COALESCE(v_texts->v_card->'itemsMeta', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object('text', v_item, 'addedBy', v_added_by, 'addedByOwner', true))
      );
      RAISE NOTICE 'Added "%" to the Shopping List', v_item;
    ELSE
      RAISE NOTICE '"%" is already on the Shopping List', v_item;
    END IF;
  END LOOP;

  v_doc := jsonb_set(v_doc, '{texts}', v_texts)
        || jsonb_build_object(
             '_updatedAt', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
             '_clientUpdatedAt', floor(extract(epoch FROM v_now) * 1000)
           );

  UPDATE public.pages SET document_state = v_doc WHERE id = v_page_id;
END;
$$;
