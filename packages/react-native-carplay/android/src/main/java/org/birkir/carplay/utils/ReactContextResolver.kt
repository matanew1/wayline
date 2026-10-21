package org.birkir.carplay.utils

import android.content.Context
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.ReactContext
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Bridgeless (New Architecture) access to the app's React instance. React Native 0.82+ has no
 * ReactInstanceManager / ReactNativeHost — `ReactApplication.reactNativeHost` throws — so the car
 * service goes through the app's ReactHost. (Wayline vendoring change; upstream targets the bridge.)
 */
object ReactContextResolver {
  fun reactHost(context: Context): ReactHost =
    (context.applicationContext as ReactApplication).reactHost
      ?: throw IllegalStateException("react-native-carplay needs the New Architecture (ReactApplication.reactHost)")

  suspend fun getReactContext(reactHost: ReactHost): ReactContext {
    return suspendCancellableCoroutine { continuation ->
      reactHost.currentReactContext?.let {
        continuation.resume(it)
        return@suspendCancellableCoroutine
      }

      val listener = object : ReactInstanceEventListener {
        override fun onReactContextInitialized(context: ReactContext) {
          reactHost.removeReactInstanceEventListener(this)
          if (continuation.isActive) continuation.resume(context)
        }
      }
      reactHost.addReactInstanceEventListener(listener)

      continuation.invokeOnCancellation {
        reactHost.removeReactInstanceEventListener(listener)
      }

      // starts the instance if the phone UI hasn't (Android Auto can launch the app headless)
      reactHost.start()
    }
  }
}
