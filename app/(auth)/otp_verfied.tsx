import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Icons } from "../../constants/icons";
import { GlassBackground } from "../../components/GlassBackground";
import { GlassCard } from "../../components/GlassCard";
import { useTheme } from "../../hooks/useTheme";

const OtpVerified = () => {
  const theme = useTheme();

  return (
    <GlassBackground>
      <SafeAreaView style={styles.container}>
        <GlassCard style={styles.card} intensity={60}>
          <View style={styles.badgeContainer}>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: theme.accentSoft,
                  borderColor: theme.borderStrong,
                },
              ]}
            >
              <Image
                source={Icons.logoImg}
                style={{ width: 34, height: 34, tintColor: theme.text }}
                resizeMode="contain"
              />
            </View>
          </View>

          <View
            style={[
              styles.securityTag,
              {
                backgroundColor: theme.accentSoft,
                borderColor: theme.borderStrong,
              },
            ]}
          >
            <View style={[styles.securityDot, { backgroundColor: theme.text }]} />
            <Text style={[styles.securityText, { color: theme.text }]}>
              DATA ENCRYPTION • VERIFIED
            </Text>
          </View>

          <Text style={[styles.title, { color: theme.text }]}>
            Identity Verified
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Your security code was confirmed on the Kigali Smart Grid platform. You may now configure your new password.
          </Text>

          <TouchableOpacity
            style={[
              styles.primaryPillBtn,
              {
                backgroundColor: theme.primaryBtnBg,
                shadowColor: theme.cardShadow,
              },
            ]}
            onPress={() => router.replace("/(auth)/new_pass")}
            activeOpacity={0.85}
          >
            <Text style={[styles.primaryPillBtnText, { color: theme.primaryBtnText }]}>
              Set New Password
            </Text>
          </TouchableOpacity>
        </GlassCard>
      </SafeAreaView>
    </GlassBackground>
  );
};

export default OtpVerified;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 22,
  },
  card: {
    width: "100%",
    alignItems: "center",
  },
  badgeContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  badge: {
    width: 68,
    height: 68,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  securityTag: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 12,
  },
  securityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  securityText: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  primaryPillBtn: {
    borderRadius: 26,
    height: 52,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryPillBtnText: {
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
});
