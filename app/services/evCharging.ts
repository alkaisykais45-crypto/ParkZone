/**
 * EV Charging domain — strictly separate from parking.
 * Charging uses ev_charging_points + ev_charging_sessions and a flat tariff
 * (9,000 RWF < 30 min, 10,000 RWF ≥ 30 min / full charge, 0 RWF parking).
 */
import { supabase } from "../lib/supabase";
import { maskLicensePlate } from "../lib/crypto";
import type { EvChargerTelemetry, ParkingSpace } from "./parking";

export const CHARGING_FLAT_RATE_FULL_RWF = 10000;
export const CHARGING_FLAT_RATE_QUICK_RWF = 9000;
export const CHARGING_QUICK_THRESHOLD_MINS = 30;

export type PlugStandard = "CCS2" | "Type 2" | "CHAdeMO" | "Tesla" | "GB/T" | "Unknown";

export function normalizePlug(raw?: string | null): PlugStandard {
    const v = (raw || "").toLowerCase();
    if (!v || v === "none") return "Unknown";
    if (v.includes("ccs")) return "CCS2";
    if (v.includes("chademo")) return "CHAdeMO";
    if (v.includes("tesla") || v.includes("supercharger") || v.includes("nacs")) return "Tesla";
    if (v.includes("gb")) return "GB/T";
    if (v.includes("type 2") || v.includes("type2") || v.includes("mennekes")) return "Type 2";
    return "Unknown";
}

export function isDcConnector(connectorType?: string | null, maxKw?: number): boolean {
    const v = (connectorType || "").toLowerCase();
    if (v.includes("dc")) return true;
    if (v.includes("ac")) return false;
    return (maxKw || 0) >= 50;
}

/** Returns null when compatibility cannot be determined (vehicle plug unknown). */
export function isPlugCompatible(vehiclePlug?: string | null, connectorType?: string | null): boolean | null {
    const car = normalizePlug(vehiclePlug);
    const station = normalizePlug(connectorType);
    if (car === "Unknown" || station === "Unknown") return null;
    if (car === station) return true;
    // CCS2 inlets accept Type 2 AC plugs (CCS2 = Type 2 + DC pins)
    if (car === "CCS2" && station === "Type 2") return true;
    return false;
}

export interface ChargeEstimate {
    effectiveKw: number;
    kwhTo80: number;
    kwhToFull: number;
    minutesTo80: number | null;
    minutesToFull: number | null;
    tariffRwf: number;
    tariffLabel: string;
}

/**
 * Estimates charge time for the driver's own vehicle at a given charger.
 * Uses 80% fast-charge window with taper above 80% (≈ 45% of peak power).
 */
export function estimateChargingForVehicle(params: {
    chargerKw: number;
    connectorType?: string | null;
    batteryCapacityKwh?: number;
    currentSocPercent?: number;
}): ChargeEstimate {
    const dc = isDcConnector(params.connectorType, params.chargerKw);
    // Typical onboard AC charger limit is 11 kW
    const effectiveKw = Math.max(1, dc ? params.chargerKw * 0.9 : Math.min(params.chargerKw, 11));
    const cap = Number(params.batteryCapacityKwh) || 0;
    const soc = Math.min(100, Math.max(0, Number(params.currentSocPercent) || 0));

    const kwhTo80 = cap > 0 ? Math.max(0, ((80 - soc) / 100) * cap) : 0;
    const kwhToFull = cap > 0 ? Math.max(0, ((100 - soc) / 100) * cap) : 0;
    const taperKw = dc ? effectiveKw * 0.45 : effectiveKw;

    const minutesTo80 = cap > 0 ? Math.round((kwhTo80 / effectiveKw) * 60) : null;
    const minutesToFull =
        cap > 0
            ? Math.round(
                  (kwhTo80 / effectiveKw) * 60 +
                      (Math.max(0, ((100 - Math.max(soc, 80)) / 100) * cap) / taperKw) * 60
              )
            : null;

    const expectedMins = minutesToFull ?? minutesTo80 ?? CHARGING_QUICK_THRESHOLD_MINS;
    const tariffRwf =
        expectedMins >= CHARGING_QUICK_THRESHOLD_MINS ? CHARGING_FLAT_RATE_FULL_RWF : CHARGING_FLAT_RATE_QUICK_RWF;

    return {
        effectiveKw: Math.round(effectiveKw * 10) / 10,
        kwhTo80: Math.round(kwhTo80 * 10) / 10,
        kwhToFull: Math.round(kwhToFull * 10) / 10,
        minutesTo80,
        minutesToFull,
        tariffRwf,
        tariffLabel:
            tariffRwf === CHARGING_FLAT_RATE_FULL_RWF
                ? `${CHARGING_FLAT_RATE_FULL_RWF.toLocaleString()} RWF (≥${CHARGING_QUICK_THRESHOLD_MINS} min / full)`
                : `${CHARGING_FLAT_RATE_QUICK_RWF.toLocaleString()} RWF (<${CHARGING_QUICK_THRESHOLD_MINS} min)`,
    };
}

