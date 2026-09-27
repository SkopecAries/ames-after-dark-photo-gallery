import React, { useState, useEffect } from "react";
import {
  View, FlatList, ActivityIndicator, Text,
  StyleSheet, Dimensions, Alert, TouchableOpacity,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import type { Photo } from "@/services/galleryService.ts";
import { getPhotosByAlbumUri, getResizedImageUri } from "@/services/galleryService";
import { Theme } from "@/constants/theme";
import ImageViewing from "react-native-image-viewing";
import { FontAwesome } from "@expo/vector-icons";
import { File, Directory, Paths } from 'expo-file-system';
import * as MediaLibrary from "expo-media-library";

import { useFocusEffect } from '@react-navigation/native';
import { useTopHeaderVisibility } from '@/context/top-header-visibility';
import { useSafeAreaInsets } from "react-native-safe-area-context";

const windowWidth = Dimensions.get("window").width;
const PHOTO_SIZE = windowWidth / 3;

export default function BarPhotosScreen() {
  const { albumUri, barName } = useLocalSearchParams();
  const router = useRouter();

  const insets = useSafeAreaInsets();
  const TAB_BAR_HEIGHT = 70;
  const HEADER_CONTENT_HEIGHT = 60;
  const TOTAL_HEADER_HEIGHT = insets.top + HEADER_CONTENT_HEIGHT;
  const { setTopHeaderVisible } = useTopHeaderVisibility();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [isViewerVisible, setViewerVisible] = useState(false);

  // Ensure the top header is visible when this screen is focused
  useFocusEffect(
    React.useCallback(() => {
      setTopHeaderVisible(true);
      return () => { };
    }, [setTopHeaderVisible])
  );

  // load album
  useEffect(() => {
    (async () => {
      const p = await getPhotosByAlbumUri(String(albumUri));
      setPhotos(p);
      setLoading(false);
    })();
  }, [albumUri]);

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Theme.dark.primary} />
      </View>
    );

  const imageSources = photos.map((p) => ({ uri: p.image.uri }));

  // Helper function that handles enlarged photo downloads
  const handleDownload = async () => {
    try {
      const uri = photos[viewerIndex].image.uri;
      if (!uri) {
        Alert.alert("Invalid image", "This image cannot be downloaded.");
        return;
      }

      // Ask permission
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Needed", "Allow photo access to save images.");
        return;
      }

      // Create destination directory
      const folder = new Directory(Paths.cache, 'AmesAfterDark');
      if (!folder.exists) {
        await folder.create();
      }

      // Download file
      const downloadedFile = await File.downloadFileAsync(uri, folder);

      // Save to library
      await MediaLibrary.saveToLibraryAsync(downloadedFile.uri);
      Alert.alert("Saved", "Photo saved to your camera roll!");
    } catch (err) {
      console.log(err);
      Alert.alert("Error", "Could not download image.");
    }
  };

  // Helper function that handles long press grid photo downloads
  const handleGridDownload = async (index: number) => {
    try {
      const uri = photos[index].image.uri;
      if (!uri) {
        Alert.alert("Invalid image", "This image cannot be downloaded.");
        return;
      }

      // Ask permission
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Needed", "Allow photo access to save images.");
        return;
      }

      // Create destination directory
      const folder = new Directory(Paths.cache, 'AmesAfterDark');
      if (!folder.exists) {
        await folder.create();
      }

      // Download file
      const downloadedFile = await File.downloadFileAsync(uri, folder);

      // Save to library
      await MediaLibrary.saveToLibraryAsync(downloadedFile.uri);
      Alert.alert("Saved", "Photo saved to your camera roll!");
    } catch (err) {
      console.log(err);
      Alert.alert("Error", "Could not download image.");
    }
  };

  return (
    <View style={styles.container}>

      <Stack.Screen options={{ headerShown: false }} />

      {/* Bar name header */}
      <View style={[
        styles.customHeader,
        {
          paddingTop: insets.top,
          height: TOTAL_HEADER_HEIGHT // Give it an explicit height
        }
      ]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <FontAwesome name="chevron-left" size={20} color={Theme.dark.white} />
        </TouchableOpacity>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {barName as string ?? "Photos"}
        </Text>

        {/* Empty view to balance the flex space */}
        <View style={{ width: 40 }} />
      </View>

      {/* Grid of photos */}
      <FlatList
        data={photos}
        keyExtractor={(item) => String(item.id)}
        numColumns={3}
        initialNumToRender={12}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews={true} // Unmount photos that are off-screen
        contentContainerStyle={{
          paddingTop: TOTAL_HEADER_HEIGHT + 60,
          paddingBottom: insets.bottom + TAB_BAR_HEIGHT
        }}
        renderItem={({ item, index }) => (
          <TouchableOpacity onPress={() => {
            setCurrentIndex(index); setViewerVisible(true); setViewerIndex(index);
          }}
            onLongPress={() => handleGridDownload(index)} delayLongPress={400}>
            <Image source={{ uri: getResizedImageUri(item.image.uri, 400) }}
              style={styles.photo} contentFit="cover" transition={200} cachePolicy={"memory-disk"} />
          </TouchableOpacity>
        )}
        showsVerticalScrollIndicator={false}
      />

      {/* Clickable full-screen image */}
      <ImageViewing images={imageSources} imageIndex={currentIndex}
        visible={isViewerVisible} onRequestClose={() => setViewerVisible(false)}
        swipeToCloseEnabled={true} doubleTapToZoomEnabled={true}
        onImageIndexChange={(index) => setViewerIndex(index)}
        HeaderComponent={() => (
          <View style={styles.viewerHeader}>
            <TouchableOpacity onPress={() => setViewerVisible(false)} style={{ paddingHorizontal: 12 }}>
              <FontAwesome name="chevron-left" size={20} color={Theme.dark.primary} />
            </TouchableOpacity>
          </View>
        )}
        FooterComponent={() => (
          <View style={styles.viewerFooter}>
            <TouchableOpacity onPress={handleDownload}>
              <FontAwesome name="download" style={styles.downloadIcon} />
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.dark.background,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.dark.background,
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
  },
  viewerHeader: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  viewerFooter: {
    paddingBottom: 50,
    alignItems: "center",
  },
  downloadIcon: {
    fontSize: 40,
    color: Theme.dark.primary,
  },
  customHeader: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    zIndex: 99999,
    backgroundColor: Theme.dark.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backButton: {
    width: 50,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: Theme.container.titleText,
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
});
