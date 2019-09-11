import serializer from 'jest-serializer';
import {InternalHasteMap, Persistence, FileData, FileCrawlData, FileMetaData, FilePersistenceData} from '../types';
import H from '../constants';

class FilePersistence implements Persistence {
  readInternalHasteMap(cachePath: string): InternalHasteMap {
    return serializer.readFileSync(cachePath).internalHasteMap;
  }

  readAllFiles(cachePath: string): FileData {
    try {
      return serializer.readFileSync(cachePath).files;
    }
    catch {
      return new Map<string, FileMetaData>();
    }
  }

  createFilePersistenceData(_cachePath: string, fileCrawlData: FileCrawlData, oldFiles?: FileData): FilePersistenceData {
    const {isFresh, removedFiles, changedFiles} = fileCrawlData;

    const filePersistenceData = {
      isFresh,
      removedFiles,
      changedFiles: new Map<string, FileMetaData>(),
      finalFiles: new Map<string, FileMetaData>(),
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
        filePersistenceData.finalFiles.set(changedFilePath, newFileMetadata);
      }
    }
    else {
      const files = new Map(oldFiles!);
      for(const removedFilePath of removedFiles) {
        files.delete(removedFilePath);
      }
      for(const [changedFilePath, changedFile] of changedFiles) {
        const existingFiledata = files.get(changedFilePath);
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
          files.set(changedFilePath, updatedFileMetadata);
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
          files.set(changedFilePath, newFileMetadata);
          filePersistenceData.changedFiles.set(changedFilePath, newFileMetadata);
        }
      }
      filePersistenceData.finalFiles = files;
    }
    return filePersistenceData;
  }

  writeFileData(cachePath: string, data: FilePersistenceData, hasteMap: InternalHasteMap): void {
    serializer.writeFileSync(cachePath, {internalHasteMap: hasteMap, files: data.finalFiles!});
  }

  writeInternalHasteMap(
    cachePath: string,
    internalHasteMap: InternalHasteMap,
    fileData: FilePersistenceData): void {

    try{ 
      const files = fileData.finalFiles!;
      serializer.writeFileSync(cachePath, {internalHasteMap, files});
    } catch {
      throw new Error("FilePersistence writeInternalHasteMap was called without finalFiles");
    }
  }

  getType() {
    return 'file';
  }
}

export default new FilePersistence();