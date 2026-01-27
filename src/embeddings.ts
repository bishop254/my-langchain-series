import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import config from "./config/envConfig";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import path from "path";
import { readFileRaw } from "./helpers/file-streamer";
import { ChatOpenAI } from "@langchain/openai";
import { OllamaEmbeddings } from "@langchain/ollama";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

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

const embedding = new OllamaEmbeddings({
  model: "nomic-embed-text",
  baseUrl: "http://localhost:11434",
});

const processDocument = async (filePath: string, query: string = "") => {
  try {
    const outputFilePath = path.join(process.cwd(), filePath);

    const docs = await readFileRaw(outputFilePath);

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 250,
    });

    const chunks = await splitter.splitDocuments(docs);
    console.log("Split out doc into ... chunks", chunks.length);

    console.log("Creating vector store...");
    const vectorStore = await MemoryVectorStore.fromDocuments(
      chunks,
      embedding,
    );

    console.log("Retrieve the relevant document...");
    const retriever = vectorStore.asRetriever({ k: 4 });
    const retrievedDocument = await retriever.invoke(query);
    const context = retrievedDocument
      .map((doc) => doc.pageContent)
      .join("\n\n");

    const SYSTEM_TEMPLATE = `
    You are an expert Q&A assistant. Use the following pieces of context from a PDF document to answer the question at the end.
    If you don't know the answer from the provided context, just say that you don't know. Do not make up an answer.
    ----------------
    CONTEXT: {context}
    ----------------
    QUESTION: {query}`;

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", SYSTEM_TEMPLATE],
      ["human", "{query}"],
    ]);

    const chain = prompt.pipe(gptModel).pipe(new StringOutputParser());

    console.log("Generating final answer...");
    const response = await chain.invoke({ query, context });
    return response;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

(async () => {
  try {
    const query = "What is the fraud project different from others?";

    const summary = await processDocument(
      "../tazama-design-principles.pdf",
      query,
    );

    console.log(`\n--- ANSWER FOR: "${query}" ---`);
    console.log(summary);
    console.log("--------------------------------\n");
  } catch (error) {
    console.error(error);
  }
})();
