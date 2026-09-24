import { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface PermitTier {
  id: string;
  name: string;
  duration: string;
  price: string;
  popular?: boolean;
}

const permitTiers: PermitTier[] = [
  {
    id: "daily",
    name: "Day Pass",
    duration: "24 Hours access",
    price: "2,000 RWF",
  },
  {
    id: "weekly",
    name: "Weekly Permit",
    duration: "7 Days unlimited",
    price: "10,000 RWF",
    popular: true,
  },
  {
    id: "monthly",
    name: "Monthly Resident Permit",
    duration: "30 Days unlimited",
    price: "35,000 RWF",
  },
];

export default function PermitsScreen() {
  const [selectedTier, setSelectedTier] = useState<string>("weekly");

  const handleBuyPermit = (tier: PermitTier) => {
    Alert.alert(
      "Purchase Permit",
      `Would you like to purchase the ${tier.name} for ${tier.price}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => {
            Alert.alert(
              "Permit Activated! 🎉",
              `Your ${tier.name} has been issued and linked to your primary vehicle.`
            );
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Parking permits</Text>
        <Text style={styles.sub}>Simple parking across Kigali for every journey.</Text>

        <View style={styles.heroCard}>
          <Text style={styles.cardTitle}>No active permit</Text>
          <Text style={styles.cardCopy}>
            Get a permit for a day, week, or month and park with confidence.
          </Text>
          <TouchableOpacity
            style={styles.heroButton}
            onPress={() => {
              const tier = permitTiers.find((t) => t.id === selectedTier) || permitTiers[0];
              handleBuyPermit(tier);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.heroButtonText}>Buy selected permit</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>AVAILABLE PERMITS</Text>

        {permitTiers.map((tier) => {
          const isSelected = selectedTier === tier.id;
          return (
            <TouchableOpacity
              key={tier.id}
              style={[styles.tierCard, isSelected && styles.tierCardSelected]}
              onPress={() => setSelectedTier(tier.id)}
              activeOpacity={0.7}
            >
              <View style={styles.tierInfo}>
                <View style={styles.tierNameRow}>
                  <Text style={styles.tierName}>{tier.name}</Text>
                  {tier.popular && (
                    <View style={styles.popularBadge}>
                      <Text style={styles.popularBadgeText}>POPULAR</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.tierDuration}>{tier.duration}</Text>
              </View>
              <View style={styles.priceContainer}>
                <Text style={styles.tierPrice}>{tier.price}</Text>
                <View
                  style={[styles.radio, isSelected && styles.radioSelected]}
                >
                  {isSelected && <View style={styles.radioInner} />}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        <Text style={styles.caption}>
          Permits apply to all designated ParkZone locations in Rwanda.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0F172A",
  },
  sub: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 4,
    marginBottom: 20,
  },
  heroCard: {
    backgroundColor: "#2563EB",
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  cardCopy: {
    fontSize: 13,
    lineHeight: 20,
    color: "#DBEAFE",
    marginTop: 8,
  },
  heroButton: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignSelf: "flex-start",
    borderRadius: 12,
    marginTop: 18,
  },
  heroButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#2563EB",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#64748B",
    marginBottom: 12,
    marginLeft: 2,
  },
  tierCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  tierCardSelected: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  tierInfo: {
    flex: 1,
  },
  tierNameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  tierName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1E293B",
  },
  popularBadge: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  popularBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },
  tierDuration: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 3,
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  tierPrice: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    marginRight: 10,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: "#2563EB",
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#2563EB",
  },
  caption: {
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 20,
  },
});
