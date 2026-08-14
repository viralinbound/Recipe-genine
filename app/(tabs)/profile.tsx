import { useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { User, ChevronRight, LogOut, Bell, Mail, Share2 } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuth";
import { useRecipes } from "@/hooks/useRecipes";
import { useCollections } from "@/hooks/useCollections";
import { supabase } from "@/lib/supabase";

export default function Profile() {
  const { profile, user, signOut } = useAuth();
  const { data: recipes = [] } = useRecipes();
  const { data: collections = [] } = useCollections();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(profile?.display_name ?? "");
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [uploading, setUploading] = useState(false);

  const favorites = recipes.filter((r) => r.is_favorite).length;

  const handlePickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to set an avatar.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: `image/${ext}` });
      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl.publicUrl })
        .eq("id", user.id);
    } catch (e: any) {
      Alert.alert("Upload failed", e.message || "Try again.");
    } finally {
      setUploading(false);
    }
  };

  const saveName = async () => {
    if (!user) return;
    await supabase.from("profiles").update({ display_name: name }).eq("id", user.id);
    setEditingName(false);
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

  const handleSignOut = () => {
    Alert.alert("Sign out?", "", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: signOut },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text style={styles.header}>Profile</Text>

        <View style={styles.profileCard}>
          <TouchableOpacity onPress={handlePickAvatar} disabled={uploading}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <User size={32} color="#E85D3F" />
              </View>
            )}
          </TouchableOpacity>

          {editingName ? (
            <View style={styles.nameEditRow}>
              <TextInput
                style={styles.nameInput}
                value={name}
                onChangeText={setName}
                autoFocus
                onSubmitEditing={saveName}
              />
              <TouchableOpacity onPress={saveName}>
                <Text style={styles.saveLink}>Save</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setEditingName(true)}>
              <Text style={styles.name}>{profile?.display_name || "Add your name"}</Text>
            </TouchableOpacity>
          )}
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
              onValueChange={setNotifEnabled}
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
            onPress={() => Linking.openURL("mailto:support@cookpilot.dev")}
          >
            <View style={styles.rowLeft}>
              <Mail size={18} color="#2B2118" />
              <Text style={styles.rowText}>Help & feedback</Text>
            </View>
            <ChevronRight size={18} color="#B3A392" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <LogOut size={18} color="#E85D3F" />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8F0" },
  header: { fontSize: 24, fontWeight: "800", color: "#2B2118", marginBottom: 20 },
  profileCard: { alignItems: "center", marginBottom: 20 },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarPlaceholder: { backgroundColor: "#FDE6DD", alignItems: "center", justifyContent: "center" },
  nameEditRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  nameInput: { fontSize: 17, fontWeight: "700", color: "#2B2118", borderBottomWidth: 1, borderBottomColor: "#E85D3F", paddingVertical: 2 },
  saveLink: { color: "#E85D3F", fontWeight: "600" },
  name: { fontSize: 18, fontWeight: "700", color: "#2B2118", marginTop: 12 },
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
});
