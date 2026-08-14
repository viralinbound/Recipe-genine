import { TouchableOpacity, Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";

interface Props {
  icon: LucideIcon;
  label?: string;
  color?: string;
  fill?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

// One consistent icon-button size/shape used everywhere in the app (list-row
// actions, header actions, etc.) so buttons don't vary from screen to screen.
// Pass `label` to show the action's name next to the icon; omit it only for
// compact list-row actions where the icon alone is the established pattern
// (favorite/delete) and a label would crowd the row.
export default function IconButton({ icon: Icon, label, color = "#E85D3F", fill, onPress, style }: Props) {
  return (
    <TouchableOpacity
      style={[label ? styles.withLabel : styles.iconOnly, style]}
      onPress={onPress}
      hitSlop={8}
      activeOpacity={0.75}
    >
      <Icon size={18} color={color} fill={fill} />
      {label && <Text style={[styles.label, { color }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

export const ICON_BUTTON_SIZE = 36;

const styles = StyleSheet.create({
  iconOnly: {
    width: ICON_BUTTON_SIZE,
    height: ICON_BUTTON_SIZE,
    borderRadius: ICON_BUTTON_SIZE / 2,
    backgroundColor: "#F5EBE0",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  withLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: ICON_BUTTON_SIZE,
    paddingHorizontal: 14,
    borderRadius: ICON_BUTTON_SIZE / 2,
    backgroundColor: "#F5EBE0",
    flexShrink: 0,
  },
  label: { fontSize: 13, fontWeight: "700" },
});
