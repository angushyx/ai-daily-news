// 在所有靜態 import 之前先做相容性 polyfill (給 Node 18 用的)
// undici (anthropic-sdk 依賴) 在 import 時就會引用 global.File，Node 20 才有原生。
import { Blob, File as NodeBufferFile } from 'node:buffer';
if (typeof globalThis.File === 'undefined') globalThis.File = NodeBufferFile;
if (typeof globalThis.Blob === 'undefined') globalThis.Blob = Blob;
