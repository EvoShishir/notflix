package expo.modules.systemvolume

import android.content.Context
import android.media.AudioManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.roundToInt

/**
 * The phone's media volume, for the player's volume swipe.
 *
 * Volume is set without AudioManager.FLAG_SHOW_UI, so the system volume panel
 * stays hidden while the player shows its own meter. Values are fractions of
 * the stream's maximum, since the number of steps differs between phones.
 */
class SystemVolumeModule : Module() {
  private val audioManager: AudioManager?
    get() = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  override fun definition() = ModuleDefinition {
    Name("SystemVolume")

    /** Current media volume, 0–1. */
    Function("getVolume") {
      val am = audioManager ?: return@Function 1.0
      val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
      if (max <= 0) 1.0 else am.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / max
    }

    /** Set the media volume, 0–1, rounded to the nearest step. No system UI. */
    Function("setVolume") { fraction: Double ->
      val am = audioManager ?: return@Function
      val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
      val index = (fraction.coerceIn(0.0, 1.0) * max).roundToInt()
      if (index != am.getStreamVolume(AudioManager.STREAM_MUSIC)) {
        am.setStreamVolume(AudioManager.STREAM_MUSIC, index, 0)
      }
    }
  }
}
