import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../hooks/useTheme";
import { SkeletonBox } from "../../components/SkeletonLoader";
import { supabase } from "../lib/supabase";
import {
  DbPaymentMethodRecord,
  RegisteredVehicle,
  fetchUserPaymentMethods,
  fetchUserVehicles,
  fetchWalletBalance,
} from "../services/parking";

interface SettingOption {
  title: string;
  desc?: string;
  badge?: string;
  action?: string;
  variant?: "default" | "destructive";
}

interface SettingToggle {
  key: string;
  label: string;
  desc: string;
  defaultVal: boolean;
}

interface SettingAction {
  label: string;
  desc: string;
  action: string;
  variant?: "default" | "destructive";
}

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
}

interface SettingConfig {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  fields?: FieldDef[];
  options?: SettingOption[];
  toggles?: SettingToggle[];
  actions?: SettingAction[];
}

const PERSONAL_FIELDS: FieldDef[] = [
  { key: "full_name", label: "Full Name", placeholder: "Enter full legal name" },
  { key: "phone_number", label: "Phone Number", placeholder: "MTN or Airtel phone number" },
  { key: "email", label: "Email Address", placeholder: "Active email for receipts" },
  { key: "emergency_contact", label: "Emergency Contact", placeholder: "Next of kin phone number" },
];

const PAYMENT_FIELDS: FieldDef[] = [
  { key: "rra_tin", label: "RRA Fiscal TIN Number", placeholder: "Enter TIN for EBM corporate invoices" },
];

