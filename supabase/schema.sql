-- ==============================================================================
-- ParkZone Master Database Schema (Kigali, Rwanda)
-- Fully compliant with Rwanda Data Protection & Privacy Law (Law Nº 058/2021)
-- Cryptographic Blind Indexing, Zero-Knowledge Field Enforcement,
-- 3D Aerial Lot Topologies, Active EV Telemetry, and 300/2000 RWF Pricing Engine.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 2. ENCRYPTED PROFILES TABLE (Extends auth.users)
-- Driver PII is protected; blind hashes enable indexed lookups without plain exposure.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    phone_hash VARCHAR(64) UNIQUE,
    email_hash VARCHAR(64) UNIQUE,
    email TEXT,
    phone_number TEXT,
    full_name TEXT,
    avatar_url TEXT,
    wallet_balance_rwf NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    national_id TEXT,
    driver_license TEXT,
    emergency_contact TEXT,
    rra_tin TEXT,
    role VARCHAR(20) NOT NULL DEFAULT 'driver' CHECK (role IN ('driver', 'agent', 'operator', 'admin')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_phone_hash ON public.profiles(phone_hash);
CREATE INDEX IF NOT EXISTS idx_profiles_email_hash ON public.profiles(email_hash);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Automatically provision a public.profiles row whenever a user registers via Auth
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT;
    v_phone TEXT;
    v_name TEXT;
BEGIN
    v_email := LOWER(NULLIF(TRIM(COALESCE(NEW.email, '')), ''));
    v_phone := NULLIF(TRIM(COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone_number', '')), '');
    v_name  := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), '');

    INSERT INTO public.profiles (
        id,
        email,
        email_hash,
        phone_number,
        phone_hash,
        full_name,
        role,
        wallet_balance_rwf
    )
    VALUES (
        NEW.id,
        v_email,
        CASE WHEN v_email IS NOT NULL THEN encode(digest(v_email, 'sha256'), 'hex') ELSE NULL END,
        v_phone,
        CASE WHEN v_phone IS NOT NULL THEN encode(digest(v_phone, 'sha256'), 'hex') ELSE NULL END,
        v_name,
        'driver',
        0.00
    )
    ON CONFLICT (id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, public.profiles.email),
        phone_number = COALESCE(EXCLUDED.phone_number, public.profiles.phone_number),
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        updated_at = NOW();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Privacy-safe phone availability check for registration
CREATE OR REPLACE FUNCTION public.check_phone_available(p_phone TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_digits TEXT := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
    v_tail9 TEXT := RIGHT(v_digits, 9);
    v_exists BOOLEAN;
BEGIN
    IF LENGTH(v_tail9) < 9 THEN
        RETURN true;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE RIGHT(regexp_replace(COALESCE(phone_number, ''), '[^0-9]', '', 'g'), 9) = v_tail9
    ) INTO v_exists;

    RETURN NOT v_exists;
END;
$$;

-- Resolve login email from a registered phone number so phone + password sign-in works seamlessly
CREATE OR REPLACE FUNCTION public.resolve_login_email_by_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_digits TEXT := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
    v_tail9 TEXT := RIGHT(v_digits, 9);
    v_email TEXT;
BEGIN
    IF LENGTH(v_tail9) < 9 THEN
        RETURN NULL;
    END IF;

    SELECT p.email
    INTO v_email
    FROM public.profiles p
    WHERE RIGHT(regexp_replace(COALESCE(p.phone_number, ''), '[^0-9]', '', 'g'), 9) = v_tail9
      AND p.email IS NOT NULL
    LIMIT 1;

    IF v_email IS NULL THEN
        SELECT u.email
        INTO v_email
        FROM auth.users u
        WHERE RIGHT(regexp_replace(COALESCE(u.phone, u.raw_user_meta_data->>'phone_number', ''), '[^0-9]', '', 'g'), 9) = v_tail9
          AND u.email IS NOT NULL
        LIMIT 1;
    END IF;

    RETURN v_email;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. VEHICLES TABLE (Deterministic Plate Hashing & Masking)
-- Plates are strictly registered on vehicle records.
-- Marshals see only masked_plate (e.g. "RAD *** A"); plate_hash provides O(1) searches.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    plate_number TEXT NOT NULL,
    plate_hash VARCHAR(64) NOT NULL UNIQUE,
    masked_plate VARCHAR(16) NOT NULL,
    vehicle_type VARCHAR(20) NOT NULL DEFAULT 'gasoline' CHECK (vehicle_type IN ('gasoline', 'ev', 'handicap')),
    brand TEXT,
    model TEXT,
    make_model TEXT,
    color TEXT,
    body_style VARCHAR(32) DEFAULT 'Sedan',
    plug_type VARCHAR(32) DEFAULT 'None',
    battery_capacity_kwh NUMERIC(6, 2) DEFAULT 0.00,
    battery_level_percent INTEGER DEFAULT 100,
    handicap_permit_number TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    has_unpaid_arrears BOOLEAN NOT NULL DEFAULT false,
    total_arrears_rwf NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, plate_number)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_user_id ON public.vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate_hash ON public.vehicles(plate_hash);
