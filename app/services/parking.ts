import { supabase } from "../lib/supabase";
import { hashLicensePlate, maskLicensePlate } from "../lib/crypto";
import { ensureUserProfile } from "./auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { broadcastVehicleChange, mapDbRowToSpecs, reloadDriverVehicle } from "../../hooks/useDriverVehicle";

export type VehicleType = "gasoline" | "ev" | "handicap";
export type TopologyType = "oblique" | "perpendicular" | "parallel" | "wide";

export interface RegisteredVehicle {
    id: string;
    user_id: string;
    plate_number: string;
    plate_hash?: string;
    masked_plate?: string;
    vehicle_type: VehicleType;
    make_model?: string;
    brand?: string;
    model?: string;
    color?: string;
    handicap_permit_number?: string;
    is_default?: boolean;
    has_unpaid_arrears?: boolean;
    total_arrears_rwf?: number;
    created_at?: string;
}

export interface ParkingSpace {
    id: string;
    location_id: string;
    space_number: string;
    zone_code: string; // 'Zone A', 'Zone B', 'EV Fast Hub'
    space_type: "regular" | "ev" | "handicap";
    image_url?: string;
    is_occupied: boolean;
    current_vehicle_plate?: string | null;
    current_plate_hash?: string | null;
    current_vehicle_id?: string | null;
    qr_code_token: string;
    occupied_at?: string | null;
    watt_power_kw?: number;
    price_per_hour_rwf?: number;
    price_per_kwh_rwf?: number;
    topology?: TopologyType;
    car_color?: string;
    spot_label?: string;
}

export const STANDARD_PARKING_ZONES = [
    "Zone A",
    "Zone B",
    "Zone C",
    "Zone D",
    "Zone E",
] as const;

export const PARKED_CAR_COLOR_VARIANTS = [
    "crimson",
    "pearl",
    "sapphire",
    "amber",
    "emerald",
    "silver",
    "carbon",
    "champagne",
    "obsidian",
    "titanium",
    "glacier",
] as const;

let cachedUserCarColors: string[] = [];
const cachedPlateColorMap = new Map<string, string>();

export function setUserCarColorsCache(colors: string[], plateMap?: Record<string, string>) {
    if (colors && colors.length > 0) {
        cachedUserCarColors = Array.from(new Set(colors.filter(Boolean)));
    }
    if (plateMap) {
        Object.entries(plateMap).forEach(([plate, color]) => {
            if (plate && color) cachedPlateColorMap.set(plate.trim().toUpperCase(), color.trim());
        });
    }
}

