import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GlassBackground } from "../../components/GlassBackground";
import { GlassCard } from "../../components/GlassCard";
import { useTheme } from "../../hooks/useTheme";

export default function TermsService() {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<"Terms" | "Privacy">("Terms");

  return (
    <GlassBackground>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={[
              styles.backBtn,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleBox}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              Legal & Privacy
            </Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              City of Kigali Smart Mobility
            </Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        {/* Segmented Control Tabs */}
        <View style={styles.tabWrapper}>
          <View
            style={[
              styles.tabContainer,
              {
                backgroundColor: theme.pillInactiveBg,
                borderColor: theme.border,
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === "Terms" && { backgroundColor: theme.pillActiveBg },
              ]}
              onPress={() => setActiveTab("Terms")}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color:
                      activeTab === "Terms"
                        ? theme.pillActiveText
                        : theme.pillInactiveText,
                  },
                  activeTab === "Terms" && styles.tabTextActive,
                ]}
              >
                Terms of Service
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === "Privacy" && { backgroundColor: theme.pillActiveBg },
              ]}
              onPress={() => setActiveTab("Privacy")}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color:
                      activeTab === "Privacy"
                        ? theme.pillActiveText
                        : theme.pillInactiveText,
                  },
                  activeTab === "Privacy" && styles.tabTextActive,
                ]}
              >
                Privacy Policy
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === "Terms" ? (
            <GlassCard style={styles.glassCard} intensity={60}>
              <View
                style={[
                  styles.badgeRow,
                  {
                    backgroundColor: theme.accentSoft,
                    borderColor: theme.borderStrong,
                  },
                ]}
              >
                <View style={[styles.badgeDot, { backgroundColor: theme.text }]} />
                <Text style={[styles.badgeText, { color: theme.text }]}>
                  MUNICIPAL CONCESSION REGULATION
                </Text>
              </View>

              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionHeading, { color: theme.text }]}>
                  1. Kigali Municipal Parking Operations
                </Text>
                <Text style={[styles.paragraph, { color: theme.textSecondary }]}>
                  ParkZone provides digital parking access, real-time bay telemetry, and automated toll collection across authorized Kigali urban parking zones under City of Kigali concession.
                </Text>
              </View>

              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionHeading, { color: theme.text }]}>
                  2. Tariff & Overstay Enforcement
                </Text>
                <Text style={[styles.paragraph, { color: theme.textSecondary }]}>
                  • <Text style={[styles.highlight, { color: theme.text }]}>Hourly Parking:</Text> Live facility rates published per zone in the database (with an initial 15-minute grace period upon bay entry).
                  {"\n"}• <Text style={[styles.highlight, { color: theme.text }]}>Daily Commuter Cap:</Text> Facility daily cap applied automatically per calendar day.
                  {"\n"}• <Text style={[styles.highlight, { color: theme.text }]}>Unregistered Parking / Fine:</Text> Vehicles parked without activating check-in within 15 minutes of camera entry are subject to municipal enforcement penalties.
                </Text>
              </View>

              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionHeading, { color: theme.text }]}>
                  3. EV Fast Charging Network
                </Text>
                <Text style={[styles.paragraph, { color: theme.textSecondary }]}>
                  EV charging sessions are billed separately from parking according to live charger tariffs. Vehicles must vacate charger bays within 15 minutes of charging completion to prevent idle obstruction penalties.
                </Text>
              </View>
            </GlassCard>
          ) : (
            <GlassCard style={styles.glassCard} intensity={60}>
              <View
                style={[
                  styles.badgeRow,
                  {
                    backgroundColor: theme.accentSoft,
                    borderColor: theme.borderStrong,
                  },
                ]}
              >
                <View style={[styles.badgeDot, { backgroundColor: theme.text }]} />
                <Text style={[styles.badgeText, { color: theme.text }]}>
                  DATA PROTECTION & PRIVACY
                </Text>
              </View>

              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionHeading, { color: theme.text }]}>
                  1. Data Protection & Privacy Framework
                </Text>
                <Text style={[styles.paragraph, { color: theme.textSecondary }]}>
                  In accordance with regulatory standards relating to the protection of personal data and privacy, ParkZone enforces strict data minimization, cryptographic hashing, and pseudonymization across all sensor pipelines.
                </Text>
              </View>

              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionHeading, { color: theme.text }]}>
                  2. Cryptographic Blind Indexing
                </Text>
                <Text style={[styles.paragraph, { color: theme.textSecondary }]}>
                  Vehicle license plates are hashed at the client edge using SHA-256 blind indexing. Plain text identifiers are protected via strict row-level security policies.
                </Text>
              </View>

              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionHeading, { color: theme.text }]}>
                  3. ANPR Optical Telemetry
                </Text>
                <Text style={[styles.paragraph, { color: theme.textSecondary }]}>
                  Roadside optical sensors compute hash tokens to detect occupancy (Vacant vs Occupied) and trigger automated billing timers. Video frames and raw images are purged post-tokenization.
                </Text>
              </View>
            </GlassCard>
          )}
        </ScrollView>
      </SafeAreaView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleBox: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: "400",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  tabWrapper: {
    paddingHorizontal: 22,
    paddingTop: 8,
    marginBottom: 8,
  },
  tabContainer: {
    flexDirection: "row",
    borderRadius: 24,
    padding: 4,
    borderWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  tabText: {
    fontSize: 12.5,
    fontWeight: "500",
  },
  tabTextActive: {
    fontWeight: "500",
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 40,
  },
  glassCard: {
    marginBottom: 16,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginBottom: 18,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.8,
  },
  sectionBlock: {
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  paragraph: {
    fontSize: 13,
    lineHeight: 20,
  },
  highlight: {
    fontWeight: "600",
  },
});
