import type { Server } from 'node:http';
export declare const ROOT_STATIC: RegExp;
export declare function serveLegacy(root: string, port: number): Promise<Server>;
