package tv.vizbee.cordova;

import android.webkit.WebView;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaInterface;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.CordovaWebView;
import org.json.JSONArray;

/**
 * Cordova plugin that registers {@link NativeBridge} as {@code window.VizbeeBridge}
 * in the WebView via {@link WebView#addJavascriptInterface}.
 *
 * <p>The interface is registered once during WebView initialization and persists
 * across all subsequent page navigations — including navigations to external URLs
 * that do not load cordova.js. This allows the sample webapp (served from
 * S3/CloudFront or a local dev server) to call
 * {@code window.VizbeeBridge.methodName()} without bundling Cordova-specific code.
 * </p>
 *
 * <p><b>Security note:</b> {@code addJavascriptInterface} exposes the bridge to all
 * content loaded in this WebView. In production, restrict navigation to trusted
 * app URLs only (see {@code allow-navigation} in config.xml).</p>
 */
public class VizbeeBridgePlugin extends CordovaPlugin {

    private static final String BRIDGE_GLOBAL = "VizbeeBridge";

    @Override
    public void initialize(CordovaInterface cordova, CordovaWebView webView) {
        super.initialize(cordova, webView);

        WebView nativeWebView = (WebView) webView.getEngine().getView();
        nativeWebView.addJavascriptInterface(new NativeBridge(cordova), BRIDGE_GLOBAL);
    }

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callbackContext) {
        // All JS ↔ native communication uses window.VizbeeBridge directly.
        // No cordova.exec() actions are needed.
        return false;
    }
}