export function resolveParkedCarColor(seed?: string | null, plate?: string | null): string {
    if (plate && cachedPlateColorMap.has(plate.trim().toUpperCase())) {
        return cachedPlateColorMap.get(plate.trim().toUpperCase())!;
    }
    const colorPool = cachedUserCarColors.length > 0 ? cachedUserCarColors : PARKED_CAR_COLOR_VARIANTS;
    const key = (seed || plate || "parkzone-car").trim();
    let hash = 2166136261;
    for (let i = 0; i < key.length; i += 1) {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return colorPool[Math.abs(hash) % colorPool.length];
}

export function getZoneLotMeta(zoneCode: string, isEvStation = false): {
    title: string;
    description: string;
    defaultSpotLabel: string;
    bayBase: number;
} {
    switch (zoneCode) {
        case "Zone A":
            return isEvStation
                ? {
                      title: "Executive & Ultra-Fast Hub",
                      description: "Front-row bays equipped with 150 kW DC hyperchargers",
                      defaultSpotLabel: "150kW DC",
                      bayBase: 101,
                  }
                : {
                      title: "Executive Parking",
                      description: "Front-row bays near entrance",
                      defaultSpotLabel: "Available",
                      bayBase: 101,
                  };
        case "Zone B":
            return isEvStation
                ? {
                      title: "Level 1 Covered Bays",
                      description: "Weather-protected garage bays with 50 kW fast plugs",
                      defaultSpotLabel: "Covered 50kW",
                      bayBase: 201,
                  }
                : {
                      title: "Level 1 Covered Bays",
                      description: "Weather-protected garage bays with covered stalls",
                      defaultSpotLabel: "Covered",
                      bayBase: 201,
                  };
        case "Zone D":
            return {
                title: "East Deck Fleet & SUV Stalls",
                description: "Oversized parking spaces designed for large SUVs & trucks",
                defaultSpotLabel: "Wide Stall",
                bayBase: 401,
            };
        case "Zone E":
            return isEvStation
                ? {
                      title: "Rooftop Solar Deck",
                      description: "Scenic rooftop spots powered by on-site solar canopies",
                      defaultSpotLabel: "Solar Canopy",
                      bayBase: 501,
                  }
                : {
                      title: "Accessible & Rooftop Deck",
                      description: "Extra-wide accessible stalls & covered solar canopy deck",
                      defaultSpotLabel: "Accessible",
                      bayBase: 501,
                  };
        case "Zone C":
        default:
            return isEvStation
                ? {
                      title: "Central Plaza Charging Lot",
                      description: "Main parking court with 22 kW AC stations & wide lanes",
                      defaultSpotLabel: "22kW AC",
                      bayBase: 123,
                  }
                : {
                      title: "Central Plaza Parking Area",
                      description: "Main parking court with wide lanes",
                      defaultSpotLabel: "Available",
                      bayBase: 123,
                  };
    }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(val?: string | null): boolean {
    return Boolean(val && UUID_REGEX.test(val.trim()));
}

export function extractBayFromQrToken(qrToken?: string | null): string | null {
    if (!qrToken) return null;
    const match = qrToken.match(/^QR-([A-Za-z0-9-]+?)(?:-PZ-\d+)?$/i);
    if (match?.[1]) return match[1];
    return null;
}

export interface EvChargerTelemetry {
    id: string;
    location_id: string;
    station_identifier: string;
    connector_type: string;
    image_url?: string;
    max_output_kw: number;
    max_power_watts?: number;
    charging_power_watts?: number;
    voltage_volts?: number;
    amperage_amps?: number;
    price_per_kwh: number;
    status: "available" | "charging" | "faulted" | "reserved" | "offline";
    current_power_draw_kw: number;
    is_operational?: boolean;
    operational_status?: "operational" | "degraded" | "offline" | "faulted" | "maintenance";
    fault_code?: string | null;
    fault_description?: string | null;
    api_provider?: string;
    api_endpoint_url?: string;
    api_shared_data?: Record<string, any>;
    telemetry_payload?: Record<string, any>;
    total_energy_delivered_kwh?: number;
    last_heartbeat?: string;
    estimated_free_at?: string | null;
    // EV Charging flat-rate billing (separate from parking fees)
    flat_rate_full_rwf?: number;   // RWF 10,000 — full charge or session ≥ 30 min
    flat_rate_quick_rwf?: number;  // RWF  9,000 — quick session < 30 min
    quick_session_threshold_mins?: number; // default 30
}

export interface ParkingLocation {
    id: string;
    name: string;
    address: string;
    city: string;
    country: string;
    latitude: number;
    longitude: number;
    layout_topology: TopologyType;
    total_spots: number;
    available_spots: number;
    hourly_rate: number;
    daily_rate: number;
    currency: string;
    qr_code_identifier: string;
    facilities?: string[];
    is_active: boolean;
    status: "active" | "inactive" | "maintenance";
    is_electric_station?: boolean;
    is_handicap_facility?: boolean;
    zone_code?: string;
    image_url?: string;
    created_at?: string;
    updated_at?: string;
}

export interface DbEvStationItem {
    id: string;
    name: string;
    address: string;
    city?: string;
    distance: string;
    latitude: number;
    longitude: number;
    tariff: string;
    image?: string;
    image_url?: string;
    chargers: EvChargerTelemetry[];
}

export interface DbPermitRecord {
    id: string;
    permit_number: string;
    user_id: string;
    vehicle_plate: string;
    permit_title: string;
    zone_scope: string;
    issuing_authority: string;
    status: "active" | "pending" | "expired" | "revoked";
    valid_until?: string;
    created_at?: string;
}

export interface DbNotificationRecord {
    id: string;
    category: "Parking" | "AI Radar" | "Billing" | "System";
    title: string;
    message: string;
    timestamp: string;
    read: boolean;
    icon: string;
    actionText?: string;
    actionType?: "active_session" | "ai_lot" | "receipt";
}

export interface DbPaymentMethodRecord {
    id: string;
    method_type: "momo" | "airtel" | "card" | "wallet";
    provider_name: string;
    masked_identifier: string;
    is_default: boolean;
}

export interface AgentAuditResponse {
    status: "PAID" | "GRACE_BUFFER" | "OVERDUE" | "UNREGISTERED";
    ticket_id?: string;
    masked_plate: string;
    seconds_remaining?: number;
    seconds_elapsed?: number;
    overdue_amount?: number;
    has_arrears: boolean;
    arrears_amount: number;
    fine_count?: number;
}

/**
 * Core pricing calculation:
 * - 300 RWF / hour
 * - Capped at 2,000 RWF / day
 */
export function calculateParkingFee(
    entryTime: Date | string,
    exitTime: Date | string = new Date(),
    hourlyRate = 300,
    dailyCap = 2000
) {
    const entry = new Date(entryTime).getTime();
    const exit = new Date(exitTime).getTime();
    const diffMs = Math.max(0, exit - entry);
    const diffHours = diffMs / (1000 * 60 * 60);

    const billedHours = Math.max(1, Math.ceil(diffHours));
    const rawHourlyTotal = billedHours * hourlyRate;

    const isDailyCapApplied = rawHourlyTotal >= dailyCap;
    const finalAmount = isDailyCapApplied ? dailyCap : rawHourlyTotal;

    return {
        hoursElapsed: Number(diffHours.toFixed(2)),
        billedHours,
        hourlyRate,
        dailyCap,
        amount: finalAmount,
        rateApplied: isDailyCapApplied ? ("daily" as const) : ("hourly" as const),
    };
}

/**
 * EV Charging flat-rate fee calculation (SEPARATE from parking — EV parking at charging bays is FREE).
 *
 * Pricing rules:
 *   - Base price until full charge (100% SOC) OR session ≥ 30 mins  →  10,000 RWF
 *   - Session < 30 mins (before full charge)                        →   9,000 RWF
 *
 * Parking fee during active EV charging = 0 RWF (separated from standard 300 RWF/hr parking).
 */
export function calculateChargingFee(
    elapsedSeconds: number,
    isFullCharge = false,
    flatRateFull = 10000,  // RWF — base rate for full charge or ≥ 30 min session
    flatRateQuick = 9000,  // RWF — discounted rate for < 30 min session
    thresholdMins = 30
): {
    amount: number;
    tier: "full" | "quick";
    elapsedMins: number;
    parkingFee: number;
    label: string;
} {
    const elapsedMins = elapsedSeconds / 60;
    const isFullOrOverThreshold = isFullCharge || elapsedMins >= thresholdMins;
    const amount = isFullOrOverThreshold ? flatRateFull : flatRateQuick;

    return {
        amount,
        tier: isFullOrOverThreshold ? "full" : "quick",
        elapsedMins: Number(elapsedMins.toFixed(1)),
        parkingFee: 0,  // Separated from parking: EV charging bays carry 0 RWF parking fee
        label: isFullCharge
            ? `${amount.toLocaleString()} RWF (Full Charge Base Rate)`
            : isFullOrOverThreshold
            ? `${amount.toLocaleString()} RWF (≥${thresholdMins} min Charging Rate)`
            : `${amount.toLocaleString()} RWF (<${thresholdMins} min Quick Charge Rate)`,
    };
}

// ------------------------------------------------------------------------------
// VEHICLE OPERATIONS (Encrypted & Blind-Indexed)
// ------------------------------------------------------------------------------

export async function fetchUserVehicles(userId: string): Promise<RegisteredVehicle[]> {
    let { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

    if (error) {
        // Fallback without order in case created_at is unavailable
        const fallback = await supabase
            .from("vehicles")
            .select("*")
            .eq("user_id", userId);
        data = fallback.data;
        error = fallback.error;
    }

    if (error) {
        console.warn("fetchUserVehicles error:", error);
        return [];
    }

    const preferredId = await AsyncStorage.getItem("@parkzone_active_vehicle_id").catch(() => null);

    return (data || []).map((v: any, index: number) => {
        const isDefault = v.is_default !== undefined ? Boolean(v.is_default) : (preferredId ? v.id === preferredId : index === 0);
        return {
            ...v,
            plate_hash: v.plate_hash || hashLicensePlate(v.plate_number || ""),
            masked_plate: v.masked_plate || maskLicensePlate(v.plate_number || ""),
            make_model: v.make_model || [v.brand, v.model].filter(Boolean).join(" ") || "Vehicle",
            is_default: isDefault,
        };
    });
}

export async function registerVehicle(payload: {
    userId: string;
    plateNumber: string;
    vehicleType: VehicleType;
    makeModel?: string;
    color?: string;
    handicapPermitNumber?: string;
    isDefault?: boolean;
}): Promise<{ data?: RegisteredVehicle; error?: string }> {
    const rawPlate = payload.plateNumber.trim().toUpperCase();
    if (!rawPlate) {
        return { error: "Please enter a valid license plate number." };
    }
    const plateHash = hashLicensePlate(rawPlate);
    const maskedPlate = maskLicensePlate(rawPlate);

    const parts = (payload.makeModel || "").trim().split(" ");
    const brand = parts[0] || "Custom";
    const model = parts.slice(1).join(" ") || parts[0] || "Vehicle";

    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
        await ensureUserProfile(user);
    }

    const shouldBeDefault = payload.isDefault ?? true;

    // Build compatible payload for live database schema
    const insertPayload: Record<string, any> = {
        user_id: payload.userId,
        plate_number: rawPlate,
        plate_hash: plateHash,
        masked_plate: maskedPlate,
        vehicle_type: payload.vehicleType,
        color: payload.color || "Black",
        make_model: payload.makeModel?.trim() || `${brand} ${model}`.trim(),
        brand,
        model,
        handicap_permit_number: payload.handicapPermitNumber || null,
        is_default: shouldBeDefault,
    };

    // 1. Attempt upsert with is_default
    let { data, error } = await supabase
        .from("vehicles")
        .upsert(insertPayload, { onConflict: "user_id,plate_number" })
        .select()
        .single();

    // 2. If is_default column is missing or schema throws, retry without is_default
    if (error) {
        const payloadWithoutDefault = { ...insertPayload };
        delete payloadWithoutDefault.is_default;
        const retry1 = await supabase
            .from("vehicles")
            .upsert(payloadWithoutDefault, { onConflict: "user_id,plate_number" })
            .select()
            .single();
        if (!retry1.error) {
            data = retry1.data;
            error = null;
        } else {
            // Core fallback
            const coreInsert = {
                user_id: payload.userId,
                plate_number: rawPlate,
                plate_hash: plateHash,
                masked_plate: maskedPlate,
                vehicle_type: payload.vehicleType,
                color: payload.color || "Black",
            };
            const retry2 = await supabase
                .from("vehicles")
                .upsert(coreInsert, { onConflict: "user_id,plate_number" })
                .select()
                .single();
            data = retry2.data;
            error = retry2.error;
        }
    }

    if (error) {
        return { error: error.message };
    }

    const saved = data as any;
    const registered: RegisteredVehicle = {
        ...saved,
        plate_hash: saved.plate_hash || plateHash,
        masked_plate: saved.masked_plate || maskedPlate,
        make_model: saved.make_model || payload.makeModel || [saved.brand, saved.model].filter(Boolean).join(" ") || "Vehicle",
        is_default: saved.is_default !== undefined ? Boolean(saved.is_default) : shouldBeDefault,
    };

    // Broadcast change to active vehicle hook in real-time
    try {
        const specs = mapDbRowToSpecs(registered);
        await broadcastVehicleChange(specs);
        await AsyncStorage.setItem("@parkzone_active_vehicle_id", registered.id);
    } catch (e) {
        console.warn("Could not broadcast vehicle update:", e);
    }

    return { data: registered };
}

export async function deleteVehicle(vehicleId: string) {
    const res = await supabase.from("vehicles").delete().eq("id", vehicleId);
    try {
        const activeId = await AsyncStorage.getItem("@parkzone_active_vehicle_id");
        if (activeId === vehicleId) {
            await AsyncStorage.removeItem("@parkzone_active_vehicle_id");
        }
        await reloadDriverVehicle();
    } catch {}
    return res;
}

export async function setDefaultVehicle(userId: string, vehicleId: string) {
    try {
        await AsyncStorage.setItem("@parkzone_active_vehicle_id", vehicleId);

        // Update database if is_default column exists
        try {
            await supabase.from("vehicles").update({ is_default: false }).eq("user_id", userId);
            await supabase.from("vehicles").update({ is_default: true }).eq("id", vehicleId);
        } catch {}

        await reloadDriverVehicle();
        return { success: true };
    } catch (e: any) {
        return { error: e.message };
    }
}

// ------------------------------------------------------------------------------
// LOCATION REVIEWS (Live Database Integration)
// ------------------------------------------------------------------------------

export interface LocationReview {
    id: string;
    location_id: string;
    user_id: string;
    user_name: string;
    user_avatar?: string;
    rating: number; // 1 - 5
    comment: string;
    tags?: string[];
    created_at: string;
}

export async function fetchLocationReviews(locationId: string): Promise<LocationReview[]> {
    try {
        const { data, error } = await supabase
            .from("location_reviews")
            .select("id, location_id, user_id, rating, comment, tags, created_at, profiles:user_id(full_name, avatar_url)")
            .eq("location_id", locationId)
            .order("created_at", { ascending: false });

        if (!error && data) {
            // Load cached reviewer profiles in case RLS blocked the foreign-key join
            let cachedProfiles: Record<string, { full_name?: string; avatar_url?: string }> = {};
            try {
                const raw = await AsyncStorage.getItem("@parkzone_cached_profiles");
                if (raw) cachedProfiles = JSON.parse(raw);
            } catch {}

            // For reviews where profiles was blocked by RLS, attempt batch fetch
            const missingUserIds = data
                .filter((r: any) => (!r.profiles || !r.profiles.full_name) && r.user_id && !cachedProfiles[r.user_id])
                .map((r: any) => r.user_id);

            if (missingUserIds.length > 0) {
                try {
                    const { data: profBatch } = await supabase
                        .from("profiles")
                        .select("id, full_name, avatar_url")
                        .in("id", missingUserIds);
                    (profBatch || []).forEach((p: any) => {
                        cachedProfiles[p.id] = {
                            full_name: p.full_name,
                            avatar_url: p.avatar_url,
                        };
                    });
                    await AsyncStorage.setItem("@parkzone_cached_profiles", JSON.stringify(cachedProfiles));
                } catch {}
            }

            // Also check currently signed-in user
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (currentUser?.id) {
                const myName = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name;
                const myAvatar = currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture;
                if (myName || myAvatar) {
                    cachedProfiles[currentUser.id] = {
                        full_name: myName || cachedProfiles[currentUser.id]?.full_name,
                        avatar_url: myAvatar || cachedProfiles[currentUser.id]?.avatar_url,
                    };
                }
            }

            return data.map((r: any) => {
                const joinedProf = r.profiles;
                const cached = cachedProfiles[r.user_id];
                const isCurrentUser = r.user_id === currentUser?.id;

                const resolvedName =
                    joinedProf?.full_name ||
                    cached?.full_name ||
                    (isCurrentUser ? (currentUser?.user_metadata?.full_name || currentUser?.email?.split("@")[0] || "You") : "Verified Motorist");

                const resolvedAvatar =
                    joinedProf?.avatar_url ||
                    cached?.avatar_url ||
                    (isCurrentUser ? (currentUser?.user_metadata?.avatar_url || currentUser?.user_metadata?.picture) : undefined);

                return {
                    id: r.id,
                    location_id: r.location_id,
                    user_id: r.user_id,
                    user_name: resolvedName,
                    user_avatar: resolvedAvatar,
                    rating: Number(r.rating) || 5,
                    comment: r.comment || "",
                    tags: Array.isArray(r.tags) ? r.tags : [],
                    created_at: r.created_at,
                };
            });
        }
    } catch (err) {
        console.warn("fetchLocationReviews error:", err);
    }

    // Local storage fallback for offline / dev
    try {
        const cached = await AsyncStorage.getItem(`@parkzone_reviews_${locationId}`);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch {}

    return [];
}

export async function submitLocationReview(payload: {
    locationId: string;
    rating: number;
    comment: string;
    tags?: string[];
}): Promise<{ data?: LocationReview; error?: string }> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) {
            return { error: "Please sign in to submit a verified motorist review." };
        }

        await ensureUserProfile(user);

        // Fetch user's profile to resolve full name and avatar
        const { data: prof } = await supabase
            .from("profiles")
            .select("full_name, avatar_url")
            .eq("id", user.id)
            .maybeSingle();

        const authorName =
            prof?.full_name ||
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            (user.email ? user.email.split("@")[0] : "Verified Motorist");

        const authorAvatar =
            prof?.avatar_url ||
            user.user_metadata?.avatar_url ||
            user.user_metadata?.picture ||
            undefined;

        // Persist author profile to local cache for instant zero-latency retrieval
        try {
            const rawCached = await AsyncStorage.getItem("@parkzone_cached_profiles");
            const cachedProfiles = rawCached ? JSON.parse(rawCached) : {};
            cachedProfiles[user.id] = { full_name: authorName, avatar_url: authorAvatar };
            await AsyncStorage.setItem("@parkzone_cached_profiles", JSON.stringify(cachedProfiles));
        } catch {}

        const newRecord = {
            location_id: payload.locationId,
            user_id: user.id,
            rating: payload.rating,
            comment: payload.comment.trim(),
            tags: payload.tags || [],
        };

        let insertedData: any = null;
        let insertError: any = null;

        const res = await supabase
            .from("location_reviews")
            .insert(newRecord)
            .select("id, location_id, user_id, rating, comment, tags, created_at, profiles:user_id(full_name, avatar_url)")
            .single();

        insertedData = res.data;
        insertError = res.error;

        if (insertError) {
            const fallback = await supabase
                .from("location_reviews")
                .insert(newRecord)
                .select()
                .single();
            insertedData = fallback.data;
            insertError = fallback.error;
        }

        const reviewObj: LocationReview = {
            id: insertedData?.id || `rev_${Date.now()}`,
            location_id: payload.locationId,
            user_id: user.id,
            user_name: insertedData?.profiles?.full_name || authorName,
            user_avatar: insertedData?.profiles?.avatar_url || authorAvatar,
            rating: payload.rating,
            comment: payload.comment.trim(),
            tags: payload.tags || [],
            created_at: insertedData?.created_at || new Date().toISOString(),
        };

        // Cache to AsyncStorage
        try {
            const current = await fetchLocationReviews(payload.locationId);
            const updated = [reviewObj, ...current.filter((r) => r.id !== reviewObj.id)];
            await AsyncStorage.setItem(`@parkzone_reviews_${payload.locationId}`, JSON.stringify(updated));
        } catch {}

        return { data: reviewObj };
    } catch (err: any) {
        return { error: err.message || "Failed to submit review" };
    }
}

