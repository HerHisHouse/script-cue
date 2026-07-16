package com.alexdiaz.scriptcue

import android.media.AudioManager
import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AudioEchoCancellationModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "AudioEchoCancellationModule"

  @ReactMethod
  fun activate() {
    try {
      val audioManager = reactContext.getSystemService(
        Context.AUDIO_SERVICE
      ) as AudioManager
      
      // MODE_IN_COMMUNICATION activa AEC en Android
      audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
      audioManager.isSpeakerphoneOn = true
      println("[AEC Android] Activado - MODE_IN_COMMUNICATION")
    } catch (e: Exception) {
      println("[AEC Android] Error: ${e.message}")
    }
  }

  @ReactMethod
  fun deactivate() {
    try {
      val audioManager = reactContext.getSystemService(
        Context.AUDIO_SERVICE
      ) as AudioManager
      audioManager.mode = AudioManager.MODE_NORMAL
      println("[AEC Android] Desactivado")
    } catch (e: Exception) {
      println("[AEC Android] Error: ${e.message}")
    }
  }
}