export function formatDurationMins(mins?: number | null): string {
    if (mins === null || mins === undefined || !Number.isFinite(mins)) return "—";
    const m = Math.max(0, Math.round(mins));
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h === 0) return `${r} min`;
    return `${h}h ${r.toString().padStart(2, "0")}m`;
}

export function matchChargerForSpace(
    space: Pick<ParkingSpace, "id" | "space_number" | "watt_power_kw">,
    chargers: EvChargerTelemetry[]
): EvChargerTelemetry | null {
    if (!chargers || chargers.length === 0) return null;
    const byIdentifier = chargers.find(
        (c) => c.station_identifier?.toUpperCase() === space.space_number.toUpperCase()
    );
    if (byIdentifier) return byIdentifier;
    const bySpaceId = chargers.find((c: any) => c.space_id && c.space_id === space.id);
    if (bySpaceId) return bySpaceId;
    const byPower = chargers.find((c) => space.watt_power_kw && c.max_output_kw === space.watt_power_kw);
    return byPower || null;
}

export type ChargerDetailsSource = "own_session" | "charger_telemetry" | "occupancy_sensor" | "none";

export interface ChargerBayDetails {
    bayNumber: string;
    zoneCode: string;
    isOccupied: boolean;
    charger: EvChargerTelemetry | null;
    plug: string;
    plugStandard: PlugStandard;
    maxKw: number;
    isDc: boolean;
    voltage: number | null;
    operationalStatus: string;
    isOperational: boolean;
    pricePerKwh: number | null;
    flatRateFullRwf: number;
    flatRateQuickRwf: number;
    // Occupant (only when isOccupied)
    occupantPlateMasked: string | null;
    occupantVehicleLabel: string | null;
    chargingSince: Date | null;
    bookedMinutes: number | null;
    currentPowerKw: number | null;
    deliveredKwh: number | null;
    socPercent: number | null;
    targetSocPercent: number | null;
    estimatedFullAt: Date | null;
    source: ChargerDetailsSource;
}

