import { router } from "expo-router/build/exports";
import { Image, TouchableOpacity } from "react-native";
import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icons } from "../../constants/icons";

export default function TermsService() {
  
  const [activeTab, setActiveTab] = useState("Terms");

  return (
    <SafeAreaView className="auth-screen">

      <View className="arrow-container">

        <Pressable onPress={() => router.back()}>
          <Image source={Icons.arrowBack} className="arrow-icon" />
        </Pressable>
      </View>

      <View className="terms-service-container">
        <Text className="terms-service-header-text">Terms of Service</Text>
      </View>


      <View className="legal-tabs-container">
        <TouchableOpacity onPress={() => setActiveTab("Terms")}>
          <Text className={`legal-tab ${activeTab === "Terms" ? "active" : ""}`}>Terms</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setActiveTab("Privacy")}>
          <Text className={`legal-tab ${activeTab === "Privacy" ? "active" : ""}`}>Privacy</Text>
        </TouchableOpacity>

      <View className={`underline-slider ${activeTab === 'Terms' ? 'left-0' : 'left-1/2'}`} />
      </View>




    <View className="legal-content-container">
      {activeTab === "Terms" && (
        <Text className="legal-content-terms">
          Heres the Terms of Service content.
        </Text>
      )}
      {activeTab === "Privacy" && (
        <Text className="legal-content-privacy">
          Heres the Privacy Policy content.
        </Text>
      )}
    </View>

  


    </SafeAreaView>
  );
}
