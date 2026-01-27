import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import config from "./config/envConfig";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import path from "path";
import { readFileRaw } from "./helpers/file-streamer";
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

const processDocument = async (url: string) => {
  try {
    const outputFilePath = path.join(
      process.cwd(),
      "tazama-design-principles.pdf",
    );

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
    You are an expert Q&A assistant. Use the following pieces of context from a document to answer the question at the end.
    If you don't know the answer from the provided context, just say that you don't know. Do not make up an answer.
 ----------------
    CONTEXT: {context}
    ----------------
    QUESTION: {query}`;

    const response = await useModel(finalPrompt);
    return response.content;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

(async () => {
  try {
    const docUrl =
      "https://collateral-library-production.s3.amazonaws.com/uploads/asset_file/attachment/17529/BNG-UL19-Technical-Documentation-EN-081919.pdf";

    const summary = await processDocument(docUrl);

    console.log(summary);
  } catch (error) {
    console.error(error);
  }
})();