function toNum(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * Loads everything known about one EV charging bay from Supabase:
 * charger hardware (plug / kW / voltage / status), and for occupied bays
 * the active charging session or live charger telemetry.
 */
export async function fetchChargerBayDetails(params: {
    locationId: string;
    space: ParkingSpace;
    chargers: EvChargerTelemetry[];
}): Promise<ChargerBayDetails> {
    const { space, locationId } = params;

    let charger = matchChargerForSpace(space, params.chargers);
    if (charger?.id) {
        const { data } = await supabase
            .from("ev_charging_points")
            .select("*")
            .eq("id", charger.id)
            .maybeSingle();
        if (data) charger = { ...charger, ...(data as any) };
    }

    const maxKw = Number(charger?.max_output_kw) || Number(space.watt_power_kw) || 0;
    const connector = charger?.connector_type || (maxKw >= 50 ? "CCS2 DC" : maxKw > 0 ? "Type 2 AC" : "");
    const telemetry: Record<string, any> = (charger?.telemetry_payload as any) || {};

    const base: ChargerBayDetails = {
        bayNumber: space.space_number,
        zoneCode: space.zone_code,
        isOccupied: Boolean(space.is_occupied),
        charger,
        plug: connector || "Not reported",
        plugStandard: normalizePlug(connector),
        maxKw,
        isDc: isDcConnector(connector, maxKw),
        voltage: toNum(charger?.voltage_volts),
        operationalStatus: charger?.operational_status || (charger ? "operational" : "unknown"),
        isOperational: charger ? charger.is_operational !== false : true,
        pricePerKwh: toNum(charger?.price_per_kwh ?? space.price_per_kwh_rwf),
        flatRateFullRwf: Number(charger?.flat_rate_full_rwf) || CHARGING_FLAT_RATE_FULL_RWF,
        flatRateQuickRwf: Number(charger?.flat_rate_quick_rwf) || CHARGING_FLAT_RATE_QUICK_RWF,
        occupantPlateMasked: null,
        occupantVehicleLabel: null,
        chargingSince: null,
        bookedMinutes: null,
        currentPowerKw: null,
        deliveredKwh: null,
        socPercent: null,
        targetSocPercent: null,
        estimatedFullAt: null,
        source: "none",
    };

    if (!space.is_occupied) {
        return base;
    }

    // 1) Active charging session (readable when it belongs to the signed-in driver)
    const { data: session } = await supabase
        .from("ev_charging_sessions")
        .select("*")
        .eq("location_id", locationId)
        .eq("bay_number", space.space_number)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    // 2) Live occupancy row for the bay (public)
    let spaceRow: any = null;
    if (/^[0-9a-f-]{36}$/i.test(space.id)) {
        const { data } = await supabase
            .from("parking_spaces")
            .select("current_vehicle_plate, occupied_at")
            .eq("id", space.id)
            .maybeSingle();
        spaceRow = data;
    }

    const plate = session?.vehicle_plate || spaceRow?.current_vehicle_plate || space.current_vehicle_plate || null;
    const validPlate = plate && !["PARKED", "CHARGING", "RESERVED"].includes(String(plate).toUpperCase());
    const startedIso = session?.started_at || spaceRow?.occupied_at || space.occupied_at || telemetry.session_started_at || null;
    const chargingSince = startedIso ? new Date(startedIso) : null;

    const currentPowerKw =
        toNum(charger?.current_power_draw_kw) && Number(charger?.current_power_draw_kw) > 0
            ? Number(charger?.current_power_draw_kw)
            : toNum(session?.charger_power_kw);

    const capacity = toNum(telemetry.battery_capacity_kwh ?? telemetry.vehicle_battery_kwh);
    const soc = toNum(telemetry.soc ?? telemetry.state_of_charge ?? telemetry.vehicle_soc);
    const targetSoc = toNum(session?.target_soc ?? telemetry.target_soc) ?? 100;

    let socPercent: number | null = soc;
    if (socPercent === null && session && chargingSince && capacity) {
        const elapsedH = (Date.now() - chargingSince.getTime()) / 3600000;
        socPercent = Math.min(100, Number(session.initial_soc || 0) + ((currentPowerKw || 0) * elapsedH * 100) / capacity);
    }

    let estimatedFullAt: Date | null = charger?.estimated_free_at ? new Date(charger.estimated_free_at) : null;
    if (!estimatedFullAt && socPercent !== null && capacity && currentPowerKw && currentPowerKw > 0) {
        const kwhLeft = Math.max(0, ((targetSoc - socPercent) / 100) * capacity);
        estimatedFullAt = new Date(Date.now() + (kwhLeft / currentPowerKw) * 3600000);
    }

    const bookedMinutes = toNum(telemetry.booked_minutes ?? telemetry.reserved_minutes);

    return {
        ...base,
        occupantPlateMasked: validPlate ? maskLicensePlate(String(plate)) : null,
        occupantVehicleLabel: telemetry.vehicle_model || telemetry.vehicle_label || null,
        chargingSince,
        bookedMinutes,
        currentPowerKw: currentPowerKw ?? null,
        deliveredKwh: toNum(session?.delivered_kwh ?? telemetry.session_energy_kwh),
        socPercent: socPercent !== null ? Math.round(socPercent) : null,
        targetSocPercent: targetSoc,
        estimatedFullAt,
        source: session
            ? "own_session"
            : charger && (charger.status === "charging" || (currentPowerKw ?? 0) > 0)
            ? "charger_telemetry"
            : "occupancy_sensor",
    };
}

export default function () {
    return null;
}

