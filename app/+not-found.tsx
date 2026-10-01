import { EmptyState } from "@/components/ui/StateViews";
import { Palette } from "@/constants/theme";
import { Stack, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <EmptyState
          icon="compass-outline"
          title="This page doesn't exist"
          message="The link may be out of date, or the title was removed."
          actionLabel="Back to home"
          onAction={() => router.replace("/")}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: Palette.background,
  },
});
