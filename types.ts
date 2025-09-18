export interface TikTokVideo {
  id: string;
  webVideoUrl: string;
  text: string; // Changed from 'desc' to 'text' to match API response
  createTime: number;
  createTimeISO: string;
  authorMeta: {
    name: string;
    nickName: string;
    avatar: string; // Added avatar field
  };
  diggCount: number;
  commentCount: number;
  shareCount: number;
  playCount: number;
  videoMeta: {
    duration: number;
    height: number;
    width: number;
  };
  musicMeta: {
    musicName: string;
    musicAuthor: string;
    musicOriginal: boolean;
  };
}

export type ScanType = 'basic' | 'advanced';

export type TranscriptState = {
  [videoUrl: string]: {
    status: 'idle' | 'matched' | 'loading' | 'success' | 'error';
    text: string;
  };
};

export type TranscriptCache = {
  [videoUrl: string]: string;
};
