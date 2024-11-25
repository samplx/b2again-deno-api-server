/*
 *  Copyright 2024 James Burlingame
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import type { MigrationContext } from '../../lib/standards.ts';
import { S3Client, type S3ClientOptions } from 'jsr:@bradenmacdonald/s3-lite-client';

const DEFAULT_S3_PORT = 443;
const DEFAULT_S3_USE_SSL = true;
const DEFAULT_S3_REGION = 'auto';
const DEFAULT_S3_PATH_STYLE: boolean | undefined = false;

function loadS3Options(name: string): S3ClientOptions {
    const UC_NAME = name.toUpperCase();
    const endPoint = Deno.env.get(`${UC_NAME}_END_POINT`);
    if (!endPoint) {
        throw new Deno.errors.NotSupported(`${UC_NAME}_END_POINT must be valid`);
    }
    const bucket = Deno.env.get(`${UC_NAME}_BUCKET`);
    if (!bucket) {
        throw new Deno.errors.NotSupported(`${UC_NAME}_BUCKET must be valid`);
    }
    const accessKey = Deno.env.get(`${UC_NAME}_ACCESS_KEY`);
    if (!accessKey) {
        throw new Deno.errors.NotSupported(`${UC_NAME}_ACCESS_KEY must be valid`);
    }
    const secretKey = Deno.env.get(`${UC_NAME}_SECRET_KEY`);
    if (!secretKey) {
        throw new Deno.errors.NotSupported(`${UC_NAME}_SECRET_KEY must be valid`);
    }
    let port = DEFAULT_S3_PORT;
    const portString = Deno.env.get(`${UC_NAME}_PORT`);
    if (portString) {
        port = parseInt(portString);
    }
    const useSSL = DEFAULT_S3_USE_SSL && (Deno.env.get(`${UC_NAME}_USE_SSL`) !== 'false');
    const region = Deno.env.get(`${UC_NAME}_REGION`) ?? DEFAULT_S3_REGION;
    let pathStyle = DEFAULT_S3_PATH_STYLE;
    const pathStyleEnv = Deno.env.get(`${UC_NAME}_PATH_STYLE`);
    if (pathStyleEnv === 'true') {
        pathStyle = true;
    } else if (pathStyleEnv === 'false') {
        pathStyle = false;
    }
    return {
        endPoint,
        bucket,
        accessKey,
        secretKey,
        port,
        useSSL,
        region,
        pathStyle,
    };
}

class Sink {
    readonly client: S3Client;
    constructor(name: string) {
        const options = loadS3Options(name);
        this.client = new S3Client(options);
    }

    async exists(key: string): Promise<boolean> {
        return await this.client.exists(key);
    }

    async deleteObject(key: string): Promise<void> {
        return await this.client.deleteObject(key);
    }

    async copyFile(source: string, key: string): Promise<void> {
        using fp = await Deno.open(source, { read: true });
        const contentType = key.endsWith('.json') ? 'application/json' : 'application/octet-stream';
        await this.client.putObject(key, fp.readable, {
            metadata: {
                'Content-Type': contentType,
            },
        });
    }
}

const sinks: Record<string, Sink> = {};
const tempDirs: Record<string, string> = {};

export async function s3Setup(s3sink: string): Promise<boolean> {
    if (!(s3sink in sinks)) {
        sinks[s3sink] = new Sink(s3sink);
        tempDirs[s3sink] = await Deno.makeTempDir();
        return await sinks[s3sink].exists('robots.txt');
    }
    return true;
}

export async function s3Cleanup(): Promise<void> {
    for (const name in sinks) {
        await Deno.remove(tempDirs[name], { recursive: true });
    }
}

export async function s3ObjectDelete(s3sink: string, pathname: string): Promise<void> {
    if (s3sink in sinks) {
        const noslash = pathname.startsWith('/') ? pathname.substring(1) : pathname;
        await sinks[s3sink].deleteObject(noslash);
    }
}

export async function s3ObjectExists(s3sink: string, pathname: string): Promise<boolean> {
    if (s3sink in sinks) {
        const noslash = pathname.startsWith('/') ? pathname.substring(1) : pathname;
        return await sinks[s3sink].exists(noslash);
    }
    return false;
}

export async function s3FileMove(s3sink: string, source: string, destination: string): Promise<void> {
    if (s3sink in sinks) {
        const noslash = destination.startsWith('/') ? destination.substring(1) : destination;
        await sinks[s3sink].copyFile(source, noslash);
        await Deno.remove(source, { recursive: true });
    }
}

export async function s3FileCopy(s3sink: string, source: string, destination: string): Promise<void> {
    if (s3sink in sinks) {
        const noslash = destination.startsWith('/') ? destination.substring(1) : destination;
        await sinks[s3sink].copyFile(source, noslash);
    }
}

export function getS3sink(ctx: MigrationContext, host: string): string | undefined {
    const s3sink = ctx.hosts[host]?.s3sink;
    if (s3sink && (s3sink in sinks)) {
        return s3sink;
    }
    return undefined;
}

export function getS3dir(name: string): string | undefined {
    return tempDirs[name];
}
