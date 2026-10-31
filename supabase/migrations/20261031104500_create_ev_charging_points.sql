CREATE TABLE IF NOT EXISTS public.ev_charging_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES public.parking_locations(id) ON DELETE CASCADE,
    space_id UUID REFERENCES public.parking_spaces(id) ON DELETE SET NULL,
    station_identifier VARCHAR(64) NOT NULL,
    connector_type VARCHAR(32) NOT NULL DEFAULT 'CCS2',
    max_output_kw NUMERIC(6, 2) NOT NULL DEFAULT 60.00 CHECK (max_output_kw > 0),
    price_per_kwh NUMERIC(10, 2) NOT NULL DEFAULT 250.00 CHECK (price_per_kwh >= 0),
    status VARCHAR(32) NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'charging', 'faulted', 'reserved')),
    current_power_draw_kw NUMERIC(6, 2) NOT NULL DEFAULT 0.00
        CHECK (current_power_draw_kw >= 0),
    estimated_free_at TIMESTAMPTZ,
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ev_charging_location
    ON public.ev_charging_points(location_id);
CREATE INDEX IF NOT EXISTS idx_ev_charging_status
    ON public.ev_charging_points(status);

ALTER TABLE public.ev_charging_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view EV chargers"
    ON public.ev_charging_points;
CREATE POLICY "Public can view EV chargers"
    ON public.ev_charging_points
    FOR SELECT
    TO anon, authenticated
    USING (true);

GRANT SELECT ON public.ev_charging_points TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
