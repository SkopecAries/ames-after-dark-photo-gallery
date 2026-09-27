import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, StyleSheet, NativeSyntheticEvent, NativeScrollEvent
} from "react-native";
import { Image } from "expo-image";
import { FontAwesome } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from '@react-navigation/native';
import { shouldForceErrorPage } from "@/utils/dev-error-pages";
import ErrorState from "@/components/ui/error-state";
import { Theme } from "@/constants/theme";
import { getLatestWeekAlbums, getResizedImageUri } from "@/services/galleryService";
import GalleryFallback from "./Galleryfallback";
import { useTopHeaderVisibility } from '@/context/top-header-visibility';
import { useSafeAreaInsets } from "react-native-safe-area-context";

const EDGE_TRIGGER_PX = 16;
const EDGE_UNLOCK_PX = 40;

export default function GalleryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const MAIN_HEADER_HEIGHT = 64;
  const TOP_OFFSET = insets.top + MAIN_HEADER_HEIGHT;
  const SEARCH_BAR_AREA_HEIGHT = 50;

  const { setTopHeaderVisible } = useTopHeaderVisibility();
  const lastScrollYRef = React.useRef(0);
  const headerVisibleRef = React.useRef(true);
  const lastHeaderToggleTsRef = React.useRef(0);
  const viewportHeightRef = React.useRef(0);
  const contentHeightRef = React.useRef(0);
  const edgeLockRef = React.useRef<'top' | 'bottom' | null>(null);
  const listRef = useRef<FlatList>(null);

  const [albums, setAlbums] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [search, setSearch] = useState("");

  // Reset scroll when search changes
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollToOffset({ offset: 0, animated: true });
    }
  }, [search]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getLatestWeekAlbums();
        setAlbums(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to load gallery"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const hasError = !!error || shouldForceErrorPage("gallery");

  const filteredAlbums = useMemo(() => {
    let data = albums;
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(
        (a) =>
          a.barName?.toLowerCase().includes(q) ||
          a.name?.toLowerCase().includes(q)
      );
    }
    return data;
  }, [albums, search]);

  const grouped = useMemo(() => {
    let data = albums;
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter((a) => a.barName?.toLowerCase().includes(q) || 
        a.name?.toLowerCase().includes(q));
    }

    const byDate: Record<string, any[]> = {};
    const dateObjMap: Record<string, Date> = {};

    for (const a of data) {
      const key = a.date;
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(a);

      if (!dateObjMap[key]) {
        const parts = key.split(/[-\\/]/).map((p: string) => parseInt(p.trim(), 10));
        const d = new Date();
        if (parts.length == 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          d.setMonth(parts[0] - 1);
          d.setDate(parts[1]);
          if (d > new Date()) d.setFullYear(d.getFullYear() - 1);
        }
        dateObjMap[key] = d;
      }
    }

    const entries = Object.entries(byDate).map(([date, bars]) => ({
      date,
      bars,
      dateObj: dateObjMap[date],
    }));

    entries.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
    return entries;
  }, [filteredAlbums]);

  useFocusEffect(
    React.useCallback(() => {
      headerVisibleRef.current = true;
      setTopHeaderVisible(true);
      return () => {
        headerVisibleRef.current = true;
        setTopHeaderVisible(true);
      };
    }, [setTopHeaderVisible])
  );

  const setHeaderVisibility = React.useCallback(
    (nextVisible: boolean) => {
      if (headerVisibleRef.current === nextVisible) {
        return;
      }

      const now = Date.now();
      if (now - lastHeaderToggleTsRef.current < 160) {
        return;
      }

      headerVisibleRef.current = nextVisible;
      lastHeaderToggleTsRef.current = now;
      setTopHeaderVisible(nextVisible);
    },
    [setTopHeaderVisible]
  );

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    const layoutHeight = event.nativeEvent.layoutMeasurement.height;
    const contentHeight = event.nativeEvent.contentSize.height;
    const delta = y - lastScrollYRef.current;
    const maxY = Math.max(0, contentHeight - layoutHeight);

    // Same logic as Bars page
    if (y <= 16) {
      edgeLockRef.current = 'top';
      setHeaderVisibility(true);
    } else if (maxY > 0 && y >= maxY - 16) {
      edgeLockRef.current = 'bottom';
    } else if (delta > 12 && y > 72) {
      setHeaderVisibility(false);
    } else if (delta < -12) {
      setHeaderVisibility(true);
    }
    lastScrollYRef.current = y;
  }, [setHeaderVisibility]);

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" color={Theme.dark.primary} /></View>
  );

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Theme.dark.primary} />
      </View>
    );

  if (hasError)
    return (
      <View style={styles.container}>
        <ErrorState title="Unable to load gallery" subtitle="Please try again later." />
      </View>
    );

  return (
    <View style={styles.container}>
      <View style={[
        styles.fixedSearchContainer,
        {
          top: 0,
          paddingTop: TOP_OFFSET + 10,
          height: TOP_OFFSET + SEARCH_BAR_AREA_HEIGHT
        }
      ]}>
        <View style={styles.searchBar}>
          <FontAwesome name="search" size={18} color={Theme.search.inactiveInput} style={styles.searchIcon} />
          <TextInput
            placeholder="Search gallery"
            placeholderTextColor={Theme.search.inactiveInput}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={grouped}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews={true}
        ListHeaderComponent={<View style={{ height: SEARCH_BAR_AREA_HEIGHT + 20 }} />}
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingTop: TOP_OFFSET, // Ensure the list starts after the main header
          paddingBottom: 120 + insets.bottom
        }}
        keyExtractor={(item) => item.date}
        onLayout={(event) => {
          viewportHeightRef.current = event.nativeEvent.layout.height;
        }}
        onContentSizeChange={(_, contentHeight) => {
          contentHeightRef.current = contentHeight;
        }}
        ListEmptyComponent={
          search.trim().length > 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                No albums found matching "{search}"
              </Text>
            </View>
          ) : (
            <GalleryFallback />
          )
        }
        renderItem={({ item }) => {
          const { date, bars, dateObj } = item as { date: string; bars: any[]; dateObj: Date };
          const weekday = dateObj && !isNaN(dateObj.getTime())
            ? dateObj.toLocaleDateString(undefined, { weekday: "long" })
            : "";
          const header = weekday ? `${weekday} ${date}` : date;
          return (
            <View style={{ marginBottom: 24 }}>
              <Text style={styles.dateHeader}>{header}</Text>
              <View style={styles.albumGrid}>
                {bars.map((album) => (
                  <TouchableOpacity
                    key={album.id}
                    style={styles.albumCard}
                    onPress={() =>
                      router.push({
                        pathname: "/(app)/(tabs)/gallery/[barId]",
                        params: { barId: album.id, barName: album.barName, albumUri: album.albumUri },
                      })
                    }
                  >
                    {album.coverUrl ? (
                      <Image source={{ uri: getResizedImageUri(album.coverUrl, 600) }} 
                        style={styles.albumImage} contentFit="cover" transition={200} cachePolicy={"memory-disk"} />
                    ) : (
                      <View style={styles.placeholderCover} />
                    )}
                    <Text style={styles.albumName}>{album.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.dark.background,
  },
  fixedSearchContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000, // Boost this to be safe
    backgroundColor: Theme.dark.background, // MUST BE SOLID
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.dark.background,
  },
  searchBar: {
    marginHorizontal: 16,
    backgroundColor: Theme.search.background,
    borderColor: Theme.search.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchFilterContainer: {
    backgroundColor: Theme.dark.background,
    paddingVertical: 12,
    marginBottom: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: Theme.search.input,
    fontSize: 14,
  },
  dateHeader: {
    color: Theme.container.titleText,
    fontSize: 16,
    fontWeight: "600",
    marginVertical: 8,
    marginLeft: 4,
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
  albumImage: { width: "100%", height: 140 },
  albumName: {
    color: Theme.container.titleText,
    fontSize: 14,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  placeholderCover: {
    width: "100%",
    height: 140,
    backgroundColor: Theme.dark.black,
  },
  emptyContainer: {
    marginTop: 100,
    alignItems: 'center'
  },
  emptyText: {
    color: Theme.search.inactiveInput,
    fontSize: 13,
  },
});