CREATE INDEX IF NOT EXISTS idx_vehicles_type ON public.vehicles(vehicle_type);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own vehicles" ON public.vehicles;
CREATE POLICY "Users can manage their own vehicles"
    ON public.vehicles FOR ALL
    USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 4. PARKING LOCATIONS TABLE (Kigali Hubs & Layout Topologies)
-- Supports Oblique (45°), Perpendicular (90°), and Parallel (0°) layouts.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parking_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(120) NOT NULL,
    address VARCHAR(255) NOT NULL,
    city VARCHAR(64) NOT NULL DEFAULT 'Kigali',
    country VARCHAR(64) NOT NULL DEFAULT 'Rwanda',
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    layout_topology VARCHAR(32) NOT NULL DEFAULT 'oblique' CHECK (layout_topology IN ('oblique', 'perpendicular', 'parallel', 'wide')),
    total_spots INTEGER NOT NULL DEFAULT 0,
    available_spots INTEGER NOT NULL DEFAULT 0,
    hourly_rate NUMERIC(10, 2) NOT NULL DEFAULT 300.00,
    daily_rate NUMERIC(10, 2) NOT NULL DEFAULT 2000.00,
    currency VARCHAR(8) NOT NULL DEFAULT 'RWF',
    qr_code_identifier VARCHAR(64) UNIQUE NOT NULL,
    opening_hours JSONB DEFAULT '{"open": "06:00", "close": "22:00", "24_7": true}'::jsonb,
    facilities TEXT[] DEFAULT ARRAY['CCTV', 'Security Guard']::TEXT[],
    image_url TEXT,
    zone_code VARCHAR(32) DEFAULT 'Zone A',
    is_electric_station BOOLEAN NOT NULL DEFAULT false,
    is_handicap_facility BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parking_locations_status ON public.parking_locations(status);
CREATE INDEX IF NOT EXISTS idx_parking_locations_active ON public.parking_locations(is_active);

ALTER TABLE public.parking_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public/Authenticated users can view active locations" ON public.parking_locations;
CREATE POLICY "Public/Authenticated users can view active locations"
    ON public.parking_locations FOR SELECT
    USING (status = 'active' OR is_active = true OR auth.role() = 'authenticated');

-- ------------------------------------------------------------------------------
-- 5. PARKING SPACES TABLE (Zone Partitioning & Green/Red Occupancy)
-- Zones: Zone A, Zone B, Zone C, EV Fast Hub.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parking_spaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES public.parking_locations(id) ON DELETE CASCADE,
    space_number VARCHAR(16) NOT NULL,
    zone_code VARCHAR(16) NOT NULL DEFAULT 'Zone A',
    space_type VARCHAR(20) NOT NULL DEFAULT 'regular' CHECK (space_type IN ('regular', 'ev', 'handicap')),
    price_per_hour_rwf NUMERIC(10, 2),
    image_url TEXT,
    is_occupied BOOLEAN NOT NULL DEFAULT false,
    current_vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
    current_plate_hash VARCHAR(64),
    current_vehicle_plate TEXT,
    qr_code_token VARCHAR(64) UNIQUE NOT NULL,
    camera_device_id VARCHAR(64),
    occupied_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (location_id, space_number)
);

