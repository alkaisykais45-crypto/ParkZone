import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { PaymentsSkeleton } from "../../components/SkeletonLoader";
import { supabase } from "../lib/supabase";
import {
  DbPaymentMethodRecord,
  ParkingHistoryRecord,
  fetchUserParkingHistory,
  fetchUserPaymentMethods,
  fetchUserVehicles,
  fetchWalletBalance,
  resolveSpaceImageUrl,
  updateWalletBalance,
} from "../services/parking";
import { initiateMobilePayment } from "../services/mobilePayment";

const Payments = () => {
  const theme = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [methods, setMethods] = useState<DbPaymentMethodRecord[]>([]);
  const [transactions, setTransactions] = useState<ParkingHistoryRecord[]>([]);

  // Top Up Modal State
  const [topUpModalVisible, setTopUpModalVisible] = useState(false);
  const [selectedTopUpAmount, setSelectedTopUpAmount] = useState<number>(10000);
  const [isProcessingTopUp, setIsProcessingTopUp] = useState(false);

  // Daily Pass Purchase State
  const [isProcessingPass, setIsProcessingPass] = useState(false);

  const loadBilling = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const [bal, list, hist] = await Promise.all([
        fetchWalletBalance(user?.id),
        fetchUserPaymentMethods(),
        fetchUserParkingHistory(user?.id),
      ]);

      setWalletBalance(bal);
      setMethods(list);

      // Also merge any citations or fines for the user's vehicles
      const mergedList: ParkingHistoryRecord[] = [...hist];
      if (user?.id) {
        const vehicles = await fetchUserVehicles(user.id);
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
            .limit(10);

          (fines || []).forEach((f: any) => {
            const isPaid = f.payment_status === "paid";
            const loc = Array.isArray(f.parking_locations)
              ? f.parking_locations[0]
              : f.parking_locations;
            const sp = Array.isArray(f.parking_spaces)
              ? f.parking_spaces[0]
              : f.parking_spaces;

            const fineImage =
              sp?.image_url?.trim() ||
              loc?.image_url?.trim() ||
              resolveSpaceImageUrl(
                `${loc?.id || loc?.name || "fine"}-${sp?.space_number || f.id}`,
                sp?.space_type || "regular"
              );

            mergedList.unshift({
              id: f.id,
              name: loc?.name || "Municipal Enforcement",
              address: loc?.address || "Kigali Enforcement Center",
              bayNumber: sp?.space_number || "-",
              zoneCode: sp?.zone_code || "Zone A",
              plate: f.vehicle_plate,
              date: new Date(f.issued_at).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              }),
              duration: "Citation",
              cost: Number(f.fine_amount) || 0,
              currency: f.currency || "RWF",
              status: isPaid ? "Completed" : "Active",
              isCompleted: isPaid,
              isIncomplete: !isPaid,
              image: fineImage,
              receiptNumber: f.fine_number,
              entryTimeIso: f.issued_at,
              violationFine: Number(f.fine_amount) || 0,
              violationReason: f.reason || "Municipal Citation",
            });
          });
        }
      }

      setTransactions(mergedList.slice(0, 15));
    } catch (e) {
      console.warn("loadBilling error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadBilling();
  }, [loadBilling]);

  // Real-time Subscriptions for wallet balance and transactions
  useEffect(() => {
    let userSubId: string | null = null;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return;
      userSubId = user.id;

      // Listen to wallet balance updates on user_profiles
      const walletChannel = supabase
        .channel(`realtime-wallet-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "user_profiles",
            filter: `id=eq.${user.id}`,
          },
          (payload) => {
            if (
              payload.new &&
              typeof payload.new.wallet_balance_rwf === "number"
            ) {
              setWalletBalance(payload.new.wallet_balance_rwf);
            }
          }
        )
        .subscribe();

      // Listen to parking_tickets changes in real time
      const ticketChannel = supabase
        .channel(`realtime-tickets-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "parking_tickets",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            loadBilling();
          }
        )
        .subscribe();

      // Listen to ev_charging_sessions changes in real time
      const evChannel = supabase
        .channel(`realtime-ev-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "ev_charging_sessions",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            loadBilling();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(walletChannel);
        supabase.removeChannel(ticketChannel);
        supabase.removeChannel(evChannel);
      };
    })();
  }, [loadBilling]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBilling();
    setRefreshing(false);
  };

  // Background mobile top up trigger
  const handleConfirmTopUp = async () => {
    const amount = selectedTopUpAmount;
    setIsProcessingTopUp(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        setIsProcessingTopUp(false);
        Alert.alert("Sign In Required", "Please sign in to top up your wallet.");
        return;
      }

      // 1. Run mobile payment dial code in background: *182*1*1*0790889899*amount#
      await initiateMobilePayment(amount);

      // 2. Update wallet balance in database
      const next = walletBalance + amount;
      await updateWalletBalance(next, user.id);
      setWalletBalance(next);

      setIsProcessingTopUp(false);
      setTopUpModalVisible(false);
      Alert.alert(
        "Top-Up Initiated",
        `Top-up of ${amount.toLocaleString()} RWF initiated. Wallet balance updated to ${next.toLocaleString()} RWF in real time.`
      );
    } catch (err) {
      setIsProcessingTopUp(false);
      setTopUpModalVisible(false);
      Alert.alert(
        "Notice",
        "Top-up initiated. Balance will reflect in real time once network confirms."
      );
    }
  };

  // Daily Pass Purchase
  const handleBuyDailyPass = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      Alert.alert("Sign In Required", "Please sign in to activate a Daily Commuter Pass.");
      return;
    }

    Alert.alert(
      "Purchase Daily Pass (2,000 RWF)",
      "Choose your preferred payment channel:",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mobile Money (Direct)",
          onPress: async () => {
            setIsProcessingPass(true);
            try {
              // Initiate mobile payment in background
              await initiateMobilePayment(2000);
              setIsProcessingPass(false);
              Alert.alert(
                "Pass Activated",
                "Daily Commuter Pass active until 23:59. Mobile payment initiated in the background."
              );
            } catch {
              setIsProcessingPass(false);
            }
          },
        },
        {
          text: `Wallet (${walletBalance.toLocaleString()} RWF)`,
          onPress: async () => {
            if (walletBalance < 2000) {
              Alert.alert(
                "Insufficient Balance",
                "Your wallet balance is below 2,000 RWF. Please top up or pay with Mobile Money."
              );
              return;
            }
            setIsProcessingPass(true);
            try {
              const next = walletBalance - 2000;
              await updateWalletBalance(next, user.id);
              setWalletBalance(next);
              setIsProcessingPass(false);
              Alert.alert(
                "Pass Activated",
                `Daily Commuter Pass active until 23:59. Deducted 2,000 RWF from wallet.`
              );
            } catch {
              setIsProcessingPass(false);
            }
          },
        },
      ]
    );
  };

  // Pay single overdue item / fine from transactions list
  const handlePayTransaction = async (item: ParkingHistoryRecord) => {
    const payableAmount = item.violationFine || item.cost || 3000;

    Alert.alert(
      "Pay Outstanding Due",
      `Initiate mobile payment of ${payableAmount.toLocaleString()} RWF for ${item.name} (${item.plate || item.bayNumber})?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Pay Now",
          onPress: async () => {
            try {
              // 1. Run mobile payment dial code in background: *182*1*1*0790889899*amount#
              await initiateMobilePayment(payableAmount);

              // 2. Mark completed/paid in database in real time
              if (item.receiptNumber?.startsWith("FN-") || item.violationFine) {
                await supabase
                  .from("parking_fines")
                  .update({
                    payment_status: "paid",
                    paid_at: new Date().toISOString(),
                  })
                  .eq("id", item.id);
              } else if (item.receiptNumber?.startsWith("EV-")) {
                await supabase
                  .from("ev_charging_sessions")
                  .update({
                    status: "completed",
                    payment_status: "paid",
                    completed_at: new Date().toISOString(),
                  })
                  .eq("id", item.id);
              } else {
                await supabase
                  .from("parking_tickets")
                  .update({
                    status: "completed",
                    payment_status: "paid",
                    amount_paid: payableAmount,
                  })
                  .eq("id", item.id);
              }

              await loadBilling();
              Alert.alert(
                "Payment Completed",
                `Payment of ${payableAmount.toLocaleString()} RWF initiated. Record updated in real time.`
              );
            } catch (err) {
              console.warn("Pay item error:", err);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Payments & Tariffs</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            Real-time balance, automated mobile payments & tariffs
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={onRefresh}
        >
          <Ionicons name="reload-outline" size={18} color={theme.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <PaymentsSkeleton />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.text}
              colors={[theme.text]}
            />
          }
        >
          {/* Live Wallet Card */}
          <View style={[styles.passCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.passHeader}>
              <Text
                style={[
                  styles.passBadge,
                  { backgroundColor: theme.background, borderColor: theme.border, color: theme.text },
                ]}
              >
                PARKZONE WALLET
              </Text>
              <TouchableOpacity
                style={[styles.topUpPill, { backgroundColor: theme.primaryBtnBg }]}
                onPress={() => setTopUpModalVisible(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={14} color={theme.primaryBtnText} />
                <Text style={[styles.topUpPillText, { color: theme.primaryBtnText }]}>Top Up</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.walletAmount, { color: theme.text }]}>
              {walletBalance.toLocaleString()} RWF
            </Text>
            <Text style={[styles.passDesc, { color: theme.textSecondary }]}>
              {methods.length > 0
                ? `${methods.length} linked payment channel(s) in database`
                : "Linked to mobile payments (0790889899) with real-time balance sync"}
            </Text>
          </View>

          {/* Daily Commuter Pass Card */}
          <View style={[styles.passCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.passHeader}>
              <Text
                style={[
                  styles.passBadge,
                  { backgroundColor: theme.background, borderColor: theme.border, color: theme.text },
                ]}
              >
                DAILY COMMUTER
              </Text>
              <Text style={[styles.passPrice, { color: theme.text }]}>2,000 RWF</Text>
            </View>
            <Text style={[styles.passTitle, { color: theme.text }]}>All-Day Parking Pass</Text>
            <Text style={[styles.passDesc, { color: theme.textSecondary }]}>
              Valid for standard parking check-ins across municipal zones until 23:59 (excludes EV charging).
            </Text>
            <TouchableOpacity
              style={[styles.buyPassBtn, { backgroundColor: theme.primaryBtnBg }]}
              onPress={handleBuyDailyPass}
              disabled={isProcessingPass}
              activeOpacity={0.88}
            >
              {isProcessingPass ? (
                <ActivityIndicator size="small" color={theme.primaryBtnText} />
              ) : (
                <Text style={[styles.buyPassBtnText, { color: theme.primaryBtnText }]}>
                  Activate Daily Pass (2,000 RWF)
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Real-time Transactions & Invoices Section */}
          <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, marginBottom: 18 }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                REAL-TIME RECENT TRANSACTIONS
              </Text>
              <TouchableOpacity onPress={onRefresh}>
                <Text style={[styles.refreshText, { color: theme.textSecondary }]}>Live Sync</Text>
              </TouchableOpacity>
            </View>

            {transactions.length === 0 ? (
              <View style={styles.emptyTransactions}>
                <Ionicons name="receipt-outline" size={28} color={theme.textSecondary} />
                <Text style={[styles.emptyTransactionsText, { color: theme.textSecondary }]}>
                  No recent transactions recorded.
                </Text>
              </View>
            ) : (
              transactions.map((tx) => {
                const isOverdue = tx.status === "Active" && (tx.isIncomplete || tx.violationFine);
                const isPaid = tx.isCompleted;

                return (
                  <TouchableOpacity
                    key={tx.id}
                    style={[styles.txItemRow, { borderBottomColor: theme.border }]}
                    onPress={() =>
                      router.push({
                        pathname: "/transaction_details",
                        params: {
                          id: tx.id,
                          name: tx.name,
                          address: tx.address,
                          bayNumber: tx.bayNumber,
                          zoneCode: tx.zoneCode,
                          plate: tx.plate,
                          date: tx.date,
                          duration: tx.duration,
                          cost: tx.cost.toString(),
                          currency: tx.currency,
                          receiptNumber: tx.receiptNumber,
                          isOverdue: isOverdue ? "true" : "false",
                          violationFine: tx.violationFine ? tx.violationFine.toString() : "",
                          violationReason: tx.violationReason || "",
                        },
                      })
                    }
                    activeOpacity={0.75}
                  >
                    <View style={styles.txItemLeft}>
                      <View
                        style={[
                          styles.txIconBox,
                          {
                            backgroundColor: isPaid
                              ? "rgba(16, 185, 129, 0.12)"
                              : "rgba(239, 68, 68, 0.12)",
                          },
                        ]}
                      >
                        <Ionicons
                          name={
                            tx.duration === "Citation"
                              ? "warning-outline"
                              : tx.bayNumber.toLowerCase().includes("ev")
                              ? "flash-outline"
                              : "car-outline"
                          }
                          size={18}
                          color={isPaid ? "#10B981" : "#EF4444"}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.txItemName, { color: theme.text }]} numberOfLines={1}>
                          {tx.name}
                        </Text>
                        <Text style={[styles.txItemSub, { color: theme.textSecondary }]}>
                          {tx.date} • {tx.bayNumber}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.txItemRight}>
                      <Text style={[styles.txAmountText, { color: theme.text }]}>
                        {tx.cost.toLocaleString()} {tx.currency}
                      </Text>
                      {isOverdue ? (
                        <TouchableOpacity
                          style={[styles.payNowSmallBtn, { backgroundColor: theme.primaryBtnBg }]}
                          onPress={() => handlePayTransaction(tx)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={[styles.payNowSmallText, { color: theme.primaryBtnText }]}>
                            Pay Now
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={[styles.txStatusText, { color: isPaid ? "#10B981" : theme.textSecondary }]}>
                          {isPaid ? "Paid" : "Pending"}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          {/* Standard & Separated EV Charging Rates */}
          <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              MUNICIPAL TARIFF SCHEDULE
            </Text>

            <View style={[styles.rateRow, { borderBottomColor: theme.border }]}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.rateName, { color: theme.text }]}>Hourly Standard Parking</Text>
                <Text style={[styles.rateSub, { color: theme.textSecondary }]}>
                  Capped at 2,000 RWF/day • 15 mins grace included
                </Text>
              </View>
              <Text style={[styles.rateVal, { color: theme.text }]}>300 RWF / hr</Text>
            </View>

            <View style={[styles.rateRow, { borderBottomColor: theme.border }]}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.rateName, { color: theme.text }]}>EV Charging (&lt; 30 mins)</Text>
                <Text style={[styles.rateSub, { color: theme.textSecondary }]}>
                  Separated from parking • 0 RWF parking fee
                </Text>
              </View>
              <Text style={[styles.rateVal, { color: theme.evGreen }]}>9,000 RWF</Text>
            </View>

            <View style={[styles.rateRow, { borderBottomColor: theme.border }]}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.rateName, { color: theme.text }]}>EV Charging (≥ 30m / Full)</Text>
                <Text style={[styles.rateSub, { color: theme.textSecondary }]}>
                  Base rate until 100% full charge • 0 RWF parking fee
                </Text>
              </View>
              <Text style={[styles.rateVal, { color: theme.evGreen }]}>10,000 RWF</Text>
            </View>

            <View style={[styles.rateRow, { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.rateName, { color: theme.text }]}>Unregistered Contravention</Text>
                <Text style={[styles.rateSub, { color: theme.textSecondary }]}>
                  Vehicle parked without active session check-in
                </Text>
              </View>
              <Text style={[styles.rateVal, { color: "#EF4444" }]}>3,000 RWF</Text>
            </View>
          </View>
        </ScrollView>
      )}

      {/* Top Up Modal with Preset Amounts */}
      <Modal
        visible={topUpModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTopUpModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Top Up ParkZone Wallet</Text>
              <TouchableOpacity onPress={() => setTopUpModalVisible(false)}>
                <Ionicons name="close" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              Select top-up amount to initiate via mobile payment:
            </Text>

            <View style={styles.presetsGrid}>
              {[2000, 5000, 10000, 20000].map((amt) => {
                const isSelected = selectedTopUpAmount === amt;
                return (
                  <TouchableOpacity
                    key={amt}
                    style={[
                      styles.presetItem,
                      {
                        backgroundColor: isSelected
                          ? theme.isDark
                            ? "rgba(255, 255, 255, 0.12)"
                            : "rgba(9, 9, 11, 0.06)"
                          : theme.background,
                        borderColor: isSelected ? theme.text : theme.border,
                      },
                    ]}
                    onPress={() => setSelectedTopUpAmount(amt)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.presetAmountText, { color: theme.text }]}>
                      {amt.toLocaleString()} RWF
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.recipientInfoBox}>
              <Ionicons name="phone-portrait-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.recipientInfoText, { color: theme.textSecondary }]}>
                Direct mobile payment to 0790889899
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.confirmTopUpBtn, { backgroundColor: theme.primaryBtnBg }]}
              onPress={handleConfirmTopUp}
              disabled={isProcessingTopUp}
              activeOpacity={0.88}
            >
              {isProcessingTopUp ? (
                <ActivityIndicator size="small" color={theme.primaryBtnText} />
              ) : (
                <Text style={[styles.confirmTopUpBtnText, { color: theme.primaryBtnText }]}>
                  Initiate Payment ({selectedTopUpAmount.toLocaleString()} RWF)
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default Payments;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
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
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  passCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginBottom: 18,
  },
  passHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  passBadge: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  topUpPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  topUpPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  walletAmount: {
    fontSize: 26,
    fontWeight: "700",
  },
  passPrice: {
    fontSize: 20,
    fontWeight: "600",
  },
  passTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  passDesc: {
    fontSize: 12,
    marginTop: 6,
    lineHeight: 17,
  },
  buyPassBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 18,
  },
  buyPassBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  section: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.8,
  },
  refreshText: {
    fontSize: 11,
    fontWeight: "500",
  },
  emptyTransactions: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 8,
  },
  emptyTransactionsText: {
    fontSize: 12,
  },
  txItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  txItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  txIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  txItemName: {
    fontSize: 13,
    fontWeight: "600",
  },
  txItemSub: {
    fontSize: 11,
    marginTop: 2,
  },
  txItemRight: {
    alignItems: "flex-end",
    gap: 4,
    marginLeft: 10,
  },
  txAmountText: {
    fontSize: 13,
    fontWeight: "600",
  },
  txStatusText: {
    fontSize: 11,
    fontWeight: "500",
  },
  payNowSmallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  payNowSmallText: {
    fontSize: 11,
    fontWeight: "600",
  },
  rateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rateName: {
    fontSize: 13,
    fontWeight: "600",
  },
  rateSub: {
    fontSize: 10.5,
    marginTop: 2,
  },
  rateVal: {
    fontSize: 13,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalCard: {
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
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  modalSubtitle: {
    fontSize: 13,
    marginBottom: 18,
  },
  presetsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 18,
  },
  presetItem: {
    width: "48%",
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  presetAmountText: {
    fontSize: 14,
    fontWeight: "600",
  },
  recipientInfoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  recipientInfoText: {
    fontSize: 12,
  },
  confirmTopUpBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmTopUpBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
