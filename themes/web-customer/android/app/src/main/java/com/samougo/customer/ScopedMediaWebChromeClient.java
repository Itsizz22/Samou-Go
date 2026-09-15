package com.samougo.customer;

import android.net.Uri;
import android.graphics.Bitmap;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.PickVisualMediaRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/** System-owned image selection grants access only to the user's chosen images.
 * AndroidX falls back to the document picker on older devices. Microphone,
 * geolocation, capture and non-image file handling remain owned by Capacitor.
 */
public final class ScopedMediaWebChromeClient extends BridgeWebChromeClient {
    private ValueCallback<Uri[]> pendingSelection;
    private final ActivityResultLauncher<PickVisualMediaRequest> singlePicker;
    private final ActivityResultLauncher<PickVisualMediaRequest> multiplePicker;

    public ScopedMediaWebChromeClient(Bridge bridge) {
        super(bridge);
        singlePicker = bridge.registerForActivityResult(
            new ActivityResultContracts.PickVisualMedia(),
            uri -> finishSelection(uri == null ? null : new Uri[] { uri }));
        multiplePicker = bridge.registerForActivityResult(
            new ActivityResultContracts.PickMultipleVisualMedia(),
            uris -> finishSelection(uris.isEmpty() ? null : uris.toArray(new Uri[0])));
    }

    /** Chromium otherwise paints its default play graphic before a video has a frame.
     * HTML owns our posters; preserve transparency while the muted video prepares.
     */
    @Override
    public Bitmap getDefaultVideoPoster() {
        return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
    }

    @Override
    public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
        if (params.isCaptureEnabled() || !acceptsOnlyImages(params.getAcceptTypes())
            || (params.getMode() != FileChooserParams.MODE_OPEN && params.getMode() != FileChooserParams.MODE_OPEN_MULTIPLE)) {
            return super.onShowFileChooser(webView, callback, params);
        }
        finishSelection(null);
        pendingSelection = callback;
        PickVisualMediaRequest request = new PickVisualMediaRequest.Builder()
            .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE).build();
        try {
            if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) multiplePicker.launch(request);
            else singlePicker.launch(request);
        } catch (android.content.ActivityNotFoundException exception) {
            pendingSelection = null;
            return super.onShowFileChooser(webView, callback, params);
        }
        return true;
    }

    static boolean acceptsOnlyImages(String[] acceptTypes) {
        if (acceptTypes == null || acceptTypes.length == 0) return false;
        boolean imageFound = false;
        for (String group : acceptTypes) {
            if (group == null) return false;
            for (String type : group.split(",")) {
                String mime = type.trim().toLowerCase(java.util.Locale.ROOT);
                if (!mime.startsWith("image/")) return false;
                imageFound = true;
            }
        }
        return imageFound;
    }

    void finishSelection(Uri[] uris) {
        ValueCallback<Uri[]> callback = pendingSelection;
        pendingSelection = null;
        if (callback != null) callback.onReceiveValue(uris);
    }
}
