import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CarColorVariant } from "../components/UltraRealisticCar";
import { supabase } from "../app/lib/supabase";
import { hashLicensePlate, maskLicensePlate } from "../app/lib/crypto";
import { ensureUserProfile } from "../app/services/auth";

export interface DriverVehicleSpecs {
  id: string;
  plateNumber: string;
  makeModel: string;
  vehicleType: "ev" | "hybrid" | "gasoline" | "diesel";
  colorVariant: CarColorVariant;
  colorName: string;
  bodyStyle: "Sedan" | "SUV" | "Coupe" | "Hatchback" | "Truck";
  plugType: "CCS2 Combo" | "Type 2 Mennekes" | "Supercharger" | "CHAdeMO" | "None";
  batteryCapacityKwh: number;
  batteryLevelPercent: number; // 0 - 100
  estimatedRangeKm: number;
  parkingPermitType: "Standard" | "EV Priority" | "Handicap Concession";
  driveMode: "Eco Range" | "Normal Balanced" | "Sport Dynamic";
  headlightsActive: boolean;
  clearanceHeightMeters: number;
  lengthMeters: number;
  widthMeters: number;
  vinNumber: string;
  insuranceExpiry: string;
  lastTelemetryPing: string;
}

export const EMPTY_VEHICLE_SPECS: DriverVehicleSpecs = {
  id: "",
  plateNumber: "",
  makeModel: "",
  vehicleType: "gasoline",
  colorVariant: "obsidian",
  colorName: "Obsidian Black",
  bodyStyle: "Sedan",
  plugType: "None",
  batteryCapacityKwh: 0,
  batteryLevelPercent: 0,
  estimatedRangeKm: 0,
  parkingPermitType: "Standard",
  driveMode: "Normal Balanced",
  headlightsActive: true,
  clearanceHeightMeters: 1.5,
  lengthMeters: 4.5,
  widthMeters: 1.85,
  vinNumber: "",
  insuranceExpiry: "",
  lastTelemetryPing: new Date().toISOString(),
};

type VehicleChangeListener = (vehicle: DriverVehicleSpecs) => void;
const listeners = new Set<VehicleChangeListener>();

let cachedVehicle: DriverVehicleSpecs = EMPTY_VEHICLE_SPECS;
let isInitialized = false;

export function mapDbRowToSpecs(row: any): DriverVehicleSpecs {
  if (!row) return EMPTY_VEHICLE_SPECS;
  const isEv = row.vehicle_type === "ev";
  const cap = Number(row.battery_capacity_kwh) || 0;
  const lvl =
    row.battery_level_percent !== undefined && row.battery_level_percent !== null
      ? Number(row.battery_level_percent)
      : 100;

  const rawColor = (row.color || "Obsidian Black").trim();
  const rawLower = rawColor.toLowerCase();

  return {
    id: row.id || "",
    plateNumber: (row.plate_number || "").toUpperCase(),
    makeModel: row.make_model || [row.brand, row.model].filter(Boolean).join(" ") || "Vehicle",
    vehicleType: isEv ? "ev" : "gasoline",
    colorVariant: (rawLower as CarColorVariant) || "obsidian",
    colorName: rawColor,
    bodyStyle: row.body_style || "Sedan",
    plugType: row.plug_type || (isEv ? "CCS2 Combo" : "None"),
    batteryCapacityKwh: cap,
    batteryLevelPercent: lvl,
    estimatedRangeKm: isEv ? Math.round((lvl / 100) * (cap || 75) * 5.2) : 0,
    parkingPermitType: row.handicap_permit_number
      ? "Handicap Concession"
      : isEv
      ? "EV Priority"
      : "Standard",
    driveMode: "Normal Balanced",
    headlightsActive: true,
    clearanceHeightMeters: 1.5,
    lengthMeters: 4.7,
    widthMeters: 1.9,
    vinNumber: "",
    insuranceExpiry: "",
    lastTelemetryPing: row.updated_at || new Date().toISOString(),
  };
}

export async function broadcastVehicleChange(updated: DriverVehicleSpecs) {
  cachedVehicle = updated;
  try {
    if (updated.plateNumber) {
      await AsyncStorage.setItem("@parkzone_cached_vehicle", JSON.stringify(updated));
      if (updated.id) {
        await AsyncStorage.setItem("@parkzone_active_vehicle_id", updated.id);
      }
    } else {
      await AsyncStorage.removeItem("@parkzone_cached_vehicle");
    }
  } catch {}
  listeners.forEach((fn) => fn(updated));
}

export async function reloadDriverVehicle(): Promise<DriverVehicleSpecs> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      // Check offline cached vehicle
      try {
        const stored = await AsyncStorage.getItem("@parkzone_cached_vehicle");
        if (stored) {
          const parsed = JSON.parse(stored);
          cachedVehicle = parsed;
          listeners.forEach((fn) => fn(cachedVehicle));
          return cachedVehicle;
        }
      } catch {}
      cachedVehicle = EMPTY_VEHICLE_SPECS;
      listeners.forEach((fn) => fn(cachedVehicle));
      return EMPTY_VEHICLE_SPECS;
    }

    const preferredId = await AsyncStorage.getItem("@parkzone_active_vehicle_id");

    // Fetch user's registered vehicles with graceful column fallback
    let rows: any[] | null = null;
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      rows = data;
    } else {
      const fallback = await supabase
        .from("vehicles")
        .select("*")
        .eq("user_id", user.id);
      rows = fallback.data;
    }

    if (rows && rows.length > 0) {
      const activeRow =
        (preferredId && rows.find((r) => r.id === preferredId)) ||
        rows.find((r) => r.is_default) ||
        rows[0];

      const specs = mapDbRowToSpecs(activeRow);
      await broadcastVehicleChange(specs);
      return specs;
    } else {
      await broadcastVehicleChange(EMPTY_VEHICLE_SPECS);
      return EMPTY_VEHICLE_SPECS;
    }
  } catch (err) {
    console.warn("Failed to reload driver vehicle:", err);
    return cachedVehicle;
  }
}

