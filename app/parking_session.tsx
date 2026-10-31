import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { router, useLocalSearchParams } from "expo-router";
import { useTheme } from "../hooks/useTheme";
import { supabase } from "./lib/supabase";
import { completeParkingSession, fetchActiveParkingTicket, resolveSpaceImageUrl } from "./services/parking";
import { initiateMobilePayment } from "./services/mobilePayment";
import { VoiceGuidance } from "./services/voiceGuidance";

const { width } = Dimensions.get("window");

// Animated SVG Circle
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ParkingSessionDetails {
  id: string;
  locationId?: string;
  spaceId?: string;
  imageUrl?: string;
  name: string;
  address?: string;
  bayNumber: string;
  zoneCode?: string;
  plate?: string;
  date?: string;
  duration?: string;
  durationHours?: number;
  hourlyRate?: number;
  dailyCap?: number;
  cost?: number;
  currency?: string;
  status?: "Active" | "Completed" | "Closed";
  receiptNumber?: string;
  entryTime?: Date | string;
  violationFine?: number;
  violationReason?: string;
}

export default function ParkingSessionScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams();

  // Session state initialized from route params and synced with database
  const [session, setSession] = useState<ParkingSessionDetails>(() => {
    const rawCost = params.cost ? Number(params.cost) : 0;
    const rawFine = params.violationFine ? Number(params.violationFine) : undefined;
    const rawHours = params.durationHours ? Number(params.durationHours) : undefined;
    const rawRate = params.hourlyRate ? Number(params.hourlyRate) : undefined;

    return {
      id: (params.id as string) || "",
      locationId: (params.locationId as string) || undefined,
      imageUrl:
        (params.image as string) ||
        resolveSpaceImageUrl(`${params.name || "lot"}-${params.bayNumber || "bay"}`, "regular"),
      name: (params.name as string) || "Parking Facility",
      address: (params.address as string) || "",
      bayNumber: (params.bayNumber as string) || "-",
      zoneCode: (params.zoneCode as string) || "",
      plate: (params.plate as string) || "",
      date: (params.date as string) || "",
      duration: (params.duration as string) || "",
      durationHours: rawHours,
      hourlyRate: rawRate,
      dailyCap: undefined,
      cost: isNaN(rawCost) ? 0 : rawCost,
      currency: (params.currency as string) || "RWF",
      status: ((params.status as string) || "Active") as "Active" | "Completed" | "Closed",
      receiptNumber: (params.receiptNumber as string) || "",
      entryTime: (params.entryTime as string) || new Date().toISOString(),
      violationFine: rawFine,
      violationReason: (params.violationReason as string) || undefined,
    };
  });

  const [evCharger, setEvCharger] = useState<{
    id?: string;
    powerKw?: number;
    flatRateFull?: number;
    flatRateQuick?: number;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        let ticketRow: any = null;
        if (params.id) {
          const { data } = await supabase
            .from("parking_tickets")
            .select("*, parking_locations(*), parking_spaces(*)")
            .eq("id", String(params.id))
            .maybeSingle();
          ticketRow = data;
        } else {
          ticketRow = await fetchActiveParkingTicket();
        }
        if (!mounted || !ticketRow) return;

        const loc = Array.isArray(ticketRow.parking_locations)
          ? ticketRow.parking_locations[0]
          : ticketRow.parking_locations;
        const sp = Array.isArray(ticketRow.parking_spaces)
          ? ticketRow.parking_spaces[0]
          : ticketRow.parking_spaces;
        const rate = Number(ticketRow.hourly_rate) || Number(loc?.hourly_rate) || 0;
        const cap = Number(ticketRow.daily_cap) || Number(loc?.daily_rate) || 0;
        const total = Number(ticketRow.total_amount) || rate;
        const hrs = Number(ticketRow.hours_elapsed) > 0
          ? Number(ticketRow.hours_elapsed)
          : (params.durationHours ? Number(params.durationHours) : (rate > 0 ? Math.max(1, Math.round(total / rate)) : 1));
        const resolvedLocId = ticketRow.location_id || loc?.id;

        if (resolvedLocId) {
          const { data: chargerRow } = await supabase
            .from("ev_charging_points")
            .select("id, max_output_kw, flat_rate_full_rwf, flat_rate_quick_rwf")
            .eq("location_id", resolvedLocId)
            .eq("is_operational", true)
            .limit(1)
            .maybeSingle();

          if (mounted && chargerRow) {
            setEvCharger({
              id: chargerRow.id,
              powerKw: Number(chargerRow.max_output_kw) || undefined,
              flatRateFull: Number(chargerRow.flat_rate_full_rwf) || undefined,
              flatRateQuick: Number(chargerRow.flat_rate_quick_rwf) || undefined,
            });
          }
        }

        setSession((prev) => ({
          ...prev,
          id: ticketRow.id,
          locationId: resolvedLocId || prev.locationId,
          spaceId: ticketRow.space_id || sp?.id,
          imageUrl:
            sp?.image_url?.trim() ||
            loc?.image_url?.trim() ||
            resolveSpaceImageUrl(
              `${resolvedLocId || loc?.name || "lot"}-${sp?.space_number || ticketRow.id}`,
              sp?.space_type || "regular"
            ),
          name: loc?.name || prev.name,
          address: loc?.address || prev.address,
          bayNumber: sp?.space_number || prev.bayNumber,
          zoneCode: sp?.zone_code || prev.zoneCode,
          plate: ticketRow.vehicle_plate || prev.plate,
          date: ticketRow.entry_time ? new Date(ticketRow.entry_time).toLocaleString() : prev.date,
          durationHours: hrs,
          duration: `${hrs}h 00m`,
          hourlyRate: rate || prev.hourlyRate,
          dailyCap: cap || prev.dailyCap,
          cost: total,
          currency: loc?.currency || prev.currency || "RWF",
          status: ticketRow.status === "cancelled" ? "Closed" : (ticketRow.status === "completed" || Boolean(ticketRow.exit_time)) ? "Completed" : "Active",
          receiptNumber: ticketRow.ticket_number || prev.receiptNumber,
          entryTime: ticketRow.entry_time || prev.entryTime,
        }));
      } catch (e) {
        console.warn("Failed to load parking session from DB:", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [params.id]);

  const [currentTick, setCurrentTick] = useState(Date.now());
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);

  // Live timer interval if session is Active
  useEffect(() => {
    if (session.status !== "Active") return;
    const interval = setInterval(() => {
      setCurrentTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [session.status]);

  // Parse entry time & calculate duration
  const entryMs = useMemo(() => {
    if (!session.entryTime) return Date.now() - 40 * 60 * 1000;
    const parsed = new Date(session.entryTime).getTime();
    return isNaN(parsed) ? Date.now() - 40 * 60 * 1000 : parsed;
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
  const isActive = session.status === "Active";
  const isOverdue = isActive && elapsedSeconds > totalSeconds;

  // Circular gauge progress (0 to 1)
  const progress = useMemo(() => {
    if (!isActive) return 1.0;
    return Math.min(1.0, Math.max(0.06, elapsedSeconds / totalSeconds));
  }, [isActive, elapsedSeconds, totalSeconds]);

  // Digital countdown string HH:MM:SS
  const formatTimerDigits = (secs: number) => {
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${pad(hrs)}:${pad(mins)}:${pad(s)}`;
  };

  // Timestamps
  const arriveTimeStr = useMemo(() => {
    return new Date(entryMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [entryMs]);

  const exitTimeStr = useMemo(() => {
    const exitMs = entryMs + totalSeconds * 1000;
    return new Date(exitMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [entryMs, totalSeconds]);

  // Svg ring dimensions matching the reference design
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

  // Handle Extend Time (persisted in database with background mobile payment)
  const handleExtendTime = async () => {
    const derivedRate =
      session.hourlyRate ??
      (session.cost && durationHours > 0 ? Math.round(session.cost / durationHours) : 300);
    const newHours = durationHours + 1;
    const newTotal = (session.cost || 0) + derivedRate;
    setSession((prev) => ({
      ...prev,
      durationHours: newHours,
      duration: `${newHours}h 00m`,
      cost: newTotal,
    }));

    // Trigger mobile payment dial code in background for extension
    if (derivedRate > 0) {
      initiateMobilePayment(derivedRate).catch(() => {});
    }

    if (session.id) {
      await supabase
        .from("parking_tickets")
        .update({ total_amount: newTotal, hours_elapsed: newHours })
        .eq("id", session.id);
    }

    Alert.alert(
      "Parking Extended",
      `Your session in Slot ${session.bayNumber} has been extended by 1 hour (+${derivedRate.toLocaleString()} ${session.currency || "RWF"}).\nPayment initiated in the background.\nNew departure time: ${exitTimeStr}`,
      [{ text: "OK" }]
    );
  };

  // Handle End Parking -> Close booking directly in database if within prepaid duration, or pay overdue if exceeded
  const handleEndParking = () => {
    const rate =
      session.hourlyRate ??
      (session.cost && durationHours > 0 ? Math.round(session.cost / durationHours) : 0);
    const elapsedHours = Math.max(1, Math.ceil(elapsedSeconds / 3600));
    const extraHours = Math.max(0, elapsedHours - durationHours);
    const overdueCost = extraHours * rate;

    if (overdueCost === 0) {
      Alert.alert(
        "Close Booking",
        `Spot: ${session.bayNumber} (${session.name})\nElapsed Time: ${formatTimerDigits(elapsedSeconds)}\nBooked Duration: ${durationHours} Hour(s) (Pre-paid)\nTotal Extra Due: 0 RWF\n\nYour session was already paid before booking.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Close Booking",
            onPress: async () => {
              try {
                if (session.id) {
                  await completeParkingSession({
                    ticketId: session.id,
                    spaceId: session.spaceId,
                    paymentMethod: "wallet",
                    amount: session.cost || durationHours * rate,
                  });
                }
                Alert.alert("Booking Closed", "Parking session finished in database.");
                router.replace("/(tabs)/home");
              } catch {
                router.replace("/(tabs)/home");
              }
            },
          },
        ]
      );
    } else {
      router.push({
        pathname: "/transaction_details",
        params: {
          id: session.id,
          spaceId: session.spaceId || "",
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
          receiptNumber: session.receiptNumber || "-",
          entryTime: session.entryTime?.toString(),
          violationFine: "",
          violationReason: `Overtime (+${extraHours}h)`,
          isOverdue: "true",
          overdueCost: overdueCost.toString(),
          prepaidHours: durationHours.toString(),
        },
      });
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
      {/* Header Row: Centered "Parking Session" with subtle back button */}
      <View style={styles.topHeaderRow}>
        <TouchableOpacity
          style={[styles.headerNavBtn, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>

        <Text style={[styles.screenHeaderTitle, { color: theme.text }]}>Parking Session</Text>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Separated Service Badge: Parking Only (EV Charging Billed Separately) */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            backgroundColor: theme.surface,
            borderColor: theme.border,
            borderWidth: 1,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 10,
            marginBottom: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <Ionicons name="car-sport-outline" size={16} color={theme.text} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: "500", color: theme.text }}>
                Parking Only •{" "}
                {session.hourlyRate
                  ? `${session.hourlyRate.toLocaleString()} ${session.currency || "RWF"}/hr${session.dailyCap ? ` (${session.dailyCap.toLocaleString()}/day cap)` : ""}`
                  : "Live Facility Tariff"}
              </Text>
              <Text style={{ fontSize: 10.5, color: theme.textSecondary, marginTop: 1 }}>
                Separated from EV Charging
                {evCharger?.flatRateQuick && evCharger?.flatRateFull
                  ? ` (${evCharger.flatRateQuick.toLocaleString()}–${evCharger.flatRateFull.toLocaleString()} ${session.currency || "RWF"} at EV Hubs)`
                  : " (Billed separately at EV Hubs)"}
              </Text>
            </View>
          </View>
          {(evCharger !== null ||
            session.zoneCode?.toLowerCase().includes("ev") ||
            session.bayNumber.toLowerCase().startsWith("ev")) && (
            <TouchableOpacity
              onPress={() =>
                router.replace({
                  pathname: "/ev_charging",
                  params: {
                    locationId: session.locationId || "",
                    chargerId: evCharger?.id || "",
                    name: session.name,
                    bayNumber: session.bayNumber,
                    plate: session.plate || "",
                    powerKw: evCharger?.powerKw ? String(evCharger.powerKw) : "",
                    flatRateFull: evCharger?.flatRateFull ? String(evCharger.flatRateFull) : "",
                    flatRateQuick: evCharger?.flatRateQuick ? String(evCharger.flatRateQuick) : "",
                    currency: session.currency || "RWF",
                  },
                })
              }
              style={{
                backgroundColor: theme.primaryBtnBg,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 10,
              }}
              activeOpacity={0.8}
            >
              <Text style={{ color: theme.primaryBtnText, fontSize: 10.5, fontWeight: "500" }}>
                EV Charge
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Verified Pre-paid Badge */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: theme.surface,
            borderColor: theme.border,
            borderWidth: 1,
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 20,
            marginBottom: 10,
            alignSelf: "center",
          }}
        >
          <Ionicons name="checkmark-circle" size={13} color="#10B981" />
          <Text style={{ fontSize: 11.5, fontWeight: "600", color: theme.text }}>
            Pre-paid & Verified ({(session.cost || 300).toLocaleString()} {session.currency || "RWF"})
          </Text>
        </View>

        {/* Circular Progress Dial with Breathing Glow Animation */}
        <View style={styles.dialWrapper}>
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
              {/* Background Circular Track */}
              <Circle
                cx={svgSize / 2}
                cy={svgSize / 2}
                r={radius}
                stroke={trackColor}
                strokeWidth={strokeWidth}
                fill="none"
              />

              {/* Animated Active Progress Arc */}
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

          {/* Large Bold Digital Timer Digits */}
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
          {/* Card Title with Space Image */}
          <View style={[styles.cardHeaderRow, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
            {session.imageUrl ? (
              <Image
                source={{ uri: session.imageUrl }}
                style={{ width: 46, height: 46, borderRadius: 12, borderWidth: 1, borderColor: theme.border }}
              />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={[styles.slotTitleText, { color: theme.text }]}>
                Slot {session.bayNumber}
              </Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, fontWeight: "400", marginTop: 2 }} numberOfLines={1}>
                {session.name}
              </Text>
            </View>
          </View>

          {/* Timeline Row: Arrive after <---> [1 Hours] <---> Exit before */}
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

          {/* Fine Banner if applicable */}
          {session.violationFine ? (
            <View style={styles.fineWarningBox}>
              <Ionicons name="warning" size={15} color="#EF4444" />
              <View style={{ flex: 1 }}>
                <Text style={styles.fineWarningTitle}>
                  +{session.violationFine.toLocaleString()} RWF Municipal Fine Applied
                </Text>
                <Text style={styles.fineWarningSub}>
                  {session.violationReason || "Designated slot contravention"}
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
                `Your vehicle (${session.plate || "-"}) is parked at Slot ${session.bayNumber} in ${session.name}.${session.zoneCode ? `\n\nFollow level markers to ${session.zoneCode}.` : ""}`,
                [
                  { text: "Dismiss", style: "cancel" },
                  {
                    text: "Open Map Navigator",
                    onPress: () => router.push("/(tabs)/home"),
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
      </ScrollView>

      {/* Bottom Action Buttons: Extend Time & End Parking */}
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
              onPress={handleExtendTime}
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
              onPress={handleEndParking}
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
              onPress={() => setReceiptModalVisible(true)}
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
              onPress={() => router.back()}
              activeOpacity={0.8}
            >
              <Text style={[styles.endParkingBtnText, { color: theme.text }]}>Back</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Fiscal Receipt Modal */}
      <Modal
        visible={receiptModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReceiptModalVisible(false)}
      >
        <View style={styles.receiptOverlay}>
          <View style={[styles.receiptCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.receiptHeader}>
              <View>
                <Text style={[styles.receiptHeaderBrand, { color: theme.text }]}>PARKZONE RWANDA</Text>
                <Text style={[styles.receiptHeaderSub, { color: theme.textSecondary }]}>
                  Official Digital Fiscal Receipt
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setReceiptModalVisible(false)}
                style={[styles.receiptCloseBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
              >
                <Ionicons name="close" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.receiptBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptLabel, { color: theme.textSecondary }]}>Receipt No:</Text>
                <Text style={[styles.receiptVal, { color: theme.text }]}>#{session.receiptNumber}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptLabel, { color: theme.textSecondary }]}>Location:</Text>
                <Text style={[styles.receiptVal, { color: theme.text }]}>{session.name}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptLabel, { color: theme.textSecondary }]}>Slot:</Text>
                <Text style={[styles.receiptVal, { color: theme.text }]}>
                  {session.zoneCode ? `${session.bayNumber} (${session.zoneCode})` : session.bayNumber}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptLabel, { color: theme.textSecondary }]}>Vehicle:</Text>
                <Text style={[styles.receiptVal, { color: theme.text }]}>{session.plate}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptLabel, { color: theme.textSecondary }]}>Duration:</Text>
                <Text style={[styles.receiptVal, { color: theme.text }]}>{session.duration}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptLabel, { color: theme.textSecondary }]}>Total Paid:</Text>
                <Text style={[styles.receiptVal, { color: theme.text, fontWeight: "500" }]}>
                  {session.cost?.toLocaleString()} {session.currency || "RWF"}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.receiptDoneBtn, { backgroundColor: theme.primaryBtnBg }]}
              onPress={() => setReceiptModalVisible(false)}
            >
              <Text style={[styles.receiptDoneBtnText, { color: theme.primaryBtnText }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  topHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 4 : 8,
    paddingBottom: 8,
  },
  headerNavBtn: {
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
  scrollContent: {
    paddingBottom: 24,
    alignItems: "center",
  },
  dialWrapper: {
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
    borderColor: "#000",
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
    backgroundColor: "#000",
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
  receiptOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  receiptCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  receiptHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  receiptHeaderBrand: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  receiptHeaderSub: {
    fontSize: 11,
    marginTop: 2,
  },
  receiptCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  receiptBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 8,
    marginBottom: 16,
  },
  receiptRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  receiptLabel: {
    fontSize: 12,
  },
  receiptVal: {
    fontSize: 12,
    fontWeight: "500",
  },
  receiptDoneBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  receiptDoneBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
