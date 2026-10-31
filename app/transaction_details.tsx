import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useTheme } from "../hooks/useTheme";
import { supabase } from "./lib/supabase";
import {
  completeParkingSession,
  fetchActiveParkingTicket,
  fetchUserPaymentMethods,
  fetchWalletBalance,
  updateWalletBalance,
} from "./services/parking";
import { initiateMobilePayment } from "./services/mobilePayment";

const { width } = Dimensions.get("window");

interface PaymentMethodOption {
  id: string;
  methodType: "momo" | "airtel" | "card" | "wallet";
  name: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  isDefault?: boolean;
}

interface LiveTransactionState {
  id: string;
  sourceTable: "parking_tickets" | "ev_charging_sessions" | "parking_fines" | "local";
  spaceId?: string;
  name: string;
  address: string;
  bayNumber: string;
  zoneCode: string;
  plate: string;
  date: string;
  duration: string;
  durationHours: number;
  cost: number;
  currency: string;
  receiptNumber: string;
  entryTime: string;
  exitTime?: string;
  status: "active" | "completed" | "overdue" | "cancelled";
  paymentStatus: "paid" | "unpaid" | "pending";
  violationFine: number;
  violationReason: string;
  isOverdue: boolean;
  isPostpaidEv: boolean;
  isEv: boolean;
}