// ------------------------------------------------------------------------------
// LOCATIONS & SPACES (Real-time Cloud Data from Admin Panel)
// ------------------------------------------------------------------------------

export function resolveSpaceImageUrl(
    seed?: string | null,
    kind: "regular" | "ev" | "handicap" = "regular",
    fallbackUrl?: string | null
): string | undefined {
    if (fallbackUrl && fallbackUrl.trim().length > 0) {
        return fallbackUrl.trim();
    }
    // Dynamic database image strictly: return undefined when no DB image is present
    return undefined;
}

export function parseLocationMeta(loc: any): {
    isElectric: boolean;
    isHandicap: boolean;
    layoutTopology?: TopologyType;
    facilities?: string[];
    hourlyRate?: number;
    dailyRate?: number;
} {
    let parsedMeta: any = null;
    if (typeof loc?.description === "string" && loc.description.trim().startsWith("{")) {
        try {
            const parsed = JSON.parse(loc.description);
            parsedMeta = parsed?.meta || parsed;
        } catch {}
    }

    // Determine handicap facility:
    // 1. Explicitly in DB column or parsed meta
    // 2. Or location name contains "accessible" or "handicap"
    const isHandicap = Boolean(
        loc?.is_handicap_facility === true ||
        parsedMeta?.is_handicap_facility === true ||
        /\b(accessible|handicap|disabled|wheelchair)\b/i.test(loc?.name || "")
    );

    // Determine electric facility:
    // 1. Must NOT be a handicap facility
    // 2. Explicitly in DB column or parsed meta
    // 3. Or location name explicitly mentions EV / Charging Hub / Supercharger
    const isElectric = !isHandicap && Boolean(
        loc?.is_electric_station === true ||
        parsedMeta?.is_electric_station === true ||
        /\b(ev|charging\s+hub|supercharger|hypercharger|electric\s+vehicle)\b/i.test(loc?.name || "")
    );

    return {
        isElectric,
        isHandicap,
        layoutTopology: parsedMeta?.layout_topology,
        facilities: Array.isArray(parsedMeta?.facilities) ? parsedMeta.facilities : undefined,
        hourlyRate: typeof parsedMeta?.hourly_rate === "number" ? parsedMeta.hourly_rate : undefined,
        dailyRate: typeof parsedMeta?.daily_rate === "number" ? parsedMeta.daily_rate : undefined,
    };
}

export const DB_REGISTERED_PARKING_SPACES: Record<string, ParkingSpace[]> = {
    // Kigali Heights Parking (Standard Parking)
    "11111111-1111-1111-1111-111111111111": [
        {
            id: "a0000000-0000-0000-0000-000000000001",
            location_id: "11111111-1111-1111-1111-111111111111",
            space_number: "R-01",
            zone_code: "Zone A",
            space_type: "regular",
            price_per_hour_rwf: 500,
            is_occupied: false,
            image_url: "https://jtemzkoydifrzdelxnkf.supabase.co/storage/v1/object/public/parking-images/locations/1793880408602_data-upload.jpeg",
            qr_code_token: "PZ-SPACE-1111-R01",
            spot_label: "Available",
            topology: "oblique",
        },
        {
            id: "a0000000-0000-0000-0000-000000000002",
            location_id: "11111111-1111-1111-1111-111111111111",
            space_number: "R-02",
            zone_code: "Zone A",
            space_type: "regular",
            price_per_hour_rwf: 500,
            is_occupied: false,
            image_url: "https://jtemzkoydifrzdelxnkf.supabase.co/storage/v1/object/public/parking-images/locations/1793880408602_data-upload.jpeg",
            qr_code_token: "PZ-SPACE-1111-R02",
            spot_label: "Available",
            topology: "oblique",
        },
        {
            id: "a0000000-0000-0000-0000-000000000003",
            location_id: "11111111-1111-1111-1111-111111111111",
            space_number: "R-03",
            zone_code: "Zone A",
            space_type: "regular",
            price_per_hour_rwf: 500,
            is_occupied: false,
            image_url: "https://jtemzkoydifrzdelxnkf.supabase.co/storage/v1/object/public/parking-images/locations/1793880408602_data-upload.jpeg",
            qr_code_token: "PZ-SPACE-1111-R03",
            spot_label: "Available",
            topology: "oblique",
        },
        {
            id: "a0000000-0000-0000-0000-000000000004",
            location_id: "11111111-1111-1111-1111-111111111111",
            space_number: "M-01",
            zone_code: "Zone A",
            space_type: "regular",
            price_per_hour_rwf: 200,
            is_occupied: false,
            image_url: "https://jtemzkoydifrzdelxnkf.supabase.co/storage/v1/object/public/parking-images/locations/1793880408602_data-upload.jpeg",
            qr_code_token: "PZ-SPACE-1111-M01",
            spot_label: "Available",
            topology: "oblique",
        },
    ],
    // Kigali Convention Centre Accessible Parking (Accessible Facility)
    "22222222-2222-2222-2222-222222222222": [
        {
            id: "b0000000-0000-0000-0000-000000000001",
            location_id: "22222222-2222-2222-2222-222222222222",
            space_number: "H-01",
            zone_code: "Zone A",
            space_type: "handicap",
            price_per_hour_rwf: 300,
            is_occupied: false,
            image_url: "https://jtemzkoydifrzdelxnkf.supabase.co/storage/v1/object/public/parking-images/locations/1793880428131_data-upload.jpeg",
            qr_code_token: "PZ-SPACE-2222-H01",
            spot_label: "Accessible",
            topology: "wide",
        },
        {
            id: "b0000000-0000-0000-0000-000000000002",
            location_id: "22222222-2222-2222-2222-222222222222",
            space_number: "H-02",
            zone_code: "Zone A",
            space_type: "handicap",
            price_per_hour_rwf: 300,
            is_occupied: false,
            image_url: "https://jtemzkoydifrzdelxnkf.supabase.co/storage/v1/object/public/parking-images/locations/1793880428131_data-upload.jpeg",
            qr_code_token: "PZ-SPACE-2222-H02",
            spot_label: "Accessible",
            topology: "wide",
        },
        {
            id: "b0000000-0000-0000-0000-000000000003",
            location_id: "22222222-2222-2222-2222-222222222222",
            space_number: "H-03",
            zone_code: "Zone A",
            space_type: "handicap",
            price_per_hour_rwf: 300,
            is_occupied: false,
            image_url: "https://jtemzkoydifrzdelxnkf.supabase.co/storage/v1/object/public/parking-images/locations/1793880428131_data-upload.jpeg",
            qr_code_token: "PZ-SPACE-2222-H03",
            spot_label: "Accessible",
            topology: "wide",
        },
    ],
    // Nyarutarama EV Charging Hub (EV Hypercharger Station)
    "33333333-3333-3333-3333-333333333333": [
        {
            id: "c0000000-0000-0000-0000-000000000001",
            location_id: "33333333-3333-3333-3333-333333333333",
            space_number: "EV-01",
            zone_code: "Zone A",
            space_type: "ev",
            price_per_hour_rwf: 1500,
            watt_power_kw: 120,
            price_per_kwh_rwf: 250,
            is_occupied: false,
            image_url: "https://jtemzkoydifrzdelxnkf.supabase.co/storage/v1/object/public/parking-images/locations/1793880444198_data-upload.jpeg",
            qr_code_token: "PZ-SPACE-3333-EV01",
            spot_label: "120kW DC",
            topology: "perpendicular",
        },
        {
            id: "c0000000-0000-0000-0000-000000000002",
            location_id: "33333333-3333-3333-3333-333333333333",
            space_number: "EV-02",
            zone_code: "Zone A",
            space_type: "ev",
            price_per_hour_rwf: 1500,
            watt_power_kw: 60,
            price_per_kwh_rwf: 250,
            is_occupied: false,
            image_url: "https://jtemzkoydifrzdelxnkf.supabase.co/storage/v1/object/public/parking-images/locations/1793880444198_data-upload.jpeg",
            qr_code_token: "PZ-SPACE-3333-EV02",
            spot_label: "60kW DC",
            topology: "perpendicular",
        },
        {
            id: "c0000000-0000-0000-0000-000000000003",
            location_id: "33333333-3333-3333-3333-333333333333",
            space_number: "EV-03",
            zone_code: "Zone A",
            space_type: "ev",
            price_per_hour_rwf: 1500,
            watt_power_kw: 22,
            price_per_kwh_rwf: 250,
            is_occupied: false,
            image_url: "https://jtemzkoydifrzdelxnkf.supabase.co/storage/v1/object/public/parking-images/locations/1793880444198_data-upload.jpeg",
            qr_code_token: "PZ-SPACE-3333-EV03",
            spot_label: "22kW AC",
            topology: "perpendicular",
        },
    ],
};

