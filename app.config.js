/**
 * Build variants on top of app.json.
 *
 * With APP_VARIANT=development the app becomes "NotFlix Dev": its own name,
 * Android package and link scheme, so it installs next to the regular app
 * instead of replacing it, and the launcher shows which one is which.
 * Without it, app.json is used unchanged.
 */
const IS_DEV = process.env.APP_VARIANT === "development";

module.exports = ({ config }) => {
  if (!IS_DEV) return config;

  return {
    ...config,
    name: `${config.name} Dev`,
    // A separate scheme, so notflix:// links keep opening the regular app.
    scheme: `${config.scheme}-dev`,
    android: {
      ...config.android,
      package: `${config.android.package}.dev`,
    },
  };
};