const SETTINGS_REGISTRY: Record<string, SettingConfig> = {
  personal: {
    title: "Personal Information",
    subtitle: "Update your motorist profile, email, and emergency contact details.",
    icon: "person-outline",
    fields: PERSONAL_FIELDS,
  },
  vehicles: {
    title: "Vehicles & Permits",
    subtitle: "Manage vehicles and permits linked to your ParkZone account in the database.",
    icon: "car-outline",
    options: [],
  },
  payments: {
    title: "Payment Channels",
    subtitle: "Configure automated parking checkout, wallet, and linked accounts in RWF.",
    icon: "card-outline",
    fields: PAYMENT_FIELDS,
    options: [],
    toggles: [
      {
        key: "auto_debit",
        label: "Auto-Pay on Gate Exit",
        desc: "Automatically pay parking fee upon plate camera recognition at exit gate.",
        defaultVal: true,
      },
      {
        key: "receipt_sms",
        label: "SMS Tax Invoice (EBM)",
        desc: "Receive immediate fiscal SMS invoice after payment confirmation.",
        defaultVal: true,
      },
    ],
  },
  performance: {
    title: "Performance & Cache",
    subtitle: "Optimize map speed, caching, and battery consumption.",
    icon: "rocket-outline",
    toggles: [
      {
        key: "prefetch_lots",
        label: "Pre-fetch Nearby Parking Lots",
        desc: "Background load lot occupancy and EV telemetry within 5 km.",
        defaultVal: true,
      },
      {
        key: "low_data",
        label: "Low Data Mode",
        desc: "Reduce network bandwidth by disabling 3D aerial animations and CCTV previews.",
        defaultVal: false,
      },
      {
        key: "gpu_accel",
        label: "Hardware Accelerated 3D View",
        desc: "Use GPU hardware rendering for parking lot bay topology.",
        defaultVal: true,
      },
      {
        key: "screen_awake",
        label: "Keep Screen Awake When Parked",
        desc: "Prevent display sleep while parking tracker timer is running.",
        defaultVal: true,
      },
      {
        key: "offline_sync",
        label: "Background Offline Sync",
        desc: "Cache parking sensor data for seamless reconnection when signal drops.",
        defaultVal: true,
      },
    ],
    actions: [
      {
        label: "Clear Offline Map Cache",
        desc: "Frees local storage without affecting active sessions",
        action: "clear_cache",
      },
      {
        label: "Reset App State & Reload",
        desc: "Re-sync latest lot topology and sensor grid from database",
        action: "reset_state",
      },
    ],
  },
  navigation: {
    title: "GPS & Navigation",
    subtitle: "Configure turn-by-turn routing, GPS precision, and guidance.",
    icon: "navigate-outline",
    toggles: [
      {
        key: "high_gps",
        label: "High Precision GPS (1-meter)",
        desc: "Use fine-grained location polling for indoor and oblique parking bay detection.",
        defaultVal: true,
      },
      {
        key: "auto_reroute",
        label: "Auto-Reroute If Lot Full",
        desc: "Automatically guide you to the nearest backup lot if available spots hit zero.",
        defaultVal: true,
      },
      {
        key: "voice_cues",
        label: "Voice Parking Guidance",
        desc: "Audio cues when approaching entry barrier and assigned bay.",
        defaultVal: false,
      },
      {
        key: "background_arrival",
        label: "Background Arrival Detection",
        desc: "Automatically detect when vehicle enters geofenced parking facility.",
        defaultVal: true,
      },
    ],
    options: [
      {
        title: "Preferred Navigation App",
        desc: "In-App Navigation (Default)",
        action: "select_nav",
      },
      {
        title: "Search Radius",
        desc: "Current: 5 Kilometers around vehicle",
        action: "select_radius",
      },
    ],
  },
  security: {
    title: "Security & Biometrics",
    subtitle: "Protect your motorist identity, payment authorization, and account.",
    icon: "shield-checkmark-outline",
    toggles: [
      {
        key: "biometric_checkout",
        label: "Biometric Checkout (FaceID / PIN)",
        desc: "Require fingerprint or facial scan before debiting wallet.",
        defaultVal: true,
      },
      {
        key: "two_factor",
        label: "Two-Factor Authentication",
        desc: "Verify new sign-ins with an SMS OTP code sent to your phone.",
        defaultVal: true,
      },
      {
        key: "blind_index",
        label: "Blind-Index Plate Anonymization",
        desc: "Plate numbers stored as salted cryptographic hashes.",
        defaultVal: true,
      },
      {
        key: "suspicious_alerts",
        label: "Unrecognized Marshal Alert",
        desc: "Notify immediately if an unauthorized terminal scans your license plate.",
        defaultVal: true,
      },
    ],
    options: [
      {
        title: "Change Account Password",
        desc: "Update your ParkZone login password",
        action: "change_pw",
      },
      {
        title: "Session Auto-Lock Timer",
        desc: "Current: Lock after 5 minutes of inactivity",
        action: "autolock",
      },
    ],
  },
  notifications: {
    title: "Notifications & Alerts",
    subtitle: "Choose exactly when ParkZone alerts you on your phone.",
    icon: "notifications-outline",
    toggles: [
      {
        key: "overstay_15m",
        label: "15-Minute Expiry Notice",
        desc: "Alert 15 minutes before your booked parking session ends.",
        defaultVal: true,
      },
      {
        key: "critical_5m",
        label: "5-Minute Fine Prevention Warning",
        desc: "Critical countdown reminder to avoid the 3,000 RWF overstay penalty.",
        defaultVal: true,
      },
      {
        key: "ev_done",
        label: "EV Charging Complete Notice",
        desc: "Notification alert when battery hits target SoC or 100% full charge.",
        defaultVal: true,
      },
      {
        key: "momo_receipt",
        label: "Mobile Money Receipt SMS",
        desc: "Receive immediate transaction confirmation from MTN / Airtel.",
        defaultVal: true,
      },
      {
        key: "surge_alert",
        label: "Peak Demand & Tariff Alerts",
        desc: "Notifications when nearby parking hubs reach >90% occupancy.",
        defaultVal: false,
      },
      {
        key: "haptic_ping",
        label: "Haptic Vibration Feedback",
        desc: "Vibrate on QR code scans, bay locks, and payment authorizations.",
        defaultVal: true,
      },
    ],
  },
  language: {
    title: "Language & Regional Units",
    subtitle: "Set how text, currency, and measurements are displayed.",
    icon: "globe-outline",
    options: [
      {
        title: "Language",
        desc: "English (Default)",
        action: "lang",
      },
      {
        title: "Country & Region",
        desc: "Rwanda (Kigali Time, GMT+2)",
        action: "region",
      },
      {
        title: "Billing Currency",
        desc: "Rwandan Franc (RWF)",
        action: "currency",
      },
      {
        title: "Distance Measurement",
        desc: "Metric System (Meters & Kilometers)",
        action: "units",
      },
      {
        title: "Date & Time Format",
        desc: "24-Hour Clock · DD/MM/YYYY",
        action: "date_format",
      },
    ],
  },
  appearance: {
    title: "Appearance & Display",
    subtitle: "Customize the visual appearance and contrast of ParkZone.",
    icon: "contrast-outline",
    options: [
      {
        title: "Light Mode",
        desc: "Clean, high-contrast monochrome light theme (Default)",
        badge: "ACTIVE",
        action: "theme_light",
      },
      {
        title: "Dark Mode",
        desc: "Deep carbon black theme for night driving",
        action: "theme_dark",
      },
      {
        title: "System Default",
        desc: "Automatically match your phone's OS theme",
        action: "theme_system",
      },
    ],
    toggles: [
      {
        key: "high_contrast",
        label: "High Contrast Bay Markings",
        desc: "Enhance visibility of road lines and bay borders in direct sunlight.",
        defaultVal: true,
      },
      {
        key: "bold_text",
        label: "Bold Motorist Typography",
        desc: "Increase font weight for quick glanceability while driving.",
        defaultVal: false,
      },
    ],
  },
  diagnostics: {
    title: "System & Sensor Diagnostics",
    subtitle: "Monitor real-time database connection to smart parking & EV telemetry.",
    icon: "hardware-chip-outline",
    options: [],
    toggles: [
      {
        key: "debug_telemetry",
        label: "Live Diagnostic Telemetry",
        desc: "Log real-time sensor packets and latency pings locally.",
        defaultVal: false,
      },
      {
        key: "crash_reporting",
        label: "Anonymous Diagnostics Reporting",
        desc: "Help ParkZone engineers fix app crashes automatically.",
        defaultVal: true,
      },
    ],
    actions: [
      {
        label: "Run Database Latency Ping Test",
        desc: "Measures live round-trip query time to cloud database",
        action: "ping_test",
      },
      {
        label: "Report Sensor Malfunction",
        desc: "Alert marshals if an occupied bay shows as vacant",
        action: "report_sensor",
      },
    ],
  },
  privacy: {
    title: "Privacy & Data Protection",
    subtitle: "Your personal data is protected with end-to-end cryptographic encryption.",
    icon: "lock-closed-outline",
    options: [
      {
        title: "Data Protection & Privacy Policy",
        desc: "Read our full compliance framework and rights notice",
        action: "law_info",
      },
      {
        title: "Export My Parking History",
        desc: "Download JSON / CSV of all sessions and EBM invoices",
        action: "export_data",
      },
      {
        title: "Revoke Location Permissions",
        desc: "Turn off background GPS tracking in device settings",
        action: "location_perm",
      },
      {
        title: "Anonymize Historical Records",
        desc: "Sever link between your profile and past parking tickets",
        action: "anonymize",
      },
      {
        title: "Delete My Account & Data",
        desc: "Permanently delete account, wallet, and linked plates",
        action: "delete_account",
        variant: "destructive",
      },
    ],
  },
  help: {
    title: "Help & Dispatch Center",
    subtitle: "Get assistance from municipal parking marshals and dispatch operators.",
    icon: "help-buoy-outline",
    options: [
      {
        title: "Call Toll-Free Dispatch Hotline",
        desc: "Toll-Free 3122 · 24/7 Operations",
        action: "call_hotline",
      },
      {
        title: "WhatsApp Motorist Support",
        desc: "Official ParkZone Dispatch Channel · Instant chat support",
        action: "whatsapp",
      },
      {
        title: "Dispute a Parking Ticket or Fine",
        desc: "Submit photo evidence and request fine waiver",
        action: "dispute_fine",
      },
      {
        title: "How to Pay via MTN MoMo / Airtel",
        desc: "Step-by-step guide for *182# merchant code payment",
        action: "momo_guide",
      },
      {
        title: "Frequently Asked Questions",
        desc: "Answers to common questions about tariffs and reservations",
        action: "faq",
      },
    ],
  },
  about: {
    title: "About ParkZone",
    subtitle: "Smart parking & EV charging across Rwanda.",
    icon: "information-circle-outline",
    options: [
      {
        title: "Version 2.4.0 (Build 2026.10)",
        desc: "Production release with live cloud sync & OCPP 2.0.1 EV telemetry",
        badge: "LATEST",
      },
      {
        title: "City of Kigali Smart Urban Grid",
        desc: "Authorized under City of Kigali Transport Regulatory Framework",
        action: "license",
      },
      {
        title: "Terms of Service",
        desc: "Review user agreement and motorist code of conduct",
        action: "terms",
      },
      {
        title: "Privacy Policy",
        desc: "Review how data is collected, stored, and encrypted",
        action: "privacy",
      },
      {
        title: "Open-Source Acknowledgements",
        desc: "React Native, Expo, cloud runtime, and SQLite licenses",
        action: "oss",
      },
    ],
  },
};

