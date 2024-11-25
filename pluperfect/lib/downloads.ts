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

/// <reference types="npm:@types/node" />
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { ConsoleReporter, JsonReporter } from '../../lib/reporter.ts';
import * as path from 'jsr:@std/path';
import type { ArchiveFileSummary, LiveFileSummary } from '../../lib/archive-status.ts';
import {
    type ContentHostType,
    hasPathname,
    type LiveUrlProviderResult,
    type MigrationContext,
    type StandardConventions,
    toPathname,
    type UrlProviderResult,
} from '../../lib/standards.ts';
import { getFilesKey } from '../pluperfect.ts';
import { getS3dir, getS3sink, s3FileMove, s3ObjectDelete, s3ObjectExists } from './s3files.ts';
import { liveFilename } from '../../lib/migration.ts';

/**
 * A simple Either-like interface for an error (left-side) value.
 */
export interface DownloadErrorInfo {
    error?: string;
}

/**
 * determine if download is needed. has side-effects.
 * @param details upstream url and downstream pathname.
 * @param ctx bag of information used to convert urls.
 * @param force should we remove the files before we start.
 * @param needHash do we need to recalculate hashes (forces a re-download on S3)
 * @returns
 */
async function isDownloadNeeded(
    details: UrlProviderResult,
    ctx: MigrationContext,
    force: boolean,
    needHash: boolean,
): Promise<boolean> {
    // if we don't keep a local copy, we don't download one.
    if (!hasPathname(ctx, details)) {
        return false;
    }
    if (!details.relative || !details.host) {
        throw new Deno.errors.NotSupported('details.relative and details.host must be defined');
    }
    const s3sink = getS3sink(ctx, details.host);
    if (s3sink) {
        if (force || needHash) {
            await s3ObjectDelete(s3sink, details.relative);
        }
        const exists = await s3ObjectExists(s3sink, details.relative);
        return !exists;
    }

    let needed = false;
    const pathname = toPathname(ctx, details);
    try {
        const fileInfo = await Deno.lstat(pathname);
        if (!fileInfo.isFile || force) {
            await Deno.remove(pathname, { recursive: true });
            needed = true;
        }
    } catch (_) {
        needed = true;
    }
    return needed;
}

/**
 * attempt to download a remote resource to a local file.
 * @param jreporter how to report structured JSON.
 * @param ctx bag of information used to convert urls.
 * @param details upstream url and downstream pathname.
 * @returns details about the downloaded file, including hashes if complete.
 */
async function fetchFile(
    jreporter: JsonReporter,
    ctx: MigrationContext,
    details: UrlProviderResult,
): Promise<ArchiveFileSummary> {
    if (!details.host || !details.relative || !details.upstream) {
        throw new Deno.errors.NotSupported('upstream, host and pathname must be defined');
    }
    const filesKey = getFilesKey(details.host, details.relative);

    let targetDir;
    let pathname;
    const s3sink = getS3sink(ctx, details.host);
    if (s3sink) {
        targetDir = getS3dir(s3sink);
        if (!targetDir) {
            throw new Deno.errors.BadResource(`temporary directory for s3sink ${s3sink} must be defined`);
        }
        const fetchDir = await Deno.makeTempDir({ dir: targetDir });
        pathname = path.join(fetchDir, path.basename(details.relative));
    } else {
        pathname = toPathname(ctx, details);
        targetDir = path.dirname(pathname);
        await Deno.mkdir(targetDir, { recursive: true });
    }

    const when = Date.now();
    const md5hash = createHash('md5');
    const sha1hash = createHash('sha1');
    const sha256hash = createHash('sha256');

    jreporter({
        operation: 'downloadFile',
        action: 'fetch',
        sourceUrl: details.upstream,
        filename: pathname,
    });

    using fp = await Deno.open(pathname, { read: true, write: true, createNew: true });
    const output = fp.writable.getWriter();
    await output.ready;
    const response = await fetch(details.upstream);
    if (!response.ok || !response.body) {
        await output.close();
        const error = `${response.status} ${response.statusText}`;
        jreporter({
            operation: 'downloadFile',
            action: 'fetch',
            status: 'failed',
            sourceUrl: details.upstream,
            filename: pathname,
            error,
        });
        try {
            await Deno.remove(path.dirname(pathname), { recursive: true });
        } catch (_) {
            // ignore any errors
        }
        return {
            key: filesKey,
            status: 'failed',
            is_readonly: false,
            when,
        };
    }
    for await (const chunk of response.body) {
        md5hash.update(chunk);
        sha1hash.update(chunk);
        sha256hash.update(chunk);
        output.write(chunk);
    }
    const md5 = md5hash.digest('hex');
    const sha1 = sha1hash.digest('hex');
    const sha256 = sha256hash.digest('hex');
    await output.close();
    if (details.is_readonly) {
        await Deno.chmod(pathname, 0o444);
    }
    if (s3sink) {
        jreporter({ operation: 's3FileMove', s3sink, pathname, destination: details.relative });
        await s3FileMove(s3sink, pathname, details.relative);
        try {
            await Deno.remove(path.dirname(pathname), { recursive: true });
        } catch (_) {
            // ignore any errors
        }
    }
    return {
        key: filesKey,
        status: 'complete',
        is_readonly: !!details.is_readonly,
        when,
        md5,
        sha1,
        sha256,
    };
}

