import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface SettingConfig {
  title: string;
  subtitle: string;
  fields?: [string, string][];
  options?: string[];
}

const data: Record<string, SettingConfig> = {
  personal: {
    title: "Personal information",
    subtitle: "Keep your account details up to date.",
    fields: [
      ["Full name", "Aline Mukamana"],
      ["Phone number", "+250 788 123 456"],
      ["Email address", "aline.mukamana@email.com"],
    ],
  },
  vehicles: {
    title: "My vehicles",
    subtitle: "Vehicles saved to your ParkZone account in Rwanda.",
    options: [
      "RAB 123 C · Toyota RAV4 (Primary)",
      "RAC 491 F · Volkswagen Golf",
    ],
  },
  payments: {
    title: "Payment methods",
    subtitle: "Manage how you pay for parking sessions.",
    options: [
      "Mobile Money · MTN MoMo (+250 788 123 456)",
      "Visa Card ending in 4242",
      "Airtel Money (+250 733 654 321)",
    ],
  },
  notifications: {
    title: "Notifications",
    subtitle: "Choose which updates ParkZone can send you.",
    options: [
      "Parking session reminders",
      "Payment confirmations",
      "Permit updates",
      "ParkZone news and announcements",
    ],
  },
  language: {
    title: "Language & region",
    subtitle: "Set the way ParkZone appears to you.",
    options: [
      "Language · English",
      "Region · Rwanda",
      "Currency · Rwandan Franc (RWF)",
    ],
  },
  appearance: {
    title: "Appearance",
    subtitle: "Choose your preferred app appearance.",
    options: ["Light Mode (Default)", "Dark Mode", "Use System Default"],
  },
  help: {
    title: "Help centre",
    subtitle: "Find answers or contact the ParkZone support team.",
    options: [
      "Frequently asked questions",
      "Contact support (WhatsApp / Phone)",
      "Report a parking zone issue",
    ],
  },
  privacy: {
    title: "Privacy & security",
    subtitle: "Control your account security and personal data.",
    options: [
      "Change password",
      "Two-factor authentication",
      "Download my data",
      "Delete account",
    ],
  },
  about: {
    title: "About ParkZone",
    subtitle: "Smart parking made simple across Kigali & Rwanda.",
    options: [
      "Version 1.0.0",
      "Terms of service",
      "Privacy policy",
      "Open-source licences",
    ],
  },
};

export default function Setting() {
  const { setting } = useLocalSearchParams<{ setting: string }>();
  const item = data[setting] ?? data.about;
  const [toggles, setToggles] = useState<Record<string, boolean>>({});

  const handleSave = () => {
    Alert.alert("Success", "Your changes have been saved successfully!", [
      { text: "OK", onPress: () => router.back() },
    ]);
  };

  const handleOptionPress = (option: string) => {
    if (option === "Change password") {
      router.push("/(auth)/forgot_pass");
      return;
    }
    if (option.includes("Terms") || option.includes("Privacy policy")) {
      router.push("/(auth)/terms_privacy");
      return;
    }
    Alert.alert(item.title, `${option}`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.back}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{item.title}</Text>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>{item.subtitle}</Text>
        {item.fields?.map(([label, value]) => (
          <View key={label} style={styles.field}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextInput
              defaultValue={value}
              style={styles.input}
              placeholderTextColor="#94A3B8"
            />
          </View>
        ))}
        {item.options?.map((option, index) => (
          <TouchableOpacity
            key={option}
            style={styles.option}
            onPress={() =>
              setting !== "notifications" ? handleOptionPress(option) : undefined
            }
            activeOpacity={setting === "notifications" ? 1 : 0.7}
          >
            <Text style={styles.optionText}>{option}</Text>
            {setting === "notifications" ? (
              <Switch
                value={toggles[option] ?? index < 2}
                onValueChange={(val) =>
                  setToggles({ ...toggles, [option]: val })
                }
                trackColor={{ false: "#CBD5E1", true: "#93C5FD" }}
                thumbColor={
                  (toggles[option] ?? index < 2) ? "#2563EB" : "#FFFFFF"
                }
              />
            ) : (
              <Text style={styles.chevron}>›</Text>
            )}
          </TouchableOpacity>
        ))}
        {item.fields && (
          <TouchableOpacity
            style={styles.save}
            onPress={handleSave}
            activeOpacity={0.8}
          >
            <Text style={styles.saveText}>Save changes</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  back: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    fontSize: 32,
    lineHeight: 33,
    color: "#0F172A",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: "#64748B",
    marginBottom: 20,
  },
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 7,
  },
  input: {
    height: 50,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#0F172A",
  },
  option: {
    minHeight: 58,
    backgroundColor: "#FFFFFF",
    padding: 16,
    marginBottom: 10,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  optionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
    flex: 1,
  },
  chevron: {
    fontSize: 24,
    color: "#94A3B8",
  },
  save: {
    marginTop: 12,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
  },
  saveText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