export async function fetchParkingLocations(): Promise<ParkingLocation[]> {
    const { data, error } = await supabase
        .from("parking_locations")
        .select("*")
        .order("name", { ascending: true });

    if (error) {
        console.warn("fetchParkingLocations error:", error);
        return [];
    }

    const { data: allSpaces } = await supabase
        .from("parking_spaces")
        .select("*");

    const spacesByLoc = new Map<string, any[]>();
    (allSpaces || []).forEach((s: any) => {
        const arr = spacesByLoc.get(s.location_id) || [];
        arr.push(s);
        spacesByLoc.set(s.location_id, arr);
    });

    if (spacesByLoc.size === 0) {
        Object.entries(DB_REGISTERED_PARKING_SPACES).forEach(([locId, spaces]) => {
            spacesByLoc.set(locId, spaces);
        });
    }

    return ((data as any[]) || [])
        .filter((loc) => loc.is_active !== false && loc.status !== "inactive")
        .map((loc) => {
        const meta = parseLocationMeta(loc);
        const locSpaces = spacesByLoc.get(loc.id) || [];
        const hasEvSpaces = locSpaces.some((s: any) => s.space_type === "ev" || s.vehicle_type === "ev");
        const hasHcSpaces = locSpaces.some((s: any) => s.space_type === "handicap");
        const allRegular = locSpaces.length > 0 && locSpaces.every((s: any) => s.space_type === "regular");

        const isHandicap = !allRegular && (meta.isHandicap || (hasHcSpaces && !hasEvSpaces));
        const isElectric = !isHandicap && !allRegular && (meta.isElectric || hasEvSpaces);

        const totalSpots = Number(loc.total_spots) || (locSpaces.length > 0 ? locSpaces.length : 12);
        const availableSpots =
            loc.available_spots !== undefined && loc.available_spots !== null
                ? Number(loc.available_spots)
                : locSpaces.length > 0
                ? locSpaces.filter((s: any) => s.status === "available" && !s.is_occupied).length
                : totalSpots;

        const hourlyRate =
            meta.hourlyRate ||
            Number(loc.hourly_rate) ||
            Number(locSpaces.find((s: any) => s.price_per_hour_rwf || s.hourly_rate)?.price_per_hour_rwf) ||
            Number(locSpaces.find((s: any) => s.hourly_rate)?.hourly_rate) ||
            (isElectric ? 1500 : isHandicap ? 300 : 500);

        const dailyRate =
            meta.dailyRate ||
            Number(loc.daily_rate) ||
            Number(locSpaces.find((s: any) => s.daily_rate)?.daily_rate) ||
            (isElectric ? 10000 : 2000);

        const zoneCode =
            loc.zone_code ||
            (isElectric ? "Zone A" : isHandicap ? "Zone E" : "Zone A");

        const layoutTopology = (meta.layoutTopology || loc.layout_topology || "perpendicular") as TopologyType;
        const facilities = meta.facilities || loc.facilities || ["CCTV", "Security Guard"];
        const dbImage = loc.image_url && loc.image_url.trim().length > 0 ? loc.image_url.trim() : undefined;

        return {
            id: loc.id,
            name: loc.name,
            address: loc.address,
            city: loc.city || "Kigali",
            country: loc.country || "Rwanda",
            latitude: Number(loc.latitude),
            longitude: Number(loc.longitude),
            layout_topology: layoutTopology,
            total_spots: totalSpots,
            available_spots: availableSpots,
            hourly_rate: hourlyRate,
            daily_rate: dailyRate,
            currency: loc.currency || "RWF",
            qr_code_identifier: loc.qr_code_identifier || loc.id,
            facilities: facilities,
            is_active: loc.is_active !== undefined ? loc.is_active : true,
            status: loc.status || "active",
            is_electric_station: isElectric,
            is_handicap_facility: isHandicap,
            zone_code: zoneCode,
            image_url: dbImage,
            created_at: loc.created_at,
            updated_at: loc.updated_at,
        };
    });
}

export async function fetchSpotsForLocation(
    locationId: string,
    zoneCode?: string
): Promise<ParkingSpace[]> {
    const [
        spacesRes,
        { data: locRow },
        chargers,
        { data: activeTickets },
        { data: activeEvSessions },
        { data: dbVehicles },
    ] = await Promise.all([
        supabase
            .from("parking_spaces")
            .select("*")
            .eq("location_id", locationId)
            .order("space_number", { ascending: true }),
        supabase
            .from("parking_locations")
            .select("*")
            .eq("id", locationId)
            .maybeSingle(),
        fetchEvChargers(locationId),
        supabase
            .from("parking_tickets")
            .select("space_id, qr_token, vehicle_plate")
            .eq("location_id", locationId)
            .eq("status", "active"),
        supabase
            .from("ev_charging_sessions")
            .select("bay_number, vehicle_plate")
            .eq("location_id", locationId)
            .eq("status", "active"),
        supabase
            .from("vehicles")
            .select("plate_number, color, user_id, make_model"),
    ]);

    let rawSpaces = (spacesRes.data || []) as ParkingSpace[];
    if (spacesRes.error || rawSpaces.length === 0) {
        const retryRes = await supabase
            .from("parking_spaces")
            .select("id, location_id, space_number, zone_code, space_type, price_per_hour_rwf, image_url, is_occupied, current_vehicle_plate, qr_code_token, created_at, updated_at")
            .eq("location_id", locationId)
            .order("space_number", { ascending: true });
        if (retryRes.data && retryRes.data.length > 0) {
            rawSpaces = retryRes.data as any;
        } else if (DB_REGISTERED_PARKING_SPACES[locationId]) {
            rawSpaces = DB_REGISTERED_PARKING_SPACES[locationId];
        }
    }

    if (!locRow && rawSpaces.length === 0 && chargers.length === 0) {
        return [];
    }

    const locMeta = parseLocationMeta(locRow);
    const hasRawEv = rawSpaces.some((s) => s.space_type === "ev");
    const hasRawHc = rawSpaces.some((s) => s.space_type === "handicap");
    const allRawRegular = rawSpaces.length > 0 && rawSpaces.every((s) => s.space_type === "regular");

    const isHandicapFacility = !allRawRegular && Boolean(
        locMeta.isHandicap || (hasRawHc && !hasRawEv)
    );
    const isEvStation = !isHandicapFacility && !allRawRegular && Boolean(
        locMeta.isElectric || hasRawEv || (chargers.length > 0 && rawSpaces.length === 0)
    );
    const locationHourlyRate = locMeta.hourlyRate || Number(locRow?.hourly_rate) || (isEvStation ? 1500 : isHandicapFacility ? 300 : 500);
    const locationTopology: TopologyType = (locMeta.layoutTopology || locRow?.layout_topology || (isHandicapFacility ? "wide" : "perpendicular")) as TopologyType;

    const occupiedSpaceIds = new Map<string, string>();
    const occupiedBayNumbers = new Map<string, string>();

    const fetchedUserColors: string[] = [];
    (dbVehicles || []).forEach((v: any) => {
        if (v.plate_number && v.color) {
            const cleanPlate = v.plate_number.trim().toUpperCase();
            const cleanColor = v.color.trim();
            cachedPlateColorMap.set(cleanPlate, cleanColor);
        }
        if (v.color && v.color.trim()) {
            fetchedUserColors.push(v.color.trim());
        }
    });

    if (fetchedUserColors.length > 0) {
        setUserCarColorsCache(fetchedUserColors);
    }

    (activeTickets || []).forEach((t: any) => {
        if (t.space_id) occupiedSpaceIds.set(t.space_id, t.vehicle_plate || "PARKED");
        const bayFromQr = extractBayFromQrToken(t.qr_token);
        if (bayFromQr) occupiedBayNumbers.set(bayFromQr.toUpperCase(), t.vehicle_plate || "PARKED");
    });

    (activeEvSessions || []).forEach((ev: any) => {
        if (ev.bay_number) {
            occupiedBayNumbers.set(String(ev.bay_number).toUpperCase(), ev.vehicle_plate || "CHARGING");
        }
    });

    const chargerMap = new Map<string, EvChargerTelemetry>();
    chargers.forEach((c) => {
        if (c.station_identifier) {
            chargerMap.set(c.station_identifier, c);
            if (c.status && c.status !== "available") {
                occupiedBayNumbers.set(c.station_identifier.toUpperCase(), c.status.toUpperCase());
            }
        }
    });

    // Normalize real database rows from parking_spaces
    const normalizedDbSpaces: ParkingSpace[] = rawSpaces.map((s, idx) => {
        const isSpaceEv = s.space_type === "ev" || (isEvStation && s.space_type !== "handicap" && s.space_type !== "regular");
        const isSpaceHc = s.space_type === "handicap" || (!isSpaceEv && isHandicapFacility && s.space_type !== "regular");

        const normalizedZone = STANDARD_PARKING_ZONES.includes(s.zone_code as any)
            ? s.zone_code
            : locRow?.zone_code && STANDARD_PARKING_ZONES.includes(locRow.zone_code as any)
            ? locRow.zone_code
            : isSpaceEv
            ? "Zone A"
            : isSpaceHc
            ? "Zone E"
            : "Zone A";

        const matchingCharger =
            chargerMap.get(s.space_number) ||
            (isSpaceEv && chargers.length > 0 ? chargers[idx % chargers.length] : undefined);
        const wattPower = s.watt_power_kw ?? (isSpaceEv ? matchingCharger?.max_output_kw || (normalizedZone === "Zone A" ? 150 : normalizedZone === "Zone B" ? 50 : 22) : undefined);
        const priceKwh = s.price_per_kwh_rwf ?? (isSpaceEv ? matchingCharger?.price_per_kwh || 250 : undefined);

        const spaceDbImage =
            s.image_url && s.image_url.trim().length > 0
                ? s.image_url.trim()
                : locRow?.image_url && locRow.image_url.trim().length > 0
                ? locRow.image_url.trim()
                : undefined;

        const activeTicketPlate =
            occupiedSpaceIds.get(s.id) || occupiedBayNumbers.get(s.space_number.toUpperCase());
        const chargerBusy = matchingCharger && chargerMap.has(s.space_number) && matchingCharger.status !== "available";
        const effectiveOccupied = Boolean(s.is_occupied || activeTicketPlate || chargerBusy);

        const zoneMeta = getZoneLotMeta(normalizedZone, isEvStation);
        const spotLabel = isSpaceEv
            ? wattPower
                ? `${wattPower}kW ${wattPower >= 50 ? "DC" : "AC"}`
                : "Fast Charger"
            : isSpaceHc
            ? "Accessible"
            : zoneMeta.defaultSpotLabel;

        const spaceType: "regular" | "ev" | "handicap" =
            isSpaceEv ? "ev" : isSpaceHc ? "handicap" : "regular";

        const spotHourlyRate =
            s.price_per_hour_rwf !== undefined && s.price_per_hour_rwf !== null
                ? Number(s.price_per_hour_rwf)
                : isSpaceEv
                ? 0
                : locationHourlyRate;

        return {
            ...s,
            space_type: spaceType,
            zone_code: normalizedZone,
            image_url: spaceDbImage,
            is_occupied: effectiveOccupied,
            current_vehicle_plate: s.current_vehicle_plate || activeTicketPlate || null,
            watt_power_kw: wattPower,
            price_per_hour_rwf: spotHourlyRate,
            price_per_kwh_rwf: priceKwh,
            topology: s.topology || (isSpaceHc ? "wide" : locationTopology),
            car_color: resolveParkedCarColor(
                `${locationId}-${normalizedZone}-${s.space_number}`,
                s.current_vehicle_plate || activeTicketPlate || occupiedBayNumbers.get(s.space_number.toUpperCase()) || null
            ),
            spot_label: spotLabel,
        };
    });

    // Strictly return only real database added lots per parking space (no synthetic padding)
    if (zoneCode && zoneCode !== "All Zones") {
        return normalizedDbSpaces.filter((s) => s.zone_code === zoneCode);
    }
    return normalizedDbSpaces;
}

