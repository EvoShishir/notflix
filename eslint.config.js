// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: {
      /**
       * Off: this rule cannot model mutable native handles.
       *
       * It flags every `sharedValue.value = x` (Reanimated) and every
       * `player.currentTime = x` / `player.audioTrack = x` (expo-video) as
       * "modifying a prop". Those objects are not React state — they are stable
       * handles to native objects whose documented API *is* assignment, and
       * both libraries' own docs pass them as props and write to them. There is
       * no alternative formulation, so the rule only produces false positives
       * here.
       */
      'react-hooks/immutability': 'off',

      /**
       * Warn, not error.
       *
       * This one is legitimate: the screens call `fetchX()` from an effect and
       * that setStates synchronously, costing an extra render on mount. It is a
       * real (if minor) hint worth keeping visible, but it is not worth
       * restructuring every data-fetching screen mid-SDK-upgrade to silence.
       */
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    /**
     * Gesture-driven player components only.
     *
     * `react-hooks/refs` is genuinely useful — it caught two real
     * `useRef(...).current`-during-render bugs in the carousel — so it stays on
     * everywhere else. But it cannot distinguish a React ref from a Reanimated
     * shared value: it sees a gesture callback closing over something with a
     * `.value` and assumes render-phase access, when these bodies are worklets
     * that run on the UI thread. Inline directives don't bind to the rule's
     * report range, so the exemption has to be scoped by path.
     */
    files: ['components/player/**/*.tsx'],
    rules: { 'react-hooks/refs': 'off' },
  },
]);
