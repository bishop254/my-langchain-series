import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import config from "./config/envConfig";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import path from "path";
import {
  readFileRaw,
} from "./helpers/file-streamer";
import { ChatOpenAI } from "@langchain/openai";

// tell langchain to use groq
const groqModel = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  apiKey: config.GROQ_API_KEY,
  timeout: 10,
});
const geminiModel = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0,
  maxRetries: 2,
  apiKey: config.GEMINI_API_KEY,
});
const gptModel = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0,
  maxRetries: 2,
  apiKey: config.GPT_API_KEY,
  // timeout: 30,
});

const useModel: any = async (prompt: string) => {
  const resGpt = await gptModel.invoke(prompt);
  if (resGpt) return resGpt;

  const resGroq = await groqModel.invoke(prompt);
  if (resGroq) return resGroq;

  const resGemini = await geminiModel.invoke(prompt);
  if (resGemini) return resGemini;


  return undefined;
};

const processYouTubeVideo = async (url: string) => {
  try {
    const fileUrl =
      "https://collateral-library-production.s3.amazonaws.com/uploads/asset_file/attachment/17529/BNG-UL19-Technical-Documentation-EN-081919.pdf";
    const outputFilePath = path.join(
      process.cwd(),
      "tazama-design-principles.pdf"
    );

    // await downloadFile(fileUrl, outputFilePath);
    const docs = await readFileRaw(outputFilePath);

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 250,
    });

    const chunks = await splitter.splitDocuments(docs);
    console.log("Split out doc into ... chunks", chunks.length);

    const chunkSummaries: string[] = [];

    for (const chunk of chunks) {
      const summaryPrompt = `Please summarize the fraud guard detection chunk in about 5 sentences. Focus on the main points and ideas
      ---
      ${chunk.pageContent}
      ---
      SUMMARY:
      `;
      const res = await useModel(summaryPrompt);
      chunkSummaries.push(res.content as string);
    }

    const finalPrompt = `
    You have been given several summaries from different parts of a technical document for a fraud detection program. 
    Please syntesize them to a single, well written and consice paragraph that captures the entire document.
    ---
    INDIVIDUAL SUMMARIES:
    ${chunkSummaries.join("\n\n")}
    ---
    FINAL SUMMARY:
    `;

    const response = await useModel(finalPrompt);
    return response.content;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

(async () => {
  try {
    const youtubeUrl = "https://www.youtube.com/watch?v=0QzopZ78w9M";

    const summary = await processYouTubeVideo(youtubeUrl);

    console.log(summary);
  } catch (error) {
    console.error(error);
  }
})();
