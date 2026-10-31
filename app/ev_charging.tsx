import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../hooks/useTheme";
import { VerticalUltraRealisticCar } from "../components/UltraRealisticCar";

const { width } = Dimensions.get("window");

export default function EvChargingScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams();

  // Route params with fallbacks matching user screenshot
  const stationName = (params.name as string) || "Kigali Fast EV Hub";
  const bayNumber = (params.bayNumber as string) || "EV-04";
  const initialKwh = params.kwh ? Number(params.kwh) : 72;
  const initialSoc = params.soc ? Number(params.soc) : 71;
  const ratePerKwh = params.rate ? Number(params.rate) : 250; // 250 RWF/kWh or $0.41/kWh
  const currency = (params.currency as string) || "RWF";
  const vehiclePlate = (params.plate as string) || "RAD ••• B";

  // Live charging simulation
  const [currentSoc, setCurrentSoc] = useState(initialSoc);
  const [deliveredKwh, setDeliveredKwh] = useState(initialKwh);
  const [elapsedMins, setElapsedMins] = useState(42);

  // Live increment
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSoc((prev) => (prev >= 100 ? 100 : prev + 1));
      setDeliveredKwh((prev) => Number((prev + 0.1).toFixed(1)));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Total cost calculation: strictly energy, 0 RWF parking fee!
  const totalCost = useMemo(() => {
    return Math.round(deliveredKwh * ratePerKwh);
  }, [deliveredKwh, ratePerKwh]);

  // Formatted display values
  const costDisplay = useMemo(() => {
    if (currency === "$" || currency === "USD") {
      const usdVal = (deliveredKwh * 0.41).toFixed(0);
      return `${usdVal} USD`;
    }
    return `${totalCost.toLocaleString()} RWF`;
  }, [deliveredKwh, totalCost, currency]);

  const rateDisplay = useMemo(() => {
    if (currency === "$" || currency === "USD") {
      return "$0.41/kwh";
    }
    return `${ratePerKwh} RWF/kWh`;
  }, [ratePerKwh, currency]);

  // Handle Stop Charging
  const handleStopCharging = () => {
    Alert.alert(
      "Stop Charging Session",
      `Are you sure you want to stop charging vehicle ${vehiclePlate}?\n\n• Energy Delivered: ${deliveredKwh} kWh\n• Parking Fee: 0 RWF (Free for EV)\n• Total Amount: ${costDisplay}`,
      [
        { text: "Continue Charging", style: "cancel" },
        {
          text: "Stop & Pay",
          style: "destructive",
          onPress: async () => {
            // Remove active ticket from storage
            await AsyncStorage.removeItem("@parkzone_active_ticket").catch(() => {});

            // Route to Transaction Details screen with Pay Now button
            router.push({
              pathname: "/transaction_details",
              params: {
                id: `ev-charge-${Date.now()}`,
                name: stationName,
                address: `EV Charging Bay • ${bayNumber}`,
                bayNumber,
                zoneCode: "EV Green Zone",
                plate: vehiclePlate,
                date: "Today, Just Now",
                duration: "1 Hours",
                durationHours: "1",
                cost: totalCost.toString(),
                currency,
                receiptNumber: `EV-${Date.now().toString().slice(-4)}`,
                violationFine: "0",
                violationReason: "EV Parking Exempt (0 RWF Parking Fee)",
              },
            });
          },
        },
      ]
    );
  };

  // Dimensions for halo & car
  const heroWidth = width - 40;
  const heroHeight = 340;
  const haloCenterY = heroHeight / 2 - 10;
  const haloCenterX = heroWidth / 2;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.isDark ? "#09090B" : "#F4F4F6" }]} edges={["top", "bottom"]}>
      {/* Top Header Row: circular black back button, centered "Charging", circular options button */}
      <View style={styles.topHeaderRow}>
        <TouchableOpacity
          style={[styles.headerCircleBtn, { backgroundColor: theme.isDark ? "#27272A" : "#09090B" }]}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={[styles.headerTitleText, { color: theme.text }]}>Charging</Text>

        <TouchableOpacity
          style={[
            styles.headerCircleBtn,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              borderWidth: 1,
            },
          ]}
          onPress={() => {
            Alert.alert(
              "Station Info",
              `Station: ${stationName}\nBay: ${bayNumber}\nVehicle: ${vehiclePlate}\nCharging Speed: 150 kW DC Fast Charging\nParking Tariff: FREE (0 RWF)`
            );
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        
        <View style={[styles.heroContainer, { width: heroWidth, height: heroHeight }]}>
          {/* SVG Halo & Curved Charging Cable */}
          <Svg width={heroWidth} height={heroHeight} style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id="ambientHaloGrad" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop
                  offset="0%"
                  stopColor={theme.isDark ? "#38BDF8" : "#E0F2FE"}
                  stopOpacity={theme.isDark ? 0.35 : 0.8}
                />
                <Stop
                  offset="60%"
                  stopColor={theme.isDark ? "#1E293B" : "#F0F9FF"}
                  stopOpacity={theme.isDark ? 0.15 : 0.4}
                />
                <Stop offset="100%" stopColor={theme.isDark ? "#09090B" : "#F4F4F6"} stopOpacity={0} />
              </RadialGradient>

              <LinearGradient id="cableGrad" x1="1" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#93C5FD" />
                <Stop offset="100%" stopColor="#CBD5E1" />
              </LinearGradient>
            </Defs>

            {/* Concentric Halo Circles */}
            <Circle cx={haloCenterX} cy={haloCenterY} r={140} fill="url(#ambientHaloGrad)" />
            <Circle
              cx={haloCenterX}
              cy={haloCenterY}
              r={120}
              stroke={theme.isDark ? "rgba(255,255,255,0.06)" : "rgba(224, 242, 254, 0.8)"}
              strokeWidth={1.5}
              fill="none"
            />
            <Circle
              cx={haloCenterX}
              cy={haloCenterY}
              r={90}
              stroke={theme.isDark ? "rgba(255,255,255,0.08)" : "rgba(186, 230, 253, 0.6)"}
              strokeWidth={1.5}
              fill="none"
            />

            {/* EV Charging Cable entering from right edge into the car's right-rear charge port */}
            <Path
              d={`M ${heroWidth} ${haloCenterY - 60} C ${heroWidth - 25} ${haloCenterY - 20}, ${heroWidth - 10} ${haloCenterY + 40}, ${haloCenterX + 80} ${haloCenterY + 36} L ${haloCenterX + 62} ${haloCenterY + 36}`}
              stroke="url(#cableGrad)"
              strokeWidth={5}
              strokeLinecap="round"
              fill="none"
            />

            {/* Plug Connector Handle attached to car */}
            <Path
              d={`M ${haloCenterX + 62} ${haloCenterY + 30} L ${haloCenterX + 48} ${haloCenterY + 33} L ${haloCenterX + 48} ${haloCenterY + 39} L ${haloCenterX + 62} ${haloCenterY + 42} Z`}
              fill="#18181B"
              stroke="#38BDF8"
              strokeWidth={1.5}
            />

            {/* Small Glowing Lightning Bolt on Plug Handle */}
            <Circle cx={haloCenterX + 55} cy={haloCenterY + 36} r={4.5} fill="#38BDF8" />
          </Svg>

          {/* Centered Top-Down Sports Car */}
          <View style={[styles.carPositioner, { top: haloCenterY - 78, left: haloCenterX - 63 }]}>
            <VerticalUltraRealisticCar color="titanium" scale={1.35} />
          </View>
        </View>

        {/* Status Below Car: ⚡ Charging 71% & 72kwh */}
        <View style={styles.statusSection}>
          <View style={styles.chargingBadgeRow}>
            <Ionicons name="link-outline" size={16} color={theme.textSecondary} />
            <Text style={[styles.chargingBadgeText, { color: theme.textSecondary }]}>
              Charging {currentSoc}%
            </Text>
          </View>

          <Text style={[styles.kwhMainText, { color: theme.text }]}>
            {deliveredKwh}kwh
          </Text>

          {/* Free Parking Policy Banner for EV */}
          <View
            style={[
              styles.evExemptPill,
              {
                backgroundColor: theme.isDark ? "rgba(16, 185, 129, 0.15)" : "#ECFDF5",
                borderColor: "#10B981",
              },
            ]}
          >
            <Ionicons name="leaf-outline" size={13} color="#10B981" />
            <Text style={styles.evExemptPillText}>
              EV Exemption: Parking is FREE • Billed strictly for energy
            </Text>
          </View>
        </View>

        {/* Two Information Cards Grid */}
        <View style={styles.cardsGridRow}>
          {/* Card 1: Time Left */}
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                shadowColor: theme.cardShadow,
              },
            ]}
          >
            <View style={styles.cardHeaderRow}>
              <View
                style={[
                  styles.cardIconCircle,
                  {
                    backgroundColor: theme.isDark ? "rgba(255,255,255,0.08)" : "#F4F4F6",
                  },
                ]}
              >
                <Ionicons name="speedometer-outline" size={16} color={theme.text} />
              </View>
              <Text style={[styles.cardHeaderTitle, { color: theme.text }]}>Time Left</Text>
            </View>

            <View style={styles.cardBottomCol}>
              <Text style={[styles.cardSubLabel, { color: theme.textSecondary }]}>Charging Left</Text>
              <Text style={[styles.cardMainValue, { color: theme.text }]}>04.21</Text>
            </View>
          </View>

          {/* Card 2: Total Cost */}
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                shadowColor: theme.cardShadow,
              },
            ]}
          >
            <View style={styles.cardHeaderRow}>
              <View
                style={[
                  styles.cardIconCircle,
                  {
                    backgroundColor: theme.isDark ? "rgba(255,255,255,0.08)" : "#F4F4F6",
                  },
                ]}
              >
                <Ionicons name="cash-outline" size={16} color={theme.text} />
              </View>
              <Text style={[styles.cardHeaderTitle, { color: theme.text }]}>Total Cost</Text>
            </View>

            <View style={styles.cardBottomCol}>
              <Text style={[styles.cardSubLabel, { color: theme.textSecondary }]}>{rateDisplay}</Text>
              <Text style={[styles.cardMainValue, { color: theme.text }]} numberOfLines={1}>
                {costDisplay}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Sticky Action: Stop Charging Button */}
      <View
        style={[
          styles.bottomFixedContainer,
          {
            backgroundColor: theme.isDark ? "#09090B" : "#F4F4F6",
            borderTopColor: theme.border,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.stopChargingBtn, { backgroundColor: theme.isDark ? "#FFFFFF" : "#09090B" }]}
          onPress={handleStopCharging}
          activeOpacity={0.88}
        >
          <Text
            style={[
              styles.stopChargingBtnText,
              { color: theme.isDark ? "#09090B" : "#FFFFFF" },
            ]}
          >
            Stop Charging
          </Text>
        </TouchableOpacity>
      </View>
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
  headerCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleText: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 130,
    alignItems: "center",
  },
  heroContainer: {
    marginTop: 4,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  carPositioner: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  statusSection: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 16,
  },
  chargingBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  chargingBadgeText: {
    fontSize: 14,
    fontWeight: "600",
  },
  kwhMainText: {
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  evExemptPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 8,
  },
  evExemptPillText: {
    color: "#10B981",
    fontSize: 11,
    fontWeight: "700",
  },
  cardsGridRow: {
    width: "100%",
    flexDirection: "row",
    gap: 14,
    marginTop: 6,
  },
  infoCard: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
    minHeight: 140,
    justifyContent: "space-between",
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  cardBottomCol: {
    marginTop: 18,
  },
  cardSubLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 2,
  },
  cardMainValue: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  bottomFixedContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 28 : 20,
  },
  stopChargingBtn: {
    borderRadius: 28,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  stopChargingBtnText: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
});