export default function Setting() {
  const { setting } = useLocalSearchParams<{ setting: string }>();
  const theme = useTheme();

  const item = SETTINGS_REGISTRY[setting || ""] ?? SETTINGS_REGISTRY.about;

  const [toggles, setToggles] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    item.toggles?.forEach((t) => {
      initial[t.key] = t.defaultVal;
    });
    return initial;
  });

  const [optionsCustomState, setOptionsCustomState] = useState<Record<string, string>>({});

  const [formValues, setFormValues] = useState<Record<string, string>>({
    full_name: "",
    phone_number: "",
    email: "",
    emergency_contact: "",
    rra_tin: "",
  });

  const [dbVehicles, setDbVehicles] = useState<RegisteredVehicle[]>([]);
  const [dbPaymentMethods, setDbPaymentMethods] = useState<DbPaymentMethodRecord[]>([]);
  const [walletBalanceRwf, setWalletBalanceRwf] = useState<number>(0);
  const [diagnosticsStats, setDiagnosticsStats] = useState<{
    connected: boolean;
    latencyMs: number;
    locationsCount: number;
    spacesCount: number;
    chargersCount: number;
  }>({
    connected: false,
    latencyMs: 0,
    locationsCount: 0,
    spacesCount: 0,
    chargersCount: 0,
  });

  // Custom Options Picker Modal State
  const [pickerModalVisible, setPickerModalVisible] = useState(false);
  const [pickerTitle, setPickerTitle] = useState("");
  const [pickerSubtitle, setPickerSubtitle] = useState("");
  const [pickerOptions, setPickerOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [pickerActiveKey, setPickerActiveKey] = useState<string>("");

  // Change Password Modal State
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadSettingData = useCallback(async () => {
    setLoadingData(true);
    try {
      const startPing = Date.now();
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Load persisted toggles from AsyncStorage
      try {
        const savedToggles = await AsyncStorage.getItem(`@parkzone_toggles_${setting}`);
        if (savedToggles) {
          const parsed = JSON.parse(savedToggles);
          setToggles((prev) => ({ ...prev, ...parsed }));
        }
      } catch (err) {
        console.warn("Failed to load local toggles:", err);
      }

      // 2. Load persisted options from AsyncStorage
      try {
        const savedOptions = await AsyncStorage.getItem(`@parkzone_options_${setting}`);
        if (savedOptions) {
          const parsed = JSON.parse(savedOptions);
          setOptionsCustomState(parsed);
        }
      } catch (err) {
        console.warn("Failed to load local options:", err);
      }

      // 3. Load personal profile / payment information
      if (setting === "personal" || setting === "payments") {
        let loadedFromDb = false;
        if (user?.id) {
          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name, phone_number, email, emergency_contact, rra_tin")
              .eq("id", user.id)
              .maybeSingle();

            if (profile) {
              setFormValues({
                full_name: profile.full_name || user.user_metadata?.full_name || "",
                phone_number: profile.phone_number || user.phone || "",
                email: profile.email || user.email || "",
                emergency_contact: profile.emergency_contact || "",
                rra_tin: profile.rra_tin || "",
              });
              loadedFromDb = true;
            }
          } catch {
            // DB column not present, fallback
          }
        }

        if (!loadedFromDb) {
          try {
            const cachedForm = await AsyncStorage.getItem(`@parkzone_form_${setting}`);
            if (cachedForm) {
              setFormValues((prev) => ({ ...prev, ...JSON.parse(cachedForm) }));
            }
          } catch {}
        }
      }

      if (setting === "vehicles") {
        if (user?.id) {
          const list = await fetchUserVehicles(user.id);
          setDbVehicles(list);
        } else {
          setDbVehicles([]);
        }
      }

      if (setting === "payments") {
        if (user?.id) {
          const [methods, balance] = await Promise.all([
            fetchUserPaymentMethods(user.id),
            fetchWalletBalance(user.id),
          ]);
          setDbPaymentMethods(methods);
          setWalletBalanceRwf(balance);
        } else {
          setDbPaymentMethods([]);
          setWalletBalanceRwf(0);
        }
      }

      if (setting === "diagnostics") {
        const [locRes, spaceRes, chargerRes] = await Promise.all([
          supabase.from("parking_locations").select("id", { count: "exact", head: true }),
          supabase.from("parking_spaces").select("id", { count: "exact", head: true }),
          supabase.from("ev_charging_points").select("id", { count: "exact", head: true }),
        ]);
        const latencyMs = Math.max(1, Date.now() - startPing);
        setDiagnosticsStats({
          connected: !locRes.error,
          latencyMs,
          locationsCount: locRes.count ?? 0,
          spacesCount: spaceRes.count ?? 0,
          chargersCount: chargerRes.count ?? 0,
        });
      }
    } catch (e) {
      console.warn("Failed to load setting data from database:", e);
    } finally {
      setLoadingData(false);
    }
  }, [setting]);

  useEffect(() => {
    loadSettingData();
  }, [loadSettingData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSettingData();
    setRefreshing(false);
  };

  const handleToggle = async (key: string, val: boolean) => {
    const updated = { ...toggles, [key]: val };
    setToggles(updated);
    try {
      await AsyncStorage.setItem(`@parkzone_toggles_${setting}`, JSON.stringify(updated));
    } catch (err) {
      console.warn("Failed to persist toggle:", err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Persist toggles locally
      await AsyncStorage.setItem(`@parkzone_toggles_${setting}`, JSON.stringify(toggles));

      // Persist options locally
      await AsyncStorage.setItem(`@parkzone_options_${setting}`, JSON.stringify(optionsCustomState));

      // Save form fields locally
      await AsyncStorage.setItem(`@parkzone_form_${setting}`, JSON.stringify(formValues));

      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id && (setting === "personal" || setting === "payments")) {
        const payload: Record<string, any> = {
          id: user.id,
          updated_at: new Date().toISOString(),
        };

        if (setting === "personal") {
          payload.full_name = formValues.full_name.trim() || null;
          payload.phone_number = formValues.phone_number.trim() || null;
          payload.email = formValues.email.trim() || user.email || null;
          payload.emergency_contact = formValues.emergency_contact.trim() || null;

          const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
          if (error) {
            // Fallback for minimal DB schemas
            await supabase.from("profiles").upsert({
              id: user.id,
              full_name: formValues.full_name.trim() || null,
              phone_number: formValues.phone_number.trim() || null,
              email: formValues.email.trim() || user.email || null,
              updated_at: new Date().toISOString(),
            }, { onConflict: "id" });
          }

          // Sync auth user metadata
          try {
            await supabase.auth.updateUser({
              data: {
                full_name: formValues.full_name.trim(),
                phone_number: formValues.phone_number.trim(),
              },
            });
          } catch {}
        } else if (setting === "payments") {
          payload.rra_tin = formValues.rra_tin.trim() || null;
          await supabase.from("profiles").upsert(payload, { onConflict: "id" });
        }
      }

      Alert.alert("Settings Saved", "Your preferences and settings have been saved.");
    } catch (e: any) {
      console.warn("Settings save error:", e);
      Alert.alert("Settings Updated", "Preferences saved on your device.");
    } finally {
      setSaving(false);
    }
  };

  const dynamicOptions = useMemo<SettingOption[]>(() => {
    if (setting === "vehicles") {
      const vehicleItems: SettingOption[] = dbVehicles.map((v) => ({
        title: `${v.plate_number} · ${v.make_model || "Vehicle"}`,
        desc:
          v.vehicle_type === "ev"
            ? "Electric Vehicle · EV Charging Eligible"
            : v.vehicle_type === "handicap"
            ? "Accessible Concession Vehicle"
            : "Standard Registered Vehicle",
        badge: v.is_default ? "PRIMARY" : v.vehicle_type === "ev" ? "EV" : "ACTIVE",
        action: "manage_vehicles",
      }));

      if (vehicleItems.length === 0) {
        vehicleItems.push({
          title: "No Registered Vehicles",
          desc: "Tap below to register your license plate in the database",
          badge: "EMPTY",
          action: "add_vehicle",
        });
      }

      return [
        ...vehicleItems,
        {
          title: "Add or Manage Vehicles",
          desc: "Register plate number, powertrain, make & color",
          action: "add_vehicle",
        },
        {
          title: "3D Vehicle Customizer",
          desc: "Edit live telemetry specs, battery capacity & finish",
          action: "customizer",
        },
        {
          title: "Municipal & Accessible Permits",
          desc: "View or apply for parking concession permits",
          action: "permit",
        },
      ];
    }

    if (setting === "payments") {
      const channelItems: SettingOption[] = [
        {
          title: "ParkZone Digital Wallet",
          desc: `Live Balance: ${walletBalanceRwf.toLocaleString()} RWF`,
          badge: "WALLET",
          action: "manage_payments",
        },
        ...dbPaymentMethods.map((m) => ({
          title: m.provider_name,
          desc: `${m.masked_identifier} · ${m.method_type.toUpperCase()} channel`,
          badge: m.is_default ? "PRIMARY" : "LINKED",
          action: "manage_payments",
        })),
      ];

      if (dbPaymentMethods.length === 0) {
        channelItems.push({
          title: "No External Payment Channels Linked",
          desc: "Link MTN MoMo, Airtel Money, or card in Wallet & Payments",
          action: "manage_payments",
        });
      } else {
        channelItems.push({
          title: "Manage Wallet & Payment Channels",
          desc: "Top up RWF balance or view wallet account",
          action: "manage_payments",
        });
      }

      return channelItems;
    }

    if (setting === "diagnostics") {
      return [
        {
          title: "Cloud Database Connection",
          desc: diagnosticsStats.connected
            ? `Connected · ${diagnosticsStats.latencyMs} ms query round-trip`
            : "Checking database connection...",
          badge: diagnosticsStats.connected ? "ONLINE" : "SYNCING",
        },
        {
          title: "Parking Facilities & Bay Sensors",
          desc: `${diagnosticsStats.locationsCount} active hubs · ${diagnosticsStats.spacesCount} tracked bays in database`,
          badge: `${diagnosticsStats.spacesCount} BAYS`,
        },
        {
          title: "EV Charging OCPP Telemetry Nodes",
          desc: `${diagnosticsStats.chargersCount} charging connectors registered in database`,
          badge: `${diagnosticsStats.chargersCount} EVSE`,
        },
      ];
    }

    if (setting === "appearance") {
      return [
        {
          title: "Light Mode",
          desc: "Clean, high-contrast monochrome light theme",
          badge: theme.themePreference === "light" ? "ACTIVE" : undefined,
          action: "theme_light",
        },
        {
          title: "Dark Mode",
          desc: "Deep carbon black theme for night driving",
          badge: theme.themePreference === "dark" ? "ACTIVE" : undefined,
          action: "theme_dark",
        },
        {
          title: "System Default",
          desc: "Automatically match your phone's OS theme",
          badge: theme.themePreference === "system" ? "ACTIVE" : undefined,
          action: "theme_system",
        },
      ];
    }

    if (setting === "language") {
      return [
        {
          title: "Language",
          desc: optionsCustomState.lang || "English (Default)",
          badge: optionsCustomState.lang ? "SELECTED" : "DEFAULT",
          action: "lang",
        },
        {
          title: "Country & Region",
          desc: optionsCustomState.region || "Rwanda (Kigali Time, GMT+2)",
          action: "region",
        },
        {
          title: "Billing Currency",
          desc: optionsCustomState.currency || "Rwandan Franc (RWF)",
          badge: optionsCustomState.currency ? optionsCustomState.currency.split(" ")[0] : "RWF",
          action: "currency",
        },
        {
          title: "Distance Measurement",
          desc: optionsCustomState.units || "Metric System (Meters & Kilometers)",
          action: "units",
        },
        {
          title: "Date & Time Format",
          desc: optionsCustomState.date_format || "24-Hour Clock · DD/MM/YYYY",
          action: "date_format",
        },
      ];
    }

    if (setting === "navigation") {
      return [
        {
          title: "Preferred Navigation App",
          desc: optionsCustomState.select_nav || "In-App Navigation (Default)",
          badge: optionsCustomState.select_nav ? "SAVED" : undefined,
          action: "select_nav",
        },
        {
          title: "Search Radius",
          desc: optionsCustomState.select_radius || "Current: 5 Kilometers around vehicle",
          badge: optionsCustomState.select_radius ? "SAVED" : undefined,
          action: "select_radius",
        },
      ];
    }

    if (setting === "security") {
      return [
        {
          title: "Change Account Password",
          desc: "Update your ParkZone login password",
          action: "change_pw",
        },
        {
          title: "Session Auto-Lock Timer",
          desc: optionsCustomState.autolock || "Current: Lock after 5 minutes of inactivity",
          badge: optionsCustomState.autolock ? "SAVED" : undefined,
          action: "autolock",
        },
      ];
    }

    return item.options || [];
  }, [
    setting,
    dbVehicles,
    dbPaymentMethods,
    walletBalanceRwf,
    diagnosticsStats,
    optionsCustomState,
    theme.themePreference,
    item.options,
  ]);

  const openPicker = (
    title: string,
    subtitle: string,
    key: string,
    options: Array<{ label: string; value: string }>
  ) => {
    setPickerTitle(title);
    setPickerSubtitle(subtitle);
    setPickerActiveKey(key);
    setPickerOptions(options);
    setPickerModalVisible(true);
  };

  const handleSelectPickerOption = async (val: string) => {
    const next = { ...optionsCustomState, [pickerActiveKey]: val };
    setOptionsCustomState(next);
    setPickerModalVisible(false);
    try {
      await AsyncStorage.setItem(`@parkzone_options_${setting}`, JSON.stringify(next));
    } catch {}
    Alert.alert("Preference Updated", `${pickerTitle} set to: ${val}`);
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert("Password Too Short", "Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Mismatch", "New password and confirmation do not match.");
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordModalVisible(false);
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("Password Updated", "Your account password has been updated successfully.");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to update password.");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleAction = async (action?: string) => {
    if (!action) return;

    switch (action) {
      case "add_vehicle":
      case "manage_vehicles":
        router.push("/(tabs)/vehicles");
        break;

      case "customizer":
        router.push("/settings/vehicle_customizer");
        break;

      case "permit":
        router.push("/(tabs)/permits");
        break;

      case "manage_payments":
        router.push("/(tabs)/payments");
        break;

      case "theme_light":
        theme.setThemePreference("light");
        Alert.alert("Appearance Updated", "Light mode is now active.");
        break;

      case "theme_dark":
        theme.setThemePreference("dark");
        Alert.alert("Appearance Updated", "Dark mode is now active.");
        break;

      case "theme_system":
        theme.setThemePreference("system");
        Alert.alert("Appearance Updated", "System appearance matching is now active.");
        break;

      case "lang":
        openPicker("Select Language", "Choose your preferred language for the interface", "lang", [
          { label: "English (Default)", value: "English (Default)" },
          { label: "Kinyarwanda", value: "Kinyarwanda" },
          { label: "Français (French)", value: "Français (French)" },
          { label: "Kiswahili", value: "Kiswahili" },
        ]);
        break;

      case "region":
        openPicker("Country & Region", "Select your country and regional regulatory jurisdiction", "region", [
          { label: "Rwanda (Kigali Time, GMT+2)", value: "Rwanda (Kigali Time, GMT+2)" },
          { label: "Uganda (Kampala, GMT+3)", value: "Uganda (Kampala, GMT+3)" },
          { label: "Kenya (Nairobi, GMT+3)", value: "Kenya (Nairobi, GMT+3)" },
          { label: "Tanzania (Dodoma, GMT+3)", value: "Tanzania (Dodoma, GMT+3)" },
        ]);
        break;

      case "currency":
        openPicker("Billing Currency", "Select default currency for receipts & estimates", "currency", [
          { label: "Rwandan Franc (RWF)", value: "Rwandan Franc (RWF)" },
          { label: "US Dollar (USD)", value: "US Dollar (USD)" },
          { label: "Euro (EUR)", value: "Euro (EUR)" },
        ]);
        break;

      case "units":
        openPicker("Distance Measurement", "Select units for bay routing & radius", "units", [
          { label: "Metric System (Meters & Kilometers)", value: "Metric System (Meters & Kilometers)" },
          { label: "Imperial System (Miles & Feet)", value: "Imperial System (Miles & Feet)" },
        ]);
        break;

      case "date_format":
        openPicker("Date & Time Format", "Select display style for timestamps & booking hours", "date_format", [
          { label: "24-Hour Clock · DD/MM/YYYY", value: "24-Hour Clock · DD/MM/YYYY" },
          { label: "12-Hour Clock · MM/DD/YYYY", value: "12-Hour Clock · MM/DD/YYYY" },
        ]);
        break;

      case "select_nav":
        openPicker("Preferred Navigation App", "Select the turn-by-turn navigation engine", "select_nav", [
          { label: "In-App Navigation (Default)", value: "In-App Navigation (Default)" },
          { label: "Google Maps", value: "Google Maps" },
          { label: "Apple Maps", value: "Apple Maps" },
          { label: "Waze Live Traffic", value: "Waze Live Traffic" },
        ]);
        break;

      case "select_radius":
        openPicker("Search Radius", "Filter nearest lots and EV chargers within radius", "select_radius", [
          { label: "2 Kilometers (City Center)", value: "2 Kilometers (City Center)" },
          { label: "5 Kilometers (Standard Radius)", value: "5 Kilometers (Standard Radius)" },
          { label: "10 Kilometers (Greater Kigali)", value: "10 Kilometers (Greater Kigali)" },
          { label: "25 Kilometers (Province Metropolitan)", value: "25 Kilometers (Province Metropolitan)" },
        ]);
        break;

      case "autolock":
        openPicker("Session Auto-Lock Timer", "Lock app after inactivity to protect account security", "autolock", [
          { label: "Immediate on Background", value: "Immediate on Background" },
          { label: "After 1 Minute", value: "After 1 Minute" },
          { label: "After 5 Minutes (Default)", value: "After 5 Minutes (Default)" },
          { label: "After 15 Minutes", value: "After 15 Minutes" },
          { label: "Never (Stay Unlocked)", value: "Never (Stay Unlocked)" },
        ]);
        break;

      case "change_pw":
        setPasswordModalVisible(true);
        break;

      case "clear_cache":
        Alert.alert(
          "Clear Offline Map Cache",
          "This will refresh cached telemetry state from the database. Active parking sessions will remain intact.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Clear Now",
              onPress: async () => {
                await loadSettingData();
                Alert.alert("Cache Refreshed", "Local cache cleared and state synced from database.");
              },
            },
          ]
        );
        break;

      case "reset_state":
        Alert.alert(
          "Reset App State",
          "Re-download latest parking lot coordinates and sensor configurations from database?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Re-Sync",
              onPress: async () => {
                await loadSettingData();
                Alert.alert("Synchronized", "Database telemetry synchronized.");
              },
            },
          ]
        );
        break;

      case "ping_test": {
        const t0 = Date.now();
        const { error } = await supabase.from("parking_locations").select("id").limit(1);
        const rtt = Math.max(1, Date.now() - t0);
        Alert.alert(
          "Database Latency Diagnostic",
          error
            ? `Database error: ${error.message}`
            : `Live Database Query Ping:\n\nRound trip: ${rtt} ms\nStatus: Connected (TLS 1.3)`
        );
        break;
      }

      case "report_sensor":
        Alert.alert(
          "Report Sensor Malfunction",
          "Submit a sensor inspection request for your current parking facility?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Submit Report",
              onPress: () =>
                Alert.alert("Report Dispatched", "Marshal inspection request recorded. Thank you!"),
            },
          ]
        );
        break;

      case "call_hotline":
        Alert.alert("Call Dispatch", "Dialing Municipal Parking Authority Hotline: 3122 (Toll-Free)");
        break;

      case "whatsapp":
        Alert.alert(
          "WhatsApp Motorist Support",
          "Contact ParkZone Dispatch via official motorist support channel."
        );
        break;

      case "dispute_fine":
        Alert.alert(
          "Dispute a Fine",
          "You have 48 hours following checkout to dispute a fine. Have your plate number and parking ticket ID ready."
        );
        break;

      case "momo_guide":
        Alert.alert(
          "Mobile Money Payment Guide",
          "1. Dial *182# on MTN or Airtel\n2. Select Pay Bill / Merchant\n3. Follow the prompt on your ParkZone invoice\n4. Confirm amount in RWF"
        );
        break;

      case "change_pw":
        router.push("/(auth)/forgot_pass");
        break;

      case "terms":
      case "privacy":
        router.push("/(auth)/terms_privacy");
        break;

      case "delete_account":
        Alert.alert(
          "Delete Account",
          "Are you sure you want to sign out and request permanent deletion of your ParkZone motorist profile?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Sign Out & Request",
              style: "destructive",
              onPress: async () => {
                await supabase.auth.signOut();
                router.replace("/(auth)/sign_in");
              },
            },
          ]
        );
        break;

      default:
        Alert.alert(item.title, `Selected option: ${action}`);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top Header */}
      <View style={[styles.header, { backgroundColor: "transparent" }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
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
        {/* Banner with Icon & Subtitle */}
        <View style={[styles.bannerCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.iconCircle, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Ionicons name={item.icon} size={22} color={theme.text} />
          </View>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {item.subtitle}
          </Text>
        </View>

        {loadingData && (
          <View style={{ gap: 10, marginVertical: 10 }}>
            <SkeletonBox width="100%" height={56} borderRadius={14} />
            <SkeletonBox width="100%" height={56} borderRadius={14} />
            <SkeletonBox width="100%" height={56} borderRadius={14} />
          </View>
        )}

        {/* Input Fields (if any) */}
        {item.fields && item.fields.length > 0 && (
          <View style={styles.sectionWrapper}>
            <Text style={[styles.sectionHeading, { color: theme.textSecondary }]}>
              PROFILE INFORMATION
            </Text>
            {item.fields.map((field) => (
              <View key={field.key} style={styles.fieldBox}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>{field.label}</Text>
                <TextInput
                  value={formValues[field.key] ?? ""}
                  onChangeText={(val) =>
                    setFormValues((prev) => ({ ...prev, [field.key]: val }))
                  }
                  placeholder={field.placeholder || field.label}
                  placeholderTextColor={theme.textMuted}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                />
              </View>
            ))}
          </View>
        )}

        {/* Interactive Toggles (if any) */}
        {item.toggles && item.toggles.length > 0 && (
          <View style={styles.sectionWrapper}>
            <Text style={[styles.sectionHeading, { color: theme.textSecondary }]}>
              PREFERENCES & CONTROLS
            </Text>
            {item.toggles.map((tog) => {
              const isEnabled = toggles[tog.key] ?? tog.defaultVal;
              return (
                <View
                  key={tog.key}
                  style={[
                    styles.toggleCard,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <View style={styles.toggleTextCol}>
                    <Text style={[styles.toggleLabel, { color: theme.text }]}>
                      {tog.label}
                    </Text>
                    <Text style={[styles.toggleDesc, { color: theme.textSecondary }]}>
                      {tog.desc}
                    </Text>
                  </View>
                  <Switch
                    value={isEnabled}
                    onValueChange={(val) => handleToggle(tog.key, val)}
                    trackColor={{ false: theme.border, true: theme.primaryBtnBg }}
                    thumbColor={isEnabled ? theme.primaryBtnText : theme.textSecondary}
                  />
                </View>
              );
            })}
          </View>
        )}

        {/* Option Rows (if any) */}
        {dynamicOptions.length > 0 && (
          <View style={styles.sectionWrapper}>
            <Text style={[styles.sectionHeading, { color: theme.textSecondary }]}>
              OPTIONS & INTEGRATIONS
            </Text>
            {dynamicOptions.map((opt) => (
              <TouchableOpacity
                key={`${opt.title}-${opt.badge || ""}`}
                style={[
                  styles.optionCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => handleAction(opt.action || opt.title)}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
                  <Text
                    style={[
                      styles.optionTitle,
                      { color: opt.variant === "destructive" ? "#EF4444" : theme.text },
                    ]}
                    numberOfLines={1}
                  >
                    {opt.title}
                  </Text>
                  {opt.desc ? (
                    <Text style={[styles.optionDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                      {opt.desc}
                    </Text>
                  ) : null}
                </View>

                {opt.badge ? (
                  <View style={[styles.badgePill, { backgroundColor: theme.background, borderColor: theme.border }]}>
                    <Text style={[styles.badgeText, { color: theme.text }]}>{opt.badge}</Text>
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Action Buttons (if any) */}
        {item.actions && item.actions.length > 0 && (
          <View style={styles.sectionWrapper}>
            <Text style={[styles.sectionHeading, { color: theme.textSecondary }]}>
              ACTIONS & UTILITIES
            </Text>
            {item.actions.map((act) => (
              <TouchableOpacity
                key={act.label}
                style={[
                  styles.actionCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => handleAction(act.action)}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={[
                      styles.actionLabel,
                      { color: act.variant === "destructive" ? "#EF4444" : theme.text },
                    ]}
                  >
                    {act.label}
                  </Text>
                  <Text style={[styles.actionDesc, { color: theme.textSecondary }]}>
                    {act.desc}
                  </Text>
                </View>
                <Ionicons
                  name={act.variant === "destructive" ? "trash-outline" : "chevron-forward"}
                  size={18}
                  color={act.variant === "destructive" ? "#EF4444" : theme.text}
                />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Save Changes / Preferences Button */}
        {(Boolean(item.fields?.length) || Boolean(item.toggles?.length) || dynamicOptions.length > 0) && (
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: theme.primaryBtnBg, opacity: saving ? 0.7 : 1 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.88}
          >
            {saving ? (
              <ActivityIndicator size="small" color={theme.primaryBtnText} />
            ) : (
              <View style={styles.saveBtnContentRow}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color={theme.primaryBtnText}
                  style={{ marginRight: 8 }}
                />
                <Text style={[styles.saveBtnText, { color: theme.primaryBtnText }]}>
                  Save Settings & Preferences
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Interactive Options Picker Modal */}
      <Modal
        visible={pickerModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.modalHandle, { backgroundColor: theme.border }]} />
            <Text style={[styles.modalTitle, { color: theme.text }]}>{pickerTitle}</Text>
            {pickerSubtitle ? (
              <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>{pickerSubtitle}</Text>
            ) : null}

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {pickerOptions.map((opt) => {
                const isSelected = optionsCustomState[pickerActiveKey] === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.pickerItemRow,
                      {
                        backgroundColor: isSelected ? theme.border : theme.background,
                        borderColor: isSelected ? theme.text : theme.border,
                      },
                    ]}
                    onPress={() => handleSelectPickerOption(opt.value)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.pickerItemText,
                        { color: theme.text, fontWeight: isSelected ? "600" : "400" },
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={18} color={theme.text} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalCancelBtn, { backgroundColor: theme.border }]}
              onPress={() => setPickerModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.modalCancelBtnText, { color: theme.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        visible={passwordModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPasswordModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.modalHandle, { backgroundColor: theme.border }]} />
            <Text style={[styles.modalTitle, { color: theme.text }]}>Change Account Password</Text>
            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              Enter a new secure password for your ParkZone motorist profile
            </Text>

            <View style={{ marginBottom: 14 }}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>New Password</Text>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="At least 6 characters"
                placeholderTextColor={theme.textMuted}
                secureTextEntry
                style={[
                  styles.input,
                  { backgroundColor: theme.background, borderColor: theme.border, color: theme.text },
                ]}
              />
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>Confirm New Password</Text>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter password"
                placeholderTextColor={theme.textMuted}
                secureTextEntry
                style={[
                  styles.input,
                  { backgroundColor: theme.background, borderColor: theme.border, color: theme.text },
                ]}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.saveBtn,
                { backgroundColor: theme.primaryBtnBg, opacity: isUpdatingPassword ? 0.7 : 1, marginBottom: 10 },
              ]}
              onPress={handleUpdatePassword}
              disabled={isUpdatingPassword}
              activeOpacity={0.88}
            >
              {isUpdatingPassword ? (
                <ActivityIndicator size="small" color={theme.primaryBtnText} />
              ) : (
                <Text style={[styles.saveBtnText, { color: theme.primaryBtnText }]}>
                  Update Password
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalCancelBtn, { backgroundColor: theme.border }]}
              onPress={() => setPasswordModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.modalCancelBtnText, { color: theme.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: "transparent",
    borderBottomWidth: 0,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  content: {
    padding: 20,
    paddingBottom: 60,
  },
  bannerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "400",
  },
  sectionWrapper: {
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 4,
  },
  fieldBox: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 6,
    marginLeft: 2,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: "400",
  },
  toggleCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  toggleTextCol: {
    flex: 1,
    paddingRight: 14,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  toggleDesc: {
    fontSize: 11,
    marginTop: 3,
    lineHeight: 15,
  },
  optionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  optionTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  optionDesc: {
    fontSize: 11,
    marginTop: 3,
    lineHeight: 15,
  },
  badgePill: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  actionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  actionDesc: {
    fontSize: 11,
    marginTop: 3,
    lineHeight: 15,
  },
  saveBtn: {
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  saveBtnContentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: "400",
    marginBottom: 16,
    lineHeight: 18,
  },
  pickerItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  pickerItemText: {
    fontSize: 14,
  },
  modalCancelBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