/**
 * read a previously downloaded file to calculate its message
 * digests (hashes). They are md5, sha1 and sha256 currently.
 * @param jreporter how to report structured JSON
 * @param ctx bag of information used to convert urls.
 * @param details upstream url and downstream pathname.
 * @returns summary data including message digests (md5, sha1, and sha256)
 */
async function recalculateHashes(
    jreporter: JsonReporter,
    ctx: MigrationContext,
    details: UrlProviderResult,
): Promise<ArchiveFileSummary> {
    if (!details.host || !details.relative || !details.upstream) {
        throw new Deno.errors.NotSupported('upstream, host and relative must be defined');
    }

    const pathname = toPathname(ctx, details);
    const filesKey = getFilesKey(details.host, details.relative);

    const when = Date.now();
    const md5hash = createHash('md5');
    const sha1hash = createHash('sha1');
    const sha256hash = createHash('sha256');
    let md5;
    let sha1;
    let sha256;

    try {
        return await new Promise((resolve, reject) => {
            if (!details.host || !details.relative || !details.upstream) {
                throw new Deno.errors.NotSupported('upstream, host and relative must be defined');
            }
            const input = createReadStream(pathname);
            input
                .on('end', () => {
                    if (!details.host || !details.relative || !details.upstream) {
                        throw new Deno.errors.NotSupported('upstream, host and pathname must be defined');
                    }
                    sha256 = sha256hash.digest('hex');
                    md5 = md5hash.digest('hex');
                    sha1 = sha1hash.digest('hex');
                    jreporter({
                        operation: 'downloadFile',
                        action: 'rehash',
                        sourceUrl: details.upstream,
                        filename: details.relative,
                    });
                    resolve({
                        key: filesKey,
                        status: 'complete',
                        is_readonly: !!details.is_readonly,
                        when,
                        sha256,
                        md5,
                        sha1,
                    });
                })
                .on('data', (chunk) => {
                    md5hash.update(chunk);
                    sha1hash.update(chunk);
                    sha256hash.update(chunk);
                })
                .on('error', reject);
        });
    } catch (e) {
        console.error(`Error: ${e} unable to read file to compute hashes: ${details.relative}`);
        jreporter({
            operation: 'downloadFile',
            action: 'rehash',
            sourceUrl: details.upstream,
            filename: details.relative,
            error: e,
        });
        return {
            key: filesKey,
            status: 'failed',
            is_readonly: false,
            when,
        };
    }
}

