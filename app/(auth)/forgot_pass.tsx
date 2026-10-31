import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { sendPasswordResetOtp, verifyRecoveryOtp } from "../services/auth";
import { GlassBackground } from "../../components/GlassBackground";
import { useTheme } from "../../hooks/useTheme";

export default function ForgotPassword() {
  const theme = useTheme();

  const [inputVal, setInputVal] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [otpErrorMsg, setOtpErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const inputRefs = useRef<Array<TextInput | null>>([]);

  const MAX_ATTEMPTS = 3;
  const LOCK_DURATION = 3 * 60 * 1000;
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    if (!lockUntil) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    const updateTimer = () => {
      const remainingSeconds = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setSecondsLeft(remainingSeconds);

      if (remainingSeconds <= 0) {
        setIsLocked(false);
        setLockUntil(null);
        setAttempts(0);
        setOtpErrorMsg(null);
        return;
      }

      setIsLocked(true);
      timeoutId = setTimeout(updateTimer, 1000);
    };

    updateTimer();
    return () => clearTimeout(timeoutId);
  }, [lockUntil]);

  const handleChangeText = (text: string, index: number) => {
    const digits = text.replace(/\D/g, "");
    const newOtp = [...otp];

    if (digits.length > 1) {
      digits
        .slice(0, 6 - index)
        .split("")
        .forEach((digit, offset) => {
          newOtp[index + offset] = digit;
        });
      setOtp(newOtp);
      inputRefs.current[Math.min(index + digits.length, 5)]?.focus();
      return;
    }

    newOtp[index] = digits;
    setOtp(newOtp);
    if (digits && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number
  ) => {
    if (e.nativeEvent.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSendOtp = async () => {
    const clean = inputVal.trim();
    if (!clean) {
      setErrorMsg("Please enter your registered phone or email.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      await sendPasswordResetOtp(clean);
      setShowModal(true);
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to send reset code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    const token = otp.join("");
    if (token.length < 6) {
      setOtpErrorMsg("Please enter all 6 digits.");
      return;
    }

    setIsLoading(true);
    setOtpErrorMsg(null);

    try {
      await verifyRecoveryOtp(inputVal.trim(), token);
      setShowModal(false);
      router.push("/(auth)/new_pass");
    } catch (e: any) {
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);

      if (nextAttempts >= MAX_ATTEMPTS) {
        setLockUntil(Date.now() + LOCK_DURATION);
        setIsLocked(true);
        setOtpErrorMsg("Maximum attempts reached. Please wait 3 minutes.");
      } else {
        setOtpErrorMsg(`Invalid code. ${MAX_ATTEMPTS - nextAttempts} attempt(s) remaining.`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (isLocked) return;
    setIsLoading(true);
    setOtpErrorMsg(null);

    try {
      await sendPasswordResetOtp(inputVal.trim());
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch (e: any) {
      setOtpErrorMsg(e?.message || "Could not resend code.");
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
                Forgot Password
              </Text>
              <Text style={[styles.subHeading, { color: theme.textSecondary }]}>
                Enter your phone number or email to receive a recovery code.{" "}
                <Text
                  style={[styles.faqLink, { color: theme.text }]}
                  onPress={() =>
                    Alert.alert(
                      "Account Recovery Help",
                      "Recovery codes are sent via SMS to Rwandan numbers (+250) or registered email."
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

            {/* Pill Input with Rwanda Flag / Country Code & Input Field */}
            <View
              style={[
                styles.inputPill,
                {
                  backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)",
                  borderColor: isInputFocused
                    ? theme.isDark
                      ? "#FFFFFF"
                      : "#09090B"
                    : theme.isDark
                    ? "rgba(255, 255, 255, 0.14)"
                    : "rgba(0, 0, 0, 0.12)",
                },
              ]}
            >
              {/* Flag / Code Badge */}
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
                <Ionicons name="chevron-down" size={12} color={theme.textMuted} style={{ marginLeft: 3 }} />
              </View>

              <View style={[styles.inputDivider, { backgroundColor: theme.border }]} />

              <TextInput
                style={[styles.textInput, { color: theme.text }]}
                placeholder="Email address or phone number"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                value={inputVal}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                onChangeText={(text) => {
                  setInputVal(text);
                  setErrorMsg(null);
                }}
              />
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
              onPress={handleSendOtp}
              disabled={isLoading}
              activeOpacity={0.88}
            >
              {isLoading ? (
                <ActivityIndicator color={theme.primaryBtnText} />
              ) : (
                <Text style={[styles.primaryBtnText, { color: theme.primaryBtnText }]}>
                  SEND CODE
                </Text>
              )}
            </TouchableOpacity>

            {/* Footer Row: Remember password? Sign In */}
            <View style={styles.footerRow}>
              <Text style={[styles.footerText, { color: theme.textSecondary }]}>
                Remember password?{" "}
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

        {/* Minimal OTP Verification Modal */}
        <Modal
          visible={showModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setShowModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: theme.isDark ? "#121214" : "#FFFFFF",
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.modalHeaderRow}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Enter Code</Text>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <Ionicons name="close" size={22} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
                We sent a 6-digit verification code to {inputVal}
              </Text>

              {otpErrorMsg && (
                <Text style={styles.modalErrorText}>{otpErrorMsg}</Text>
              )}

              {/* 6 Digit Input Boxes */}
              <View style={styles.otpBoxesRow}>
                {otp.map((digit, idx) => (
                  <TextInput
                    key={idx}
                    ref={(ref) => { inputRefs.current[idx] = ref; }}
                    value={digit}
                    onChangeText={(t) => handleChangeText(t, idx)}
                    onKeyPress={(e) => handleKeyPress(e, idx)}
                    keyboardType="number-pad"
                    maxLength={1}
                    style={[
                      styles.otpBox,
                      {
                        backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
                        borderColor: digit ? theme.text : theme.border,
                        color: theme.text,
                      },
                    ]}
                  />
                ))}
              </View>

              {/* Verify Button */}
              <TouchableOpacity
                style={[styles.modalPrimaryBtn, { backgroundColor: theme.primaryBtnBg }]}
                onPress={handleVerify}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={theme.primaryBtnText} />
                ) : (
                  <Text style={[styles.modalPrimaryBtnText, { color: theme.primaryBtnText }]}>
                    VERIFY & PROCEED
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleResend}
                disabled={isLocked || isLoading}
                style={styles.resendBtn}
              >
                <Text style={[styles.resendText, { color: theme.textSecondary }]}>
                  {isLocked
                    ? `Resend in ${secondsLeft}s`
                    : "Didn't receive code? Resend"}
                </Text>
              </TouchableOpacity>
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
    paddingHorizontal: 14,
    marginBottom: 24,
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

  /* Modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
  },
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  modalSub: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20,
  },
  modalErrorText: {
    color: "#EF4444",
    fontSize: 12,
    fontWeight: "400",
    marginBottom: 12,
  },
  otpBoxesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  otpBox: {
    width: 44,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "600",
  },
  modalPrimaryBtn: {
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryBtnText: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
  resendBtn: {
    marginTop: 16,
    alignItems: "center",
  },
  resendText: {
    fontSize: 12,
    fontWeight: "400",
  },
});
