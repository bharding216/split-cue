package expo.modules.workoutsession

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

/**
 * Foreground service that runs for the length of a workout. Besides the
 * ongoing notification, it holds a headless JS task open: React Native only
 * fires JS timers in the background while such a task is active.
 *
 * For GPS workouts it also requests location itself. A location-type
 * foreground service started from the foreground keeps receiving fixes with
 * the screen locked under "While using the app" access, so background
 * location permission isn't needed.
 */
class WorkoutSessionService : HeadlessJsTaskService() {
  private var taskStarted = false
  private var locationStarted = false

  private val locationCallback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      val listener = locationListener ?: return
      result.locations.forEach(listener)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Workout in progress"
    val body = intent?.getStringExtra(EXTRA_BODY) ?: ""
    val tracksLocation =
      (intent?.getBooleanExtra(EXTRA_USES_LOCATION, false) ?: false) && hasLocationPermission()

    try {
      ServiceCompat.startForeground(
        this,
        NOTIFICATION_ID,
        buildNotification(title, body),
        serviceType(tracksLocation),
      )
    } catch (e: Exception) {
      Log.w(TAG, "Could not start workout foreground service", e)
      stopSelf()
      return START_NOT_STICKY
    }

    if (tracksLocation) startLocationUpdates()

    if (!taskStarted) {
      taskStarted = true
      startTask(HeadlessJsTaskConfig(TASK_KEY, Arguments.createMap(), 0, true))
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    if (locationStarted) {
      LocationServices.getFusedLocationProviderClient(this).removeLocationUpdates(locationCallback)
    }
    super.onDestroy()
  }

  @SuppressLint("MissingPermission")
  private fun startLocationUpdates() {
    if (locationStarted) return
    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, LOCATION_INTERVAL_MS)
      .setMinUpdateIntervalMillis(LOCATION_INTERVAL_MS)
      .setMinUpdateDistanceMeters(LOCATION_MIN_DISTANCE_M)
      .build()
    try {
      LocationServices.getFusedLocationProviderClient(this)
        .requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
      locationStarted = true
    } catch (e: SecurityException) {
      Log.w(TAG, "Could not start location updates", e)
    }
  }

  /** Location type requires the permission at start time on Android 14+, so only claim it when granted. */
  private fun serviceType(tracksLocation: Boolean): Int {
    var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
    if (tracksLocation) {
      type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
    }
    return type
  }

  private fun hasLocationPermission(): Boolean =
    listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION).any {
      ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
    }

  private fun buildNotification(title: String, body: String): Notification {
    NotificationManagerCompat.from(this).createNotificationChannel(
      NotificationChannelCompat.Builder(CHANNEL_ID, NotificationManagerCompat.IMPORTANCE_LOW)
        .setName("Workout in progress")
        .setShowBadge(false)
        .build()
    )

    val contentIntent = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
    }

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(smallIcon())
      .setContentIntent(contentIntent)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_WORKOUT)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .build()
  }

  /** The monochrome icon generated by the expo-notifications config plugin, else the app icon. */
  private fun smallIcon(): Int {
    val id = resources.getIdentifier("notification_icon", "drawable", packageName)
    return if (id != 0) id else applicationInfo.icon
  }

  companion object {
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    const val EXTRA_USES_LOCATION = "usesLocation"

    /** Set by WorkoutSessionModule to forward fixes to JS. */
    @Volatile
    var locationListener: ((Location) -> Unit)? = null

    /** Must match TASK_KEY in modules/workout-session/index.ts. */
    private const val TASK_KEY = "SplitCueWorkoutSession"
    private const val CHANNEL_ID = "workout_session"
    private const val NOTIFICATION_ID = 7301
    private const val LOCATION_INTERVAL_MS = 1000L
    private const val LOCATION_MIN_DISTANCE_M = 3f
    private const val TAG = "WorkoutSession"
  }
}
