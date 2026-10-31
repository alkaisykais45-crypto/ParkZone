import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { PermitsSkeleton } from "../../components/SkeletonLoader";
import { supabase } from "../lib/supabase";
import {
  applyForPermit,
  DbPermitRecord,
  fetchUserPermits,
  fetchUserVehicles,
} from "../services/parking";

const Permits = () => {
  const theme = useTheme();
  const [permits, setPermits] = useState<DbPermitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [applying, setApplying] = useState(false);

  const loadPermits = useCallback(async () => {
    try {
      const list = await fetchUserPermits();
      setPermits(list);
    } catch (e) {
      console.warn("loadPermits error:", e);
      setPermits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPermits();
  }, [loadPermits]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPermits();
    setRefreshing(false);
  };

  const handleApplyPermit = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      Alert.alert("Sign In Required", "Please sign in to apply for a municipal parking permit.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In", onPress: () => router.push("/(auth)/sign_in") },
      ]);
      return;
    }

    const vehicles = await fetchUserVehicles(user.id);
    if (vehicles.length === 0) {
      Alert.alert(
        "Vehicle Required",
        "Please register a vehicle first so we can link the permit to its license plate.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Add Vehicle", onPress: () => router.push("/(tabs)/vehicles") },
        ]
      );
      return;
    }

    const primaryPlate = vehicles[0].plate_number;
    Alert.alert(
      "Apply for Municipal Permit",
      `Submit a Zone A & B Resident Permit application for vehicle ${primaryPlate}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit Application",
          onPress: async () => {
            setApplying(true);
            const res = await applyForPermit({
              vehiclePlate: primaryPlate,
              permitTitle: "Zone A & B Resident Permit",
              zoneScope: "Kigali Municipal Zones A & B",
            });
            setApplying(false);
            if (res.error) {
              Alert.alert("Application Error", res.error);
            } else {
              await loadPermits();
              Alert.alert(
                "Application Submitted",
                `Permit #${res.data?.permit_number} created in database for ${primaryPlate}.`
              );
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
        <View>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Digital Permits</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            Official municipal parking authorizations
          </Text>
        </View>
      </View>

      {loading ? (
        <PermitsSkeleton />
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
          {permits.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name="document-text-outline" size={38} color={theme.textSecondary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No Active Permits</Text>
              <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
                You do not have any municipal parking permits in the database yet.
              </Text>
            </View>
          ) : (
            permits.map((p) => (
              <View
                key={p.id}
                style={[styles.permitCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
              >
                <View style={styles.permitHeader}>
                  <Text
                    style={[
                      styles.permitBadge,
                      {
                        backgroundColor: p.status === "active" ? theme.pillActiveBg : theme.background,
                        borderColor: p.status === "active" ? theme.pillActiveBg : theme.border,
                        color: p.status === "active" ? theme.pillActiveText : theme.text,
                      },
                    ]}
                  >
                    {p.status.toUpperCase()}
                  </Text>
                  <Text style={[styles.permitNumber, { color: theme.textSecondary }]}>
                    #{p.permit_number}
                  </Text>
                </View>
                <Text style={[styles.permitTitle, { color: theme.text }]}>{p.permit_title}</Text>
                <Text style={[styles.permitSub, { color: theme.textSecondary }]}>
                  {p.zone_scope}
                  {p.valid_until ? ` • Valid until ${new Date(p.valid_until).toLocaleDateString()}` : ""}
                </Text>

                <View style={[styles.divider, { backgroundColor: theme.border }]} />

                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Vehicle Plate:</Text>
                  <Text style={[styles.metaValue, { color: theme.text }]}>{p.vehicle_plate}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Authority:</Text>
                  <Text style={[styles.metaValue, { color: theme.text }]}>
                    {p.issuing_authority || "City Infrastructure Board"}
                  </Text>
                </View>
              </View>
            ))
          )}

          {/* Request New Permit */}
          <TouchableOpacity
            style={[styles.requestBtn, { backgroundColor: theme.primaryBtnBg }]}
            onPress={handleApplyPermit}
            disabled={applying}
          >
            {applying ? (
              <ActivityIndicator size="small" color={theme.primaryBtnText} />
            ) : (
              <Text style={[styles.requestBtnText, { color: theme.primaryBtnText }]}>
                + Apply for Municipal Permit
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

export default Permits;

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
    gap: 16,
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
  },
  emptyCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "400",
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 19,
  },
  permitCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
  },
  permitHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  permitBadge: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  permitNumber: {
    fontSize: 11,
    fontWeight: "500",
  },
  permitTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  permitSub: {
    fontSize: 12,
    marginTop: 4,
  },
  divider: {
    height: 1,
    marginVertical: 14,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  metaLabel: {
    fontSize: 12,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: "500",
  },
  requestBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  requestBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
