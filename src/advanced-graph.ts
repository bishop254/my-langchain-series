import { END, START, StateGraph, Annotation } from "@langchain/langgraph";

//This is our shared memory state
const StateAnnotation = Annotation.Root({
  message: Annotation<string>,
  someNumber: Annotation<number>(),
});

//We then define our nodes that will receive our shared state and return the state with some updates
const nodeA = (state: typeof StateAnnotation.State) => {
  console.log("Executing node A");
  console.log("State before:", JSON.stringify(state));
  const newNumber = state.message.length;
  return {
    message: "I have been updated by node A",
    someNumber: newNumber,
  };
};

const nodeB = (state: typeof StateAnnotation.State) => {
  console.log("--- Executing Node B ---");
  return { message: `I'm B, because the number was not 0.` };
};

const nodeC = (state: typeof StateAnnotation.State) => {
  console.log("--- Executing Node C ---");
  return { message: `I'm C, because the number was zero 0.` };
};

const shouldGoToC = (state: typeof StateAnnotation.State) => {
  console.log(`\n--- Making a Decision ---`);
  console.log(`Checking the number in state: ${state.someNumber}`);
  if (state.someNumber === 0) {
    console.log("Decision: Go to C");
    return "goToC"; // This key maps to Node C
  } else {
    console.log("Decision: Go to B");
    return "goToB"; // This key maps to Node B
  }
};

const builder = new StateGraph(StateAnnotation)
  .addNode("a", nodeA)
  .addNode("b", nodeB)
  .addNode("c", nodeC);

builder.addEdge(START, "a");

builder.addConditionalEdges("a", shouldGoToC, {
  goToB: "b",
  goToC: "c",
});

builder.addEdge("b", END);
builder.addEdge("c", END);

const graph = builder.compile();
const mermaidSyntax = graph.getGraph().drawMermaid();
console.log("--- Mermaid Diagram Syntax ---");
console.log(mermaidSyntax);
console.log("----------------------------\n");

(async () => {
  try {
    // Run 1: The message length is not 0, so it should go to Node B.
    console.log(">>> Starting Run 1...");
    const result1 = await graph.invoke({ message: "Hello", someNumber: 0 }); // Note: initial someNumber doesn't matter, Node A overwrites it.
    console.log("Final result for run 1:", result1);
    console.log("\n----------------------------\n");

    // Run 2: The message length is 0, so it should go to Node C.
    console.log(">>> Starting Run 2...");
    const result2 = await graph.invoke({ message: "", someNumber: 999 });
    console.log("Final result for run 2:", result2);
  } catch (error) {
    console.error("Error in main execution:", (error as Error).message);
  }
})();
