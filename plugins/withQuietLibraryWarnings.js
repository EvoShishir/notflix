/**
 * Silence compiler and Gradle deprecation noise from third-party modules.
 *
 * Every deprecation warning in the Android build comes from library code in
 * node_modules — React Native Screens, Reanimated, Expo modules and so on —
 * either from their Kotlin/Java sources or their own build.gradle files. All of
 * them are already at the versions Expo SDK 57 pins, so there is nothing to fix
 * from this project; each clears up as those libraries update.
 *
 * Library modules only: `:app` keeps its warnings, so anything this project
 * introduces still shows up.
 *
 * A config plugin rather than an edit to android/, which `expo prebuild`
 * regenerates.
 */
const {
  withGradleProperties,
  withProjectBuildGradle,
} = require("expo/config-plugins");

const MARKER = "// notflix: quiet third-party compiler warnings";

const SNIPPET = `
${MARKER}
subprojects { project ->
  if (project.path == ":app") return

  project.tasks.withType(JavaCompile).configureEach {
    // -nowarn drops warnings; -XDsuppressNotes drops the "uses or overrides a
    // deprecated API" notes, which -nowarn alone still prints.
    options.compilerArgs += ["-nowarn", "-XDsuppressNotes"]
  }

  project.tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompilationTask).configureEach {
    compilerOptions.suppressWarnings.set(true)
  }

  // Native modules (expo-modules-core) call React Native C++ APIs that RN has
  // since marked [[deprecated]].
  project.plugins.withId("com.android.library") {
    project.android.defaultConfig.externalNativeBuild.cmake.cppFlags("-Wno-deprecated-declarations")
  }
}
`;

function withQuietLibraryWarnings(config) {
  config = withProjectBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes(MARKER)) {
      mod.modResults.contents += SNIPPET;
    }
    return mod;
  });

  // Gradle's own deprecations are all in library build scripts; the app's
  // generated scripts produce none. Revisit when moving to Gradle 10.
  config = withGradleProperties(config, (mod) => {
    mod.modResults = mod.modResults.filter(
      (item) => !(item.type === "property" && item.key === "org.gradle.warning.mode")
    );
    mod.modResults.push({
      type: "property",
      key: "org.gradle.warning.mode",
      value: "none",
    });
    return mod;
  });

  return config;
}

module.exports = withQuietLibraryWarnings;
