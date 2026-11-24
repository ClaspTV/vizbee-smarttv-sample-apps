// @ts-check
'use strict';

/**
 * Minimal ES2019+ polyfills injected (as the first <head> script) into perf
 * builds for old TV engines, e.g. 2019 Samsung Tizen 5.0 = Chromium 63, where
 * the bundle (OpenTelemetry / Grafana Faro) otherwise throws before the app
 * boots. Injected identically into every case, so it cancels in the costs.
 */
export const LEGACY_POLYFILLS = `<script>(function(){
var w=window;
if(typeof globalThis==='undefined'){w.globalThis=w;}
function def(o,k,v){if(!o[k])Object.defineProperty(o,k,{value:v,writable:true,configurable:true});}
def(Array.prototype,'flat',function(d){d=d===undefined?1:Number(d);var r=[];(function f(a,dd){for(var i=0;i<a.length;i++){if(!(i in a))continue;var x=a[i];if(Array.isArray(x)&&dd>0)f(x,dd-1);else r.push(x);}})(this,d);return r;});
def(Array.prototype,'flatMap',function(fn,t){return Array.prototype.map.call(this,fn,t).flat(1);});
def(Object,'fromEntries',function(it){var o={};Array.from(it).forEach(function(e){o[e[0]]=e[1];});return o;});
def(String.prototype,'trimStart',String.prototype.trimLeft);
def(String.prototype,'trimEnd',String.prototype.trimRight);
def(Promise,'allSettled',function(ps){return Promise.all(Array.from(ps).map(function(p){return Promise.resolve(p).then(function(v){return{status:'fulfilled',value:v};},function(e){return{status:'rejected',reason:e};});}));});
if(typeof w.queueMicrotask!=='function'){w.queueMicrotask=function(cb){Promise.resolve().then(cb);};}
})();</script>`;
