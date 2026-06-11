package tv.vizbee.cordova;

import android.os.Build;
import android.webkit.JavascriptInterface;

import org.apache.cordova.CordovaInterface;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * JavaScript interface exposed as {@code window.VizbeeBridge} in the WebView.
 *
 * <p>Methods annotated with {@link JavascriptInterface} are callable from any
 * JavaScript running in the WebView. All calls arrive on a background thread —
 * do not update UI directly from these methods.</p>
 *
 * <p>Methods marked {@code TODO} are stubs. They will be wired to the Vizbee
 * Android SDK when integration is added in a future phase.</p>
 */
public class NativeBridge {

    private final CordovaInterface cordova;

    NativeBridge(CordovaInterface cordova) {
        this.cordova = cordova;
    }

    // -------------------------------------------------------------------------
    // Platform identity
    // -------------------------------------------------------------------------

    /** Returns the platform identifier used by the sample webapp adapter. */
    @JavascriptInterface
    public String getPlatformName() {
        return "firetv";
    }

    /**
     * Returns a JSON string with basic Android/Fire OS device information.
     * Parsed by {@code FireTVAdapter.getDeviceInfo()} in the web app.
     *
     * <pre>{
     *   "platform": "firetv",
     *   "model": "AFTN",
     *   "manufacturer": "Amazon",
     *   "osVersion": "9",
     *   "sdkInt": 28
     * }</pre>
     */
    @JavascriptInterface
    public String getDeviceInfo() {
        try {
            JSONObject info = new JSONObject();
            info.put("platform",     "firetv");
            info.put("model",        Build.MODEL);
            info.put("manufacturer", Build.MANUFACTURER);
            info.put("osVersion",    Build.VERSION.RELEASE);
            info.put("sdkInt",       Build.VERSION.SDK_INT);
            return info.toString();
        } catch (JSONException e) {
            return "{}";
        }
    }

    /** Finishes the host Activity, terminating the app. */
    @JavascriptInterface
    public void exit() {
        cordova.getActivity().finish();
    }

    // -------------------------------------------------------------------------
    // Vizbee SDK placeholders
    // These stubs will be replaced by real SDK calls in a future integration phase.
    // -------------------------------------------------------------------------

    /**
     * Returns the Vizbee device identifier.
     * @return empty string until Vizbee SDK integration is added.
     */
    @JavascriptInterface
    public String getVizbeeDeviceId() {
        // TODO: return Vizbee SDK device identifier once integrated
        return "";
    }

    /**
     * Returns the current HomeSSO sign-in state as a JSON string.
     * @return {@code {"signedIn":false}} until HomeSSO integration is added.
     */
    @JavascriptInterface
    public String getHomeSSOStatus() {
        // TODO: return HomeSSO sign-in state from Vizbee SDK once integrated
        return "{\"signedIn\":false}";
    }
}
