import { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from "react-native";
import { useCreateCollection } from "@/hooks/useCollections";
import type { Collection } from "@/shared/types";
import BottomSheet from "@/components/BottomSheet";

const EMOJI_OPTIONS = ["📁", "🍝", "🥗", "🍰", "🍳", "🌮", "🍲", "🥘"];

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated?: (collection: Collection) => void;
}

export default function CreateCollectionModal({ visible, onClose, onCreated }: Props) {
  const createCollection = useCreateCollection();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJI_OPTIONS[0]);

  const reset = () => {
    setName("");
    setEmoji(EMOJI_OPTIONS[0]);
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Name it first", "Give your collection a name.");
      return;
    }
    try {
      const collection = await createCollection.mutateAsync({ name: trimmed, emoji });
      reset();
      onClose();
      onCreated?.(collection);
    } catch (e: any) {
      Alert.alert("Couldn't create collection", e.message || "Try again.");
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>New collection</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Weeknight dinners"
        placeholderTextColor="#A9998A"
        value={name}
        onChangeText={setName}
        autoFocus
        returnKeyType="done"
        blurOnSubmit
        onSubmitEditing={handleCreate}
      />
          <View style={styles.emojiRow}>
            {EMOJI_OPTIONS.map((e) => (
              <TouchableOpacity
                key={e}
                style={[styles.emojiOption, emoji === e && styles.emojiOptionActive]}
                onPress={() => setEmoji(e)}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={() => {
                reset();
                onClose();
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.createButton, createCollection.isPending && { opacity: 0.6 }]}
              onPress={handleCreate}
              disabled={createCollection.isPending}
            >
              <Text style={styles.createButtonText}>
                {createCollection.isPending ? "Creating..." : "Create"}
              </Text>
            </TouchableOpacity>
          </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: "800", color: "#2B2118", marginBottom: 16 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#2B2118",
    borderWidth: 1,
    borderColor: "#EFE2D6",
    marginBottom: 16,
  },
  emojiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  emojiOption: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#EFE2D6",
  },
  emojiOptionActive: { borderColor: "#E85D3F", backgroundColor: "#FDE6DD" },
  emojiText: { fontSize: 20 },
  actionsRow: { flexDirection: "row", gap: 10 },
  actionButton: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  cancelButton: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#EFE2D6" },
  cancelButtonText: { color: "#2B2118", fontWeight: "600", fontSize: 15 },
  createButton: { backgroundColor: "#E85D3F" },
  createButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
