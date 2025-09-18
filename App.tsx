import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { TikTokVideo, TranscriptState, TranscriptCache } from './types';
import useLocalStorage from './hooks/useLocalStorage';
import { transcribeAudioWithGemini } from './services/geminiService';
import { fetchTikTokData } from './services/apifyService';
import { downloadCsv } from './utils/csvHelper';
import { ScanIcon, DownloadIcon, EyeIcon, EyeOffIcon, InfoIcon, WarningIcon, StopIcon, QuestionMarkCircleIcon } from './components/icons';

type Stage = 'scan' | 'scan-results' | 'match' | 'results';

// Helper to fetch audio from a URL and convert it to Base64
const getBase64FromUrl = async (url: string): Promise<{ base64: string; mimeType: string }> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Network response was not ok, status: ${response.status}`);
    
    const blob = await response.blob();
    const mimeType = blob.type;
    if (!mimeType.startsWith('audio/')) throw new Error(`Fetched file is not an audio file. Type: ${mimeType}`);

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        if (base64) resolve({ base64, mimeType });
        else reject(new Error("Could not convert file to base64."));
      };
      reader.onerror = (error) => reject(error);
    });
  } catch (error) {
    console.error("Error fetching or converting audio:", error);
    throw new Error("Could not fetch audio. This may be a CORS issue. Ensure the audio URL allows cross-origin requests.");
  }
};

const Stepper: React.FC<{ currentStage: Stage }> = ({ currentStage }) => {
    const steps: { id: 'scan' | 'match' | 'results'; title: string }[] = [
        { id: 'scan', title: '1. Quét Kênh' },
        { id: 'match', title: '2. Đối chiếu Âm thanh' },
        { id: 'results', title: '3. Phiên âm & Kết quả' },
    ];
    
    // Map current stage to a visual step ID
    const stageToStepId: Record<Stage, 'scan' | 'match' | 'results'> = {
        'scan': 'scan',
        'scan-results': 'scan', // 'scan-results' is visually part of the 'scan' step
        'match': 'match',
        'results': 'results',
    };
    const currentStepId = stageToStepId[currentStage];
    const currentIdx = steps.findIndex(s => s.id === currentStepId);


    return (
        <nav className="flex items-center justify-center mb-8" aria-label="Progress">
            <ol className="flex items-center space-x-4">
                {steps.map((step, index) => (
                    <li key={step.id}>
                        <div className={`flex items-center text-sm font-medium ${index < currentIdx || currentStage === 'results' ? 'text-blue-600 dark:text-blue-400' : index === currentIdx ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
                           <span className={`flex h-8 w-8 items-center justify-center rounded-full ${index < currentIdx || (index === currentIdx && (currentStage === 'match' || currentStage === 'results')) ? 'bg-blue-600 dark:bg-blue-500 text-white' : index === currentIdx ? 'border-2 border-blue-600 dark:border-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
                                {index + 1}
                           </span>
                           <span className="ml-3 hidden sm:block">{step.title}</span>
                        </div>
                    </li>
                ))}
            </ol>
        </nav>
    );
};

const HelpModal = ({ onClose }) => {
    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4" 
            aria-modal="true" 
            role="dialog"
            onClick={onClose}
        >
            <div 
                className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full p-6 space-y-4"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Hướng dẫn sử dụng</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Close guide">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                    <p>Công cụ này giúp bạn phiên âm hàng loạt video TikTok. Hãy làm theo các bước sau:</p>
                    <ol className="space-y-3">
                        <li>
                            <strong className="font-semibold text-gray-900 dark:text-white">Lấy URL Video & Âm thanh:</strong>
                            <p>Sử dụng một công cụ như "TikTok Media Downloader" trên Apify (hoặc bất kỳ ứng dụng nào khác) để lấy hai danh sách:</p>
                            <ul className="list-disc pl-6 mt-1 space-y-1">
                                <li>Danh sách các URL của video TikTok.</li>
                                <li>Danh sách các URL của file âm thanh (MP3) tương ứng.</li>
                            </ul>
                             <p className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/50 border-l-4 border-yellow-400 dark:border-yellow-500 text-yellow-800 dark:text-yellow-200 rounded-r-md"><span className="font-bold">Quan trọng:</span> Thứ tự của các URL trong hai danh sách phải khớp chính xác với nhau (ví dụ: video ở dòng 1 phải tương ứng với file MP3 ở dòng 1).</p>
                        </li>
                        <li>
                            <strong className="font-semibold text-gray-900 dark:text-white">Đối chiếu URL:</strong>
                            <p>Trong <strong>Bước 2 (Đối chiếu Âm thanh)</strong>, dán hai danh sách URL bạn vừa lấy vào hai ô tương ứng và nhấn "Đối chiếu URL".</p>
                        </li>
                        <li>
                            <strong className="font-semibold text-gray-900 dark:text-white">Chờ AI phiên âm:</strong>
                            <p>Sau khi đối chiếu thành công, chuyển sang <strong>Bước 3 (Phiên âm & Kết quả)</strong>. Hệ thống sẽ tự động bắt đầu quá trình phiên âm. Bạn chỉ cần đợi AI tạo lời thoại cho từng video.</p>
                        </li>
                    </ol>
                </div>
                 <div className="text-right mt-4">
                     <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                        Đã hiểu
                    </button>
                 </div>
            </div>
        </div>
    );
};


const App: React.FC = () => {
  const [stage, setStage] = useState<Stage>('scan');
  
  // --- State Management ---
  const [apifyToken, setApifyToken] = useLocalStorage<string>('apifyToken', '');
  const [geminiApiKey, setGeminiApiKey] = useLocalStorage<string>('geminiApiKey', '');
  const [tiktokUrl, setTiktokUrl] = useState<string>('');
  const [resultsLimit, setResultsLimit] = useState<number>(20);
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>('Sẵn sàng.');
  
  const [videos, setVideos] = useState<TikTokVideo[]>([]);
  const [mp3UrlMap, setMp3UrlMap] = useState<Record<string, string>>({}); // Key: video.webVideoUrl, Value: mp3Url
  
  const [transcriptStates, setTranscriptStates] = useState<TranscriptState>({});
  const [transcriptCache, setTranscriptCache] = useLocalStorage<TranscriptCache>('transcriptCache', {});
  const [isApifyKeyVisible, setIsApifyKeyVisible] = useState(false);
  const [isGeminiKeyVisible, setIsGeminiKeyVisible] = useState(false);
  const [isHelpModalVisible, setIsHelpModalVisible] = useState(false);
  
  // --- Handlers ---
  const handleScan = async () => {
    setIsLoading(true);
    setStatus('Đang quét kênh TikTok...');
    setVideos([]);
    try {
      const data = await fetchTikTokData(apifyToken, tiktokUrl, resultsLimit);
      setVideos(data);
      setStatus(`Quét thành công! Tìm thấy ${data.length} video.`);
      setStage('scan-results'); // <-- Move to the new results display step
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setStatus(`Lỗi: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleStartOver = () => {
    setStage('scan');
    setVideos([]);
    setMp3UrlMap({});
    setTranscriptStates({});
    setStatus('Sẵn sàng.');
  };

  const renderCurrentStage = () => {
    switch (stage) {
      case 'scan':
        return <ScanStep 
            apifyToken={apifyToken} setApifyToken={setApifyToken}
            geminiApiKey={geminiApiKey} setGeminiApiKey={setGeminiApiKey}
            tiktokUrl={tiktokUrl} setTiktokUrl={setTiktokUrl}
            resultsLimit={resultsLimit} setResultsLimit={setResultsLimit}
            handleScan={handleScan} isLoading={isLoading} status={status}
            isApifyKeyVisible={isApifyKeyVisible} setIsApifyKeyVisible={setIsApifyKeyVisible}
            isGeminiKeyVisible={isGeminiKeyVisible} setIsGeminiKeyVisible={setIsGeminiKeyVisible}
        />;
      case 'scan-results':
        return <ScanResultsStep
            videos={videos}
            setStage={setStage}
        />;
      case 'match':
        return <MatchStep 
            videos={videos}
            setMp3UrlMap={setMp3UrlMap}
            setStage={setStage}
        />;
      case 'results':
        return <ResultsStep
            videos={videos} mp3UrlMap={mp3UrlMap}
            transcriptStates={transcriptStates} setTranscriptStates={setTranscriptStates}
            transcriptCache={transcriptCache} setTranscriptCache={setTranscriptCache}
            handleStartOver={handleStartOver}
            geminiApiKey={geminiApiKey}
        />;
      default:
        return <div>Invalid stage</div>;
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans text-gray-800 dark:text-gray-200 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="relative text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-teal-400">
            TikTok AI Transcriber
          </h1>
          <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">Công cụ 3 bước đơn giản để phiên âm video TikTok.</p>
           <button 
            onClick={() => setIsHelpModalVisible(true)} 
            className="absolute top-0 right-0 flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg shadow-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-900 transition-transform transform hover:scale-105 animate-pulse-slow"
            aria-label="Hiển thị hướng dẫn sử dụng"
           >
            <QuestionMarkCircleIcon />
            <span>Hướng dẫn sử dụng</span>
          </button>
        </header>
        <Stepper currentStage={stage} />
        {renderCurrentStage()}
        {isHelpModalVisible && <HelpModal onClose={() => setIsHelpModalVisible(false)} />}
      </div>
    </div>
  );
};


// --- STAGE 1: SCAN ---
const ScanStep = ({ apifyToken, setApifyToken, geminiApiKey, setGeminiApiKey, tiktokUrl, setTiktokUrl, resultsLimit, setResultsLimit, handleScan, isLoading, status, isApifyKeyVisible, setIsApifyKeyVisible, isGeminiKeyVisible, setIsGeminiKeyVisible }) => (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 space-y-6">
        <div>
            <label htmlFor="apifyToken" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Apify API Token</label>
            <div className="relative mt-1">
                <input type={isApifyKeyVisible ? 'text' : 'password'} id="apifyToken" value={apifyToken} onChange={e => setApifyToken(e.target.value)} className="block w-full bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 pr-10" />
                <button onClick={() => setIsApifyKeyVisible(!isApifyKeyVisible)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Toggle Apify key visibility">
                    {isApifyKeyVisible ? <EyeOffIcon /> : <EyeIcon />}
                </button>
            </div>
        </div>
        <div>
            <label htmlFor="geminiApiKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Google AI API Key</label>
            <div className="relative mt-1">
                <input type={isGeminiKeyVisible ? 'text' : 'password'} id="geminiApiKey" value={geminiApiKey} onChange={e => setGeminiApiKey(e.target.value)} className="block w-full bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 pr-10" />
                <button onClick={() => setIsGeminiKeyVisible(!isGeminiKeyVisible)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Toggle Gemini key visibility">
                    {isGeminiKeyVisible ? <EyeOffIcon /> : <EyeIcon />}
                </button>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            <div className="md:col-span-3">
                <label htmlFor="tiktokUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300">URL Kênh TikTok</label>
                <input type="text" id="tiktokUrl" value={tiktokUrl} onChange={e => setTiktokUrl(e.target.value)} placeholder="e.g., https://www.tiktok.com/@username" className="mt-1 block w-full bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div className="md:col-span-2">
                <label htmlFor="resultsLimit" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Số video tối đa</label>
                <input type="number" id="resultsLimit" value={resultsLimit} onChange={e => setResultsLimit(parseInt(e.target.value, 10))} min="1" max="200" className="mt-1 block w-full bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
        </div>

        <div>
            <button onClick={handleScan} disabled={isLoading || !apifyToken || !geminiApiKey || !tiktokUrl} className="w-full flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed">
                <ScanIcon /> {isLoading ? 'Đang quét...' : 'Bắt đầu quét'}
            </button>
        </div>
         <div id="status" className="!mt-4 text-center text-sm text-gray-600 dark:text-gray-400">{status}</div>
    </div>
);

// --- STAGE 1.5: SCAN RESULTS ---
const ScanResultsStep: React.FC<{ videos: TikTokVideo[]; setStage: (stage: Stage) => void }> = ({ videos, setStage }) => {
    const [copyStatus, setCopyStatus] = useState('Sao chép URL');
    const videoUrls = videos.map(v => v.webVideoUrl).join('\n');

    const handleCopy = () => {
        navigator.clipboard.writeText(videoUrls).then(() => {
            setCopyStatus('Đã sao chép!');
            setTimeout(() => setCopyStatus('Sao chép URL'), 2000);
        }, () => {
            setCopyStatus('Lỗi khi sao chép');
        });
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-bold text-center mb-4">Kết quả Quét</h2>
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/50 border border-green-300 dark:border-green-700 rounded-lg flex items-start">
                <div className="flex-shrink-0 pt-0.5 text-green-500"><InfoIcon /></div>
                <div className="ml-2">
                    <p className="text-sm text-green-800 dark:text-green-200">
                        <span className="font-bold">Hoàn tất!</span> Đã tìm thấy {videos.length} video. Sao chép danh sách URL bên dưới để chuẩn bị cho bước đối chiếu.
                    </p>
                </div>
            </div>
            <div>
                <label htmlFor="videoUrlsResult" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Danh sách URL video đã quét</label>
                <textarea
                    id="videoUrlsResult"
                    rows={10}
                    value={videoUrls}
                    readOnly
                    className="mt-1 block w-full text-sm bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 font-mono"
                    aria-label="Scanned video URLs"
                />
            </div>
            <div className="mt-4 flex justify-end">
                <button onClick={handleCopy} className="px-4 py-2 text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                    {copyStatus}
                </button>
            </div>
            <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                <button onClick={() => setStage('scan')} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">Quay lại Quét</button>
                <button onClick={() => setStage('match')} className="px-6 py-3 text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                    Tiếp tục Đối chiếu
                </button>
            </div>
        </div>
    );
};

// --- STAGE 2: MATCH ---
const MatchStep = ({ videos, setMp3UrlMap, setStage }) => {
    const [mp3UrlsInput, setMp3UrlsInput] = useState('');
    const [videoUrlsInput, setVideoUrlsInput] = useState('');
    const [matchStatus, setMatchStatus] = useState('');
    const [matchedCount, setMatchedCount] = useState(0);

    useEffect(() => {
        // Clear previous matches when entering this step
        setMp3UrlMap({});
    }, []);

    const handleMatch = () => {
        const mp3Lines = mp3UrlsInput.split('\n').map(l => l.trim()).filter(Boolean);
        const videoLines = videoUrlsInput.split('\n').map(l => l.trim()).filter(Boolean);

        if (mp3Lines.length === 0 || videoLines.length === 0) {
            setMatchStatus('Lỗi: Vui lòng nhập URL vào cả hai ô.');
            setMatchedCount(0);
            setMp3UrlMap({});
            return;
        }

        if (mp3Lines.length !== videoLines.length) {
            setMatchStatus('Lỗi: Số lượng URL MP3 không khớp với số lượng URL video.');
            setMatchedCount(0);
            setMp3UrlMap({});
            return;
        }

        const userInputMap = new Map<string, string>();
        for (let i = 0; i < videoLines.length; i++) {
            userInputMap.set(videoLines[i], mp3Lines[i]);
        }

        const newMp3UrlMap: Record<string, string> = {};
        let count = 0;
        videos.forEach(video => {
            if (userInputMap.has(video.webVideoUrl)) {
                newMp3UrlMap[video.webVideoUrl] = userInputMap.get(video.webVideoUrl)!;
                count++;
            }
        });

        setMp3UrlMap(newMp3UrlMap);
        setMatchedCount(count);
        
        if (count > 0) {
            setMatchStatus(`Đã đối chiếu thành công ${count} trên ${videos.length} video đã quét.`);
        } else {
            setMatchStatus(`Không tìm thấy video trùng khớp. Vui lòng kiểm tra lại các URL video có khớp với danh sách video đã quét ở Bước 1 không.`);
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/50 border border-blue-300 dark:border-blue-700 rounded-lg flex items-start">
                  <div className="flex-shrink-0 pt-0.5"><InfoIcon /></div>
                  <div className="ml-2">
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                          <span className="font-bold">Hướng dẫn:</span> Dán danh sách URL MP3 và danh sách URL video tương ứng vào hai ô bên dưới. Thứ tự các URL trong hai danh sách phải khớp nhau (dòng 1 khớp dòng 1, v.v.).
                      </p>
                  </div>
            </div>
            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/50 border border-yellow-300 dark:border-yellow-700 rounded-lg flex items-start">
                  <div className="flex-shrink-0 pt-0.5"><WarningIcon /></div>
                  <div className="ml-2">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200">
                          <span className="font-bold">Quan trọng:</span> Các URL âm thanh phải có thể truy cập công khai (chuẩn CORS) để trình duyệt có thể tải về.
                      </p>
                  </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label htmlFor="mp3Urls" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Các URL của MP3</label>
                    <textarea 
                        id="mp3Urls"
                        rows={10}
                        value={mp3UrlsInput}
                        onChange={e => setMp3UrlsInput(e.target.value)}
                        placeholder={"https://example.com/song1.mp3\nhttps://example.com/song2.mp3\n..."}
                        className="mt-1 block w-full text-sm bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 font-mono"
                        aria-label="MP3 URLs, one per line"
                    />
                </div>
                <div>
                    <label htmlFor="videoUrls" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Các URL video tương ứng</label>
                    <textarea 
                        id="videoUrls"
                        rows={10}
                        value={videoUrlsInput}
                        onChange={e => setVideoUrlsInput(e.target.value)}
                        placeholder={"https://www.tiktok.com/@user/video/123...\nhttps://www.tiktok.com/@user/video/456...\n..."}
                        className="mt-1 block w-full text-sm bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 font-mono"
                        aria-label="Corresponding TikTok video URLs, one per line"
                    />
                </div>
            </div>
            <div className="mt-6 flex justify-center">
                <button onClick={handleMatch} className="px-6 py-2 text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                    Đối chiếu URL
                </button>
            </div>
            {matchStatus && <div className={`mt-4 text-center text-sm ${matchStatus.includes('Lỗi') || matchStatus.includes('Không tìm thấy') ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>{matchStatus}</div>}
            <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                <button onClick={() => setStage('scan')} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">Quay lại</button>
                <div className="text-sm text-gray-600 dark:text-gray-400">{matchedCount} / {videos.length} video đã được đối chiếu</div>
                <button onClick={() => setStage('results')} disabled={matchedCount === 0} className="px-6 py-3 text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed">
                    Tiếp tục phiên âm
                </button>
            </div>
        </div>
    );
};


// --- STAGE 3: RESULTS ---
const ResultsStep = ({ videos, mp3UrlMap, transcriptStates, setTranscriptStates, transcriptCache, setTranscriptCache, handleStartOver, geminiApiKey }) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [status, setStatus] = useState('Sẵn sàng để phiên âm.');
    const stopRequest = useRef(false);

    const handleStopProcessing = () => {
        stopRequest.current = true;
        setStatus('Đang yêu cầu dừng...');
    };

    const runTranscription = useCallback(async () => {
        stopRequest.current = false; // Reset stop signal for new run
        setIsProcessing(true);
        const videosToTranscribe = videos.filter(v => mp3UrlMap[v.webVideoUrl] && !transcriptCache[v.webVideoUrl]);
        let successCount = 0;
        const API_CALL_DELAY_MS = 4000; // Delay between API calls to prevent rate limiting (15 RPM)

        for (let i = 0; i < videosToTranscribe.length; i++) {
            if (stopRequest.current) {
                setStatus(`Quá trình đã được người dùng dừng lại. ${successCount} bản ghi đã được tạo.`);
                break;
            }

            const video = videosToTranscribe[i];
            const url = video.webVideoUrl;
            const mp3Url = mp3UrlMap[url];
            
            setStatus(`Đang xử lý ${i + 1} trên ${videosToTranscribe.length}: ${video.authorMeta.nickName}`);
            setTranscriptStates(prev => ({ ...prev, [url]: { status: 'loading', text: 'Đang tải âm thanh...' }}));

            try {
                const { base64, mimeType } = await getBase64FromUrl(mp3Url);
                setTranscriptStates(prev => ({ ...prev, [url]: { status: 'loading', text: 'Đang phiên âm với AI...' }}));
                const transcript = await transcribeAudioWithGemini(base64, mimeType, geminiApiKey);
                setTranscriptStates(prev => ({ ...prev, [url]: { status: 'success', text: transcript }}));
                setTranscriptCache(prev => ({ ...prev, [url]: transcript }));
                successCount++;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                setTranscriptStates(prev => ({ ...prev, [url]: { status: 'error', text: `Lỗi: ${errorMessage}` }}));
            }
            
            // Wait before the next request to avoid overloading the API
            if (i < videosToTranscribe.length - 1 && !stopRequest.current) {
                await new Promise(resolve => setTimeout(resolve, API_CALL_DELAY_MS));
            }
        }
        
        if (!stopRequest.current) {
            setStatus(`Hoàn tất phiên âm. Đã tạo mới ${successCount} bản ghi.`);
        }
        setIsProcessing(false);
    }, [videos, mp3UrlMap, transcriptCache, setTranscriptCache, setTranscriptStates, geminiApiKey]);
    
    useEffect(() => {
        runTranscription();

        return () => {
            stopRequest.current = true;
        };
    }, [runTranscription]);

    return (
         <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                 <div id="status" className="text-sm text-gray-600 dark:text-gray-400">{status}</div>
                 <div className="flex items-center gap-4">
                    {isProcessing ? (
                        <button onClick={handleStopProcessing} className="flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
                            <StopIcon /> Dừng
                        </button>
                    ) : (
                        <>
                            <button onClick={handleStartOver} className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md shadow-sm">Bắt đầu lại</button>
                            <button onClick={() => downloadCsv(videos, transcriptCache)} className="flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700">
                                <DownloadIcon /> Tải CSV
                            </button>
                        </>
                    )}
                 </div>
            </div>
             <div id="resultsTable" className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th className="px-3 py-3 text-left font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Thông tin Video</th>
                            <th className="px-3 py-3 text-left font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Nội dung Phiên âm</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700 align-top">
                        {videos.map(video => {
                            const url = video.webVideoUrl;
                            const finalTranscript = transcriptCache[url];
                            const state = transcriptStates[url];

                            let transcriptContent;
                            if (finalTranscript !== undefined) {
                                transcriptContent = <p className="text-gray-600 dark:text-gray-300 max-h-24 overflow-y-auto p-1 bg-gray-100 dark:bg-gray-700 rounded">{finalTranscript}</p>;
                            } else if (state?.status === 'loading') {
                                transcriptContent = <span className="italic text-gray-500">{state.text}</span>;
                            } else if (state?.status === 'error') {
                                transcriptContent = <span className="text-red-500">{state.text}</span>;
                            } else if (mp3UrlMap[url]) {
                                transcriptContent = <span className="italic text-gray-400">Đang chờ phiên âm...</span>;
                            } else {
                                transcriptContent = <span className="italic text-gray-400">Không có URL MP3 được cung cấp.</span>;
                            }
                            
                            return (
                                <tr key={video.id}>
                                    <td className="px-3 py-4 max-w-xs">
                                        <p className="font-semibold text-gray-900 dark:text-white truncate" title={video.text}>{video.text || 'Không có mô tả'}</p>
                                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline truncate" title={url}>bởi {video.authorMeta?.nickName || 'Không rõ'}</a>
                                        <p className="text-gray-500 dark:text-gray-400 mt-1">ID: <span className="font-mono">{video.id}</span></p>
                                    </td>
                                    <td className="px-3 py-4 min-w-[250px]">{transcriptContent}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
         </div>
    );
}

export default App;