import * as v8 from 'v8';
import * as fs from 'fs';
import betterSqlLite3 from 'better-sqlite3';
import {
  InternalHasteMap,
  Persistence,
  FileData,
  FileMetaData,
  ModuleMapItem,
  FileCrawlData,
  FilePersistenceData,
} from '../types';
import H from '../constants';

class SQLitePersistence implements Persistence {
  findFilePathsBasedOnPattern(cachePath: string, pattern: string | RegExp): Array<string> {
    // Get database, throw if does not exist.
    const db = this.getDatabase(cachePath, true);

    // db.function('regexp', (pattern: string, data: string): boolean => {
    //   if(data.match(pattern)) {
    //     return true;
    //   }
    //   return false;
    // });

    // Fetch files.
    const filesArr: Array<string> = db.prepare(`SELECT filePath FROM files where filePath LIKE ?`).all(pattern);

    return filesArr;
  }

  createFilePersistenceData(cachePath: string, fileCrawlData: FileCrawlData): FilePersistenceData {
    const {changedFiles, removedFiles, isFresh} = fileCrawlData;

    const filePersistenceData = {
      isFresh,
      removedFiles,
      changedFiles: new Map<string, FileMetaData>(),
    };

    if(isFresh) {
      for(const [changedFilePath, changedFile] of changedFiles) {
        const newFileMetadata: FileMetaData = [
          '',
          changedFile.mtime,
          changedFile.size,
          0,
          '',
          changedFile.sha1,         
        ];
        filePersistenceData.changedFiles.set(changedFilePath, newFileMetadata);
      }
    }
    else {
      for(const [changedFilePath, changedFile] of changedFiles) {
        const existingFiledata = this.getFileMetadata(cachePath, changedFilePath);
        if(existingFiledata && existingFiledata[H.MTIME] == changedFile.mtime) {
          filePersistenceData.changedFiles.set(changedFilePath, existingFiledata);
        } else if (existingFiledata && changedFile.sha1 &&
          existingFiledata[H.SHA1] === changedFile.sha1) {
          const updatedFileMetadata: FileMetaData = [
            existingFiledata[H.ID],
            changedFile.mtime,
            changedFile.size,
            existingFiledata[H.VISITED],
            existingFiledata[H.DEPENDENCIES],
            changedFile.sha1,
          ];
          filePersistenceData.changedFiles.set(changedFilePath, updatedFileMetadata);
        }
        else {
          const newFileMetadata: FileMetaData = [
            '',
            changedFile.mtime,
            changedFile.size,
            0,
            '',
            changedFile.sha1,
            
          ];
          filePersistenceData.changedFiles.set(changedFilePath, newFileMetadata);
        }
      }
    }

    return filePersistenceData;
  }