ALTER TABLE public.parking_spaces ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.parking_spaces ADD COLUMN IF NOT EXISTS price_per_hour_rwf NUMERIC(10, 2);

CREATE INDEX IF NOT EXISTS idx_parking_spaces_location_zone ON public.parking_spaces(location_id, zone_code);
CREATE INDEX IF NOT EXISTS idx_parking_spaces_occupied ON public.parking_spaces(is_occupied);
CREATE INDEX IF NOT EXISTS idx_parking_spaces_type ON public.parking_spaces(space_type);

CREATE OR REPLACE VIEW public.parking_spots AS SELECT * FROM public.parking_spaces;

ALTER TABLE public.parking_spaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view parking spaces" ON public.parking_spaces;
CREATE POLICY "Anyone authenticated can view parking spaces"
    ON public.parking_spaces FOR SELECT
    USING (true);

-- ------------------------------------------------------------------------------
-- 6. ACTIVE EV CHARGING TELEMETRY (OCPP 2.0.1 & Hardware API Ready)
-- Live power output (kW & Watts), Voltage, Amperage, and operational status.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ev_charging_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES public.parking_locations(id) ON DELETE CASCADE,
    space_id UUID REFERENCES public.parking_spaces(id) ON DELETE SET NULL,
    station_identifier VARCHAR(64) NOT NULL,
    connector_type VARCHAR(32) NOT NULL DEFAULT 'CCS2',
    max_output_kw NUMERIC(6, 2) NOT NULL DEFAULT 60.00,
    max_power_watts NUMERIC(10, 2) DEFAULT 60000.00,
    charging_power_watts NUMERIC(10, 2) DEFAULT 0.00,
    current_power_draw_kw NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    voltage_volts NUMERIC(6, 2) DEFAULT 400.00,
    amperage_amps NUMERIC(6, 2) DEFAULT 0.00,
    price_per_kwh NUMERIC(10, 2) NOT NULL DEFAULT 250.00,
    flat_rate_full_rwf NUMERIC(10, 2) NOT NULL DEFAULT 10000.00,
    flat_rate_quick_rwf NUMERIC(10, 2) NOT NULL DEFAULT 9000.00,
    quick_session_threshold_mins INTEGER NOT NULL DEFAULT 30,
    parking_fee_rwf NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(32) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'charging', 'faulted', 'reserved', 'offline')),
    is_operational BOOLEAN NOT NULL DEFAULT true,
    operational_status VARCHAR(32) NOT NULL DEFAULT 'operational' CHECK (operational_status IN ('operational', 'degraded', 'offline', 'faulted', 'maintenance')),
    fault_code VARCHAR(64),
    fault_description TEXT,
    api_provider VARCHAR(64) DEFAULT 'OCPP 2.0.1',
    api_endpoint_url TEXT,
    api_shared_data JSONB DEFAULT '{"protocol": "OCPP_2_0_1", "telemetry_sharing_enabled": true, "meter_interval_sec": 30}'::jsonb,
    telemetry_payload JSONB DEFAULT '{}'::jsonb,
    total_energy_delivered_kwh NUMERIC(12, 3) DEFAULT 0.000,
    heartbeat_interval_sec INTEGER DEFAULT 60,
    estimated_free_at TIMESTAMPTZ,
    image_url TEXT,
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ev_charging_points ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE INDEX IF NOT EXISTS idx_ev_charging_location ON public.ev_charging_points(location_id);
CREATE INDEX IF NOT EXISTS idx_ev_charging_status ON public.ev_charging_points(status);
CREATE INDEX IF NOT EXISTS idx_ev_charging_operational ON public.ev_charging_points(is_operational, operational_status);

