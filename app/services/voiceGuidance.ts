import * as Speech from "expo-speech";
import AsyncStorage from "@react-native-async-storage/async-storage";

const VOICE_MUTED_STORAGE_KEY = "@parkzone_voice_guidance_muted";

class VoiceGuidanceService {
  private isMuted: boolean = false;
  private isSpeaking: boolean = false;

  constructor() {
    this.init();
  }

  private async init() {
    try {
      const saved = await AsyncStorage.getItem(VOICE_MUTED_STORAGE_KEY);
      if (saved !== null) {
        this.isMuted = JSON.parse(saved);
      }
    } catch {
      this.isMuted = false;
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public async setMuted(muted: boolean) {
    this.isMuted = muted;
    try {
      await AsyncStorage.setItem(VOICE_MUTED_STORAGE_KEY, JSON.stringify(muted));
      if (muted) {
        this.stop();
      }
    } catch {
      // ignore
    }
  }

  public async toggleMute(): Promise<boolean> {
    const nextState = !this.isMuted;
    await this.setMuted(nextState);
    if (!nextState) {
      this.speak("Voice guidance enabled.");
    }
    return nextState;
  }

  public stop() {
    try {
      Speech.stop();
      this.isSpeaking = false;
    } catch {
      // ignore
    }
  }

  public speak(text: string, priority: "normal" | "high" = "normal") {
    if (this.isMuted || !text) return;

    try {
      if (priority === "high" || !this.isSpeaking) {
        Speech.stop();
      }

      this.isSpeaking = true;
      Speech.speak(text, {
        language: "en-US",
        pitch: 1.05,
        rate: 0.98,
        onDone: () => {
          this.isSpeaking = false;
        },
        onError: () => {
          this.isSpeaking = false;
        },
      });
    } catch (e) {
      console.warn("Voice guidance error:", e);
      this.isSpeaking = false;
    }
  }

  public announceSlotSelected(spaceNumber: string, locationName: string, options?: {
    isOccupied?: boolean;
    wattPower?: number;
    price?: number;
    currency?: string;
  }) {
    const curr = options?.currency || "RWF";
    if (options?.isOccupied) {
      this.speak(`Slot ${spaceNumber} at ${locationName} is currently occupied. Please select an available slot.`);
      return;
    }

    let msg = `Navigating to ${locationName}, Slot ${spaceNumber}. Slot is available.`;
    if (options?.wattPower) {
      msg += ` ${options.wattPower} kilowatt electric vehicle charging available.`;
    }
    if (options?.price) {
      msg += ` Rate is ${options.price} ${curr}.`;
    }
    msg += ` Drive straight ahead down the central aisle.`;
    this.speak(msg, "high");
  }

  public announceAiRecommendation(vehicleModel: string, spaceNumber: string, reason: string) {
    const msg = `AI Mode matched Slot ${spaceNumber} for your ${vehicleModel}. ${reason}.`;
    this.speak(msg, "high");
  }

  public announceRealtimeOccupancyChange(spaceNumber: string, isOccupied: boolean, fallbackSpace?: string) {
    if (isOccupied) {
      let msg = `Notice: Slot ${spaceNumber} was just occupied.`;
      if (fallbackSpace) {
        msg += ` Rerouting you to Slot ${fallbackSpace}.`;
      }
      this.speak(msg, "high");
    } else {
      this.speak(`Good news: Slot ${spaceNumber} is now vacant and available for parking.`);
    }
  }

  public announceTimerWarning(remainingMinutes: number, bayNumber: string) {
    const msg = `Attention: Parking session in Bay ${bayNumber} has ${remainingMinutes} minutes remaining. Tap extend time to avoid overdue charges.`;
    this.speak(msg, "high");
  }

  public announceChargingCompleted(vehiclePlate: string, targetSoc: number, deliveredKwh: number) {
    const msg = `Charging complete. Vehicle ${vehiclePlate} has reached ${targetSoc} percent battery with ${deliveredKwh} kilowatt hours added. Please disconnect the charging cable.`;
    this.speak(msg, "high");
  }

  public announceRoutePowerPrediction(destination: string, arrivalSoc: number, needsWaypoint: boolean, waypointName?: string) {
    let msg = `AI route analysis for ${destination}: Estimated arrival battery is ${arrivalSoc} percent.`;
    if (needsWaypoint && waypointName) {
      msg += ` Warning: Battery reserve low. Recommending a 15 minute quick charge at ${waypointName}.`;
    } else {
      msg += ` Sufficient battery reserve confirmed for direct travel.`;
    }
    this.speak(msg, "high");
  }
}

export const VoiceGuidance = new VoiceGuidanceService();

export default function () {
  return null;
}


