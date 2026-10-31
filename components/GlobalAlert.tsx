import React, { useEffect, useState } from "react";
import {
  BackHandler,
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import {
  globalAlert,
  GlobalAlertButton,
  GlobalAlertConfig,
} from "../app/services/globalAlert";
import { useTheme } from "../hooks/useTheme";

const { width } = Dimensions.get("window");

export const GlobalAlert: React.FC = () => {
  const theme = useTheme();
  const [config, setConfig] = useState<GlobalAlertConfig | null>(null);

  useEffect(() => {
    const unsubscribe = globalAlert.subscribe((newConfig) => {
      setConfig(newConfig);
    });
    return unsubscribe;
  }, []);

  // Handle Android hardware back button
  useEffect(() => {
    if (!config) return;

    const onBackPress = () => {
      if (config.cancelable !== false) {
        handleDismiss();
        return true;
      }
      return true;
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress
    );

    return () => backHandler.remove();
  }, [config]);

  const handleDismiss = () => {
    if (!config) return;
    config.onDismiss?.();
    globalAlert.hide();
  };

  const handleButtonPress = (btn: GlobalAlertButton) => {
    globalAlert.hide();
    btn.onPress?.();
  };

  if (!config) return null;

  const buttons = config.buttons && config.buttons.length > 0
    ? config.buttons
    : [{ text: "OK", style: "default" as const }];

  const isTwoButtons = buttons.length === 2;

  return (
    <Modal
      transparent
      visible={!!config}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <TouchableWithoutFeedback
        onPress={() => {
          if (config.cancelable !== false) {
            handleDismiss();
          }
        }}
      >
        <View
          style={[
            styles.backdropOverlay,
            {
              backgroundColor: theme.isDark
                ? "rgba(0, 0, 0, 0.72)"
                : "rgba(9, 9, 11, 0.45)",
            },
          ]}
        >
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.dialogCard,
                {
                  backgroundColor: theme.isDark ? "#18181B" : "#FFFFFF",
                  borderColor: theme.isDark ? "#27272A" : "#E4E4E7",
                  shadowColor: "#000000",
                },
              ]}
            >
              {/* Pure typography Title - Strictly NO icons or emojis */}
              {config.title ? (
                <Text
                  style={[
                    styles.titleText,
                    { color: theme.isDark ? "#FFFFFF" : "#09090B" },
                  ]}
                >
                  {config.title}
                </Text>
              ) : null}

              {/* Pure typography Message - Strictly NO icons or emojis */}
              {config.message ? (
                <Text
                  style={[
                    styles.messageText,
                    { color: theme.isDark ? "#A1A1AA" : "#52525B" },
                  ]}
                >
                  {config.message}
                </Text>
              ) : null}

              {/* Buttons Container */}
              <View
                style={
                  isTwoButtons
                    ? styles.twoButtonsRow
                    : styles.stackedButtonsCol
                }
              >
                {buttons.map((btn, idx) => {
                  const isCancel = btn.style === "cancel";
                  const isDestructive = btn.style === "destructive";

                  let btnBgColor = theme.isDark ? "#FFFFFF" : "#09090B";
                  let btnTextColor = theme.isDark ? "#09090B" : "#FFFFFF";
                  let btnBorderColor: string | undefined = undefined;

                  if (isCancel) {
                    btnBgColor = theme.isDark ? "#27272A" : "#F4F4F5";
                    btnTextColor = theme.isDark ? "#FFFFFF" : "#18181B";
                    btnBorderColor = theme.isDark ? "#3F3F46" : "#E4E4E7";
                  } else if (isDestructive) {
                    btnBgColor = "#EF4444";
                    btnTextColor = "#FFFFFF";
                  }

                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.buttonBase,
                        isTwoButtons && styles.twoButtonFlex,
                        {
                          backgroundColor: btnBgColor,
                          borderWidth: btnBorderColor ? 1 : 0,
                          borderColor: btnBorderColor,
                        },
                      ]}
                      onPress={() => handleButtonPress(btn)}
                      activeOpacity={0.82}
                    >
                      <Text
                        style={[
                          styles.buttonText,
                          {
                            color: btnTextColor,
                            fontWeight: isCancel ? "500" : "400",
                          },
                        ]}
                      >
                        {btn.text || "OK"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdropOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  dialogCard: {
    width: Math.min(width - 48, 380),
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  titleText: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: -0.3,
    marginBottom: 8,
    textAlign: "left",
  },
  messageText: {
    fontSize: 14.5,
    lineHeight: 22,
    fontWeight: "400",
    marginBottom: 22,
    textAlign: "left",
  },
  twoButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  twoButtonFlex: {
    flex: 1,
  },
  stackedButtonsCol: {
    flexDirection: "column",
    gap: 10,
  },
  buttonBase: {
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  buttonText: {
    fontSize: 14.5,
    letterSpacing: -0.2,
  },
});