let realtimeSubscriptionSeq = 0;

/**
 * Real-time Database Subscription for Parking Spaces Occupancy and Telemetry
 */
export function subscribeToSpacesRealtime(
    locationId: string,
    onUpdate: (updatedSpace: Partial<ParkingSpace> & { id: string }) => void
) {
    const channelName = `realtime-spaces-${locationId}-${++realtimeSubscriptionSeq}`;
    const channel = supabase
        .channel(channelName)
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "parking_spaces",
                filter: `location_id=eq.${locationId}`,
            },
            (payload) => {
                if (payload.new && (payload.new as any).id) {
                    onUpdate(payload.new as any);
                }
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

/**
 * Live Simulation & Testing helper for zero-latency occupancy toggling
 */
export async function toggleSlotOccupancy(spaceId: string, isOccupied: boolean, plateNumber?: string) {
    try {
        const { data, error } = await supabase
            .from("parking_spaces")
            .update({
                is_occupied: isOccupied,
                current_vehicle_plate: isOccupied ? (plateNumber || null) : null,
                occupied_at: isOccupied ? new Date().toISOString() : null,
            })
            .eq("id", spaceId)
            .select()
            .single();
        return { data, error };
    } catch (e: any) {
        return { error: e.message };
    }
}

// ------------------------------------------------------------------------------
// ACTIVE EV CHARGING TELEMETRY (OCPP 2.0.1 Ready)
// ------------------------------------------------------------------------------

export async function fetchEvChargers(locationId: string): Promise<EvChargerTelemetry[]> {
    const { data, error } = await supabase
        .from("ev_charging_points")
        .select("*")
        .eq("location_id", locationId);

    if (!error && data && data.length > 0) {
        return (data || []).map((c: any) => ({
            ...c,
            max_power_watts: c.max_power_watts || (c.max_output_kw * 1000),
            charging_power_watts: c.charging_power_watts !== undefined ? c.charging_power_watts : (c.current_power_draw_kw * 1000),
            voltage_volts: c.voltage_volts || (c.max_output_kw >= 50 ? 400 : 230),
            amperage_amps: c.amperage_amps || (c.charging_power_watts ? Math.round(c.charging_power_watts / (c.voltage_volts || 400)) : 0),
            is_operational: c.is_operational !== undefined ? c.is_operational : (c.status !== "faulted" && c.status !== "offline"),
            operational_status: c.operational_status || (c.status === "faulted" ? "faulted" : "operational"),
            api_provider: c.api_provider || "OCPP 2.0.1",
            flat_rate_full_rwf: c.flat_rate_full_rwf || 10000,
            flat_rate_quick_rwf: c.flat_rate_quick_rwf || 9000,
            quick_session_threshold_mins: c.quick_session_threshold_mins || 30,
        }));
    }

    // Fallback: derive chargers from parking_spaces in database
    const { data: spaces } = await supabase
        .from("parking_spaces")
        .select("*")
        .eq("location_id", locationId);

    const evSpaces = (spaces || []).filter((s: any) => s.space_type === "ev" || s.vehicle_type === "ev");
    if (evSpaces.length > 0) {
        return evSpaces.map((s: any, idx: number) => ({
            id: s.id,
            location_id: locationId,
            space_id: s.id,
            station_identifier: s.space_number || `EV-0${idx + 1}`,
            connector_type: s.space_number?.includes("03") ? "Type 2" : "CCS2",
            max_output_kw: s.watt_power_kw || (s.space_number?.includes("03") ? 22 : 60),
            max_power_watts: (s.watt_power_kw || (s.space_number?.includes("03") ? 22 : 60)) * 1000,
            price_per_kwh: s.price_per_kwh_rwf || 250,
            status: s.status === "available" && !s.is_occupied ? "available" : "charging",
            current_power_draw_kw: s.status === "available" && !s.is_occupied ? 0 : 42,
            charging_power_watts: s.status === "available" && !s.is_occupied ? 0 : 42000,
            voltage_volts: 400,
            amperage_amps: s.status === "available" && !s.is_occupied ? 0 : 105,
            is_operational: true,
            operational_status: "operational",
            api_provider: "OCPP 2.0.1",
            flat_rate_full_rwf: s.daily_rate || 10000,
            flat_rate_quick_rwf: s.hourly_rate ? s.hourly_rate * 6 : 9000,
            quick_session_threshold_mins: 30,
            image_url: s.image_url?.trim() || undefined,
        }));
    }

    return [];
}

/**
 * Real-time Database Subscription for EV Chargers Telemetry (Watts, Volts, Working State)
 */
export function subscribeToEvChargersRealtime(
    locationId: string,
    onUpdate: (updatedCharger: EvChargerTelemetry) => void
) {
    const channelName = `realtime-ev-chargers-${locationId}-${++realtimeSubscriptionSeq}`;
    const channel = supabase
        .channel(channelName)
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "ev_charging_points",
                filter: `location_id=eq.${locationId}`,
            },
            (payload) => {
                if (payload.new && (payload.new as any).id) {
                    const c = payload.new as any;
                    onUpdate({
                        ...c,
                        max_power_watts: c.max_power_watts || (c.max_output_kw * 1000),
                        charging_power_watts: c.charging_power_watts !== undefined ? c.charging_power_watts : (c.current_power_draw_kw * 1000),
                        voltage_volts: c.voltage_volts || 400,
                        amperage_amps: c.amperage_amps || 0,
                        is_operational: c.is_operational !== undefined ? c.is_operational : (c.status !== "faulted"),
                        operational_status: c.operational_status || "operational",
                        flat_rate_full_rwf: c.flat_rate_full_rwf || 10000,
                        flat_rate_quick_rwf: c.flat_rate_quick_rwf || 9000,
                        quick_session_threshold_mins: c.quick_session_threshold_mins || 30,
                    });
                }
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

/**
 * Update EV Charger Telemetry & Hardware Health (Working vs Faulted vs Offline)
 */
export async function updateChargerTelemetry(
    chargerId: string,
    telemetry: Partial<EvChargerTelemetry>
) {
    try {
        const payload: Record<string, any> = {
            ...telemetry,
            last_heartbeat: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        if (telemetry.charging_power_watts !== undefined) {
            payload.current_power_draw_kw = Number((telemetry.charging_power_watts / 1000).toFixed(2));
        }
        if (telemetry.is_operational !== undefined) {
            payload.operational_status = telemetry.is_operational ? "operational" : "faulted";
            payload.status = telemetry.is_operational ? (telemetry.status || "available") : "faulted";
        }
        const { data, error } = await supabase
            .from("ev_charging_points")
            .update(payload)
            .eq("id", chargerId)
            .select()
            .single();
        return { data, error };
    } catch (e: any) {
        return { error: e.message };
    }
}

// ------------------------------------------------------------------------------
// SESSIONS & TICKETS
// ------------------------------------------------------------------------------

export interface ParkingHistoryRecord {
    id: string;
    name: string;
    address: string;
    bayNumber: string;
    zoneCode: string;
    plate: string;
    date: string;
    duration: string;
    cost: number;
    currency: string;
    status: "Completed" | "Active" | "Closed" | "Incomplete";
    isCompleted?: boolean;
    isIncomplete?: boolean;
    image: string;
    receiptNumber: string;
    entryTimeIso?: string;
    violationFine?: number;
    violationReason?: string;
    type?: "parking" | "charging";
}

export async function startParkingSession(params: {
    userId: string;
    vehicleId?: string;
    vehiclePlate: string;
    locationId: string;
    spaceId?: string;
    qrToken: string;
    hourlyRate?: number;
    durationHours?: number;
    totalAmount?: number;
    paymentStatus?: "unpaid" | "paid";
}) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
        await ensureUserProfile(user);
    }

    // Resolve location ID — ensure valid UUID
    let resolvedLocId = params.locationId;
    if (!resolvedLocId || !isValidUuid(resolvedLocId)) {
        const { data: fallbackLoc } = await supabase
            .from("parking_locations")
            .select("id, hourly_rate, daily_rate")
            .limit(1)
            .maybeSingle();
        if (fallbackLoc?.id) {
            resolvedLocId = fallbackLoc.id;
        }
    }

    // Read live tariff rates from parking_locations (and space override if present)
    const { data: locRow } = await supabase
        .from("parking_locations")
        .select("hourly_rate, daily_rate")
        .eq("id", resolvedLocId)
        .maybeSingle();

    let hourlyRate = params.hourlyRate || Number(locRow?.hourly_rate) || 300;
    const dailyCap = Number(locRow?.daily_rate) || 2000;
    const dbSpaceId = params.spaceId && isValidUuid(params.spaceId) ? params.spaceId : undefined;

    if (dbSpaceId && !params.hourlyRate) {
        const { data: spRow } = await supabase
            .from("parking_spaces")
            .select("price_per_hour_rwf")
            .eq("id", dbSpaceId)
            .maybeSingle();
        if (spRow?.price_per_hour_rwf !== undefined && spRow?.price_per_hour_rwf !== null && Number(spRow.price_per_hour_rwf) > 0) {
            hourlyRate = Number(spRow.price_per_hour_rwf);
        }
    }

    const exactHours = params.durationHours || 1;
    const exactTotal = params.totalAmount !== undefined ? params.totalAmount : hourlyRate * exactHours;
    const paymentStatus = params.paymentStatus || "paid";

    const ticketNumber = `PZ-${Date.now().toString().slice(-6)}`;
    const formattedPlate = params.vehiclePlate.trim().toUpperCase();
    const plateHash = hashLicensePlate(formattedPlate);

    const { data: ticket, error: ticketError } = await supabase
        .from("parking_tickets")
        .insert({
            ticket_number: ticketNumber,
            user_id: params.userId,
            vehicle_id: params.vehicleId && isValidUuid(params.vehicleId) ? params.vehicleId : null,
            vehicle_plate: formattedPlate,
            plate_hash: plateHash,
            location_id: resolvedLocId,
            space_id: dbSpaceId || null,
            hourly_rate: hourlyRate,
            daily_cap: dailyCap,
            rate_applied: "hourly",
            hours_elapsed: exactHours,
            total_amount: exactTotal,
            amount_paid: paymentStatus === "paid" ? exactTotal : 0,
            payment_status: paymentStatus,
            status: "active",
            // qr_token is UNIQUE per ticket — suffix so the same bay can be booked again later
            qr_token: `${params.qrToken}-PZ-${Date.now()}`,
            entry_time: new Date().toISOString(),
        })
        .select()
        .single();

    if (ticketError) {
        return { error: ticketError.message };
    }

    // Mark parking space as occupied
    if (dbSpaceId) {
        await supabase
            .from("parking_spaces")
            .update({
                is_occupied: true,
                current_vehicle_plate: formattedPlate,
                current_plate_hash: plateHash,
                current_vehicle_id: params.vehicleId && isValidUuid(params.vehicleId) ? params.vehicleId : null,
                occupied_at: new Date().toISOString(),
            })
            .eq("id", dbSpaceId);
    }

    return { data: ticket };
}

export async function completeParkingSession(params: {
    ticketId: string;
    spaceId?: string;
    paymentMethod: "momo" | "airtel" | "card" | "wallet";
    amount: number;
}) {
    const now = new Date().toISOString();

    const { data, error } = await supabase
        .from("parking_tickets")
        .update({
            exit_time: now,
            status: "completed",
            payment_status: "paid",
            payment_method: params.paymentMethod,
            total_amount: params.amount,
            amount_paid: params.amount,
        })
        .eq("id", params.ticketId)
        .select()
        .single();

    if (error) {
        return { error: error.message };
    }

    if (params.spaceId && isValidUuid(params.spaceId)) {
        await supabase
            .from("parking_spaces")
            .update({
                is_occupied: false,
                current_vehicle_plate: null,
                current_plate_hash: null,
                current_vehicle_id: null,
                occupied_at: null,
            })
            .eq("id", params.spaceId);
    }

    return { data };
}

/**
 * Fetch all EV Stations & their live chargers directly from database
 */
export async function fetchAllEvStationsWithChargers(): Promise<DbEvStationItem[]> {
    // Fallback default Kigali EV stations if database is offline or empty
    const defaultKigaliEvStations: DbEvStationItem[] = [
        {
            id: "33333333-3333-3333-3333-333333333333",
            name: "Nyarutarama EV Charging Hub",
            address: "KG 9 Ave, Nyarutarama",
            city: "Kigali",
            distance: "",
            latitude: -1.942,
            longitude: 30.113,
            tariff: "250 RWF/kWh",
            image: "https://jtemzkoydifrzdelxnkf.supabase.co/storage/v1/object/public/parking-images/locations/1793880444198_data-upload.jpeg",
            image_url: "https://jtemzkoydifrzdelxnkf.supabase.co/storage/v1/object/public/parking-images/locations/1793880444198_data-upload.jpeg",
            chargers: [
                {
                    id: "c0000000-0000-0000-0000-000000000001",
                    location_id: "33333333-3333-3333-3333-333333333333",
                    station_identifier: "EV-01",
                    connector_type: "CCS2",
                    max_output_kw: 60,
                    max_power_watts: 60000,
                    price_per_kwh: 250,
                    status: "available",
                    current_power_draw_kw: 0,
                    charging_power_watts: 0,
                    voltage_volts: 400,
                    amperage_amps: 0,
                    is_operational: true,
                    operational_status: "operational",
                    api_provider: "OCPP 2.0.1",
                    flat_rate_full_rwf: 10000,
                    flat_rate_quick_rwf: 9000,
                    quick_session_threshold_mins: 30,
                    image_url: undefined,
                },
                {
                    id: "c0000000-0000-0000-0000-000000000002",
                    location_id: "33333333-3333-3333-3333-333333333333",
                    station_identifier: "EV-02",
                    connector_type: "CCS2",
                    max_output_kw: 60,
                    max_power_watts: 60000,
                    price_per_kwh: 250,
                    status: "available",
                    current_power_draw_kw: 0,
                    charging_power_watts: 0,
                    voltage_volts: 400,
                    amperage_amps: 0,
                    is_operational: true,
                    operational_status: "operational",
                    api_provider: "OCPP 2.0.1",
                    flat_rate_full_rwf: 10000,
                    flat_rate_quick_rwf: 9000,
                    quick_session_threshold_mins: 30,
                    image_url: undefined,
                },
                {
                    id: "c0000000-0000-0000-0000-000000000003",
                    location_id: "33333333-3333-3333-3333-333333333333",
                    station_identifier: "EV-03",
                    connector_type: "Type 2",
                    max_output_kw: 22,
                    max_power_watts: 22000,
                    price_per_kwh: 250,
                    status: "available",
                    current_power_draw_kw: 0,
                    charging_power_watts: 0,
                    voltage_volts: 400,
                    amperage_amps: 0,
                    is_operational: true,
                    operational_status: "operational",
                    api_provider: "OCPP 2.0.1",
                    flat_rate_full_rwf: 10000,
                    flat_rate_quick_rwf: 9000,
                    quick_session_threshold_mins: 30,
                    image_url: undefined,
                },
            ],
        },
    ];

    const { data: locs, error: locErr } = await supabase
        .from("parking_locations")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });

    if (locErr || !locs || locs.length === 0) {
        return defaultKigaliEvStations;
    }

    const { data: allChargers } = await supabase
        .from("ev_charging_points")
        .select("*");

    const { data: allSpaces } = await supabase
        .from("parking_spaces")
        .select("*");

    const chargersByLoc = new Map<string, EvChargerTelemetry[]>();
    (allChargers || []).forEach((c: any) => {
        const chargerImg = c.image_url && c.image_url.trim().length > 0 ? c.image_url.trim() : undefined;
        const mapped: EvChargerTelemetry = {
            ...c,
            image_url: chargerImg,
            max_power_watts: c.max_power_watts || (c.max_output_kw * 1000),
            charging_power_watts: c.charging_power_watts !== undefined ? c.charging_power_watts : (c.current_power_draw_kw * 1000),
            voltage_volts: c.voltage_volts || (c.max_output_kw >= 50 ? 400 : 230),
            amperage_amps: c.amperage_amps || 0,
            is_operational: c.is_operational !== undefined ? c.is_operational : (c.status !== "faulted" && c.status !== "offline"),
            operational_status: c.operational_status || (c.status === "faulted" ? "faulted" : "operational"),
            api_provider: c.api_provider || "OCPP 2.0.1",
            flat_rate_full_rwf: c.flat_rate_full_rwf || 10000,
            flat_rate_quick_rwf: c.flat_rate_quick_rwf || 9000,
            quick_session_threshold_mins: c.quick_session_threshold_mins || 30,
        };
        const arr = chargersByLoc.get(c.location_id) || [];
        arr.push(mapped);
        chargersByLoc.set(c.location_id, arr);
    });

    const spacesByLoc = new Map<string, any[]>();
    (allSpaces || []).forEach((s: any) => {
        const arr = spacesByLoc.get(s.location_id) || [];
        arr.push(s);
        spacesByLoc.set(s.location_id, arr);
    });

    if (spacesByLoc.size === 0) {
        Object.entries(DB_REGISTERED_PARKING_SPACES).forEach(([locId, spaces]) => {
            spacesByLoc.set(locId, spaces);
        });
    }

    const stations: DbEvStationItem[] = [];
    for (const loc of locs) {
        const meta = parseLocationMeta(loc);
        const locSpaces = spacesByLoc.get(loc.id) || [];
        const evSpaces = locSpaces.filter((s: any) => s.space_type === "ev" || s.vehicle_type === "ev");

        const isEvStation = Boolean(
            !meta.isHandicap &&
            (chargersByLoc.has(loc.id) ||
             evSpaces.length > 0 ||
             meta.isElectric)
        );

        if (!isEvStation) continue;

        let chargers = chargersByLoc.get(loc.id) || [];

        // If no dedicated ev_charging_points rows exist, derive chargers from parking_spaces
        if (chargers.length === 0 && evSpaces.length > 0) {
            chargers = evSpaces.map((s: any, idx: number) => ({
                id: s.id,
                location_id: loc.id,
                space_id: s.id,
                station_identifier: s.space_number || `EV-0${idx + 1}`,
                connector_type: s.space_number?.includes("03") ? "Type 2" : "CCS2",
                max_output_kw: s.watt_power_kw || (s.space_number?.includes("03") ? 22 : 60),
                max_power_watts: (s.watt_power_kw || (s.space_number?.includes("03") ? 22 : 60)) * 1000,
                price_per_kwh: s.price_per_kwh_rwf || 250,
                status: s.status === "available" && !s.is_occupied ? "available" : "charging",
                current_power_draw_kw: s.status === "available" && !s.is_occupied ? 0 : 42,
                charging_power_watts: s.status === "available" && !s.is_occupied ? 0 : 42000,
                voltage_volts: 400,
                amperage_amps: s.status === "available" && !s.is_occupied ? 0 : 105,
                is_operational: true,
                operational_status: "operational",
                api_provider: "OCPP 2.0.1",
                flat_rate_full_rwf: s.daily_rate || 10000,
                flat_rate_quick_rwf: s.hourly_rate ? s.hourly_rate * 6 : 9000,
                quick_session_threshold_mins: 30,
                image_url: s.image_url?.trim() || loc.image_url?.trim() || undefined,
            }));
        }

        // Fallback chargers if the station has zero space rows configured yet
        if (chargers.length === 0) {
            chargers = [1, 2, 3, 4].map((num) => ({
                id: `${loc.id}-charger-${num}`,
                location_id: loc.id,
                station_identifier: `BAY-0${num}`,
                connector_type: num === 4 ? "Type 2" : "CCS2",
                max_output_kw: num === 4 ? 22 : 60,
                max_power_watts: num === 4 ? 22000 : 60000,
                price_per_kwh: 250,
                status: "available",
                current_power_draw_kw: 0,
                charging_power_watts: 0,
                voltage_volts: 400,
                amperage_amps: 0,
                is_operational: true,
                operational_status: "operational",
                api_provider: "OCPP 2.0.1",
                flat_rate_full_rwf: 10000,
                flat_rate_quick_rwf: 9000,
                quick_session_threshold_mins: 30,
                image_url: loc.image_url?.trim() || undefined,
            }));
        }

        const quick = chargers[0]?.flat_rate_quick_rwf || 9000;
        const full = chargers[0]?.flat_rate_full_rwf || 10000;
        const dbStationImg = loc.image_url && loc.image_url.trim().length > 0 ? loc.image_url.trim() : undefined;

        stations.push({
            id: loc.id,
            name: loc.name,
            address: loc.address,
            distance: "",
            latitude: Number(loc.latitude),
            longitude: Number(loc.longitude),
            tariff: "250 RWF/kWh",
            image: dbStationImg,
            image_url: dbStationImg,
            chargers,
        });
    }

    if (stations.length === 0) {
        return defaultKigaliEvStations;
    }

    return stations;
}

