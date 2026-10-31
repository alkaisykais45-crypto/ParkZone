import React, { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { signOut } from "../services/auth";
import { Icons } from "../../constants/icons";
import { useTheme } from "../../hooks/useTheme";
import { useDriverVehicle } from "../../hooks/useDriverVehicle";
import { HorizontalUltraRealisticCar } from "../../components/UltraRealisticCar";
import { ProfileSkeleton } from "../../components/SkeletonLoader";

interface ProfileData {
  id: string;
  phone_number?: string;
  full_name?: string;
  email?: string;
  emergency_contact?: string;
  avatar_url?: string;
  created_at?: string;
}

interface SettingMenuItem {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: string;
}

interface SettingSection {
  title: string;
  items: SettingMenuItem[];
}

const SETTINGS_SECTIONS: SettingSection[] = [
  {
    title: "PERFORMANCE & DEVICE HEALTH",
    items: [
      {
        key: "performance",
        title: "Performance & Cache",
        subtitle: "Offline map cache, lot pre-fetching, battery saver",
        icon: "rocket-outline",
      },
      {
        key: "navigation",
        title: "GPS, Precision & Routing",
        subtitle: "1-meter bay detection, auto-reroute, turn-by-turn",
        icon: "navigate-outline",
      },
      {
        key: "diagnostics",
        title: "Sensor Mesh & Network Diagnostics",
        subtitle: "Real-time MQTT telemetry, network latency ping test",
        icon: "hardware-chip-outline",
        badge: "ONLINE",
      },
    ],
  },
  {
    title: "ACCOUNT & VEHICLES",
    items: [
      {
        key: "vehicle_customizer",
        title: "Vehicle Studio & Customization",
        subtitle: "Live 3D bodywork, paint finish, EV battery telemetry",
        icon: "car-sport-outline",
        badge: "LIVE 3D",
      },
      {
        key: "personal",
        title: "Personal Information",
        subtitle: "Legal name, phone, email, and emergency contact details",
        icon: "person-outline",
      },
      {
        key: "vehicles",
        title: "Vehicles & Permits",
        subtitle: "Linked license plates, EV tags, handicap permit numbers",
        icon: "car-outline",
      },
      {
        key: "payments",
        title: "Payment Channels & MoMo",
        subtitle: "MTN Mobile Money, Airtel Money, Visa card, RRA TIN",
        icon: "card-outline",
      },
    ],
  },
  {
    title: "SECURITY & DATA GOVERNANCE",
    items: [
      {
        key: "security",
        title: "Security & Biometrics",
        subtitle: "FaceID checkout, 2FA OTP, plate hashing, auto-lock",
        icon: "shield-checkmark-outline",
      },
      {
        key: "privacy",
        title: "Privacy & Data Protection",
        subtitle: "Data encryption, export telemetry, delete account",
        icon: "lock-closed-outline",
      },
    ],
  },
  {
    title: "PREFERENCES & ALERTS",
    items: [
      {
        key: "notifications",
        title: "Notifications & Expiry Alerts",
        subtitle: "15m warning, 5m overstay fine alert, EV done notices",
        icon: "notifications-outline",
      },
      {
        key: "appearance",
        title: "Appearance & Display",
        subtitle: "Monochrome light mode, dark mode, high-contrast roads",
        icon: "contrast-outline",
      },
      {
        key: "language",
        title: "Language & Regional Units",
        subtitle: "English / Kinyarwanda, RWF currency, metric units",
        icon: "globe-outline",
      },
    ],
  },
  {
    title: "SUPPORT & REGULATORY",
    items: [
      {
        key: "help",
        title: "Help & 24/7 Dispatch Center",
        subtitle: "Toll-Free 3122 hotline, WhatsApp support, fine dispute",
        icon: "help-buoy-outline",
      },
      {
        key: "about",
        title: "About ParkZone",
        subtitle: "Version 2.4.0, City of Kigali Smart Urban Grid licensing",
        icon: "information-circle-outline",
        badge: "v2.4.0",
      },
    ],
  },
];

const Profile = () => {
  const theme = useTheme();
  const { vehicle, reloadVehicle } = useDriverVehicle();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [urlModalVisible, setUrlModalVisible] = useState(false);
  const [customAvatarUrl, setCustomAvatarUrl] = useState("");
  const [vehicleCount, setVehicleCount] = useState<number>(0);
  const [sessionsCount, setSessionsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Edit Profile States (Inline & Modal)
  const [isEditingInline, setIsEditingInline] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editFullName, setEditFullName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editEmergencyContact, setEditEmergencyContact] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadUserData();
      reloadVehicle();
    }, [reloadVehicle])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUserData();
    setRefreshing(false);
  };

  const loadUserData = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        let prof: any = null;
        try {
          const { data } = await supabase
            .from("profiles")
            .select("id, phone_number, full_name, email, avatar_url, emergency_contact, created_at")
            .eq("id", user.id)
            .maybeSingle();
          prof = data;
        } catch {
          const { data } = await supabase
            .from("profiles")
            .select("id, phone_number, full_name, email, avatar_url, created_at")
            .eq("id", user.id)
            .maybeSingle();
          prof = data;
        }

        const resolvedAvatar = prof?.avatar_url || user.user_metadata?.avatar_url || null;
        setAvatarUri(resolvedAvatar);

        setProfile({
          id: user.id,
          phone_number: prof?.phone_number || user.phone || "",
          email: prof?.email || user.email || "",
          full_name: prof?.full_name || user.user_metadata?.full_name || "",
          emergency_contact: prof?.emergency_contact || "",
          avatar_url: resolvedAvatar || undefined,
          created_at: prof?.created_at,
        });

        const [{ count: vCount }, { count: sCount }] = await Promise.all([
          supabase
            .from("vehicles")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id),
          supabase
            .from("parking_tickets")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id),
        ]);

        setVehicleCount(vCount ?? 0);
        setSessionsCount(sCount ?? 0);

        // Fetch user active vehicle
        await reloadVehicle();
      } else {
        // Attempt reading cached profile offline
        const cached = await AsyncStorage.getItem("@parkzone_cached_profile");
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            setProfile(parsed);
            if (parsed.avatar_url) setAvatarUri(parsed.avatar_url);
          } catch {
            setProfile(null);
          }
        } else {
          setProfile(null);
          setAvatarUri(null);
        }
        setVehicleCount(0);
        setSessionsCount(0);
      }
    } catch (e) {
      console.warn("loadUserData error:", e);
    } finally {
      setLoading(false);
    }
  };

  const startEditing = () => {
    setEditFullName(profile?.full_name || "");
    setEditPhone(profile?.phone_number || "");
    setEditEmail(profile?.email || "");
    setEditEmergencyContact(profile?.emergency_contact || "");
    setIsEditingInline(true);
  };

  const openEditModal = () => {
    setEditFullName(profile?.full_name || "");
    setEditPhone(profile?.phone_number || "");
    setEditEmail(profile?.email || "");
    setEditEmergencyContact(profile?.emergency_contact || "");
    setEditModalVisible(true);
  };

  const handleSaveProfile = async () => {
    if (!editFullName.trim()) {
      Alert.alert("Name Required", "Please enter your full legal name.");
      return;
    }

    setIsSavingProfile(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const profilePayload: Record<string, any> = {
        full_name: editFullName.trim(),
        phone_number: editPhone.trim() || null,
        email: editEmail.trim() || user?.email || null,
        emergency_contact: editEmergencyContact.trim() || null,
        avatar_url: avatarUri || null,
        updated_at: new Date().toISOString(),
      };

      if (user?.id) {
        profilePayload.id = user.id;
        const { error: upsertErr } = await supabase
          .from("profiles")
          .upsert(profilePayload, { onConflict: "id" });

        if (upsertErr) {
          // Schema fallback if emergency_contact column not present
          await supabase.from("profiles").upsert(
            {
              id: user.id,
              full_name: editFullName.trim(),
              phone_number: editPhone.trim() || null,
              email: editEmail.trim() || user?.email || null,
              avatar_url: avatarUri || null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );
        }

        // Sync auth metadata
        try {
          await supabase.auth.updateUser({
            data: {
              full_name: editFullName.trim(),
              phone_number: editPhone.trim(),
              avatar_url: avatarUri,
            },
          });
        } catch {
          // non-critical
        }
      }

      // Always save locally to AsyncStorage
      const updatedProfileObj: ProfileData = {
        id: user?.id || profile?.id || "guest",
        full_name: editFullName.trim(),
        phone_number: editPhone.trim(),
        email: editEmail.trim(),
        emergency_contact: editEmergencyContact.trim(),
        avatar_url: avatarUri || undefined,
      };

      await AsyncStorage.setItem(
        "@parkzone_cached_profile",
        JSON.stringify(updatedProfileObj)
      );

      setProfile(updatedProfileObj);
      setIsEditingInline(false);
      setEditModalVisible(false);
      Alert.alert("Profile Updated", "Your profile details have been saved successfully.");
    } catch (e: any) {
      console.warn("Failed to update profile:", e);
      Alert.alert("Save Error", e.message || "Could not save profile changes. Please try again.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePickImage = async (type: "camera" | "library") => {
    try {
      setAvatarModalVisible(false);
      let selectedUri: string | null = null;

      if (type === "camera") {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission Required", "Camera access is needed to take a profile photo.");
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
        if (!result.canceled && result.assets?.[0]?.uri) {
          selectedUri = result.assets[0].uri;
        }
      } else if (type === "library") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission Required", "Photo library access is needed to select a profile photo.");
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
        if (!result.canceled && result.assets?.[0]?.uri) {
          selectedUri = result.assets[0].uri;
        }
      }

      if (selectedUri) {
        setAvatarUri(selectedUri);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            await supabase
              .from("profiles")
              .update({ avatar_url: selectedUri, updated_at: new Date().toISOString() })
              .eq("id", user.id);
          }
          await supabase.auth.updateUser({
            data: { avatar_url: selectedUri },
          });
          await AsyncStorage.setItem("@parkzone_avatar_uri", selectedUri);
        } catch {
          // ignore
        }
        Alert.alert("Profile Updated", "Your profile photo has been updated.");
      }
    } catch (e) {
      console.warn("Avatar update error:", e);
      Alert.alert("Error", "Could not update profile photo.");
    }
  };

  const handleApplyImageUrl = async () => {
    const url = customAvatarUrl.trim();
    if (!url) {
      Alert.alert("URL Required", "Please enter a valid image web address.");
      return;
    }
    setAvatarUri(url);
    setUrlModalVisible(false);
    setCustomAvatarUrl("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        await supabase
          .from("profiles")
          .update({ avatar_url: url, updated_at: new Date().toISOString() })
          .eq("id", user.id);
      }
      await supabase.auth.updateUser({
        data: { avatar_url: url },
      });
      await AsyncStorage.setItem("@parkzone_avatar_uri", url);
    } catch {
      // ignore
    }
    Alert.alert("Profile Updated", "Your profile image URL has been applied.");
  };

  const handleSignOut = async () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out of your ParkZone account?", [
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
      {/* Top Header: Transparent Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.headerBackBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>

        <View style={styles.headerTitleCenter}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Account & Profile</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            Manage preferences & security
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.headerIconBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => router.push("/settings/performance")}
          activeOpacity={0.75}
        >
          <Ionicons name="rocket-outline" size={18} color={theme.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ProfileSkeleton />
      ) : (
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
          {/* Motorist Identity Card */}
          <View
            style={[
              styles.userCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                shadowColor: theme.cardShadow,
              },
            ]}
          >
            <View style={styles.userAvatarContainer}>
              <TouchableOpacity
                onPress={() => setAvatarModalVisible(true)}
                activeOpacity={0.85}
                style={[
                  styles.avatarCircle,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.border,
                  },
                ]}
              >
                {avatarUri ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={styles.avatarImage}
                    resizeMode="cover"
                  />
                ) : (
                  <Ionicons name="person" size={36} color={theme.textSecondary} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.verifiedBadge, { backgroundColor: theme.primaryBtnBg, borderColor: theme.surface }]}
                onPress={() => setAvatarModalVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="camera" size={13} color={theme.primaryBtnText} />
              </TouchableOpacity>
            </View>

            {!isEditingInline ? (
              <>
                <Text style={[styles.userName, { color: theme.text }]}>
                  {profile?.full_name || profile?.email || profile?.phone_number || "Motorist"}
                </Text>
                <Text style={[styles.userPhone, { color: theme.textSecondary }]}>
                  {profile?.phone_number || profile?.email || "Not signed in"}
                </Text>

                {/* Quick Action Buttons: Edit Details & Change Photo */}
                <View style={styles.profileActionRow}>
                  <TouchableOpacity
                    style={[styles.profileActionBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
                    onPress={startEditing}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="create-outline" size={14} color={theme.text} style={{ marginRight: 6 }} />
                    <Text style={[styles.profileActionBtnText, { color: theme.text }]}>Edit Details</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.profileActionBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
                    onPress={() => setAvatarModalVisible(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="camera-outline" size={14} color={theme.text} style={{ marginRight: 6 }} />
                    <Text style={[styles.profileActionBtnText, { color: theme.text }]}>Change Photo</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              /* Inline Profile Editor Form */
              <View style={styles.inlineEditForm}>
                <View style={styles.inlineEditHeader}>
                  <Text style={[styles.inlineEditTitle, { color: theme.text }]}>Edit Motorist Details</Text>
                  <TouchableOpacity
                    onPress={() => setIsEditingInline(false)}
                    style={[styles.inlineCloseBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
                  >
                    <Ionicons name="close" size={16} color={theme.text} />
                  </TouchableOpacity>
                </View>

                {/* Full Legal Name */}
                <View style={styles.inlineField}>
                  <Text style={[styles.inlineLabel, { color: theme.textSecondary }]}>FULL LEGAL NAME</Text>
                  <TextInput
                    value={editFullName}
                    onChangeText={setEditFullName}
                    placeholder="e.g. Jean Paul Mugisha"
                    placeholderTextColor={theme.textMuted}
                    style={[styles.inlineInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                  />
                </View>

                {/* Phone Number */}
                <View style={styles.inlineField}>
                  <Text style={[styles.inlineLabel, { color: theme.textSecondary }]}>PHONE NUMBER (MTN / AIRTEL)</Text>
                  <TextInput
                    value={editPhone}
                    onChangeText={setEditPhone}
                    placeholder="078... or 073..."
                    placeholderTextColor={theme.textMuted}
                    keyboardType="phone-pad"
                    style={[styles.inlineInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                  />
                </View>

                {/* Email Address */}
                <View style={styles.inlineField}>
                  <Text style={[styles.inlineLabel, { color: theme.textSecondary }]}>EMAIL ADDRESS</Text>
                  <TextInput
                    value={editEmail}
                    onChangeText={setEditEmail}
                    placeholder="name@domain.com"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={[styles.inlineInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                  />
                </View>

                {/* Emergency Contact */}
                <View style={styles.inlineField}>
                  <Text style={[styles.inlineLabel, { color: theme.textSecondary }]}>EMERGENCY CONTACT</Text>
                  <TextInput
                    value={editEmergencyContact}
                    onChangeText={setEditEmergencyContact}
                    placeholder="Next of kin phone number"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="phone-pad"
                    style={[styles.inlineInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                  />
                </View>

                {/* Action Buttons Row */}
                <View style={styles.inlineBtnRow}>
                  <TouchableOpacity
                    style={[styles.inlineCancelBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
                    onPress={() => setIsEditingInline(false)}
                    disabled={isSavingProfile}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.inlineCancelBtnText, { color: theme.text }]}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.inlineSaveBtn, { backgroundColor: theme.primaryBtnBg, opacity: isSavingProfile ? 0.7 : 1 }]}
                    onPress={handleSaveProfile}
                    disabled={isSavingProfile}
                    activeOpacity={0.88}
                  >
                    {isSavingProfile ? (
                      <ActivityIndicator size="small" color={theme.primaryBtnText} />
                    ) : (
                      <Text style={[styles.inlineSaveBtnText, { color: theme.primaryBtnText }]}>Save Changes</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Privacy Compliance Pill */}
            <View style={[styles.privacyPill, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <View style={[styles.privacyDot, { backgroundColor: theme.isDark ? "#FFFFFF" : "#09090B" }]} />
              <Text style={[styles.privacyPillText, { color: theme.textSecondary }]}>
                Cryptographic Blind Index Hashing Active
              </Text>
            </View>

            {/* Quick Stats Grid */}
            <View style={[styles.statsGrid, { backgroundColor: theme.background }]}>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: theme.text }]}>{vehicleCount}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Vehicles</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: theme.text }]}>{sessionsCount}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Sessions</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: theme.text }]}>Standard</Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Tariff Plan</Text>
              </View>
            </View>
          </View>

          {/* Active Driver Vehicle & Customization Studio Card (Real-Time Synchronized) */}
          <View
            style={[
              styles.vehicleStudioCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                shadowColor: theme.cardShadow,
              },
            ]}
          >
            <View style={styles.vehicleStudioHeader}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <View style={styles.vehicleLiveTagRow}>
                  <View
                    style={[
                      styles.vehicleLiveDot,
                      { backgroundColor: vehicle.plateNumber ? theme.accent : theme.textMuted },
                    ]}
                  />
                  <Text style={[styles.vehicleStudioSectionTag, { color: theme.textSecondary }]}>
                    {vehicle.plateNumber ? "ACTIVE VEHICLE • REAL TIME" : "NO ACTIVE VEHICLE"}
                  </Text>
                </View>
                <Text style={[styles.vehicleStudioTitle, { color: theme.text }]} numberOfLines={1}>
                  {vehicle.plateNumber
                    ? vehicle.makeModel || "Registered Vehicle"
                    : "Register Your Vehicle"}
                </Text>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {vehicleCount > 1 && (
                  <TouchableOpacity
                    style={[
                      styles.customizeBadgeBtn,
                      { backgroundColor: theme.surfaceMuted, borderWidth: 1, borderColor: theme.border },
                    ]}
                    onPress={() => router.push("/(tabs)/vehicles")}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="swap-horizontal-outline"
                      size={14}
                      color={theme.text}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.customizeBadgeText, { color: theme.text }]}>
                      Fleet ({vehicleCount})
                    </Text>
                  </TouchableOpacity>
                )}

                {vehicle.plateNumber ? (
                  <TouchableOpacity
                    style={[styles.customizeBadgeBtn, { backgroundColor: theme.primaryBtnBg }]}
                    onPress={() => router.push("/settings/vehicle_customizer")}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="options-outline"
                      size={14}
                      color={theme.primaryBtnText}
                      style={{ marginRight: 5 }}
                    />
                    <Text style={[styles.customizeBadgeText, { color: theme.primaryBtnText }]}>
                      Customize
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.customizeBadgeBtn, { backgroundColor: theme.primaryBtnBg }]}
                    onPress={() => router.push("/(tabs)/vehicles")}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="add-outline"
                      size={15}
                      color={theme.primaryBtnText}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.customizeBadgeText, { color: theme.primaryBtnText }]}>
                      Add
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Interactive Vehicle Showcase Box */}
            <TouchableOpacity
              style={[
                styles.vehicleStageBox,
                { backgroundColor: theme.background, borderColor: theme.border },
              ]}
              onPress={() =>
                router.push(vehicle.plateNumber ? "/settings/vehicle_customizer" : "/(tabs)/vehicles")
              }
              activeOpacity={0.88}
            >
              <View style={styles.carStageCenter}>
                <HorizontalUltraRealisticCar
                  color={vehicle.plateNumber ? vehicle.colorVariant : "silver"}
                  scale={1.12}
                />
              </View>

              <View
                style={[
                  styles.plateFloatingBadge,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <Text style={styles.plateFlagText}>RW</Text>
                <Text
                  style={[
                    styles.plateNumberText,
                    { color: vehicle.plateNumber ? theme.text : theme.textMuted },
                  ]}
                >
                  {vehicle.plateNumber || "ADD PLATE"}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Real-time Telemetry Specs Grid or Add CTA */}
            {vehicle.plateNumber ? (
              <View style={styles.vehicleSpecsRow}>
                <View style={styles.specItemCol}>
                  <Text style={[styles.specItemLabel, { color: theme.textSecondary }]}>Finish</Text>
                  <Text style={[styles.specItemValue, { color: theme.text }]} numberOfLines={1}>
                    {vehicle.colorName.split(" ")[0]}
                  </Text>
                </View>
                <View style={[styles.specItemDivider, { backgroundColor: theme.border }]} />
                <View style={styles.specItemCol}>
                  <Text style={[styles.specItemLabel, { color: theme.textSecondary }]}>Type</Text>
                  <Text style={[styles.specItemValue, { color: theme.text }]} numberOfLines={1}>
                    {vehicle.vehicleType.toUpperCase()}
                  </Text>
                </View>
                <View style={[styles.specItemDivider, { backgroundColor: theme.border }]} />
                <View style={styles.specItemCol}>
                  <Text style={[styles.specItemLabel, { color: theme.textSecondary }]}>Plug</Text>
                  <Text style={[styles.specItemValue, { color: theme.text }]} numberOfLines={1}>
                    {vehicle.plugType.split(" ")[0]}
                  </Text>
                </View>
                <View style={[styles.specItemDivider, { backgroundColor: theme.border }]} />
                <View style={styles.specItemCol}>
                  <Text style={[styles.specItemLabel, { color: theme.textSecondary }]}>
                    {vehicle.vehicleType === "ev" ? "SoC / Range" : "Fuel Status"}
                  </Text>
                  <Text style={[styles.specItemValue, { color: theme.text }]} numberOfLines={1}>
                    {vehicle.vehicleType === "ev"
                      ? `${vehicle.batteryLevelPercent}% (${vehicle.estimatedRangeKm}km)`
                      : "Ready"}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={{ paddingTop: 2 }}>
                <Text style={[styles.emptyVehicleDesc, { color: theme.textSecondary }]}>
                  Link your license plate to activate automatic gate clearance, real-time occupancy tracking, and EV priority charging.
                </Text>
                <TouchableOpacity
                  style={[styles.registerVehicleCtaBtn, { backgroundColor: theme.primaryBtnBg }]}
                  onPress={() => router.push("/(tabs)/vehicles")}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={17}
                    color={theme.primaryBtnText}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.registerVehicleCtaText, { color: theme.primaryBtnText }]}>
                    Register Your Vehicle
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Grouped Settings Sections */}
          {SETTINGS_SECTIONS.map((section) => (
            <View key={section.title} style={styles.sectionContainer}>
              <Text style={[styles.sectionHeading, { color: theme.textSecondary }]}>
                {section.title}
              </Text>

              {section.items.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.settingCardRow,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      shadowColor: theme.cardShadow,
                    },
                  ]}
                  onPress={() => router.push(`/settings/${item.key}` as any)}
                  activeOpacity={0.78}
                >
                  <View style={[styles.settingIconBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                    <Ionicons name={item.icon} size={20} color={theme.text} />
                  </View>

                  <View style={styles.settingTextCol}>
                    <Text style={[styles.settingItemTitle, { color: theme.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.settingItemSub, { color: theme.textSecondary }]} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  </View>

                  {item.badge ? (
                    <View style={[styles.itemBadgePill, { backgroundColor: theme.background, borderColor: theme.border }]}>
                      <Text style={[styles.itemBadgeText, { color: theme.text }]}>{item.badge}</Text>
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                  )}
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
            <Ionicons name="log-out-outline" size={18} color={theme.text} style={{ marginRight: 8 }} />
            <Text style={[styles.signOutBtnText, { color: theme.text }]}>Log Out of ParkZone</Text>
          </TouchableOpacity>

          {/* Brand Footer */}
          <View style={styles.brandFooter}>
            <Image
              source={Icons.picon}
              style={[styles.brandFooterLogo, { tintColor: theme.iconColor }]}
              resizeMode="contain"
            />
            <Text style={[styles.brandFooterTitle, { color: theme.text }]}>PARKZONE RWANDA</Text>
            <Text style={[styles.versionFooter, { color: theme.textSecondary }]}>
              ParkZone Engine v2.4.0 (Kigali Smart Urban Grid)
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Avatar Picker Modal */}
      <Modal
        visible={avatarModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAvatarModalVisible(false)}
      >
        <View style={styles.avatarModalBackdrop}>
          <View style={[styles.avatarModalContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.avatarModalHandle, { backgroundColor: theme.border }]} />
            <Text style={[styles.avatarModalTitle, { color: theme.text }]}>Update Profile Photo</Text>
            <Text style={[styles.avatarModalSub, { color: theme.textSecondary }]}>
              Take a new photo, upload from gallery, or specify an image URL
            </Text>

            <TouchableOpacity
              style={[styles.avatarOptionBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
              onPress={() => handlePickImage("camera")}
              activeOpacity={0.8}
            >
              <Ionicons name="camera-outline" size={20} color={theme.text} />
              <Text style={[styles.avatarOptionText, { color: theme.text }]}>Take Photo with Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.avatarOptionBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
              onPress={() => handlePickImage("library")}
              activeOpacity={0.8}
            >
              <Ionicons name="images-outline" size={20} color={theme.text} />
              <Text style={[styles.avatarOptionText, { color: theme.text }]}>Choose from Photo Library</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.avatarOptionBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
              onPress={() => {
                setAvatarModalVisible(false);
                setUrlModalVisible(true);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="link-outline" size={20} color={theme.text} />
              <Text style={[styles.avatarOptionText, { color: theme.text }]}>Enter Photo Web URL</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.avatarModalCancelBtn, { backgroundColor: theme.border }]}
              onPress={() => setAvatarModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.avatarModalCancelText, { color: theme.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* URL Input Modal */}
      <Modal
        visible={urlModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUrlModalVisible(false)}
      >
        <View style={styles.avatarModalBackdrop}>
          <View style={[styles.avatarModalContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.avatarModalHandle, { backgroundColor: theme.border }]} />
            <Text style={[styles.avatarModalTitle, { color: theme.text }]}>Enter Profile Photo URL</Text>
            <Text style={[styles.avatarModalSub, { color: theme.textSecondary }]}>
              Paste a direct HTTPS link to your profile image
            </Text>

            <TextInput
              value={customAvatarUrl}
              onChangeText={setCustomAvatarUrl}
              placeholder="https://images.unsplash.com/..."
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              keyboardType="url"
              style={[
                styles.modalTextInput,
                { backgroundColor: theme.background, borderColor: theme.border, color: theme.text },
              ]}
            />

            <TouchableOpacity
              style={[styles.saveProfileModalBtn, { backgroundColor: theme.primaryBtnBg }]}
              onPress={handleApplyImageUrl}
              activeOpacity={0.88}
            >
              <Text style={[styles.saveProfileModalBtnText, { color: theme.primaryBtnText }]}>Apply Photo URL</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.avatarModalCancelBtn, { backgroundColor: theme.border, marginTop: 10 }]}
              onPress={() => setUrlModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.avatarModalCancelText, { color: theme.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Profile Full Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.avatarModalBackdrop}>
          <View style={[styles.editModalContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.editModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.avatarModalTitle, { color: theme.text }]}>Edit Motorist Profile</Text>
                <Text style={[styles.avatarModalSub, { color: theme.textSecondary, marginBottom: 0 }]}>
                  Synchronized with cloud & device storage
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setEditModalVisible(false)}
                style={[styles.modalCloseBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 14 }}>
              {/* Avatar Preview & Action */}
              <View style={styles.editModalAvatarRow}>
                <TouchableOpacity
                  onPress={() => setAvatarModalVisible(true)}
                  style={[styles.editModalAvatarCircle, { backgroundColor: theme.background, borderColor: theme.border }]}
                  activeOpacity={0.8}
                >
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatarImage} resizeMode="cover" />
                  ) : (
                    <Ionicons name="person" size={28} color={theme.textSecondary} />
                  )}
                </TouchableOpacity>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={[styles.editAvatarName, { color: theme.text }]}>Profile Avatar</Text>
                  <TouchableOpacity
                    style={[styles.changePhotoPill, { backgroundColor: theme.background, borderColor: theme.border }]}
                    onPress={() => setAvatarModalVisible(true)}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="camera-outline" size={13} color={theme.text} style={{ marginRight: 4 }} />
                    <Text style={[styles.changePhotoPillText, { color: theme.text }]}>Change Photo</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Input Fields */}
              <View style={styles.modalFieldGroup}>
                <Text style={[styles.modalFieldLabel, { color: theme.textSecondary }]}>FULL LEGAL NAME</Text>
                <TextInput
                  value={editFullName}
                  onChangeText={setEditFullName}
                  placeholder="e.g. Jean Paul Mugisha"
                  placeholderTextColor={theme.textMuted}
                  style={[styles.modalTextInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                />
              </View>

              <View style={styles.modalFieldGroup}>
                <Text style={[styles.modalFieldLabel, { color: theme.textSecondary }]}>PHONE NUMBER</Text>
                <TextInput
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="078... or 073..."
                  placeholderTextColor={theme.textMuted}
                  keyboardType="phone-pad"
                  style={[styles.modalTextInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                />
              </View>

              <View style={styles.modalFieldGroup}>
                <Text style={[styles.modalFieldLabel, { color: theme.textSecondary }]}>EMAIL ADDRESS</Text>
                <TextInput
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="name@domain.com"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={[styles.modalTextInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                />
              </View>



              <View style={styles.modalFieldGroup}>
                <Text style={[styles.modalFieldLabel, { color: theme.textSecondary }]}>EMERGENCY CONTACT</Text>
                <TextInput
                  value={editEmergencyContact}
                  onChangeText={setEditEmergencyContact}
                  placeholder="Next of kin phone number"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="phone-pad"
                  style={[styles.modalTextInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                />
              </View>

              {/* Save CTA */}
              <TouchableOpacity
                style={[styles.saveProfileModalBtn, { backgroundColor: theme.primaryBtnBg, opacity: isSavingProfile ? 0.7 : 1 }]}
                onPress={handleSaveProfile}
                disabled={isSavingProfile}
                activeOpacity={0.88}
              >
                {isSavingProfile ? (
                  <ActivityIndicator size="small" color={theme.primaryBtnText} />
                ) : (
                  <Text style={[styles.saveProfileModalBtnText, { color: theme.primaryBtnText }]}>
                    Save Profile Changes
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default Profile;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: "transparent",
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
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
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 110,
  },
  userCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    marginBottom: 24,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  userAvatarContainer: {
    position: "relative",
    marginBottom: 12,
  },
  avatarCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBrandIcon: {
    width: 36,
    height: 36,
  },
  verifiedBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
    zIndex: 10,
  },
  userName: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  userPhone: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: "400",
  },
  privacyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 12,
  },
  privacyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  privacyPillText: {
    fontSize: 10,
    fontWeight: "500",
  },
  statsGrid: {
    flexDirection: "row",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 16,
    width: "100%",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statBox: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    fontSize: 15,
    fontWeight: "600",
  },
  statLabel: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: "500",
  },
  statDivider: {
    width: 1,
    height: 24,
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 4,
  },
  settingCardRow: {
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
  settingIconBox: {
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
    minWidth: 0,
    paddingRight: 8,
  },
  settingItemTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  settingItemSub: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  itemBadgePill: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  itemBadgeText: {
    fontSize: 9,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  signOutBtn: {
    flexDirection: "row",
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    marginBottom: 20,
  },
  signOutBtnText: {
    color: "#71717A",
    fontSize: 13,
    fontWeight: "600",
  },
  brandFooter: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 30,
    gap: 4,
  },
  brandFooterLogo: {
    width: 28,
    height: 28,
    opacity: 0.6,
  },
  brandFooterTitle: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1,
  },
  versionFooter: {
    fontSize: 10,
  },

  /* Active Vehicle Studio Card */
  vehicleStudioCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  vehicleStudioHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  vehicleLiveTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  vehicleLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  vehicleStudioSectionTag: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.6,
  },
  vehicleStudioTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  customizeBadgeBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  customizeBadgeText: {
    fontSize: 12,
    fontWeight: "500",
  },
  vehicleStageBox: {
    height: 120,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginBottom: 14,
    overflow: "hidden",
  },
  carStageCenter: {
    alignItems: "center",
    justifyContent: "center",
  },
  plateFloatingBadge: {
    position: "absolute",
    bottom: 8,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  plateFlagText: {
    fontSize: 11,
  },
  plateNumberText: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  vehicleSpecsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  emptyVehicleDesc: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: 12,
  },
  registerVehicleCtaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 14,
  },
  registerVehicleCtaText: {
    fontSize: 13,
    fontWeight: "600",
  },
  specItemCol: {
    flex: 1,
    alignItems: "center",
  },
  specItemLabel: {
    fontSize: 10,
    fontWeight: "400",
    marginBottom: 2,
  },
  specItemValue: {
    fontSize: 11,
    fontWeight: "500",
  },
  specItemDivider: {
    width: 1,
    height: 22,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 42,
  },
  avatarModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "flex-end",
  },
  avatarModalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
  },
  avatarModalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  avatarModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  avatarModalSub: {
    fontSize: 12,
    fontWeight: "400",
    marginBottom: 20,
  },
  avatarOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  avatarOptionText: {
    fontSize: 14,
    fontWeight: "500",
  },
  avatarPresetLabel: {
    fontSize: 12,
    fontWeight: "400",
    marginTop: 10,
    marginBottom: 12,
  },
  avatarPresetsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  avatarPresetThumbCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
  },
  avatarPresetThumb: {
    width: "100%",
    height: "100%",
  },
  avatarModalCancelBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarModalCancelText: {
    fontSize: 14,
    fontWeight: "500",
  },

  /* Action Buttons on User Card */
  profileActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    width: "100%",
  },
  profileActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
  },
  profileActionBtnText: {
    fontSize: 12,
    fontWeight: "500",
  },

  /* Edit Profile Modal Styles */
  editModalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    padding: 24,
    maxHeight: "85%",
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
  },
  editModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  editModalAvatarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    paddingVertical: 6,
  },
  editModalAvatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  editAvatarName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
  },
  changePhotoPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  changePhotoPillText: {
    fontSize: 11,
    fontWeight: "500",
  },
  modalFieldGroup: {
    marginBottom: 14,
  },
  modalFieldLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginBottom: 6,
    marginLeft: 2,
  },
  modalTextInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: "500",
  },
  saveProfileModalBtn: {
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    marginBottom: 10,
  },
  saveProfileModalBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },

  /* Motorist Identity Badges */
  detailsBadgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
    width: "100%",
  },
  detailBadgeCol: {
    flex: 1,
    alignItems: "center",
  },
  detailBadgeLabel: {
    fontSize: 10,
    fontWeight: "500",
    marginBottom: 2,
  },
  detailBadgeValue: {
    fontSize: 12,
    fontWeight: "600",
  },
  detailBadgeDivider: {
    width: 1,
    height: 22,
  },

  /* Inline Profile Editor Form */
  inlineEditForm: {
    width: "100%",
    marginTop: 14,
  },
  inlineEditHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(150, 150, 150, 0.2)",
  },
  inlineEditTitle: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  inlineCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineField: {
    marginBottom: 12,
  },
  inlineLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.6,
    marginBottom: 5,
    marginLeft: 2,
  },
  inlineInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: "500",
  },
  inlineBtnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  inlineCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineCancelBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  inlineSaveBtn: {
    flex: 2,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineSaveBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
});