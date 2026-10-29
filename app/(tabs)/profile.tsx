import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Switch,
  Alert,
  Linking,
  Share,
  TextInput,
  Platform,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { User, ChevronRight, LogOut, Bell, Mail, Share2, Camera, Trash2 } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/stores/authStore";
import { useRecipes } from "@/hooks/useRecipes";
import { useCollections } from "@/hooks/useCollections";
import { supabase } from "@/lib/supabase";
import BottomSheet from "@/components/BottomSheet";
import {
  ensureNotificationPermission,
  getNotificationPermissionStatus,
  openAppNotificationSettings,
} from "@/lib/notifications";
import { setNotificationPrompted } from "@/lib/notificationPromptStorage";

export default function Profile() {
  const { profile, user, signOut, deleteAccount } = useAuth();
  const setProfile = useAuthStore((s) => s.setProfile);
  const { data: recipes = [] } = useRecipes();
  const { data: collections = [] } = useCollections();
  const [showNameModal, setShowNameModal] = useState(false);
  const [name, setName] = useState(profile?.display_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    setName(profile?.display_name ?? "");
    setAvatarUrl(profile?.avatar_url ?? null);
  }, [profile?.display_name, profile?.avatar_url]);

  useEffect(() => {
    getNotificationPermissionStatus()
      .then((status) => setNotifEnabled(status === "granted"))
      .catch(() => setNotifEnabled(false));
  }, []);

  const handleToggleNotifications = async (value: boolean) => {
    if (value) {
      const granted = await ensureNotificationPermission();
      setNotifEnabled(granted);
      await setNotificationPrompted().catch(() => {});
      if (!granted) {
        Alert.alert(
          "Notifications blocked",
          "Allow notifications in your phone Settings so meal reminders can fire.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => openAppNotificationSettings() },
          ]
        );
      }
      return;
    }

    setNotifEnabled(false);
    Alert.alert(
      "Turn off in Settings",
      "To fully disable reminders, turn off notifications for Recipe Genie in your phone Settings.",
      [
        { text: "OK", style: "cancel" },
        { text: "Open Settings", onPress: () => openAppNotificationSettings() },
      ]
    );
  };

  const favorites = recipes.filter((r) => r.is_favorite).length;

  const readImageAsArrayBuffer = async (uri: string): Promise<ArrayBuffer> => {
    if (Platform.OS === "web") {
      const response = await fetch(uri);
      return response.arrayBuffer();
    }
    return new File(uri).arrayBuffer();
  };

  const uploadAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to set an avatar.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !user) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split(".").pop() || "jpg";
      const path = `${user.id}/avatar.${ext}`;
      const arrayBuffer = await readImageAsArrayBuffer(asset.uri);

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, arrayBuffer, { upsert: true, contentType: `image/${ext}` });
      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage.from("avatars").getPublicUrl(path);
      const newUrl = `${publicUrl.publicUrl}?t=${Date.now()}`;
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: newUrl })
        .eq("id", user.id);
      if (profileError) throw profileError;

      setAvatarUrl(newUrl);
      if (profile) {
        setProfile({ ...profile, avatar_url: newUrl });
      }
      Alert.alert("Avatar updated", "Your profile photo has been saved.");
    } catch (e: any) {
      Alert.alert("Upload failed", e.message || "Try again.");
    } finally {
      setUploading(false);
    }
  };

  const deleteAvatar = async () => {
    if (!user) return;
    setUploading(true);
    try {
      const { data: files } = await supabase.storage
        .from("avatars")
        .list(user.id);
      if (files && files.length > 0) {
        const paths = files.map((f) => `${user.id}/${f.name}`);
        await supabase.storage.from("avatars").remove(paths);
      }
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", user.id);
      if (profileError) throw profileError;

      setAvatarUrl(null);
      if (profile) {
        setProfile({ ...profile, avatar_url: null });
      }
      Alert.alert("Removed", "Your avatar has been deleted.");
    } catch (e: any) {
      Alert.alert("Delete failed", e.message || "Try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleAvatarPress = () => {
    const hasAvatar = !!avatarUrl;
    const options = hasAvatar
      ? [
          { text: "Change photo", onPress: uploadAvatar },
          { text: "Remove photo", style: "destructive" as const, onPress: () => {
              Alert.alert("Remove avatar?", "Your profile photo will be deleted.", [
                { text: "Cancel", style: "cancel" },
                { text: "Remove", style: "destructive", onPress: deleteAvatar },
              ]);
            }
          },
          { text: "Cancel", style: "cancel" as const },
        ]
      : [
          { text: "Choose photo", onPress: uploadAvatar },
          { text: "Cancel", style: "cancel" as const },
        ];
    Alert.alert("Profile photo", hasAvatar ? "Change or remove your avatar" : "Add a profile photo", options);
  };

  const openNameModal = () => {
    setName(profile?.display_name ?? "");
    setShowNameModal(true);
  };

  const saveName = async () => {
    if (!user) return;
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Name required", "Please enter your name.");
      return;
    }
    setSavingName(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: trimmed })
        .eq("id", user.id);
      if (error) throw error;
      if (profile) {
        setProfile({ ...profile, display_name: trimmed });
      }
      setShowNameModal(false);
      Alert.alert("Saved", "Your name has been updated.");
    } catch (e: any) {
      Alert.alert("Update failed", e.message ?? "Try again.");
    } finally {
      setSavingName(false);
    }
  };

  const handleExport = async () => {
    const text = recipes
      .map((r) => `${r.title}\n${r.ingredients.map((i) => `- ${i.item}`).join("\n")}`)
      .join("\n\n");
    await Share.share({ message: text || "No recipes to export yet." });
  };

  const handleShareCookbook = async () => {
    await Share.share({
      message: `Check out my Recipe Genie cookbook with ${recipes.length} recipes!`,
    });
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      "Delete account?",
      "This permanently deletes your account, recipes, collections and meal schedule. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAccount();
            } catch (e: any) {
              Alert.alert("Delete failed", e.message ?? "Try again.");
            }
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert("Sign out?", "", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: signOut },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.header}>Profile</Text>

        <View style={styles.profileCard}>
          <TouchableOpacity onPress={handleAvatarPress} disabled={uploading} style={styles.avatarButton}>
            <View style={styles.avatarWrap}>
              {uploading ? (
                <ActivityIndicator size="large" color="#E85D3F" />
              ) : avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <User size={32} color="#E85D3F" />
              )}
              <View style={styles.avatarBadge}>
                <Camera size={14} color="#fff" />
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={openNameModal}>
            <Text style={styles.name}>{profile?.display_name || "Add your name"}</Text>
          </TouchableOpacity>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{recipes.length}</Text>
            <Text style={styles.statLabel}>Recipes</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{favorites}</Text>
            <Text style={styles.statLabel}>Favorites</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{collections.length}</Text>
            <Text style={styles.statLabel}>Collections</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Bell size={18} color="#2B2118" />
              <Text style={styles.rowText}>Notifications</Text>
            </View>
            <Switch
              value={notifEnabled}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: "#EFE2D6", true: "#F3B4A1" }}
              thumbColor={notifEnabled ? "#E85D3F" : "#fff"}
            />
          </View>

          <TouchableOpacity style={styles.row} onPress={handleExport}>
            <View style={styles.rowLeft}>
              <Mail size={18} color="#2B2118" />
              <Text style={styles.rowText}>Export recipes</Text>
            </View>
            <ChevronRight size={18} color="#B3A392" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={handleShareCookbook}>
            <View style={styles.rowLeft}>
              <Share2 size={18} color="#2B2118" />
              <Text style={styles.rowText}>Share cookbook</Text>
            </View>
            <ChevronRight size={18} color="#B3A392" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.row}
            onPress={() => Linking.openURL("mailto:kevin@viralinbound.com")}
          >
            <View style={styles.rowLeft}>
              <Mail size={18} color="#2B2118" />
              <Text style={styles.rowText}>Help & feedback</Text>
            </View>
            <ChevronRight size={18} color="#B3A392" />
          </TouchableOpacity>

          {/* iOS only (App Store guideline 5.1.1(v)); Android stays unchanged. */}
          {Platform.OS === "ios" && (
            <TouchableOpacity style={styles.row} onPress={confirmDeleteAccount} testID="delete-account-row">
              <View style={styles.rowLeft}>
                <Trash2 size={18} color="#D93B2B" />
                <Text style={[styles.rowText, { color: "#D93B2B" }]}>Delete account</Text>
              </View>
              <ChevronRight size={18} color="#B3A392" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <LogOut size={18} color="#E85D3F" />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>

      <BottomSheet visible={showNameModal} onClose={() => setShowNameModal(false)}>
        <Text style={styles.modalTitle}>Your name</Text>
        <TextInput
          style={styles.modalInput}
          placeholder="Enter your name"
          placeholderTextColor="#A9998A"
          value={name}
          onChangeText={setName}
          autoFocus
          returnKeyType="done"
          blurOnSubmit
          onSubmitEditing={saveName}
        />
        <View style={styles.modalActions}>
          <TouchableOpacity
            style={[styles.modalButton, styles.modalCancelButton]}
            onPress={() => {
              Keyboard.dismiss();
              setShowNameModal(false);
            }}
          >
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalButton, styles.modalSaveButton, savingName && { opacity: 0.6 }]}
            onPress={saveName}
            disabled={savingName}
          >
            <Text style={styles.modalSaveText}>{savingName ? "Saving..." : "Save"}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8F0" },
  header: { fontSize: 24, fontWeight: "800", color: "#2B2118", marginBottom: 20 },
  profileCard: { alignItems: "center", marginBottom: 20 },
  avatarButton: { marginBottom: 12 },
  avatarWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#FDE6DD",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: 88, height: 88, borderRadius: 44 },
  avatarBadge: { position: "absolute", bottom: 0, right: 0, backgroundColor: "#E85D3F", borderRadius: 12, width: 24, height: 24, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFF8F0" },
  name: { fontSize: 18, fontWeight: "700", color: "#2B2118", marginTop: 4 },
  email: { fontSize: 13, color: "#8A7A6C", marginTop: 2 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  statBox: { flex: 1, backgroundColor: "#fff", borderRadius: 14, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "#EFE2D6" },
  statNumber: { fontSize: 20, fontWeight: "800", color: "#2B2118" },
  statLabel: { fontSize: 11, color: "#8A7A6C", marginTop: 2 },
  section: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#EFE2D6", marginBottom: 20 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: "#F5EBE0" },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowText: { fontSize: 15, color: "#2B2118" },
  signOutButton: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, paddingVertical: 14 },
  signOutText: { color: "#E85D3F", fontWeight: "600", fontSize: 15 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#2B2118", marginBottom: 16 },
  modalInput: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#2B2118",
    borderWidth: 1,
    borderColor: "#EFE2D6",
    marginBottom: 20,
  },
  modalActions: { flexDirection: "row", gap: 10 },
  modalButton: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  modalCancelButton: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#EFE2D6" },
  modalCancelText: { color: "#2B2118", fontWeight: "600", fontSize: 15 },
  modalSaveButton: { backgroundColor: "#E85D3F" },
  modalSaveText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
