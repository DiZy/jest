import serializer from 'jest-serializer';
import {InternalHasteMap, Persistence, FileData, FileCrawlData, FileMetaData, FilePersistenceData} from '../types';
import { H } from '..';

class FilePersistence implements Persistence {
  readInternalHasteMap(cachePath: string): InternalHasteMap {
    return serializer.readFileSync(cachePath).internalHasteMap;
  }

  readAllFiles(cachePath: string): FileData {
    return serializer.readFileSync(cachePath).files;
  }

  writeFileData(cachePath: string, data: FileCrawlData): FilePersistenceData {

    const {isFresh, removedFiles, changedFiles} = data;

    const internalHasteMap = this.readInternalHasteMap(cachePath);

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
      serializer.writeFileSync(cachePath, {internalHasteMap, changedFiles});
    }
    else {
      const files = this.readAllFiles(cachePath);
      for(const [removedFilePath] of removedFiles) {
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
    }
    return filePersistenceData;    
  }

  writeInternalHasteMap(
    cachePath: string,
    internalHasteMap: InternalHasteMap,
    _fileData: FilePersistenceData): void {

    const files = this.readAllFiles(cachePath);
    serializer.writeFileSync(cachePath, {internalHasteMap, files});
  }

  getType() {
    return 'file';
  }
}

export default new FilePersistence();