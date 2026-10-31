import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Rect,
  Circle,
  Path,
  G,
  Text as SvgText,
} from "react-native-svg";
import { supabase } from "../lib/supabase";
import { useTheme } from "../../hooks/useTheme";
import { ActivitiesSkeleton } from "../../components/SkeletonLoader";
import {
  completeParkingSession,
  fetchActiveParkingTicket,
  fetchUserParkingHistory,
  fetchUserVehicles,
  resolveSpaceImageUrl,
  ParkingHistoryRecord,
} from "../services/parking";
import { initiateMobilePayment } from "../services/mobilePayment";

const { width } = Dimensions.get("window");

export interface ActiveSessionData {
  id: string;
  spaceId?: string;
  plate: string;
  entryTime: Date;
  spaceNumber: string;
  locationName: string;
  imageUrl?: string;
  durationHours: number;
  hourlyRate: number;
  receiptNumber?: string;
  violationFine?: number;
  violationReason?: string;
}

/**
 * Modern SVG Illustration: Open History Logbook / Ledger (No Active Session)
 * Displays an open architectural logbook with ruled entry lines and a bookmark ribbon.
 */
const EmptySessionIllustration = ({ isDark }: { isDark: boolean }) => {
  const coverStroke = isDark ? "rgba(255,255,255,0.22)" : "rgba(9,9,11,0.18)";
  const pageStroke = isDark ? "rgba(255,255,255,0.28)" : "rgba(9,9,11,0.22)";
  const ruleColor = isDark ? "rgba(255,255,255,0.28)" : "rgba(9,9,11,0.22)";
  const accentColor = isDark ? "#FFFFFF" : "#09090B";

  return (
    <View style={svgStyles.container}>
      <Svg width={220} height={130} viewBox="0 0 220 130">
        <Defs>
          <LinearGradient id="bookCoverGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={isDark ? "#27272A" : "#D4D4D8"} stopOpacity={0.95} />
            <Stop offset="100%" stopColor={isDark ? "#18181B" : "#A1A1AA"} stopOpacity={0.95} />
          </LinearGradient>
          <LinearGradient id="leftPageGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor={isDark ? "#27272A" : "#FFFFFF"} stopOpacity={1} />
            <Stop offset="100%" stopColor={isDark ? "#1F1F23" : "#F4F4F5"} stopOpacity={1} />
          </LinearGradient>
          <LinearGradient id="rightPageGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor={isDark ? "#1F1F23" : "#F4F4F5"} stopOpacity={1} />
            <Stop offset="100%" stopColor={isDark ? "#27272A" : "#FFFFFF"} stopOpacity={1} />
          </LinearGradient>
          <RadialGradient id="bookHaloGrad" cx="50%" cy="55%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor={accentColor} stopOpacity={0.14} />
            <Stop offset="100%" stopColor={accentColor} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Soft Ambient Halo Behind Logbook */}
        <Circle cx="110" cy="70" r="56" fill="url(#bookHaloGrad)" />

        {/* Hardcover Base Backdrop */}
        <Rect
          x="42"
          y="34"
          width="136"
          height="72"
          rx="8"
          fill="url(#bookCoverGrad)"
          stroke={coverStroke}
          strokeWidth={1.4}
        />

        {/* Open Left Page */}
        <Path
          d="M 110 36 C 92 29 66 29 48 35 L 48 98 C 66 92 92 92 110 99 Z"
          fill="url(#leftPageGrad)"
          stroke={pageStroke}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />

        {/* Open Right Page */}
        <Path
          d="M 110 36 C 128 29 154 29 172 35 L 172 98 C 154 92 128 92 110 99 Z"
          fill="url(#rightPageGrad)"
          stroke={pageStroke}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />

        {/* Center Spine Seam */}
        <Path
          d="M 110 36 L 110 101"
          stroke={pageStroke}
          strokeWidth={1.6}
          strokeLinecap="round"
        />

        {/* Left Page Ruled Log Lines */}
        <Path
          d="M 59 50 Q 79 46 98 51"
          stroke={accentColor}
          strokeWidth={2}
          strokeOpacity={0.55}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M 59 62 Q 79 58 98 63"
          stroke={ruleColor}
          strokeWidth={1.8}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M 59 73 Q 79 69 98 74"
          stroke={ruleColor}
          strokeWidth={1.8}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M 59 84 Q 75 81 88 84"
          stroke={ruleColor}
          strokeWidth={1.8}
          strokeLinecap="round"
          fill="none"
        />

        {/* Right Page Ruled Log Lines */}
        <Path
          d="M 122 51 Q 134 48 144 49"
          stroke={ruleColor}
          strokeWidth={1.8}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M 122 63 Q 141 58 160 62"
          stroke={ruleColor}
          strokeWidth={1.8}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M 122 74 Q 141 69 160 73"
          stroke={ruleColor}
          strokeWidth={1.8}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M 122 84 Q 137 81 151 83"
          stroke={ruleColor}
          strokeWidth={1.8}
          strokeLinecap="round"
          fill="none"
        />

        {/* Bookmark Ribbon on Right Page */}
        <Path
          d="M 150 32 L 150 56 L 155.5 51.5 L 161 56 L 161 33.5 Z"
          fill={accentColor}
          opacity={0.9}
        />

        {/* Subtle Floating Accent Dots */}
        <Circle cx="34" cy="54" r="2" fill={accentColor} opacity={0.35} />
        <Circle cx="186" cy="50" r="2.2" fill={accentColor} opacity={0.3} />
      </Svg>
    </View>
  );
};