/**
 * Download a file, if required.
 * @param reporter how to report non-error information.
 * @param jreporter JSON structured logger.
 * @param ctx bag of information used to convert urls.
 * @param details upstream url and downstream pathname.
 * @param [force=false] if we must download file the even if we have a copy.
 * @param [needHash=true] if we should read the file if it exists to calculate the hash.
 * @returns true if download was successful, false if not.
 */
export async function downloadFile(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    ctx: MigrationContext,
    details: UrlProviderResult,
    force: boolean = false,
    needHash: boolean = true,
): Promise<ArchiveFileSummary> {
    if (!details.host || !details.relative || !details.upstream) {
        throw new Deno.errors.NotSupported('upstream, host and pathname must be defined');
    }
    const needed = await isDownloadNeeded(details, ctx, force, needHash);
    const when = Date.now();
    const fileKey = getFilesKey(details.host, details.relative);

    if (needed) {
        reporter(`fetch(${details.upstream}) > ${details.relative}`);

        try {
            return await fetchFile(jreporter, ctx, details);
        } catch (e) {
            console.error(`Error: unable to save file: ${details.relative}`, e);
            jreporter({
                operation: 'downloadFile',
                action: 'fetch',
                sourceUrl: details.upstream,
                filename: details.relative,
                error: e,
            });
            return {
                key: fileKey,
                status: 'failed',
                is_readonly: !!details.is_readonly,
                when,
            };
        }
    }
    if (details.is_readonly && hasPathname(ctx, details)) {
        const pathname = toPathname(ctx, details);
        try {
            await Deno.chmod(pathname, 0o444);
        } catch (_) {
            // ignore failure
        }
    }
    if (needHash && hasPathname(ctx, details)) {
        return await recalculateHashes(jreporter, ctx, details);
    }
    jreporter({
        operation: 'downloadFile',
        action: 'existing',
        sourceUrl: details.upstream,
        filename: details.relative,
        needHash,
        needed,
    });
    return {
        key: fileKey,
        status: 'complete',
        is_readonly: !!details.is_readonly,
        when,
    };
}

/**
 * download a temporary live file.
 * @param jreporter how to report structured JSON.
 * @param ctx bag of information used to convert urls.
 * @param details upstream url and downstream pathname.
 * @returns status of file download.
 */
async function fetchTempFile(
    jreporter: JsonReporter,
    ctx: MigrationContext,
    details: LiveUrlProviderResult,
): Promise<ArchiveFileSummary> {
    if (!details.host || !details.upstream) {
        throw new Deno.errors.NotSupported('upstream, and host must be defined');
    }

    let targetDir;
    const s3sink = getS3sink(ctx, details.host);
    if (s3sink) {
        targetDir = getS3dir(s3sink);
        if (!targetDir) {
            throw new Deno.errors.BadResource(`temporary directory for s3sink ${s3sink} must be defined`);
        }
    } else {
        const baseDirectory = ctx.hosts[details.host].baseDirectory;
        if (!baseDirectory) {
            throw new Deno.errors.BadResource(`baseDirectory is not set for host ${details.host}`);
        } else {
            targetDir = path.join(baseDirectory, details.dirname);
            await Deno.mkdir(targetDir, { recursive: true });
        }
    }
    const fetchDir = await Deno.makeTempDir({ dir: targetDir });
    const pathname = path.join(fetchDir, details.filename);

    const when = Date.now();
    const md5hash = createHash('md5');
    const sha1hash = createHash('sha1');
    const sha256hash = createHash('sha256');

    jreporter({
        operation: 'fetchTempFile',
        sourceUrl: details.upstream,
        filename: pathname,
    });

    using fp = await Deno.open(pathname, { read: true, write: true, createNew: true });
    const output = fp.writable.getWriter();
    await output.ready;
    const response = await fetch(details.upstream);
    if (!response.ok || !response.body) {
        await output.close();
        const error = `${response.status} ${response.statusText}`;
        jreporter({
            operation: 'downloadFile',
            action: 'fetch',
            status: 'failed',
            sourceUrl: details.upstream,
            filename: pathname,
            error,
        });
        try {
            await Deno.remove(fetchDir, { recursive: true });
        } catch (_) {
            // ignore any errors
        }
        return {
            key: pathname,
            status: 'failed',
            is_readonly: false,
            when,
        };
    }
    for await (const chunk of response.body) {
        md5hash.update(chunk);
        sha1hash.update(chunk);
        sha256hash.update(chunk);
        output.write(chunk);
    }
    const md5 = md5hash.digest('hex');
    const sha1 = sha1hash.digest('hex');
    const sha256 = sha256hash.digest('hex');
    await output.close();
    return {
        key: pathname,
        status: 'complete',
        is_readonly: false,
        when,
        md5,
        sha1,
        sha256,
    };
}

