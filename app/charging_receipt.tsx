import React, { useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Rect } from "react-native-svg";
import { router, useLocalSearchParams } from "expo-router";
import { useTheme } from "../hooks/useTheme";

const { width } = Dimensions.get("window");

// Generates a deterministic visual QR matrix grid based on token string
const generateQrMatrix = (seed: string, size: number = 25): boolean[][] => {
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // Finder pattern helper (7x7)
  const drawFinder = (startX: number, startY: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 ||
          r === 6 ||
          c === 0 ||
          c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          matrix[startY + r][startX + c] = true;
        } else {
          matrix[startY + r][startX + c] = false;
        }
      }
    }
  };

  // 3 Finder patterns
  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Deterministic data fill based on seed hash
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  let bitIndex = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Skip finder zones
      const inTopLeft = r < 8 && c < 8;
      const inTopRight = r < 8 && c >= size - 8;
      const inBottomLeft = r >= size - 8 && c < 8;
      const isTiming = r === 6 || c === 6;

      if (!inTopLeft && !inTopRight && !inBottomLeft && !isTiming) {
        const val = Math.abs((hash ^ (r * 31 + c * 17 + bitIndex * 13)) % 100);
        matrix[r][c] = val > 44;
        bitIndex++;
      }
    }
  }

  return matrix;
};

