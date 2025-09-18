import { TikTokVideo } from '../types';

// Updated to use the user-provided actor ID
const APIFY_BASE_URL = 'https://api.apify.com/v2/acts/0FXVyOXXEmdGcV88a/run-sync-get-dataset-items';

export const fetchTikTokData = async (apifyToken: string, tiktokUrl: string, limit: number): Promise<TikTokVideo[]> => {
  if (!apifyToken) {
    throw new Error('Apify API Token is required.');
  }
  if (!tiktokUrl) {
    throw new Error("TikTok Channel URL is required.");
  }

  let profileName = tiktokUrl.trim();
  try {
      const urlObject = new URL(tiktokUrl);
      const pathParts = urlObject.pathname.split('/').filter(part => part && part.startsWith('@'));
      if (pathParts.length > 0) {
          profileName = pathParts[0].substring(1);
      }
  } catch (e) {
      if (profileName.startsWith('@')) {
        profileName = profileName.substring(1);
      }
  }

  const url = `${APIFY_BASE_URL}?token=${apifyToken}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      "profiles": [profileName],
      "resultsPerPage": limit,
      "profileScrapeSections": ["videos"],
      "profileSorting": "latest",
      "excludePinnedPosts": false,
      "shouldDownloadVideos": false,
      "shouldDownloadCovers": false,
      "shouldDownloadSubtitles": false,
      "shouldDownloadSlideshowImages": false,
      "shouldDownloadAvatars": false,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Apify API Error: ${errorData.error?.message || response.statusText}`);
  }

  const rawData = await response.json();
  
  if (!Array.isArray(rawData)) {
    throw new Error("Apify returned an unexpected data format.");
  }

  // Safely map the raw data to our structured TikTokVideo type
  // This prevents crashes if the API response is missing fields and captures all data.
  const mappedData: TikTokVideo[] = rawData.map((item: any) => ({
    id: item.id ?? item.webVideoUrl ?? `fallback-${Math.random()}`, // Use URL as fallback ID
    webVideoUrl: item.webVideoUrl ?? '',
    text: item.text ?? '', // Correctly map 'text' from JSON
    createTime: item.createTime ?? 0,
    createTimeISO: item.createTimeISO ?? new Date(0).toISOString(),
    authorMeta: {
      name: item.authorMeta?.name ?? 'Unknown',
      nickName: item.authorMeta?.nickName ?? item.authorMeta?.name ?? 'Unknown', // Fallback nickname to name
      avatar: item.authorMeta?.avatar ?? '', // Map avatar URL
    },
    diggCount: item.diggCount ?? 0,
    commentCount: item.commentCount ?? 0,
    shareCount: item.shareCount ?? 0,
    playCount: item.playCount ?? 0,
    videoMeta: {
      duration: item.videoMeta?.duration ?? 0,
      height: item.videoMeta?.height ?? 0,
      width: item.videoMeta?.width ?? 0,
    },
    musicMeta: {
      musicName: item.musicMeta?.musicName ?? 'N/A',
      musicAuthor: item.musicMeta?.musicAuthor ?? 'N/A',
      musicOriginal: item.musicMeta?.musicOriginal ?? false,
    },
  }));
  
  return mappedData;
};