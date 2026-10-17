import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, ViewStyle } from "react-native";

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  sheetStyle?: ViewStyle;
}

export default function BottomSheet({ visible, onClose, children, sheetStyle }: Props) {
  const close = () => {
    Keyboard.dismiss();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={[styles.sheet, sheetStyle]} onPress={() => Keyboard.dismiss()}>
            {children}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(43,33,24,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#FFF8F0", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
});
