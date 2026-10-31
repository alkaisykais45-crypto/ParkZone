import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
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
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useTheme } from "../hooks/useTheme";
import { RecentParkingsSkeleton } from "../components/SkeletonLoader";
import { fetchUserParkingHistory, ParkingHistoryRecord } from "./services/parking";
export type { ParkingHistoryRecord };

const STATUS_FILTERS = ["All", "Active", "Incomplete", "Completed", "Closed"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export default function RecentParkingsScreen() {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("All");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<ParkingHistoryRecord | null>(null);
  const [records, setRecords] = useState<ParkingHistoryRecord[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const dbRecords = await fetchUserParkingHistory();
      setRecords(dbRecords as ParkingHistoryRecord[]);
    } catch (err) {
      console.warn("loadHistory database error:", err);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  const filteredRecords = useMemo(() => {
    return records.filter((item) => {
      // Status Filter (supporting both completed and incomplete sessions)
      if (selectedStatus === "Active" && item.status !== "Active") {
        return false;
      }
      if (selectedStatus === "Completed" && item.status !== "Completed") {
        return false;
      }
      if (selectedStatus === "Incomplete" && (item.status === "Completed" || item.isCompleted)) {
        return false;
      }
      if (selectedStatus === "Closed" && item.status !== "Closed") {
        return false;
      }

      // Search Query Filter
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesAddr = item.address.toLowerCase().includes(q);
        const matchesBay = item.bayNumber.toLowerCase().includes(q);
        const matchesPlate = item.plate.toLowerCase().includes(q);
        const matchesZone = item.zoneCode.toLowerCase().includes(q);
        if (!matchesName && !matchesAddr && !matchesBay && !matchesPlate && !matchesZone) {
          return false;
        }
      }

      return true;
    });
  }, [records, selectedStatus, searchQuery]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>

        <View style={styles.headerTitleCol}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Recent Parking</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            {filteredRecords.length} {filteredRecords.length === 1 ? "record" : "records"} found
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => setSearchQuery("")}
          activeOpacity={0.7}
        >
          <Ionicons name="filter-outline" size={18} color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchWrapper}>
        <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search lot, bay, plate, or zone..."
            placeholderTextColor={theme.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Chips */}
      <View style={styles.chipsRow}>
        {STATUS_FILTERS.map((st) => {
          const isActive = selectedStatus === st;
          return (
            <TouchableOpacity
              key={st}
              style={[
                styles.chip,
                {
                  backgroundColor: isActive ? theme.pillActiveBg : theme.pillInactiveBg,
                  borderColor: isActive ? theme.pillActiveBg : theme.border,
                },
              ]}
              onPress={() => setSelectedStatus(st)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, { color: isActive ? theme.pillActiveText : theme.pillInactiveText }]}>
                {st}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Records FlatList */}
      {loading && !refreshing ? (
        <RecentParkingsSkeleton />
      ) : (
      <FlatList
        data={filteredRecords}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          filteredRecords.length === 0 && styles.listContentEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.text}
            colors={[theme.text]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View
              style={[
                styles.emptyIconHalo,
                {
                  backgroundColor: theme.isDark
                    ? "rgba(255, 255, 255, 0.05)"
                    : "rgba(9, 9, 11, 0.04)",
                },
              ]}
            >
              <View
                style={[
                  styles.emptyIconCore,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Ionicons name="book-outline" size={30} color={theme.text} />
              </View>
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No parking sessions found</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              {searchQuery
                ? `No parking session history matching "${searchQuery}".`
                : "Your parking history logbook has no recorded sessions yet. New stays will automatically log here."}
            </Text>
            {searchQuery ? (
              <TouchableOpacity
                style={[styles.clearSearchBtn, { backgroundColor: theme.primaryBtnBg }]}
                onPress={() => setSearchQuery("")}
                activeOpacity={0.8}
              >
                <Text style={[styles.clearSearchBtnText, { color: theme.primaryBtnText }]}>Clear Search</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.findParkingBtn, { backgroundColor: theme.primaryBtnBg }]}
                onPress={() => router.push("/(tabs)/home")}
                activeOpacity={0.8}
              >
                <Ionicons name="search-outline" size={16} color={theme.primaryBtnText} style={{ marginRight: 6 }} />
                <Text style={[styles.findParkingBtnText, { color: theme.primaryBtnText }]}>Find Available Parking</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const isCompleted = item.status === "Completed";
          const isActive = item.status === "Active";
          const isEvSession = Boolean(
            item.zoneCode?.toLowerCase().includes("ev") ||
            item.duration?.toLowerCase().includes("charging") ||
            item.name?.toLowerCase().includes("ev")
          );

          return (
            <TouchableOpacity
              style={[
                styles.card,
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
              activeOpacity={0.88}
            >
              <View style={styles.cardHeader}>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={styles.cardImg} />
                ) : (
                  <View style={[styles.cardImg, { backgroundColor: theme.background, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border }]}>
                    <Ionicons name="car-sport-outline" size={26} color={theme.textSecondary} />
                  </View>
                )}
                <View style={styles.cardHeaderInfo}>
                  <View style={styles.cardTitleRow}>
                    <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor: isActive ? theme.pillActiveBg : theme.pillInactiveBg,
                        },
                      ]}
                    >
                      {isActive && <View style={[styles.activeDot, { backgroundColor: theme.pillActiveText }]} />}
                      <Text
                        style={[
                          styles.statusBadgeText,
                          {
                            color: isActive ? theme.pillActiveText : isCompleted ? theme.text : theme.textSecondary,
                          },
                        ]}
                      >
                        {item.status}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.cardAddress, { color: theme.textSecondary }]} numberOfLines={1}>
                    {item.address}
                  </Text>

                  <View style={styles.tagsRow}>
                    <View style={[styles.tagPill, { backgroundColor: theme.background, borderColor: theme.border }]}>
                      <Ionicons name="navigate-outline" size={11} color={theme.text} />
                      <Text style={[styles.tagText, { color: theme.text }]}>Spot {item.bayNumber}</Text>
                    </View>
                    <View
                      style={[
                        styles.tagPill,
                        {
                          backgroundColor: isEvSession ? theme.evGreenSoft : theme.background,
                          borderColor: isEvSession ? theme.evGreenBorder : theme.border,
                        },
                      ]}
                    >
                      <Text style={[styles.tagText, { color: isEvSession ? theme.evGreen : theme.textSecondary }]}>
                        {item.zoneCode}
                      </Text>
                    </View>
                    <View style={[styles.tagPill, { backgroundColor: theme.background, borderColor: theme.border }]}>
                      <Text style={[styles.tagText, { color: theme.textSecondary }]}>{item.plate}</Text>
                    </View>
                    {Boolean(item.violationFine) && (
                      <View style={[styles.tagPill, { backgroundColor: "rgba(239, 68, 68, 0.12)", borderColor: "#EF4444" }]}>
                        <Ionicons name="warning-outline" size={11} color="#EF4444" />
                        <Text style={[styles.tagText, { color: "#EF4444", fontWeight: "500" }]}>
                          +{item.violationFine?.toLocaleString()} RWF Fine
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              {/* Card Meta Row */}
              <View style={[styles.cardDivider, { backgroundColor: theme.border }]} />

              <View style={styles.cardMetaRow}>
                <View style={styles.metaCol}>
                  <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Time & Date</Text>
                  <Text style={[styles.metaValue, { color: theme.text }]}>{item.date}</Text>
                </View>

                <View style={styles.metaCol}>
                  <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Duration</Text>
                  <Text style={[styles.metaValue, { color: theme.text }]}>{item.duration}</Text>
                </View>

                <View style={[styles.metaCol, { alignItems: "flex-end" }]}>
                  <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Total Paid</Text>
                  <Text style={[styles.metaPrice, { color: theme.text }]}>
                    {item.cost} {item.currency}
                  </Text>
                </View>
              </View>

              {/* Actions Row */}
              <View style={styles.cardActionsRow}>
                <TouchableOpacity
                  style={[styles.receiptBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
                  onPress={() => setActiveReceipt(item)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="receipt-outline" size={15} color={theme.text} />
                  <Text style={[styles.receiptBtnText, { color: theme.text }]}>Receipt</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.bookAgainBtn, { backgroundColor: theme.primaryBtnBg }]}
                  onPress={() => {
                    router.back();
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="refresh-outline" size={15} color={theme.primaryBtnText} />
                  <Text style={[styles.bookAgainBtnText, { color: theme.primaryBtnText }]}>Book Again</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
      />
      )}

      {/* Receipt Modal */}
      <Modal
        visible={Boolean(activeReceipt)}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveReceipt(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.receiptModalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.receiptTopCircle, { backgroundColor: theme.accentSoft }]}>
              <Ionicons name="checkmark-done" size={28} color={theme.text} />
            </View>

            <Text style={[styles.receiptTitle, { color: theme.text }]}>Official Parking Receipt</Text>
            <Text style={[styles.receiptId, { color: theme.textSecondary }]}>
              {activeReceipt?.receiptNumber}
            </Text>

            <View style={[styles.receiptDashedLine, { borderColor: theme.border }]} />

            <View style={styles.receiptLine}>
              <Text style={[styles.receiptLabel, { color: theme.textSecondary }]}>Location</Text>
              <Text style={[styles.receiptVal, { color: theme.text }]}>{activeReceipt?.name}</Text>
            </View>

            <View style={styles.receiptLine}>
              <Text style={[styles.receiptLabel, { color: theme.textSecondary }]}>Parking Bay</Text>
              <Text style={[styles.receiptVal, { color: theme.text }]}>
                Spot {activeReceipt?.bayNumber} ({activeReceipt?.zoneCode})
              </Text>
            </View>

            <View style={styles.receiptLine}>
              <Text style={[styles.receiptLabel, { color: theme.textSecondary }]}>Vehicle</Text>
              <Text style={[styles.receiptVal, { color: theme.text }]}>{activeReceipt?.plate}</Text>
            </View>

            <View style={styles.receiptLine}>
              <Text style={[styles.receiptLabel, { color: theme.textSecondary }]}>Duration</Text>
              <Text style={[styles.receiptVal, { color: theme.text }]}>{activeReceipt?.duration}</Text>
            </View>

            <View style={styles.receiptLine}>
              <Text style={[styles.receiptLabel, { color: theme.textSecondary }]}>Date & Time</Text>
              <Text style={[styles.receiptVal, { color: theme.text }]}>{activeReceipt?.date}</Text>
            </View>

            <View style={[styles.receiptDashedLine, { borderColor: theme.border }]} />

            <View style={styles.receiptTotalRow}>
              <Text style={[styles.receiptTotalLabel, { color: theme.text }]}>Amount Paid</Text>
              <Text style={[styles.receiptTotalVal, { color: theme.text }]}>
                {activeReceipt?.cost} {activeReceipt?.currency}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.closeReceiptBtn, { backgroundColor: theme.primaryBtnBg }]}
              onPress={() => setActiveReceipt(null)}
              activeOpacity={0.85}
            >
              <Text style={[styles.closeReceiptBtnText, { color: theme.primaryBtnText }]}>Done</Text>
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
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleCol: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: "400",
  },
  searchWrapper: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "400",
  },
  chipsRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 14,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    gap: 12,
  },
  cardImg: {
    width: 68,
    height: 68,
    borderRadius: 14,
  },
  cardHeaderInfo: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
    flex: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "500",
  },
  cardAddress: {
    fontSize: 12,
    marginTop: 3,
  },
  tagsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "400",
  },
  cardDivider: {
    height: 1,
    marginVertical: 14,
  },
  cardMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaCol: {
    gap: 3,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: "400",
  },
  metaValue: {
    fontSize: 13,
    fontWeight: "500",
  },
  metaPrice: {
    fontSize: 15,
    fontWeight: "500",
  },
  cardActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  receiptBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  receiptBtnText: {
    fontSize: 13,
    fontWeight: "500",
  },
  bookAgainBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  bookAgainBtnText: {
    fontSize: 13,
    fontWeight: "500",
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    minHeight: Dimensions.get("window").height * 0.72,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 28,
  },
  emptyIconHalo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyIconCore: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: "center",
    maxWidth: 300,
  },
  clearSearchBtn: {
    marginTop: 18,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 14,
  },
  clearSearchBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  findParkingBtn: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
  },
  findParkingBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  receiptModalCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
  },
  receiptTopCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  receiptTitle: {
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  receiptId: {
    fontSize: 12,
    fontWeight: "400",
    marginTop: 4,
  },
  receiptDashedLine: {
    width: "100%",
    borderStyle: "dashed",
    borderWidth: 1,
    marginVertical: 16,
  },
  receiptLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingVertical: 6,
  },
  receiptLabel: {
    fontSize: 13,
    fontWeight: "400",
  },
  receiptVal: {
    fontSize: 13,
    fontWeight: "500",
  },
  receiptTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingVertical: 8,
  },
  receiptTotalLabel: {
    fontSize: 15,
    fontWeight: "500",
  },
  receiptTotalVal: {
    fontSize: 18,
    fontWeight: "600",
  },
  closeReceiptBtn: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  closeReceiptBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