/**
 * Lookup a parking space directly in database by QR code token or space number
 */
export async function lookupSpaceByQrOrNumber(rawTokenOrBay: string) {
    const cleaned = rawTokenOrBay.trim();
    const { data: byQr } = await supabase
        .from("parking_spaces")
        .select("*, parking_locations:location_id (*)")
        .eq("qr_code_token", cleaned)
        .maybeSingle();

    if (byQr) {
        return {
            ...byQr,
            image_url: byQr.image_url?.trim() || undefined,
        };
    }

    const { data: byNumber } = await supabase
        .from("parking_spaces")
        .select("*, parking_locations:location_id (*)")
        .ilike("space_number", cleaned)
        .limit(1)
        .maybeSingle();

    if (!byNumber) return null;
    return {
        ...byNumber,
        image_url: byNumber.image_url?.trim() || undefined,
    };
}

/**
 * Fetch active parking session from database for the authenticated user
 */
export async function fetchActiveParkingTicket(userId?: string) {
    let uid = userId;
    if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id;
    }
    if (!uid) return null;

    const { data, error } = await supabase
        .from("parking_tickets")
        .select(`
            *,
            parking_locations:location_id (*),
            parking_spaces:space_id (*)
        `)
        .eq("user_id", uid)
        .eq("status", "active")
        .order("entry_time", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !data) return null;
    return data;
}