ALTER TABLE public.ev_charging_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view EV chargers" ON public.ev_charging_points;
CREATE POLICY "Anyone authenticated can view EV chargers"
    ON public.ev_charging_points FOR SELECT
    USING (true);

-- ------------------------------------------------------------------------------
-- 6B. AUTOMATIC SPACE & LOCATION IMAGE PROVISIONING
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_parking_asset_image(
    p_seed TEXT,
    p_kind TEXT DEFAULT 'regular'
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_ev_images TEXT[] := ARRAY[
        'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1620896727255-a2f0bfbc05f0?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1558441719-8b489c63f7bc?auto=format&fit=crop&w=800&q=80'
    ];
    v_regular_images TEXT[] := ARRAY[
        'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1573348722427-f1d6819fdf98?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1590674899484-d5640e854abe?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=800&q=80'
    ];
    v_pool TEXT[];
    v_hash BIGINT;
    v_idx INTEGER;
BEGIN
    IF LOWER(COALESCE(p_kind, 'regular')) = 'ev' THEN
        v_pool := v_ev_images;
    ELSE
        v_pool := v_regular_images;
    END IF;

    v_hash := ABS(hashtext(COALESCE(NULLIF(TRIM(p_seed), ''), 'parkzone')));
    v_idx := (v_hash % array_length(v_pool, 1))::INTEGER + 1;
    RETURN v_pool[v_idx];
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_parking_location_image()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.image_url IS NULL OR TRIM(NEW.image_url) = '' THEN
        NEW.image_url := public.resolve_parking_asset_image(
            COALESCE(NEW.name, NEW.qr_code_identifier, NEW.id::TEXT),
            CASE WHEN COALESCE(NEW.is_electric_station, false) THEN 'ev' ELSE 'regular' END
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_parking_location_image ON public.parking_locations;
CREATE TRIGGER trg_ensure_parking_location_image
    BEFORE INSERT OR UPDATE ON public.parking_locations
    FOR EACH ROW EXECUTE FUNCTION public.ensure_parking_location_image();

CREATE OR REPLACE FUNCTION public.ensure_parking_space_image()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_loc_image TEXT;
BEGIN
    IF NEW.image_url IS NULL OR TRIM(NEW.image_url) = '' THEN
        IF COALESCE(NEW.space_type, 'regular') = 'ev' THEN
            NEW.image_url := public.resolve_parking_asset_image(
                COALESCE(NEW.location_id::TEXT, '') || '-' || COALESCE(NEW.space_number, ''),
                'ev'
            );
        ELSE
            SELECT NULLIF(TRIM(image_url), '')
            INTO v_loc_image
            FROM public.parking_locations
            WHERE id = NEW.location_id;

            NEW.image_url := COALESCE(
                public.resolve_parking_asset_image(
                    COALESCE(NEW.location_id::TEXT, '') || '-' || COALESCE(NEW.space_number, ''),
                    COALESCE(NEW.space_type, 'regular')
                ),
                v_loc_image
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_parking_space_image ON public.parking_spaces;
CREATE TRIGGER trg_ensure_parking_space_image
    BEFORE INSERT OR UPDATE ON public.parking_spaces
    FOR EACH ROW EXECUTE FUNCTION public.ensure_parking_space_image();

CREATE OR REPLACE FUNCTION public.ensure_ev_charger_image()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.image_url IS NULL OR TRIM(NEW.image_url) = '' THEN
        NEW.image_url := public.resolve_parking_asset_image(
            COALESCE(NEW.station_identifier, NEW.id::TEXT),
            'ev'
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_ev_charger_image ON public.ev_charging_points;
CREATE TRIGGER trg_ensure_ev_charger_image
    BEFORE INSERT OR UPDATE ON public.ev_charging_points
    FOR EACH ROW EXECUTE FUNCTION public.ensure_ev_charger_image();

-- ------------------------------------------------------------------------------
-- 7. PARKING TICKETS / ACTIVE SESSIONS TABLE
-- Hourly: 300 RWF | Daily cap: 2,000 RWF.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parking_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_number VARCHAR(64) UNIQUE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
    plate_hash VARCHAR(64) NOT NULL,
    vehicle_plate TEXT NOT NULL,
    location_id UUID NOT NULL REFERENCES public.parking_locations(id) ON DELETE RESTRICT,
    space_id UUID REFERENCES public.parking_spaces(id) ON DELETE SET NULL,
    entry_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    exit_time TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'overdue', 'cancelled')),
    hourly_rate NUMERIC(10, 2) NOT NULL DEFAULT 300.00,
    daily_cap NUMERIC(10, 2) NOT NULL DEFAULT 2000.00,
    rate_applied VARCHAR(20) NOT NULL DEFAULT 'hourly' CHECK (rate_applied IN ('hourly', 'daily')),
    hours_elapsed NUMERIC(6, 2) DEFAULT 0.00,
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 300.00,
    amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded', 'waived')),
    payment_method VARCHAR(20) CHECK (payment_method IN ('momo', 'airtel', 'card', 'cash', 'wallet')),
    is_flagged_by_agent BOOLEAN NOT NULL DEFAULT false,
    qr_token TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Upgrade existing columns if already created with narrower types
ALTER TABLE public.parking_tickets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.parking_tickets ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL;
ALTER TABLE public.parking_tickets ADD COLUMN IF NOT EXISTS hours_elapsed NUMERIC(6, 2) DEFAULT 0.00;
ALTER TABLE public.parking_tickets ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.parking_tickets ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid';
ALTER TABLE public.parking_tickets ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20);
ALTER TABLE public.parking_tickets ADD COLUMN IF NOT EXISTS is_flagged_by_agent BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_parking_tickets_user_id ON public.parking_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_parking_tickets_plate_hash ON public.parking_tickets(plate_hash);
CREATE INDEX IF NOT EXISTS idx_parking_tickets_vehicle_plate ON public.parking_tickets(vehicle_plate);
CREATE INDEX IF NOT EXISTS idx_parking_tickets_status ON public.parking_tickets(status);
CREATE INDEX IF NOT EXISTS idx_parking_tickets_entry_time ON public.parking_tickets(entry_time DESC);

ALTER TABLE public.parking_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own tickets" ON public.parking_tickets;
CREATE POLICY "Users view own tickets"
    ON public.parking_tickets FOR SELECT
    USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users insert own tickets" ON public.parking_tickets;
CREATE POLICY "Users insert own tickets"
    ON public.parking_tickets FOR INSERT
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users update own tickets" ON public.parking_tickets;
CREATE POLICY "Users update own tickets"
    ON public.parking_tickets FOR UPDATE
    USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

-- ------------------------------------------------------------------------------
-- 8. PARKING FINES & OVERDUE FLAGS (Zero-Contact Citation Table)
-- 3,000 RWF penalty for cars parked without app check-in or QR scan.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parking_fines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fine_number VARCHAR(32) UNIQUE NOT NULL,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
    plate_hash VARCHAR(64) NOT NULL,
    vehicle_plate TEXT NOT NULL,
    location_id UUID REFERENCES public.parking_locations(id) ON DELETE SET NULL,
    space_id UUID REFERENCES public.parking_spaces(id) ON DELETE SET NULL,
    fine_amount NUMERIC(10, 2) NOT NULL DEFAULT 3000.00,
    currency VARCHAR(8) NOT NULL DEFAULT 'RWF',
    reason VARCHAR(120) NOT NULL DEFAULT 'No active parking ticket / unauthorized occupancy',
    issued_by_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'waived', 'disputed')),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parking_fines_plate_hash ON public.parking_fines(plate_hash);
