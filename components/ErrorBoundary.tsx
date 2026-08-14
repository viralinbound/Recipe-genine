import { Component, type ReactNode } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Catches render-time crashes anywhere below it so one broken screen doesn't
// take down the whole app with a hard LogBox crash — shows a recoverable
// fallback instead.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] caught:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <TouchableOpacity style={styles.button} onPress={this.reset}>
            <Text style={styles.buttonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF8F0",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: { fontSize: 18, fontWeight: "800", color: "#2B2118", marginBottom: 8 },
  message: { fontSize: 13, color: "#8A7A6C", textAlign: "center", marginBottom: 20 },
  button: { backgroundColor: "#E85D3F", borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