/**
 * Download a 'live' file. A mutable file that will be downloaded
 * and then renamed based upon its content. Since we do not know
 * the SHA-256 before we download it, we will always download the
 * file. Then the SHA-256 is used to rename the file. If there is
 * a collision, the files contents are assumed to be the same.
 * We preserve the old file when there is a collision in order to
 * keep the old timestamps.
 * @param jreporter JSON structured logger.
 * @param conventions how to get resources.
 * @param host where the files live.
 * @param details upstream url and downstream pathname.
 * @param generation monotonically increasing generation counter.
 * @returns information about the downloaded file, including its new name.
 */
export async function downloadLiveFile(
    jreporter: JsonReporter,
    conventions: StandardConventions,
    host: ContentHostType,
    details: LiveUrlProviderResult,
    generation: number,
    force: boolean,
): Promise<LiveFileSummary> {
    const info = await fetchTempFile(jreporter, conventions.ctx, details);
    if ((info.status === 'complete') && (typeof info.sha256 === 'string')) {
        const relative = path.join(details.dirname, liveFilename(details.filename, info.sha256, conventions.ctx.liveMiddleLength));
        const updated = { ...info } as LiveFileSummary;
        updated.key = getFilesKey(host, relative);
        updated.generation = generation;
        const s3sink = getS3sink(conventions.ctx, host);
        if (s3sink) {
            const exists = await s3ObjectExists(s3sink, relative);
            jreporter({ operation: 'downloadLiveFile', s3sink, pathname: info.key, destination: relative, exists });
            if (!exists || force) {
                try {
                    await s3FileMove(s3sink, info.key, relative);
                    jreporter({ operation: 's3FileMove', s3sink, pathname: info.key, destination: relative });
                } catch (e) {
                    console.error(`s3FileMove failed`, e);
                    jreporter({ operation: 's3FileMove', s3sink, pathname: info.key, destination: relative, error: `${e}` });
                    return {
                        key: info.key,
                        status: 'failed',
                        is_readonly: false,
                        when: updated.when,
                    };
                }
            }
        } else {
            const baseDirectory = conventions.ctx.hosts[host].baseDirectory;
            if (baseDirectory) {
                const finalName = path.join(baseDirectory, relative);
                if (force) {
                    try {
                        await Deno.remove(finalName, { recursive: true });
                        await Deno.rename(info.key, finalName);
                        jreporter({ operation: 'downloadLiveFile', finalName });
                    } catch (e) {
                        console.error(`unable to rename temporary file ${info.key} to ${finalName}`, e);
                        jreporter({ operation: 'downloadLiveFile', finalName, error: `${e}` });
                    }
                } else {
                    try {
                        // a rename would keep the new file, we want to keep the old one
                        await Deno.lstat(finalName);
                        // if we make it here, we don't need the file we just downloaded
                        // it gets removed along with the temp parent directory
                    } catch (_) {
                        // (at least when the lstat was executed the file didn't exist, so rename)
                        try {
                            await Deno.rename(info.key, finalName);
                            jreporter({ operation: 'downloadLiveFile', finalName });
                        } catch (_) {
                            // ignore second failure
                        }
                    }
                }
            }
        }
        try {
            // remove the temp directory
            await Deno.remove(path.dirname(info.key), { recursive: true });
        } catch (_) {
            // ignore any failure
        }
        return updated;
    }
    return info;
}