  writeFileData(cachePath: string, data: FilePersistenceData): void {
    const db = this.getDatabase(cachePath, false);
    const {changedFiles, removedFiles, isFresh} = data;

    db.transaction(() => {
      // Incrementally update files.
      const runFileStmt = (
        stmt: betterSqlLite3.Statement,
        [filePath, file]: [string, FileMetaData],
      ) => {
        stmt.run(
          filePath,
          file[H.ID],
          file[H.MTIME],
          file[H.SIZE],
          file[H.VISITED],
          file[H.DEPENDENCIES],
          file[H.SHA1],
        );
      };
      
      // Remove files as necessary
      if (isFresh) {
        db.exec('DELETE FROM files');
      } else {
        const removeFileStmt = db.prepare(`DELETE FROM files WHERE filePath=?`);
        for (const filePath of removedFiles) {
          removeFileStmt.run(filePath);
        }
      }

      // Upsert changedFiles
      const upsertFileStmt = db.prepare(
        `INSERT OR REPLACE INTO files (filePath, id, mtime, size, visited, dependencies, sha1) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const file of changedFiles) {
        runFileStmt(upsertFileStmt, file);
      }
    })();

    db.close();
  }
  
  getFileMetadata(cachePath:string, filePath: string): FileMetaData | undefined {
    // Get database, throw if does not exist.
    const db = this.getDatabase(cachePath, true);

    // Fetch files.
    const file: {
      filePath: string;
      id: string;
      mtime: number;
      size: number;
      visited: 0 | 1;
      dependencies: string;
      sha1: string;
    } = db.prepare(`SELECT * FROM files WHERE filePath = ?`).get(filePath);

    if(!file) {
      return undefined;
    }

    return [file.id, file.mtime, file.size, file.visited, file.dependencies, file.sha1];
  }

  setFileMetadata(cachePath:string, filePath: string, fileMetadata: FileMetaData) {
    // Get database, throw if does not exist.
    const db = this.getDatabase(cachePath, true);
    
    // Upsert changedFiles
    const upsertFileStmt = db.prepare(
      `INSERT OR REPLACE INTO files (filePath, id, mtime, size, visited, dependencies, sha1) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    
    upsertFileStmt.run(
      filePath,
      fileMetadata[H.ID],
      fileMetadata[H.MTIME],
      fileMetadata[H.SIZE],
      fileMetadata[H.VISITED],
      fileMetadata[H.DEPENDENCIES],
      fileMetadata[H.SHA1],
    );
  }

  deleteFileMetadata(cachePath: string, filePath: string) {
    // Get database, throw if does not exist.
    const db = this.getDatabase(cachePath, true);

    // Fetch files.
    db.prepare(`DELETE FROM files WHERE filePath = ?`).run(filePath);
  }

  readAllFiles(cachePath: string): FileData {
    // Get database, throw if does not exist.
    const db = this.getDatabase(cachePath, true);

    // Fetch files.
    const filesArr: Array<{
      filePath: string;
      id: string;
      mtime: number;
      size: number;
      visited: 0 | 1;
      dependencies: string;
      sha1: string;
    }> = db.prepare(`SELECT * FROM files`).all();

    const fileMap = new Map<string, FileMetaData>();
    for (const file of filesArr) {
      fileMap.set(file.filePath, [
        file.id,
        file.mtime,
        file.size,
        file.visited,
        file.dependencies,
        file.sha1,
      ]);
    }

    return fileMap;
  }

  readInternalHasteMap(cachePath: string): InternalHasteMap {
    // Get database, throw if does not exist.
    const db = this.getDatabase(cachePath, true);

    // Create empty map to populate.
    const internalHasteMap: InternalHasteMap = {
      map: new Map(),
      mocks: new Map(),
      duplicates: new Map(),
      clocks: new Map(),
    };

    // Fetch map.
    const mapsArr: Array<{
      name: string;
      genericPath: string | null;
      genericType: number | null;
      nativePath: string | null;
      nativeType: number | null;
      iosPath: string | null;
      iosType: number | null;
      androidPath: string | null;
      androidType: number | null;
    }> = db.prepare(`SELECT * FROM map`).all();
    for (const map of mapsArr) {
      const mapItem: {[key: string]: [string, number]} = {};
      if (map.genericPath !== null && map.genericType !== null) {
        mapItem[H.GENERIC_PLATFORM] = [map.genericPath, map.genericType];
      }
      if (map.nativePath !== null && map.nativeType !== null) {
        mapItem[H.NATIVE_PLATFORM] = [map.nativePath, map.nativeType];
      }
      if (map.iosPath !== null && map.iosType !== null) {
        mapItem[H.IOS_PLATFORM] = [map.iosPath, map.iosType];
      }
      if (map.androidPath !== null && map.androidType !== null) {
        mapItem[H.ANDROID_PLATFORM] = [map.androidPath, map.androidType];
      }
      internalHasteMap.map.set(map.name, mapItem);
    }

    // Fetch mocks.
    const mocksArr: Array<{
      name: string;
      filePath: string;
    }> = db.prepare(`SELECT * FROM mocks`).all();
    for (const mock of mocksArr) {
      internalHasteMap.mocks.set(mock.name, mock.filePath);
    }

    // Fetch duplicates.
    const duplicatesArr: Array<{
      name: string;
      serialized: string;
    }> = db.prepare(`SELECT * FROM duplicates`).all();
    for (const duplicate of duplicatesArr) {
      internalHasteMap.duplicates.set(name, v8.deserialize(
        new Buffer(duplicate.serialized),
      ) as any);
    }

    // Fetch clocks.
    const clocksArr: Array<{
      relativeRoot: string;
      since: string;
    }> = db.prepare(`SELECT * FROM clocks`).all();
    for (const clock of clocksArr) {
      internalHasteMap.clocks.set(clock.relativeRoot, clock.since);
    }

    // Close database connection,
    db.close();

    return internalHasteMap;
  }

  writeInternalHasteMap(
    cachePath: string,
    internalHasteMap: InternalHasteMap,
    data: FilePersistenceData,
  ): void {
    const db = this.getDatabase(cachePath, false);
    const {changedFiles, removedFiles, isFresh} = data;

    db.transaction(() => {
      // Incrementally update map.
      const runMapStmt = (
        stmt: betterSqlLite3.Statement,
        [name, mapItem]: [string, ModuleMapItem],
      ) => {
        stmt.run(
          name,
          mapItem[H.GENERIC_PLATFORM] || [null, null],
          mapItem[H.NATIVE_PLATFORM] || [null, null],
          mapItem[H.IOS_PLATFORM] || [null, null],
          mapItem[H.ANDROID_PLATFORM] || [null, null],
        );
      };

      if (isFresh) {
        db.exec('DELETE FROM map');
        const insertMapItem = db.prepare(
          `INSERT INTO map (name, genericPath, genericType, nativePath, nativeType, iosPath, iosType, androidPath, androidType) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const mapItem of internalHasteMap.map) {
          runMapStmt(insertMapItem, mapItem);
        }
      } else {
        const removeMapItemStmt = db.prepare(`DELETE FROM map WHERE name=?`);
        for (const file of removedFiles.values()) {
          removeMapItemStmt.run(file[H.ID]);
        }
        const upsertFileStmt = db.prepare(
          `INSERT OR REPLACE INTO map (name, genericPath, genericType, nativePath, nativeType) VALUES (?, ?, ?, ?, ?)`,
        );
        for (const changedFile of changedFiles.values()) {
          if (changedFile[H.MODULE]) {
            const mapItem = internalHasteMap.map.get(changedFile[H.MODULE])!;
            runMapStmt(upsertFileStmt, [changedFile[H.MODULE], mapItem]);
          }
        }
      }

      // Replace mocks.
      db.exec('DELETE FROM mocks');
      const insertMock = db.prepare(
        `INSERT INTO mocks (name, filePath) VALUES (?, ?)`,
      );
      for (const [name, filePath] of internalHasteMap.mocks) {
        insertMock.run(name, filePath);
      }

      // Incrementally update duplicates.
      if (isFresh) {
        db.exec('DELETE FROM duplicates');
        const insertDuplicateStmt = db.prepare(
          `INSERT INTO duplicates (name, serialized) VALUES (?, ?)`,
        );
        for (const [name, duplicate] of internalHasteMap.duplicates) {
          insertDuplicateStmt.run(name, v8.serialize(duplicate));
        }
      } else if (removedFiles.size) {
        const upsertDuplicateStmt = db.prepare(
          `INSERT OR REPLACE INTO duplicates (name, serialized) VALUES (?, ?)`,
        );
        const deleteDuplicateStmt = db.prepare(
          `DELETE FROM duplicates WHERE name=?`,
        );
        for (const file of removedFiles.values()) {
          const moduleID = file[H.ID];
          const duplicate = internalHasteMap.duplicates.get(moduleID);
          if (duplicate) {
            upsertDuplicateStmt.run(name, v8.serialize(duplicate));
          } else {
            deleteDuplicateStmt.run(name);
          }
        }
      }

      // Replace clocks.
      db.exec('DELETE FROM clocks');
      const insertClock = db.prepare(
        `INSERT INTO clocks (relativeRoot, since) VALUES (?, ?)`,
      );
      for (const [relativeRoot, since] of internalHasteMap.clocks) {
        insertClock.run(relativeRoot, since);
      }
    })();

    db.close();
  }

  private getDatabase(cachePath: string, mustExist: boolean) {
    const dbExists = fs.existsSync(cachePath);
    if (dbExists === false && mustExist) {
      throw new Error(`Haste SQLite DB does not exist at ${cachePath}`);
    }

    const db = betterSqlLite3(cachePath, {
      fileMustExist: dbExists,
    });

    if (dbExists === false) {
      db.exec(`CREATE TABLE IF NOT EXISTS files(
        filePath text PRIMARY KEY,
        id text NOT NULL,
        mtime integer NOT NULL,
        size integer NOT NULL,
        visited integer NOT NULL,
        dependencies text NOT NULL,
        sha1 text
      );`);

      db.exec(`CREATE TABLE IF NOT EXISTS map(
        name text NOT NULL,
        genericPath text,
        genericType integer,
        nativePath text,
        nativeType integer,
        iosPath text,
        iosType integer,
        androidPath text,
        androidType integer
      );`);

      db.exec(`CREATE TABLE IF NOT EXISTS mocks(
        name text PRIMARY KEY,
        filePath text NOT NULL
      );`);

      db.exec(`CREATE TABLE IF NOT EXISTS duplicates(
        name text PRIMARY KEY,
        serialized text NOT NULL
      );`);

      db.exec(`CREATE TABLE IF NOT EXISTS clocks(
        relativeRoot text,
        since text
      );`);
    }

    return db;
  }

  getType() {
    return 'sqlite';
  }
}

export default new SQLitePersistence();