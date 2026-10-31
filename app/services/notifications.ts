import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  Constants.appOwnership === "expo";

let notificationsConfigured = false;

function getNotificationsModule(): typeof import("expo-notifications") | null {
  if (isExpoGo || Platform.OS === "web") {
    return null;
  }

  try {
    // Lazy-require so Expo Go never triggers SDK 53/54 push notification warnings on bundle load
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require("expo-notifications") as typeof import("expo-notifications");
    if (!notificationsConfigured) {
      notificationsConfigured = true;
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    }
    return Notifications;
  } catch {
    return null;
  }
}

/**
 * Request notification permissions and create Android notification channels
 */
export async function registerForPushNotificationsAsync(): Promise<boolean> {
  const Notifications = getNotificationsModule();
  if (!Notifications) return false;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("parking_live_activity", {
      name: "ParkZone Parking Sessions",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#10B981",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: "default",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === "granted";
}

/**
 * Trigger local notification when motorist locks spot and starts parking
 */
export async function notifyParkingStarted(bayNumber: string, locationName: string, durationHours: number) {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  try {
    await registerForPushNotificationsAsync();

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Live Parking Active • Bay ${bayNumber}`,
        body: `Locked at ${locationName}. Booked for ${durationHours}h. Live Dynamic Island tracker active.`,
        data: { bayNumber, locationName, type: "parking_started" },
        sound: "default",
      },
      trigger: null,
    });

    const warningSeconds = Math.max(30, durationHours * 3600 - 900);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Parking Expiring in 15 Minutes`,
        body: `Your session at Bay ${bayNumber} (${locationName}) is about to end. Tap to extend or depart.`,
        data: { bayNumber, locationName, type: "parking_warning" },
        sound: "default",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: warningSeconds,
      },
    });
  } catch {
    // Ignore local notification scheduling errors on unsupported runtimes
  }
}

/**
 * Trigger notification when EV charging completes or reaches target battery SOC
 */
export async function notifyChargingCompleted(params: {
  vehiclePlate: string;
  stationName: string;
  reachedSoc: number;
  deliveredKwh: number;
}) {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  try {
    await registerForPushNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Vehicle Charged to ${params.reachedSoc}%!`,
        body: `Your vehicle (${params.vehiclePlate}) is fully charged at ${params.stationName}. Energy delivered: ${params.deliveredKwh} kWh. Please disconnect cable to avoid idle fees.`,
        data: { ...params, type: "charging_completed" },
        sound: "default",
      },
      trigger: null,
    });
  } catch {
    // Ignore local notification scheduling errors on unsupported runtimes
  }
}

/**
 * Trigger local notification when EV charging starts
 */
export async function notifyChargingStarted(params: {
  vehiclePlate: string;
  stationName: string;
  targetSoc: number;
  estMinutes: number;
}) {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  try {
    await registerForPushNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Charging Started • Target ${params.targetSoc}%`,
        body: `Charging at ${params.stationName}. Estimated completion in ~${params.estMinutes} mins. We will alert you when finished.`,
        data: { ...params, type: "charging_started" },
        sound: "default",
      },
      trigger: null,
    });
  } catch {
    // Ignore local notification scheduling errors on unsupported runtimes
  }
}

/**
 * Cancel all scheduled parking notifications when parking is completed
 */
export async function clearParkingNotifications() {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Ignore cancellation errors on unsupported runtimes
  }
}

export default function () {
  return null;
}