export default function TransactionDetailsScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams();

  // Initial fallback parsed from route parameters
  const initialData: LiveTransactionState = useMemo(() => {
    const rawCost = params.cost ? Number(params.cost) : 0;
    const rawFine = params.violationFine ? Number(params.violationFine) : 0;
    const rawHours = params.durationHours ? Number(params.durationHours) : 1;
    const isOverdueParam = params.isOverdue === "true";
    const isPostpaidEvParam = params.isPostpaidEv === "true";

    const bay = (params.bayNumber as string) || "-";
    const nameStr = (params.name as string) || "Parking Facility";
    const zone = (params.zoneCode as string) || "";
    const isEvBay =
      bay.toLowerCase().includes("ev") ||
      nameStr.toLowerCase().includes("ev") ||
      zone.toLowerCase().includes("ev") ||
      isPostpaidEvParam;

    return {
      id: (params.id as string) || "",
      sourceTable: "local",
      spaceId: (params.spaceId as string) || undefined,
      name: nameStr,
      address: (params.address as string) || "",
      bayNumber: bay,
      zoneCode: zone,
      plate: (params.plate as string) || "",
      date: (params.date as string) || new Date().toLocaleDateString(),
      duration: (params.duration as string) || "1 Hour",
      durationHours: isNaN(rawHours) ? 1 : rawHours,
      cost: isNaN(rawCost) ? 0 : rawCost,
      currency: (params.currency as string) || "RWF",
      receiptNumber: (params.receiptNumber as string) || "-",
      entryTime: (params.entryTime as string) || new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      exitTime: undefined,
      status: isOverdueParam ? "overdue" : "completed",
      paymentStatus: isOverdueParam || isPostpaidEvParam ? "unpaid" : "paid",
      violationFine: isNaN(rawFine) ? 0 : rawFine,
      violationReason: (params.violationReason as string) || "",
      isOverdue: isOverdueParam,
      isPostpaidEv: isPostpaidEvParam,
      isEv: isEvBay,
    };
  }, [params]);

  const [transaction, setTransaction] = useState<LiveTransactionState>(initialData);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Live Wallet Balance
  const [walletBalance, setWalletBalance] = useState<number>(0);

  // Voucher state
  const [voucherModalVisible, setVoucherModalVisible] = useState(false);
  const [voucherInput, setVoucherInput] = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState<{ code: string; discountPercent: number } | null>(null);

  // Paying loading state
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Real-time Database Loader
  const loadRealtimeTransaction = useCallback(
    async (targetId?: string) => {
      const searchId = targetId || transaction.id || (params.id as string);
      let foundRecord: LiveTransactionState | null = null;

      try {
        if (searchId) {
          // 1. Query parking_tickets
          const { data: ticket } = await supabase
            .from("parking_tickets")
            .select(`
              *,
              parking_locations:location_id (*),
              parking_spaces:space_id (*)
            `)
            .or(`id.eq.${searchId},ticket_number.eq.${searchId}`)
            .maybeSingle();

          if (ticket) {
            const loc = Array.isArray(ticket.parking_locations)
              ? ticket.parking_locations[0]
              : ticket.parking_locations;
            const sp = Array.isArray(ticket.parking_spaces)
              ? ticket.parking_spaces[0]
              : ticket.parking_spaces;
            const entryDate = new Date(ticket.entry_time);
            const exitDate = ticket.exit_time ? new Date(ticket.exit_time) : new Date();
            const diffMins = Math.max(1, Math.round((exitDate.getTime() - entryDate.getTime()) / 60000));
            const bookedHours = ticket.hours_elapsed || 1;
            const elapsedHours = diffMins / 60;
            const isOverdue = ticket.status === "overdue" || elapsedHours > bookedHours;

            foundRecord = {
              id: ticket.id,
              sourceTable: "parking_tickets",
              spaceId: ticket.space_id,
              name: loc?.name || "Parking Facility",
              address: loc?.address || `${sp?.zone_code || "Zone A"} • Level 1`,
              bayNumber: sp?.space_number || "-",
              zoneCode: sp?.zone_code || loc?.zone_code || "Zone A",
              plate: ticket.vehicle_plate || "",
              date: entryDate.toLocaleDateString(),
              duration: `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`,
              durationHours: Math.max(1, Math.ceil(diffMins / 60)),
              cost: Number(ticket.total_amount) || 0,
              currency: "RWF",
              receiptNumber: ticket.ticket_number || ticket.id.slice(0, 8),
              entryTime: ticket.entry_time,
              exitTime: ticket.exit_time,
              status: ticket.status || "active",
              paymentStatus: ticket.payment_status || "paid",
              violationFine: 0,
              violationReason: isOverdue ? "Overtime overstay" : "",
              isOverdue,
              isPostpaidEv: false,
              isEv: false,
            };
          }

          // 2. Query ev_charging_sessions if not found
          if (!foundRecord) {
            const { data: evSession } = await supabase
              .from("ev_charging_sessions")
              .select(`
                *,
                parking_locations:location_id (*)
              `)
              .or(`id.eq.${searchId},session_number.eq.${searchId}`)
              .maybeSingle();

            if (evSession) {
              const loc = Array.isArray(evSession.parking_locations)
                ? evSession.parking_locations[0]
                : evSession.parking_locations;
              const startedDate = new Date(evSession.started_at);
              const billedMins = Math.max(1, Math.round((evSession.elapsed_seconds || 0) / 60));
              const isPaid = evSession.status === "completed" || evSession.payment_status === "paid";

              foundRecord = {
                id: evSession.id,
                sourceTable: "ev_charging_sessions",
                name: loc?.name || "EV Charging Station",
                address: `EV Charging Bay • ${evSession.bay_number || "Bay"}`,
                bayNumber: evSession.bay_number || "EV-1",
                zoneCode: "EV Fast Hub",
                plate: evSession.vehicle_plate || "",
                date: startedDate.toLocaleDateString(),
                duration: `${billedMins} Mins Charging`,
                durationHours: Number((billedMins / 60).toFixed(1)),
                cost: Number(evSession.charging_amount_rwf) || 9000,
                currency: "RWF",
                receiptNumber: evSession.session_number || `EV-${evSession.id.slice(0, 6)}`,
                entryTime: evSession.started_at,
                exitTime: evSession.completed_at,
                status: evSession.status || "active",
                paymentStatus: isPaid ? "paid" : "unpaid",
                violationFine: 0,
                violationReason: "EV Charging Session (0 RWF Parking Tariff)",
                isOverdue: false,
                isPostpaidEv: !isPaid,
                isEv: true,
              };
            }
          }

          // 3. Query parking_fines if not found
          if (!foundRecord) {
            const { data: fine } = await supabase
              .from("parking_fines")
              .select(`
                *,
                parking_locations:location_id (*),
                parking_spaces:space_id (*)
              `)
              .or(`id.eq.${searchId},fine_number.eq.${searchId}`)
              .maybeSingle();

            if (fine) {
              const loc = Array.isArray(fine.parking_locations)
                ? fine.parking_locations[0]
                : fine.parking_locations;
              const sp = Array.isArray(fine.parking_spaces)
                ? fine.parking_spaces[0]
                : fine.parking_spaces;
              const issuedDate = new Date(fine.issued_at);
              const isPaid = fine.payment_status === "paid";

              foundRecord = {
                id: fine.id,
                sourceTable: "parking_fines",
                spaceId: fine.space_id,
                name: loc?.name || "Municipal Enforcement",
                address: loc?.address || "Kigali Municipal Parking",
                bayNumber: sp?.space_number || "-",
                zoneCode: sp?.zone_code || "Zone A",
                plate: fine.vehicle_plate || "",
                date: issuedDate.toLocaleDateString(),
                duration: "Citation",
                durationHours: 1,
                cost: 0,
                currency: fine.currency || "RWF",
                receiptNumber: fine.fine_number || `FN-${fine.id.slice(0, 6)}`,
                entryTime: fine.issued_at,
                status: isPaid ? "completed" : "overdue",
                paymentStatus: fine.payment_status,
                violationFine: Number(fine.fine_amount) || 3000,
                violationReason: fine.reason || "Municipal Citation",
                isOverdue: !isPaid,
                isPostpaidEv: false,
                isEv: false,
              };
            }
          }
        }

        // 4. Fallback if no specific searchId: fetch active ticket for current user
        if (!foundRecord && !searchId) {
          const activeTicket = await fetchActiveParkingTicket();
          if (activeTicket) {
            const loc = Array.isArray(activeTicket.parking_locations)
              ? activeTicket.parking_locations[0]
              : activeTicket.parking_locations;
            const sp = Array.isArray(activeTicket.parking_spaces)
              ? activeTicket.parking_spaces[0]
              : activeTicket.parking_spaces;
            const entryDate = new Date(activeTicket.entry_time);
            const now = new Date();
            const diffMins = Math.max(1, Math.round((now.getTime() - entryDate.getTime()) / 60000));

            foundRecord = {
              id: activeTicket.id,
              sourceTable: "parking_tickets",
              spaceId: activeTicket.space_id,
              name: loc?.name || "Parking Facility",
              address: loc?.address || `${sp?.zone_code || "Zone A"} • Level 1`,
              bayNumber: sp?.space_number || "-",
              zoneCode: sp?.zone_code || loc?.zone_code || "Zone A",
              plate: activeTicket.vehicle_plate || "",
              date: entryDate.toLocaleDateString(),
              duration: `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`,
              durationHours: Math.max(1, Math.ceil(diffMins / 60)),
              cost: Number(activeTicket.total_amount) || 0,
              currency: "RWF",
              receiptNumber: activeTicket.ticket_number || activeTicket.id.slice(0, 8),
              entryTime: activeTicket.entry_time,
              status: activeTicket.status || "active",
              paymentStatus: activeTicket.payment_status || "paid",
              violationFine: 0,
              violationReason: "",
              isOverdue: activeTicket.status === "overdue",
              isPostpaidEv: false,
              isEv: false,
            };
          }
        }

        if (foundRecord) {
          setTransaction(foundRecord);
        }
      } catch (err) {
        console.warn("Failed to load real-time transaction:", err);
      } finally {
        setLoading(false);
      }
    },
    [params.id, transaction.id]
  );

  // Real-time Database Subscription to the Record
  useEffect(() => {
    loadRealtimeTransaction();

    const targetId = transaction.id || (params.id as string);
    if (!targetId) return;

    // Listen to changes across possible transaction tables
    const channel = supabase
      .channel(`realtime-details-${targetId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "parking_tickets",
          filter: `id=eq.${targetId}`,
        },
        () => {
          loadRealtimeTransaction(targetId);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ev_charging_sessions",
          filter: `id=eq.${targetId}`,
        },
        () => {
          loadRealtimeTransaction(targetId);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "parking_fines",
          filter: `id=eq.${targetId}`,
        },
        () => {
          loadRealtimeTransaction(targetId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadRealtimeTransaction, params.id, transaction.id]);

  // Load User Wallet Balance
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const bal = await fetchWalletBalance();
        if (!mounted) return;
        setWalletBalance(bal);
      } catch (err) {
        console.warn("Failed to load wallet balance:", err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadRealtimeTransaction(),
      fetchWalletBalance().then((bal) => setWalletBalance(bal)),
    ]);
    setRefreshing(false);
  };

  // Computations
  const isEvSession = transaction.isEv;
  const isPayable = transaction.paymentStatus !== "paid" || transaction.isOverdue || transaction.isPostpaidEv;
  const subtotal = transaction.cost;
  const fine = transaction.violationFine || 0;
  const discountAmount = appliedVoucher ? Math.round((subtotal * appliedVoucher.discountPercent) / 100) : 0;
  const totalAmount = isPayable ? Math.max(0, subtotal + fine - discountAmount) : 0;

  // Timestamps
  const entryMs = useMemo(() => {
    const parsed = new Date(transaction.entryTime).getTime();
    return isNaN(parsed) ? Date.now() - transaction.durationHours * 3600 * 1000 : parsed;
  }, [transaction.entryTime, transaction.durationHours]);

  const arriveTimeStr = useMemo(() => {
    return new Date(entryMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [entryMs]);

  const exitTimeStr = useMemo(() => {
    if (transaction.exitTime) {
      return new Date(transaction.exitTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    const exitMs = entryMs + transaction.durationHours * 3600 * 1000;
    return new Date(exitMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [entryMs, transaction.durationHours, transaction.exitTime]);

  // Handle Voucher Apply
  const handleApplyVoucher = () => {
    const code = voucherInput.trim().toUpperCase();
    if (!code) return;

    if (code === "PARKZONE10" || code === "PARK10" || code === "PROMO10") {
      setAppliedVoucher({ code, discountPercent: 10 });
      setVoucherModalVisible(false);
      Alert.alert("Voucher Applied", `10% discount applied with code "${code}".`);
    } else if (code === "KIGALI20" || code === "SAVE20") {
      setAppliedVoucher({ code, discountPercent: 20 });
      setVoucherModalVisible(false);
      Alert.alert("Voucher Applied", `20% VIP discount applied with code "${code}".`);
    } else {
      Alert.alert("Invalid Code", "Please check your promo voucher code and try again.");
    }
  };

  // Handle Settle / Pay in Real Time
  const handlePayNow = async () => {
    if (!isPayable || totalAmount <= 0) {
      router.replace("/(tabs)/home");
      return;
    }

    setIsProcessing(true);

    try {
      // 1. Run mobile payment dial code in background: *182*1*1*0790889899*amount#
      await initiateMobilePayment(totalAmount);

      // 2. Update database record in real-time according to source table
      if (transaction.sourceTable === "parking_tickets") {
        await completeParkingSession({
          ticketId: transaction.id,
          spaceId: transaction.spaceId,
          paymentMethod: "momo",
          amount: totalAmount,
        });
      } else if (transaction.sourceTable === "ev_charging_sessions") {
        await supabase
          .from("ev_charging_sessions")
          .update({
            status: "completed",
            payment_status: "paid",
            charging_amount_rwf: totalAmount,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", transaction.id);
      } else if (transaction.sourceTable === "parking_fines") {
        await supabase
          .from("parking_fines")
          .update({
            payment_status: "paid",
            paid_at: new Date().toISOString(),
          })
          .eq("id", transaction.id);
      }

      // 4. Reload real-time record to update screen
      await loadRealtimeTransaction(transaction.id);
      setIsProcessing(false);
      setPaymentSuccess(true);
      Alert.alert(
        "Payment Initiated",
        `Payment of ${formatMoney(totalAmount)} initiated. Transaction completed and updated in real time.`,
        [{ text: "OK", onPress: () => router.replace("/(tabs)/home") }]
      );
    } catch (err) {
      setIsProcessing(false);
      Alert.alert("Notice", "Payment initiated. Status will update once network confirmation is received.");
      router.replace("/(tabs)/home");
    }
  };

  // Format currency
  const formatMoney = (val: number) => {
    if (transaction.currency === "$") {
      return `$${val.toFixed(2)}`;
    }
    return `${val.toLocaleString()} ${transaction.currency}`;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
      {/* Top Header Row */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: theme.text }]}>Transaction Details</Text>

        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={onRefresh}
          activeOpacity={0.7}
        >
          <Ionicons name="reload-outline" size={18} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.text}
            colors={[theme.text]}
          />
        }
      >
        {/* Main Details Card (styled in app colors with dashed dividers) */}
        <View
          style={[
            styles.detailsCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: theme.cardShadow,
            },
          ]}
        >
          {/* Top Location & Slot Row */}
          <View style={styles.locationHeaderRow}>
            <View style={[styles.slotBadge, { backgroundColor: theme.isDark ? "#FFFFFF" : "#09090B" }]}>
              <Text style={[styles.slotBadgeText, { color: theme.isDark ? "#09090B" : "#FFFFFF" }]}>
                {transaction.bayNumber}
              </Text>
            </View>

            <View style={styles.locationInfoCol}>
              <Text style={[styles.locationNameText, { color: theme.text }]} numberOfLines={1}>
                {transaction.name}
              </Text>
              <Text style={[styles.locationSectorText, { color: theme.textSecondary }]} numberOfLines={1}>
                {transaction.address || `${transaction.zoneCode} • Level 1`}
              </Text>
            </View>

            {/* Real-time Status Badge */}
            <View
              style={[
                styles.liveStatusBadge,
                {
                  backgroundColor: !isPayable
                    ? "rgba(16, 185, 129, 0.12)"
                    : "rgba(239, 68, 68, 0.12)",
                  borderColor: !isPayable ? "#10B981" : "#EF4444",
                },
              ]}
            >
              <Text
                style={[
                  styles.liveStatusText,
                  { color: !isPayable ? "#10B981" : "#EF4444" },
                ]}
              >
                {!isPayable ? "Paid" : transaction.isOverdue ? "Overdue" : "Pending"}
              </Text>
            </View>
          </View>

          {/* Dashed Divider */}
          <View style={[styles.dashedDivider, { borderColor: theme.border }]} />

          {/* Section 1: Booking Date & Parking No */}
          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Transaction Date</Text>
            <Text style={[styles.metaValue, { color: theme.text }]}>{transaction.date}</Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Reference No.</Text>
            <Text style={[styles.metaValue, { color: theme.text }]}>#{transaction.receiptNumber}</Text>
          </View>

          {transaction.plate ? (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Vehicle Plate</Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>{transaction.plate}</Text>
            </View>
          ) : null}

          {/* Dashed Divider */}
          <View style={[styles.dashedDivider, { borderColor: theme.border }]} />

          {/* Section 2: Timing & Duration */}
          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Arrive / Started</Text>
            <Text style={[styles.metaValue, { color: theme.text }]}>{arriveTimeStr}</Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>
              {transaction.exitTime ? "Completed At" : "Exit Before"}
            </Text>
            <Text style={[styles.metaValue, { color: theme.text }]}>{exitTimeStr}</Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Duration</Text>
            <Text style={[styles.metaValue, { color: theme.text }]}>{transaction.duration}</Text>
          </View>

          {/* Dashed Divider */}
          <View style={[styles.dashedDivider, { borderColor: theme.border }]} />

          {/* Section 3: Subtotal & Breakdown */}
          {isEvSession && (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary, fontWeight: "500" }]}>
                Parking Tariff (EV Exemption)
              </Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>0 RWF (FREE)</Text>
            </View>
          )}

          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>
              {isEvSession
                ? "Energy Subtotal (Charging)"
                : transaction.isOverdue
                ? "Overstay Overdue Charge"
                : "Reservation Fee"}
            </Text>
            <Text style={[styles.metaValue, { color: theme.text }]}>
              {isPayable ? formatMoney(subtotal) : `${formatMoney(subtotal)} (PRE-PAID)`}
            </Text>
          </View>

          {!isPayable && (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.text, fontWeight: "500" }]}>
                Payment Status
              </Text>
              <Text style={[styles.metaValue, { color: theme.text, fontWeight: "500" }]}>
                PAID IN FULL
              </Text>
            </View>
          )}

          {fine > 0 && (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: "#EF4444", fontWeight: "500" }]}>
                {transaction.violationReason || "Municipal Contravention Fine"}
              </Text>
              <Text style={[styles.metaValue, { color: "#EF4444" }]}>+{formatMoney(fine)}</Text>
            </View>
          )}

          {appliedVoucher && isPayable && (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary, fontWeight: "500" }]}>
                Voucher ({appliedVoucher.code} -{appliedVoucher.discountPercent}%)
              </Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>-{formatMoney(discountAmount)}</Text>
            </View>
          )}

          {/* Voucher Input Box (Tap to Add Voucher) */}
          {isPayable && (
            <TouchableOpacity
              style={[
                styles.voucherBox,
                {
                  backgroundColor: theme.isDark ? "rgba(255,255,255,0.06)" : "#F4F4F6",
                  borderColor: appliedVoucher ? theme.text : theme.border,
                },
              ]}
              onPress={() => setVoucherModalVisible(true)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.voucherBoxText,
                  { color: appliedVoucher ? theme.text : theme.textSecondary },
                ]}
              >
                {appliedVoucher
                  ? `Voucher "${appliedVoucher.code}" Applied (${appliedVoucher.discountPercent}% OFF)`
                  : "Tap to Add Voucher"}
              </Text>
              <Ionicons
                name={appliedVoucher ? "checkmark-circle" : "ticket-outline"}
                size={18}
                color={appliedVoucher ? theme.text : theme.textSecondary}
              />
            </TouchableOpacity>
          )}

          {/* Dashed Divider */}
          <View style={[styles.dashedDivider, { borderColor: theme.border }]} />

          {/* Section 4: Settlement Channel */}
          <Text style={[styles.paymentMethodTitle, { color: theme.text }]}>
            Settlement Channel
          </Text>

          {isPayable && totalAmount > 0 ? (
            <View
              style={[
                styles.paymentDropdownBtn,
                {
                  backgroundColor: theme.isDark ? "rgba(255,255,255,0.06)" : "#F4F4F6",
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.paymentMethodLeft}>
                <Ionicons name="phone-portrait-outline" size={20} color={theme.text} />
                <View>
                  <Text style={[styles.paymentMethodSubtitle, { color: theme.text, fontWeight: "600" }]}>
                    Direct Mobile Money
                  </Text>
                  <Text style={[styles.paymentMethodSubtitle, { color: theme.textSecondary, fontSize: 11 }]}>
                    Automated background settlement to 0790889899
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View
              style={[
                styles.paymentDropdownBtn,
                {
                  backgroundColor: theme.isDark ? "rgba(255,255,255,0.06)" : "#F4F4F6",
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.paymentMethodLeft}>
                <Ionicons name="checkmark-circle" size={20} color={theme.text} />
                <Text style={[styles.paymentMethodSubtitle, { color: theme.text }]}>
                  Covered & Settled in Real Time (0 RWF Due)
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom Sticky Action: Total & Pay Now Button */}
      <View
        style={[
          styles.bottomFixedContainer,
          {
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
            shadowColor: theme.cardShadow,
          },
        ]}
      >
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>Total Due</Text>
          <Text style={[styles.totalAmountText, { color: theme.text }]}>
            {isPayable && totalAmount > 0 ? formatMoney(totalAmount) : "0 RWF (Settled)"}
          </Text>
        </View>

        {/* Pay / Book Again button */}
        <TouchableOpacity
          style={[styles.payNowBtn, { backgroundColor: theme.primaryBtnBg }]}
          onPress={handlePayNow}
          disabled={isProcessing}
          activeOpacity={0.88}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={theme.primaryBtnText} />
          ) : (
            <Text style={[styles.payNowBtnText, { color: theme.primaryBtnText }]}>
              {isPayable && totalAmount > 0
                ? isEvSession
                  ? `Pay EV Charge ${formatMoney(totalAmount)}`
                  : `Pay ${formatMoney(totalAmount)} & Close`
                : "Book again"}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Voucher Input Modal */}
      <Modal
        visible={voucherModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setVoucherModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContentCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitleText, { color: theme.text }]}>Add Promo Voucher</Text>
              <TouchableOpacity onPress={() => setVoucherModalVisible(false)}>
                <Ionicons name="close" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.voucherHintText, { color: theme.textSecondary }]}>
              Enter promo voucher code (e.g. PARKZONE10 for 10% off, KIGALI20 for 20% off):
            </Text>

            <TextInput
              style={[
                styles.voucherInputBox,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
              placeholder="Enter voucher code..."
              placeholderTextColor={theme.textMuted}
              value={voucherInput}
              onChangeText={setVoucherInput}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <View style={styles.voucherActionsRow}>
              {appliedVoucher && (
                <TouchableOpacity
                  style={[styles.removeVoucherBtn, { borderColor: theme.border }]}
                  onPress={() => {
                    setAppliedVoucher(null);
                    setVoucherInput("");
                    setVoucherModalVisible(false);
                  }}
                >
                  <Text style={[styles.removeVoucherBtnText, { color: "#EF4444" }]}>Remove</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.applyVoucherBtn, { backgroundColor: theme.primaryBtnBg }]}
                onPress={handleApplyVoucher}
                activeOpacity={0.85}
              >
                <Text style={[styles.applyVoucherBtnText, { color: theme.primaryBtnText }]}>Apply Code</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 150,
  },
  detailsCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  locationHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
  },
  slotBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  slotBadgeText: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  locationInfoCol: {
    flex: 1,
  },
  locationNameText: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  locationSectorText: {
    fontSize: 12,
    fontWeight: "400",
    marginTop: 3,
  },
  liveStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  liveStatusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  dashedDivider: {
    height: 1,
    borderWidth: 0.8,
    borderStyle: "dashed",
    marginVertical: 14,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 4,
  },
  metaLabel: {
    fontSize: 13,
    fontWeight: "400",
  },
  metaValue: {
    fontSize: 13,
    fontWeight: "500",
  },
  voucherBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 12,
  },
  voucherBoxText: {
    fontSize: 13,
    fontWeight: "500",
  },
  paymentMethodTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  paymentDropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  paymentMethodLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  paymentMethodSubtitle: {
    fontSize: 13,
    fontWeight: "400",
  },
  bottomFixedContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === "ios" ? 28 : 20,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 8,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  totalAmountText: {
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  payNowBtn: {
    borderRadius: 24,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  payNowBtnText: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContentCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
  },
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  modalTitleText: {
    fontSize: 17,
    fontWeight: "600",
  },
  methodOptionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  methodOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  methodOptionName: {
    fontSize: 14,
    fontWeight: "600",
  },
  methodOptionSub: {
    fontSize: 11,
    marginTop: 2,
  },
  voucherHintText: {
    fontSize: 13,
    marginBottom: 14,
  },
  voucherInputBox: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: "400",
    marginBottom: 16,
  },
  voucherActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  removeVoucherBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  removeVoucherBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  applyVoucherBtn: {
    flex: 2,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  applyVoucherBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
