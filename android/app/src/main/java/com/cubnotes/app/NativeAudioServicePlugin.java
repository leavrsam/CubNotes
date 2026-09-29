package com.cubnotes.app;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;

@CapacitorPlugin(
    name = "NativeAudioService",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone"),
        @Permission(strings = { "android.permission.POST_NOTIFICATIONS" }, alias = "notifications")
    }
)
public class NativeAudioServicePlugin extends Plugin {
    private static final String TAG = "NativeAudioPlugin";
    private PluginCall pendingStopCall = null;
    private BroadcastReceiver finishReceiver = null;

    @Override
    public void load() {
        super.load();
        registerRecordingBroadcast();
    }

    private void registerRecordingBroadcast() {
        finishReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent == null) return;
                String action = intent.getAction();

                if (AudioRecordingService.ACTION_STATE_CHANGED.equals(action)) {
                    boolean recording = intent.getBooleanExtra(AudioRecordingService.EXTRA_IS_RECORDING, false);
                    String filePath = intent.getStringExtra(AudioRecordingService.EXTRA_FILE_PATH);
                    long duration = intent.getLongExtra(AudioRecordingService.EXTRA_DURATION, 0);

                    // Notify web listeners of status change
                    JSObject ret = new JSObject();
                    ret.put("isRecording", recording);
                    ret.put("filePath", filePath);
                    ret.put("duration", duration);
                    notifyListeners("recordingStateChanged", ret);

                    // Resolve pending stop call if any
                    if (!recording && pendingStopCall != null) {
                        handleStopCallResult(pendingStopCall, filePath, duration);
                        pendingStopCall = null;
                    }
                }
            }
        };

        IntentFilter filter = new IntentFilter(AudioRecordingService.ACTION_STATE_CHANGED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(finishReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            getContext().registerReceiver(finishReceiver, filter);
        }
    }

    @PluginMethod
    public void isRecording(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("isRecording", AudioRecordingService.isRecording());
        ret.put("filePath", AudioRecordingService.getCurrentAudioPath());
        call.resolve(ret);
    }

    @PluginMethod
    public void startRecording(PluginCall call) {
        // Check record audio permission
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(call);
            return;
        }

        try {
            Context context = getContext();
            Intent serviceIntent = new Intent(context, AudioRecordingService.class);
            serviceIntent.setAction(AudioRecordingService.ACTION_START);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("message", "Recording started in background");
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error starting native recording service", e);
            call.reject("Failed to start background recording service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopRecording(PluginCall call) {
        if (!AudioRecordingService.isRecording()) {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("message", "Not currently recording");
            call.resolve(ret);
            return;
        }

        this.pendingStopCall = call;

        Context context = getContext();
        Intent serviceIntent = new Intent(context, AudioRecordingService.class);
        serviceIntent.setAction(AudioRecordingService.ACTION_STOP);
        context.startService(serviceIntent);
    }

    private void handleStopCallResult(PluginCall call, String filePath, long duration) {
        if (filePath == null) {
            call.reject("Recording completed but no audio file was generated");
            return;
        }

        try {
            File audioFile = new File(filePath);
            if (!audioFile.exists() || audioFile.length() == 0) {
                call.reject("Audio file is empty or missing");
                return;
            }

            // Read audio file into base64
            byte[] fileBytes = new byte[(int) audioFile.length()];
            try (FileInputStream fis = new FileInputStream(audioFile)) {
                int read = fis.read(fileBytes);
                if (read <= 0) {
                    call.reject("Unable to read audio file bytes");
                    return;
                }
            }

            String base64Data = Base64.encodeToString(fileBytes, Base64.NO_WRAP);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("base64", base64Data);
            ret.put("mimeType", "audio/mp4");
            ret.put("fileExt", "m4a");
            ret.put("filePath", filePath);
            ret.put("size", audioFile.length());
            ret.put("duration", duration);
            call.resolve(ret);

        } catch (IOException e) {
            Log.e(TAG, "Error reading recorded audio file", e);
            call.reject("Error reading audio file: " + e.getMessage());
        }
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (finishReceiver != null) {
            try {
                getContext().unregisterReceiver(finishReceiver);
            } catch (Exception ignored) {}
        }
    }
}