/**
 * Fetch combined parking & EV charging history from database for the authenticated user
 * Accurately aggregates both completed and incomplete (active/ongoing/closed) sessions.
 */
export async function fetchUserParkingHistory(userId?: string): Promise<ParkingHistoryRecord[]> {
    let uid = userId;
    if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id;
    }
    if (!uid) return [];

    const records: ParkingHistoryRecord[] = [];

    // Query registered vehicle plates belonging to the driver
    const { data: vehicles } = await supabase
        .from("vehicles")
        .select("plate_number")
        .eq("user_id", uid);
    const userPlates = (vehicles || [])
        .map((v: any) => v.plate_number ? String(v.plate_number).trim().toUpperCase() : "")
        .filter(Boolean);

    // 1. Fetch parking tickets (both active/incomplete and completed)
    let ticketQuery = supabase
        .from("parking_tickets")
        .select(`
            id, ticket_number, vehicle_plate, entry_time, exit_time,
            status, hourly_rate, total_amount, payment_status, created_at, hours_elapsed,
            parking_locations:location_id (*),
            parking_spaces:space_id (*)
        `);

    if (userPlates.length > 0) {
        const plateList = userPlates.map((p) => `"${p}"`).join(",");
        ticketQuery = ticketQuery.or(`user_id.eq.${uid},vehicle_plate.in.(${plateList})`);
    } else {
        ticketQuery = ticketQuery.eq("user_id", uid);
    }

    const { data: tickets } = await ticketQuery
        .order("entry_time", { ascending: false })
        .limit(50);

    (tickets || []).forEach((t: any) => {
        const entryDate = new Date(t.entry_time);
        const exitDate = t.exit_time ? new Date(t.exit_time) : null;
        const nowMs = Date.now();
        const diffMins = exitDate
            ? Math.max(1, Math.round((exitDate.getTime() - entryDate.getTime()) / 60000))
            : Math.max(1, Math.round((nowMs - entryDate.getTime()) / 60000));
        const hrs = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        const loc = Array.isArray(t.parking_locations) ? t.parking_locations[0] : t.parking_locations;
        const sp = Array.isArray(t.parking_spaces) ? t.parking_spaces[0] : t.parking_spaces;

        const isCompleted = t.status === "completed" || (Boolean(t.exit_time) && t.status !== "active" && t.status !== "overdue");
        const isCancelled = t.status === "cancelled";
        const recordStatus: "Active" | "Completed" | "Closed" = isCancelled
            ? "Closed"
            : isCompleted
            ? "Completed"
            : "Active";

        const spaceOrLocImage =
            sp?.image_url?.trim() ||
            loc?.image_url?.trim() ||
            undefined;

        const durationText = isCompleted
            ? `${hrs}h ${mins < 10 ? "0" : ""}${mins}m`
            : `${hrs > 0 ? `${hrs}h ` : ""}${mins}m (Incomplete)`;

        records.push({
            id: t.id,
            name: loc?.name || "Parking Facility",
            address: loc?.address || "",
            bayNumber: sp?.space_number || "-",
            zoneCode: sp?.zone_code || loc?.zone_code || "Zone A",
            plate: t.vehicle_plate,
            date: entryDate.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
            duration: durationText,
            cost: Number(t.total_amount) || 0,
            currency: "RWF",
            status: recordStatus,
            isCompleted,
            isIncomplete: !isCompleted,
            image: spaceOrLocImage,
            receiptNumber: t.ticket_number,
            entryTimeIso: t.entry_time,
            type: "parking",
        });
    });

    // 2. Fetch EV charging sessions (both active/incomplete and completed)
    let evQuery = supabase
        .from("ev_charging_sessions")
        .select(`
            id, session_number, vehicle_plate, bay_number, charging_amount_rwf,
            elapsed_seconds, status, started_at, completed_at, tariff_tier,
            parking_locations:location_id (*)
        `);

    if (userPlates.length > 0) {
        const plateList = userPlates.map((p) => `"${p}"`).join(",");
        evQuery = evQuery.or(`user_id.eq.${uid},vehicle_plate.in.(${plateList})`);
    } else {
        evQuery = evQuery.eq("user_id", uid);
    }

    const { data: evSessions } = await evQuery
        .order("started_at", { ascending: false })
        .limit(30);

    (evSessions || []).forEach((ev: any) => {
        const startedDate = new Date(ev.started_at);
        const isCompleted = ev.status === "completed" || Boolean(ev.completed_at);
        const isCancelled = ev.status === "cancelled";
        const recordStatus: "Active" | "Completed" | "Closed" = isCancelled
            ? "Closed"
            : isCompleted
            ? "Completed"
            : "Active";

        const activeSecs = ev.elapsed_seconds > 0
            ? ev.elapsed_seconds
            : Math.max(0, Math.floor((Date.now() - startedDate.getTime()) / 1000));
        const mins = Math.max(1, Math.round(activeSecs / 60));
        const loc = Array.isArray(ev.parking_locations) ? ev.parking_locations[0] : ev.parking_locations;
        const evImage =
            loc?.image_url?.trim() ||
            undefined;

        const durationText = isCompleted
            ? `${mins}m Charging`
            : `${mins}m Charging (Incomplete)`;

        records.push({
            id: ev.id,
            name: loc?.name || "EV Charging Station",
            address: loc?.address || "EV Charging Bay",
            bayNumber: ev.bay_number,
            zoneCode: "EV Hub",
            plate: ev.vehicle_plate,
            date: startedDate.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
            duration: durationText,
            cost: Number(ev.charging_amount_rwf) || 0,
            currency: "RWF",
            status: recordStatus,
            isCompleted,
            isIncomplete: !isCompleted,
            image: evImage,
            receiptNumber: ev.session_number,
            entryTimeIso: ev.started_at,
            type: "charging",
        });
    });

    return records.sort((a, b) => new Date(b.entryTimeIso || 0).getTime() - new Date(a.entryTimeIso || 0).getTime());
}

/**
 * Start and Complete EV Charging Sessions in database
 */
