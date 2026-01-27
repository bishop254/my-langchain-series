import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import config from "./config/envConfig";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import path from "path";
import { readFileRaw } from "./helpers/file-streamer";
import { ChatOpenAI } from "@langchain/openai";
import { OllamaEmbeddings } from "@langchain/ollama";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TavilySearch } from "@langchain/tavily";
import axios, { isCancel, AxiosError } from "axios";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";

const groqModel = new ChatGroq({
  model: "llama3-70b-8192",
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

const CicLookupResultSchema = z.object({
  ok: z.boolean(), // tool execution success (not CIC business result)
  httpStatus: z.number().nullable(),
  apiCode: z.string().nullable(), // e.g. "00", "01"
  status: z.enum([
    "REGISTERED",
    "NOT_REGISTERED",
    "INVALID_INPUT",
    "UPSTREAM_ERROR",
  ]),
  nextAction: z.enum(["CONTINUE", "ASK_TO_REGISTER", "ASK_RETRY", "ESCALATE"]),
  message: z.string(), // what to tell the user
  user: z
    .object({
      phone: z.string().nullable(),
      fullName: z.string().nullable(),
      idNumber: z.string().nullable(),
      email: z.string().nullable(),
      // add fields you actually receive
    })
    .nullable(),
  raw: z.any().optional(), // keep for debugging (optional)
});

type CicLookupResult = z.infer<typeof CicLookupResultSchema>;

const add_numbers_tool = tool(
  async ({ a, b }: { a: number; b: number }) => {
    return (a + b).toString();
  },
  {
    name: "add_numbers",
    description:
      "Use this tool when you need to add two numbers. It takes two numbers, 'a' and 'b', and returns their sum.",
    schema: z.object({
      a: z.number().describe("The first number to add."),
      b: z.number().describe("The second number to add."),
    }),
  },
);

const cic_new_lookup_tool = tool(
  async ({ phoneNumber }: { phoneNumber: number }) => {
    const phone = String(phoneNumber);

    const build = (partial: Partial<CicLookupResult>): CicLookupResult => {
      const base: CicLookupResult = {
        ok: false,
        httpStatus: null,
        apiCode: null,
        status: "UPSTREAM_ERROR",
        nextAction: "ESCALATE",
        message:
          "We’re having trouble accessing CIC services right now. Please try again shortly.",
        user: null,
      };

      // validate + coerce into final schema
      return CicLookupResultSchema.parse({ ...base, ...partial });
    };

    try {
      const response = await axios.get(
        `https://channels.cic.co.ke:4000/ussd/ms/api/v1/ussd/users/lookup`,
        {
          params: { phone },
          timeout: 15000,
          validateStatus: () => true, // IMPORTANT: never throw on 4xx
        },
      );

      const httpStatus = response.status;
      const data = response.data ?? {};
      const apiCode = data?.code != null ? String(data.code) : null;

      // If server error, treat as upstream failure
      if (httpStatus >= 500) {
        return build({
          ok: false,
          httpStatus,
          apiCode,
          status: "UPSTREAM_ERROR",
          nextAction: "ASK_RETRY",
          message:
            "CIC services are temporarily unavailable. Please try again.",
          raw: data,
        });
      }

      // Business decision based on apiCode
      if (apiCode === "00") {
        return build({
          ok: true,
          httpStatus,
          apiCode,
          status: "REGISTERED",
          nextAction: "CONTINUE",
          message: "You are registered with CIC. Let’s continue.",
          user: {
            phone: data?.data?.phone ?? phone,
            fullName: data?.data?.fullName ?? data?.data?.name ?? null,
            idNumber: data?.data?.idNumber ?? null,
            email: data?.data?.email ?? null,
          },
          raw: data,
        });
      }

      if (apiCode === "01") {
        return build({
          ok: true,
          httpStatus,
          apiCode,
          status: "NOT_REGISTERED",
          nextAction: "ASK_TO_REGISTER",
          message:
            "You are not registered with CIC. Would you like to register now?",
          user: { phone, fullName: null, idNumber: null, email: null },
          raw: data,
        });
      }

      // If your API uses 400 for invalid phone etc.
      if (httpStatus === 400) {
        return build({
          ok: true,
          httpStatus,
          apiCode,
          status: "INVALID_INPUT",
          nextAction: "ASK_RETRY",
          message:
            "That phone number looks invalid. Please enter it in the format 2547XXXXXXXX.",
          user: { phone: null, fullName: null, idNumber: null, email: null },
          raw: data,
        });
      }

      // 404 or other 4xx: still “handled”, decide what you want
      if (httpStatus === 404) {
        return build({
          ok: true,
          httpStatus,
          apiCode,
          status: "NOT_REGISTERED",
          nextAction: "ASK_TO_REGISTER",
          message:
            "We couldn’t find an account for that number. Would you like to register?",
          user: { phone, fullName: null, idNumber: null, email: null },
          raw: data,
        });
      }

      // Fallback
      return build({
        ok: true,
        httpStatus,
        apiCode,
        status: "UPSTREAM_ERROR",
        nextAction: "ESCALATE",
        message:
          "We couldn’t confirm your status. Please try again or contact support.",
        raw: data,
      });
    } catch (err: any) {
      // Network errors, DNS, timeout, etc.
      const isAxios = !!err?.isAxiosError;
      const message =
        isAxios && err.code === "ECONNABORTED"
          ? "Request timed out. Please try again."
          : "Network error contacting CIC services. Please try again.";

      return CicLookupResultSchema.parse({
        ok: false,
        httpStatus: null,
        apiCode: null,
        status: "UPSTREAM_ERROR",
        nextAction: "ASK_RETRY",
        message,
        user: null,
        raw: { error: err?.message, code: err?.code },
      });
    }
  },
  {
    name: "cic_lookup",
    description:
      "Lookup a CIC user by phone. Always returns a structured JSON object with status + nextAction for routing.",
    schema: z.object({
      phoneNumber: z
        .number()
        .describe("Kenyan phone number, prefer 2547XXXXXXXX"),
    }),
  },
);

const cic_lookup_tool = tool(
  async ({ phoneNumber }: { phoneNumber: number }) => {
    try {
      const response = await axios.get(
        `https://channels.cic.co.ke:4000/ussd/ms/api/v1/ussd/users/lookup`,
        {
          params: { phone: phoneNumber },
          validateStatus: (status) =>
            (status >= 200 && status < 300) || status === 404,
        },
      );

      return response.data;
    } catch (error) {
      console.error(error);
    }
  },
  {
    name: "cic_lookup",
    description:
      "Use this tool when you need to lookup a user's information from a CIC insurance database. If the response data, specifically the key with the name code return 00 then it is success (01 means they are not registered) and we can get the user's information from the data key. Ignore the status code of the response if its not 5xx(server errors)  but check the code key inside the response and read data object. A 400 error is not a failed resonse",
    schema: z.object({
      phoneNumber: z
        .number()
        .describe("A kenyan phone number starting with 254xxxxxxxxx"),
    }),
  },
);

const tavily_search_tool = new TavilySearch({
  tavilyApiKey: config.TAVILY_API_KEY,
  maxResults: 2,
  name: "tavily_search_results_json",
  description:
    "Use this tool to search the web for recent information on a given query. Returns a JSON array of search results.",
});

const tools = [add_numbers_tool, tavily_search_tool, cic_lookup_tool];
const modelWithTools = gptModel.bindTools(tools);

const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a helpful assistant. You have access to tools to add numbers and search the web and perform a customer lookup on an insurance DB. Only use tools if explicitly asked or if they are necessary to answer the question.",
  ],
  new MessagesPlaceholder("messages"),
]);

