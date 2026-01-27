import { END, START, StateGraph, Annotation } from "@langchain/langgraph";

//This is our shared memory state
const StateAnnotation = Annotation.Root({
  message: Annotation<string>,
});

//We then define our nodes that will receive our shared state and return the state with some updates
const nodeA = (state: typeof StateAnnotation.State) => {
  console.log("Executing node A");
  console.log("State before:", JSON.stringify(state));
  return {
    message: "I have been updated by node A",
  };
};
const nodeB = (state: typeof StateAnnotation.State) => {
  console.log("Executing node B");
  console.log("State before:", JSON.stringify(state));
  return {
    message: "Node B has done its magic",
  };
};

//We then build the graph that will connect our nodes. We give it the shared memory and our nodes
console.log("Building the graph...");
const builder = new StateGraph(StateAnnotation)
  .addNode("a", nodeA)
  .addNode("b", nodeB);

//We then connect the nodes using edges
builder.addEdge("__start__", "a").addEdge("a", "b").addEdge("b", "__end__");

//Compilation the graph so that its executable
const graph = builder.compile();

//Visual diagram of our graph
const mermaidSyntax = graph.getGraph().drawMermaid();
console.log("\n--- Mermaid Diagram Syntax ---");
console.log(mermaidSyntax);
console.log("----------------------------\n");

(async () => {
  try {
    const result = await graph.invoke({
      message: "This is the initial message",
    });
    console.log("\n--- Final Result ---");
    console.log(result);
  } catch (error) {
    console.error("Something went wrong...", error);
  }
})();
