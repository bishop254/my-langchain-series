import { ChatGroq } from "@langchain/groq";
import config from "./config/envConfig";
import { YoutubeLoader } from "@langchain/community/document_loaders/web/youtube";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

// tell langchain to use groq
const model = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  apiKey: config.GROQ_API_KEY,
});

const processYouTubeVideo = async (url: string) => {
  try {
    const loader = YoutubeLoader.createFromUrl(url, {
      language: "en",
      addVideoInfo: true,
    });

    // const loader = new YoutubeLoader({
    //   videoId: url,
    //   language: "en",
    //   addVideoInfo: true,
    // });

    // const loader = new YoutubeLoader(url);

    const docs = await loader.load();
    console.log(`Loaded transcript from: "${docs[0]}"`);

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 2000,
      chunkOverlap: 250,
    });

    const chunks = await splitter.splitDocuments(docs);
    console.log("Split out doc into ... chunks", chunks.length);

    const chunkSummaries: string[] = [];

    for (const chunk of chunks) {
      const summaryPrompt = `Please summarize the video transcript chunk in about 3 sentences. Focus on the main points and ideas
      ---
      ${chunk.pageContent}
      ---
      SUMMARY:
      `;

      const res = await model.invoke(summaryPrompt);
      chunkSummaries.push(res.content as string);
    }

    const finalPrompt = `
    You have been given several summaries from different parts of a youtube video transcript. 
    Please syntesize them to a single, well written and consice paragraph that captures the entire video.
    ---
    INDIVIDUAL SUMMARIES:
    ${chunkSummaries.join("\n\n")}
    ---
    FINAL SUMMARY:
    `;

    const response = await model.invoke(finalPrompt);
    return response.content;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

(async () => {
  try {
    const youtubeUrl =
      "https://www.youtube.com/watch?v=0QzopZ78w9M";
    const summary = await processYouTubeVideo(youtubeUrl);

    console.log(summary);
  } catch (error) {
    console.error(error);
  }
})();