export async function startEvChargingSession(params: {
    vehiclePlate: string;
    locationId?: string;
    chargerId?: string;
    bayNumber: string;
    chargerPowerKw: number;
    initialSoc: number;
    targetSoc: number;
    paymentStatus?: "unpaid" | "paid";
    amountPaid?: number;
}) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return { data: null };

    await ensureUserProfile(user);

    const sessionNumber = `EV-${Date.now().toString().slice(-6)}`;
    const { data, error } = await supabase
        .from("ev_charging_sessions")
        .insert({
            session_number: sessionNumber,
            user_id: user.id,
            vehicle_plate: params.vehiclePlate,
            location_id: params.locationId && isValidUuid(params.locationId) ? params.locationId : null,
            charger_id: params.chargerId && isValidUuid(params.chargerId) ? params.chargerId : null,
            bay_number: params.bayNumber,
            charger_power_kw: params.chargerPowerKw,
            initial_soc: Math.round(params.initialSoc),
            target_soc: Math.round(params.targetSoc),
            status: "active",
            payment_status: params.paymentStatus || "paid",
            charging_amount_rwf: params.amountPaid || 9000,
            started_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (error) {
        return { error: error.message };
    }
    return { data };
}

export async function completeEvChargingSession(params: {
    sessionId?: string;
    finalSoc: number;
    deliveredKwh: number;
    elapsedSeconds: number;
    chargingAmountRwf: number;
    tariffTier: string;
    vehiclePlate?: string;
    bayNumber?: string;
    locationId?: string;
}) {
    const { data: { user } } = await supabase.auth.getUser();
    const nowIso = new Date().toISOString();

    // 1. If valid UUID sessionId provided, update existing active session
    if (params.sessionId && isValidUuid(params.sessionId)) {
        const { data, error } = await supabase
            .from("ev_charging_sessions")
            .update({
                final_soc: params.finalSoc,
                delivered_kwh: params.deliveredKwh,
                elapsed_seconds: params.elapsedSeconds,
                charging_amount_rwf: params.chargingAmountRwf,
                parking_amount_rwf: 0,
                tariff_tier: params.tariffTier,
                status: "completed",
                payment_status: "paid",
                completed_at: nowIso,
                updated_at: nowIso,
            })
            .eq("id", params.sessionId)
            .select()
            .single();

        if (!error && data) {
            return { data };
        }
    }

    // 2. If sessionId not found or not valid UUID, insert completed session directly
    if (user?.id) {
        const sessionNumber = `EV-${Date.now().toString().slice(-6)}`;
        const { data, error } = await supabase
            .from("ev_charging_sessions")
            .insert({
                session_number: sessionNumber,
                user_id: user.id,
                vehicle_plate: params.vehiclePlate || "EV",
                location_id: params.locationId && isValidUuid(params.locationId) ? params.locationId : null,
                bay_number: params.bayNumber || "EV-1",
                final_soc: params.finalSoc,
                delivered_kwh: params.deliveredKwh,
                elapsed_seconds: params.elapsedSeconds,
                charging_amount_rwf: params.chargingAmountRwf,
                parking_amount_rwf: 0,
                tariff_tier: params.tariffTier,
                status: "completed",
                payment_status: "paid",
                started_at: new Date(Date.now() - (params.elapsedSeconds || 60) * 1000).toISOString(),
                completed_at: nowIso,
                updated_at: nowIso,
            })
            .select()
            .single();

        if (!error && data) {
            return { data };
        }
    }

    return { data: null };
}

/**
 * Wallet Balance, Notifications & Permits from database
 */
export async function fetchWalletBalance(userId?: string): Promise<number> {
    let uid = userId;
    if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id;
    }
    if (!uid) return 0;

    const { data } = await supabase
        .from("profiles")
        .select("wallet_balance_rwf")
        .eq("id", uid)
        .maybeSingle();

    return Number(data?.wallet_balance_rwf) || 0;
}

export async function updateWalletBalance(newBalanceRwf: number, userId?: string): Promise<number> {
    let uid = userId;
    if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id;
    }
    if (!uid) return newBalanceRwf;

    await supabase
        .from("profiles")
        .update({ wallet_balance_rwf: newBalanceRwf, updated_at: new Date().toISOString() })
        .eq("id", uid);

    return newBalanceRwf;
}

export async function fetchUserNotifications(userId?: string): Promise<DbNotificationRecord[]> {
    let uid = userId;
    if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id;
    }
    if (!uid) return [];

    const { data } = await supabase
        .from("user_notifications")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(40);

    return (data || []).map((n: any) => ({
        id: n.id,
        category: n.category || "System",
        title: n.title,
        message: n.message,
        timestamp: new Date(n.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        read: Boolean(n.read),
        icon: n.icon || "notifications-outline",
        actionText: n.action_text || undefined,
        actionType: n.action_type || undefined,
    }));
}

export async function markAllNotificationsRead(userId?: string) {
    let uid = userId;
    if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id;
    }
    if (!uid) return;

    await supabase
        .from("user_notifications")
        .update({ read: true })
        .eq("user_id", uid)
        .eq("read", false);
}

export async function dismissUserNotification(notificationId: string) {
    await supabase.from("user_notifications").delete().eq("id", notificationId);
}

export async function fetchUserPermits(userId?: string): Promise<DbPermitRecord[]> {
    let uid = userId;
    if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id;
    }
    if (!uid) return [];

    const { data } = await supabase
        .from("parking_permits")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });

    return (data as DbPermitRecord[]) || [];
}

export async function applyForPermit(params: {
    vehiclePlate: string;
    permitTitle: string;
    zoneScope: string;
}) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return { error: "Please sign in to apply for a municipal permit." };

    await ensureUserProfile(user);

    const permitNumber = `PMT-${Date.now().toString().slice(-6)}`;
    const validUntil = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

    const { data, error } = await supabase
        .from("parking_permits")
        .insert({
            permit_number: permitNumber,
            user_id: user.id,
            vehicle_plate: params.vehiclePlate.trim().toUpperCase(),
            permit_title: params.permitTitle,
            zone_scope: params.zoneScope,
            status: "pending",
            valid_until: validUntil,
        })
        .select()
        .single();

    if (error) return { error: error.message };
    return { data: data as DbPermitRecord };
}

export async function fetchUserPaymentMethods(userId?: string): Promise<DbPaymentMethodRecord[]> {
    let uid = userId;
    if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id;
    }
    if (!uid) return [];

    const { data } = await supabase
        .from("payment_methods")
        .select("*")
        .eq("user_id", uid)
        .order("is_default", { ascending: false });

    return (data as DbPaymentMethodRecord[]) || [];
}

// ------------------------------------------------------------------------------
// ZERO-CONTACT AGENT AUDIT & PRIVACY-COMPLIANT CITATIONS
// ------------------------------------------------------------------------------

export async function verifyPlateStatus(plateInput: string): Promise<AgentAuditResponse> {
    const cleanPlate = plateInput.trim().toUpperCase();
    const plateHash = hashLicensePlate(cleanPlate);
    const masked = maskLicensePlate(cleanPlate);

    try {
        // Call secure PostgreSQL RPC function that zeroes out all PII
        const { data, error } = await supabase.rpc("verify_plate_status", {
            p_plate_hash: plateHash,
        });

        if (!error && data) {
            return {
                status: data.status,
                ticket_id: data.ticket_id,
                masked_plate: data.masked_plate || masked,
                seconds_remaining: data.seconds_remaining,
                seconds_elapsed: data.seconds_elapsed,
                overdue_amount: data.overdue_amount,
                has_arrears: data.has_arrears || false,
                arrears_amount: data.arrears_amount || 0,
                fine_count: data.fine_count || 0,
            };
        }
    } catch (e) {
        console.warn("verify_plate_status RPC fallback:", e);
    }

    // Direct query fallback if RPC is executing in offline mock
    const { data: ticket } = await supabase
        .from("parking_tickets")
        .select("*")
        .eq("plate_hash", plateHash)
        .eq("status", "active")
        .maybeSingle();

    if (ticket) {
        const diffSeconds = (Date.now() - new Date(ticket.entry_time).getTime()) / 1000;
        if (diffSeconds <= 900) {
            return {
                status: "GRACE_BUFFER",
                ticket_id: ticket.id,
                masked_plate: masked,
                seconds_remaining: Math.max(0, 900 - diffSeconds),
                has_arrears: false,
                arrears_amount: 0,
            };
        }
        return {
            status: "PAID",
            ticket_id: ticket.id,
            masked_plate: masked,
            seconds_elapsed: diffSeconds,
            has_arrears: false,
            arrears_amount: 0,
        };
    }

    return {
        status: "UNREGISTERED",
        masked_plate: masked,
        has_arrears: false,
        arrears_amount: 0,
    };
}

export async function flagOverdueInvoice(params: {
    ticketId: string;
    plateNumber: string;
    overdueAmount: number;
    agentId?: string;
}) {
    const plateHash = hashLicensePlate(params.plateNumber);

    const { data, error } = await supabase
        .from("vehicle_invoice_flags")
        .insert({
            ticket_id: params.ticketId,
            plate_hash: plateHash,
            flagged_by_agent_id: params.agentId || null,
            overdue_amount_rwf: params.overdueAmount,
            notification_status: "pending",
            resolution_status: "open",
        })
        .select()
        .single();

    // Mark ticket as overdue
    await supabase
        .from("parking_tickets")
        .update({ status: "overdue", is_flagged_by_agent: true })
        .eq("id", params.ticketId);

    // Update vehicle arrears
    await supabase
        .from("vehicles")
        .update({ has_unpaid_arrears: true, total_arrears_rwf: params.overdueAmount })
        .eq("plate_hash", plateHash);

    return { data, error };
}

export async function issueZeroContactCitation(params: {
    plateNumber: string;
    locationId: string;
    spaceId?: string;
    agentId?: string;
    photoUrl?: string;
    notes?: string;
    reason?: string;
    fineAmount?: number;
}) {
    const rawPlate = params.plateNumber.trim().toUpperCase();
    const plateHash = hashLicensePlate(rawPlate);
    const fineNumber = `FN-${Date.now().toString().slice(-6)}`;
    const iremboCode = `IREMBO-RW-${Math.floor(100000 + Math.random() * 900000)}`;
    const ALLOWED_REASONS = [
        "unregistered_parking",
        "overstay",
        "illegal_spot",
        "unauthorized_handicap",
        "unauthorized_ev",
    ];
    const reasonCode = params.reason && ALLOWED_REASONS.includes(params.reason)
        ? params.reason
        : "unregistered_parking";

    const { data, error } = await supabase
        .from("parking_fines")
        .insert({
            fine_number: fineNumber,
            plate_hash: plateHash,
            vehicle_plate: rawPlate,
            location_id: params.locationId,
            space_id: params.spaceId && isValidUuid(params.spaceId) ? params.spaceId : null,
            fine_amount: params.fineAmount ?? 3000.0,
            currency: "RWF",
            reason: reasonCode,
            issued_by: params.agentId || null,
            payment_status: "unpaid",
            irembo_reference_code: iremboCode,
            evidence_photo_url: params.photoUrl || null,
            notes: params.notes || "Contactless citation issued: vehicle parked without active app ticket.",
        })
        .select()
        .single();

    if (error) {
        return { error: error.message };
    }
    return { data };
}

export default function () {
    return null;
}
