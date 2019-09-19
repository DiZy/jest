/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {Config} from '@jest/types';
import { FileMetaData, FileCrawlData, FilePersistenceData, FileData, WatchmanClocks, DuplicatesIndex, ModuleMapItem, InternalHasteMap, DuplicatesSet } from './types';

export default interface HasteFS {

  getFullInternalHasteMap(): InternalHasteMap;

  createFilePersistenceData(fileCrawlData: FileCrawlData): FilePersistenceData;

  updateFileData(filePersistenceData: FilePersistenceData): void;

  persist(): void;

  getModuleName: (file: Config.Path) => string | null;

  getFileMetadata(filePath: string): FileMetaData | undefined;

  getSize: (file: Config.Path) => number | null;

  getDependencies: (file: Config.Path) => Array<string> | null;

  getSha1: (file: Config.Path) => string | null;

  exists: (file: Config.Path) => boolean;

  getAllFilesMap(): FileData;

  getAllFiles: () => Array<Config.Path>;

  getFileIterator: () => Iterable<Config.Path>;

  getAbsoluteFileIterator: () => Iterable<Config.Path>;
  
  setFileMetadata(filePath: string, fileMetadata: FileMetaData): void;

  deleteFileMetadata(filePath: string): void;

  matchFiles: (pattern: RegExp | string) => Array<Config.Path>;

  matchFilesBasedOnRelativePath: (pattern: RegExp | string) => Array<Config.Path>;

  matchFilesWithGlob: (
    globs: Array<Config.Glob>,
    root: Config.Path | null,
  ) => Set<Config.Path>;

  getClocks: () => WatchmanClocks;

  setClocks(clocks: WatchmanClocks): void;

  getAllDuplicates: () => DuplicatesIndex;

  getDuplicate(name: string): Map<string, DuplicatesSet> | undefined;

  setDuplicate(name: string, dups: Map<string, DuplicatesSet>): void;

  deleteDuplicate(name: string): void;

  getFromModuleMap(moduleName: string): ModuleMapItem | undefined;

  setInModuleMap(moduleName: string, moduleMapItem: ModuleMapItem): void;

  deleteFromModuleMap(moduleName: string, platform?: string): void;

  deleteFromMocks(mockName: string): void;

  getMock(mockPath: string): string | undefined;

  setMock(mockPath: string, relativeFilePath: string): void;

  clearModuleMap(): void;

  clearMocks(): void;

  copyHasteMap(): void;
}