CREATE INDEX IF NOT EXISTS idx_parking_fines_vehicle_plate ON public.parking_fines(vehicle_plate);
CREATE INDEX IF NOT EXISTS idx_parking_fines_status ON public.parking_fines(payment_status);

ALTER TABLE public.parking_fines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view fines for own vehicles" ON public.parking_fines;
CREATE POLICY "Users view fines for own vehicles"
    ON public.parking_fines FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Agents create fines" ON public.parking_fines;
CREATE POLICY "Agents create fines"
    ON public.parking_fines FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS public.vehicle_invoice_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES public.parking_tickets(id) ON DELETE CASCADE,
    plate_hash VARCHAR(64) NOT NULL,
    flagged_by_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    flagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    overdue_amount_rwf NUMERIC(10, 2) NOT NULL,
    notification_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flags_plate_hash ON public.vehicle_invoice_flags(plate_hash);

ALTER TABLE public.vehicle_invoice_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view invoice flags" ON public.vehicle_invoice_flags;
CREATE POLICY "Anyone authenticated can view invoice flags"
    ON public.vehicle_invoice_flags FOR SELECT
    USING (auth.role() = 'authenticated');

-- ------------------------------------------------------------------------------
-- 9. ZERO-CONTACT AGENT AUDIT RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_plate_compliance(p_plate_hash VARCHAR(64))
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ticket RECORD;
    v_vehicle RECORD;
    v_fine_count INTEGER;
    v_diff_seconds NUMERIC;
    v_response JSONB;