const svgStyles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 10,
  },
});

const Activities = () => {
  const theme = useTheme();
  const navigation = useNavigation();

  // Active Session & History Tickets
  const [activeTicket, setActiveTicket] = useState<ActiveSessionData | null>(null);
  const [parkingHistory, setParkingHistory] = useState<ParkingHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTick, setCurrentTick] = useState(Date.now());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"All" | "Active" | "Incomplete" | "Completed" | "Fines">("All");
  const [selectedInvoice, setSelectedInvoice] = useState<ParkingHistoryRecord | null>(null);

  // Hide tab bar when invoice modal is open
  useEffect(() => {
    if (selectedInvoice) {
      navigation.getParent()?.setOptions({ tabBarStyle: { display: "none" } });
    } else {
      navigation.getParent()?.setOptions({ tabBarStyle: undefined });
    }
    return () => {
      navigation.getParent()?.setOptions({ tabBarStyle: undefined });
    };
  }, [selectedInvoice, navigation]);

  // Live timer interval for active session
  useEffect(() => {
    if (!activeTicket) return;
    const interval = setInterval(() => {
      setCurrentTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTicket]);

  // Elapsed seconds calculation
  const elapsedSeconds = useMemo(() => {
    if (!activeTicket) return 0;
    const entryMs = new Date(activeTicket.entryTime).getTime();
    return Math.max(0, Math.floor((currentTick - entryMs) / 1000));
  }, [activeTicket, currentTick]);

  const totalBookedSeconds = useMemo(() => {
    if (!activeTicket) return 3600;
    return Math.max(1, (activeTicket.durationHours || 1) * 3600);
  }, [activeTicket]);

  const isOverdue = elapsedSeconds > totalBookedSeconds;

  // Format seconds to HH:MM:SS
  const formatTimer = (totalSecs: number) => {
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  // Comprehensive Data Sync from database
  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id;

      // 1. Load active ticket directly from database
      const liveTicket = await fetchActiveParkingTicket(uid);
      if (liveTicket) {
        const loc = Array.isArray(liveTicket.parking_locations)
          ? liveTicket.parking_locations[0]
          : liveTicket.parking_locations;
        const sp = Array.isArray(liveTicket.parking_spaces)
          ? liveTicket.parking_spaces[0]
          : liveTicket.parking_spaces;

        const hourlyRate = Number(liveTicket.hourly_rate) || Number(loc?.hourly_rate) || 300;
        const paidOrTotal = Number(liveTicket.total_amount) || hourlyRate;
        const derivedHours = Math.max(1, Math.round(paidOrTotal / hourlyRate));

        setActiveTicket({
          id: liveTicket.id,
          spaceId: liveTicket.space_id || sp?.id,
          plate: liveTicket.vehicle_plate,
          entryTime: new Date(liveTicket.entry_time),
          spaceNumber: sp?.space_number || "-",
          locationName: loc?.name || "Parking Facility",
          imageUrl:
            sp?.image_url?.trim() ||
            loc?.image_url?.trim() ||
            resolveSpaceImageUrl(
              `${loc?.id || loc?.name || "lot"}-${sp?.space_number || liveTicket.id}`,
              sp?.space_type || "regular"
            ),
          durationHours: derivedHours,
          hourlyRate,
          receiptNumber: liveTicket.ticket_number,
        });
      } else {
        setActiveTicket(null);
      }

      // 2. Load combined parking & EV charging history from database
      const dbHistory = await fetchUserParkingHistory(uid);
      const mergedRecords: ParkingHistoryRecord[] = [...(dbHistory as ParkingHistoryRecord[])];

      // 3. Merge any municipal fines issued to user's vehicles from database
      if (uid) {
        const vehicles = await fetchUserVehicles(uid);
        const plates = vehicles.map((v) => v.plate_number).filter(Boolean);
        if (plates.length > 0) {
          const { data: fines } = await supabase
            .from("parking_fines")
            .select(`
              id, fine_number, vehicle_plate, fine_amount, currency, reason,
              payment_status, issued_at,
              parking_locations:location_id (*),
              parking_spaces:space_id (*)
            `)
            .in("vehicle_plate", plates)
            .order("issued_at", { ascending: false })
            .limit(20);

          (fines || []).forEach((f: any) => {
            const loc = Array.isArray(f.parking_locations) ? f.parking_locations[0] : f.parking_locations;
            const sp = Array.isArray(f.parking_spaces) ? f.parking_spaces[0] : f.parking_spaces;
            const fineSpaceImage =
              sp?.image_url?.trim() ||
              loc?.image_url?.trim() ||
              resolveSpaceImageUrl(
                `${loc?.id || loc?.name || "fine"}-${sp?.space_number || f.id}`,
                sp?.space_type || "regular"
              );
            const isPaid = f.payment_status === "paid";
            mergedRecords.push({
              id: f.id,
              name: loc?.name || "Municipal Enforcement",
              address: loc?.address || "",
              bayNumber: sp?.space_number || "-",
              zoneCode: sp?.zone_code || "Zone A",
              plate: f.vehicle_plate,
              date: new Date(f.issued_at).toLocaleDateString([], { month: "short", day: "numeric" }),
              duration: "Citation",
              cost: Number(f.fine_amount) || 0,
              currency: f.currency || "RWF",
              status: isPaid ? "Completed" : "Active",
              isCompleted: isPaid,
              isIncomplete: !isPaid,
              image: fineSpaceImage,
              receiptNumber: f.fine_number,
              entryTimeIso: f.issued_at,
              violationFine: Number(f.fine_amount) || 0,
              violationReason: f.reason || "Municipal citation",
            });
          });
        }
      }

      mergedRecords.sort((a, b) => {
        const timeA = a.entryTimeIso ? new Date(a.entryTimeIso).getTime() : 0;
        const timeB = b.entryTimeIso ? new Date(b.entryTimeIso).getTime() : 0;
        return timeB - timeA;
      });

      setParkingHistory(mergedRecords);
    } catch (err) {
      console.warn("loadData error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Sync whenever user focuses on the screen
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // End active parking session in database
  const handleEndParking = () => {
    if (!activeTicket) return;

    const prepaidHours = activeTicket.durationHours || 1;
    const elapsedHours = Math.max(1, Math.ceil(elapsedSeconds / 3600));
    const extraHours = Math.max(0, elapsedHours - prepaidHours);
    const overdueCost = extraHours * (activeTicket.hourlyRate || 300);

    if (overdueCost === 0) {
      Alert.alert(
        "Close Booking",
        `Spot: ${activeTicket.spaceNumber} (${activeTicket.locationName})\nElapsed Time: ${formatTimer(elapsedSeconds)}\nBooked Duration: ${prepaidHours} Hour(s)\nTotal Extra Due: 0 RWF`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Close Booking",
            onPress: async () => {
              try {
                const totalAmount = prepaidHours * (activeTicket.hourlyRate || 300);
                await completeParkingSession({
                  ticketId: activeTicket.id,
                  spaceId: activeTicket.spaceId,
                  paymentMethod: "wallet",
                  amount: totalAmount,
                });
                await AsyncStorage.removeItem("@parkzone_active_ticket").catch(() => {});
                setActiveTicket(null);
                await loadData();
                Alert.alert("Booking Closed", "Parking session finished and synced to database.");
              } catch {}
            },
          },
        ]
      );
    } else {
      router.push({
        pathname: "/transaction_details",
        params: {
          id: activeTicket.id,
          spaceId: activeTicket.spaceId || "",
          name: activeTicket.locationName,
          bayNumber: activeTicket.spaceNumber,
          plate: activeTicket.plate,
          duration: `${elapsedHours} Hours (${extraHours}h Overdue)`,
          durationHours: elapsedHours.toString(),
          cost: overdueCost.toString(),
          currency: "RWF",
          receiptNumber: activeTicket.receiptNumber || activeTicket.id.slice(0, 8),
          entryTime: activeTicket.entryTime.toISOString(),
          violationFine: "",
          violationReason: `Overtime (+${extraHours}h)`,
          isOverdue: "true",
          overdueCost: overdueCost.toString(),
          prepaidHours: prepaidHours.toString(),
        },
      });
    }
  };

  const handleExtendTime = async () => {
    if (!activeTicket) return;
    const addedRate = activeTicket.hourlyRate || 300;
    const newHours = (activeTicket.durationHours || 1) + 1;
    const newTotal = newHours * addedRate;

    // Trigger mobile payment dial code in background for extension
    initiateMobilePayment(addedRate).catch(() => {});

    await supabase
      .from("parking_tickets")
      .update({ total_amount: newTotal, hours_elapsed: newHours })
      .eq("id", activeTicket.id);
    setActiveTicket({
      ...activeTicket,
      durationHours: newHours,
    });
    Alert.alert(
      "Parking Extended",
      `Added +1 hour to your parking session (+${addedRate.toLocaleString()} RWF).\nPayment initiated in the background.`
    );
  };

  // Filtered recent parking history
  const filteredHistory = useMemo(() => {
    return parkingHistory.filter((item) => {
      // Filter tab check (supporting completed and incomplete sessions)
      if (activeFilter === "Active" && item.status !== "Active") {
        return false;
      }
      if (activeFilter === "Completed" && item.status !== "Completed") {
        return false;
      }
      if (activeFilter === "Incomplete" && (item.status === "Completed" || item.isCompleted)) {
        return false;
      }
      if (activeFilter === "Fines" && !item.violationFine) {
        return false;
      }

      // Search query check
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesAddr = item.address.toLowerCase().includes(q);
        const matchesBay = item.bayNumber.toLowerCase().includes(q);
        const matchesPlate = item.plate.toLowerCase().includes(q);
        const matchesReceipt = item.receiptNumber.toLowerCase().includes(q);
        if (!matchesName && !matchesAddr && !matchesBay && !matchesPlate && !matchesReceipt) {
          return false;
        }
      }

      return true;
    });
  }, [parkingHistory, activeFilter, searchQuery]);

  // Render top active session or empty SVG state
  const renderActiveCard = () => {
    if (!activeTicket) {
      return (
        <View
          style={[
            styles.idleSessionCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: theme.cardShadow,
            },
          ]}
        >
          {/* Custom Modern SVG Illustration (NO 00:00:00 counter!) */}
          <EmptySessionIllustration isDark={theme.isDark} />

          <Text style={[styles.idleTitle, { color: theme.text }]}>
            No Active Parking Session
          </Text>
          <Text style={[styles.idleSubtitle, { color: theme.textSecondary }]}>
            Your vehicle is not checked into any bay. Explore available lots or scan a space QR
            code to activate live telemetry.
          </Text>

          <View style={styles.idleActionsRow}>
            <TouchableOpacity
              style={[styles.idlePrimaryBtn, { backgroundColor: theme.primaryBtnBg }]}
              onPress={() => router.push("/(tabs)/home")}
              activeOpacity={0.85}
            >
              <Ionicons name="compass-outline" size={16} color={theme.primaryBtnText} />
              <Text style={[styles.idlePrimaryBtnText, { color: theme.primaryBtnText }]}>
                Explore Parking Lots
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.idleSecondaryBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
              onPress={() => router.push("/(tabs)/home")}
              activeOpacity={0.8}
            >
              <Ionicons name="qr-code-outline" size={15} color={theme.text} />
              <Text style={[styles.idleSecondaryBtnText, { color: theme.text }]}>Scan Bay QR</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // Active Ticket Live Telemetry View
    const billedHours = Math.max(1, Math.ceil(elapsedSeconds / 3600));
    const baseCost = billedHours * (activeTicket.hourlyRate || 300);
    const fine = activeTicket.violationFine || 0;
    const totalCost = baseCost + fine;

    const remSecs = Math.max(0, totalBookedSeconds - elapsedSeconds);
    const cardProgress = Math.min(1.0, Math.max(0.06, elapsedSeconds / totalBookedSeconds));
    const cardSvgSize = 190;
    const cardStroke = 14;
    const cardRadius = (cardSvgSize - cardStroke * 2) / 2;
    const cardCircumference = 2 * Math.PI * cardRadius;
    const cardDashoffset = cardCircumference * (1 - cardProgress);

    const arriveStr = new Date(activeTicket.entryTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const exitMs = new Date(activeTicket.entryTime).getTime() + totalBookedSeconds * 1000;
    const exitStr = new Date(exitMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    return (
      <View
        style={[
          styles.activeSessionCard,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            shadowColor: theme.cardShadow,
          },
        ]}
      >
        {/* Header Badge */}
        <View style={styles.activeCardHeader}>
          <Text style={[styles.activeCardTitleText, { color: theme.text }]}>Parking Session</Text>
          <View style={[styles.liveIndicatorRow, { backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.border }]}>
            <View style={[styles.livePulsingDot, { backgroundColor: theme.accent }]} />
            <Text style={[styles.liveBadgeText, { color: theme.text }]}>LIVE</Text>
          </View>
        </View>

        {/* Circular Progress Dial with Vertical Car in Center */}
        <View style={styles.activeDialWrapper}>
          <View style={[styles.activeSvgContainer, { width: cardSvgSize, height: cardSvgSize }]}>
            <Svg width={cardSvgSize} height={cardSvgSize} viewBox={`0 0 ${cardSvgSize} ${cardSvgSize}`}>
              <Circle
                cx={cardSvgSize / 2}
                cy={cardSvgSize / 2}
                r={cardRadius}
                stroke={theme.pillInactiveBg}
                strokeWidth={cardStroke}
                fill="none"
              />
              <Circle
                cx={cardSvgSize / 2}
                cy={cardSvgSize / 2}
                r={cardRadius}
                stroke={isOverdue ? theme.danger : theme.accent}
                strokeWidth={cardStroke}
                strokeDasharray={cardCircumference}
                strokeDashoffset={cardDashoffset}
                strokeLinecap="round"
                fill="none"
                transform={`translate(${cardSvgSize}, 0) scale(-1, 1) rotate(-90 ${cardSvgSize / 2} ${cardSvgSize / 2})`}
              />
              <Circle
                cx={cardSvgSize / 2}
                cy={cardSvgSize / 2 - cardRadius}
                r={cardStroke / 2 - 1}
                fill={isOverdue ? theme.danger : theme.accent}
                stroke={theme.surface}
                strokeWidth={2.5}
              />
            </Svg>
          </View>

          {/* Large Bold Digital Timer */}
          <Text style={[styles.activeTimerDigitsBold, { color: theme.text }]}>
            {isOverdue ? `+${formatTimer(elapsedSeconds - totalBookedSeconds)}` : formatTimer(remSecs)}
          </Text>
          <Text style={[styles.activeTimerSubLabel, { color: theme.textSecondary }]}>Remaining Parking Time</Text>
        </View>

        {/* Slot Detail Box */}
        <View style={[styles.activeSlotInnerCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
            {activeTicket.imageUrl ? (
              <Image
                source={{ uri: activeTicket.imageUrl }}
                style={{ width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: theme.border }}
              />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={[styles.activeSlotTitleText, { color: theme.text, marginBottom: 2 }]}>
                Slot {activeTicket.spaceNumber}
              </Text>
              <Text style={{ fontSize: 11.5, color: theme.textSecondary, fontWeight: "400" }} numberOfLines={1}>
                {activeTicket.locationName}
              </Text>
            </View>
          </View>

          <View style={styles.activeTimelineRow}>
            <View style={{ minWidth: 65 }}>
              <Text style={[styles.activeTimelineLabel, { color: theme.textSecondary }]}>Arrive after</Text>
              <Text style={[styles.activeTimelineTime, { color: theme.text }]}>{arriveStr}</Text>
            </View>

            <View style={styles.activeTimelineCenter}>
              <View style={[styles.activeTimelineLine, { backgroundColor: theme.border }]} />
              <View style={[styles.activeTimelinePill, { borderColor: theme.accent, backgroundColor: theme.surface }]}>
                <Text style={[styles.activeTimelinePillText, { color: theme.text }]}>{activeTicket.durationHours} Hours</Text>
              </View>
              <View style={[styles.activeTimelineLine, { backgroundColor: theme.border }]} />
            </View>

            <View style={{ minWidth: 65, alignItems: "flex-end" }}>
              <Text style={[styles.activeTimelineLabel, { color: theme.textSecondary }]}>Exit before</Text>
              <Text style={[styles.activeTimelineTime, { color: theme.text }]}>{exitStr}</Text>
            </View>
          </View>

          {/* Municipal Violation Fine Warning Badge (if applicable) */}
          {activeTicket.violationFine ? (
            <View style={styles.activeViolationFineBanner}>
              <Ionicons name="warning" size={15} color={theme.danger} />
              <View style={{ flex: 1 }}>
                <Text style={styles.activeViolationFineTitle}>
                  +{activeTicket.violationFine.toLocaleString()} RWF Fine Applied
                </Text>
                <Text style={styles.activeViolationFineSub}>
                  {activeTicket.violationReason || "Restricted bay violation"}
                </Text>
              </View>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.activeFindVehicleBtn, { borderColor: theme.accent, backgroundColor: theme.surface }]}
            onPress={() => {
              Alert.alert(
                "Find My Vehicle",
                `Your vehicle (${activeTicket.plate}) is parked in Slot ${activeTicket.spaceNumber} at ${activeTicket.locationName}.`,
                [{ text: "OK" }]
              );
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="location-outline" size={16} color={theme.text} />
            <Text style={[styles.activeFindVehicleBtnText, { color: theme.text }]}>Find My Vehicle</Text>
          </TouchableOpacity>
        </View>

        {/* Action Buttons Row: Extend Time & End Parking */}
        <View style={styles.activeActionsRow}>
          <TouchableOpacity
            style={[styles.activeExtendBtn, { backgroundColor: theme.primaryBtnBg }]}
            onPress={handleExtendTime}
            activeOpacity={0.85}
          >
            <Text style={[styles.activeExtendBtnText, { color: theme.primaryBtnText }]}>Extend Time</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.activeEndBtn, { backgroundColor: theme.danger }]}
            onPress={handleEndParking}
            activeOpacity={0.85}
          >
            <Text style={styles.activeEndBtnText}>
              {isOverdue ? "Pay Overdue & Close" : "Close Booking"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Render recent parking record item
  const renderHistoryItem = ({ item }: { item: ParkingHistoryRecord }) => {
    const isCompleted = item.status === "Completed" || item.status === "Closed";
    const hasFine = Boolean(item.violationFine);
    const isEvSession = Boolean(
      item.zoneCode?.toLowerCase().includes("ev") ||
      item.duration?.toLowerCase().includes("charging") ||
      item.name?.toLowerCase().includes("ev")
    );

    return (
      <TouchableOpacity
        style={[
          styles.historyCard,
          {
            backgroundColor: theme.surface,
            borderColor: isEvSession ? theme.evGreenBorder : theme.border,
            shadowColor: theme.cardShadow,
          },
        ]}
        onPress={() => {
          router.push({
            pathname: "/parking_session",
            params: {
              id: item.id,
              name: item.name,
              address: item.address,
              bayNumber: item.bayNumber,
              zoneCode: item.zoneCode,
              plate: item.plate,
              date: item.date,
              duration: item.duration,
              cost: item.cost.toString(),
              currency: item.currency,
              status: item.status,
              receiptNumber: item.receiptNumber,
              violationFine: item.violationFine ? item.violationFine.toString() : "",
              violationReason: item.violationReason || "",
            },
          });
        }}
        activeOpacity={0.85}
      >
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.historyThumbImg} />
        ) : (
          <View style={[styles.historyThumbImg, { backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="car-sport-outline" size={22} color={theme.textSecondary} />
          </View>
        )}

        <View style={styles.historyCardCenter}>
          <View style={styles.historyTitleRow}>
            <Text style={[styles.historyLocationName, { color: theme.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            <View
              style={[
                styles.historyStatusPill,
                {
                  backgroundColor: isEvSession
                    ? theme.evGreenSoft
                    : isCompleted
                      ? theme.pillInactiveBg
                      : theme.pillActiveBg,
                  borderWidth: isEvSession ? 1 : 0,
                  borderColor: isEvSession ? theme.evGreenBorder : "transparent",
                },
              ]}
            >
              <Text
                style={[
                  styles.historyStatusPillText,
                  {
                    color: isEvSession
                      ? theme.evGreen
                      : isCompleted
                        ? theme.textSecondary
                        : theme.pillActiveText,
                  },
                ]}
              >
                {item.status}
              </Text>
            </View>
          </View>

          <Text style={[styles.historyAddressText, { color: theme.textSecondary }]} numberOfLines={1}>
            {item.address}
          </Text>

          {/* Bay and Plate Badges */}
          <View style={styles.historyBadgesRow}>
            <View style={[styles.historyBayBadge, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Ionicons name="car-outline" size={10} color={theme.text} />
              <Text style={[styles.historyBayBadgeText, { color: theme.text }]}>
                Bay {item.bayNumber}
              </Text>
            </View>

            <View style={[styles.historyBayBadge, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Text style={[styles.historyBayBadgeText, { color: theme.textSecondary }]}>
                {item.plate}
              </Text>
            </View>

            <Text style={[styles.historyDateText, { color: theme.textSecondary }]}>
              {item.date} • {item.duration}
            </Text>
          </View>

          {/* Municipal Violation Fine Badge (if recorded) */}
          {hasFine && (
            <View style={styles.historyFineBadge}>
              <Ionicons name="warning" size={11} color="#EF4444" />
              <Text style={styles.historyFineBadgeText}>
                +{item.violationFine?.toLocaleString()} RWF Fine ({item.violationReason})
              </Text>
            </View>
          )}
        </View>

        <View style={styles.historyCardRight}>
          <Text style={[styles.historyCostText, { color: theme.text }]}>
            {item.cost.toLocaleString()} {item.currency}
          </Text>
          <TouchableOpacity
            onPress={() => setSelectedInvoice(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.receiptBtnText, { color: theme.textSecondary }]}>
              Receipt ›
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      {/* Top App Bar Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.headerNavBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => router.push("/(tabs)/home")}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={18} color={theme.text} />
        </TouchableOpacity>

        <View style={styles.headerTitleCenter}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Parking History</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            Active telemetry & recent receipts
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.headerNavBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={onRefresh}
          activeOpacity={0.7}
        >
          <Ionicons name="reload-outline" size={17} color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* Filter and Search Bar */}
      <View style={styles.searchFilterWrapper}>
        <View style={[styles.searchBarBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="search-outline" size={16} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search by location, bay, plate, receipt..."
            placeholderTextColor={theme.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Pills Row */}
        <View style={styles.filterPillsRow}>
          {(["All", "Active", "Incomplete", "Completed", "Fines"] as const).map((cat) => {
            const isSelected = activeFilter === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: isSelected ? theme.pillActiveBg : theme.surface,
                    borderColor: isSelected ? theme.pillActiveBg : theme.border,
                  },
                ]}
                onPress={() => setActiveFilter(cat)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    { color: isSelected ? theme.pillActiveText : theme.textSecondary },
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Main List */}
      {loading && !refreshing ? (
        <ActivitiesSkeleton />
      ) : (
        <FlatList
          data={filteredHistory}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View>
              {renderActiveCard()}
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Parking Sessions</Text>
                <Text style={[styles.historyCountText, { color: theme.textSecondary }]}>
                  {filteredHistory.length} {filteredHistory.length === 1 ? "record" : "records"}
                </Text>
              </View>
            </View>
          }
          renderItem={renderHistoryItem}
          ListEmptyComponent={
            <View style={[styles.emptyBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: theme.isDark ? "rgba(255,255,255,0.06)" : "rgba(9,9,11,0.04)",
                  borderWidth: 1,
                  borderColor: theme.border,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 10,
                }}
              >
                <Ionicons name="book-outline" size={26} color={theme.text} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No parking sessions found</Text>
              <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
                {searchQuery
                  ? `No records matching "${searchQuery}".`
                  : "Completed parking stays and municipal receipts will appear in your history logbook."}
              </Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.text}
              colors={[theme.text]}
            />
          }
        />
      )}

      {/* Itemized Digital Invoice Receipt Modal */}
      <Modal
        visible={!!selectedInvoice}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedInvoice(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {/* Header */}
            <View style={styles.invoiceHeaderRow}>
              <View>
                <Text style={[styles.invoiceHeaderBrand, { color: theme.text }]}>PARKZONE RWANDA</Text>
                <Text style={[styles.invoiceHeaderSub, { color: theme.textSecondary }]}>
                  Official Digital Fiscal Receipt
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedInvoice(null)}
                style={[styles.invoiceCloseBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>

            {selectedInvoice && (
              <View style={styles.invoiceContent}>
                {/* Receipt Details Box */}
                <View style={[styles.invoiceMetaCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <View style={styles.invoiceRow}>
                    <Text style={[styles.invoiceLabel, { color: theme.textSecondary }]}>Receipt No:</Text>
                    <Text style={[styles.invoiceValue, { color: theme.text }]}>#{selectedInvoice.receiptNumber}</Text>
                  </View>
                  <View style={styles.invoiceRow}>
                    <Text style={[styles.invoiceLabel, { color: theme.textSecondary }]}>Location:</Text>
                    <Text style={[styles.invoiceValue, { color: theme.text }]}>{selectedInvoice.name}</Text>
                  </View>
                  <View style={styles.invoiceRow}>
                    <Text style={[styles.invoiceLabel, { color: theme.textSecondary }]}>Bay & Zone:</Text>
                    <Text style={[styles.invoiceValue, { color: theme.text }]}>
                      Bay {selectedInvoice.bayNumber} ({selectedInvoice.zoneCode})
                    </Text>
                  </View>
                  <View style={styles.invoiceRow}>
                    <Text style={[styles.invoiceLabel, { color: theme.textSecondary }]}>Vehicle Plate:</Text>
                    <Text style={[styles.invoiceValue, { color: theme.text }]}>{selectedInvoice.plate}</Text>
                  </View>
                  <View style={styles.invoiceRow}>
                    <Text style={[styles.invoiceLabel, { color: theme.textSecondary }]}>Date & Time:</Text>
                    <Text style={[styles.invoiceValue, { color: theme.text }]}>{selectedInvoice.date}</Text>
                  </View>
                  <View style={styles.invoiceRow}>
                    <Text style={[styles.invoiceLabel, { color: theme.textSecondary }]}>Duration:</Text>
                    <Text style={[styles.invoiceValue, { color: theme.text }]}>{selectedInvoice.duration}</Text>
                  </View>
                </View>

                {/* Charges Itemization */}
                <View style={styles.chargesSection}>
                  <View style={styles.invoiceRow}>
                    <Text style={[styles.invoiceLabel, { color: theme.textSecondary }]}>Base Parking Tariff:</Text>
                    <Text style={[styles.invoiceValue, { color: theme.text }]}>
                      {(selectedInvoice.cost - (selectedInvoice.violationFine || 0)).toLocaleString()} RWF
                    </Text>
                  </View>

                  {selectedInvoice.violationFine ? (
                    <View style={styles.invoiceRow}>
                      <Text style={[styles.invoiceLabel, { color: "#EF4444" }]}>
                        Contravention Fine ({selectedInvoice.violationReason}):
                      </Text>
                      <Text style={[styles.invoiceValue, { color: "#EF4444", fontWeight: "500" }]}>
                        +{selectedInvoice.violationFine.toLocaleString()} RWF
                      </Text>
                    </View>
                  ) : null}

                  <View style={[styles.invoiceDivider, { backgroundColor: theme.border }]} />

                  <View style={styles.invoiceRow}>
                    <Text style={[styles.invoiceTotalLabel, { color: theme.text }]}>TOTAL SETTLED:</Text>
                    <Text style={[styles.invoiceTotalValue, { color: theme.text }]}>
                      {selectedInvoice.cost.toLocaleString()} {selectedInvoice.currency}
                    </Text>
                  </View>
                </View>

                {/* Fiscal Verified Badge */}
                <View style={[styles.fiscalVerifiedBadge, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Ionicons name="shield-checkmark" size={16} color={theme.text} />
                  <Text style={[styles.fiscalVerifiedText, { color: theme.textSecondary }]}>
                    RRA Electronic Billing Machine (EBM) Verified • Authorized by City of Kigali
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.invoiceDoneBtn, { backgroundColor: theme.primaryBtnBg }]}
                  onPress={() => setSelectedInvoice(null)}
                  activeOpacity={0.88}
                >
                  <Text style={[styles.invoiceDoneBtnText, { color: theme.primaryBtnText }]}>
                    Close Receipt
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default Activities;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  headerNavBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: "400",
    marginTop: 2,
  },
  searchFilterWrapper: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  searchBarBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "400",
    height: "100%",
  },
  filterPillsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: "500",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  // Idle Session Card (SVG graphic, no 00:00:00 counter)
  idleSessionCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  idleTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 6,
    textAlign: "center",
  },
  idleSubtitle: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 6,
    paddingHorizontal: 16,
  },
  idleActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    width: "100%",
  },
  idlePrimaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    paddingVertical: 12,
  },
  idlePrimaryBtnText: {
    fontSize: 12,
    fontWeight: "500",
  },
  idleSecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
  },
  idleSecondaryBtnText: {
    fontSize: 12,
    fontWeight: "500",
  },
  // Active Session Card
  activeSessionCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    marginBottom: 20,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 3,
  },
  activeCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  activeCardTitleText: {
    fontSize: 17,
    fontWeight: "600",
  },
  liveIndicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  livePulsingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  activeDialWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    marginBottom: 12,
  },
  activeSvgContainer: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  activeCarCenterPosition: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  activeTimerDigitsBold: {
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
    marginTop: 12,
  },
  activeTimerSubLabel: {
    fontSize: 13,
    fontWeight: "400",
    marginTop: 4,
  },
  activeSlotInnerCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  activeSlotTitleText: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  activeTimelineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  activeTimelineLabel: {
    fontSize: 11,
    fontWeight: "400",
    marginBottom: 3,
  },
  activeTimelineTime: {
    fontSize: 13.5,
    fontWeight: "600",
  },
  activeTimelineCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  activeTimelineLine: {
    flex: 1,
    height: 1,
  },
  activeTimelinePill: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginHorizontal: 4,
  },
  activeTimelinePillText: {
    fontSize: 10.5,
    fontWeight: "500",
  },
  activeViolationFineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.25)",
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
  },
  activeViolationFineTitle: {
    color: "#EF4444",
    fontSize: 11,
    fontWeight: "500",
  },
  activeViolationFineSub: {
    color: "#F87171",
    fontSize: 10,
    marginTop: 1,
  },
  activeFindVehicleBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: "#000",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingVertical: 10,
  },
  activeFindVehicleBtnText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#000",
  },
  activeActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  activeExtendBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    borderRadius: 22,
    paddingVertical: 13,
  },
  activeExtendBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  activeEndBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF4444",
    borderRadius: 22,
    paddingVertical: 13,
  },
  activeEndBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  // Section Header
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  historyCountText: {
    fontSize: 11,
    fontWeight: "500",
  },
  // History Item Card
  historyCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  historyThumbImg: {
    width: 58,
    height: 58,
    borderRadius: 12,
    marginRight: 12,
  },
  historyCardCenter: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  historyTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  historyLocationName: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  historyStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  historyStatusPillText: {
    fontSize: 9,
    fontWeight: "500",
  },
  historyAddressText: {
    fontSize: 11,
    marginTop: 2,
  },
  historyBadgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 5,
    flexWrap: "wrap",
  },
  historyBayBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  historyBayBadgeText: {
    fontSize: 9,
    fontWeight: "500",
  },
  historyDateText: {
    fontSize: 10,
    fontWeight: "400",
  },
  historyFineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  historyFineBadgeText: {
    color: "#EF4444",
    fontSize: 9,
    fontWeight: "500",
  },
  historyCardRight: {
    alignItems: "flex-end",
  },
  historyCostText: {
    fontSize: 13,
    fontWeight: "600",
  },
  receiptBtnText: {
    fontSize: 10,
    fontWeight: "500",
    marginTop: 4,
  },
  emptyBox: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 36,
    minHeight: Dimensions.get("window").height * 0.52,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  emptySub: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },
  // Invoice Receipt Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  invoiceHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  invoiceHeaderBrand: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
  invoiceHeaderSub: {
    fontSize: 11,
    marginTop: 2,
  },
  invoiceCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  invoiceContent: {
    gap: 12,
  },
  invoiceMetaCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  invoiceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  invoiceLabel: {
    fontSize: 11,
    fontWeight: "400",
  },
  invoiceValue: {
    fontSize: 11,
    fontWeight: "500",
  },
  chargesSection: {
    gap: 8,
    marginTop: 4,
  },
  invoiceDivider: {
    height: 1,
    marginVertical: 4,
  },
  invoiceTotalLabel: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  invoiceTotalValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  fiscalVerifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginVertical: 4,
  },
  fiscalVerifiedText: {
    fontSize: 10,
    fontWeight: "400",
    flex: 1,
    lineHeight: 14,
  },
  invoiceDoneBtn: {
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
  invoiceDoneBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
});