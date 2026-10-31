import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GlassBackground } from "../../components/GlassBackground";
import { useTheme } from "../../hooks/useTheme";
import { ParkingLocation, fetchParkingLocations } from "../services/parking";

const { width } = Dimensions.get("window");
const cardWidth = Math.min(width * 0.78, 310);
const cardHeight = 230;

// High-resolution photography of modern parking infrastructure & EV grids
const DEFAULT_HERO_TOP =
  "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=800&q=80";
const DEFAULT_HERO_MID =
  "https://images.unsplash.com/photo-1590674899484-d5640e854abe?auto=format&fit=crop&w=800&q=80";
const DEFAULT_HERO_BACK =
  "https://images.unsplash.com/photo-1573348722427-f1d6819fdf98?auto=format&fit=crop&w=800&q=80";

export default function WelcomePage() {
  const router = useRouter();
  const theme = useTheme();
  const [liveLocations, setLiveLocations] = useState<ParkingLocation[]>([]);

  useEffect(() => {
    let mounted = true;
    fetchParkingLocations()
      .then((rows) => {
        if (mounted) setLiveLocations(rows);
      })
      .catch(() => {
        if (mounted) setLiveLocations([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const topLocation = liveLocations[0] || null;
  const midLocation = liveLocations[1] || liveLocations[0] || null;

  return (
    <GlassBackground>
      <SafeAreaView style={styles.container}>
        {/* Top Header */}
        <View style={styles.headerRow}>
          <View style={styles.brandTextBox}>
            <Text style={[styles.brandTitle, { color: theme.text }]}>ParkZone</Text>
            <Text style={[styles.brandSubtitle, { color: theme.textSecondary }]}>
              Smart Parking & EV Grid
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => router.push("/(auth)/sign_in")}
            style={[
              styles.skipBtn,
              {
                backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)",
                borderColor: theme.border,
              },
            ]}
            activeOpacity={0.7}
          >
            <Text style={[styles.skipText, { color: theme.textSecondary }]}>Skip</Text>
          </TouchableOpacity>
        </View>

        {/* Center Stage: 3 Stacked Floating Glassmorphic Cards Synced with Database */}
        <View style={styles.cardsStage}>
          {/* Card 1: Background Silhouette Glass Layer with Real Infrastructure Image */}
          <View
            style={[
              styles.stackCardBackdrop,
              {
                backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.03)",
                borderColor: theme.isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)",
                overflow: "hidden",
              },
            ]}
          >
            <Image
              source={{ uri: DEFAULT_HERO_BACK }}
              style={styles.cardCoverImage}
              resizeMode="cover"
            />
            <View style={styles.imageDarkGradient} />
          </View>

          {/* Card 2: Middle Floating Glassmorphic Card with Real Image */}
          <View
            style={[
              styles.stackCardMiddle,
              {
                backgroundColor: theme.isDark ? "rgba(24, 24, 27, 0.85)" : "rgba(255, 255, 255, 0.85)",
                borderColor: theme.isDark ? "rgba(255, 255, 255, 0.14)" : "rgba(0, 0, 0, 0.08)",
                shadowColor: "#000000",
                shadowOpacity: theme.isDark ? 0.35 : 0.08,
              },
            ]}
          >
            <View style={styles.cardImageContainer}>
              <Image
                source={{ uri: midLocation?.image_url || DEFAULT_HERO_MID }}
                style={styles.cardCoverImage}
                resizeMode="cover"
              />
              <View style={styles.imageDarkGradient} />

              {/* Overlaid Glass Chip */}
              <View
                style={[
                  styles.imageFloatingChip,
                  {
                    backgroundColor: theme.isDark ? "rgba(0, 0, 0, 0.65)" : "rgba(255, 255, 255, 0.85)",
                    borderColor: theme.isDark ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.1)",
                  },
                ]}
              >
                <View style={[styles.chipDot, { backgroundColor: theme.isDark ? "#FFFFFF" : "#09090B" }]} />
                <Text style={[styles.chipText, { color: theme.text }]}>
                  {midLocation ? `${midLocation.zone_code || "Live"} • Sensor Sync` : "Realtime Telemetry"}
                </Text>
              </View>
            </View>

            {/* Bottom Glass Info Row */}
            <View style={styles.cardInfoRow}>
              <View style={styles.cardInfoTextGroup}>
                <Text style={[styles.cardMainTitle, { color: theme.text }]} numberOfLines={1}>
                  {midLocation ? midLocation.name : "Live Parking Network"}
                </Text>
                <Text style={[styles.cardMainSub, { color: theme.textSecondary }]} numberOfLines={1}>
                  {midLocation
                    ? `${midLocation.address} • ${midLocation.available_spots} Available`
                    : "300 RWF/hr • Realtime bay availability"}
                </Text>
              </View>
              <View
                style={[
                  styles.cardActionPill,
                  {
                    backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.06)",
                    borderColor: theme.border,
                  },
                ]}
              >
                <Text style={[styles.cardActionPillText, { color: theme.text }]}>
                  Live
                </Text>
              </View>
            </View>
          </View>

          {/* Card 3: Top Tilted Hero Glassmorphic Card with Real Image */}
          <View
            style={[
              styles.stackCardTop,
              {
                backgroundColor: theme.isDark ? "rgba(18, 18, 20, 0.92)" : "rgba(255, 255, 255, 0.92)",
                borderColor: theme.isDark ? "rgba(255, 255, 255, 0.22)" : "rgba(0, 0, 0, 0.12)",
                shadowColor: "#000000",
                shadowOpacity: theme.isDark ? 0.45 : 0.16,
              },
            ]}
          >
            <View style={styles.topCardImageContainer}>
              <Image
                source={{ uri: topLocation?.image_url || DEFAULT_HERO_TOP }}
                style={styles.cardCoverImage}
                resizeMode="cover"
              />
              <View style={styles.imageDarkGradient} />

              {/* Overlaid Frosted Glass Status Badge */}
              <View
                style={[
                  styles.imageFloatingChip,
                  {
                    backgroundColor: theme.isDark ? "rgba(9, 9, 11, 0.72)" : "rgba(255, 255, 255, 0.88)",
                    borderColor: theme.isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.12)",
                  },
                ]}
              >
                <Ionicons name="flash" size={11} color={theme.text} />
                <Text style={[styles.chipText, { color: theme.text }]}>
                  {topLocation ? `${topLocation.name}` : "EV Charging & Smart Bays"}
                </Text>
              </View>
            </View>

            {/* Bottom Info Row */}
            <View style={styles.cardInfoRow}>
              <View style={styles.cardInfoTextGroup}>
                <Text style={[styles.cardMainTitle, { color: theme.text }]} numberOfLines={1}>
                  {topLocation ? topLocation.name : "ParkZone Smart Grid"}
                </Text>
                <Text style={[styles.cardMainSub, { color: theme.textSecondary }]} numberOfLines={1}>
                  {topLocation
                    ? `${topLocation.available_spots} Free • ${topLocation.hourly_rate} RWF/hr`
                    : "Live Database Occupancy & EV Telemetry"}
                </Text>
              </View>

              <View
                style={[
                  styles.cardActionPill,
                  {
                    backgroundColor: theme.primaryBtnBg,
                    borderColor: theme.primaryBtnBg,
                  },
                ]}
              >
                <Text style={[styles.cardActionPillText, { color: theme.primaryBtnText }]}>
                  Park
                </Text>
                <Ionicons name="arrow-forward" size={11} color={theme.primaryBtnText} style={{ marginLeft: 3 }} />
              </View>
            </View>
          </View>

          {/* Floating Glassmorphic Badge - Right Side (Live Telemetry) */}
          <View
            style={[
              styles.floatingBadgeRight,
              {
                backgroundColor: theme.isDark ? "rgba(24, 24, 27, 0.88)" : "rgba(255, 255, 255, 0.9)",
                borderColor: theme.isDark ? "rgba(255, 255, 255, 0.18)" : "rgba(0, 0, 0, 0.1)",
                shadowColor: theme.cardShadow,
                shadowOpacity: theme.isDark ? 0.35 : 0.08,
              },
            ]}
          >
            <Ionicons name="radio" size={18} color={theme.text} />
          </View>

          {/* Floating Glassmorphic Badge - Left Side (Security) */}
          <View
            style={[
              styles.floatingBadgeLeft,
              {
                backgroundColor: theme.isDark ? "rgba(24, 24, 27, 0.88)" : "rgba(255, 255, 255, 0.9)",
                borderColor: theme.isDark ? "rgba(255, 255, 255, 0.18)" : "rgba(0, 0, 0, 0.1)",
                shadowColor: theme.cardShadow,
                shadowOpacity: theme.isDark ? 0.35 : 0.08,
              },
            ]}
          >
            <Ionicons name="shield-checkmark-outline" size={18} color={theme.text} />
          </View>
        </View>

        {/* Bottom Section: Headline & Get Started Action */}
        <View style={styles.bottomSection}>
          {/* Frosted Status Pill */}
          <View
            style={[
              styles.tagBadge,
              {
                backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)",
                borderColor: theme.border,
              },
            ]}
          >
            <View style={[styles.tagDot, { backgroundColor: theme.text }]} />
            <Text style={[styles.tagText, { color: theme.text }]}>SMART URBAN MOBILITY</Text>
          </View>

          {/* Bold Headline */}
          <Text style={[styles.heroHeadline, { color: theme.text }]}>
            Smart parking{"\n"}smarter journeys
          </Text>

          <Text style={[styles.heroDescription, { color: theme.textSecondary }]}>
            Official digital parking concession for Kigali. Seamless cashless payments, verified e-tickets, and live space availability.
          </Text>

          {/* Bottom Action Row */}
          <View style={styles.actionRow}>
            {/* Action Button: Get Started with Arrow Icon */}
            <TouchableOpacity
              style={[
                styles.getStartedPill,
                {
                  backgroundColor: theme.primaryBtnBg,
                  shadowColor: theme.isDark ? "#FFFFFF" : "#000000",
                  shadowOpacity: theme.isDark ? 0.22 : 0.16,
                },
              ]}
              onPress={() => router.push("/(auth)/sign_in")}
              activeOpacity={0.88}
            >
              <Text style={[styles.getStartedText, { color: theme.primaryBtnText }]}>
                Get Started
              </Text>
              <View
                style={[
                  styles.arrowCircle,
                  {
                    backgroundColor: theme.isDark ? "rgba(0, 0, 0, 0.18)" : "rgba(255, 255, 255, 0.24)",
                  },
                ]}
              >
                <Ionicons name="arrow-forward" size={17} color={theme.primaryBtnText} />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  brandTextBox: {},
  brandTitle: {
    fontSize: 19,
    fontWeight: "600",
    letterSpacing: -0.4,
  },
  brandSubtitle: {
    fontSize: 11,
    fontWeight: "400",
    letterSpacing: 0.2,
  },
  skipBtn: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  skipText: {
    fontSize: 12,
    fontWeight: "500",
  },

  /* 3 Stacked Cards Stage */
  cardsStage: {
    height: 310,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginVertical: 10,
  },
  stackCardBackdrop: {
    position: "absolute",
    width: cardWidth * 0.92,
    height: 220,
    borderRadius: 28,
    borderWidth: 1,
    top: 10,
    transform: [{ rotate: "4deg" }],
    zIndex: 1,
  },
  stackCardMiddle: {
    position: "absolute",
    width: cardWidth,
    height: cardHeight,
    borderRadius: 26,
    borderWidth: 1,
    padding: 10,
    justifyContent: "space-between",
    bottom: 12,
    right: 18,
    zIndex: 2,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 4,
  },
  cardImageContainer: {
    height: 140,
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
  },
  topCardImageContainer: {
    height: 135,
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
  },
  cardCoverImage: {
    width: "100%",
    height: "100%",
  },
  imageDarkGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.18)",
  },
  imageFloatingChip: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipText: {
    fontSize: 10.5,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  cardInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  cardInfoTextGroup: {
    flex: 1,
  },
  cardMainTitle: {
    fontSize: 14.5,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  cardMainSub: {
    fontSize: 11,
    fontWeight: "400",
    marginTop: 2,
  },
  cardActionPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardActionPillText: {
    fontSize: 11,
    fontWeight: "500",
  },

  /* Top Tilted Card */
  stackCardTop: {
    position: "absolute",
    width: cardWidth * 0.9,
    height: cardHeight,
    borderRadius: 26,
    borderWidth: 1,
    padding: 10,
    justifyContent: "space-between",
    top: 4,
    left: 10,
    transform: [{ rotate: "-9deg" }],
    zIndex: 3,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 8,
  },

  /* Floating Badges */
  floatingBadgeRight: {
    position: "absolute",
    top: 46,
    right: 4,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  floatingBadgeLeft: {
    position: "absolute",
    bottom: 46,
    left: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },

  /* Bottom Section */
  bottomSection: {
    paddingTop: 8,
  },
  tagBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 14,
    marginBottom: 10,
  },
  tagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  tagText: {
    fontSize: 9.5,
    fontWeight: "500",
    letterSpacing: 0.8,
  },
  heroHeadline: {
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.8,
    lineHeight: 38,
    marginBottom: 8,
  },
  heroDescription: {
    fontSize: 13,
    lineHeight: 18.5,
    marginBottom: 18,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  getStartedPill: {
    flex: 1,
    height: 54,
    borderRadius: 27,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 22,
    paddingRight: 10,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 5,
  },
  getStartedText: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  arrowCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});