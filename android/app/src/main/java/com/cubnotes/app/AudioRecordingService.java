package com.cubnotes.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.io.File;
import java.io.IOException;

public class AudioRecordingService extends Service {
    private static final String TAG = "MotifRecordingSvc";
    public static final String CHANNEL_ID = "cubnotes_recording_channel";
    public static final int NOTIFICATION_ID = 2001;

    public static final String ACTION_START = "com.cubnotes.app.ACTION_START_RECORDING";
    public static final String ACTION_STOP = "com.cubnotes.app.ACTION_STOP_RECORDING";
    public static final String ACTION_PAUSE = "com.cubnotes.app.ACTION_PAUSE_RECORDING";
    public static final String ACTION_RESUME = "com.cubnotes.app.ACTION_RESUME_RECORDING";
    public static final String ACTION_STATE_CHANGED = "com.cubnotes.app.RECORDING_STATE_CHANGED";
    public static final String ACTION_RECORDING_FINISHED = "com.cubnotes.app.RECORDING_FINISHED";
    
    public static final String EXTRA_IS_RECORDING = "isRecording";
    public static final String EXTRA_IS_PAUSED = "isPaused";
    public static final String EXTRA_FILE_PATH = "filePath";
    public static final String EXTRA_DURATION = "duration";

    private static volatile boolean isRecording = false;
    private static volatile boolean isPaused = false;
    private static volatile String currentAudioPath = null;
    private static volatile long recordingStartTime = 0;

    private MediaRecorder mediaRecorder;
    private PowerManager.WakeLock wakeLock;

    public static boolean isRecording() {
        return isRecording;
    }

    public static boolean isPaused() {
        return isPaused;
    }

    public static String getCurrentAudioPath() {
        return currentAudioPath;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;

        String action = intent.getAction();
        if (ACTION_START.equals(action)) {
            startRecording();
        } else if (ACTION_STOP.equals(action)) {
            stopRecording();
        } else if (ACTION_PAUSE.equals(action)) {
            pauseRecording();
        } else if (ACTION_RESUME.equals(action)) {
            resumeRecording();
        }

        return START_NOT_STICKY;
    }

    private synchronized void startRecording() {
        if (isRecording) {
            Log.d(TAG, "Already recording");
            return;
        }

        try {
            // 1. Immediately post Notification & start Foreground Service (Required by Android 14+)
            createNotificationChannel();
            Notification notification = buildForegroundNotification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }

            // 2. Acquire WakeLock to keep CPU alive when screen is off
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Motif:RecordingWakeLock");
                wakeLock.acquire(180 * 60 * 1000L); // Max 3 hours safety timeout
            }

            // 3. Prepare destination file
            File storageDir = getExternalFilesDir(null);
            if (storageDir == null) {
                storageDir = getCacheDir();
            }
            File audioFile = new File(storageDir, "meeting_" + System.currentTimeMillis() + ".m4a");
            currentAudioPath = audioFile.getAbsolutePath();