export function useDriverVehicle() {
  const [vehicle, setVehicleState] = useState<DriverVehicleSpecs>(cachedVehicle);
  const [isLoaded, setIsLoaded] = useState(isInitialized);

  const loadFromDatabase = useCallback(async () => {
    try {
      // 1. Initial immediate restore from local storage if state is empty
      if (!cachedVehicle.plateNumber) {
        try {
          const stored = await AsyncStorage.getItem("@parkzone_cached_vehicle");
          if (stored) {
            const parsed = JSON.parse(stored);
            cachedVehicle = parsed;
            setVehicleState(parsed);
          }
        } catch {}
      }

      // 2. Fetch fresh from database
      await reloadDriverVehicle();
    } finally {
      isInitialized = true;
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadFromDatabase();

    const handler: VehicleChangeListener = (updated) => {
      setVehicleState(updated);
    };

    listeners.add(handler);

    // Also listen to auth changes so vehicle synchronizes on login / logout
    const { data: authSubscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
        reloadDriverVehicle();
      } else if (event === "SIGNED_OUT") {
        broadcastVehicleChange(EMPTY_VEHICLE_SPECS);
      }
    });

    return () => {
      listeners.delete(handler);
      authSubscription?.subscription?.unsubscribe();
    };
  }, [loadFromDatabase]);

  const updateVehicle = useCallback(async (partial: Partial<DriverVehicleSpecs>) => {
    const updated: DriverVehicleSpecs = {
      ...cachedVehicle,
      ...partial,
      lastTelemetryPing: new Date().toISOString(),
    };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      throw new Error("Please sign in to save vehicle specifications to the database.");
    }

    await ensureUserProfile(user);

    const rawPlate = (updated.plateNumber || "").trim().toUpperCase();
    if (!rawPlate) {
      throw new Error("Please enter a valid license plate number.");
    }

    const parts = (updated.makeModel || "").trim().split(" ");
    const brand = parts[0] || "";
    const model = parts.slice(1).join(" ") || parts[0] || "";
    const dbVehicleType =
      updated.parkingPermitType === "Handicap Concession"
        ? "handicap"
        : updated.vehicleType === "ev"
        ? "ev"
        : "gasoline";

    const payload: Record<string, any> = {
      user_id: user.id,
      plate_number: rawPlate,
      plate_hash: hashLicensePlate(rawPlate),
      masked_plate: maskLicensePlate(rawPlate),
      vehicle_type: dbVehicleType,
      make_model: updated.makeModel,
      brand,
      model,
      color: updated.colorVariant,
      body_style: updated.bodyStyle,
      plug_type: updated.plugType,
      battery_capacity_kwh: updated.batteryCapacityKwh || 0,
      battery_level_percent: updated.batteryLevelPercent || 100,
    };

    let data: any = null;
    let error: any = null;

    // If vehicle has existing id and plate didn't change, update by id directly
    if (updated.id && cachedVehicle.plateNumber === rawPlate) {
      const updateRes = await supabase
        .from("vehicles")
        .update(payload)
        .eq("id", updated.id)
        .select()
        .single();
      data = updateRes.data;
      error = updateRes.error;
    } else {
      // Upsert by user_id & plate_number
      const upsertRes = await supabase
        .from("vehicles")
        .upsert(payload, { onConflict: "user_id,plate_number" })
        .select()
        .single();
      data = upsertRes.data;
      error = upsertRes.error;
    }

    // Fallback if extended columns aren't in database
    if (error) {
      const minimalPayload: Record<string, any> = {
        user_id: user.id,
        plate_number: rawPlate,
        plate_hash: hashLicensePlate(rawPlate),
        masked_plate: maskLicensePlate(rawPlate),
        vehicle_type: dbVehicleType,
        make_model: updated.makeModel,
        color: updated.colorVariant,
      };

      const retry = await supabase
        .from("vehicles")
        .upsert(minimalPayload, { onConflict: "user_id,plate_number" })
        .select()
        .single();

      if (!retry.error) {
        data = retry.data;
        error = null;
      } else {
        const corePayload: Record<string, any> = {
          user_id: user.id,
          plate_number: rawPlate,
          vehicle_type: dbVehicleType,
          color: updated.colorVariant,
        };
        const retryCore = await supabase
          .from("vehicles")
          .upsert(corePayload, { onConflict: "user_id,plate_number" })
          .select()
          .single();
        data = retryCore.data;
        error = retryCore.error;
      }
    }

    if (error) {
      throw new Error(error.message);
    }

    const savedSpecs = data ? mapDbRowToSpecs(data) : updated;
    await broadcastVehicleChange(savedSpecs);
  }, []);

  return {
    vehicle,
    isLoaded,
    updateVehicle,
    reloadVehicle: loadFromDatabase,
  };
}
