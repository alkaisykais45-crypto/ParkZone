import React, { useCallback, useRef, useState } from "react";
import {
  Alert,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "../hooks/useTheme";

export default function ScannerScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [scanned, setScanned] = useState(false);
  const scanLockRef = useRef(false);

  const handleBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (scanLockRef.current || scanned) return;
      scanLockRef.current = true;
      setScanned(true);

      // Parse scanned token (e.g., QR-123, spot:A15, or plain bay number)
      let bayCode = data;
      try {
        if (data.startsWith("{") && data.endsWith("}")) {
          const parsed = JSON.parse(data);
          bayCode = parsed.bay || parsed.spot || parsed.space || data;
        } else if (data.includes("token=")) {
          bayCode = data.split("token=")[1].split("&")[0];
        } else if (data.startsWith("QR-")) {
          bayCode = data.replace("QR-", "");
        }
      } catch {
        bayCode = data;
      }

      Alert.alert(
        "Bay QR Code Detected",
        `Successfully scanned spot: ${bayCode}.\nWould you like to lock and navigate to this bay?`,
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => {
              scanLockRef.current = false;
              setScanned(false);
            },
          },
          {
            text: "Lock Bay",
            onPress: () => {
              router.replace({
                pathname: "/(tabs)/home",
                params: { scannedBay: bayCode },
              });
            },
          },
        ]
      );
    },
    [scanned]
  );

  // If permission state is still loading
  if (!permission) {
    return <View style={[styles.container, { backgroundColor: theme.background }]} />;
  }

  // Permission not granted state
  if (!permission.granted) {
    return (
      <View
        style={[
          styles.container,
          styles.permissionContainer,
          { backgroundColor: theme.background },
        ]}
      >
        <StatusBar barStyle={theme.isDark ? "light-content" : "dark-content"} translucent />
        <View style={styles.permissionContent}>
          <View
            style={[
              styles.cameraIconBox,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Ionicons name="camera-outline" size={40} color={theme.text} />
          </View>
          <Text style={[styles.permissionTitle, { color: theme.text }]}>
            Camera Access Required
          </Text>
          <Text style={[styles.permissionSubtitle, { color: theme.textSecondary }]}>
            ParkZone needs camera access to scan parking bay QR tokens edge-to-edge.
          </Text>
          <TouchableOpacity
            style={[styles.permissionBtn, { backgroundColor: theme.primaryBtnBg }]}
            onPress={requestPermission}
            activeOpacity={0.85}
          >
            <Text style={[styles.permissionBtnText, { color: theme.primaryBtnText }]}>
              Enable Camera
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.permissionBackBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Text style={[styles.permissionBackBtnText, { color: theme.textSecondary }]}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Pure Edge-to-Edge Camera Feed */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      {/* Minimal Floating Top Bar: Close & Flashlight Buttons Only */}
      <View style={[styles.topBar, { top: insets.top + (Platform.OS === "android" ? 10 : 6) }]}>
        <TouchableOpacity
          style={styles.circleBtn}
          onPress={() => router.back()}
          activeOpacity={0.75}
        >
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.circleBtn, torch && styles.circleBtnActive]}
          onPress={() => setTorch((prev) => !prev)}
          activeOpacity={0.75}
        >
          <Ionicons
            name={torch ? "flash" : "flash-outline"}
            size={22}
            color={torch ? "#09090B" : "#FFFFFF"}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  topBar: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 30,
  },
  circleBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  circleBtnActive: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },
  permissionContainer: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  permissionContent: {
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
  },
  cameraIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#18181B",
    borderWidth: 1,
    borderColor: "#27272A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 10,
  },
  permissionSubtitle: {
    fontSize: 14,
    color: "#A1A1AA",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
  },
  permissionBtn: {
    width: "100%",
    height: 50,
    borderRadius: 25,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  permissionBtnText: {
    color: "#09090B",
    fontSize: 15,
    fontWeight: "600",
  },
  permissionBackBtn: {
    paddingVertical: 10,
  },
  permissionBackBtnText: {
    color: "#71717A",
    fontSize: 14,
    fontWeight: "500",
  },
});
