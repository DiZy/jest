/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import micromatch = require('micromatch');
import {replacePathSepForGlob} from 'jest-util';
import {Config} from '@jest/types';
import {FileData, FileMetaData, FileCrawlData, FilePersistenceData, InternalHasteMap, WatchmanClocks, DuplicatesIndex, ModuleMapItem} from './types';
import * as fastPath from './lib/fast_path';
import H from './constants';
import HasteFS from './HasteFS';
import FilePersistence from './persistence/FilePersistence';

export default class DefaultHasteFS implements HasteFS {
  private readonly _rootDir: Config.Path;
  private _hasteMap: InternalHasteMap;
  private readonly _cachePath: Config.Path;

  constructor({rootDir, initialHasteMap, cachePath}: {rootDir: Config.Path; initialHasteMap: InternalHasteMap; cachePath: Config.Path}) {
    this._rootDir = rootDir;
    this._hasteMap = initialHasteMap;
    this._cachePath = cachePath;
  }

  readInternalHasteMap(): InternalHasteMap {
    return this._hasteMap;
  }

  getClocks(): WatchmanClocks {
    return this._hasteMap.clocks;
  }

  setClocks(clocks: WatchmanClocks): void {
    this._hasteMap.clocks = clocks;
  }

  getDuplicates(): DuplicatesIndex {
    return this._hasteMap.duplicates;
  }
  
  setDuplicates(duplicates: DuplicatesIndex): void {
    this._hasteMap.duplicates = duplicates;
  }

  getFromModuleMap(moduleName: string): ModuleMapItem | undefined {
    return this._hasteMap.map.get(moduleName);
  }

  setInModuleMap(moduleName: string, moduleMapItem: ModuleMapItem): void {
    this._hasteMap.map.set(moduleName, moduleMapItem);
  }

  deleteFromModuleMap(moduleName: string, platform?: string): void {
    if (platform && this._hasteMap.map.get(moduleName) && Object.keys(this._hasteMap.map.get(moduleName)!).includes(platform)) {
      delete this._hasteMap.map.get(moduleName)![platform];
    }

    if(this._hasteMap.map.get(moduleName) && Object.keys(this._hasteMap.map.get(moduleName)!).length === 0) {
      this._hasteMap.map.delete(moduleName);
    }
  }

  deleteFromMocks(mockName: string): void {
    this._hasteMap.mocks.delete(mockName);
  }

  getMock(mockPath: string): string | undefined{
    return this._hasteMap.mocks.get(mockPath);
  }

  setMock(mockPath: string, relativeFilePath: string): void {
    this._hasteMap.mocks.set(mockPath, relativeFilePath);
  }

  clearModuleMap(): void {
    this._hasteMap.map = new Map();
  }

  clearMocks(): void {
    this._hasteMap.mocks = new Map();
  }

  createFilePersistenceData(fileCrawlData: FileCrawlData): FilePersistenceData {
    return FilePersistence.createFilePersistenceData(this._cachePath, fileCrawlData, this._hasteMap.files);
  }

  updateFileData(filePersistenceData: FilePersistenceData) {
    try {
      this._hasteMap.files = filePersistenceData.finalFiles!;
    } catch {
      throw new Error("FilePersistence updateFileData was called without finalFiles");
    }
  }

  persist(): void {
    FilePersistence.persist(this._cachePath, this._hasteMap);
  }

  setFileMetadata(filePath: string, fileMetadata: FileMetaData): void {
    const relativePath = this._convertToRelativePath(filePath);
    this._hasteMap.files.set(relativePath, fileMetadata);
  }

  deleteFileMetadata(filePath: string): void {
    const relativePath = this._convertToRelativePath(filePath);
    this._hasteMap.files.delete(relativePath);
  }

  getModuleName(file: Config.Path): string | null {
    const fileMetadata = this.getFileMetadata(file);
    return (fileMetadata && fileMetadata[H.ID]) || null;
  }

  getSize(file: Config.Path): number | null {
    const fileMetadata = this.getFileMetadata(file);
    return (fileMetadata && fileMetadata[H.SIZE]) || null;
  }

  getDependencies(file: Config.Path): Array<string> | null {
    const fileMetadata = this.getFileMetadata(file);

    if (fileMetadata) {
      return fileMetadata[H.DEPENDENCIES]
        ? fileMetadata[H.DEPENDENCIES].split(H.DEPENDENCY_DELIM)
        : [];
    } else {
      return null;
    }
  }

  getSha1(file: Config.Path): string | null {
    const fileMetadata = this.getFileMetadata(file);
    return (fileMetadata && fileMetadata[H.SHA1]) || null;
  }

  exists(file: Config.Path): boolean {
    return this.getFileMetadata(file) != null;
  }

  getAllFilesMap(): FileData {
    return this._hasteMap.files;
  }

  getAllFiles(): Array<Config.Path> {
    return Array.from(this.getAbsoluteFileIterator());
  }

  getFileIterator(): Iterable<Config.Path> {
    return this._hasteMap.files.keys();
  }

  *getAbsoluteFileIterator(): Iterable<Config.Path> {
    for (const file of this.getFileIterator()) {
      yield fastPath.resolve(this._rootDir, file);
    }
  }

  matchFilesBasedOnRelativePath(pattern: RegExp | string): Array<Config.Path> {
    if (!(pattern instanceof RegExp)) {
      pattern = new RegExp(pattern);
    }
    const files = [];
    for (const file of this._hasteMap.files.keys()) {
      if (pattern.test(file)) {
        const filePath = fastPath.resolve(this._rootDir, file);
        files.push(filePath);
      }
    }
    return files;
  }

  matchFiles(pattern: RegExp | string): Array<Config.Path> {
    if (!(pattern instanceof RegExp)) {
      pattern = new RegExp(pattern);
    }
    const files = [];
    for (const file of this.getAbsoluteFileIterator()) {
      if (pattern.test(file)) {
        files.push(file);
      }
    }
    return files;
  }

  matchFilesWithGlob(
    globs: Array<Config.Glob>,
    root: Config.Path | null,
  ): Set<Config.Path> {
    const files = new Set<string>();
    for (const file of this.getAbsoluteFileIterator()) {
      const filePath = root ? fastPath.relative(root, file) : file;
      if (micromatch([replacePathSepForGlob(filePath)], globs).length > 0) {
        files.add(file);
      }
    }
    return files;
  }

  getFileMetadata(file: Config.Path): FileMetaData | undefined {
    const relativePath = this._convertToRelativePath(file);
    return this._hasteMap.files.get(relativePath);
  }

  private _convertToRelativePath(file: Config.Path): Config.Path {
    if(file.includes(this._rootDir)) {
      return fastPath.relative(this._rootDir, file);
    }
    return file;
  }
}
