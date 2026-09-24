import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

interface GroupItem {
  label: string;
  caption: string;
  icon: string;
  route: string;
}

interface SettingsGroup {
  title: string;
  items: GroupItem[];
}

const groups: SettingsGroup[] = [
  {
    title: "ACCOUNT",
    items: [
      {
        label: "Personal information",
        caption: "Name, phone and email",
        icon: "◉",
        route: "personal",
      },
      {
        label: "My vehicles",
        caption: "Manage registered vehicles",
        icon: "▣",
        route: "vehicles",
      },
      {
        label: "Payment methods",
        caption: "Cards and mobile money",
        icon: "▤",
        route: "payments",
      },
    ],
  },
  {
    title: "PREFERENCES",
    items: [
      {
        label: "Notifications",
        caption: "Parking reminders and updates",
        icon: "♧",
        route: "notifications",
      },
      {
        label: "Language & region",
        caption: "English · Rwanda",
        icon: "◎",
        route: "language",
      },
      {
        label: "Appearance",
        caption: "Light",
        icon: "☼",
        route: "appearance",
      },
    ],
  },
  {
    title: "SUPPORT & LEGAL",
    items: [
      {
        label: "Help centre",
        caption: "FAQ and customer support",
        icon: "?",
        route: "help",
      },
      {
        label: "Privacy & security",
        caption: "Account security and data",
        icon: "⌑",
        route: "privacy",
      },
      {
        label: "About ParkZone",
        caption: "Version 1.0.0",
        icon: "i",
        route: "about",
      },
    ],
  },
];

export default function ProfileScreen() {
  const [quickParking, setQuickParking] = useState(true);
  const [name, setName] = useState("Aline Mukamana");
  const [email, setEmail] = useState("aline.mukamana@email.com");
  const [initials, setInitials] = useState("AM");

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const userEmail = user.email || "driver@parkzone.rw";
          setEmail(userEmail);
          const fullName =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            userEmail.split("@")[0];
          setName(fullName);

          const parts = fullName.split(" ").filter(Boolean);
          if (parts.length >= 2) {
            setInitials(
              (parts[0][0] + parts[1][0]).toUpperCase()
            );
          } else if (parts.length === 1 && parts[0].length >= 2) {
            setInitials(parts[0].slice(0, 2).toUpperCase());
          }
        }
      } catch {
        // Fallback default profile
      }
    };
    loadProfile();
  }, []);

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            await supabase.auth.signOut();
          } catch {
            // ignore error
          } finally {
            router.replace("/(auth)/sign_in");
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.title}>Profile</Text>

        <TouchableOpacity
          style={styles.profileCard}
          activeOpacity={0.85}
          onPress={() => router.push("/settings/personal")}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.contact}>{email}</Text>
            <Text style={styles.edit}>View and edit profile</Text>
          </View>
          <Text style={styles.chevronWhite}>›</Text>
        </TouchableOpacity>

        <View style={styles.quick}>
          <View>
            <Text style={styles.quickTitle}>Quick parking</Text>
            <Text style={styles.quickText}>Start a session faster</Text>
          </View>
          <Switch
            value={quickParking}
            onValueChange={setQuickParking}
            trackColor={{ false: "#CBD5E1", true: "#93C5FD" }}
            thumbColor={quickParking ? "#2563EB" : "#F8FAFC"}
          />
        </View>

        {groups.map((group) => (
          <View key={group.title} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <View style={styles.list}>
              {group.items.map((item, index) => (
                <TouchableOpacity
                  key={item.route}
                  style={[
                    styles.row,
                    index < group.items.length - 1 && styles.border,
                  ]}
                  onPress={() => router.push(`/settings/${item.route}` as any)}
                  activeOpacity={0.7}
                >
                  <View style={styles.rowIcon}>
                    <Text style={styles.rowIconText}>{item.icon}</Text>
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowLabel}>{item.label}</Text>
                    {!!item.caption && (
                      <Text style={styles.rowCaption}>{item.caption}</Text>
                    )}
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={styles.signOut}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <Text style={styles.signOutText}>Sign out</Text>
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
    marginBottom: 20,
  },
  profileCard: {
    backgroundColor: "#2563EB",
    borderRadius: 20,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#DBEAFE",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1D4ED8",
  },
  profileInfo: {
    flex: 1,
    marginLeft: 14,
  },
  name: {
    fontSize: 17,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  contact: {
    fontSize: 12,
    color: "#DBEAFE",
    marginTop: 3,
  },
  edit: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: 8,
  },
  chevronWhite: {
    fontSize: 28,
    color: "#DBEAFE",
  },
  chevron: {
    fontSize: 26,
    color: "#94A3B8",
  },
  quick: {
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  quickTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  quickText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 3,
  },
  group: {
    marginTop: 24,
  },
  groupTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#64748B",
    marginBottom: 8,
    marginLeft: 4,
  },
  list: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  row: {
    minHeight: 68,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  border: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2563EB",
  },
  rowCopy: {
    flex: 1,
    marginLeft: 12,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
  },
  rowCaption: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 3,
  },
  signOut: {
    marginTop: 28,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    borderRadius: 14,
    padding: 15,
    alignItems: "center",
  },
  signOutText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#DC2626",
  },
});
