package com.cubnotes.app;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Log;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;

public class UpdateManager {
    private static final String TAG = "UpdateManager";

    public static boolean hasInstallPermission(Context context) {
        try {
            android.content.pm.PackageInfo info = context.getPackageManager().getPackageInfo(
                context.getPackageName(),
                android.content.pm.PackageManager.GET_PERMISSIONS
            );
            if (info.requestedPermissions != null) {
                for (String p : info.requestedPermissions) {
                    if ("android.permission.REQUEST_INSTALL_PACKAGES".equals(p)) {
                        return true;
                    }
                }
            }
        } catch (Exception ignored) {}
        return false;
    }

    public static void startDownloadAndInstall(Context context, String apkUrl, String versionName) {
        // If app does not have REQUEST_INSTALL_PACKAGES (Google Play Store build),
        // redirect to Google Play Store / download page instead of attempting sideloading.
        if (!hasInstallPermission(context)) {
            try {
                Intent playIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + context.getPackageName()));
                playIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(playIntent);
            } catch (Exception e) {
                Intent webIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://motif.wolfcubventures.com/download"));
                webIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(webIntent);
            }
            return;
        }

        if (apkUrl == null || apkUrl.trim().isEmpty()) {
            Toast.makeText(context, "Update URL is not configured", Toast.LENGTH_SHORT).show();
            return;
        }

        // Check if Android requires permission to install unknown apps
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!context.getPackageManager().canRequestPackageInstalls()) {
                Toast.makeText(context, "Please allow Motif to install app updates", Toast.LENGTH_LONG).show();
                Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                settingsIntent.setData(Uri.parse("package:" + context.getPackageName()));
                settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(settingsIntent);
            }
        }

        File destinationDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (destinationDir != null && !destinationDir.exists()) {
            destinationDir.mkdirs();
        }
        File apkFile = new File(destinationDir, "Motif-update.apk");
        if (apkFile.exists()) {
            apkFile.delete();
        }

        Toast.makeText(context, "Downloading update in background... Check notification bar.", Toast.LENGTH_LONG).show();

        DownloadManager downloadManager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        if (downloadManager == null) {
            Toast.makeText(context, "Download service unavailable", Toast.LENGTH_SHORT).show();
            return;
        }

        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(apkUrl));
        request.setTitle("Motif Update (" + versionName + ")");
        request.setDescription("Downloading latest version...");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationUri(Uri.fromFile(apkFile));
        request.setMimeType("application/vnd.android.package-archive");

        long downloadId = downloadManager.enqueue(request);

        // Register receiver for when download finishes or user clicks notification
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context recvContext, Intent intent) {
                if (intent == null) return;
                String action = intent.getAction();
                if (DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(action)) {
                    long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (id == downloadId) {
                        try {
                            context.getApplicationContext().unregisterReceiver(this);
                        } catch (Exception ignored) {}

                        installApk(context, apkFile);
                    }
                } else if (DownloadManager.ACTION_NOTIFICATION_CLICKED.equals(action)) {
                    installApk(context, apkFile);
                }
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        filter.addAction(DownloadManager.ACTION_NOTIFICATION_CLICKED);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.getApplicationContext().registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            context.getApplicationContext().registerReceiver(receiver, filter);
        }
    }

    public static void installApk(Context context, File apkFile) {
        if (!apkFile.exists()) {
            Toast.makeText(context, "Downloaded update file not found", Toast.LENGTH_SHORT).show();
            return;
        }

        try {
            Uri contentUri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                apkFile
            );

            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(contentUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            context.startActivity(installIntent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start installation", e);
            Toast.makeText(context, "Failed to start installation: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }
}
