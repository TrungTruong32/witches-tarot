import type { Server } from 'node:http';
export declare const ROOT_STATIC: RegExp;
export declare const LEGACY_HTML: string;
export declare function serveLegacy(root: string, port: number): Promise<Server>;
