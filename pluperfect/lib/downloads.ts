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
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { ConsoleReporter, JsonReporter } from "../../lib/reporter.ts";
import * as path from "jsr:@std/path";
import { ArchiveFileSummary, ArchiveGroupStatus } from "../../lib/archive-status.ts";
import { ContentHostType, StandardLocations, UrlProviderResult } from "../../lib/standards.ts";

/**
 * A simple Either-like interface for an error (left-side) value.
 */
export interface DownloadErrorInfo {
    error?: string;
}

/**
 * Download a file, if required.
 * @param reporter how to report non-error information.
 * @param jreporter JSON structured logger.
 * @param host which host holds the file.
 * @param sourceUrl where to download the file.
 * @param targetFile where to put the file.
 * @param [force=false] if we must download file the even if we have a copy.
 * @param [needHash=true] if we should read the file if it exists to calculate the hash.
 * @returns true if download was successful, false if not.
 */
export async function downloadFile(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    details: UrlProviderResult,
    force: boolean = false,
    needHash: boolean = true
): Promise<ArchiveFileSummary> {
    if (!details.host || !details.pathname || !details.upstream) {
        throw new Deno.errors.NotSupported('upstream, host and pathname must be defined');
    }
    const targetDir = path.dirname(details.pathname);
    let needed = false;
    try {
        const fileInfo = await Deno.lstat(details.pathname)
        if (!fileInfo.isFile || force) {
            await Deno.remove(details.pathname, { recursive: true });
            needed = true;
        }
    } catch (_) {
        needed = true;
    }
    let md5;
    let sha1;
    let sha256;
    const when = Date.now();
    const md5hash = createHash('md5');
    const sha1hash = createHash('sha1');
    const sha256hash = createHash('sha256');

    if (needed) {
        reporter(`fetch(${details.upstream}) > ${details.pathname}`);
        try {
            await Deno.mkdir(targetDir, { recursive: true });
            const output = createWriteStream(details.pathname, {
                flags: 'wx',
                encoding: 'binary'
            });
            const response = await fetch(details.upstream);
            if (!response.ok || !response.body) {
                output.close();
                jreporter({operation: 'downloadFile', action: 'fetch', sourceUrl: details.upstream, filename: details.url.pathname, error: `${response.status}`});
                return {
                    host: details.host,
                    filename: details.url.pathname,
                    status: 'failed',
                    is_readonly: false,
                    when
                };
            }
            for await (const chunk of response.body) {
                md5hash.update(chunk);
                sha1hash.update(chunk);
                sha256hash.update(chunk);
                output.write(chunk);
            }
            md5 = md5hash.digest('hex');
            sha1 = sha1hash.digest('hex');
            sha256 = sha256hash.digest('hex');
            output.close();
        } catch (e) {
            console.error(`Error: unable to save file: ${details.pathname}`);
            jreporter({operation: 'downloadFile', action: 'fetch', sourceUrl: details.upstream, filename: details.url.pathname, error: e});
            return {
                host: details.host,
                filename: details.url.pathname,
                status: 'failed',
                is_readonly: false,
                when
            };
        }
    } else if (needHash) {
        try {
            return new Promise((resolve, reject) => {
                if (!details.host || !details.pathname || !details.upstream) {
                    throw new Deno.errors.NotSupported('upstream, host and pathname must be defined');
                }
                const input = createReadStream(details.pathname);
                input
                    .on('end', () => {
                        if (!details.host || !details.pathname || !details.upstream) {
                            throw new Deno.errors.NotSupported('upstream, host and pathname must be defined');
                        }
                        sha256 = sha256hash.digest('hex');
                        md5 = md5hash.digest('hex');
                        sha1 = sha1hash.digest('hex');
                        jreporter({operation: 'downloadFile', action: 'rehash', sourceUrl: details.upstream, filename: details.url.pathname});
                        resolve ({
                            host: details.host,
                            filename: details.pathname,
                            status: 'complete',
                            is_readonly: false,
                            when,
                            sha256,
                            md5,
                            sha1
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
            console.error(`Error: ${e} unable to read file to compute hashes: ${details.pathname}`);
            jreporter({operation: 'downloadFile', action: 'rehash', sourceUrl: details.upstream, filename: details.url.pathname, error: e});
            return {
                host: details.host,
                filename: details.pathname,
                status: 'failed',
                is_readonly: false,
                when,
            };
        }
    }
    jreporter({operation: 'downloadFile', action: 'existing', sourceUrl: details.upstream, filename: details.url.pathname, needHash, needed });
    return {
        host: details.host,
        filename: details.url.pathname,
        status: 'complete',
        is_readonly: !!details.is_readonly,
        when,
        sha256,
        md5,
        sha1
    };
}


/**
 * Load the status of the downloads.
 * @param statusFilename where the data is persisted.
 * @param slugs list of slugs.
 * @returns map of download status.
 */
//export async function readDownloadStatus(statusFilename: string, slugs: Array<string>): Promise<ArchiveGroupStatus> {
    // const info: ArchiveGroupStatus = { when: 0, map: {} };
    // try {
    //     const contents = await Deno.readTextFile(statusFilename);
    //     const json = JSON.parse(contents);
    //     const original = json as ArchiveGroupStatus;
    //     if (typeof original.when === 'number') {
    //         info.when = original.when;
    //     }
    //     for (const slug of Object.keys(original.map)) {
    //         if ((typeof original.map[slug] === 'object') &&
    //             (typeof original.map[slug]?.status === 'string') &&
    //             (typeof original.map[slug]?.when === 'number') &&
    //             (original.map[slug]?.status !== 'unknown')) {
    //             info.map[slug] = original.map[slug];
    //             if (typeof info.map[slug]?.files !== 'object') {
    //                 info.map[slug].files = {};
    //             }
    //         } else {
    //             info.map[slug] = { status: 'unknown', when: 0, files: {} };
    //         }
    //     }
    // } catch (_) {
    //     slugs.forEach((s) => info.map[s] = { status: 'unknown', when: 0, files: {} });
    // }
    // return info;
// }

/**
 * Persist the download status.
 * @param options command-line options.
 * @param info information about download statuses.
 * @returns true if save ok, false otherwise.
 */
// export async function saveDownloadStatus(statusFilename: string, info: ArchiveGroupStatus, spaces: string = ''): Promise<boolean> {
//     try {
//         const text = JSON.stringify(info, null, spaces);
//         await Deno.writeTextFile(statusFilename, text);
//     } catch (_) {
//         console.error(`Error: unable to save file ${statusFilename}`)
//         return false;
//     }
//     return true;
// }

/**
 * This function is to prevent us reading an existing
 * file in order to recalculate the message digests (hashes). When we
 * use an existing file, we will copy the hashes if necessary, but
 * otherwise use the more recent data.
 * @param existing An optional existing download info.
 * @param recent The most recent download info.
 * @returns merged results.
 */
export function mergeDownloadInfo(existing: undefined | ArchiveFileSummary, recent: ArchiveFileSummary): ArchiveFileSummary {
    const { sha256: exSha256, md5: exMd5, sha1: exSha1 } = existing ?? { };
    const { filename, when, status: nStatus, md5: nMd5, sha256: nSha256, sha1: nSha1 } = recent;
    const sha256 = nSha256 ?? exSha256;
    const md5 = nMd5 ?? exMd5;
    const sha1 = nSha1 ?? exSha1;
    return {
        host: recent.host,
        filename,
        when,
        status: nStatus,
        is_readonly: recent.is_readonly,
        md5,
        sha256,
        sha1
    };
}


/**
 * Download a read-only (zip) file, if required.
 * @param reporter how to log non-error information.
 * @param jreporter JSON structured logger.
 * @param host host where the files live.
 * @param sourceUrl where to download the zip file.
 * @param targetDir where to put the zip file.
 * @param force always download a new copy.
 * @param rehash compute message digests of existing file.
 * @returns information about the download.
 */
// async function downloadZip(
//     reporter: ConsoleReporter,
//     jreporter: JsonReporter,
//     host: ContentHostType,
//     sourceUrl: URL,
//     zipFilename: string,
//     force: boolean,
//     rehash: boolean
// ): Promise<ArchiveFileSummary> {
//     try {
//         await Deno.chmod(zipFilename, 0o644);
//     } catch (_) {
//         // ignored, wait for download to fail.
//     }
//     const info = await downloadFile(reporter, jreporter, host, sourceUrl, zipFilename, force, rehash);
//     try {
//         await Deno.chmod(zipFilename, 0o444);
//         jreporter({operation: 'downloadZip', zipFilename});
//     } catch (e) {
//         jreporter({operation: 'downloadZip', zipFilename, error: e});
//         reporter(`Warning: chmod(${zipFilename}, 0o444) failed`);
//     }
//     return info;
// }

/**
 * Add a cache friendly middle section to a filename.
 * @param name original filename.
 * @param middle the cache stamp middle.
 * @param middleLength how many characters to keep in the middle.
 * @returns 'chunkhash'd filename.
 */
function liveFilename(
    name: string,
    middle: string,
    middleLength: number
): string {
    const center = (middleLength > middle.length) ? middle : middle.substring(0, middleLength);
    const lastDot = name.lastIndexOf('.');
    if (lastDot < 0) {
        return `${name}-${center}`;
    }
    const front = name.substring(0, lastDot);
    const ext = name.substring(lastDot).toLowerCase();
    return `${front}-${center}${ext}`;
}

/**
 * Download a 'live' file. A mutable file that will be downloaded
 * and then renamed based upon its content. Since we do not know
 * the SHA-256 before we download it, we will always download the
 * file. Then the SHA-256 is used to rename the file. If there is
 * a collision, the files contents are assumed to be the same.
 * We preserve the old file when there is a collision in order to
 * keep the old timestamps.
 * @param reporter how to report non-error information.
 * @param jreporter JSON structured logger.
 * @param host where the files live.
 * @param sourceUrl what is to be downloaded.
 * @param targetDir directory part of the target filename.
 * @param originalName original filename part of the URL.
 * @param middleLength number of characters in the 'hash' portion.
 * @returns information about the downloaded file, including its new name.
 */
export async function downloadLiveFile(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    locations: StandardLocations,
    host: ContentHostType,
    sourceUrl: URL,
    targetDir: string,
    originalName: string,
    middleLength: number
): Promise<ArchiveFileSummary> {
    const filename = path.join(targetDir, liveFilename(originalName, 'download', middleLength));
    if (!locations.ctx.hosts[host] || !locations.ctx.hosts[host].baseUrl) {
        throw new Deno.errors.NotSupported(`${host} is not defined in migration context`);
    }
    const details = { host, upstream: sourceUrl.toString(), filename, url: sourceUrl };
    const info = await downloadFile(reporter, jreporter, details, true);
    if (middleLength === 0) {
        jreporter({operation: 'downloadLiveFile', filename});
        return info;
    }
    if ((info.status === 'complete') && (typeof info.sha256 === 'string')) {
        const finalName = path.join(targetDir, liveFilename(originalName, info.sha256, middleLength));
        const updated = { ... info };
        updated.filename = finalName;
        try {
            // a rename would keep the new file, we want to keep the old one
            await Deno.lstat(finalName);
            // if we make it here, we don't need the file we just downloaded
            await Deno.remove(filename, { recursive: true });
        } catch (_) {
            // (at least when the lstat was executed the file didn't exist, so rename)
            try {
                await Deno.rename(filename, finalName);
                jreporter({operation: 'downloadLiveFile', finalName});
            } catch (_) {
                // ignore second failure
            }
        }
        return updated;
    }
    return info;
}

/**
 * Download a Meta-data JSON file, and perform a transform to convert it
 * from "legacy" format. Both formats are maintained on disk.
 * @param reporter how to report non-error information.
 * @param jreporter JSON structured logger.
 * @param host where the files live.
 * @param metaDir directory where to put the output.
 * @param filename name of the output file.
 * @param url source URL.
 * @param force true to force a download, false keeps any existing file
 * @param spaces JSON stringify spaces.
 * @param migrate function to map legacy to "modern" items.
 * @returns JSON parsed data from legacy format.
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
    migrate: (original: T) => T
): Promise<[ T, T ]> {
    try {
        if (force) {
            await Deno.remove(migratedJson, { recursive: true });
            await Deno.remove(legacyJson, { recursive: true });
        }
        await Deno.lstat(migratedJson);
        const contents = await Deno.readTextFile(legacyJson);
        const json = JSON.parse(contents);
        jreporter({operation: 'downloadMetaLegacyJson', action: 'read', host, url: url.toString(), migratedJson, legacyJson})
        return json;
    } catch (_) {
        reporter(`fetch(${url}) > ${legacyJson}`);
        try {
            const response = await fetch(url);
            if (!response.ok) {
                const error = { error: `${response.status} ${response.statusText}` } as unknown as T;
                reporter(`fetch failed: ${error}`);
                jreporter({operation: 'downloadMetaLegacyJson', action: 'fetch', host, url: url.toString(), migratedJson, legacyJson, error})
                return [ error, error ] ;
            }
            const raw = await response.json();
            const rawText = JSON.stringify(raw, null, spaces);
            const migrated = migrate(raw);
            const migratedText = JSON.stringify(migrated, null, spaces);
            const metaDir = path.dirname(migratedJson);
            await Deno.mkdir(metaDir, { recursive: true });
            await Deno.writeTextFile(migratedJson, migratedText);
            await Deno.writeTextFile(legacyJson, rawText);
            jreporter({operation: 'downloadMetaLegacyJson', action: 'fetch', host, url: url.toString(), migratedJson, legacyJson})
            return [ raw, migrated ];
        } catch (e) {
            jreporter({operation: 'downloadMetaLegacyJson', action: 'fetch', host, url: url.toString(), migratedJson, legacyJson, error: e})
            const error = { error: e } as unknown as T;
            return [ error, error ] ;
        }
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
    spaces: string
): Promise<unknown> {
    const metaDir = path.dirname(jsonFilename);
    await Deno.mkdir(metaDir, { recursive: true });

    try {
        if (force) {
            await Deno.remove(jsonFilename, { recursive: true });
        }
        const contents = await Deno.readTextFile(jsonFilename);
        const json = JSON.parse(contents);
        jreporter({operation: 'downloadMetaJson', action: 'read', host, url: url.toString(), jsonFilename})
        return json;
    } catch (_) {
        reporter(`fetch(${url}) > ${jsonFilename}`);
        try {
            const response = await fetch(url);
            if (!response.ok) {
                const error = `${response.status} ${response.statusText}`;
                reporter(`fetch failed: ${error}`);
                jreporter({operation: 'downloadMetaJson', action: 'fetch', host, url: url.toString(), jsonFilename, error});
                return { error };
            }
            const raw = await response.json();
            const rawText = JSON.stringify(raw, null, spaces);
            await Deno.writeTextFile(jsonFilename, rawText);
            jreporter({operation: 'downloadMetaJson', action: 'fetch', host, url: url.toString(), jsonFilename})
            return raw;
        } catch (e) {
            jreporter({operation: 'downloadMetaJson', action: 'fetch', host, url: url.toString(), error: e});
            return { error: e };
        }
    }
}


