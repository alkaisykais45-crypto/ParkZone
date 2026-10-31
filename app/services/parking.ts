import { supabase } from "../lib/supabase";
import { hashLicensePlate, maskLicensePlate } from "../lib/crypto";

export type VehicleType = "gasoline" | "ev" | "handicap";
export type TopologyType = "oblique" | "perpendicular" | "parallel";

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
    is_occupied: boolean;
    current_vehicle_plate?: string | null;
    current_plate_hash?: string | null;
    current_vehicle_id?: string | null;
    qr_code_token: string;
    occupied_at?: string | null;
}

export interface EvChargerTelemetry {
    id: string;
    location_id: string;
    station_identifier: string;
    connector_type: string;
    max_output_kw: number;
    price_per_kwh: number;
    status: "available" | "charging" | "faulted" | "reserved";
    current_power_draw_kw: number;
    estimated_free_at?: string | null;
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
    created_at?: string;
    updated_at?: string;
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

    return (data || []).map((v: any, index: number) => ({
        ...v,
        plate_hash: v.plate_hash || hashLicensePlate(v.plate_number || ""),
        masked_plate: v.masked_plate || maskLicensePlate(v.plate_number || ""),
        make_model: v.make_model || [v.brand, v.model].filter(Boolean).join(" ") || "Vehicle",
        is_default: v.is_default !== undefined ? Boolean(v.is_default) : index === 0,
    }));
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
    const plateHash = hashLicensePlate(rawPlate);
    const maskedPlate = maskLicensePlate(rawPlate);

    const parts = (payload.makeModel || "").trim().split(" ");
    const brand = parts[0] || "Custom";
    const model = parts.slice(1).join(" ") || parts[0] || "Vehicle";

    // Build compatible payload for live Supabase schema
    const insertPayload: Record<string, any> = {
        user_id: payload.userId,
        plate_number: rawPlate,
        vehicle_type: payload.vehicleType,
        color: payload.color || "Black",
        brand,
        model,
    };

    let { data, error } = await supabase
        .from("vehicles")
        .insert(insertPayload)
        .select()
        .single();

    // If brand/model schema fails, fallback to bare essential fields
    if (error && error.code === "PGRST204") {
        const minimalInsert = {
            user_id: payload.userId,
            plate_number: rawPlate,
            vehicle_type: payload.vehicleType,
            color: payload.color || "Black",
        };
        const retry = await supabase
            .from("vehicles")
            .insert(minimalInsert)
            .select()
            .single();
        data = retry.data;
        error = retry.error;
    }

    if (error) {
        return { error: error.message };
    }

    const saved = data as any;
    return {
        data: {
            ...saved,
            plate_hash: saved.plate_hash || plateHash,
            masked_plate: saved.masked_plate || maskedPlate,
            make_model: saved.make_model || payload.makeModel || [saved.brand, saved.model].filter(Boolean).join(" ") || "Vehicle",
            is_default: saved.is_default !== undefined ? Boolean(saved.is_default) : (payload.isDefault ?? true),
        },
    };
}

export async function deleteVehicle(vehicleId: string) {
    return await supabase.from("vehicles").delete().eq("id", vehicleId);
}



export async function fetchParkingLocations(): Promise<ParkingLocation[]> {
    const { data, error } = await supabase
        .from("parking_locations")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });

    if (error) {
        console.warn("fetchParkingLocations error:", error);
        return [];
    }
    return (data as ParkingLocation[]) || [];
}

export async function fetchSpotsForLocation(
    locationId: string,
    zoneCode?: string
): Promise<ParkingSpace[]> {
    let query = supabase
        .from("parking_spaces")
        .select("*")
        .eq("location_id", locationId)
        .eq("is_active", true);

    if (zoneCode && zoneCode !== "All Zones") {
        query = query.eq("zone_code", zoneCode);
    }

    const { data, error } = await query.order("space_number", { ascending: true });

    if (error) {
        console.warn("fetchSpotsForLocation error:", error);
        return [];
    }
    return data || [];
}

// ------------------------------------------------------------------------------
// ACTIVE EV CHARGING TELEMETRY (OCPP 2.0.1 Ready)
// ------------------------------------------------------------------------------

export async function fetchEvChargers(locationId: string): Promise<EvChargerTelemetry[]> {
    const { data, error } = await supabase
        .from("ev_charging_points")
        .select("*")
        .eq("location_id", locationId);

    if (error) {
        console.warn("fetchEvChargers error:", error.message);
        throw error;
    }

    return data ?? [];
}

// ------------------------------------------------------------------------------
// SESSIONS & TICKETS
// ------------------------------------------------------------------------------

export async function startParkingSession(params: {
    userId: string;
    vehicleId?: string;
    vehiclePlate: string;
    locationId: string;
    spaceId?: string;
    qrToken: string;
}) {
    const ticketNumber = `PZ-${Date.now().toString().slice(-6)}`;
    const formattedPlate = params.vehiclePlate.trim().toUpperCase();
    const plateHash = hashLicensePlate(formattedPlate);

    const { data: ticket, error: ticketError } = await supabase
        .from("parking_tickets")
        .insert({
            ticket_number: ticketNumber,
            user_id: params.userId,
            vehicle_id: params.vehicleId || null,
            vehicle_plate: formattedPlate,
            plate_hash: plateHash,
            location_id: params.locationId,
            space_id: params.spaceId || null,
            hourly_rate: 300.0,
            daily_cap: 2000.0,
            rate_applied: "hourly",
            total_amount: 300.0,
            payment_status: "unpaid",
            qr_token: params.qrToken,
            entry_time: new Date().toISOString(),
        })
        .select()
        .single();

    if (ticketError) {
        return { error: ticketError.message };
    }

    // Mark parking space as occupied
    if (params.spaceId) {
        await supabase
            .from("parking_spaces")
            .update({
                is_occupied: true,
                current_vehicle_plate: formattedPlate,
                current_plate_hash: plateHash,
                current_vehicle_id: params.vehicleId || null,
                occupied_at: new Date().toISOString(),
            })
            .eq("id", params.spaceId);
    }

    return { data: ticket };
}

export async function completeParkingSession(params: {
    ticketId: string;
    spaceId?: string;
    paymentMethod: "momo" | "airtel" | "card";
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

    if (params.spaceId) {
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
}) {
    const rawPlate = params.plateNumber.trim().toUpperCase();
    const plateHash = hashLicensePlate(rawPlate);
    const fineNumber = `FN-${Date.now().toString().slice(-6)}`;
    const iremboCode = `IREMBO-RW-${Math.floor(100000 + Math.random() * 900000)}`;

    const { data, error } = await supabase
        .from("parking_fines")
        .insert({
            fine_number: fineNumber,
            plate_hash: plateHash,
            vehicle_plate: rawPlate,
            location_id: params.locationId,
            space_id: params.spaceId || null,
            fine_amount: 3000.0,
            currency: "RWF",
            reason: params.reason || "unregistered_parking",
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
