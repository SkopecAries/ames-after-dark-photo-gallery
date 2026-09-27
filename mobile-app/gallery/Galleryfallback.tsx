import React from "react";
import {
  View,
  Text,
  StyleSheet,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { Theme } from "@/constants/theme";

function SkeletonCard() {
  return (
    <View style={styles.albumCard}>
      <View style={styles.placeholderCover}>
        <FontAwesome name="image" size={24} color={Theme.container.inactiveText} />
      </View>
      {/* Fake text bar */}
      <View style={styles.skeletonTextContainer}>
        <View style={styles.skeletonText} />
      </View>
    </View>
  );
}

export default function GalleryFallback() {
  // A quick array to generate 4 ghost cards for 2 days
  const dummyCards = [1, 2, 3, 4];
  const dummyDays = [1, 2];

  return (
    <View style={styles.container}>
      {/* Banner */}
      <View style={styles.banner}>
        <FontAwesome name="camera" size={16} color={Theme.dark.primary} style={styles.bannerIcon} />
        <Text style={styles.bannerText}>
          No photos have been uploaded for this week yet. Check back soon!
        </Text>
      </View>

      {/* Ghost Grid */}
      {dummyDays.map((dayIndex) => (
        <View key={dayIndex} style={styles.ghostGroup}>
          {/* Fake Date Header */}
          <View style={[styles.skeletonDateHeader, dayIndex === 2 && { width: 90 }]} />
          
          <View style={styles.albumGrid}>
            {dummyCards.map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Theme.dark.background,
    paddingBottom: 40,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.container.background,
    borderLeftWidth: 3,
    borderLeftColor: Theme.dark.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 32,
  },
  bannerIcon: {
    marginRight: 12,
  },
  bannerText: {
    color: Theme.container.titleText,
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  ghostGroup: {
    opacity: 0.6,
  },
  skeletonDateHeader: {
    width: 120,
    height: 16,
    backgroundColor: Theme.container.titleText,
    borderRadius: 4,
    marginVertical: 8,
    marginLeft: 4,
    marginBottom: 16,
    opacity: 0.5,
  },
  albumGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  albumCard: {
    width: "48%",
    margin: "1%",
    backgroundColor: Theme.container.background,
    borderRadius: 12,
    overflow: "hidden",
  },
  placeholderCover: {
    width: "100%",
    height: 140,
    backgroundColor: Theme.container.inactiveBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  skeletonTextContainer: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  skeletonText: {
    width: "60%",
    height: 10,
    backgroundColor: Theme.container.titleText,
    borderRadius: 4,
  },
});