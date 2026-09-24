import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface ParkingActivity {
  id: string;
  location: string;
  time: string;
  duration: string;
  plate: string;
  cost: string;
  status: "active" | "completed";
}

const activities: ParkingActivity[] = [
  {
    id: "1",
    location: "Kigali Heights (Zone A)",
    time: "Today · 09:40 – 11:15",
    duration: "1h 35m",
    plate: "RAB 123 C",
    cost: "1,200 RWF",
    status: "completed",
  },
  {
    id: "2",
    location: "UTC Building (Kigali CBD)",
    time: "Yesterday · 14:10 – 16:30",
    duration: "2h 20m",
    plate: "RAB 123 C",
    cost: "2,000 RWF",
    status: "completed",
  },
  {
    id: "3",
    location: "Remera Gisimenti Corner",
    time: "20 Sep 2026 · 18:00 – 21:00",
    duration: "3h 00m",
    plate: "RAC 491 F",
    cost: "2,500 RWF",
    status: "completed",
  },
  {
    id: "4",
    location: "CHUK Hospital Parking",
    time: "18 Sep 2026 · 10:15 – 12:00",
    duration: "1h 45m",
    plate: "RAB 123 C",
    cost: "1,500 RWF",
    status: "completed",
  },
];

export default function ActivitiesScreen() {
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

  const filteredActivities = activities.filter((act) => {
    if (filter === "all") return true;
    return act.status === filter;
  });

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Activity</Text>
        <Text style={styles.sub}>Your parking session history</Text>

        <View style={styles.filterRow}>
          {(["all", "completed"] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.filterButton,
                filter === tab && styles.filterButtonActive,
              ]}
              onPress={() => setFilter(tab)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === tab && styles.filterTextActive,
                ]}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {filteredActivities.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.icon}>
              <Text style={styles.iconText}>P</Text>
            </View>
            <View style={styles.copy}>
              <View style={styles.titleRow}>
                <Text style={styles.name}>{item.location}</Text>
              </View>
              <Text style={styles.detail}>{item.time}</Text>
              <Text style={styles.plate}>{item.plate} · {item.duration}</Text>
            </View>
            <View style={styles.priceContainer}>
              <Text style={styles.price}>{item.cost}</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Paid</Text>
              </View>
            </View>
          </View>
        ))}
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
  filterRow: {
    flexDirection: "row",
    marginBottom: 18,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  filterButtonActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  filterText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  filterTextActive: {
    color: "#FFFFFF",
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
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#2563EB",
  },
  copy: {
    flex: 1,
    marginLeft: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  name: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1E293B",
  },
  detail: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 3,
  },
  plate: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
    fontWeight: "600",
  },
  priceContainer: {
    alignItems: "flex-end",
  },
  price: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1E293B",
  },
  badge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#15803D",
  },
});
