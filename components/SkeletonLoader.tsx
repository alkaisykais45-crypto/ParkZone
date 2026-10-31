import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, Easing, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../hooks/useTheme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface SkeletonBoxProps {
  width?: number | `${number}%` | "auto";
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export const SkeletonBox: React.FC<SkeletonBoxProps> = ({
  width = "100%",
  height,
  borderRadius = 10,
  style,
}) => {
  const theme = useTheme();
  const pulseAnim = useRef(new Animated.Value(0.42)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.9,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.42,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const boneBg = theme.isDark ? "#27272A" : "#E4E4E7";

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: boneBg,
          opacity: pulseAnim,
        },
        style,
      ]}
    />
  );
};

export const HomeDiscoverySkeleton: React.FC = () => {
  const theme = useTheme();
  return (
    <View style={{ gap: 18 }}>
      {/* Instant Park Hero Card Skeleton */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            padding: 16,
          },
        ]}
      >
        <View style={styles.rowBetween}>
          <View style={styles.rowGap8}>
            <SkeletonBox width={96} height={22} borderRadius={11} />
            <SkeletonBox width={68} height={14} borderRadius={6} />
          </View>
          <SkeletonBox width={74} height={18} borderRadius={6} />
        </View>
        <SkeletonBox width="68%" height={20} borderRadius={6} style={{ marginTop: 12 }} />
        <SkeletonBox width="48%" height={14} borderRadius={6} style={{ marginTop: 8 }} />
        <View style={[styles.rowBetween, { marginTop: 16 }]}>
          <SkeletonBox width={118} height={30} borderRadius={15} />
          <SkeletonBox width={136} height={36} borderRadius={18} />
        </View>
      </View>

      {/* Nearby Section Header + Zone Chips */}
      <View>
        <View style={styles.rowBetween}>
          <SkeletonBox width={140} height={20} borderRadius={6} />
          <SkeletonBox width={90} height={30} borderRadius={15} />
        </View>
        <View style={[styles.rowGap8, { marginTop: 12 }]}>
          <SkeletonBox width={78} height={32} borderRadius={16} />
          <SkeletonBox width={68} height={32} borderRadius={16} />
          <SkeletonBox width={68} height={32} borderRadius={16} />
          <SkeletonBox width={68} height={32} borderRadius={16} />
        </View>
      </View>

      {/* Horizontal Nearby Cards Skeleton */}
      <View style={styles.rowGap14}>
        {[0, 1].map((idx) => (
          <View
            key={idx}
            style={[
              styles.card,
              {
                width: 236,
                backgroundColor: theme.surface,
                borderColor: theme.border,
                overflow: "hidden",
              },
            ]}
          >
            <SkeletonBox width="100%" height={124} borderRadius={0} />
            <View style={{ padding: 12, gap: 8 }}>
              <SkeletonBox width="78%" height={16} borderRadius={6} />
              <SkeletonBox width="58%" height={12} borderRadius={5} />
              <SkeletonBox width="45%" height={15} borderRadius={6} />
            </View>
          </View>
        ))}
      </View>

      {/* Recent Parking Header + Rows Skeleton */}
      <View style={{ gap: 10 }}>
        <View style={styles.rowBetween}>
          <SkeletonBox width={125} height={20} borderRadius={6} />
          <SkeletonBox width={64} height={28} borderRadius={14} />
        </View>
        {[0, 1, 2].map((idx) => (
          <View
            key={idx}
            style={[
              styles.card,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                padding: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              },
            ]}
          >
            <SkeletonBox width={54} height={54} borderRadius={12} />
            <View style={{ flex: 1, gap: 7 }}>
              <SkeletonBox width="65%" height={15} borderRadius={5} />
              <SkeletonBox width="45%" height={12} borderRadius={5} />
            </View>
            <SkeletonBox width={62} height={22} borderRadius={8} />
          </View>
        ))}
      </View>
    </View>
  );
};

