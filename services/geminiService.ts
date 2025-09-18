import { GoogleGenAI } from "@google/genai";

/**
 * Transcribes an audio file using the Google Gemini API.
 * @param base64Audio The base64-encoded audio data.
 * @param mimeType The MIME type of the audio data (e.g., 'audio/mpeg').
 * @param apiKey The Google AI API key provided by the user.
 * @returns A promise that resolves to the transcript string.
 */
export const transcribeAudioWithGemini = async (
  base64Audio: string,
  mimeType: string,
  apiKey: string
): Promise<string> => {
  // The API key is now provided by the user.
  if (!apiKey) {
    throw new Error('Google AI API Key is not provided.');
  }

  // Initialize the AI client with the user-provided key.
  const ai = new GoogleGenAI({ apiKey });

  try {
    // Construct the generative part directly from the provided base64 data.
    const audioPart = {
      inlineData: {
        mimeType,
        data: base64Audio,
      },
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { text: "Hãy phiên âm chính xác nội dung của file âm thanh này sang văn bản tiếng Việt. Chỉ trả về nội dung lời thoại, không thêm bất kỳ lời dẫn hay ghi chú nào." },
          audioPart
        ]
      },
    });

    const transcript = response.text;
    if (!transcript) {
      throw new Error("Gemini không trả về lời thoại.");
    }

    return transcript;

  } catch (error) {
    console.error("Lỗi trong quá trình lấy lời thoại:", error);
    const errorMessage = error instanceof Error ? error.message : "Lỗi không xác định khi gọi Gemini.";
    // Re-throw a user-friendly error message
    throw new Error(errorMessage);
  }
};
