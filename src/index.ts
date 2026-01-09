import { ChatGroq } from "@langchain/groq";
import { PromptTemplate } from "@langchain/core/prompts";
import config from "./config/envConfig";
import { StringOutputParser } from "@langchain/core/output_parsers";
import z from "zod";

// tell langchain to use groq
const model = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  apiKey: config.GROQ_API_KEY,
});

const generateText = async (topic: string) => {
  const prompt = new PromptTemplate({
    template: "Write a short paragraph about {topic} for an article",
    inputVariables: ["topic"],
  });

  const stringChain = prompt.pipe(model).pipe(new StringOutputParser());

  const response = await stringChain.invoke({ topic: topic });
  return response;
};

const generateTitles = async (topic: string, tone: string) => {
  const articleSchema = z.object({
    title: z.string().describe("A catchy engaging title for the article"),
    summary: z
      .string()
      .describe("A short one sentence summary of the articles content"),
  });

  const prompt = new PromptTemplate({
    template:
      "Generate an article with a title and a summary. Use the {topic} and the {tone} tone. You MUST format the response into a JSON that adheres to our schema",
    inputVariables: ["topic", "tone"],
  });

  const structuredChain = prompt.pipe(
    model.withStructuredOutput(articleSchema)
  );

  const response = await structuredChain.invoke({ topic, tone });

  return response;
};

// const generateSomething = async (topic: string) => {
//   const prompt = new PromptTemplate({
//     template: "Write a short paragraph about {topic} for an article",
//     inputVariables: ["topic"],
//   });

//   // the core of LangChain is creating a chain
//   // we connect our prompt to our model using the pipe method
//   const chain = prompt.pipe(model);

//   const response = await chain.invoke({ topic: topic });

//   //invoke our model with our prompt
//   //   const response = await model.invoke("The future of insurance with AI");
//   return response.content;
// };

(async () => {
  try {
    const topic = "How can we use ai in an insurance company";
    const tone = "Engaging and with financial lingo and kind";

    const stringOutput = await generateText(topic);
    console.log(stringOutput);

    const jsonOutput = await generateTitles(topic, tone);
    console.log(jsonOutput);
  } catch (error) {
    console.error(error);
  }
})();
