import { END, START, StateGraph, Annotation } from "@langchain/langgraph";

const GraphState = Annotation.Root({
  message: Annotation<string[]>({
    reducer: (x, y) => x.concat("#", y),
  }),
});

const nodeA = (state: typeof GraphState.State) => {
  console.log(" - - Executing Node A - -");
  return { message: ["A has finished."] };
};

const nodeB = (state: typeof GraphState.State) => {
  console.log(" - - Executing Node B - -");
  return { message: ["B has finished."] };
};

const nodeC = (state: typeof GraphState.State) => {
  console.log(" - - Executing Node C - -");
  return { message: ["C has finished."] };
};

const nodeD = (state: typeof GraphState.State) => {
  console.log(" - - Executing Node D - -");
  console.log(" - - Message History - -", state.message);
  return { message: ["D has finished."] };
};

const builder = new StateGraph(GraphState)
  .addNode("a", nodeA)
  .addNode("c", nodeC)
  .addNode("b", nodeB)
  .addNode("d", nodeD);

builder
  .addEdge("__start__", "a")
  .addEdge("a", "c")
  .addEdge("a", "b")
  .addEdge("c", "d")
  .addEdge("b", "d")
  .addEdge("d", "__end__");

const graph = builder.compile();
const mermaidSyntax = graph.getGraph().drawMermaid();
console.log(" - - Mermaid Diagram Syntax - -");
console.log(mermaidSyntax);
console.log(" - - - - - - - - - - - - - - \n");

(async () => {
  try {
    console.log(">>> Starting Graph Execution…");
    const result1 = await graph.invoke({ message: ["Initial Message"] });
    console.log("\n - - Final Result - -");
    console.log(result1);
  } catch (error) {
    console.error("Error in main execution:", (error as Error).message);
  }
})();
