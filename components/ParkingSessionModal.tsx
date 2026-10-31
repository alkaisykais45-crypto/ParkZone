import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import { router } from "expo-router";
import { useTheme } from "../hooks/useTheme";
import { completeParkingSession } from "../app/services/parking";

const { width } = Dimensions.get("window");

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ParkingSessionModalItem {
  id: string;
  name: string;
  address?: string;
  bayNumber: string;
  zoneCode?: string;
  plate?: string;
  date?: string;
  duration?: string;
  durationHours?: number;
  hourlyRate?: number;
  cost?: number;
  currency?: string;
  status?: "Active" | "Completed" | "Closed";
  receiptNumber?: string;
  entryTime?: Date | string;
  violationFine?: number;
  violationReason?: string;
}

interface ParkingSessionModalProps {
  visible: boolean;
  onClose: () => void;
  session: ParkingSessionModalItem | null;
  onExtendTime?: (hours: number) => void;
  onEndParking?: () => void;
  onViewReceipt?: () => void;
}

export const ParkingSessionModal = ({
  visible,
  onClose,
  session,
  onExtendTime,
  onEndParking,
  onViewReceipt,
}: ParkingSessionModalProps) => {
  const theme = useTheme();
  const [currentTick, setCurrentTick] = useState(Date.now());

  // Live timer interval for active session
  useEffect(() => {
    if (!visible || session?.status !== "Active") return;
    const interval = setInterval(() => {
      setCurrentTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [visible, session?.status]);

  if (!session) return null;

  const isActive = session.status === "Active";

  // Parse entry time and calculate elapsed/remaining
  const entryMs = useMemo(() => {
    if (!session.entryTime) return Date.now() - 15 * 60 * 1000;
    const parsed = new Date(session.entryTime).getTime();
    return isNaN(parsed) ? Date.now() - 15 * 60 * 1000 : parsed;
  }, [session.entryTime]);

  const durationHours = useMemo(() => {
    if (session.durationHours && session.durationHours > 0) return session.durationHours;
    if (session.duration) {
      const match = session.duration.match(/(\d+)\s*h(?:our)?/i);
      if (match) return parseInt(match[1], 10);
      const numMatch = parseFloat(session.duration);
      if (!isNaN(numMatch) && numMatch > 0) return numMatch;
    }
    return 1;
  }, [session.durationHours, session.duration]);

  const totalSeconds = Math.max(1, durationHours * 3600);
  const elapsedSeconds = Math.max(0, Math.floor((currentTick - entryMs) / 1000));
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
  const isOverdue = isActive && elapsedSeconds > totalSeconds;

  // Compute circular progress (0 to 1)
  const progress = useMemo(() => {
    if (!isActive) return 1.0;
    return Math.min(1.0, Math.max(0.05, elapsedSeconds / totalSeconds));
  }, [isActive, elapsedSeconds, totalSeconds]);

  // Format digital countdown string: HH:MM:SS
  const formatTimerDigits = (secs: number) => {
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${pad(hrs)}:${pad(mins)}:${pad(s)}`;
  };

  // Arrival and exit timestamps
  const arriveTimeStr = useMemo(() => {
    return new Date(entryMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [entryMs]);

  const exitTimeStr = useMemo(() => {
    const exitMs = entryMs + totalSeconds * 1000;
    return new Date(exitMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [entryMs, totalSeconds]);

  // SVG Ring dimensions
  const svgSize = Math.min(width * 0.72, 260);
  const strokeWidth = 16;
  const radius = (svgSize - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;

  // Animation values for breathing pulse and smooth progress
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.2)).current;
  const progressAnim = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 500,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, {
            toValue: isOverdue ? 1.08 : 1.04,
            duration: isOverdue ? 700 : 1600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: isOverdue ? 0.7 : 0.45,
            duration: isOverdue ? 700 : 1600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: isOverdue ? 700 : 1600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.15,
            duration: isOverdue ? 700 : 1600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [isOverdue]);

  const animatedStrokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  const activeColor = isOverdue ? theme.danger : theme.accent;
  const trackColor = theme.pillInactiveBg;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
        {/* Top Header */}
        <View style={styles.topHeaderRow}>
          <TouchableOpacity
            style={[styles.backNavBtn, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </TouchableOpacity>

          <Text style={[styles.screenHeaderTitle, { color: theme.text }]}>Parking Session</Text>

          <View style={styles.headerSpacer} />
        </View>

        {/* Center Circular Progress Dial with Breathing Glow Animation */}
        <View style={styles.dialCenterWrapper}>
          {/* Animated Glow Aura */}
          <Animated.View
            style={[
              styles.dialGlowAura,
              {
                width: svgSize + 24,
                height: svgSize + 24,
                borderRadius: (svgSize + 24) / 2,
                backgroundColor: isOverdue ? theme.dangerSoft : theme.accentSoft,
                opacity: glowOpacity,
                transform: [{ scale: pulseAnim }],
              },
            ]}
          />

          <View style={[styles.svgRingContainer, { width: svgSize, height: svgSize }]}>
            <Svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}>
              {/* Background Track Circle */}
              <Circle
                cx={svgSize / 2}
                cy={svgSize / 2}
                r={radius}
                stroke={trackColor}
                strokeWidth={strokeWidth}
                fill="none"
              />

              {/* Active Progress Arc */}
              <AnimatedCircle
                cx={svgSize / 2}
                cy={svgSize / 2}
                r={radius}
                stroke={activeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={animatedStrokeDashoffset as any}
                strokeLinecap="round"
                fill="none"
                transform={`translate(${svgSize}, 0) scale(-1, 1) rotate(-90 ${svgSize / 2} ${svgSize / 2})`}
              />

              {/* Top Anchor Bead */}
              <Circle
                cx={svgSize / 2}
                cy={svgSize / 2 - radius}
                r={strokeWidth / 2 - 1}
                fill={activeColor}
                stroke={theme.surface}
                strokeWidth={3}
              />
            </Svg>
          </View>

          {/* Large Bold Countdown Timer Digits */}
          <Text style={[styles.timerDigitsBold, { color: theme.text }]}>
            {isActive
              ? isOverdue
                ? `+${formatTimerDigits(elapsedSeconds - totalSeconds)}`
                : formatTimerDigits(remainingSeconds)
              : session.duration || "00:00:00"}
          </Text>

          <Text style={[styles.timerSubLabel, { color: theme.textSecondary }]}>
            Remaining Parking Time
          </Text>
        </View>

        {/* Slot & Schedule Detail Card */}
        <View style={[styles.slotScheduleCard, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.cardShadow }]}>
          {/* Card Header: Slot Bay */}
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.slotTitleText, { color: theme.text }]}>
              Slot {session.bayNumber}
            </Text>
          </View>

          {/* Timeline Row: Arrive after, Pill duration, Exit before */}
          <View style={styles.timelineRow}>
            <View style={styles.timelineCol}>
              <Text style={[styles.timelineColLabel, { color: theme.textSecondary }]}>Arrive after</Text>
              <Text style={[styles.timelineColTime, { color: theme.text }]}>{arriveTimeStr}</Text>
            </View>

            <View style={styles.timelineCenterDivider}>
              <View style={[styles.timelineDottedLine, { backgroundColor: theme.border }]} />
              <View style={[styles.timelinePill, { borderColor: theme.borderStrong, backgroundColor: theme.background }]}>
                <Text style={[styles.timelinePillText, { color: theme.text }]}>
                  {durationHours} {durationHours === 1 ? "Hour" : "Hours"}
                </Text>
              </View>
              <View style={[styles.timelineDottedLine, { backgroundColor: theme.border }]} />
            </View>

            <View style={[styles.timelineCol, { alignItems: "flex-end" }]}>
              <Text style={[styles.timelineColLabel, { color: theme.textSecondary }]}>Exit before</Text>
              <Text style={[styles.timelineColTime, { color: theme.text }]}>{exitTimeStr}</Text>
            </View>
          </View>

          {/* Municipal Violation Fine Notice (if applicable) */}
          {session.violationFine ? (
            <View style={styles.fineWarningBox}>
              <Ionicons name="warning" size={15} color="#EF4444" />
              <View style={{ flex: 1 }}>
                <Text style={styles.fineWarningTitle}>
                  +{session.violationFine.toLocaleString()} RWF Municipal Fine Applied
                </Text>
                <Text style={styles.fineWarningSub}>
                  {session.violationReason || "Restricted bay violation"}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Find My Vehicle Button */}
          <TouchableOpacity
            style={[styles.findVehicleBtn, { borderColor: theme.borderStrong, backgroundColor: theme.background }]}
            onPress={() => {
              Alert.alert(
                "Find My Vehicle",
                `Your vehicle${session.plate ? ` (${session.plate})` : ""} is parked in Slot ${session.bayNumber} at ${session.name}.`,
                [
                  { text: "Dismiss", style: "cancel" },
                  {
                    text: "Open Map Navigator",
                    onPress: () => {
                      onClose();
                      router.push("/(tabs)/home");
                    },
                  },
                ]
              );
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="location-outline" size={17} color={theme.text} />
            <Text style={[styles.findVehicleBtnText, { color: theme.text }]}>Find My Vehicle</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom Actions Row: Extend Time & End Parking */}
        <View style={[styles.bottomActionsRow, { backgroundColor: theme.surface, borderTopColor: theme.border, borderTopWidth: 1 }]}>
          {isActive ? (
            <>
              <TouchableOpacity
                style={[
                  styles.extendTimeBtn,
                  {
                    backgroundColor: theme.isDark ? "rgba(255,255,255,0.10)" : "#F4F4F6",
                    borderColor: theme.borderStrong,
                    borderWidth: 1,
                  },
                ]}
                onPress={() => onExtendTime && onExtendTime(1)}
                activeOpacity={0.85}
              >
                <Text style={[styles.extendTimeBtnText, { color: theme.text }]}>Extend Time</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.endParkingBtn,
                  {
                    backgroundColor: isOverdue ? "#EF4444" : theme.primaryBtnBg,
                  },
                ]}
                onPress={() => {
                  if (onEndParking) {
                    onEndParking();
                  } else {
                    const rate =
                      session.hourlyRate ??
                      (session.cost && durationHours > 0
                        ? Math.round(session.cost / durationHours)
                        : 0);
                    const elapsedHours = Math.max(1, Math.ceil(elapsedSeconds / 3600));
                    const extraHours = Math.max(0, elapsedHours - durationHours);
                    const overdueCost = extraHours * rate;

                    if (overdueCost === 0) {
                      Alert.alert(
                        "Close Booking",
                        `Spot: ${session.bayNumber} (${session.name})\nElapsed Time: ${formatTimerDigits(elapsedSeconds)}\nBooked Duration: ${durationHours} Hour(s)\nTotal Extra Due: 0 RWF\n\nComplete and close this parking session in the database?`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Close Booking",
                            onPress: async () => {
                              try {
                                await completeParkingSession({
                                  ticketId: session.id,
                                  paymentMethod: "wallet",
                                  amount: session.cost || durationHours * rate,
                                });
                                onClose();
                                Alert.alert("Booking Closed", "Parking session completed and saved to the database.");
                              } catch {
                                onClose();
                              }
                            },
                          },
                        ]
                      );
                    } else {
                      onClose();
                      router.push({
                        pathname: "/transaction_details",
                        params: {
                          id: session.id,
                          name: session.name,
                          address: session.address,
                          bayNumber: session.bayNumber,
                          zoneCode: session.zoneCode,
                          plate: session.plate,
                          date: session.date,
                          duration: `${elapsedHours} Hours (${extraHours}h Overdue)`,
                          durationHours: elapsedHours.toString(),
                          cost: overdueCost.toString(),
                          currency: session.currency || "RWF",
                          receiptNumber: session.receiptNumber || "309",
                          entryTime: session.entryTime?.toString(),
                          violationFine: "",
                          violationReason: `Overtime (+${extraHours}h)`,
                          isOverdue: "true",
                          overdueCost: overdueCost.toString(),
                          prepaidHours: durationHours.toString(),
                        },
                      });
                    }
                  }
                }}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.endParkingBtnText,
                    { color: isOverdue ? "#FFFFFF" : theme.primaryBtnText },
                  ]}
                >
                  {isOverdue ? "Pay Overdue & Close" : "Close Booking"}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.extendTimeBtn, { backgroundColor: theme.primaryBtnBg }]}
                onPress={() => onViewReceipt && onViewReceipt()}
                activeOpacity={0.85}
              >
                <Ionicons name="receipt-outline" size={16} color={theme.primaryBtnText} />
                <Text style={[styles.extendTimeBtnText, { color: theme.primaryBtnText }]}>View Receipt</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.endParkingBtn,
                  { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 },
                ]}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={[styles.endParkingBtnText, { color: theme.text }]}>Close</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: "space-between",
  },
  topHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 4 : 8,
    paddingBottom: 8,
  },
  backNavBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSpacer: {
    width: 40,
  },
  screenHeaderTitle: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  dialCenterWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 8,
    position: "relative",
  },
  dialGlowAura: {
    position: "absolute",
    top: 6,
    zIndex: 0,
  },
  svgRingContainer: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  carCenterPosition: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  timerDigitsBold: {
    fontSize: 44,
    fontWeight: "700",
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
    marginTop: 16,
  },
  timerSubLabel: {
    fontSize: 13.5,
    fontWeight: "400",
    marginTop: 4,
  },
  slotScheduleCard: {
    width: "100%",
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    marginTop: 16,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 3,
  },
  cardHeaderRow: {
    marginBottom: 16,
  },
  slotTitleText: {
    fontSize: 18,
    fontWeight: "600",
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  timelineCol: {
    minWidth: 70,
  },
  timelineColLabel: {
    fontSize: 12,
    fontWeight: "400",
    marginBottom: 4,
  },
  timelineColTime: {
    fontSize: 15,
    fontWeight: "600",
  },
  timelineCenterDivider: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  timelineDottedLine: {
    flex: 1,
    height: 1,
  },
  timelinePill: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginHorizontal: 4,
  },
  timelinePillText: {
    fontSize: 11,
    fontWeight: "500",
  },
  fineWarningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.25)",
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
  },
  fineWarningTitle: {
    color: "#EF4444",
    fontSize: 11,
    fontWeight: "500",
  },
  fineWarningSub: {
    color: "#F87171",
    fontSize: 10,
    marginTop: 1,
  },
  findVehicleBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: "#09090B",
    backgroundColor: "#FFFFFF",
    borderRadius: 25,
    paddingVertical: 12,
  },
  findVehicleBtnText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#09090B",
  },
  bottomActionsRow: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 16 : 20,
  },
  extendTimeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 25,
    paddingVertical: 14,
  },
  extendTimeBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  endParkingBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF4444",
    borderRadius: 25,
    paddingVertical: 14,
  },
  endParkingBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
