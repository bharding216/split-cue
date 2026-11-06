package expo.modules.workoutsession

import android.content.Intent
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WorkoutSessionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WorkoutSession")

    Events("onLocation")

    OnCreate {
      WorkoutSessionService.locationListener = { location ->
        val verticalAccuracy =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && location.hasVerticalAccuracy()) {
            location.verticalAccuracyMeters.toDouble()
          } else {
            null
          }
        sendEvent(
          "onLocation",
          mapOf(
            "latitude" to location.latitude,
            "longitude" to location.longitude,
            "timestamp" to location.time.toDouble(),
            "accuracy" to if (location.hasAccuracy()) location.accuracy.toDouble() else null,
            "speed" to if (location.hasSpeed()) location.speed.toDouble() else null,
            "altitude" to if (location.hasAltitude()) location.altitude else null,
            "altitudeAccuracy" to verticalAccuracy,
          )
        )
      }
    }

    OnDestroy {
      WorkoutSessionService.locationListener = null
    }

    Function("start") { title: String, body: String, usesLocation: Boolean ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val intent = Intent(context, WorkoutSessionService::class.java)
        .putExtra(WorkoutSessionService.EXTRA_TITLE, title)
        .putExtra(WorkoutSessionService.EXTRA_BODY, body)
        .putExtra(WorkoutSessionService.EXTRA_USES_LOCATION, usesLocation)
      ContextCompat.startForegroundService(context, intent)
    }

    Function("stop") {
      val context = appContext.reactContext ?: return@Function false
      context.stopService(Intent(context, WorkoutSessionService::class.java))
    }
  }
}
