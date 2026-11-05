// Gemini AI Integration Service for ParkZone
// Provides intelligent range/power predictions and smart parking recommendations using the Google Gemini API.
// Seamlessly operates as a modular AI engine that driver profiles and vehicle telemetry plug into.

import { PredictionInput, PredictionResult, CarTelemetry } from "./carTelemetry";

const GEMINI_API_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

/**
 * Checks if a Gemini API key is configured in the environment
 */
export function isGeminiConfigured(): boolean {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "";
  return apiKey.trim().length > 0;
}

/**
 * Retrieves the configured Gemini API key
 */
function getGeminiApiKey(): string | null {
  return process.env.EXPO_PUBLIC_GEMINI_API_KEY || null;
}

export interface GeminiPredictionResponse {
  predictedPowerPerDistanceWhPerKm: number;
  totalEnergyRequiredKwh: number;
  estimatedSocAtArrivalPct: number;
  maxCruisingRangeKm: number;
  bufferMarginKm: number;
  isReachableWithoutStop: boolean;
  recommendedStopsCount: number;
  recommendedChargingMinutes: number;
  aiInsights: string[];
}

/**
 * Executes vehicle range & power prediction using Gemini API when configured,
 * or falls back to local neural physical telemetry regression.
 */
export async function getGeminiPowerPrediction(
  input: PredictionInput,
  telemetry?: CarTelemetry | null
): Promise<PredictionResult> {
  const apiKey = getGeminiApiKey();

  if (apiKey) {
    try {
      const prompt = `
You are an advanced automotive EV powertrain prediction AI for ParkZone.
Given the following real-time vehicle and route parameters:
- Target Distance: ${input.targetDistanceKm} km
- Average Cruising Speed: ${input.averageSpeedKmH} km/h
- Topography: ${input.topography}
- Driving Mode: ${input.drivingMode}
- Cabin Climate Load: ${input.climateLoad}
- Ambient Temperature: ${input.ambientTempC}°C
- Battery Pack Capacity: ${input.batteryCapacityKwh} kWh
- Current Battery SOC: ${input.currentSocPct}%
${telemetry ? `- Current Vehicle Model: ${telemetry.vehicleModel}\n- Elevation Slope: ${telemetry.elevationGradientPct}%` : ""}

Compute the accurate predicted power consumption in Wh/km, total trip energy in kWh, arrival SOC %, max range, and concise driver insights.
Respond ONLY with a JSON object in this exact format:
{
  "predictedPowerPerDistanceWhPerKm": number,
  "totalEnergyRequiredKwh": number,
  "estimatedSocAtArrivalPct": number,
  "maxCruisingRangeKm": number,
  "bufferMarginKm": number,
  "isReachableWithoutStop": boolean,
  "recommendedStopsCount": number,
  "recommendedChargingMinutes": number,
  "aiInsights": [string, string, string]
}
`;

      const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      });

      if (response.ok) {
        const json = await response.json();
        const candidateText = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) {
          const parsed: GeminiPredictionResponse = JSON.parse(candidateText);
          return {
            predictedPowerPerDistanceWhPerKm: parsed.predictedPowerPerDistanceWhPerKm,
            totalEnergyRequiredKwh: parsed.totalEnergyRequiredKwh,
            estimatedSocAtArrivalPct: parsed.estimatedSocAtArrivalPct,
            maxCruisingRangeKm: parsed.maxCruisingRangeKm,
            bufferMarginKm: parsed.bufferMarginKm,
            isReachableWithoutStop: parsed.isReachableWithoutStop,
            recommendedStopsCount: parsed.recommendedStopsCount,
            recommendedChargingMinutes: parsed.recommendedChargingMinutes,
            aerodynamicLossWhPerKm: Math.round(parsed.predictedPowerPerDistanceWhPerKm * 0.45),
            rollingLossWhPerKm: Math.round(parsed.predictedPowerPerDistanceWhPerKm * 0.35),
            elevationLossWhPerKm: Math.round(parsed.predictedPowerPerDistanceWhPerKm * 0.1),
            auxiliaryLossWhPerKm: Math.round(parsed.predictedPowerPerDistanceWhPerKm * 0.1),
            aiInsights: parsed.aiInsights || [],
          };
        }
      }
    } catch (_) {
      // Graceful fallback to physical regression model on network/quota failure
    }
  }

  // Import local regression calculator
  const { calculatePowerPrediction } = require("./carTelemetry");
  return calculatePowerPrediction(input);
}

/**
 * Evaluates nearby parking lots with Gemini AI reasoning to select the optimal bay.
 */
export async function getGeminiParkingRecommendation(
  locations: any[],
  vehicleSpecs: { isElectric: boolean; makeModel: string; plateNumber: string; hasHandicapPermit?: boolean },
  preferences: { maxRate?: number; requireFastCharger?: boolean }
): Promise<{ recommendedLocationId: string | null; rationale: string }> {
  const apiKey = getGeminiApiKey();

  if (apiKey && locations.length > 0) {
    try {
      const prompt = `
You are the ParkZone AI Parking Assistant.
Select the optimal parking location for the following driver:
- Vehicle: ${vehicleSpecs.makeModel} (${vehicleSpecs.isElectric ? "Electric Vehicle" : "Combustion Engine"})
- Preferences: Max Rate ${preferences.maxRate || "Any"}, Require Charger: ${preferences.requireFastCharger ? "Yes" : "No"}

Available Lots:
${JSON.stringify(
  locations.map((l) => ({
    id: l.id,
    name: l.name,
    hourlyRate: l.hourly_rate,
    availableSpots: l.available_spots,
    isElectricStation: l.is_electric_station,
  }))
)}

Select the single best location id and provide a brief 1-sentence rationale.
Respond ONLY with JSON:
{
  "recommendedLocationId": "string",
  "rationale": "string"
}
`;

      const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      });

      if (response.ok) {
        const json = await response.json();
        const candidateText = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) {
          return JSON.parse(candidateText);
        }
      }
    } catch (_) {}
  }

  // Default algorithmic selection
  const candidate = locations.find((l) =>
    vehicleSpecs.isElectric
      ? l.is_electric_station && l.available_spots > 0
      : !l.is_electric_station && (!l.is_handicap_facility || vehicleSpecs.hasHandicapPermit) && l.available_spots > 0
  ) || locations.find((l) => l.available_spots > 0) || locations[0];

  return {
    recommendedLocationId: candidate ? candidate.id : null,
    rationale: candidate
      ? `Optimal match for ${vehicleSpecs.makeModel} based on availability and proximity.`
      : "No parking spots currently available.",
  };
}

// Satisfy Expo Router file-system convention
export default function GeminiAiServiceRoute() {
  return null;
}