            // 4. Configure MediaRecorder for AAC / MPEG-4 (universal standard)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                mediaRecorder = new MediaRecorder(this);
            } else {
                mediaRecorder = new MediaRecorder();
            }

            mediaRecorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            mediaRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            mediaRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            mediaRecorder.setAudioSamplingRate(44100);
            mediaRecorder.setAudioEncodingBitRate(48000); // 48kbps high-efficiency AAC voice standard (cuts upload size in half with pristine voice clarity)
            mediaRecorder.setOutputFile(currentAudioPath);
            mediaRecorder.prepare();
            mediaRecorder.start();

            isRecording = true;
            isPaused = false;
            recordingStartTime = System.currentTimeMillis();

            // 5. Broadcast state to UI & Widget
            broadcastState(true, null, 0);
            MeetingWidgetProvider.updateAllWidgets(this, true);

            Log.d(TAG, "Background recording started: " + currentAudioPath);

        } catch (Exception e) {
            Log.e(TAG, "Failed to start recording", e);
            releaseRecorder();
            isRecording = false;
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
                wakeLock = null;
            }
            stopForeground(true);
            stopSelf();
            broadcastState(false, null, 0);
        }
    }

    private synchronized void stopRecording() {
        if (!isRecording) {
            return;
        }

        long duration = System.currentTimeMillis() - recordingStartTime;
        if (duration < 1000) {
            try {
                Thread.sleep(1000 - duration);
            } catch (InterruptedException ignored) {}
            duration = System.currentTimeMillis() - recordingStartTime;
        }

        String finishedPath = currentAudioPath;

        try {
            if (mediaRecorder != null) {
                mediaRecorder.stop();
            }
        } catch (Exception e) {
            Log.w(TAG, "Error stopping media recorder", e);
        } finally {
            releaseRecorder();
            isRecording = false;
            isPaused = false;
        }

        // Release WakeLock
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
            wakeLock = null;
        }

        // Remove foreground notification
        stopForeground(true);
        stopSelf();

        // Broadcast completion to UI & Widget
        broadcastState(false, finishedPath, duration);
        MeetingWidgetProvider.updateAllWidgets(this, false);

        // Bring app to foreground if stopped from widget or notification
        if (finishedPath != null) {
            Intent openAppIntent = new Intent(this, MainActivity.class);
            openAppIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            openAppIntent.setAction(ACTION_RECORDING_FINISHED);
            openAppIntent.putExtra(EXTRA_FILE_PATH, finishedPath);
            openAppIntent.putExtra(EXTRA_DURATION, duration);
            startActivity(openAppIntent);
        }

        Log.d(TAG, "Background recording stopped: " + finishedPath + ", duration: " + duration + "ms");
    }

    private synchronized void pauseRecording() {
        if (!isRecording || isPaused) {
            return;
        }
        try {
            if (mediaRecorder != null) {
                mediaRecorder.pause();
                isPaused = true;
                updateNotification();
                broadcastState(true, null, 0);
                Log.d(TAG, "Recording paused");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error pausing media recorder", e);
        }
    }

    private synchronized void resumeRecording() {
        if (!isRecording || !isPaused) {
            return;
        }
        try {
            if (mediaRecorder != null) {
                mediaRecorder.resume();
                isPaused = false;
                updateNotification();
                broadcastState(true, null, 0);
                Log.d(TAG, "Recording resumed");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error resuming media recorder", e);
        }
    }

    private void updateNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildForegroundNotification());
        }
    }

    private void releaseRecorder() {
        if (mediaRecorder != null) {
            try {
                mediaRecorder.reset();
                mediaRecorder.release();
            } catch (Exception e) {
                Log.w(TAG, "Error releasing media recorder", e);
            }
            mediaRecorder = null;
        }
    }

    private Notification buildForegroundNotification() {
        // Tap notification to open app
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setAction(Intent.ACTION_MAIN);
        openIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPendingIntent = PendingIntent.getActivity(
                this, 0, openIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
        );

        // Tap Stop button on notification to stop recording
        Intent stopIntent = new Intent(this, AudioRecordingService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPendingIntent = PendingIntent.getService(
                this, 1, stopIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
        );

        // Tap Pause / Resume button on notification
        Intent togglePauseIntent = new Intent(this, AudioRecordingService.class);
        togglePauseIntent.setAction(isPaused ? ACTION_RESUME : ACTION_PAUSE);
        PendingIntent togglePausePendingIntent = PendingIntent.getService(
                this, 2, togglePauseIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT : PendingIntent.FLAG_UPDATE_CURRENT
        );

        String pauseTitle = isPaused ? "Resume" : "Pause";
        int pauseIcon = isPaused ? R.drawable.ic_play_24 : R.drawable.ic_pause_24;
        String contentText = isPaused 
                ? "Recording paused • Tap Resume to continue" 
                : "Recording in background • Screen can be turned off";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Motif Meeting Recording")
                .setContentText(contentText)
                .setSmallIcon(R.drawable.ic_mic_24)
                .setContentIntent(openPendingIntent)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .addAction(pauseIcon, pauseTitle, togglePausePendingIntent)
                .addAction(R.drawable.ic_stop_24, "Stop & Summarize", stopPendingIntent)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);
        }

        return builder.build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Motif Meeting Recording",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Shows active meeting recording status and controls");
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void broadcastState(boolean recording, String filePath, long duration) {
        Intent intent = new Intent(ACTION_STATE_CHANGED);
        intent.putExtra(EXTRA_IS_RECORDING, recording);
        intent.putExtra(EXTRA_IS_PAUSED, isPaused);
        if (filePath != null) {
            intent.putExtra(EXTRA_FILE_PATH, filePath);
            intent.putExtra(EXTRA_DURATION, duration);
        }
        sendBroadcast(intent);
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (isRecording) {
            stopRecording();
        }
    }
}