/**
 * attempt to read the legacy and migrated JSON files locally. This
 * code will throw exceptions, so it needs to be inside a try/catch block.
 * @param legacyJson pathname of the legacy version of the JSON file.
 * @param migratedJson pathname of the migrated version of the JSON file.
 * @param force always remove existing files.
 * @returns tuple of the legacy data and the modern data.
 */
async function readMetaLegacyJson<T extends Record<string, unknown>>(
    legacyJson: string,
    migratedJson: string,
    force: boolean,
): Promise<[T, T]> {
    if (force) {
        await Deno.remove(migratedJson, { recursive: true });
        await Deno.remove(legacyJson, { recursive: true });
    }
    const legacyContents = await Deno.readTextFile(legacyJson);
    const legacy = JSON.parse(legacyContents);
    const migratedContents = await Deno.readTextFile(migratedJson);
    const migrated = JSON.parse(migratedContents);
    return [legacy, migrated];
}

/**
 * attempt to fetch a remote resource and then store it in two
 * files. the first is the legacy format, then a migrate function is
 * executed to convert the data which is then serialized to the migrated
 * JSON file. the "modern" version has our URL's, data filtered, etc.
 * @param legacyJson pathname of the legacy version of the JSON file.
 * @param migratedJson pathname of the migrated version of the JSON file.
 * @param url upstream resource of the legacy data.
 * @param spaces how to expand JSON.
 * @param migrate how to convert from legacy to modern.
 * @returns tuple of the legacy data and the migrated data.
 */
async function fetchMetaLegacyJson<T extends Record<string, unknown>>(
    legacyJson: string,
    migratedJson: string,
    url: URL,
    spaces: string,
    migrate: (original: T) => T,
): Promise<[T, T]> {
    const response = await fetch(url);
    if (!response.ok) {
        const error = { error: `${response.status} ${response.statusText}` } as unknown as T;
        return [error, error];
    }

    const legacy = await response.json();
    const legacyText = JSON.stringify(legacy, null, spaces);
    const migrated = migrate(legacy);
    const migratedText = JSON.stringify(migrated, null, spaces);
    const metaDir = path.dirname(migratedJson);
    await Deno.mkdir(metaDir, { recursive: true });
    await Deno.writeTextFile(migratedJson, migratedText);
    await Deno.writeTextFile(legacyJson, legacyText);

    return [legacy, migrated];
}

/**
 * Download a Meta-data JSON file, and perform a transform to convert it
 * from "legacy" format. Both formats are maintained on disk.
 * @param reporter how to report non-error information.
 * @param jreporter JSON structured logger.
 * @param host where the files live.
 * @param legacyJson pathname to the legacy version of the data.
 * @param migratedJson pathname to the migrated version of the data.
 * @param url source URL.
 * @param force true to force a download, false keeps any existing file
 * @param spaces JSON stringify spaces.
 * @param migrate function to map legacy to "modern" items.
 * @returns tuple of the legacy data and the modern format.
 */
export async function downloadMetaLegacyJson<T extends Record<string, unknown>>(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    host: ContentHostType,
    legacyJson: string,
    migratedJson: string,
    url: URL,
    force: boolean,
    spaces: string,
    migrate: (original: T) => T,
): Promise<[T, T]> {
    try {
        const [legacy, migrated] = await readMetaLegacyJson(legacyJson, migratedJson, force);
        jreporter({ operation: 'downloadMetaLegacyJson', action: 'read', host, url: url.toString(), migratedJson, legacyJson });
        return [legacy as T, migrated as T];
    } catch (_) {
        reporter(`fetch(${url}) > ${legacyJson}`);
        try {
            const [legacy, migrated] = await fetchMetaLegacyJson(legacyJson, migratedJson, url, spaces, migrate);
            if (legacy.error) {
                console.error(`downloadMetaLegacyJson: legacy.error: ${legacy.error}`);
                reporter(`fetch failed: ${legacy.error}`);
                await Deno.remove(legacyJson, { recursive: true });
                jreporter({
                    operation: 'downloadMetaLegacyJson',
                    action: 'fetch',
                    host,
                    url: url.toString(),
                    migratedJson,
                    legacyJson,
                    error: legacy.error,
                });
            } else {
                jreporter({
                    operation: 'downloadMetaLegacyJson',
                    action: 'fetch',
                    host,
                    url: url.toString(),
                    migratedJson,
                    legacyJson,
                });
            }
            return [legacy, migrated];
        } catch (e) {
            jreporter({
                operation: 'downloadMetaLegacyJson',
                action: 'fetch',
                host,
                url: url.toString(),
                migratedJson,
                legacyJson,
                error: `${e}`,
            });
            const error = { error: `${e}` } as unknown as T;
            console.error(`downloadMetaLegacyJson: second catch: ${e}`);
            return [error, error];
        }
    }
}

