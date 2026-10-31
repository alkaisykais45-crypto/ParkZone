import React, { useEffect, useRef } from "react";
import { Platform } from "react-native";
import {
  startParkingActivity,
  updateParkingActivity,
  endParkingActivity,
} from "../modules/parking-live-activity";

export interface DynamicIslandParkingProps {
  active: boolean;
  bayNumber: string;
  locationName: string;
  plate: string;
  elapsedSeconds?: number;
  totalSeconds: number;
  remainingSeconds: number;
  progressPercent: number;
  onExtend?: () => void;
  onEndSession?: () => void;
}

/**
 * Headless controller for iOS native Dynamic Island & Lock Screen Live Activity.
 * Bridges session state directly to Apple's native ActivityKit & SwiftUI widget.
 * Does not render a duplicate simulated pill in-app to prevent double dynamic islands.
 */
export const DynamicIslandParking: React.FC<DynamicIslandParkingProps> = ({
  active,
  bayNumber,
  locationName,
  plate,
  totalSeconds,
  remainingSeconds,
  progressPercent,
}) => {
  const prevActiveRef = useRef(false);
  const lastUpdatedSecRef = useRef<number>(-1);

  // 1. Session start & end lifecycle: trigger native ActivityKit
  useEffect(() => {
    if (Platform.OS !== "ios") return;

    if (active && !prevActiveRef.current) {
      // Session newly started -> Start native Dynamic Island Activity
      startParkingActivity(
        bayNumber || "-",
        locationName || "ParkZone Parking",
        plate || "",
        totalSeconds || 3600,
        remainingSeconds || 3600
      );
    } else if (!active && prevActiveRef.current) {
      // Session ended -> Dismiss native Dynamic Island Activity
      endParkingActivity();
    }

    prevActiveRef.current = active;
  }, [active, bayNumber, locationName, plate, totalSeconds, remainingSeconds]);

  // 2. Periodic countdown & progress updates to native Dynamic Island
  useEffect(() => {
    if (Platform.OS !== "ios" || !active) return;

    const sec = Math.floor(remainingSeconds);
    if (sec !== lastUpdatedSecRef.current) {
      lastUpdatedSecRef.current = sec;
      updateParkingActivity(remainingSeconds, progressPercent);
    }
  }, [active, remainingSeconds, progressPercent]);

  // Clean up activity on unmount if active
  useEffect(() => {
    return () => {
      if (prevActiveRef.current) {
        endParkingActivity();
      }
    };
  }, []);

  // Return null: Render directly via native iOS Dynamic Island & Lock Screen Widget
  return null;
};