export default function ChargingReceiptScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams();

  // Tab State: "Receipt" | "QR Code"
  const [activeTab, setActiveTab] = useState<"receipt" | "qr">("receipt");

  // Route Params
  const locationId = (params.locationId as string) || "";
  const chargerId = (params.chargerId as string) || "";
  const stationName = (params.name as string) || "EV Charging Station";
  const bayNumber = (params.bayNumber as string) || "EV-01";
  const plateNumber = (params.plate as string) || "RAD ••• B";
  const powerKw = (params.powerKw as string) || "120";
  const soc = (params.soc as string) || "20";
  const currency = (params.currency as string) || "RWF";
  const durationHours = (params.durationHours as string) || "0.5";
  const durationMinutes = (params.durationMinutes as string) || "30";
  const durationSeconds = (params.durationSeconds as string) || "1800";
  const billAmount = params.billAmount ? Number(params.billAmount) : 9000;

  const receiptNumber = useMemo(() => {
    return (params.receiptNumber as string) || `PZ-EV-${Date.now().toString().slice(-4)}`;
  }, [params.receiptNumber]);

  const qrToken = useMemo(() => {
    return (params.qrToken as string) || `QR-EV-${bayNumber}-${receiptNumber}`;
  }, [params.qrToken, bayNumber, receiptNumber]);

  const dateStr = useMemo(() => {
    const d = new Date();
    return `${d.toLocaleDateString()} • ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }, []);

  // QR SVG Matrix
  const qrMatrixSize = 25;
  const qrSvgDimension = Math.min(width * 0.65, 230);
  const cellSize = qrSvgDimension / qrMatrixSize;
  const qrMatrix = useMemo(() => generateQrMatrix(qrToken, qrMatrixSize), [qrToken]);

  const handleStartCharging = () => {
    router.replace({
      pathname: "/ev_charging",
      params: {
        locationId,
        chargerId,
        name: stationName,
        bayNumber,
        plate: plateNumber,
        powerKw,
        soc,
        currency,
        durationHours,
        durationMinutes,
        durationSeconds,
        billAmount: String(billAmount),
      },
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
      {/* Top Header */}
      <View style={styles.topHeaderRow}>
        <TouchableOpacity
          style={[styles.backNavBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={20} color={theme.text} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: theme.text }]}>Payment & Access</Text>

        <View style={[styles.paidStatusBadge, { backgroundColor: theme.isDark ? "#FFFFFF" : "#000000" }]}>
          <Ionicons name="checkmark-circle" size={13} color={theme.evGreen} />
          <Text style={[styles.paidStatusBadgeText, { color: theme.isDark ? "#000000" : "#FFFFFF" }]}>PAID</Text>
        </View>
      </View>

      {/* Segmented Tab Controls: "Receipt" or "QR Code" */}
      <View style={styles.tabsWrapper}>
        <View style={[styles.tabBarTrack, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <TouchableOpacity
            style={[
              styles.tabItemBtn,
              activeTab === "receipt" && {
                backgroundColor: theme.isDark ? "#FFFFFF" : "#000000",
              },
            ]}
            onPress={() => setActiveTab("receipt")}
            activeOpacity={0.85}
          >
            <Ionicons
              name="receipt-outline"
              size={15}
              color={activeTab === "receipt" ? (theme.isDark ? "#000000" : "#FFFFFF") : theme.textSecondary}
            />
            <Text
              style={[
                styles.tabItemText,
                {
                  color: activeTab === "receipt" ? (theme.isDark ? "#000000" : "#FFFFFF") : theme.textSecondary,
                  fontWeight: activeTab === "receipt" ? "700" : "500",
                },
              ]}
            >
              Receipt
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabItemBtn,
              activeTab === "qr" && {
                backgroundColor: theme.isDark ? "#FFFFFF" : "#000000",
              },
            ]}
            onPress={() => setActiveTab("qr")}
            activeOpacity={0.85}
          >
            <Ionicons
              name="qr-code-outline"
              size={15}
              color={activeTab === "qr" ? (theme.isDark ? "#000000" : "#FFFFFF") : theme.textSecondary}
            />
            <Text
              style={[
                styles.tabItemText,
                {
                  color: activeTab === "qr" ? (theme.isDark ? "#000000" : "#FFFFFF") : theme.textSecondary,
                  fontWeight: activeTab === "qr" ? "700" : "500",
                },
              ]}
            >
              QR Code
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeTab === "receipt" ? (
          /* =========================================================================
              RECEIPT TAB CONTENT
          ========================================================================== */
          <View style={[styles.contentCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {/* Amount Banner */}
            <View style={styles.amountHeaderBox}>
              <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>Total Paid</Text>
              <Text style={[styles.amountMainText, { color: theme.text }]}>
                {billAmount.toLocaleString()} {currency}
              </Text>
              <View style={[styles.statusVerifiedPill, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Ionicons name="checkmark-done" size={13} color={theme.evGreen} />
                <Text style={[styles.statusVerifiedText, { color: theme.text }]}>Payment Completed</Text>
              </View>
            </View>

            {/* Dashed Separator */}
            <View style={[styles.dashedLine, { borderColor: theme.border }]} />

            {/* Receipt Item Meta Rows */}
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Receipt No</Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>#{receiptNumber}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Charging Station</Text>
              <Text style={[styles.metaValue, { color: theme.text }]} numberOfLines={1}>
                {stationName}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Charging Bay</Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>{bayNumber}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Vehicle Plate</Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>{plateNumber}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Charger Power</Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>{powerKw} kW Fast Charger</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Date & Time</Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>{dateStr}</Text>
            </View>

            {/* Dashed Separator */}
            <View style={[styles.dashedLine, { borderColor: theme.border }]} />

            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Charging Session Fee</Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>{billAmount.toLocaleString()} {currency}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Parking Fee</Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>0 {currency} (Free for EV)</Text>
            </View>
          </View>
        ) : (
          /* =========================================================================
              QR CODE TAB CONTENT
          ========================================================================== */
          <View style={[styles.contentCard, { backgroundColor: theme.surface, borderColor: theme.border, alignItems: "center" }]}>
            <Text style={[styles.qrTitle, { color: theme.text }]}>Unlock Charger Pedestal</Text>
            <Text style={[styles.qrSubtitle, { color: theme.textSecondary }]}>
              Scan this code at bay {bayNumber} scanner or show to the station attendant to start power delivery.
            </Text>

            {/* QR Code Container */}
            <View style={[styles.qrBoxWrapper, { backgroundColor: "#FFFFFF", borderColor: theme.border }]}>
              <Svg width={qrSvgDimension} height={qrSvgDimension}>
                {qrMatrix.map((row, r) =>
                  row.map((active, c) =>
                    active ? (
                      <Rect
                        key={`${r}-${c}`}
                        x={c * cellSize}
                        y={r * cellSize}
                        width={cellSize}
                        height={cellSize}
                        fill="#000000"
                      />
                    ) : null
                  )
                )}
              </Svg>
            </View>

            {/* QR Token Pill */}
            <View style={[styles.qrTokenPill, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Text style={[styles.qrTokenText, { color: theme.text }]}>{qrToken}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Sticky Bottom Bar: "Start Charging" Button */}
      <View style={[styles.bottomStickyBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.startChargingBtn, { backgroundColor: theme.isDark ? "#FFFFFF" : "#000000" }]}
          onPress={handleStartCharging}
          activeOpacity={0.88}
        >
          <Ionicons name="flash" size={17} color={theme.evGreen} />
          <Text style={[styles.startChargingBtnText, { color: theme.isDark ? "#000000" : "#FFFFFF" }]}>
            Start Charging
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backNavBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  paidStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  paidStatusBadgeText: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  /* Tabs */
  tabsWrapper: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  tabBarTrack: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
  },
  tabItemBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabItemText: {
    fontSize: 13,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 110,
  },

  /* Card */
  contentCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },

  /* Receipt Details */
  amountHeaderBox: {
    alignItems: "center",
    paddingVertical: 12,
  },
  amountLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 4,
  },
  amountMainText: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  statusVerifiedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusVerifiedText: {
    fontSize: 11,
    fontWeight: "500",
  },
  dashedLine: {
    borderTopWidth: 1,
    borderStyle: "dashed",
    marginVertical: 16,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  metaLabel: {
    fontSize: 12.5,
    fontWeight: "400",
  },
  metaValue: {
    fontSize: 13,
    fontWeight: "600",
    maxWidth: "60%",
    textAlign: "right",
  },

  /* QR Code Styles */
  qrTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 4,
  },
  qrSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  qrBoxWrapper: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  qrTokenPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  qrTokenText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
  },

  /* Bottom Bar */
  bottomStickyBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    borderTopWidth: 1,
  },
  startChargingBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 16,
  },
  startChargingBtnText: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});

