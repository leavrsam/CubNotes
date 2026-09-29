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
    private static final String TAG = "CubNotesRecordingSvc";
    public static final String CHANNEL_ID = "cubnotes_recording_channel";
    public static final int NOTIFICATION_ID = 2001;

    public static final String ACTION_START = "com.cubnotes.app.ACTION_START_RECORDING";
    public static final String ACTION_STOP = "com.cubnotes.app.ACTION_STOP_RECORDING";
    public static final String ACTION_STATE_CHANGED = "com.cubnotes.app.RECORDING_STATE_CHANGED";
    public static final String ACTION_RECORDING_FINISHED = "com.cubnotes.app.RECORDING_FINISHED";
    
    public static final String EXTRA_IS_RECORDING = "isRecording";
    public static final String EXTRA_FILE_PATH = "filePath";
    public static final String EXTRA_DURATION = "duration";

    private static volatile boolean isRecording = false;
    private static volatile String currentAudioPath = null;
    private static volatile long recordingStartTime = 0;

    private MediaRecorder mediaRecorder;
    private PowerManager.WakeLock wakeLock;

    public static boolean isRecording() {
        return isRecording;
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
        }

        return START_NOT_STICKY;
    }

    private void startRecording() {
        if (isRecording) {
            Log.d(TAG, "Already recording");
            return;
        }

        try {
            // 1. Acquire WakeLock to keep CPU alive when screen is off
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CubNotes:RecordingWakeLock");
                wakeLock.acquire(120 * 60 * 1000L); // Max 2 hours safety timeout
            }

            // 2. Prepare destination file
            File storageDir = getExternalFilesDir(null);
            if (storageDir == null) {
                storageDir = getCacheDir();
            }
            File audioFile = new File(storageDir, "meeting_" + System.currentTimeMillis() + ".m4a");
            currentAudioPath = audioFile.getAbsolutePath();

            // 3. Configure MediaRecorder for AAC / MPEG-4 (universal standard)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                mediaRecorder = new MediaRecorder(this);
            } else {
                mediaRecorder = new MediaRecorder();
            }

            mediaRecorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            mediaRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            mediaRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            mediaRecorder.setAudioSamplingRate(44100);
            mediaRecorder.setAudioEncodingBitRate(96000);
            mediaRecorder.setOutputFile(currentAudioPath);
            mediaRecorder.prepare();
            mediaRecorder.start();

            isRecording = true;
            recordingStartTime = System.currentTimeMillis();

            // 4. Start Foreground Service with Notification
            Notification notification = buildForegroundNotification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }

            // 5. Broadcast state to UI & Widget
            broadcastState(true, null, 0);
            MeetingWidgetProvider.updateAllWidgets(this, true);

            Log.d(TAG, "Background recording started: " + currentAudioPath);

        } catch (Exception e) {
            Log.e(TAG, "Failed to start recording", e);
            releaseRecorder();
            isRecording = false;
            stopForeground(true);
            stopSelf();
        }
    }

    private void stopRecording() {
        if (!isRecording) {
            return;
        }

        long duration = System.currentTimeMillis() - recordingStartTime;
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
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
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

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("CubNotes Meeting Recording")
                .setContentText("Recording in background with phone off/in pocket...")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(openPendingIntent)
                .setOngoing(true)
                .addAction(R.drawable.ic_stop_24, "Stop & Summarize", stopPendingIntent)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "CubNotes Background Recording",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Shows notification when CubNotes is recording audio in background");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void broadcastState(boolean recording, String filePath, long duration) {
        Intent intent = new Intent(ACTION_STATE_CHANGED);
        intent.putExtra(EXTRA_IS_RECORDING, recording);
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
