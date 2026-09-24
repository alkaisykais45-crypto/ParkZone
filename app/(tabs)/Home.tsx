import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

interface ActionProps {
  icon: string;
  title: string;
  onPress: () => void;
}

function Action({ icon, title, onPress }: ActionProps) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.action} activeOpacity={0.7}>
      <View style={styles.actionIcon}>
        <Text style={styles.actionIconText}>{icon}</Text>
      </View>
      <Text style={styles.actionText}>{title}</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const [userName, setUserName] = useState("Aline");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const name =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split("@")[0] ||
            "Driver";
          setUserName(name);
        }
      } catch {
        // Fallback to Aline
      }
    };
    fetchUser();
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <View>
            <Text style={styles.greeting}>Good morning, {userName}</Text>
            <Text style={styles.sub}>Where would you like to park?</Text>
          </View>
          <TouchableOpacity
            style={styles.bell}
            onPress={() => router.push("/settings/notifications")}
            activeOpacity={0.8}
          >
            <Text style={styles.bellIcon}>🔔</Text>
            <View style={styles.dot} />
          </TouchableOpacity>
        </View>

        <View style={styles.search}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search parking locations in Kigali"
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <View style={styles.map}>
          <View style={styles.pin}>
            <Text style={styles.pinText}>P</Text>
          </View>
          <Text style={styles.mapLabel}>Kigali City Centre</Text>
          <Text style={styles.mapCopy}>12 nearby parking zones available</Text>
          <TouchableOpacity
            style={styles.mapButton}
            onPress={() => router.push("/(tabs)/Permits")}
            activeOpacity={0.8}
          >
            <Text style={styles.mapButtonText}>Explore map</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.section}>QUICK ACTIONS</Text>
        <View style={styles.actions}>
          <Action
            icon="▶"
            title="Start parking"
            onPress={() => router.push("/(tabs)/Permits")}
          />
          <Action
            icon="▣"
            title="My vehicles"
            onPress={() => router.push("/(tabs)/vehicles")}
          />
          <Action
            icon="▤"
            title="Buy a permit"
            onPress={() => router.push("/(tabs)/Permits")}
          />
        </View>

        <View style={styles.activityHeader}>
          <Text style={styles.section}>RECENT ACTIVITY</Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/Activities")}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.activity}
          onPress={() => router.push("/(tabs)/Activities")}
          activeOpacity={0.7}
        >
          <View style={styles.activityIcon}>
            <Text style={styles.activityIconText}>P</Text>
          </View>
          <View style={styles.activityDetails}>
            <Text style={styles.activityTitle}>Kigali Heights</Text>
            <Text style={styles.activityText}>Today · 09:40 – 11:15</Text>
          </View>
          <Text style={styles.amount}>1,200 RWF</Text>
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
    paddingBottom: 32,
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  greeting: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
  },
  sub: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
  },
  bell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  bellIcon: {
    fontSize: 18,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
    position: "absolute",
    right: 10,
    top: 10,
  },
  search: {
    height: 52,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchIcon: {
    fontSize: 22,
    color: "#2563EB",
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
  },
  map: {
    height: 200,
    marginTop: 18,
    borderRadius: 20,
    backgroundColor: "#DBEAFE",
    padding: 20,
    position: "relative",
    justifyContent: "space-between",
  },
  pin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  pinText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  mapLabel: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 12,
  },
  mapCopy: {
    fontSize: 13,
    color: "#475569",
    marginTop: 4,
  },
  mapButton: {
    position: "absolute",
    right: 18,
    bottom: 18,
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mapButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  section: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#64748B",
    marginTop: 24,
    marginBottom: 10,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  action: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    width: "31%",
    padding: 12,
    minHeight: 110,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconText: {
    color: "#2563EB",
    fontWeight: "800",
    fontSize: 16,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    color: "#334155",
    marginTop: 12,
  },
  activityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 10,
  },
  seeAll: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
  },
  activity: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  activityIconText: {
    color: "#2563EB",
    fontWeight: "800",
    fontSize: 16,
  },
  activityDetails: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1E293B",
  },
  activityText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 4,
  },
  amount: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1E293B",
  },
});
