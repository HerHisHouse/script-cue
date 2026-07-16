package com.alexdiaz.scriptcue

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AudioEchoCancellationPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext
  ) = listOf(AudioEchoCancellationModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ) = emptyList<ViewManager<*, *>>()
}
