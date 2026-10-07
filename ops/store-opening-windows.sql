-- API toStore/priceBasket enforce closure immediately at the end of the window.
-- This persistent scheduler reopens once per work shift without undoing a manual
-- closure during that shift or a separate isAcceptingOrders pause.
CREATE TABLE IF NOT EXISTS ops_store_opening_windows (
 store_id text PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
 window_key text NOT NULL
);

CREATE OR REPLACE FUNCTION samou_store_work_window(opens text, closes text, moment timestamptz)
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE local_now timestamp := moment AT TIME ZONE 'Asia/Hebron';
        clock text := to_char(local_now, 'HH24:MI');
        shift_day date := local_now::date;
BEGIN
 IF opens IS NULL OR closes IS NULL OR opens !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR closes !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RETURN NULL; END IF;
 IF opens < closes AND NOT(clock >= opens AND clock < closes) THEN RETURN NULL; END IF;
 IF opens > closes THEN
  IF NOT(clock >= opens OR clock < closes) THEN RETURN NULL; END IF;
  IF clock < closes THEN shift_day := shift_day - 1; END IF;
 END IF;
 RETURN shift_day::text || '/' || opens || '/' || closes;
END
$$;

CREATE OR REPLACE FUNCTION samou_sync_store_opening_windows(moment timestamptz DEFAULT clock_timestamp())
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE shop record; changed integer := 0; written integer;
BEGIN
 PERFORM pg_advisory_xact_lock(26100802);
 FOR shop IN SELECT id, samou_store_work_window("openingTime", "closingTime", moment) AS window_key
  FROM stores WHERE "isActive" AND "isApproved"
 LOOP
  IF shop.window_key IS NULL THEN CONTINUE; END IF;
  INSERT INTO ops_store_opening_windows(store_id,window_key) VALUES(shop.id,shop.window_key)
   ON CONFLICT(store_id) DO UPDATE SET window_key=EXCLUDED.window_key
   WHERE ops_store_opening_windows.window_key IS DISTINCT FROM EXCLUDED.window_key;
  GET DIAGNOSTICS written = ROW_COUNT;
  IF written > 0 THEN
   UPDATE stores SET "storeStatus"='OPEN', "updatedAt"=clock_timestamp()
    WHERE id=shop.id AND "storeStatus"='CLOSED';
   GET DIAGNOSTICS written = ROW_COUNT;
   changed := changed + written;
  END IF;
 END LOOP;
 RETURN changed;
END
$$;
