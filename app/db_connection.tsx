import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "./lib/supabase";
import { useTheme } from "../hooks/useTheme";

const DbConnection = () => {
  const theme = useTheme();
  const [status, setStatus] = useState("Checking database connection...");
  const [isConnected, setIsConnected] = useState(false);

  const checkConnection = async () => {
    setStatus("Checking database connection...");
    setIsConnected(false);

    try {
      const { error } = await supabase.auth.getSession();

      if (error) {
        setStatus(error.message);
        return;
      }

      setIsConnected(true);
      setStatus("Database connected successfully");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Connection failed");
    }
  };

  useEffect(() => {
    checkConnection();
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <Text
          style={[
            styles.statusText,
            { color: isConnected ? theme.text : theme.danger },
          ]}
        >
          {status}
        </Text>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.primaryBtnBg }]}
          onPress={checkConnection}
          activeOpacity={0.85}
        >
          <Text style={[styles.buttonText, { color: theme.primaryBtnText }]}>
            Check Again
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default DbConnection;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
  },
  statusText: {
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
    marginBottom: 20,
  },
  button: {
    width: "100%",
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
