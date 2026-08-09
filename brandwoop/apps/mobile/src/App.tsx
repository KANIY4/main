import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

import { apiBaseUrl, appEnv } from "./config.js";

/**
 * Foundation shell. Role-aware navigation, authentication and the shift
 * workspace land in the week 3-6 milestones.
 */
export default function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="auto" />
      <View style={styles.container}>
        <Text accessibilityRole="header" style={styles.heading}>
          BrandWoop
        </Text>
        <Text style={styles.body}>Environment: {appEnv}</Text>
        <Text style={styles.body}>API: {apiBaseUrl}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#ffffff" },
  container: { flex: 1, padding: 24, gap: 8 },
  heading: { fontSize: 28, fontWeight: "700", color: "#14181f" },
  body: { fontSize: 16, color: "#4a5364" },
});
