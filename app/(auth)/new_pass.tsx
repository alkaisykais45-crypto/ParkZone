import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Icons } from "../../constants/icons";
import { password_regex, empty_field } from "../lib/auth";
import { updatePassword } from "../services/auth";


const NewPassword = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const hasMinLength = newPassword.length >= 8;
  const hasUpperLower = /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword);
  const hasSpecial = /[@$!%*?&#^()_+=\-[\]{}|;:'",.<>/?]/.test(newPassword);
  const hasNumber = /\d/.test(newPassword);
  const isPasswordValid = hasMinLength && hasUpperLower && (hasSpecial || hasNumber);

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
      setTimeout(() => {
        router.replace("/(auth)/change_succesfully");
      }, 1000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update password. Please try again.";
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="auth-screen forgot-password-screen">
      <View className="auth-content">
        <View className="arrow-back">
          <TouchableOpacity onPress={() => router.back()}>
            <Image className="arrow-icon" source={Icons.arrowBack} />
          </TouchableOpacity>
        </View>

        <View className="forgot-password-page-container">
          <Text className="forgot-password-title">Create New Password</Text>
          <View className="forgot-password-subtext-container">
            <Text className="forgot-password-subtext">
              Your new password must be different from previous used passwords.
            </Text>
          </View>
        </View>

        <View className="forgot-password-action-container">
          <Text className="forgot-password-action-text">New Password</Text>
          <TextInput
            className="forgot-password-input"
            placeholder="Enter new password"
            secureTextEntry
            value={newPassword}
            onChangeText={(text) => {
              setNewPassword(text);
              setErrorMsg(null);
            }}
          />
          <Image className="email-icon" source={Icons.lockIcon} />
        </View>

        <View className="forgot-password-action-container" style={{ marginTop: 16 }}>
          <Text className="forgot-password-action-text">Confirm Password</Text>
          <TextInput
            className="forgot-password-input"
            placeholder="Confirm new password"
            secureTextEntry
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              setErrorMsg(null);
            }}
          />
          <Image className="email-icon" source={Icons.lockIcon} />
        </View>

        {errorMsg && <Text className="new-password-error-text">{errorMsg}</Text>}

        <View className="verfication-container-password">
          <Text
            className={`password-verification-text_a ${hasMinLength ? "password-verfication-valid" : "password-verfication-invalid"}`}
          >
            {hasMinLength ? "✓ " : "• "}Password must contain at least 8 characters
          </Text>
          <Text
            className={`password-verification-text_b ${hasUpperLower ? "password-verfication-valid" : "password-verfication-invalid"}`}
          >
            {hasUpperLower ? "✓ " : "• "}Password must contain at least 1 uppercase and lowercase letter
          </Text>
          <Text
            className={`password-verification-text_c ${hasSpecial ? "password-verfication-valid" : "password-verfication-invalid"}`}
          >
            {hasSpecial ? "✓ " : "• "}Password must contain at least 1 special character
          </Text>
        </View>

        {successMsg && <Text className="success-text">{successMsg}</Text>}

        <View className="new-password-submit-container">
          <TouchableOpacity
            className="forgot-password-submit-button"
            onPress={handleResetPassword}
            disabled={isLoading || !isPasswordValid}
          >
            <Text className="forgot-password-submit-button-text">
              {isLoading ? "Updating..." : "Change Password"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default NewPassword;
