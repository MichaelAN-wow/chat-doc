export type LibraryFile = {
  documentId: string;
  title: string;
  size: number;
  mimeType: string;
  updatedAt: string;
};

export type LibrarySession = {
  id: string;
  documentId: string;
  title: string;
  folderId: string | null;
  updatedAt: string;
};

export type LibraryFolder = {
  id: string;
  name: string;
  createdAt: string;
};

export type LibraryState = {
  files: LibraryFile[];
  sessions: LibrarySession[];
  folders: LibraryFolder[];
  collapsedFolderIds: string[];
};