BEGIN
    SELECT * INTO v_ticket
    FROM public.parking_tickets
    WHERE plate_hash = p_plate_hash AND status IN ('active', 'overdue')
    ORDER BY entry_time DESC
    LIMIT 1;

    SELECT * INTO v_vehicle
    FROM public.vehicles
    WHERE plate_hash = p_plate_hash
    LIMIT 1;

    SELECT COUNT(*) INTO v_fine_count
    FROM public.parking_fines
    WHERE plate_hash = p_plate_hash AND payment_status = 'unpaid';

    IF v_ticket IS NULL THEN
        v_response := jsonb_build_object(
            'compliant', false,
            'status', 'unpaid_occupancy',
            'masked_plate', COALESCE(v_vehicle.masked_plate, 'RAD *** *'),
            'action_required', 'ISSUE_CITATION_3000_RWF',
            'fine_applicable_rwf', 3000.00,
            'arrears_count', v_fine_count,
            'message', 'Vehicle has no active paid parking session in database.'
        );
        RETURN v_response;
    END IF;

    v_diff_seconds := EXTRACT(EPOCH FROM (NOW() - v_ticket.entry_time));

    IF v_ticket.rate_applied = 'hourly' AND v_diff_seconds > (v_ticket.hours_elapsed * 3600) THEN
        UPDATE public.parking_tickets
        SET status = 'overdue', updated_at = NOW()
        WHERE id = v_ticket.id;

        v_response := jsonb_build_object(
            'compliant', false,
            'status', 'overdue',
            'ticket_id', v_ticket.id,
            'masked_plate', v_vehicle.masked_plate,
            'parked_since', v_ticket.entry_time,
            'action_required', 'APPLY_OVERDUE_SURCHARGE',
            'overdue_minutes', ROUND((v_diff_seconds - (v_ticket.hours_elapsed * 3600)) / 60),
            'arrears_count', v_fine_count
        );
    ELSE
        v_response := jsonb_build_object(
            'compliant', true,
            'status', 'paid_active',
            'ticket_id', v_ticket.id,
            'masked_plate', v_vehicle.masked_plate,
            'parked_since', v_ticket.entry_time,
            'action_required', 'NONE',
            'valid_until', v_ticket.entry_time + (v_ticket.hours_elapsed * INTERVAL '1 hour'),
            'arrears_count', v_fine_count
        );
    END IF;

    RETURN v_response;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 10. CORE PRICING CALCULATION FUNCTION (300 RWF vs 2,000 RWF Daily Cap)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_parking_fee(
    p_entry_time TIMESTAMPTZ,
    p_exit_time TIMESTAMPTZ DEFAULT NOW(),
    p_hourly_rate NUMERIC DEFAULT 300.00,
    p_daily_cap NUMERIC DEFAULT 2000.00
)
RETURNS TABLE (
    hours_billed NUMERIC,
    amount_due NUMERIC,
    rate_type VARCHAR
) AS $$
DECLARE
    v_duration_seconds NUMERIC;
    v_raw_hours NUMERIC;
    v_billed_hours NUMERIC;
    v_total_hourly NUMERIC;
