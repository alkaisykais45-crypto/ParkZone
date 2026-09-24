import { router } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface VehicleItem {
  id: string;
  plate: string;
  name: string;
  detail: string;
  isPrimary: boolean;
}

const defaultVehicles: VehicleItem[] = [
  {
    id: "1",
    plate: "RAB 123 C",
    name: "Toyota RAV4",
    detail: "Primary vehicle · Active",
    isPrimary: true,
  },
  {
    id: "2",
    plate: "RAC 491 F",
    name: "Volkswagen Golf",
    detail: "Secondary vehicle",
    isPrimary: false,
  },
];

export default function VehiclesScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>My vehicles</Text>
        <Text style={styles.sub}>Your registered vehicles in Rwanda</Text>

        {defaultVehicles.map((vehicle) => (
          <TouchableOpacity
            key={vehicle.id}
            style={styles.card}
            onPress={() => router.push("/settings/vehicles")}
            activeOpacity={0.7}
          >
            <View style={styles.plate}>
              <Text style={styles.plateText}>{vehicle.plate}</Text>
            </View>
            <View style={styles.copy}>
              <Text style={styles.name}>{vehicle.name}</Text>
              <Text style={styles.detail}>{vehicle.detail}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push("/settings/vehicles")}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>+ Add New Vehicle</Text>
        </TouchableOpacity>
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
    marginBottom: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  plate: {
    borderWidth: 1.5,
    borderColor: "#2563EB",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#EFF6FF",
  },
  plateText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1D4ED8",
    letterSpacing: 0.5,
  },
  copy: {
    flex: 1,
    marginLeft: 14,
  },
  name: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1E293B",
  },
  detail: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 3,
  },
  chevron: {
    fontSize: 26,
    color: "#94A3B8",
  },
  button: {
    backgroundColor: "#2563EB",
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
