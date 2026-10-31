import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNetworkStatus } from "../app/services/networkMonitor";

export function OfflineBanner() {
  const { isOffline, retryConnection } = useNetworkStatus();
  const insets = useSafeAreaInsets();
  const [retrying, setRetrying] = useState(false);

  if (!isOffline) {
    return null;
  }

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await retryConnection();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <View
      style={[
        styles.wrapper,
        {
          paddingTop: Math.max(insets.top, 10) + 4,
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.banner}>
        <View style={styles.iconCircle}>
          <Ionicons name="cloud-offline-outline" size={18} color="#FFFFFF" />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.title}>No Internet Connection</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            Check Wi-Fi or mobile data to load live parking data
          </Text>
        </View>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={handleRetry}
          activeOpacity={0.8}
          disabled={retrying}
        >
          {retrying ? (
            <ActivityIndicator size="small" color="#09090B" />
          ) : (
            <Text style={styles.retryText}>Retry</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9998,
    paddingHorizontal: 14,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#09090B",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#27272A",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
    gap: 10,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: {
    flex: 1,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  subtitle: {
    color: "#A1A1AA",
    fontSize: 11,
    fontWeight: "400",
    marginTop: 1,
  },
  retryBtn: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    minWidth: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    color: "#09090B",
    fontSize: 12,
    fontWeight: "600",
  },
});