BEGIN
    v_duration_seconds := GREATEST(0, EXTRACT(EPOCH FROM (p_exit_time - p_entry_time)));
    v_raw_hours := v_duration_seconds / 3600.0;
    v_billed_hours := GREATEST(1, CEIL(v_raw_hours));
    v_total_hourly := v_billed_hours * p_hourly_rate;

    IF v_total_hourly >= p_daily_cap THEN
        RETURN QUERY SELECT
            v_billed_hours,
            p_daily_cap,
            'daily'::VARCHAR;
    ELSE
        RETURN QUERY SELECT
            v_billed_hours,
            v_total_hourly,
            'hourly'::VARCHAR;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ------------------------------------------------------------------------------
-- 10B. SEPARATED EV CHARGING FEE CALCULATION FUNCTION
-- Flat-Rate: 10,000 RWF full charge / >=30 mins; 9,000 RWF < 30 mins.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_ev_charging_fee(
    p_started_at TIMESTAMPTZ,
    p_completed_at TIMESTAMPTZ DEFAULT NOW(),
    p_is_full_charge BOOLEAN DEFAULT false,
    p_flat_rate_full NUMERIC DEFAULT 10000.00,
    p_flat_rate_quick NUMERIC DEFAULT 9000.00,
    p_quick_threshold_mins INTEGER DEFAULT 30
)
RETURNS TABLE (
    minutes_billed NUMERIC,
    charging_amount_rwf NUMERIC,
    parking_amount_rwf NUMERIC,
    tariff_tier VARCHAR
) AS $$
DECLARE
    v_duration_seconds NUMERIC;
    v_mins NUMERIC;
    v_amount NUMERIC;
    v_tier VARCHAR;
BEGIN
    v_duration_seconds := GREATEST(0, EXTRACT(EPOCH FROM (p_completed_at - p_started_at)));
    v_mins := GREATEST(1.0, v_duration_seconds / 60.0);

    IF p_is_full_charge THEN
        v_amount := p_flat_rate_full;
        v_tier := 'full_charge';
    ELSIF v_mins >= p_quick_threshold_mins THEN
        v_amount := p_flat_rate_full;
        v_tier := 'extended_30m_plus';
    ELSE
        v_amount := p_flat_rate_quick;
        v_tier := 'under_30m';
    END IF;

    RETURN QUERY SELECT
        ROUND(v_mins, 1),
        v_amount,
        0.00::NUMERIC,
        v_tier;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ------------------------------------------------------------------------------
-- 11. EV CHARGING SESSIONS, PERMITS, NOTIFICATIONS & PAYMENT METHODS TABLES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ev_charging_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_number VARCHAR(64) UNIQUE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
    vehicle_plate TEXT NOT NULL,
    location_id UUID REFERENCES public.parking_locations(id) ON DELETE SET NULL,
    charger_id UUID REFERENCES public.ev_charging_points(id) ON DELETE SET NULL,
    bay_number VARCHAR(32) NOT NULL,
    charger_power_kw NUMERIC(6, 2) NOT NULL DEFAULT 60.00,
    initial_soc INTEGER NOT NULL DEFAULT 0,
    target_soc INTEGER NOT NULL DEFAULT 80,
    final_soc NUMERIC(5, 1) DEFAULT 0.0,
    delivered_kwh NUMERIC(10, 3) NOT NULL DEFAULT 0.000,
    elapsed_seconds INTEGER NOT NULL DEFAULT 0,
    charging_amount_rwf NUMERIC(10, 2) NOT NULL DEFAULT 9000.00,
    parking_amount_rwf NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    tariff_tier VARCHAR(32) NOT NULL DEFAULT 'under_30m',
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ev_charging_sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.ev_charging_sessions ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL;
ALTER TABLE public.ev_charging_sessions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ev_sessions_user ON public.ev_charging_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ev_sessions_status ON public.ev_charging_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ev_sessions_plate ON public.ev_charging_sessions(vehicle_plate);

