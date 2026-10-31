import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { empty_field, password_regex } from "../lib/auth";
import { updatePassword } from "../services/auth";
import { GlassBackground } from "../../components/GlassBackground";
import { useTheme } from "../../hooks/useTheme";

export default function NewPassword() {
  const theme = useTheme();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [secureText, setSecureText] = useState(true);
  const [secureConfirm, setSecureConfirm] = useState(true);

  const [isPassFocused, setIsPassFocused] = useState(false);
  const [isConfirmFocused, setIsConfirmFocused] = useState(false);

  const handleResetPassword = async () => {
    const emptyErr = empty_field(newPassword) || empty_field(confirmPassword);
    if (emptyErr) {
      setErrorMsg("Please fill in both password fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("Passwords do not match. Please re-enter.");
      return;
    }

    const passRegexErr = password_regex(newPassword);
    if (passRegexErr) {
      setErrorMsg(passRegexErr);
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      await updatePassword(newPassword);
      router.replace("/(auth)/change_succesfully");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update password. Please try again.";
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <GlassBackground>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          {/* Top Bar with Transparent Back Button */}
          <View style={styles.topNav}>
            <TouchableOpacity
              style={[
                styles.backBtn,
                {
                  backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)",
                  borderColor: theme.border,
                },
              ]}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header section matching reference */}
            <View style={styles.headerSection}>
              <Text style={[styles.mainHeading, { color: theme.text }]}>
                Change Password
              </Text>
              <Text style={[styles.subHeading, { color: theme.textSecondary }]}>
                Set a strong password to protect your account and vehicle credentials.{" "}
                <Text
                  style={[styles.faqLink, { color: theme.text }]}
                  onPress={() =>
                    Alert.alert(
                      "Password Guidelines",
                      "Passwords should be at least 8 characters long and contain letters, numbers, and symbols."
                    )
                  }
                >
                  FAQ about us
                </Text>
              </Text>
            </View>

            {/* Error Banner */}
            {errorMsg && (
              <View
                style={[
                  styles.errorBanner,
                  {
                    backgroundColor: theme.isDark ? "rgba(239, 68, 68, 0.12)" : "rgba(239, 68, 68, 0.08)",
                    borderColor: "rgba(239, 68, 68, 0.3)",
                  },
                ]}
              >
                <Ionicons name="alert-circle-outline" size={17} color="#EF4444" style={{ marginRight: 8 }} />
                <Text style={styles.errorBannerText}>{errorMsg}</Text>
              </View>
            )}

            {/* Input 1: New Password Pill */}
            <View
              style={[
                styles.inputPill,
                {
                  backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)",
                  borderColor: isPassFocused
                    ? theme.isDark
                      ? "#FFFFFF"
                      : "#09090B"
                    : theme.isDark
                    ? "rgba(255, 255, 255, 0.14)"
                    : "rgba(0, 0, 0, 0.12)",
                },
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={isPassFocused ? theme.text : theme.textMuted}
                style={styles.inputLeftIcon}
              />
              <TextInput
                style={[styles.textInput, { color: theme.text }]}
                placeholder="New Password"
                placeholderTextColor={theme.textMuted}
                secureTextEntry={secureText}
                value={newPassword}
                onFocus={() => setIsPassFocused(true)}
                onBlur={() => setIsPassFocused(false)}
                onChangeText={(text) => {
                  setNewPassword(text);
                  setErrorMsg(null);
                }}
              />
              <TouchableOpacity
                onPress={() => setSecureText(!secureText)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.eyeToggleBtn}
              >
                <Ionicons
                  name={secureText ? "eye-off-outline" : "eye-outline"}
                  size={19}
                  color={theme.textMuted}
                />
              </TouchableOpacity>
            </View>

            {/* Input 2: Confirm Password Pill */}
            <View
              style={[
                styles.inputPill,
                {
                  backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)",
                  borderColor: isConfirmFocused
                    ? theme.isDark
                      ? "#FFFFFF"
                      : "#09090B"
                    : theme.isDark
                    ? "rgba(255, 255, 255, 0.14)"
                    : "rgba(0, 0, 0, 0.12)",
                  marginTop: 14,
                  marginBottom: 26,
                },
              ]}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={20}
                color={isConfirmFocused ? theme.text : theme.textMuted}
                style={styles.inputLeftIcon}
              />
              <TextInput
                style={[styles.textInput, { color: theme.text }]}
                placeholder="Confirm New Password"
                placeholderTextColor={theme.textMuted}
                secureTextEntry={secureConfirm}
                value={confirmPassword}
                onFocus={() => setIsConfirmFocused(true)}
                onBlur={() => setIsConfirmFocused(false)}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  setErrorMsg(null);
                }}
              />
              <TouchableOpacity
                onPress={() => setSecureConfirm(!secureConfirm)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.eyeToggleBtn}
              >
                <Ionicons
                  name={secureConfirm ? "eye-off-outline" : "eye-outline"}
                  size={19}
                  color={theme.textMuted}
                />
              </TouchableOpacity>
            </View>

            {/* Primary Action Button */}
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                {
                  backgroundColor: theme.primaryBtnBg,
                  shadowColor: theme.isDark ? "#FFFFFF" : "#000000",
                },
              ]}
              onPress={handleResetPassword}
              disabled={isLoading}
              activeOpacity={0.88}
            >
              {isLoading ? (
                <ActivityIndicator color={theme.primaryBtnText} />
              ) : (
                <Text style={[styles.primaryBtnText, { color: theme.primaryBtnText }]}>
                  CONFIRM PASSWORD
                </Text>
              )}
            </TouchableOpacity>

            {/* Footer Row: Back to Sign In */}
            <View style={styles.footerRow}>
              <Text style={[styles.footerText, { color: theme.textSecondary }]}>
                Already updated?{" "}
                <Text
                  style={[styles.footerLinkBold, { color: theme.text }]}
                  onPress={() => router.push("/(auth)/sign_in")}
                >
                  Sign In
                </Text>
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topNav: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 26,
    paddingTop: 24,
    paddingBottom: 40,
  },
  headerSection: {
    marginBottom: 32,
  },
  mainHeading: {
    fontSize: 32,
    fontWeight: "600",
    letterSpacing: -0.6,
    marginBottom: 8,
  },
  subHeading: {
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: "400",
  },
  faqLink: {
    fontWeight: "500",
    textDecorationLine: "underline",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  errorBannerText: {
    color: "#EF4444",
    fontSize: 12,
    fontWeight: "400",
    flex: 1,
  },
  inputPill: {
    height: 56,
    borderRadius: 28,
    borderWidth: 1.2,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  inputLeftIcon: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: "400",
  },
  eyeToggleBtn: {
    padding: 4,
  },
  primaryBtn: {
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 4,
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 1,
  },
  footerRow: {
    marginTop: 36,
    alignItems: "center",
  },
  footerText: {
    fontSize: 13,
    fontWeight: "400",
  },
  footerLinkBold: {
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
