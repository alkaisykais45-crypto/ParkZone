import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import ConfettiCannon from "react-native-confetti-cannon";


const ChangeSuccessfully = () => {
  const router = useRouter();
  return (
    <SafeAreaView className="success-screen">
      <View className="success-content">
        <View className="success-mark">
          <Text className="success-mark-text">✓</Text>
        </View>
        <Text className="success-eyebrow">PARKZONE</Text>
        <Text className="success-text">Password Updated!</Text>
        <Text className="success-subtext">
          Your password has been changed successfully. You can now log in with your new credentials.
        </Text>
        <ConfettiCannon
          count={180}
          origin={{ x: 0, y: 0 }}
          autoStart
          fadeOut
          explosionSpeed={400}
          fallSpeed={2600}
        />
      </View>

      <View className="back-button-container">
        <TouchableOpacity
          className="back-login-button"
          onPress={() => router.replace("/(auth)/sign_in")}
        >
          <Text className="back-login-button-text">Back to Login</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default ChangeSuccessfully;