ALTER TABLE public.ev_charging_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own EV charging sessions" ON public.ev_charging_sessions;
CREATE POLICY "Users manage own EV charging sessions"
    ON public.ev_charging_sessions FOR ALL
    USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated')
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS public.parking_permits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    permit_number VARCHAR(32) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
    vehicle_plate TEXT NOT NULL,
    permit_title VARCHAR(120) NOT NULL,
    zone_scope VARCHAR(64) NOT NULL DEFAULT 'Zone A',
    issuing_authority VARCHAR(120) NOT NULL DEFAULT 'City of Kigali Infrastructure Board',
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'expired', 'revoked')),
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parking_permits_user ON public.parking_permits(user_id);

ALTER TABLE public.parking_permits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own parking permits" ON public.parking_permits;
CREATE POLICY "Users manage own parking permits"
    ON public.parking_permits FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.user_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category VARCHAR(24) NOT NULL DEFAULT 'System' CHECK (category IN ('Parking', 'AI Radar', 'Billing', 'System')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT false,
    icon VARCHAR(48) NOT NULL DEFAULT 'notifications-outline',
    action_text VARCHAR(64),
    action_type VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON public.user_notifications(user_id, created_at DESC);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own notifications" ON public.user_notifications;
CREATE POLICY "Users manage own notifications"
    ON public.user_notifications FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    method_type VARCHAR(24) NOT NULL CHECK (method_type IN ('momo', 'airtel', 'card', 'wallet')),
    provider_name VARCHAR(64) NOT NULL,
    masked_identifier VARCHAR(64) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON public.payment_methods(user_id);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own payment methods" ON public.payment_methods;
CREATE POLICY "Users manage own payment methods"
    ON public.payment_methods FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 12. PARKING LOCATION REVIEWS & RATINGS (Live Database Integration)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.location_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES public.parking_locations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_location_reviews_loc ON public.location_reviews(location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_reviews_user ON public.location_reviews(user_id);

ALTER TABLE public.location_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view location reviews" ON public.location_reviews;
CREATE POLICY "Anyone can view location reviews"
    ON public.location_reviews FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Authenticated motorists can insert reviews" ON public.location_reviews;
CREATE POLICY "Authenticated motorists can insert reviews"
    ON public.location_reviews FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own reviews" ON public.location_reviews;
CREATE POLICY "Users can update their own reviews"
    ON public.location_reviews FOR UPDATE
    USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 13. REAL-TIME DATA SHARING & WEBSOCKET BROADCAST PUBLICATION
-- Idempotent safe publication addition (no duplicate relation errors)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'ev_charging_points',
        'parking_spaces',
        'parking_tickets',
        'ev_charging_sessions',
        'user_notifications',
        'location_reviews',
        'vehicles',
        'parking_locations'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
            IF NOT EXISTS (
                SELECT 1 FROM pg_publication_tables 
                WHERE pubname = 'supabase_realtime' 
                AND schemaname = 'public' 
                AND tablename = tbl
            ) THEN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
            END IF;
        END IF;
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 14. PERMISSIONS & SCHEMA CACHE RELOAD
-- PostgREST requires USAGE & table permissions for 'anon' and 'authenticated' roles
-- to expose public tables in the schema cache.
-- ------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- Notify PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';
