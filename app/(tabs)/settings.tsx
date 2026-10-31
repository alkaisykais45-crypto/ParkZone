import React, { useState } from "react";
import {
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
import { signOut } from "../services/auth";

interface SettingsNavGroup {
  title: string;
  items: {
    key: string;
    title: string;
    desc: string;
    icon: keyof typeof Ionicons.glyphMap;
  }[];
}

const SETTINGS_CATEGORIES: SettingsNavGroup[] = [
  {
    title: "PERFORMANCE & ENGINE",
    items: [
      {
        key: "performance",
        title: "Performance & Offline Cache",
        desc: "Map tile caching, lot prefetch, battery optimization",
        icon: "rocket-outline",
      },
      {
        key: "navigation",
        title: "GPS, Routing & Precision",
        desc: "1-meter bay detection, auto-reroute on full lot",
        icon: "navigate-outline",
      },
      {
        key: "diagnostics",
        title: "Sensor Mesh & Network Diagnostics",
        desc: "MQTT telemetry health, latency ping test (18ms)",
        icon: "hardware-chip-outline",
      },
    ],
  },
  {
    title: "MOTORIST ACCOUNT",
    items: [
      {
        key: "personal",
        title: "Personal Information",
        desc: "Motorist name, phone, email, emergency contact",
        icon: "person-outline",
      },
      {
        key: "vehicles",
        title: "Vehicles & Permits",
        desc: "Linked plates, EV tags, handicap permit concession",
        icon: "car-outline",
      },
      {
        key: "payments",
        title: "Payment Channels & MoMo",
        desc: "MTN Mobile Money, Airtel Money, Visa, RRA TIN",
        icon: "card-outline",
      },
    ],
  },
  {
    title: "SECURITY & COMPLIANCE",
    items: [
      {
        key: "security",
        title: "Security & Biometrics",
        desc: "Biometric checkout, 2FA, plate hashing, auto-lock",
        icon: "shield-checkmark-outline",
      },
      {
        key: "privacy",
        title: "Privacy & Data Protection",
        desc: "Data protection & privacy policy, export history, delete profile",
        icon: "lock-closed-outline",
      },
    ],
  },
  {
    title: "NOTIFICATIONS & PREFERENCES",
    items: [
      {
        key: "notifications",
        title: "Notifications & Alerts",
        desc: "15m warning, 5m fine alert, EV charging notice, EBM SMS",
        icon: "notifications-outline",
      },
      {
        key: "appearance",
        title: "Appearance & Display",
        desc: "Monochrome light mode, dark mode, high-contrast roads",
        icon: "contrast-outline",
      },
      {
        key: "language",
        title: "Language & Regional Units",
        desc: "Language, Rwanda region, RWF currency, metric units",
        icon: "globe-outline",
      },
    ],
  },
  {
    title: "SUPPORT & LEGAL",
    items: [
      {
        key: "help",
        title: "Help & 24/7 Dispatch Center",
        desc: "Toll-Free 3122 hotline, WhatsApp support, dispute a fine",
        icon: "help-buoy-outline",
      },
      {
        key: "about",
        title: "About ParkZone",
        desc: "Version 2.4.0, City of Kigali Smart Urban Grid license",
        icon: "information-circle-outline",
      },
    ],
  },
];

const Settings = () => {
  const theme = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 600));
    setRefreshing(false);
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut();
          } catch (e) {
            console.warn(e);
          } finally {
            router.replace("/(auth)/sign_in");
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Settings Hub</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            Smooth Operation & System Controls
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.text}
            colors={[theme.text]}
          />
        }
      >
        {SETTINGS_CATEGORIES.map((category) => (
          <View key={category.title} style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              {category.title}
            </Text>

            {category.items.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.settingCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    shadowColor: theme.cardShadow,
                  },
                ]}
                onPress={() => router.push(`/settings/${item.key}` as any)}
                activeOpacity={0.78}
              >
                <View style={[styles.iconBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Ionicons name={item.icon} size={20} color={theme.text} />
                </View>

                <View style={styles.settingTextCol}>
                  <Text style={[styles.settingLabel, { color: theme.text }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={[styles.settingDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                    {item.desc}
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        ))}

        {/* Sign Out CTA */}
        <TouchableOpacity
          style={[styles.signOutBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
          <Text style={styles.signOutBtnText}>Log Out of ParkZone</Text>
        </TouchableOpacity>

        <Text style={[styles.versionText, { color: theme.textMuted }]}>
          ParkZone Engine • Build 2026.10 • City of Kigali Smart Urban Grid
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Settings;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: 0,
    gap: 14,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: "400",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 110,
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 4,
  },
  settingCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  settingTextCol: {
    flex: 1,
    paddingRight: 10,
  },
  settingLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  settingDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  signOutBtn: {
    flexDirection: "row",
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  signOutBtnText: {
    color: "#EF4444",
    fontSize: 13,
    fontWeight: "600",
  },
  versionText: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 20,
    fontWeight: "400",
  },
});