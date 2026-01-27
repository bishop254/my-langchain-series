import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { TavilySearch } from "@langchain/tavily";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import {
  StateGraph,
  START,
  END,
  Annotation,
  MessagesAnnotation,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";

import config from "./config/envConfig";

process.env.TAVILY_API_KEY = config.TAVILY_API_KEY;

// const model = new ChatGroq({
//   model: "meta-llama/llama-4-scout-17b-16e-instruct",
//   apiKey: config.GROQ_API_KEY,
// });

const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0,
  maxRetries: 2,
  apiKey: config.GEMINI_API_KEY,
});

const tavilySearchTool = new TavilySearch({
  maxResults: 3,
  name: "tavily_search",
});

const tools = [tavilySearchTool];
const modelWithTools = model.bindTools(tools);

const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
});

const toolNode = new ToolNode(tools);

const shouldContinue = (state: typeof GraphState.State) => {
  const { messages } = state;
  const lastMessage = messages[messages.length - 1];
  if (
    lastMessage &&
    "tool_calls" in lastMessage &&
    Array.isArray((lastMessage as any).tool_calls) &&
    (lastMessage as any).tool_calls.length > 0
  ) {
    return "tools";
  }
  return END;
};

const callModel = async (state: typeof GraphState.State) => {
  const { messages } = state;
  const response = await modelWithTools.invoke(messages);
  return { messages: [response] };
};

const builder = new StateGraph(GraphState)
  .addNode("agent", callModel)
  .addNode("tools", toolNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", shouldContinue, ["tools", END])
  .addEdge("tools", "agent");

const graph = builder.compile();

const mermaidSyntax = graph.getGraph().drawMermaid();
console.log("--- Mermaid Diagram Syntax ---");
console.log(mermaidSyntax);
console.log("----------------------------\n");

(async () => {
  try {
    const query = "What are recent advancements in AI?";
    const result = await graph.invoke({
      messages: [new HumanMessage(query)],
    });

    console.log("Graph execution completed successfully.");
    console.log("Messages exchanged during the graph execution:");
    result.messages.forEach((message, index) => {
      console.log(`Message ${index + 1}:`, message.content);
    });

    console.log("\nFinal result:");
    const lastMessage = result.messages[result.messages.length - 1];
    console.log(`Result: ${lastMessage.content}`);
  } catch (error) {
    console.error("Error:", error);
  }
})();