/**
 * download a JSON file to determine if it has changed compared
 * to the copy already on disk (if any). Returns three values,
 * a flag indicating if the file just downloaded was a change,
 * the legacy copy of the data, and the migrated copy.
 * @param reporter how to report non-error information.
 * @param jreporter JSON structured logger.
 * @param host where the files live.
 * @param legacyJson pathname to the legacy version of the data.
 * @param migratedJson pathname to the migrated version of the data.
 * @param url source URL.
 * @param spaces  JSON stringify spaces.
 * @param migrate function to map legacy to "modern" items.
 * @returns tuple of three values: changed, legacy and migrated.
 */
export async function probeMetaLegacyJson<T extends Record<string, unknown>>(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    host: ContentHostType,
    legacyJson: string,
    migratedJson: string,
    url: URL,
    spaces: string,
    migrate: (original: T) => T,
): Promise<[boolean, T, T]> {
    // first check to see if the files exist, if not, they are changed
    try {
        await Deno.lstat(legacyJson);
        await Deno.lstat(migratedJson);
    } catch (_) {
        // jreporter({operation:'probeMetaLegacyJson', action: 'missing', legacyJson, migratedJson });
        const [legacy, migrated] = await fetchMetaLegacyJson(legacyJson, migratedJson, url, spaces, migrate);
        if (legacy.error) {
            reporter(`fetch failed: ${legacy.error}`);
        }
        jreporter({
            operation: 'probeMetaLegacyJson',
            action: 'fetch',
            host,
            url: url.toString(),
            migratedJson,
            legacyJson,
            error: legacy.error,
        });

        return [true, legacy, migrated];
    }

    // both the files exist, so we download a temporary copy
    let tempLegacy;
    try {
        const metaDir = path.dirname(legacyJson);
        tempLegacy = await Deno.makeTempFile({ dir: metaDir, prefix: 'probe-', suffix: '.json' });
        const [legacy, migrated] = await readMetaLegacyJson(legacyJson, migratedJson, false);
        const tempJson = await downloadMetaJson(reporter, jreporter, host, tempLegacy, url, true, spaces);
        const tempContents = await Deno.readFile(tempLegacy);
        const legacyContents = await Deno.readFile(legacyJson);
        let same = tempContents.length === legacyContents.length;
        if (same) {
            for (let n = 0; n < tempContents.length; n++) {
                same = same && (tempContents.at(n) === legacyContents.at(n));
                if (!same) {
                    // console.error(`probe files differ at(${n}) ${tempContents.at(n)} !== ${legacyContents.at(n)}`);
                    break;
                }
            }
        }
        if (same) {
            await Deno.remove(tempLegacy, { recursive: true });
            jreporter({
                operation: 'probeMetaLegacyJson',
                action: 'same',
                host,
                url: url.toString(),
                migratedJson,
                legacyJson,
            });
            return [false, legacy as T, migrated as T];
        }
        await Deno.remove(legacyJson, { recursive: true });
        const newMigrated = migrate(tempJson as T);
        const newMigratedText = JSON.stringify(newMigrated, null, spaces);
        await Deno.writeTextFile(migratedJson, newMigratedText);
        await Deno.rename(tempLegacy, legacyJson);
        jreporter({
            operation: 'probeMetaLegacyJson',
            action: 'updated',
            host,
            url: url.toString(),
            migratedJson,
            legacyJson,
        });
        return [true, tempJson as T, newMigrated as T];
    } catch (_) {
        // something failed during the upgrade process, so we will
        // just download the file again below
        if (tempLegacy) {
            try {
                // attempt to remove the temporary file if one was created.
                await Deno.remove(tempLegacy, { recursive: true });
            } catch (_) {
                // ignore any errors.
            }
        }
    }
    const [legacy, migrated] = await fetchMetaLegacyJson(legacyJson, migratedJson, url, spaces, migrate);
    jreporter({
        operation: 'probeMetaLegacyJson',
        action: 'refetch',
        host,
        url: url.toString(),
        migratedJson,
        legacyJson,
        error: legacy.error,
    });
    return [true, legacy, migrated];
}

