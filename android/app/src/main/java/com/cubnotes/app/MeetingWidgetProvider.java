package com.cubnotes.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.RemoteViews;

public class MeetingWidgetProvider extends AppWidgetProvider {
    public static final String ACTION_TOGGLE_RECORDING = "com.cubnotes.app.ACTION_TOGGLE_RECORDING";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        boolean recording = AudioRecordingService.isRecording();
        for (int appWidgetId : appWidgetIds) {
            updateWidgetView(context, appWidgetManager, appWidgetId, recording);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);

        if (ACTION_TOGGLE_RECORDING.equals(intent.getAction())) {
            boolean recording = AudioRecordingService.isRecording();
            Intent serviceIntent = new Intent(context, AudioRecordingService.class);
            if (recording) {
                serviceIntent.setAction(AudioRecordingService.ACTION_STOP);
            } else {
                serviceIntent.setAction(AudioRecordingService.ACTION_START);
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        } else if (AudioRecordingService.ACTION_STATE_CHANGED.equals(intent.getAction())) {
            boolean isRecording = intent.getBooleanExtra(AudioRecordingService.EXTRA_IS_RECORDING, false);
            updateAllWidgets(context, isRecording);
        }
    }

    public static void updateAllWidgets(Context context, boolean isRecording) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName componentName = new ComponentName(context, MeetingWidgetProvider.class);
        int[] appWidgetIds = manager.getAppWidgetIds(componentName);

        for (int appWidgetId : appWidgetIds) {
            updateWidgetView(context, manager, appWidgetId, isRecording);
        }
    }

    private static void updateWidgetView(Context context, AppWidgetManager manager, int appWidgetId, boolean isRecording) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_meeting);

        // Click on widget button to toggle recording
        Intent toggleIntent = new Intent(context, MeetingWidgetProvider.class);
        toggleIntent.setAction(ACTION_TOGGLE_RECORDING);
        PendingIntent pendingToggle = PendingIntent.getBroadcast(
                context, appWidgetId, toggleIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT
        );
        views.setOnClickPendingIntent(R.id.widget_btn_record, pendingToggle);

        // Click on widget title/body to open CubNotes app
        Intent openAppIntent = new Intent(context, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingOpen = PendingIntent.getActivity(
                context, appWidgetId + 1000, openAppIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT
        );
        views.setOnClickPendingIntent(R.id.widget_title, pendingOpen);
        views.setOnClickPendingIntent(R.id.widget_status, pendingOpen);

        // Update UI state
        if (isRecording) {
            views.setTextViewText(R.id.widget_status, "🔴 Recording in background...");
            views.setInt(R.id.widget_btn_record, "setBackgroundResource", R.drawable.widget_btn_recording_bg);
            views.setImageViewResource(R.id.widget_btn_icon, R.drawable.ic_stop_24);
        } else {
            views.setTextViewText(R.id.widget_status, "Tap to record meeting");
            views.setInt(R.id.widget_btn_record, "setBackgroundResource", R.drawable.widget_btn_bg);
            views.setImageViewResource(R.id.widget_btn_icon, R.drawable.ic_mic_24);
        }

        manager.updateAppWidget(appWidgetId, views);
    }
}
