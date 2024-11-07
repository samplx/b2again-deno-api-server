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

import { ContentHostType, ArchiveGroupName } from "./standards.ts";

/**
 * Classification of a download group or file.
 */
export type ArchiveFileStatus = 'unknown' | 'complete' | 'failed' | 'uninteresting';

/**
 * Describes an archive asset.
 */
export interface ArchiveFileSummary {
    /** which host has the content. */
    host: ContentHostType;
    /** relative pathname of the downloaded file. */
    filename: string;
    /** current status. */
    status: ArchiveFileStatus;
    /** true if the file may be out-of-date. */
    is_outdated: boolean;
    /** timestamp of when the status was defined. 0 if unknown/undefined. */
    when?: number;
    /** optional SHA-256 message digest of the file contents as a hex string. */
    sha256?: string;
    /** optional md5 message digest of the file contents as a hex string. */
    md5?: string;
    /** optional SHA-1 message digest of the file contents as a hex string. */
    sha1?: string;
}

/**
 * Describes a group of downloaded files.
 */
export interface ArchiveGroupStatus {
    /** name of the upstream source. */
    source_name: string;
    /** what type of data is this about. */
    section: ArchiveGroupName;
    /** group id. */
    slug: string;
    /** true if the files may be out-of-date. */
    is_outdated: boolean;
    /** true if we have all the known files that we want. */
    is_complete: boolean;
    /** true if we want this archive. */
    is_interesting: boolean;
    /** timestamp of when the status was defined. */
    when: number;
    /** timestamp from when the upstream item was updated. */
    updated?: string;
    /**
     * hash map of key=filename, value = file information
     */
    files: Record<string, ArchiveFileSummary>;
}

/**
 * Summary of information about a group, we remove the bulky `files` field.
 */
export type ArchiveGroupSummary = {
    [Property in keyof ArchiveGroupStatus as Exclude<Property, 'files'>]: ArchiveGroupStatus
}

