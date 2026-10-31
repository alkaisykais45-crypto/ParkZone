import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
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
import { Icons } from "../../constants/icons";
import { NumberLimit, email_regex, password_regex } from "../lib/auth";
import {
  checkUserExists,
  ensureUserProfile,
  resendSignupOtp,
  signInWithOAuthProvider,
  signUp,
  verifyEmailSignupOtp,
} from "../services/auth";
import { GlassBackground } from "../../components/GlassBackground";
import { useTheme } from "../../hooks/useTheme";

export default function SignUp() {
  const theme = useTheme();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [checked, setChecked] = useState(false);
  const [secureText, setSecureText] = useState(true);
  const [secureConfirm, setSecureConfirm] = useState(true);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isNameFocused, setIsNameFocused] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPhoneFocused, setIsPhoneFocused] = useState(false);
  const [isPassFocused, setIsPassFocused] = useState(false);
  const [isConfirmFocused, setIsConfirmFocused] = useState(false);

  // Email verification modal if Supabase requires email OTP confirmation
  const [verifyModalVisible, setVerifyModalVisible] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const handleSignUp = async () => {
    if (!fullName.trim() || !email.trim() || !phoneNumber.trim() || !password || !confirmPassword) {
      setErrorMessage("Please fill in all fields to create your account.");
      return;
    }

    const emailErr = email_regex(email);
    if (emailErr) {
      setErrorMessage(emailErr);
      return;
    }

    const phoneErr = NumberLimit(phoneNumber);
    if (phoneErr) {
      setErrorMessage(phoneErr);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match. Please re-enter.");
      return;
    }

    const passErr = password_regex(password);
    if (passErr) {
      setErrorMessage(passErr);
      return;
    }

    if (!checked) {
      setErrorMessage("Please accept the Terms of Service & Privacy Policy.");
      return;
    }

    setErrorMessage(null);
    setIsSigningUp(true);

    try {
      await checkUserExists(phoneNumber);
      const result = await signUp(email, password, phoneNumber, fullName);

      if (result.requiresEmailConfirmation) {
        setVerifyError(null);
        setVerifyCode("");
        setVerifyModalVisible(true);
      } else {
        router.replace("/(auth)/succesfully");
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to create your account. Please try again.";
      setErrorMessage(message);
    } finally {
      setIsSigningUp(false);
    }
  };

  const handleVerifySignupCode = async () => {
    if (verifyCode.trim().length < 6) {
      setVerifyError("Please enter the 6-digit verification code sent to your email.");
      return;
    }
    setVerifyLoading(true);
    setVerifyError(null);
    try {
      const data = await verifyEmailSignupOtp(email, verifyCode);
      if (data?.user) {
        await ensureUserProfile(data.user, {
          email,
          phoneNumber,
          fullName,
        });
      }
      setVerifyModalVisible(false);
      router.replace("/(auth)/succesfully");
    } catch (e: any) {
      setVerifyError(e?.message || "Invalid or expired verification code.");
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleOAuthSignUp = async (provider: "google" | "apple") => {
    setOauthLoading(provider);
    setErrorMessage(null);
    try {
      await signInWithOAuthProvider(provider);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : `Could not sign up with ${provider === "google" ? "Google" : "Apple"}.`;
      setErrorMessage(message);
    } finally {
      setOauthLoading(null);
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
            {/* Header section */}
            <View style={styles.headerSection}>
              <Text style={[styles.mainHeading, { color: theme.text }]}>
                Create Account
              </Text>
              <Text style={[styles.subHeading, { color: theme.textSecondary }]}>
                Register your motorist profile for smart parking & EV charging.{" "}
                <Text
                  style={[styles.faqLink, { color: theme.text }]}
                  onPress={() =>
                    Alert.alert(
                      "ParkZone Registration",
                      "Creating an account links your vehicles to automated parking check-in, EV charging telemetry, and cashless payments."
                    )
                  }
                >
                  FAQ about us
                </Text>
              </Text>
            </View>

            {/* Error Message Banner */}
            {errorMessage && (
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
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
              </View>
            )}

            {/* Input 0: Full Name */}
            <View
              style={[
                styles.inputPill,
                {
                  backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)",
                  borderColor: isNameFocused
                    ? theme.isDark
                      ? "#FFFFFF"
                      : "#09090B"
                    : theme.isDark
                    ? "rgba(255, 255, 255, 0.14)"
                    : "rgba(0, 0, 0, 0.12)",
                  marginBottom: 14,
                },
              ]}
            >
              <Ionicons
                name="person-outline"
                size={20}
                color={isNameFocused ? theme.text : theme.textMuted}
                style={styles.inputLeftIcon}
              />
              <TextInput
                style={[styles.textInput, { color: theme.text }]}
                placeholder="Full Name"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="words"
                value={fullName}
                onFocus={() => setIsNameFocused(true)}
                onBlur={() => setIsNameFocused(false)}
                onChangeText={(text) => {
                  setFullName(text);
                  setErrorMessage(null);
                }}
              />
            </View>

            {/* Input 1: Email Address */}
            <View
              style={[
                styles.inputPill,
                {
                  backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)",
                  borderColor: isEmailFocused
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
                name="mail-outline"
                size={20}
                color={isEmailFocused ? theme.text : theme.textMuted}
                style={styles.inputLeftIcon}
              />
              <TextInput
                style={[styles.textInput, { color: theme.text }]}
                placeholder="Email Address"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={email}
                onFocus={() => setIsEmailFocused(true)}
                onBlur={() => setIsEmailFocused(false)}
                onChangeText={(text) => {
                  setEmail(text);
                  setErrorMessage(null);
                }}
              />
            </View>

            {/* Input 2: Phone Number with Country Code */}
            <View
              style={[
                styles.inputPill,
                {
                  backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)",
                  borderColor: isPhoneFocused
                    ? theme.isDark
                      ? "#FFFFFF"
                      : "#09090B"
                    : theme.isDark
                    ? "rgba(255, 255, 255, 0.14)"
                    : "rgba(0, 0, 0, 0.12)",
                  marginTop: 14,
                },
              ]}
            >
              <View
                style={[
                  styles.flagPill,
                  {
                    backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.1)" : "#E4E4E7",
                    borderColor: theme.border,
                  },
                ]}
              >
                <Ionicons name="call-outline" size={14} color={theme.text} style={{ marginRight: 4 }} />
                <Text style={[styles.flagCodeText, { color: theme.text }]}>+250</Text>
              </View>

              <View style={[styles.inputDivider, { backgroundColor: theme.border }]} />

              <TextInput
                style={[styles.textInput, { color: theme.text }]}
                placeholder="Phone number"
                placeholderTextColor={theme.textMuted}
                keyboardType="phone-pad"
                value={phoneNumber}
                onFocus={() => setIsPhoneFocused(true)}
                onBlur={() => setIsPhoneFocused(false)}
                onChangeText={(text) => {
                  setPhoneNumber(text);
                  setErrorMessage(null);
                }}
              />
            </View>

            {/* Input 3: Password */}
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
                  marginTop: 14,
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
                placeholder="Enter password"
                placeholderTextColor={theme.textMuted}
                secureTextEntry={secureText}
                value={password}
                onFocus={() => setIsPassFocused(true)}
                onBlur={() => setIsPassFocused(false)}
                onChangeText={(text) => {
                  setPassword(text);
                  setErrorMessage(null);
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

            {/* Input 4: Confirm Password */}
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
                placeholder="Confirm password"
                placeholderTextColor={theme.textMuted}
                secureTextEntry={secureConfirm}
                value={confirmPassword}
                onFocus={() => setIsConfirmFocused(true)}
                onBlur={() => setIsConfirmFocused(false)}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  setErrorMessage(null);
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

            {/* Terms of Service & Privacy Checkbox */}
            <TouchableOpacity
              style={styles.termsCheckboxRow}
              onPress={() => setChecked(!checked)}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.checkboxBox,
                  {
                    backgroundColor: checked
                      ? theme.text
                      : theme.isDark
                      ? "rgba(255, 255, 255, 0.05)"
                      : "rgba(0, 0, 0, 0.05)",
                    borderColor: checked
                      ? theme.text
                      : theme.isDark
                      ? "rgba(255, 255, 255, 0.25)"
                      : "rgba(0, 0, 0, 0.25)",
                  },
                ]}
              >
                {checked && (
                  <Ionicons
                    name="checkmark"
                    size={13}
                    color={theme.isDark ? "#09090B" : "#FFFFFF"}
                  />
                )}
              </View>
              <Text style={[styles.termsText, { color: theme.textSecondary }]}>
                I agree to{" "}
                <Text
                  style={[styles.termsLinkBold, { color: theme.text }]}
                  onPress={() => router.push("/(auth)/terms_privacy")}
                >
                  Terms of Service
                </Text>{" "}
                &{" "}
                <Text
                  style={[styles.termsLinkBold, { color: theme.text }]}
                  onPress={() => router.push("/(auth)/terms_privacy")}
                >
                  Privacy Policy
                </Text>
              </Text>
            </TouchableOpacity>

            {/* Primary Action Button: SIGN UP */}
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                {
                  backgroundColor: theme.primaryBtnBg,
                  shadowColor: theme.isDark ? "#FFFFFF" : "#000000",
                },
              ]}
              onPress={handleSignUp}
              disabled={isSigningUp || oauthLoading !== null}
              activeOpacity={0.88}
            >
              {isSigningUp ? (
                <ActivityIndicator color={theme.primaryBtnText} />
              ) : (
                <Text style={[styles.primaryBtnText, { color: theme.primaryBtnText }]}>
                  SIGN UP
                </Text>
              )}
            </TouchableOpacity>

            {/* OR Divider Row */}
            <View style={styles.orDividerRow}>
              <View style={[styles.orDividerLine, { backgroundColor: theme.border }]} />
              <Text style={[styles.orDividerText, { color: theme.textMuted }]}>or</Text>
              <View style={[styles.orDividerLine, { backgroundColor: theme.border }]} />
            </View>

            {/* OAuth Sign Up Pills */}
            <TouchableOpacity
              style={[
                styles.socialPillBtn,
                {
                  backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.04)" : "#F4F4F6",
                  borderColor: theme.border,
                },
              ]}
              onPress={() => handleOAuthSignUp("google")}
              disabled={isSigningUp || oauthLoading !== null}
              activeOpacity={0.8}
            >
              {oauthLoading === "google" ? (
                <ActivityIndicator size="small" color={theme.text} />
              ) : (
                <>
                  <Image
                    source={Icons.googleIcon}
                    style={{ width: 19, height: 19, marginRight: 10 }}
                    resizeMode="contain"
                  />
                  <Text style={[styles.socialPillText, { color: theme.text }]}>Sign up with Google</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.socialPillBtn,
                {
                  backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.04)" : "#F4F4F6",
                  borderColor: theme.border,
                  marginTop: 12,
                },
              ]}
              onPress={() => handleOAuthSignUp("apple")}
              disabled={isSigningUp || oauthLoading !== null}
              activeOpacity={0.8}
            >
              {oauthLoading === "apple" ? (
                <ActivityIndicator size="small" color={theme.text} />
              ) : (
                <>
                  <Ionicons name="logo-apple" size={20} color={theme.text} style={{ marginRight: 10 }} />
                  <Text style={[styles.socialPillText, { color: theme.text }]}>Sign up with Apple</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Footer Row: Already have an account? Sign In */}
            <View style={styles.footerRow}>
              <Text style={[styles.footerText, { color: theme.textSecondary }]}>
                Already have an account?{" "}
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

        {/* Email OTP Confirmation Modal */}
        <Modal
          visible={verifyModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setVerifyModalVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", padding: 24 }}>
            <View
              style={{
                backgroundColor: theme.surface,
                borderColor: theme.border,
                borderWidth: 1,
                borderRadius: 24,
                padding: 22,
              }}
            >
              <Text style={{ fontSize: 19, fontWeight: "600", color: theme.text, marginBottom: 6 }}>
                Verify Your Email
              </Text>
              <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 19, marginBottom: 16 }}>
                We sent a confirmation email to {email.trim().toLowerCase()}. Enter the 6-digit code below (or click the confirmation link in your email, then Sign In).
              </Text>

              {verifyError ? (
                <Text style={{ color: "#EF4444", fontSize: 12, fontWeight: "500", marginBottom: 10 }}>
                  {verifyError}
                </Text>
              ) : null}

              <TextInput
                style={{
                  height: 52,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.background,
                  color: theme.text,
                  fontSize: 20,
                  fontWeight: "600",
                  letterSpacing: 6,
                  textAlign: "center",
                  marginBottom: 16,
                }}
                value={verifyCode}
                onChangeText={(t) => {
                  setVerifyCode(t.replace(/\D/g, "").slice(0, 6));
                  setVerifyError(null);
                }}
                placeholder="000000"
                placeholderTextColor={theme.textMuted}
                keyboardType="number-pad"
                maxLength={6}
              />

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.primaryBtnBg, height: 50 }]}
                onPress={handleVerifySignupCode}
                disabled={verifyLoading}
              >
                {verifyLoading ? (
                  <ActivityIndicator color={theme.primaryBtnText} />
                ) : (
                  <Text style={[styles.primaryBtnText, { color: theme.primaryBtnText }]}>
                    VERIFY & COMPLETE
                  </Text>
                )}
              </TouchableOpacity>

              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 14 }}>
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      await resendSignupOtp(email);
                      Alert.alert("Code Resent", "Check your inbox for the verification code.");
                    } catch (e: any) {
                      setVerifyError(e?.message || "Could not resend code.");
                    }
                  }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: "500", color: theme.text }}>Resend Email</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setVerifyModalVisible(false);
                    router.replace("/(auth)/sign_in");
                  }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: "500", color: theme.textSecondary }}>
                    Go to Sign In
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
    paddingTop: 20,
    paddingBottom: 40,
  },
  headerSection: {
    marginBottom: 28,
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
  flagPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  flagCodeText: {
    fontSize: 13,
    fontWeight: "500",
  },
  inputDivider: {
    width: 1,
    height: 24,
    marginHorizontal: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: "400",
  },
  eyeToggleBtn: {
    padding: 4,
  },
  termsCheckboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  termsText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },
  termsLinkBold: {
    fontWeight: "600",
    textDecorationLine: "underline",
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
  orDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 24,
  },
  orDividerLine: {
    flex: 1,
    height: 1,
  },
  orDividerText: {
    paddingHorizontal: 14,
    fontSize: 12,
    fontWeight: "400",
  },
  socialPillBtn: {
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  socialPillText: {
    fontSize: 14,
    fontWeight: "500",
  },
  footerRow: {
    marginTop: 32,
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