const agent = createReactAgent({
  llm: modelWithTools,
  tools: tools,
});

const processUserQueryWithGraph = async (query: string = "") => {
  console.log("Processing query:\n", query);

  try {
    const response = await agent.invoke({
      messages: [new HumanMessage(query)],
    });

    const finalMessage = response.messages[response.messages.length - 1];
    return finalMessage.content;
  } catch (error) {
    console.error("Error processing query:", (error as Error).message);
    return `Error: ${(error as Error).message}`;
  }
};

(async () => {
  try {
        const addQuery = "What is 5 multiplied by 4, and then add 10 to the result?";
    const searchQuery = "Search for the current CEO of OpenAI and then find out what their latest project is.";
    const llmQuery = "Who are you and what can you do?";


    console.log("------------------------");
    const addResult = await processUserQueryWithGraph(addQuery);
    console.log("Final Answer (Math):", addResult);
    console.log("------------------------");
    const searchResult = await processUserQueryWithGraph(searchQuery);
    console.log("Final Answer (Search):", searchResult);
    console.log("------------------------");
    const llmResult = await processUserQueryWithGraph(llmQuery);
    console.log("Final Answer (LLM):", llmResult);
    console.log("------------------------");


    const lookupQuery = "is 0701720503 registered";
    const lookupQuery1 = "is 0795881812 registered";

    const lookupResult = await processUserQueryWithGraph(lookupQuery);
    console.log("Final Answer (LOOKUP):", lookupResult);
    console.log("------------------------");
    const lookupResult1 = await processUserQueryWithGraph(lookupQuery1);
    console.log("Final Answer (LOOKUP):", lookupResult1);
    console.log("------------------------");
  } catch (error) {
    console.error(error);
  }
})();