/**
 * attempt to read a JSON meta data file. this code throws exceptions,
 * so it should be inside a try/catch block.
 * @param jsonFilename name of the file on the local filesystem.
 * @param force true to remove the file before we start to force download.
 * @returns parsed JSON contents of the file, or an exception.
 */
async function readMetaJson(
    jsonFilename: string,
    force: boolean,
): Promise<unknown> {
    if (force) {
        await Deno.remove(jsonFilename, { recursive: true });
    }
    const contents = await Deno.readTextFile(jsonFilename);
    const json = JSON.parse(contents);
    return json;
}

/**
 * attempts to fetch a remote resource and store it into a local file.
 * @param jsonFilename where to store the file on the local filesystem.
 * @param url upstream resource to read.
 * @param spaces how to expand JSON.
 * @returns parsed JSON contents of the upstream resource.
 */
async function fetchMetaJson(
    jsonFilename: string,
    url: URL,
    spaces: string,
): Promise<unknown> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            const error = `${response.status} ${response.statusText}`;
            return { error };
        }
        const raw = await response.json();
        const rawText = JSON.stringify(raw, null, spaces);
        const metaDir = path.dirname(jsonFilename);
        await Deno.mkdir(metaDir, { recursive: true });
        await Deno.writeTextFile(jsonFilename, rawText);
        return raw;
    } catch (e) {
        return { error: `${e}` };
    }
}

/**
 * Download a Meta-data JSON file that is maintained in the
 * one format (i.e. no "migration" needed).
 * @param reporter how to report non-error information.
 * @param jreporter JSON structured logger.
 * @param host where the files live.
 * @param jsonFilename name of the output file.
 * @param url source URL.
 * @param force true to force a download, false keeps any existing file
 * @param spaces JSON stringify spaces.
 * @returns JSON parsed data.
 */
export async function downloadMetaJson(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    host: ContentHostType,
    jsonFilename: string,
    url: URL,
    force: boolean,
    spaces: string,
): Promise<unknown> {
    try {
        const json = await readMetaJson(jsonFilename, force);
        jreporter({ operation: 'downloadMetaJson', action: 'read', host, url: url.toString(), jsonFilename });
        return json;
    } catch (_) {
        reporter(`fetch(${url}) > ${jsonFilename}`);
        try {
            const response = await fetchMetaJson(jsonFilename, url, spaces);
            if (response && (typeof response === 'object') && ('error' in response)) {
                reporter(`fetch failed: ${response.error}`);
                await Deno.remove(jsonFilename, { recursive: true });
                jreporter({
                    operation: 'downloadMetaJson',
                    action: 'fetch',
                    host,
                    url: url.toString(),
                    jsonFilename,
                    error: response.error,
                });
            } else {
                jreporter({ operation: 'downloadMetaJson', action: 'fetch', host, url: url.toString(), jsonFilename });
            }
            return response;
        } catch (e) {
            jreporter({ operation: 'downloadMetaJson', action: 'fetch', host, url: url.toString(), error: e });
            return { error: e };
        }
    }
}
