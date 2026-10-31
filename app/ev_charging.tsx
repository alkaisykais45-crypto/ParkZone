import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import { router, useLocalSearchParams } from "expo-router";
import { useTheme } from "../hooks/useTheme";
import { useDriverVehicle } from "../hooks/useDriverVehicle";
import { notifyChargingCompleted, notifyChargingStarted } from "./services/notifications";
import { VoiceGuidance } from "./services/voiceGuidance";
import {
  calculateChargingFee,
  completeEvChargingSession,
  startEvChargingSession,
} from "./services/parking";
import { initiateMobilePayment } from "./services/mobilePayment";

const { width } = Dimensions.get("window");
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function EvChargingScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams();
  const { vehicle: driverVehicle } = useDriverVehicle();

  // Route params from live station & DB vehicle
  const locationId = (params.locationId as string) || "";
  const chargerId = (params.chargerId as string) || "";
  const stationName = (params.name as string) || "EV Charging Station";
  const bayNumber = (params.bayNumber as string) || "-";
  const chargerPowerKw = params.powerKw ? Number(params.powerKw) : 120;
  const currency = (params.currency as string) || "RWF";
  const vehiclePlate = (params.plate as string) || driverVehicle?.plateNumber || "";
  const vehicleModel = driverVehicle?.makeModel || "Electric Vehicle";
  const batteryCapacityKwh = driverVehicle?.batteryCapacityKwh || 75;

  // Charging Session State
  const [initialSoc] = useState(params.soc ? Number(params.soc) : (driverVehicle?.batteryLevelPercent || 25));
  const [targetSoc, setTargetSoc] = useState<number>(80);
  const [currentSoc, setCurrentSoc] = useState<number>(initialSoc);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [deliveredKwh, setDeliveredKwh] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [hasNotifiedCompletion, setHasNotifiedCompletion] = useState<boolean>(false);
  const [chargingSessionId, setChargingSessionId] = useState<string>("");

  // Initial bill is 9,000 RWF by default as soon as the user starts charging
  const initialBillAmount = params.billAmount ? Number(params.billAmount) : 9000;
  const [chargingBill] = useState<number>(initialBillAmount);

  // Pre-payment verification: confirm driver has paid before charging starts
  const isPrepaid = params.isPaid === "true" || Boolean(params.billAmount) || Boolean(params.receiptNumber);
  const [paymentVerified, setPaymentVerified] = useState<boolean>(Boolean(isPrepaid));
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);

  // User Selected Timer Duration (starts from 15 mins, defaults to 30 mins fast charge)
  const initialDurationSeconds = useMemo(() => {
    if (params.durationSeconds && Number(params.durationSeconds) > 0) {
      return Number(params.durationSeconds);
    }
    if (params.durationMinutes && Number(params.durationMinutes) > 0) {
      return Number(params.durationMinutes) * 60;
    }
    if (params.durationHours && Number(params.durationHours) > 0) {
      return Number(params.durationHours) * 3600;
    }
    return 30 * 60; // Default 30 mins (fast 80% charge)
  }, [params.durationSeconds, params.durationMinutes, params.durationHours]);

  const [totalChargingSeconds, setTotalChargingSeconds] = useState<number>(initialDurationSeconds);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(initialDurationSeconds);

  // Dynamic Time to 80% and Time to 100% Full Charge
  const timeTo80Mins = useMemo(() => {
    if (currentSoc >= 80) return 0;
    const remainingTo80 = 80 - currentSoc;
    return Math.max(10, Math.round((remainingTo80 / 55) * 30));
  }, [currentSoc]);

  const timeToFullMins = useMemo(() => {
    if (currentSoc >= 100) return 0;
    const remainingTo100 = 100 - currentSoc;
    if (currentSoc >= 80) {
      return Math.max(5, Math.round((remainingTo100 / 20) * 15));
    }
    return Math.max(15, Math.round(timeTo80Mins + (remainingTo100 > 20 ? 15 : 5)));
  }, [currentSoc, timeTo80Mins]);

  // SVG Ring dimensions
  const svgSize = Math.min(width * 0.72, 270);
  const strokeWidth = 16;
  const radius = (svgSize - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;

  // Animated progress value
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Notify & persist on session start
  useEffect(() => {
    const estMins = Math.ceil(totalChargingSeconds / 60);
    notifyChargingStarted({
      vehiclePlate: vehiclePlate || "EV",
      stationName,
      targetSoc,
      estMinutes: estMins,
    });

    startEvChargingSession({
      locationId: locationId || undefined,
      chargerId: chargerId || undefined,
      vehiclePlate: vehiclePlate || "EV",
      bayNumber,
      chargerPowerKw,
      initialSoc,
      targetSoc,
      paymentStatus: paymentVerified ? "paid" : "unpaid",
      amountPaid: chargingBill,
    })
      .then((res) => {
        if (res?.data?.id) setChargingSessionId(res.data.id);
      })
      .catch(() => {});
  }, []);

  // Timer Tick Interval - only ticks if paid and playing
  useEffect(() => {
    if (!isPlaying || !paymentVerified) return;

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleChargingFinished();
          return 0;
        }
        return prev - 1;
      });

      // Increment energy & SOC gradually based on charger output
      const kwhPerSec = chargerPowerKw / 3600;
      setDeliveredKwh((prev) => Number((prev + kwhPerSec).toFixed(3)));
      setCurrentSoc((prev) => {
        const addedSocPercent = (kwhPerSec / batteryCapacityKwh) * 100;
        const next = Math.min(targetSoc, prev + addedSocPercent);
        return Number(next.toFixed(1));
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, chargerPowerKw, batteryCapacityKwh, targetSoc]);

  // Sync circular progress animation with remaining time
  const progress = useMemo(() => {
    if (totalChargingSeconds <= 0) return 1;
    return Math.min(1, Math.max(0, (totalChargingSeconds - remainingSeconds) / totalChargingSeconds));
  }, [totalChargingSeconds, remainingSeconds]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const animatedStrokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  // Handle Charging Finished Event (Notification + Voice Alert)
  const handleChargingFinished = useCallback(() => {
    if (hasNotifiedCompletion) return;
    setHasNotifiedCompletion(true);
    setIsPlaying(false);

    notifyChargingCompleted({
      vehiclePlate,
      stationName,
      reachedSoc: targetSoc,
      deliveredKwh: Number(deliveredKwh.toFixed(1)),
    });

    VoiceGuidance.announceChargingCompleted(vehiclePlate, targetSoc, Number(deliveredKwh.toFixed(1)));

    Alert.alert(
      "Charging Complete",
      `Your ${vehicleModel} (${vehiclePlate}) charging timer has completed.\n\n• Energy Delivered: ${deliveredKwh.toFixed(1)} kWh (${Math.round(currentSoc)}%)\n• Charging Time: ${Math.max(1, Math.ceil(elapsedSeconds / 60))} min\n• Amount Paid: ${chargingBill.toLocaleString()} ${currency}\n• Parking Fee: 0 ${currency} (Free for EV)\n\nPlease disconnect the charging cable.`,
      [{ text: "View Receipt", onPress: handleStopAndComplete }]
    );
  }, [hasNotifiedCompletion, elapsedSeconds, targetSoc, vehiclePlate, stationName, deliveredKwh, vehicleModel, currency, chargingBill, currentSoc]);

  // Format Digital Time Display (HH:MM:SS or MM:SS) based on remaining seconds
  const formatTimerDigits = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleSelectExactDuration = (seconds: number) => {
    setTotalChargingSeconds(seconds);
    setRemainingSeconds(Math.max(0, seconds - elapsedSeconds));
    VoiceGuidance.speak(`Charging timer set to ${Math.round(seconds / 60)} minutes.`);
  };

  const handleReset = () => {
    setElapsedSeconds(0);
    setRemainingSeconds(totalChargingSeconds);
    setDeliveredKwh(0);
    setCurrentSoc(initialSoc);
    setHasNotifiedCompletion(false);
    setIsPlaying(true);
    VoiceGuidance.speak("Charging timer reset to selected duration.");
  };

  const handleStopAndComplete = async () => {
    setIsPlaying(false);
    const billedMins = Math.max(1, Math.ceil(elapsedSeconds / 60));

    // Persist as a completed successful charging session in database
    const completeRes = await completeEvChargingSession({
      sessionId: chargingSessionId,
      finalSoc: Math.round(currentSoc),
      deliveredKwh,
      elapsedSeconds,
      chargingAmountRwf: chargingBill,
      tariffTier: "quick",
      vehiclePlate,
      bayNumber,
      locationId: locationId || undefined,
    }).catch(() => null);

    const resolvedId = completeRes?.data?.id || chargingSessionId || `ev-charge-${Date.now()}`;
    const receiptNum = completeRes?.data?.session_number || `EV-${Date.now().toString().slice(-4)}`;

    VoiceGuidance.speak("Charging session completed successfully. Recorded in history.");

    router.push({
      pathname: "/transaction_details",
      params: {
        id: resolvedId,
        name: stationName,
        address: `EV Charging Bay • ${bayNumber}`,
        bayNumber,
        zoneCode: "EV Fast Hub",
        plate: vehiclePlate,
        date: new Date().toLocaleDateString(),
        duration: `${billedMins} Mins Charging`,
        durationHours: `${(totalChargingSeconds / 3600).toFixed(1)}h`,
        cost: chargingBill.toString(),
        currency,
        receiptNumber: receiptNum,
        violationFine: "0",
        violationReason: `EV Charging (0 RWF Parking Fee • Paid in Full)`,
        isPostpaidEv: "false",
        isPaid: "true",
      },
    });
  };

  const activeColor = theme.evGreen;
  const trackColor = theme.pillInactiveBg;

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: theme.background },
      ]}
      edges={["top", "bottom"]}
    >
      {/* Header Row: Back button, Title, Status badge */}
      <View style={styles.topHeaderRow}>
        <TouchableOpacity
          style={[styles.backNavBtn, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>

        <Text style={[styles.screenHeaderTitle, { color: theme.text }]}>Charging Session</Text>

        <View style={[styles.targetBadgePill, { backgroundColor: theme.isDark ? "#18181B" : "#000000", borderColor: theme.border, borderWidth: 1 }]}>
          <Ionicons name="flash" size={12} color={theme.evGreen} />
          <Text style={[styles.targetBadgePillText, { color: "#FFFFFF" }]}>
            {bayNumber} • {chargerPowerKw}kW
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Pre-payment Verification Status or Action */}
        {paymentVerified ? (
          <View style={[styles.paymentVerifiedBadge, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="checkmark-circle" size={13} color="#10B981" />
            <Text style={[styles.paymentVerifiedText, { color: theme.text }]}>
              Pre-paid & Verified ({chargingBill.toLocaleString()} {currency})
            </Text>
          </View>
        ) : (
          <View style={[styles.paymentRequiredCard, { backgroundColor: theme.surface, borderColor: "#EF4444" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons name="alert-circle" size={20} color="#EF4444" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.paymentRequiredTitle, { color: theme.text }]}>
                  Payment Required Before Session
                </Text>
                <Text style={[styles.paymentRequiredSub, { color: theme.textSecondary }]}>
                  Pre-payment is required before charging. Tap below to initiate payment.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.payNowRequiredBtn, { backgroundColor: theme.primaryBtnBg }]}
              onPress={async () => {
                setIsProcessingPayment(true);
                await initiateMobilePayment(chargingBill);
                setPaymentVerified(true);
                setIsPlaying(true);
                setIsProcessingPayment(false);
                startEvChargingSession({
                  locationId: locationId || undefined,
                  chargerId: chargerId || undefined,
                  vehiclePlate: vehiclePlate || "EV",
                  bayNumber,
                  chargerPowerKw,
                  initialSoc,
                  targetSoc,
                  paymentStatus: "paid",
                  amountPaid: chargingBill,
                })
                  .then((res) => {
                    if (res?.data?.id) setChargingSessionId(res.data.id);
                  })
                  .catch(() => {});
              }}
              disabled={isProcessingPayment}
              activeOpacity={0.88}
            >
              <Text style={[styles.payNowRequiredBtnText, { color: theme.primaryBtnText }]}>
                Pay Now ({chargingBill.toLocaleString()} {currency})
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* =========================================================================
            CENTER CIRCULAR PROGRESS DIAL
        ========================================================================== */}
        <View style={styles.dialCenterWrapper}>
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

              {/* Active Neon Green Progress Arc */}
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
            </Svg>

            {/* Inner Content: Countdown Digits & Elapsed Time */}
            <View style={styles.dialInnerContent}>
              <Text style={[styles.timerDigitsBold, { color: theme.text }]}>
                {formatTimerDigits(remainingSeconds)}
              </Text>
              <Text style={[styles.timerSubLabel, { color: theme.textSecondary }]}>
                Elapsed: {formatTimerDigits(elapsedSeconds)}
              </Text>
            </View>
          </View>
        </View>

        {/* =========================================================================
            SESSION CONTROLS (RESET & STOP BUTTONS - ICON ONLY)
        ========================================================================== */}
        <View style={styles.controlsRow}>
          {/* Reset Button */}
          <TouchableOpacity
            style={[
              styles.resetBtn,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
            onPress={handleReset}
            activeOpacity={0.75}
          >
            <Ionicons name="reload" size={20} color={theme.text} />
          </TouchableOpacity>

          {/* Primary Stop Button */}
          <TouchableOpacity
            style={[
              styles.stopPrimaryBtn,
              {
                backgroundColor: theme.isDark ? "#FFFFFF" : "#000000",
                shadowColor: "#000000",
              },
            ]}
            onPress={() => {
              Alert.alert(
                "Finish Charging",
                `Finish charging vehicle ${vehiclePlate}?\n\n• Elapsed Time: ${formatTimerDigits(elapsedSeconds)}\n• Delivered: ${deliveredKwh.toFixed(1)} kWh (${Math.round(currentSoc)}%)\n• Amount Paid: ${chargingBill.toLocaleString()} ${currency}\n• Parking Fee: 0 ${currency}`,
                [
                  { text: "Continue Charging", style: "cancel" },
                  { text: "Finish & View Receipt", style: "destructive", onPress: handleStopAndComplete },
                ]
              );
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="stop" size={22} color={theme.isDark ? "#000000" : "#FFFFFF"} />
          </TouchableOpacity>
        </View>

        {/* =========================================================================
            ESSENTIAL TELEMETRY METRICS ROW
        ========================================================================== */}
        <View style={styles.telemetryMetricsRow}>
          <View style={[styles.telemetryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.telemetryLabel, { color: theme.textSecondary }]}>POWER</Text>
            <Text style={[styles.telemetryValue, { color: theme.text }]}>
              {chargerPowerKw} kW
            </Text>
            <Text style={[styles.telemetrySub, { color: theme.evGreen }]}>
              Output
            </Text>
          </View>

          <View style={[styles.telemetryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.telemetryLabel, { color: theme.textSecondary }]}>ENERGY</Text>
            <Text style={[styles.telemetryValue, { color: theme.text }]}>
              {deliveredKwh.toFixed(1)} kWh
            </Text>
            <Text style={[styles.telemetrySub, { color: theme.evGreen }]}>
              +{(deliveredKwh * 5.2).toFixed(0)} km
            </Text>
          </View>

          <View style={[styles.telemetryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.telemetryLabel, { color: theme.textSecondary }]}>BATTERY</Text>
            <Text style={[styles.telemetryValue, { color: theme.text }]}>
              {Math.round(currentSoc)}%
            </Text>
            <Text style={[styles.telemetrySub, { color: theme.textSecondary }]}>
              Target {targetSoc}%
            </Text>
          </View>
        </View>

        {/* =========================================================================
            ACTIVE SESSION PAYMENT STATUS
        ========================================================================== */}
        <View style={[styles.billStatusBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name="checkmark-circle" size={18} color={theme.evGreen} />
            <View>
              <Text style={[styles.billStatusTitle, { color: theme.text }]}>
                Paid Session: <Text style={{ fontWeight: "700" }}>{chargingBill.toLocaleString()} {currency}</Text>
              </Text>
              <Text style={[styles.billStatusSub, { color: theme.textSecondary }]}>
                Active EV Charging • 0 RWF Parking Fee
              </Text>
            </View>
          </View>
        </View>

        {/* =========================================================================
            TIME TO FULL CHARGE DYNAMIC CARD
        ========================================================================== */}
        <View style={[styles.timeToFullCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.timeToFullLeft}>
            <View style={[styles.timeToFullIconBox, { backgroundColor: theme.isDark ? "#18181B" : "#F4F4F5" }]}>
              <Ionicons name="battery-charging" size={20} color={theme.evGreen} />
            </View>
            <View>
              <Text style={[styles.timeToFullTitle, { color: theme.text }]}>Time to Full Charge</Text>
              <Text style={[styles.timeToFullSub, { color: theme.textSecondary }]}>
                ~{timeTo80Mins}m to 80% fast threshold • ~{timeToFullMins}m to 100% full
              </Text>
            </View>
          </View>
          <View style={styles.timeToFullRight}>
            <Text style={[styles.timeToFullVal, { color: theme.evGreen }]}>
              ~{timeToFullMins} min
            </Text>
            <Text style={[styles.timeToFullValSub, { color: theme.textSecondary }]}>
              100% capacity
            </Text>
          </View>
        </View>

        {/* =========================================================================
            RECOMMENDED CHARGING SECTION
        ========================================================================== */}
        <View style={[styles.recommendedContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.recommendedHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="sparkles" size={15} color={theme.text} />
              <Text style={[styles.recommendedTitle, { color: theme.text }]}>Recommended Charging Sessions</Text>
            </View>
            <View style={styles.recommendedFullTag}>
              <Text style={styles.recommendedFullTagText}>EV DC CURVE</Text>
            </View>
          </View>

          <View style={styles.recommendedCardsCol}>
            {/* 30 Mins (80% Charge) */}
            <TouchableOpacity
              style={[
                styles.recommendedCard,
                {
                  backgroundColor: totalChargingSeconds === 30 * 60
                    ? (theme.isDark ? "rgba(255,255,255,0.10)" : "rgba(9,9,11,0.06)")
                    : theme.background,
                  borderColor: totalChargingSeconds === 30 * 60 ? theme.text : theme.border,
                },
              ]}
              onPress={() => handleSelectExactDuration(30 * 60)}
              activeOpacity={0.8}
            >
              <View style={styles.recommendedCardLeft}>
                <View style={[styles.recommendedCardIcon, { backgroundColor: theme.surface }]}>
                  <Ionicons name="flash" size={16} color={theme.evGreen} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[styles.recommendedCardName, { color: theme.text }]}>30 Mins (80% Fast Charge)</Text>
                    <View style={[styles.recBadge, { backgroundColor: theme.isDark ? "#FFFFFF" : "#000000" }]}>
                      <Text style={[styles.recBadgeText, { color: theme.isDark ? "#000000" : "#FFFFFF" }]}>RECOMMENDED</Text>
                    </View>
                  </View>
                  <Text style={[styles.recommendedCardSub, { color: theme.textSecondary }]}>
                    Fastest charging rate (~30 mins to 80% SOC). Protects battery health.
                  </Text>
                </View>
              </View>
              <Ionicons
                name={totalChargingSeconds === 30 * 60 ? "checkmark-circle" : "ellipse-outline"}
                size={19}
                color={totalChargingSeconds === 30 * 60 ? theme.text : theme.textSecondary}
              />
            </TouchableOpacity>

            {/* 45 Mins (100% Full Charge) */}
            <TouchableOpacity
              style={[
                styles.recommendedCard,
                {
                  backgroundColor: totalChargingSeconds === 45 * 60
                    ? (theme.isDark ? "rgba(255,255,255,0.10)" : "rgba(9,9,11,0.06)")
                    : theme.background,
                  borderColor: totalChargingSeconds === 45 * 60 ? theme.text : theme.border,
                },
              ]}
              onPress={() => handleSelectExactDuration(45 * 60)}
              activeOpacity={0.8}
            >
              <View style={styles.recommendedCardLeft}>
                <View style={[styles.recommendedCardIcon, { backgroundColor: theme.surface }]}>
                  <Ionicons name="battery-full" size={16} color={theme.evGreen} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[styles.recommendedCardName, { color: theme.text }]}>45 Mins (100% Full Charge)</Text>
                    <View style={[styles.recBadge, { backgroundColor: "rgba(16, 185, 129, 0.15)" }]}>
                      <Text style={[styles.recBadgeText, { color: "#10B981" }]}>FULL RANGE</Text>
                    </View>
                  </View>
                  <Text style={[styles.recommendedCardSub, { color: theme.textSecondary }]}>
                    Complete 100% full capacity (~45 mins) for long road trips and maximum range.
                  </Text>
                </View>
              </View>
              <Ionicons
                name={totalChargingSeconds === 45 * 60 ? "checkmark-circle" : "ellipse-outline"}
                size={19}
                color={totalChargingSeconds === 45 * 60 ? theme.text : theme.textSecondary}
              />
            </TouchableOpacity>

            {/* 15 Mins (Quick Splash) */}
            <TouchableOpacity
              style={[
                styles.recommendedCard,
                {
                  backgroundColor: totalChargingSeconds === 15 * 60
                    ? (theme.isDark ? "rgba(255,255,255,0.10)" : "rgba(9,9,11,0.06)")
                    : theme.background,
                  borderColor: totalChargingSeconds === 15 * 60 ? theme.text : theme.border,
                },
              ]}
              onPress={() => handleSelectExactDuration(15 * 60)}
              activeOpacity={0.8}
            >
              <View style={styles.recommendedCardLeft}>
                <View style={[styles.recommendedCardIcon, { backgroundColor: theme.surface }]}>
                  <Ionicons name="speedometer" size={16} color={theme.evGreen} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[styles.recommendedCardName, { color: theme.text }]}>15 Mins (Quick Splash)</Text>
                    <View style={[styles.recBadge, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
                      <Text style={[styles.recBadgeText, { color: theme.textSecondary }]}>QUICK BOOST</Text>
                    </View>
                  </View>
                  <Text style={[styles.recommendedCardSub, { color: theme.textSecondary }]}>
                    Fast 15-minute quick top-up adding ~50 km city driving distance.
                  </Text>
                </View>
              </View>
              <Ionicons
                name={totalChargingSeconds === 15 * 60 ? "checkmark-circle" : "ellipse-outline"}
                size={19}
                color={totalChargingSeconds === 15 * 60 ? theme.text : theme.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* =========================================================================
            CHARGING TIMER DURATION SELECTOR
        ========================================================================== */}
        <View style={[styles.timerDurationContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.timerDurationHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="timer-outline" size={15} color={theme.evGreen} />
              <Text style={[styles.timerDurationTitle, { color: theme.text }]}>Timer Duration</Text>
            </View>
            <Text style={[styles.timerDurationSubtitle, { color: theme.evGreen }]}>
              {Math.round(totalChargingSeconds / 60)} min
            </Text>
          </View>

          <View style={styles.timerDurationButtonsRow}>
            {[
              { label: "15m", sec: 15 * 60 },
              { label: "30m", sec: 30 * 60 },
              { label: "45m", sec: 45 * 60 },
              { label: "1h", sec: 60 * 60 },
              { label: "1.5h", sec: 90 * 60 },
              { label: "2h", sec: 120 * 60 },
            ].map((item) => {
              const isSelected = totalChargingSeconds === item.sec;
              return (
                <TouchableOpacity
                  key={item.label}
                  style={[
                    styles.timerDurationBtn,
                    {
                      backgroundColor: isSelected ? (theme.isDark ? "#FFFFFF" : "#000000") : theme.background,
                      borderColor: isSelected ? (theme.isDark ? "#FFFFFF" : "#000000") : theme.border,
                    },
                  ]}
                  onPress={() => handleSelectExactDuration(item.sec)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.timerDurationBtnText,
                      {
                        color: isSelected ? (theme.isDark ? "#000000" : "#FFFFFF") : theme.text,
                        fontWeight: isSelected ? "700" : "500",
                      },
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>
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
    paddingBottom: 8,
  },
  backNavBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  screenHeaderTitle: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  targetBadgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  targetBadgePillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 36,
    alignItems: "center",
  },

  /* Dial Center Styles */
  dialCenterWrapper: {
    marginTop: 18,
    marginBottom: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  svgRingContainer: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  dialInnerContent: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  timerDigitsBold: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
  },
  timerSubLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 4,
  },

  /* Controls Row */
  controlsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    marginBottom: 24,
  },
  resetBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  stopPrimaryBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },

  /* Essential Telemetry Cards */
  telemetryMetricsRow: {
    flexDirection: "row",
    width: "100%",
    gap: 8,
    marginBottom: 12,
  },
  telemetryCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  telemetryLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  telemetryValue: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  telemetrySub: {
    fontSize: 10,
    fontWeight: "500",
  },

  /* Bill Status Box */
  billStatusBox: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  billStatusTitle: {
    fontSize: 13,
  },
  billStatusSub: {
    fontSize: 11,
    marginTop: 2,
  },
  freeParkingPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  freeParkingPillText: {
    fontSize: 9.5,
    fontWeight: "600",
  },

  /* Timer Duration Selector */
  timerDurationContainer: {
    width: "100%",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  timerDurationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  timerDurationTitle: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  timerDurationSubtitle: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  timerDurationButtonsRow: {
    flexDirection: "row",
    gap: 6,
  },
  timerDurationBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  timerDurationBtnText: {
    fontSize: 11,
  },
  paymentVerifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 6,
    marginBottom: 10,
  },
  paymentVerifiedText: {
    fontSize: 11.5,
    fontWeight: "600",
  },
  paymentRequiredCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    marginTop: 8,
    marginBottom: 14,
    gap: 12,
  },
  paymentRequiredTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  paymentRequiredSub: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  payNowRequiredBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  payNowRequiredBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  timeToFullCard: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  timeToFullLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  timeToFullIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  timeToFullTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  timeToFullSub: {
    fontSize: 11,
    marginTop: 2,
  },
  timeToFullRight: {
    alignItems: "flex-end",
    marginLeft: 8,
  },
  timeToFullVal: {
    fontSize: 16,
    fontWeight: "800",
  },
  timeToFullValSub: {
    fontSize: 10,
    marginTop: 1,
  },
  recommendedContainer: {
    width: "100%",
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  recommendedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  recommendedTitle: {
    fontSize: 12.5,
    fontWeight: "700",
  },
  recommendedFullTag: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
  },
  recommendedFullTagText: {
    fontSize: 9.5,
    fontWeight: "700",
    color: "#10B981",
  },
  recommendedCardsCol: {
    gap: 8,
  },
  recommendedCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
  },
  recommendedCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  recommendedCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  recommendedCardName: {
    fontSize: 12.5,
    fontWeight: "700",
  },
  recommendedCardSub: {
    fontSize: 10.5,
    marginTop: 2,
    lineHeight: 14,
  },
  recBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recBadgeText: {
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
