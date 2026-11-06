package expo.modules.workoutsession

import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WorkoutSessionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WorkoutSession")

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
