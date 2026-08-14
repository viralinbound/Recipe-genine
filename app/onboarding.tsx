import { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  useWindowDimensions,
  TouchableOpacity,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Link2, Sparkles, BookOpen } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "@/stores/authStore";

const SLIDES = [
  {
    icon: Link2,
    title: "Paste any recipe link",
    body: "YouTube, Instagram, or any food blog — Recipe Genie handles it.",
  },
  {
    icon: Sparkles,
    title: "AI extracts the recipe",
    body: "Ingredients, steps, prep time, and servings — pulled out automatically.",
  },
  {
    icon: BookOpen,
    title: "Your personal cookbook",
    body: "Every recipe you save, organized and searchable in one place.",
  },
];

export default function Onboarding() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const listRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);
  const setOnboardingComplete = useAuthStore((s) => s.setOnboardingComplete);

  const finish = async () => {
    await SecureStore.setItemAsync("onboarding_complete", "true");
    setOnboardingComplete(true);
    router.replace("/(auth)/login");
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(i);
  };

  const next = () => {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1 });
    } else {
      finish();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        removeClippedSubviews={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => {
          const Icon = item.icon;
          return (
            <View style={[styles.slide, { width }]}>
              <View style={styles.iconWrap}>
                <Icon size={56} color="#E85D3F" strokeWidth={1.75} />
              </View>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body}>{item.body}</Text>
            </View>
          );
        }}
      />
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
      <TouchableOpacity style={styles.button} onPress={next}>
        <Text style={styles.buttonText}>
          {index === SLIDES.length - 1 ? "Get started" : "Next"}
        </Text>
      </TouchableOpacity>
      {index < SLIDES.length - 1 && (
        <TouchableOpacity onPress={finish} style={styles.skip}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8F0" },
  slide: { alignItems: "center", justifyContent: "center", padding: 32 },
  iconWrap: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#FDE6DD",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  title: { fontSize: 24, fontWeight: "700", color: "#2B2118", textAlign: "center", marginBottom: 12 },
  body: { fontSize: 16, color: "#6B5D50", textAlign: "center", lineHeight: 22 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#EAD9CC" },
  dotActive: { backgroundColor: "#E85D3F", width: 20 },
  button: {
    backgroundColor: "#E85D3F",
    marginHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  skip: { alignItems: "center", marginTop: 16, marginBottom: 8 },
  skipText: { color: "#8A7A6C", fontSize: 14 },
});
