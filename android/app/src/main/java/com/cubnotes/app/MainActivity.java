package com.cubnotes.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeAudioServicePlugin.class);
        super.onCreate(savedInstanceState);

        // Allow downloading files (such as Motif.apk) directly through Android's DownloadManager / UpdateManager
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
                    try {
                        if (url != null && (url.contains(".apk") || (mimetype != null && mimetype.contains("android.package-archive")))) {
                            UpdateManager.startDownloadAndInstall(this, url, "latest");
                        } else {
                            Intent i = new Intent(Intent.ACTION_VIEW);
                            i.setData(Uri.parse(url));
                            startActivity(i);
                        }
                    } catch (Exception ignored) {}
                });
            }
        } catch (Exception ignored) {}
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }
}
