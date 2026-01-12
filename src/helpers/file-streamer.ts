import fs from "fs";
import fsp from "fs/promises";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

import { pipeline } from "node:stream/promises";
import { Document } from "@langchain/core/documents";

export async function downloadFile(url: string, outputPath: string) {
  const response = await fetch(url);

  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`Could not fetch the file ${response.status}`);
  }

  const fileStream = fs.createWriteStream(outputPath);
  console.log(`Downloading file from the ${url}`);

  await pipeline(response.body, fileStream);
  console.log("File downloaded successfully");
}

export async function readFileStream(filePath: string) {
  const readStream = await fs.createReadStream(filePath, {
    encoding: "utf-8",
  });

  try {
    for await (const chunk of readStream) {
      console.log("File chunk started");
      console.log(chunk);
      console.log("File chunk end");
    }

    console.log("Finished reading the file");
  } catch (error) {
    console.error("Error reading file", error);
  }
}

// export async function readFileRaw(filePath: string) {
//   const readStream = await fsp.readFile(filePath, {
//     encoding: "utf-8",
//   });

//   const docs: Document<Record<string, any>>[] = [
//     new Document({
//       pageContent: readStream,
//       metadata: {
//         source: filePath,
//         loadedAt: new Date().toISOString(),
//       },
//     }),
//   ];

//   return docs;
// }

export async function readFileRaw(filePath: string) {
  const loader = new PDFLoader(filePath);
  const docs = await loader.load();
  return docs;
}
