// Side-effect import: executes the Vizbee SDK IIFE and registers
// window.vizbee / window.VizbeeSDK globals.  This import is only
// included in webos builds (via the @active-adapter alias).
import '@vizbee/sdk-webos';

export { LGWebOSAdapter as ActiveAdapter } from '../adapters/LGWebOSAdapter';
