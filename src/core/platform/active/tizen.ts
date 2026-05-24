// Side-effect import: executes the Vizbee SDK IIFE and registers
// window.vizbee / window.VizbeeSDK globals.  This import is only
// included in tizen builds (via the @active-adapter alias).
import '@vizbee/sdk-tizen';

export { SamsungTizenAdapter as ActiveAdapter } from '../adapters/SamsungTizenAdapter';