export const BayGridSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => {
  const theme = useTheme();
  const pairs = Math.ceil(count / 2);

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 8, flexDirection: "row", gap: 14 }}>
      {[0, 1].map((col) => (
        <View key={col} style={{ flex: 1, gap: 10 }}>
          {Array.from({ length: pairs }).map((_, row) => (
            <View
              key={row}
              style={[
                styles.card,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  padding: 14,
                  height: 68,
                  justifyContent: "space-between",
                },
              ]}
            >
              <View style={styles.rowBetween}>
                <SkeletonBox width={52} height={15} borderRadius={5} />
                <SkeletonBox width={18} height={18} borderRadius={9} />
              </View>
              <SkeletonBox width="60%" height={11} borderRadius={4} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
};

export const EvStationsCarouselSkeleton: React.FC = () => {
  const theme = useTheme();
  const cardWidth = SCREEN_WIDTH * 0.82;

  return (
    <View style={{ flexDirection: "row", paddingHorizontal: 20, gap: 14 }}>
      {[0, 1].map((idx) => (
        <View
          key={idx}
          style={[
            styles.card,
            {
              width: cardWidth,
              backgroundColor: theme.surface,
              borderColor: theme.border,
              padding: 16,
              gap: 12,
            },
          ]}
        >
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, gap: 7 }}>
              <SkeletonBox width="72%" height={17} borderRadius={6} />
              <SkeletonBox width="50%" height={12} borderRadius={5} />
            </View>
            <SkeletonBox width={56} height={26} borderRadius={13} />
          </View>
          <View style={styles.rowGap8}>
            <SkeletonBox width={82} height={24} borderRadius={8} />
            <SkeletonBox width={88} height={24} borderRadius={8} />
            <SkeletonBox width={74} height={24} borderRadius={8} />
          </View>
          <SkeletonBox width="100%" height={38} borderRadius={12} />
        </View>
      ))}
    </View>
  );
};

export const ActivitiesSkeleton: React.FC = () => {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 14 }}>
      {/* Hero Active/Idle Session Card Skeleton */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            padding: 20,
            alignItems: "center",
            gap: 12,
          },
        ]}
      >
        <SkeletonBox width={120} height={24} borderRadius={12} />
        <SkeletonBox width={160} height={88} borderRadius={16} />
        <SkeletonBox width="62%" height={18} borderRadius={6} />
        <SkeletonBox width="82%" height={13} borderRadius={5} />
        <SkeletonBox width="100%" height={44} borderRadius={14} style={{ marginTop: 4 }} />
      </View>

      {/* Section Title */}
      <View style={[styles.rowBetween, { marginTop: 4 }]}>
        <SkeletonBox width={168} height={18} borderRadius={6} />
        <SkeletonBox width={64} height={14} borderRadius={5} />
      </View>

      {/* History Session Cards */}
      {[0, 1, 2].map((idx) => (
        <View
          key={idx}
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              padding: 14,
              gap: 12,
            },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <SkeletonBox width={48} height={48} borderRadius={12} />
            <View style={{ flex: 1, gap: 7 }}>
              <SkeletonBox width="68%" height={16} borderRadius={5} />
              <SkeletonBox width="46%" height={12} borderRadius={5} />
            </View>
            <SkeletonBox width={70} height={24} borderRadius={12} />
          </View>
          <View style={styles.rowBetween}>
            <SkeletonBox width={92} height={14} borderRadius={5} />
            <SkeletonBox width={78} height={16} borderRadius={5} />
          </View>
        </View>
      ))}
    </View>
  );
};

export const RecentParkingsSkeleton: React.FC = () => {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 14 }}>
      {[0, 1, 2, 3].map((idx) => (
        <View
          key={idx}
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              padding: 16,
              gap: 12,
            },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <SkeletonBox width={54} height={54} borderRadius={14} />
            <View style={{ flex: 1, gap: 7 }}>
              <SkeletonBox width="70%" height={16} borderRadius={5} />
              <SkeletonBox width="50%" height={12} borderRadius={5} />
            </View>
            <SkeletonBox width={74} height={24} borderRadius={12} />
          </View>
          <View style={styles.rowBetween}>
            <SkeletonBox width="30%" height={28} borderRadius={8} />
            <SkeletonBox width="30%" height={28} borderRadius={8} />
            <SkeletonBox width="30%" height={28} borderRadius={8} />
          </View>
          <View style={styles.rowBetween}>
            <SkeletonBox width={100} height={18} borderRadius={6} />
            <SkeletonBox width={96} height={32} borderRadius={10} />
          </View>
        </View>
      ))}
    </View>
  );
};

