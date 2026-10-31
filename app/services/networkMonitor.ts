import { useEffect, useState } from "react";
import { Alert, AppState, AppStateStatus, Platform } from "react-native";

type NetworkListener = (offline: boolean) => void;

let isOfflineState = false;
let lastAlertTimestamp = 0;
let monitorInitialized = false;
const ALERT_COOLDOWN_MS = 18000;
const listeners = new Set<NetworkListener>();

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn(isOfflineState);
    } catch {
      // ignore listener errors
    }
  });
}

function setOfflineInternal(nextOffline: boolean) {
  if (isOfflineState !== nextOffline) {
    isOfflineState = nextOffline;
    if (!nextOffline) {
      // Reset alert cooldown once connectivity is restored
      lastAlertTimestamp = 0;
    }
    notifyListeners();
  }
}

export function isLikelyNetworkError(err: unknown): boolean {
  if (!err) return false;
  const msg = String((err as any)?.message || err || "").toLowerCase();
  const name = String((err as any)?.name || "").toLowerCase();
  return (
    name === "aborterror" ||
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("load failed") ||
    msg.includes("internet") ||
    msg.includes("offline") ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("enotfound") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("ehostunreach") ||
    msg.includes("enetunreach")
  );
}

export function triggerOfflineAlert(force = false) {
  const now = Date.now();
  if (!force && now - lastAlertTimestamp < ALERT_COOLDOWN_MS) {
    return;
  }
  lastAlertTimestamp = now;

  Alert.alert(
    "No Internet Connection",
    "Unable to connect to ParkZone servers. Please check your Wi-Fi or mobile data connection and try again.",
    [
      {
        text: "Retry",
        onPress: () => {
          checkInternetConnection(true).catch(() => {});
        },
      },
      {
        text: "OK",
        style: "cancel",
      },
    ]
  );
}

export function reportNetworkFailure(err?: unknown) {
  if (err && !isLikelyNetworkError(err)) {
    return;
  }
  const wasOffline = isOfflineState;
  setOfflineInternal(true);
  if (!wasOffline) {
    triggerOfflineAlert(false);
  }
}

export function reportNetworkSuccess() {
  if (isOfflineState) {
    setOfflineInternal(false);
  }
}

export async function checkInternetConnection(manualRetry = false): Promise<boolean> {
  if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.onLine === false) {
    setOfflineInternal(true);
    if (manualRetry) {
      triggerOfflineAlert(true);
    } else {
      triggerOfflineAlert(false);
    }
    return false;
  }

  let rawUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || "").trim();
  if (rawUrl && !rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
    rawUrl = `https://${rawUrl}`;
  }
  const probeUrl = rawUrl
    ? `${rawUrl.replace(/\/$/, "")}/auth/v1/health`
    : "https://clients3.google.com/generate_204";
  const anonKey = (
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  ).trim();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5500);

  try {
    const headers: Record<string, string> = {};
    if (rawUrl && anonKey) {
      headers.apikey = anonKey;
    }
    const response = await fetch(probeUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (response) {
      setOfflineInternal(false);
      return true;
    }
    return true;
  } catch (err) {
    clearTimeout(timeoutId);
    setOfflineInternal(true);
    if (manualRetry) {
      triggerOfflineAlert(true);
    } else {
      triggerOfflineAlert(false);
    }
    return false;
  }
}

export function initNetworkMonitor() {
  if (monitorInitialized) return;
  monitorInitialized = true;

  // Initial background check on launch
  checkInternetConnection(false).catch(() => {});

  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.addEventListener("offline", () => {
      setOfflineInternal(true);
      triggerOfflineAlert(false);
    });
    window.addEventListener("online", () => {
      checkInternetConnection(false).catch(() => {});
    });
  } else {
    AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        checkInternetConnection(false).catch(() => {});
      }
    });
  }
}

export function getIsOffline(): boolean {
  return isOfflineState;
}

export function useNetworkStatus() {
  const [isOffline, setIsOffline] = useState<boolean>(isOfflineState);

  useEffect(() => {
    setIsOffline(isOfflineState);
    const handler: NetworkListener = (offline) => setIsOffline(offline);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  return {
    isOffline,
    retryConnection: () => checkInternetConnection(true),
  };
}

export default function () {
  return null;
}