export const VehiclesSkeleton: React.FC = () => {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 12, gap: 14 }}>
      {[0, 1, 2].map((idx) => (
        <View
          key={idx}
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              padding: 16,
              gap: 12,
            },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <SkeletonBox width={46} height={46} borderRadius={14} />
            <View style={{ flex: 1, gap: 7 }}>
              <SkeletonBox width="58%" height={17} borderRadius={5} />
              <SkeletonBox width="42%" height={13} borderRadius={5} />
            </View>
            <SkeletonBox width={68} height={24} borderRadius={12} />
          </View>
          <View style={styles.rowBetween}>
            <SkeletonBox width={110} height={26} borderRadius={8} />
            <SkeletonBox width={36} height={32} borderRadius={10} />
          </View>
        </View>
      ))}
    </View>
  );
};

export const PaymentsSkeleton: React.FC = () => {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 16 }}>
      {/* Wallet Hero Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            padding: 20,
            gap: 12,
          },
        ]}
      >
        <View style={styles.rowBetween}>
          <SkeletonBox width={120} height={14} borderRadius={5} />
          <SkeletonBox width={70} height={22} borderRadius={11} />
        </View>
        <SkeletonBox width="55%" height={30} borderRadius={8} />
        <SkeletonBox width="75%" height={13} borderRadius={5} />
      </View>

      {/* Billing Accounts Section */}
      <SkeletonBox width={145} height={18} borderRadius={6} />
      {[0, 1].map((idx) => (
        <View
          key={idx}
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              padding: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            },
          ]}
        >
          <SkeletonBox width={42} height={42} borderRadius={12} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonBox width="60%" height={15} borderRadius={5} />
            <SkeletonBox width="40%" height={12} borderRadius={5} />
          </View>
          <SkeletonBox width={58} height={22} borderRadius={11} />
        </View>
      ))}

      {/* Tariffs Section */}
      <SkeletonBox width={135} height={18} borderRadius={6} />
      {[0, 1, 2].map((idx) => (
        <View
          key={idx}
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              padding: 14,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            },
          ]}
        >
          <View style={{ gap: 6, flex: 1 }}>
            <SkeletonBox width="58%" height={15} borderRadius={5} />
            <SkeletonBox width="38%" height={12} borderRadius={5} />
          </View>
          <SkeletonBox width={76} height={20} borderRadius={6} />
        </View>
      ))}
    </View>
  );
};

export const PermitsSkeleton: React.FC = () => {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 14 }}>
      {[0, 1].map((idx) => (
        <View
          key={idx}
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              padding: 18,
              gap: 12,
            },
          ]}
        >
          <View style={styles.rowBetween}>
            <View style={styles.rowGap8}>
              <SkeletonBox width={40} height={40} borderRadius={12} />
              <View style={{ gap: 6 }}>
                <SkeletonBox width={130} height={16} borderRadius={5} />
                <SkeletonBox width={90} height={12} borderRadius={5} />
              </View>
            </View>
            <SkeletonBox width={66} height={24} borderRadius={12} />
          </View>
          <SkeletonBox width="100%" height={1} borderRadius={1} />
          <View style={styles.rowBetween}>
            <SkeletonBox width={100} height={14} borderRadius={5} />
            <SkeletonBox width={94} height={14} borderRadius={5} />
          </View>
        </View>
      ))}
    </View>
  );
};

export const ProfileSkeleton: React.FC = () => {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 14, gap: 16 }}>
      {/* Identity Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            padding: 18,
            gap: 14,
          },
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <SkeletonBox width={64} height={64} borderRadius={32} />
          <View style={{ flex: 1, gap: 7 }}>
            <SkeletonBox width="65%" height={18} borderRadius={6} />
            <SkeletonBox width="50%" height={13} borderRadius={5} />
            <SkeletonBox width={96} height={20} borderRadius={10} />
          </View>
        </View>
        <View style={styles.rowBetween}>
          <SkeletonBox width="30%" height={44} borderRadius={12} />
          <SkeletonBox width="30%" height={44} borderRadius={12} />
          <SkeletonBox width="30%" height={44} borderRadius={12} />
        </View>
      </View>

      {/* Settings Groups */}
      {[0, 1].map((grp) => (
        <View
          key={grp}
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              padding: 14,
              gap: 14,
            },
          ]}
        >
          {[0, 1, 2].map((row) => (
            <View key={row} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <SkeletonBox width={36} height={36} borderRadius={10} />
              <View style={{ flex: 1, gap: 5 }}>
                <SkeletonBox width="56%" height={15} borderRadius={5} />
                <SkeletonBox width="38%" height={11} borderRadius={4} />
              </View>
              <SkeletonBox width={20} height={20} borderRadius={6} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowGap8: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowGap14: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
});

